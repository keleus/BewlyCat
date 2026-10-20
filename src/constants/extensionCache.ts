export const EXTENSION_CACHE_MESSAGE = {
  READ: 'extensionCache:read',
  WRITE: 'extensionCache:write',
} as const

/**
 * 由后台 IndexedDB 保存的大体积缓存。storage.local 的每次写入都会把新旧值广播给
 * 所有标签页的所有框架，这类只服务单个页面的缓存不能放在那里。
 */
export const EXTENSION_CACHE_KEYS = ['momentsFeedCache'] as const

export type ExtensionCacheKey = typeof EXTENSION_CACHE_KEYS[number]

export interface ExtensionCacheRead {
  key: ExtensionCacheKey
}

export interface ExtensionCacheWrite {
  key: ExtensionCacheKey
  /** JSON 字符串；null 表示删除。内容脚本先序列化，避免响应式代理无法跨进程克隆。 */
  value: string | null
}

export function isExtensionCacheKey(value: unknown): value is ExtensionCacheKey {
  return typeof value === 'string' && (EXTENSION_CACHE_KEYS as readonly string[]).includes(value)
}
