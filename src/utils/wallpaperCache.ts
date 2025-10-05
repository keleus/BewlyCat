/**
 * URL壁纸缓存管理工具
 * 用于管理从URL加载的背景图片的缓存
 * 注意:本地上传的壁纸不使用此缓存系统,它们有独立的存储机制
 */

import { useStorageLocal } from '~/composables/useStorageLocal'
import { isLocalWallpaperUrl } from '~/utils/localWallpaper'

// 壁纸缓存数据接口
export interface WallpaperCacheData {
  url: string // 原始URL
  dataUrl: string // 缓存的data URL (base64)
  timestamp: number // 缓存时间戳
  cacheTime: number // 缓存时长(小时)
}

// 壁纸缓存存储
const wallpaperCache = useStorageLocal<Record<string, WallpaperCacheData>>('wallpaperCache', {})

/**
 * 获取缓存的壁纸
 * @param url 原始URL
 * @param cacheTimeHours 缓存时长(小时), 0表示不使用缓存
 * @returns 缓存的data URL或null
 */
async function getCachedWallpaper(url: string, cacheTimeHours: number): Promise<string | null> {
  // 如果是本地壁纸URL,不使用此缓存系统
  if (isLocalWallpaperUrl(url)) {
    return null
  }

  // 如果缓存时间为0,不使用缓存
  if (cacheTimeHours <= 0) {
    return null
  }

  const cache = wallpaperCache.value || {}
  const cached = cache[url]

  if (!cached) {
    return null
  }

  const now = Date.now()
  const cacheAge = now - cached.timestamp
  const maxAge = cacheTimeHours * 60 * 60 * 1000 // 转换为毫秒

  // 检查缓存是否过期
  if (cacheAge > maxAge) {
    // 清理过期缓存
    delete cache[url]
    wallpaperCache.value = cache
    return null
  }

  return cached.dataUrl
}

/**
 * 缓存壁纸
 * @param url 原始URL
 * @param cacheTimeHours 缓存时长(小时), 0表示不缓存
 */
async function cacheWallpaper(url: string, cacheTimeHours: number): Promise<void> {
  // 如果是本地壁纸URL,不使用此缓存系统
  if (isLocalWallpaperUrl(url)) {
    return
  }

  // 如果缓存时间为0,不缓存
  if (cacheTimeHours <= 0) {
    return
  }

  try {
    // 缓存前先清理过期数据
    cleanupExpiredCache()

    // 使用fetch获取图片
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch wallpaper: ${response.status}`)
    }

    const blob = await response.blob()
    const dataUrl = await blobToDataUrl(blob)

    const cache = wallpaperCache.value || {}
    cache[url] = {
      url,
      dataUrl,
      timestamp: Date.now(),
      cacheTime: cacheTimeHours,
    }

    wallpaperCache.value = cache
  }
  catch (error) {
    console.error('Failed to cache wallpaper:', error)
  }
}

/**
 * 获取或缓存壁纸
 * @param url 原始URL
 * @param cacheTimeHours 缓存时长(小时), 0表示不缓存
 * @returns 壁纸URL (可能是缓存的data URL或原始URL)
 */
export async function getOrCacheWallpaper(url: string, cacheTimeHours: number): Promise<string> {
  if (!url) {
    return url
  }

  // 如果是本地壁纸URL,直接返回
  if (isLocalWallpaperUrl(url)) {
    return url
  }

  // 如果缓存时间为0,直接返回原始URL(不缓存)
  if (cacheTimeHours <= 0) {
    return url
  }

  // 尝试获取缓存
  const cached = await getCachedWallpaper(url, cacheTimeHours)
  if (cached) {
    return cached
  }

  // 异步缓存图片(不阻塞返回)
  cacheWallpaper(url, cacheTimeHours).catch(err =>
    console.error('Failed to cache wallpaper:', err),
  )

  // 返回原始URL
  return url
}

/**
 * 清除所有过期的缓存
 * @param currentCacheTimeHours 当前的缓存时间设置(小时),如果提供则用这个时间来判断是否过期,否则使用存储时的时间
 */
export function cleanupExpiredCache(currentCacheTimeHours?: number): void {
  const cache = wallpaperCache.value || {}
  const now = Date.now()
  let cleaned = 0

  Object.keys(cache).forEach((url) => {
    const cached = cache[url]
    // 如果提供了当前缓存时间,用它来判断;否则使用存储时的缓存时间
    const cacheTimeToUse = currentCacheTimeHours !== undefined ? currentCacheTimeHours : cached.cacheTime
    const maxAge = cacheTimeToUse * 60 * 60 * 1000
    const cacheAge = now - cached.timestamp

    if (cacheAge > maxAge) {
      delete cache[url]
      cleaned++
    }
  })

  if (cleaned > 0) {
    wallpaperCache.value = cache
    console.log(`Cleaned up ${cleaned} expired wallpaper cache entries`)
  }
}

/**
 * 将Blob转换为Data URL
 * @param blob Blob对象
 * @returns Data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
