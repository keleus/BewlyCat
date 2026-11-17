export const EXTENSION_CACHE_MESSAGE = {
  READ: 'extensionCache:read',
  WRITE: 'extensionCache:write',
  READ_RECORDS: 'extensionCache:readRecords',
  PATCH_RECORDS: 'extensionCache:patchRecords',
} as const

/**
 * 由后台 IndexedDB 保存的大体积缓存。storage.local 的每次写入都会把新旧值广播给
 * 所有标签页的所有框架，这类只服务单个页面的缓存不能放在那里。
 * 整份读写的键目前只用于读取并删除旧版动态缓存。
 */
export const EXTENSION_CACHE_KEYS = ['momentsFeedCache'] as const

/** 按子记录增量读写的缓存集合；每条子记录单独存储，写入时只提交变化的记录。 */
export const EXTENSION_CACHE_RECORD_KEYS = ['momentsFeed'] as const

export type ExtensionCacheKey = typeof EXTENSION_CACHE_KEYS[number]
export type ExtensionCacheRecordKey = typeof EXTENSION_CACHE_RECORD_KEYS[number]

export interface ExtensionCacheRead {
  key: ExtensionCacheKey
}

export interface ExtensionCacheWrite {
  key: ExtensionCacheKey
  /** JSON 字符串；null 表示删除。内容脚本先序列化，避免响应式代理无法跨进程克隆。 */
  value: string | null
}

export interface ExtensionCacheRecordsRead {
  key: ExtensionCacheRecordKey
}

/** 子记录 ID 到 JSON 字符串的映射。 */
export type ExtensionCacheRecords = Record<string, string>

export interface ExtensionCacheRecordsPatch {
  key: ExtensionCacheRecordKey
  /** 新增或覆盖的子记录。 */
  set: ExtensionCacheRecords
  /** 删除的子记录 ID。 */
  remove: string[]
  /** 先清空该集合的全部子记录再写入 set，用于迁移和写入失败后的整体重建。 */
  replace?: boolean
}

export function isExtensionCacheKey(value: unknown): value is ExtensionCacheKey {
  return typeof value === 'string' && (EXTENSION_CACHE_KEYS as readonly string[]).includes(value)
}

export function isExtensionCacheRecordKey(value: unknown): value is ExtensionCacheRecordKey {
  return typeof value === 'string' && (EXTENSION_CACHE_RECORD_KEYS as readonly string[]).includes(value)
}
