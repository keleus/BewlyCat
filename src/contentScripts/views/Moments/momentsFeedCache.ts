import type { ShallowRef } from 'vue'
import { shallowRef, toRaw, watch } from 'vue'

import type { DisplayMoment } from '~/components/MomentCard/types'
import type {
  ExtensionCacheRead,
  ExtensionCacheRecords,
  ExtensionCacheRecordsPatch,
  ExtensionCacheRecordsRead,
  ExtensionCacheWrite,
} from '~/constants/extensionCache'
import { EXTENSION_CACHE_MESSAGE } from '~/constants/extensionCache'
import { sendMessage } from '~/utils/messaging'

export type MomentFilter = 'all' | 'video' | 'pgc' | 'article'

export interface MomentsFeedCacheEntry {
  items: DisplayMoment[]
  offset: string
  updateBaseline: string
  hasMore: boolean
  updatedAt: number
  continuation?: {
    items: DisplayMoment[]
    offset: string
    updateBaseline: string
    hasMore: boolean
  }
}

export type MomentsFeedCache = Partial<Record<MomentFilter, MomentsFeedCacheEntry>>

/** 存储中的条目只保存动态 ID 顺序，动态本身按 ID 单独存储。 */
interface StoredMomentsFeedEntry {
  itemIds: string[]
  offset: string
  updateBaseline: string
  hasMore: boolean
  updatedAt: number
  continuation?: {
    itemIds: string[]
    offset: string
    updateBaseline: string
    hasMore: boolean
  }
}

interface UseMomentsFeedCacheOptions {
  /** 合并连续写入的延迟（毫秒）。 */
  writeDelay?: number
}

interface MomentsFeedCacheHandle {
  data: ShallowRef<MomentsFeedCache>
  /** 读取完成（成功或失败）后兑现。 */
  ready: Promise<void>
  /** 立即写入尚未落盘的修改，用于页面卸载。 */
  flush: () => void
  /** 动态对象被原地修改（点赞、预约等）后标记重写，其余已存储的动态不再重复写入。 */
  markItemsDirty: (ids: Iterable<string>) => void
}

const RECORD_KEY = 'momentsFeed'
/** 旧版把整份缓存序列化成单个值保存，首次读取时迁移为子记录。 */
const LEGACY_KEY = 'momentsFeedCache'
const ENTRY_RECORD_PREFIX = 'entry:'
const ITEM_RECORD_PREFIX = 'item:'
const MOMENT_FILTERS: readonly MomentFilter[] = ['all', 'video', 'pgc', 'article']

function isMomentFilter(value: string): value is MomentFilter {
  return (MOMENT_FILTERS as readonly string[]).includes(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function encodeEntry(entry: MomentsFeedCacheEntry): string {
  const stored: StoredMomentsFeedEntry = {
    itemIds: entry.items.map(moment => moment.id),
    offset: entry.offset,
    updateBaseline: entry.updateBaseline,
    hasMore: entry.hasMore,
    updatedAt: entry.updatedAt,
  }
  if (entry.continuation) {
    stored.continuation = {
      itemIds: entry.continuation.items.map(moment => moment.id),
      offset: entry.continuation.offset,
      updateBaseline: entry.continuation.updateBaseline,
      hasMore: entry.continuation.hasMore,
    }
  }
  return JSON.stringify(stored)
}

function parseStoredEntry(value: string): StoredMomentsFeedEntry | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<StoredMomentsFeedEntry> | null
    if (!parsed || !isStringArray(parsed.itemIds))
      return undefined
    if (parsed.continuation && !isStringArray(parsed.continuation.itemIds))
      return undefined
    return parsed as StoredMomentsFeedEntry
  }
  catch {
    return undefined
  }
}

function forEachEntryItem(entry: MomentsFeedCacheEntry, callback: (moment: DisplayMoment) => void) {
  entry.items.forEach(callback)
  entry.continuation?.items.forEach(callback)
}

/**
 * 后台 IndexedDB 中的动态缓存。每个筛选条目只记录动态 ID 与分页游标，动态按 ID 单独存储，
 * 写入时只提交变化的条目、新出现或被标记修改的动态以及不再被引用的删除项。
 * 不同标签页之间不实时同步；交错写入只会让条目引用到已删除的动态，读取时会跳过缺失项。
 */
