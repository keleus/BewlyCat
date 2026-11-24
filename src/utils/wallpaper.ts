import type { Settings } from '~/logic/storage'
import {
  isLocalWallpaperUrl,
  localWallpapersLoaded,
  resolveWallpaperUrl,
} from '~/utils/localWallpaper'
import { getOrCacheWallpaper } from '~/utils/wallpaperCache'

export const WALLPAPER_SETTING_KEYS = [
  'wallpaper',
  'darkModeWallpaper',
  'searchPageWallpaper',
  'searchPageDarkModeWallpaper',
] as const

export type WallpaperSettingKey = (typeof WALLPAPER_SETTING_KEYS)[number]

export const LOCAL_WALLPAPER_SLOT_KEYS = [
  'locallyUploadedWallpaper',
  'locallyUploadedDarkWallpaper',
] as const

export type LocalWallpaperSlotKey = (typeof LOCAL_WALLPAPER_SLOT_KEYS)[number]

type GlobalWallpaperSettings = Pick<
  Settings,
  'wallpaper' | 'individuallySetDarkModeWallpaper' | 'darkModeWallpaper'
>
type SearchPageWallpaperSettings = Pick<
  Settings,
  | 'searchPageWallpaper'
  | 'searchPageIndividuallySetDarkModeWallpaper'
  | 'searchPageDarkModeWallpaper'
>

export function getEffectiveGlobalWallpaper(
  settingsValue: GlobalWallpaperSettings,
  isDark: boolean,
): string {
  return isDark && settingsValue.individuallySetDarkModeWallpaper
    ? settingsValue.darkModeWallpaper
    : settingsValue.wallpaper
}

export function getEffectiveSearchPageWallpaper(
  settingsValue: SearchPageWallpaperSettings,
  isDark: boolean,
): string {
  return isDark && settingsValue.searchPageIndividuallySetDarkModeWallpaper
    ? settingsValue.searchPageDarkModeWallpaper
    : settingsValue.searchPageWallpaper
}

export async function resolveWallpaperSource(
  originalUrl: string,
  cacheTime: number,
): Promise<string> {
  if (isLocalWallpaperUrl(originalUrl)) {
    // 读取完成前解析结果为空，且这里不会因数据到达而重新执行。
    await localWallpapersLoaded
    return resolveWallpaperUrl(originalUrl) || ''
  }

  return originalUrl ? await getOrCacheWallpaper(originalUrl, cacheTime) : ''
}
