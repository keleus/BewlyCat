import browser from 'webextension-polyfill'

import type {
  ExtensionCacheKey,
  ExtensionCacheRead,
  ExtensionCacheRecordKey,
  ExtensionCacheRecords,
  ExtensionCacheRecordsPatch,
  ExtensionCacheRecordsRead,
  ExtensionCacheWrite,
} from '~/constants/extensionCache'
import { EXTENSION_CACHE_MESSAGE, isExtensionCacheKey, isExtensionCacheRecordKey } from '~/constants/extensionCache'
import { onMessage } from '~/utils/messaging'

const DB_NAME = 'bewlycat-cache'
const DB_VERSION = 1
const STORE_NAME = 'entries'

let databasePromise: Promise<IDBDatabase> | undefined
const legacyMigrations = new Map<ExtensionCacheKey, Promise<void>>()

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => {
      const database = request.result
      const reset = () => {
        database.close()
        databasePromise = undefined
      }
      database.onversionchange = reset
      database.onclose = () => {
        databasePromise = undefined
      }
      resolve(database)
    }
    request.onerror = () => reject(request.error)
  }).catch((error) => {
    // 打开失败时下次请求重新尝试，不缓存失败结果。
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = operation(transaction.objectStore(STORE_NAME))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onerror = () => reject(transaction.error ?? request.error)
    transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'))
  })
}

/** 旧版本把同名缓存写在 storage.local；首次访问时迁入 IndexedDB 并删除旧项。 */
function migrateLegacyEntry(key: ExtensionCacheKey): Promise<void> {
  let migration = legacyMigrations.get(key)
  if (!migration) {
    migration = (async () => {
      const stored = (await browser.storage.local.get(key))[key]
      if (stored == null)
        return

      const existing = await runRequest('readonly', store => store.get(key))
      if (existing === undefined)
        await runRequest('readwrite', store => store.put(typeof stored === 'string' ? stored : JSON.stringify(stored), key))
      await browser.storage.local.remove(key)
    })().catch((error) => {
      legacyMigrations.delete(key)
      console.warn(`[BewlyCat] Failed to migrate ${key} from storage.local.`, error)
    })
    legacyMigrations.set(key, migration)
  }
  return migration
}

async function readEntry(data: ExtensionCacheRead): Promise<string | null> {
  if (!isExtensionCacheKey(data?.key))
    throw new TypeError('Invalid extension cache key')

  await migrateLegacyEntry(data.key)
  const value = await runRequest<unknown>('readonly', store => store.get(data.key))
  return typeof value === 'string' ? value : null
}

async function writeEntry(data: ExtensionCacheWrite): Promise<void> {
  if (!isExtensionCacheKey(data?.key) || (data.value !== null && typeof data.value !== 'string'))
    throw new TypeError('Invalid extension cache write')

  // 迁移完成后再写，避免旧数据随后覆盖本次写入。
  await migrateLegacyEntry(data.key)
  const { key, value } = data
  if (value === null)
    await runRequest('readwrite', store => store.delete(key))
  else
    await runRequest('readwrite', store => store.put(value, key))
}

/** 集合的子记录与整份缓存共用同一个 object store，以 `集合键/子记录 ID` 区分。 */
function getRecordRange(key: ExtensionCacheRecordKey) {
  const prefix = `${key}/`
  // '/' 的下一个 UTF-16 码元是 '0'，半开区间覆盖所有以 `${key}/` 开头的键。
  return { prefix, range: IDBKeyRange.bound(prefix, `${key}0`, false, true) }
}

async function readRecords(data: ExtensionCacheRecordsRead): Promise<ExtensionCacheRecords> {
  if (!isExtensionCacheRecordKey(data?.key))
    throw new TypeError('Invalid extension cache record key')

  const { prefix, range } = getRecordRange(data.key)
  const database = await openDatabase()
  return new Promise<ExtensionCacheRecords>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    // 同一只读事务内的键与值按相同顺序返回。
    const keysRequest = store.getAllKeys(range)
    const valuesRequest = store.getAll(range)
    transaction.oncomplete = () => {
      const records: ExtensionCacheRecords = {}
      keysRequest.result.forEach((recordKey, index) => {
        const value = valuesRequest.result[index]
        if (typeof recordKey === 'string' && typeof value === 'string')
          records[recordKey.slice(prefix.length)] = value
      })
      resolve(records)
    }
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'))
  })
}

function isRecordsPatch(data: unknown): data is ExtensionCacheRecordsPatch {
  if (!data || typeof data !== 'object')
    return false
  const patch = data as Partial<ExtensionCacheRecordsPatch>
  return isExtensionCacheRecordKey(patch.key)
    && !!patch.set && typeof patch.set === 'object' && !Array.isArray(patch.set)
    && Object.values(patch.set).every(value => typeof value === 'string')
    && Array.isArray(patch.remove) && patch.remove.every(id => typeof id === 'string')
    && (patch.replace === undefined || typeof patch.replace === 'boolean')
}

async function patchRecords(data: ExtensionCacheRecordsPatch): Promise<void> {
  if (!isRecordsPatch(data))
    throw new TypeError('Invalid extension cache record patch')

  const { prefix, range } = getRecordRange(data.key)
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    // 同一事务内完成清空、删除与写入，失败时整批回滚。
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    if (data.replace)
      store.delete(range)
    else
      data.remove.forEach(id => store.delete(`${prefix}${id}`))
    Object.entries(data.set).forEach(([id, value]) => store.put(value, `${prefix}${id}`))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'))
  })
}

export function setupExtensionCacheStore() {
  onMessage(EXTENSION_CACHE_MESSAGE.READ, readEntry)
  onMessage(EXTENSION_CACHE_MESSAGE.WRITE, writeEntry)
  onMessage(EXTENSION_CACHE_MESSAGE.READ_RECORDS, readRecords)
  onMessage(EXTENSION_CACHE_MESSAGE.PATCH_RECORDS, patchRecords)
}