export function useMomentsFeedCache(options: UseMomentsFeedCacheOptions = {}): MomentsFeedCacheHandle {
  const { writeDelay = 0 } = options
  const data = shallowRef<MomentsFeedCache>({})
  let loaded = false
  let dirtyBeforeLoad = false
  let applyingStoredValue = false
  let writeTimer: ReturnType<typeof setTimeout> | undefined
  let pendingWrite = false
  let writing = false
  /** 存储内容未知（读取失败、写入失败或迁移）时，下一次写入整体重建。 */
  let needsReplace = false
  let legacyCleanupPending = false
  /** 已确认写入存储的条目 JSON、动态记录 ID 与对应的动态对象引用。 */
  let persistedEntries = new Map<MomentFilter, string>()
  let persistedItemIds = new Set<string>()
  let persistedItems = new Map<string, WeakRef<DisplayMoment>>()
  const dirtyItemIds = new Set<string>()

  function buildPatch() {
    const replace = needsReplace
    const set: ExtensionCacheRecords = {}
    const remove: string[] = []
    const nextEntries = new Map<MomentFilter, string>()
    const items = new Map<string, DisplayMoment>()

    for (const filter of MOMENT_FILTERS) {
      const entry = data.value[filter]
      if (!entry)
        continue
      const json = encodeEntry(entry)
      nextEntries.set(filter, json)
      if (replace || persistedEntries.get(filter) !== json)
        set[`${ENTRY_RECORD_PREFIX}${filter}`] = json
      forEachEntryItem(entry, (moment) => {
        if (!items.has(moment.id))
          items.set(moment.id, toRaw(moment))
      })
    }

    const writtenDirtyIds: string[] = []
    for (const [id, moment] of items) {
      const isDirty = dirtyItemIds.has(id)
      if (isDirty)
        writtenDirtyIds.push(id)
      const isSamePersistedObject = persistedItemIds.has(id) && persistedItems.get(id)?.deref() === moment
      if (!replace && isSamePersistedObject && !isDirty)
        continue
      try {
        set[`${ITEM_RECORD_PREFIX}${id}`] = JSON.stringify(moment)
      }
      catch (error) {
        // 单条动态无法序列化时跳过，读取时条目会忽略缺失的动态。
        items.delete(id)
        console.warn('[BewlyCat] Failed to serialize moments feed cache item.', error)
      }
    }

    if (!replace) {
      for (const filter of persistedEntries.keys()) {
        if (!nextEntries.has(filter))
          remove.push(`${ENTRY_RECORD_PREFIX}${filter}`)
      }
      for (const id of persistedItemIds) {
        if (!items.has(id))
          remove.push(`${ITEM_RECORD_PREFIX}${id}`)
      }
    }

    const nextItems = new Map<string, WeakRef<DisplayMoment>>()
    for (const [id, moment] of items)
      nextItems.set(id, new WeakRef(moment))

    return {
      patch: { key: RECORD_KEY, set, remove, replace } satisfies ExtensionCacheRecordsPatch,
      nextEntries,
      nextItemIds: new Set(items.keys()),
      nextItems,
      writtenDirtyIds,
    }
  }

  async function write() {
    pendingWrite = false
    writing = true
    const { patch, nextEntries, nextItemIds, nextItems, writtenDirtyIds } = buildPatch()
    writtenDirtyIds.forEach(id => dirtyItemIds.delete(id))
    const hasChanges = patch.replace || patch.remove.length > 0 || Object.keys(patch.set).length > 0

    try {
      if (hasChanges)
        await sendMessage<ExtensionCacheRecordsPatch>(EXTENSION_CACHE_MESSAGE.PATCH_RECORDS, patch)
      persistedEntries = nextEntries
      persistedItemIds = nextItemIds
      persistedItems = nextItems
      if (patch.replace)
        needsReplace = false
      if (patch.replace && legacyCleanupPending) {
        legacyCleanupPending = false
        void sendMessage<ExtensionCacheWrite>(EXTENSION_CACHE_MESSAGE.WRITE, { key: LEGACY_KEY, value: null })
          .catch(error => console.warn(`[BewlyCat] Failed to remove ${LEGACY_KEY}.`, error))
      }
    }
    catch (error) {
      // 无法确认哪些记录已写入，下一次写入时整体重建。
      needsReplace = true
      console.warn(`[BewlyCat] Failed to write ${RECORD_KEY}.`, error)
    }
    finally {
      writing = false
      // 写入期间产生的新修改按顺序在上一批完成后提交。
      if (pendingWrite && writeTimer === undefined)
        void write()
    }
  }

  function flush() {
    if (writeTimer !== undefined)
      clearTimeout(writeTimer)
    writeTimer = undefined
    if (pendingWrite && !writing)
      void write()
  }

  function scheduleWrite() {
    pendingWrite = true
    if (writeTimer !== undefined)
      clearTimeout(writeTimer)
    writeTimer = setTimeout(flush, writeDelay)
  }

  function markItemsDirty(ids: Iterable<string>) {
    for (const id of ids)
      dirtyItemIds.add(id)
    if (loaded)
      scheduleWrite()
  }

  function applyStoredValue(value: MomentsFeedCache) {
    applyingStoredValue = true
    try {
      data.value = value
    }
    finally {
      applyingStoredValue = false
    }
    dirtyBeforeLoad = false
  }

  function applyRecords(records: ExtensionCacheRecords) {
    const storedEntries = new Map<MomentFilter, string>()
    const itemRecords = new Map<string, string>()
    for (const [recordId, value] of Object.entries(records)) {
      if (recordId.startsWith(ITEM_RECORD_PREFIX)) {
        itemRecords.set(recordId.slice(ITEM_RECORD_PREFIX.length), value)
      }
      else if (recordId.startsWith(ENTRY_RECORD_PREFIX)) {
        const filter = recordId.slice(ENTRY_RECORD_PREFIX.length)
        if (isMomentFilter(filter))
          storedEntries.set(filter, value)
      }
    }

    // 同一动态可能被多个筛选条目引用，只解析一次并共享对象。
    const parsedItems = new Map<string, DisplayMoment | null>()
    const resolveItems = (ids: string[]) => ids.flatMap((id) => {
      if (!parsedItems.has(id)) {
        const json = itemRecords.get(id)
        let moment: DisplayMoment | null = null
        if (json !== undefined) {
          try {
            moment = JSON.parse(json) as DisplayMoment
          }
          catch {
            moment = null
          }
        }
        parsedItems.set(id, moment && typeof moment === 'object' && moment.id === id ? moment : null)
      }
      const moment = parsedItems.get(id)
      return moment ? [moment] : []
    })

    const cache: MomentsFeedCache = {}
    for (const [filter, json] of storedEntries) {
      const stored = parseStoredEntry(json)
      if (!stored)
        continue
      cache[filter] = {
        items: resolveItems(stored.itemIds),
        offset: stored.offset ?? '',
        updateBaseline: stored.updateBaseline ?? '',
        hasMore: Boolean(stored.hasMore),
        updatedAt: Number(stored.updatedAt) || 0,
        continuation: stored.continuation
          ? {
              items: resolveItems(stored.continuation.itemIds),
              offset: stored.continuation.offset ?? '',
              updateBaseline: stored.continuation.updateBaseline ?? '',
              hasMore: Boolean(stored.continuation.hasMore),
            }
          : undefined,
      }
    }

    // 记录的是存储中的实际内容；无效或不再引用的记录会在下一次写入时删除。
    persistedEntries = storedEntries
    persistedItemIds = new Set(itemRecords.keys())
    persistedItems = new Map()
    for (const [id, moment] of parsedItems) {
      if (moment)
        persistedItems.set(id, new WeakRef(moment))
    }
    applyStoredValue(cache)
  }

  async function readLegacyValue() {
    const stored = await sendMessage<ExtensionCacheRead, string | null>(EXTENSION_CACHE_MESSAGE.READ, { key: LEGACY_KEY })
    if (typeof stored !== 'string')
      return
    legacyCleanupPending = true
    needsReplace = true
    try {
      const parsed = JSON.parse(stored) as MomentsFeedCache | null
      if (parsed && typeof parsed === 'object')
        applyStoredValue(parsed)
    }
    catch (error) {
      console.warn(`[BewlyCat] Failed to parse ${LEGACY_KEY}.`, error)
    }
  }

  watch(data, () => {
    if (applyingStoredValue)
      return
    if (!loaded) {
      dirtyBeforeLoad = true
      return
    }
    scheduleWrite()
  }, { flush: 'sync' })

  const ready = (async () => {
    try {
      const records = await sendMessage<ExtensionCacheRecordsRead, ExtensionCacheRecords | null>(
        EXTENSION_CACHE_MESSAGE.READ_RECORDS,
        { key: RECORD_KEY },
      )
      // 已有存储时以存储为准，读取前的页面修改只在没有存储时落盘。
      if (records && typeof records === 'object' && Object.keys(records).length > 0)
        applyRecords(records)
      else
        await readLegacyValue()
    }
    catch (error) {
      needsReplace = true
      console.warn(`[BewlyCat] Failed to read ${RECORD_KEY}.`, error)
    }
    finally {
      loaded = true
      if (dirtyBeforeLoad || needsReplace || dirtyItemIds.size > 0)
        scheduleWrite()
    }
  })()

  return { data, ready, flush, markItemsDirty }
}
