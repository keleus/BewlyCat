/**
 * 本地壁纸管理工具
 * 将图片base64存储在本地storage的单独项中，设置里只保存引用
 */

import { useStorageLocal } from '~/composables/useStorageLocal'

// 本地壁纸数据接口
export interface LocalWallpaperData {
  id: string
  name: string
  base64: string
  size: number
  type: string
  lastModified: number
  timestamp: number
}

// 本地壁纸引用接口
export interface LocalWallpaperRef {
  id: string
  name: string
  isLocal: true
}

// 本地壁纸存储
const localWallpapers = useStorageLocal<Record<string, LocalWallpaperData>>('localWallpapers', {})

/**
 * 生成本地壁纸的唯一标识符
 * @param fileName 原始文件名
 * @returns 唯一标识符
 */
export function generateWallpaperId(fileName: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const extension = fileName.split('.').pop() || ''
  return `wallpaper_${timestamp}_${random}.${extension}`
}

/**
 * 存储本地壁纸
 * @param file 文件对象
 * @param base64 base64数据
 * @returns 壁纸引用对象
 */
export async function storeLocalWallpaper(file: File, base64: string): Promise<LocalWallpaperRef> {
  const id = generateWallpaperId(file.name)

  const wallpaperData: LocalWallpaperData = {
    id,
    name: file.name,
    base64,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    timestamp: Date.now(),
  }

  // 存储到本地storage
  const currentWallpapers = localWallpapers.value || {}
  currentWallpapers[id] = wallpaperData
  localWallpapers.value = currentWallpapers

  // 返回引用对象
  return {
    id,
    name: file.name,
    isLocal: true,
  }
}

/**
 * 获取本地壁纸的base64数据
 * @param id 壁纸ID
 * @returns base64数据或null
 */
export function getLocalWallpaper(id: string): string | null {
  const wallpapers = localWallpapers.value || {}
  const wallpaper = wallpapers[id]

  if (wallpaper) {
    return wallpaper.base64
  }

  return null
}

/**
 * 删除本地壁纸
 * @param id 壁纸ID
 */
export function removeLocalWallpaper(id: string): void {
  const currentWallpapers = localWallpapers.value || {}

  if (currentWallpapers[id]) {
    delete currentWallpapers[id]
    localWallpapers.value = currentWallpapers
  }
}

/**
 * 检查本地壁纸是否存在
 * @param id 壁纸ID
 * @returns 是否存在
 */
export function hasLocalWallpaper(id: string): boolean {
  const wallpapers = localWallpapers.value || {}
  return !!wallpapers[id]
}

/**
 * 获取所有本地壁纸的信息
 * @returns 壁纸信息数组
 */
export function getAllLocalWallpapers(): LocalWallpaperData[] {
  const wallpapers = localWallpapers.value || {}
  return Object.values(wallpapers)
}

/**
 * 清理所有本地壁纸
 */
export function clearAllLocalWallpapers(): void {
  localWallpapers.value = {}
}

/**
 * 检查并清理过期的本地壁纸（可选功能）
 * @param maxAge 最大保存时间（毫秒），默认30天
 */
export function cleanupExpiredWallpapers(maxAge: number = 30 * 24 * 60 * 60 * 1000): void {
  const currentWallpapers = localWallpapers.value || {}
  const now = Date.now()
  let cleaned = 0

  Object.keys(currentWallpapers).forEach((id) => {
    const wallpaper = currentWallpapers[id]
    if (now - wallpaper.timestamp > maxAge) {
      delete currentWallpapers[id]
      cleaned++
    }
  })

  if (cleaned > 0) {
    localWallpapers.value = currentWallpapers
  }
}

/**
 * 解析本地壁纸URL，获取实际的base64数据
 * @param url 壁纸URL（可能是local-wallpaper:id格式或普通URL）
 * @returns 实际的显示URL
 */
export function resolveWallpaperUrl(url: string): string | null {
  if (!url)
    return null

  // 如果是本地壁纸引用格式
  if (url.startsWith('local-wallpaper:')) {
    const id = url.replace('local-wallpaper:', '')
    return getLocalWallpaper(id)
  }

  // 普通URL直接返回
  return url
}

/**
 * 检查是否为本地壁纸URL
 * @param url 壁纸URL
 * @returns 是否为本地壁纸URL
 */
export function isLocalWallpaperUrl(url: string): boolean {
  return url.startsWith('local-wallpaper:')
}

/**
 * 从本地壁纸URL中提取ID
 * @param url 本地壁纸URL
 * @returns 壁纸ID或null
 */
export function extractWallpaperId(url: string): string | null {
  if (isLocalWallpaperUrl(url)) {
    return url.replace('local-wallpaper:', '')
  }
  return null
}
