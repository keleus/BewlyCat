import browser from 'webextension-polyfill'

import type { ExtensionCacheKey, ExtensionCacheRead, ExtensionCacheWrite } from '~/constants/extensionCache'
import { EXTENSION_CACHE_MESSAGE, isExtensionCacheKey } from '~/constants/extensionCache'
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

export function setupExtensionCacheStore() {
  onMessage(EXTENSION_CACHE_MESSAGE.READ, readEntry)
  onMessage(EXTENSION_CACHE_MESSAGE.WRITE, writeEntry)
}
