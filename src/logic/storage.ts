import { ref, watch } from 'vue'
import browser from 'webextension-polyfill'

import { useStorageLocal } from '~/composables/useStorageLocal'
import type { wallpaperItem } from '~/constants/imgs'
import type { HomeSubPage } from '~/contentScripts/views/Home/types'
import type { AppPage } from '~/enums/appEnums'
import { VideoPageTopBarConfig } from '~/enums/appEnums'

export const storageDemo = useStorageLocal('webext-demo', 'Storage Demo')

export interface AppAuthTokens {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: number | null
  refreshTokenExpiresAt: number | null
  mid: number | null
  lastUpdatedAt: number | null
}

export const defaultAppAuthTokens: AppAuthTokens = {
  accessToken: '',
  refreshToken: '',
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
  mid: null,
  lastUpdatedAt: null,
}

export const appAuthTokens = useStorageLocal<AppAuthTokens>('appAuthTokens', defaultAppAuthTokens, { mergeDefaults: true })

const legacyAccessKey = useStorageLocal('accessKey', '')

watch(
  () => legacyAccessKey.value,
  (value) => {
    if (!value)
      return

    if (!appAuthTokens.value.accessToken) {
      appAuthTokens.value = {
        ...appAuthTokens.value,
        accessToken: value,
        lastUpdatedAt: Date.now(),
      }
    }

    // 清理遗留的 accessKey，避免重复存储
    legacyAccessKey.value = ''
  },
  { immediate: true },
)

export function resetAppAuthTokens() {
  appAuthTokens.value = { ...defaultAppAuthTokens }
  legacyAccessKey.value = ''
}

export const FROSTED_GLASS_BLUR_MIN_PX = 1
export const FROSTED_GLASS_BLUR_MAX_PX = 20

// 快捷键基础配置接口
export interface BaseShortcutSetting {
  key: string
  enabled: boolean
}

// 快捷键配置集合接口
export interface ShortcutsSettings {
  [key: string]: BaseShortcutSetting | undefined
  // 扩展快捷键
  danmuStatus?: BaseShortcutSetting
  webFullscreen?: BaseShortcutSetting
  widescreen?: BaseShortcutSetting
  shortStepBackward?: BaseShortcutSetting // J
  longStepBackward?: BaseShortcutSetting // Shift+J
  playPause?: BaseShortcutSetting // K
  shortStepForward?: BaseShortcutSetting // L
  longStepForward?: BaseShortcutSetting // Shift+L
  nextVideoExtended?: BaseShortcutSetting // N (官方使用 ] or ⏩)
  pip?: BaseShortcutSetting // P
  turnOffLight?: BaseShortcutSetting // I
  caption?: BaseShortcutSetting // C
  increasePlaybackRate?: BaseShortcutSetting // +
  decreasePlaybackRate?: BaseShortcutSetting // -
  resetPlaybackRate?: BaseShortcutSetting // 0
  previousFrame?: BaseShortcutSetting // ,
  nextFrame?: BaseShortcutSetting // .
  replay?: BaseShortcutSetting // Shift+Backspace

  // 首页快捷键
  homeRefresh?: BaseShortcutSetting // R

  // 全屏模式下快捷键
  increaseVideoSize?: BaseShortcutSetting // Shift++
  decreaseVideoSize?: BaseShortcutSetting // Shift+-
  resetVideoSize?: BaseShortcutSetting // Shift+0
  videoTitle?: BaseShortcutSetting // B
  videoTime?: BaseShortcutSetting // G
  clockTime?: BaseShortcutSetting // H

  // 视频页快捷键
  toggleFollow?: BaseShortcutSetting // Shift+F (默认禁用)
}

export type VideoCardFontSizeSetting = 'xs' | 'sm' | 'base' | 'lg'
export type VideoCardLayoutSetting = 'modern' | 'old'
export type AutoPlayMode = 'default' | 'autoPlay' | 'autoPlayWithRecommend' | 'pauseAtEnd' | 'loop'

export interface ShadowCurvePoint {
  position: number
  opacity: number
}

// 本地存储配置接口（不同步到云端的配置）
export interface LocalSettings {
  // 壁纸相关
  locallyUploadedWallpaper: wallpaperItem | null

  // 自定义CSS
  customizeCSS: boolean
  customizeCSSContent: string
}

export interface Settings {
  touchScreenOptimization: boolean
  enableGridLayoutSwitcher: boolean
  enableHorizontalScrolling: boolean
  showIPLocation: boolean // 添加显示IP归属地设置项
  showSex: boolean // 添加显示性别设置项
  adjustCommentImageHeight: boolean // 调整评论区图片高度以匹配实际比例
  enlargeFavoriteDialog: boolean // 视频页收藏夹放大样式增强
  externalWatchLaterButton: boolean // 稍后再看按钮外置

  // Update log settings
  lastReadVersion: string // 上次已读的版本号

  language: string
  customizeFont: 'default' | 'recommend' | 'custom'
  fontFamily: string
  overrideDanmakuFont: boolean
  removeTheIndentFromChinesePunctuation: boolean

  enableFrostedGlass: boolean
  frostedGlassBlurIntensity: number
  disableShadow: boolean

  enableVideoPreview: boolean

  // Link Opening Behavior
  videoCardLinkOpenMode: 'drawer' | 'newTab' | 'currentTab' | 'background'
  topBarLinkOpenMode: 'currentTab' | 'currentTabIfNotHomepage' | 'newTab' | 'background'
  searchBarLinkOpenMode: 'currentTab' | 'currentTabIfNotHomepage' | 'newTab' | 'background'
  closeDrawerWithoutPressingEscAgain: boolean

  blockAds: boolean
  blockTopSearchPageAds: boolean
  cleanUrlArgument: boolean // 清理URL追踪参数

  enableVideoCtrlBarOnVideoCard: boolean
  hoverVideoCardDelayed: boolean
  showVideoCardRecommendTag: boolean

  // Desktop & Dock
  autoHideTopBar: boolean
  videoPageTopBarConfig: VideoPageTopBarConfig
  alwaysUseTransparentTopBar: boolean
  showTopBarThemeColorGradient: boolean
  showBewlyOrBiliTopBarSwitcher: boolean
  showBewlyOrBiliPageSwitcher: boolean
  topBarIconBadges: 'number' | 'dot' | 'none'
  showWatchLaterBadge: boolean
  topBarComponentsConfig: { key: string, visible: boolean, badgeType: 'number' | 'dot' | 'none' }[]
  topBarPinnedChannels: string[]
  openNotificationsPageAsDrawer: boolean
  showBCoinReceiveReminder: boolean
  autoReceiveBCoinCoupon: boolean
  autoReceiveVipExp: boolean
  filterArticlesInMoments: boolean

  alwaysUseDock: boolean
  autoHideDock: boolean
  halfHideDock: boolean
  dockPosition: 'left' | 'right' | 'bottom'
  /** @deprecated use dockItemsConfig instead */
  dockItemVisibilityList: { page: AppPage, visible: boolean }[]
  dockItemsConfig: { page: AppPage, visible: boolean, openInNewTab: boolean, useOriginalBiliPage: boolean }[]
  disableDockGlowingEffect: boolean
  disableLightDarkModeSwitcherOnDock: boolean
  backToTopAndRefreshButtonsAreSeparated: boolean
  enableUndoRefreshButton: boolean // 添加撤销刷新按钮配置项

  sidebarPosition: 'left' | 'right'
  autoHideSidebar: boolean

  theme: 'light' | 'dark' | 'auto'
  themeColor: string
  darkModeBaseColor: string // 深色模式基准颜色
  useLinearGradientThemeColorBackground: boolean
  wallpaperMode: 'buildIn' | 'byUrl'
  wallpaper: string
  enableWallpaperMasking: boolean
  wallpaperMaskOpacity: number
  wallpaperBlurIntensity: number
  wallpaperCacheTime: number // URL壁纸缓存时间(小时), 0表示不缓存

  searchPageDarkenOnSearchFocus: boolean
  searchPageBlurredOnSearchFocus: boolean
  searchPageLogoColor: 'white' | 'themeColor'
  searchPageLogoGlow: boolean
  searchPageShowLogo: boolean
  searchPageSearchBarFocusCharacter: string
  individuallySetSearchPageWallpaper: boolean
  searchPageWallpaperMode: 'buildIn' | 'byUrl'
  searchPageWallpaper: string
  searchPageEnableWallpaperMasking: boolean
  searchPageWallpaperMaskOpacity: number
  searchPageWallpaperBlurIntensity: number
  searchPageWallpaperCacheTime: number // URL壁纸缓存时间(小时), 0表示不缓存

  // 热搜功能设置（统一在搜索框聚焦时显示）
  showHotSearchInTopBar: boolean

  // 搜索推荐功能设置
  showSearchRecommendation: boolean

  // 搜索结果页设置
  usePluginSearchResultsPage: boolean
  searchResultsPaginationMode: 'scroll' | 'pagination' // 搜索结果分页模式：滚动加载或翻页

  recommendationMode: 'web' | 'app'
  autoSwitchRecommendationMode: boolean

  // filter setting
  disableFilterForFollowedUser: boolean
  filterOutVerticalVideos: boolean
  enableFilterByViewCount: boolean
  filterByViewCount: number
  enableFilterByDuration: boolean
  filterByDuration: number
  enableFilterByTitle: boolean
  filterByTitle: { keyword: string, remark: string }[]
  enableFilterByUser: boolean
  filterByUser: { keyword: string, remark: string }[]
  enableFilterByPublishTime: boolean
  filterByPublishTime: number // 单位：天

  followingTabShowLivestreamingVideos: boolean
  useFollowingNewLayout: boolean
  followingInactiveDays: number // UP主超过N天未更新则移至黑名单

  homePageTabVisibilityList: { page: HomeSubPage, visible: boolean }[]
  alwaysShowTabsOnHomePage: boolean
  // Adaptive grid card min width (px) for Home page
  homeAdaptiveCardMinWidth: number
  // Title font size for cards (px); when auto is enabled, this is ignored
  homeAdaptiveTitleFontSize: number
  // Auto adjust title font size based on grid width
  homeAdaptiveTitleAutoSize: boolean
  // Video card author (UP) font size token
  videoCardAuthorFontSize: VideoCardFontSizeSetting
  // Video card tag/meta font size token
  videoCardMetaFontSize: VideoCardFontSizeSetting
  // Preferred video card layout
  videoCardLayout: VideoCardLayoutSetting
  // Video card shadow customization (modern layout only)
  videoCardShadowCurve: ShadowCurvePoint[]
  videoCardShadowHeight: number // 1.0-3.0
  useSearchPageModeOnHomePage: boolean
  searchPageModeWallpaperFixed: boolean
  preserveForYouState: boolean

  adaptToOtherPageStyles: boolean
  showTopBar: boolean
  useOriginalBilibiliTopBar: boolean
  useOriginalBilibiliHomepage: boolean

  // Video Player
  defaultVideoPlayerMode: 'default' | 'webFullscreen' | 'widescreen'
  defaultDanmakuState: 'system' | 'on' | 'off'
  keepCollectionVideoDefaultMode: boolean // 合集视频保持默认模式
  autoExitFullscreenOnEnd: boolean // 全屏播放完毕后自动退出
  autoExitFullscreenExcludeAutoPlay: boolean // 全屏自动退出时排除自动连播

  // 自动连播总开关
  useBilibiliDefaultAutoPlay: boolean // 使用B站默认自动播放行为（总开关）

  // 分类型自动连播设置
  autoPlayMultipart: AutoPlayMode // 分P视频自动播放模式
  autoPlayCollection: AutoPlayMode // 合集视频自动播放模式
  autoPlayRecommend: AutoPlayMode // 单视频推荐自动播放模式
  autoPlayPlaylist: AutoPlayMode // 收藏列表自动播放模式

  keyboard: boolean
  shortcuts: ShortcutsSettings
  videoPlayerScroll: boolean // 添加视频播放器滚动设置

  // 自动音量均衡设置
  enableVolumeNormalization: boolean // 启用自动音量均衡功能
  targetVolume: number // 目标音量 (0-100)
  normalizationStrength: number // 均衡强度/压缩比 (1-20)
  adaptiveGainSpeed: number // 响应速度 (1-10)
  voiceGateDb: number // 人声检测阈值 (dB)
  volumeNormalizationDebug: boolean // 输出音量均衡调试信息

  // 倍速记忆设置
  rememberPlaybackRate: boolean // 启用倍速记忆功能
  savedPlaybackRate: number // 记住的倍速值 (0.25-5)

  // 随机播放设置
  enableRandomPlay: boolean // 启用视频合集随机播放功能
  randomPlayMode: 'manual' | 'auto' // 随机播放模式：手动切换或自动启用
  minVideosForRandom: number // 启用随机播放的最小视频数量
}

// 本地存储配置默认值
export const originalLocalSettings: LocalSettings = {
  locallyUploadedWallpaper: null,
  customizeCSS: false,
  customizeCSSContent: '',
}

export const originalSettings: Settings = {
  touchScreenOptimization: false,
  enableGridLayoutSwitcher: true,
  enableHorizontalScrolling: false,
  showIPLocation: true, // 默认启用IP归属地显示
  showSex: true, // 默认启用性别显示
  adjustCommentImageHeight: true, // 默认启用评论图片高度调整
  enlargeFavoriteDialog: false, // 默认关闭收藏夹放大样式
  externalWatchLaterButton: false, // 默认关闭稍后再看按钮外置

  // Update log settings
  lastReadVersion: '', // 默认为空，表示尚未阅读任何版本

  language: '',
  customizeFont: 'default',
  fontFamily: '',
  overrideDanmakuFont: true,
  removeTheIndentFromChinesePunctuation: false,

  enableFrostedGlass: false,
  frostedGlassBlurIntensity: 10,
  disableShadow: false,

  // Link Opening Behavior
  videoCardLinkOpenMode: 'newTab',
  topBarLinkOpenMode: 'currentTabIfNotHomepage',
  searchBarLinkOpenMode: 'currentTabIfNotHomepage',
  closeDrawerWithoutPressingEscAgain: false,

  blockAds: false,
  blockTopSearchPageAds: false,
  cleanUrlArgument: true, // 默认开启清理URL追踪参数

  enableVideoPreview: true,
  enableVideoCtrlBarOnVideoCard: false,
  hoverVideoCardDelayed: false,
  showVideoCardRecommendTag: true,

  // Desktop & Dock
  autoHideTopBar: false,
  videoPageTopBarConfig: VideoPageTopBarConfig.ShowOnScroll,
  alwaysUseTransparentTopBar: false,
  showTopBarThemeColorGradient: true,
  showBewlyOrBiliTopBarSwitcher: true,
  showBewlyOrBiliPageSwitcher: true,
  topBarIconBadges: 'number',
  showWatchLaterBadge: false,
  topBarComponentsConfig: [
    { key: 'moments', visible: true, badgeType: 'number' },
    { key: 'favorites', visible: true, badgeType: 'number' },
    { key: 'history', visible: true, badgeType: 'number' },
    { key: 'watchLater', visible: true, badgeType: 'number' },
    { key: 'creatorCenter', visible: true, badgeType: 'none' },
    { key: 'upload', visible: true, badgeType: 'none' },
    { key: 'notifications', visible: true, badgeType: 'number' },
  ],
  topBarPinnedChannels: [],
  openNotificationsPageAsDrawer: true,
  showBCoinReceiveReminder: true,
  autoReceiveBCoinCoupon: false,
  autoReceiveVipExp: false,
  filterArticlesInMoments: true,

  alwaysUseDock: false,
  autoHideDock: false,
  halfHideDock: false,
  dockPosition: 'right',
  /** @deprecated use dockItemsConfig instead */
  dockItemVisibilityList: [],
  dockItemsConfig: [],
  disableDockGlowingEffect: false,
  disableLightDarkModeSwitcherOnDock: false,
  backToTopAndRefreshButtonsAreSeparated: true,
  enableUndoRefreshButton: true, // 默认开启撤销刷新按钮

  sidebarPosition: 'right',
  autoHideSidebar: false,

  theme: 'auto',
  themeColor: '#00a1d6',
  darkModeBaseColor: '#2a2d32', // 默认深色模式基准颜色
  useLinearGradientThemeColorBackground: false,
  wallpaperMode: 'buildIn',
  wallpaper: '',
  enableWallpaperMasking: false,
  wallpaperMaskOpacity: 80,
  wallpaperBlurIntensity: 0,
  wallpaperCacheTime: 0, // 默认缓存24小时

  searchPageDarkenOnSearchFocus: true,
  searchPageBlurredOnSearchFocus: false,
  searchPageLogoColor: 'themeColor',
  searchPageLogoGlow: true,
  searchPageShowLogo: true,
  searchPageSearchBarFocusCharacter: '',
  individuallySetSearchPageWallpaper: false,
  searchPageWallpaperMode: 'buildIn',
  searchPageWallpaper: '',
  searchPageEnableWallpaperMasking: false,
  searchPageWallpaperMaskOpacity: 80,
  searchPageWallpaperBlurIntensity: 0,
  searchPageWallpaperCacheTime: 0, // 默认缓存24小时

  // 热搜功能设置（统一在搜索框聚焦时显示）
  showHotSearchInTopBar: true,

  // 搜索推荐功能设置
  showSearchRecommendation: false,

  // 搜索结果页设置
  usePluginSearchResultsPage: true,
  searchResultsPaginationMode: 'scroll', // 默认使用滚动加载

  recommendationMode: 'web',
  autoSwitchRecommendationMode: true,

  // filter setting
  disableFilterForFollowedUser: false,
  filterOutVerticalVideos: false,
  enableFilterByViewCount: false,
  filterByViewCount: 10000,
  enableFilterByDuration: false,
  filterByDuration: 3600,
  enableFilterByTitle: false,
  filterByTitle: [],
  enableFilterByUser: false,
  filterByUser: [],
  enableFilterByPublishTime: false,
  filterByPublishTime: 30, // 默认30天

  followingTabShowLivestreamingVideos: false,
  useFollowingNewLayout: false, // 默认使用旧布局
  followingInactiveDays: 100, // 默认100天

  homePageTabVisibilityList: [],
  alwaysShowTabsOnHomePage: false,
  homeAdaptiveCardMinWidth: 280,
  homeAdaptiveTitleFontSize: 16,
  homeAdaptiveTitleAutoSize: true,
  videoCardAuthorFontSize: 'sm',
  videoCardMetaFontSize: 'xs',
  videoCardLayout: 'modern',
  videoCardShadowCurve: [
    { position: 0, opacity: 80 },
    { position: 30, opacity: 70 },
    { position: 100, opacity: 0 },
  ],
  videoCardShadowHeight: 1.0,
  useSearchPageModeOnHomePage: false,
  searchPageModeWallpaperFixed: false,
  preserveForYouState: false,

  adaptToOtherPageStyles: true,
  showTopBar: true,
  useOriginalBilibiliTopBar: false,
  useOriginalBilibiliHomepage: false,

  // Video Player
  defaultVideoPlayerMode: 'default',
  defaultDanmakuState: 'system',
  keepCollectionVideoDefaultMode: false, // 合集视频保持默认模式，默认关闭
  autoExitFullscreenOnEnd: false, // 全屏播放完毕后自动退出，默认关闭
  autoExitFullscreenExcludeAutoPlay: false, // 全屏自动退出时排除自动连播，默认关闭

  // 自动连播总开关
  useBilibiliDefaultAutoPlay: true, // 使用B站默认自动播放行为（总开关），默认开启

  // 分类型自动连播设置（总开关关闭时生效）
  autoPlayMultipart: 'autoPlay', // 分P视频自动播放模式，默认自动连播
  autoPlayCollection: 'autoPlay', // 合集视频自动播放模式，默认自动连播
  autoPlayRecommend: 'autoPlay', // 单视频推荐自动播放模式，默认自动连播
  autoPlayPlaylist: 'autoPlay', // 收藏列表自动播放模式，默认自动连播

  keyboard: true, // 总快捷键开关，默认为 true
  videoPlayerScroll: true, // 默认开启视频播放器滚动
  shortcuts: {
    danmuStatus: { key: 'Shift+D', enabled: true },
    webFullscreen: { key: 'W', enabled: true },
    widescreen: { key: 'T', enabled: true },
    shortStepBackward: { key: 'J', enabled: true },
    longStepBackward: { key: 'Shift+J', enabled: true },
    playPause: { key: 'K', enabled: true }, // 官方有 Space/⏯️，K 作为可选项
    shortStepForward: { key: 'L', enabled: true },
    longStepForward: { key: 'Shift+L', enabled: true },
    pip: { key: 'P', enabled: true },
    turnOffLight: { key: 'I', enabled: true },
    caption: { key: 'C', enabled: true },
    increasePlaybackRate: { key: '+', enabled: true },
    decreasePlaybackRate: { key: '-', enabled: true },
    resetPlaybackRate: { key: '0', enabled: true },
    previousFrame: { key: ',', enabled: true },
    nextFrame: { key: '.', enabled: true },
    replay: { key: 'Shift+Backspace', enabled: true },
    increaseVideoSize: { key: 'Shift++', enabled: true },
    decreaseVideoSize: { key: 'Shift+-', enabled: true },
    resetVideoSize: { key: 'Shift+0', enabled: true },
    videoTitle: { key: 'B', enabled: true },
    videoTime: { key: 'G', enabled: true },
    clockTime: { key: 'H', enabled: true },
    homeRefresh: { key: 'R', enabled: true },
  },

  // 自动音量均衡设置
  enableVolumeNormalization: false, // 启用自动音量均衡功能
  targetVolume: 50, // 目标音量 (0-100)，50为中等音量
  normalizationStrength: 12, // 均衡强度/压缩比 (1-20)，12为推荐值
  adaptiveGainSpeed: 5, // 响应速度 (1-10)，5为中等速度
  voiceGateDb: -34, // 人声检测阈值 (dB)，低于此值视为静音
  volumeNormalizationDebug: false, // 输出音量均衡调试信息，默认关闭

  // 倍速记忆设置
  rememberPlaybackRate: false, // 启用倍速记忆功能
  savedPlaybackRate: 1, // 记住的倍速值 (0.25-5)

  // 随机播放设置
  enableRandomPlay: false, // 启用视频合集随机播放功能
  randomPlayMode: 'manual', // 随机播放模式：手动切换或自动启用
  minVideosForRandom: 5, // 启用随机播放的最小视频数量
}

export const settings = useStorageLocal('settings', originalSettings, { mergeDefaults: true })

watch(
  () => settings.value,
  (value) => {
    const record = value as Record<string, any>

    if (!Number.isFinite(record.frostedGlassBlurIntensity))
      record.frostedGlassBlurIntensity = originalSettings.frostedGlassBlurIntensity

    if ('reduceFrostedGlassBlur' in record) {
      if (record.reduceFrostedGlassBlur === true && record.frostedGlassBlurIntensity === originalSettings.frostedGlassBlurIntensity)
        record.frostedGlassBlurIntensity = 10

      Reflect.deleteProperty(record, 'reduceFrostedGlassBlur')
    }

    if (record.frostedGlassBlurIntensity < FROSTED_GLASS_BLUR_MIN_PX)
      record.frostedGlassBlurIntensity = FROSTED_GLASS_BLUR_MIN_PX

    if (record.frostedGlassBlurIntensity > FROSTED_GLASS_BLUR_MAX_PX)
      record.frostedGlassBlurIntensity = FROSTED_GLASS_BLUR_MAX_PX

    // 迁移旧的布尔类型自动播放设置到新的 AutoPlayMode 类型
    const autoPlayFields = ['autoPlayMultipart', 'autoPlayCollection', 'autoPlayRecommend', 'autoPlayPlaylist'] as const

    // 检查是否存在旧的布尔设置需要迁移
    const needsMigration = autoPlayFields.some(field => typeof record[field] === 'boolean')

    if (needsMigration) {
      for (const field of autoPlayFields) {
        // 只对布尔类型进行迁移，其他类型（包括 'default'）保持不变
        if (typeof record[field] === 'boolean') {
          // true -> 'autoPlay', false -> 'pauseAtEnd'
          record[field] = record[field] ? 'autoPlay' : 'pauseAtEnd'
        }
      }
    }

    // 确保 useBilibiliDefaultAutoPlay 存在（新用户或旧版本升级）
    if (!('useBilibiliDefaultAutoPlay' in record)) {
      record.useBilibiliDefaultAutoPlay = true
    }

    // 迁移旧的 disableFrostedGlass 到 enableFrostedGlass
    if ('disableFrostedGlass' in record) {
      record.enableFrostedGlass = !record.disableFrostedGlass

      // 清理旧的字段
      Reflect.deleteProperty(record, 'disableFrostedGlass')
    }
  },
  { immediate: true },
)

// 本地存储配置（不会同步到云端）
export const localSettings = useStorageLocal('localSettings', originalLocalSettings, { mergeDefaults: true })

// 数据迁移：将旧的设置迁移到新的本地设置中
async function migrateOldSettings() {
  try {
    // 获取原始的存储数据
    const rawSettings = await browser.storage.local.get('settings')
    const settingsData = rawSettings.settings

    if (settingsData && typeof settingsData === 'string') {
      const parsedSettings = JSON.parse(settingsData)

      // 检查是否存在需要迁移的字段
      const needsMigration
        = 'locallyUploadedWallpaper' in parsedSettings
          || 'customizeCSS' in parsedSettings
          || 'customizeCSSContent' in parsedSettings

      if (needsMigration) {
        // 迁移到 localSettings
        const migratedLocalSettings = {
          locallyUploadedWallpaper: parsedSettings.locallyUploadedWallpaper || null,
          customizeCSS: parsedSettings.customizeCSS || false,
          customizeCSSContent: parsedSettings.customizeCSSContent || '',
        }

        // 保存到 localSettings
        await browser.storage.local.set({
          localSettings: JSON.stringify(migratedLocalSettings),
        })

        // 从 settings 中移除这些字段
        delete parsedSettings.locallyUploadedWallpaper
        delete parsedSettings.customizeCSS
        delete parsedSettings.customizeCSSContent

        // 更新 settings
        await browser.storage.local.set({
          settings: JSON.stringify(parsedSettings),
        })

        console.log('✅ 设置迁移完成：已将本地存储相关设置迁移到独立存储')
      }
    }
  }
  catch (error) {
    console.error('❌ 设置迁移失败:', error)
  }
}

// 执行迁移
migrateOldSettings()

export type GridLayoutType = 'adaptive' | 'twoColumns' | 'oneColumn'

export interface GridLayout {
  home: GridLayoutType
}

export const gridLayout = useStorageLocal('gridLayout', ref<GridLayout>({
  home: 'adaptive',
}), { mergeDefaults: true })

/**
 * 网格列数配置
 * 固定的媒体断点，只允许配置每个断点的列数
 */
export interface GridColumnsConfig {
  base: number // 默认列数 (< 640px)
  sm: number // >= 640px
  md: number // >= 768px
  lg: number // >= 1024px
  xl: number // >= 1280px
  xxl: number // >= 1536px
}

// 默认列数配置
export const defaultGridColumns: GridColumnsConfig = {
  base: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
  xxl: 6,
}

// 固定的断点宽度（基于 Tailwind CSS 标准断点）
export const GRID_BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
} as const

export const gridColumns = useStorageLocal<GridColumnsConfig>(
  'gridColumns',
  ref({ ...defaultGridColumns }),
  { mergeDefaults: true },
)

// 保留旧的导出以兼容，但标记为废弃
/** @deprecated 使用 gridColumns 代替 */
export interface GridBreakpoint {
  minWidth: number
  columns: number
}

/** @deprecated 使用 defaultGridColumns 代替 */
export const defaultGridBreakpoints: GridBreakpoint[] = [
  { minWidth: 0, columns: 1 },
  { minWidth: 640, columns: 2 },
  { minWidth: 900, columns: 3 },
  { minWidth: 1200, columns: 4 },
  { minWidth: 1500, columns: 5 },
  { minWidth: 1800, columns: 6 },
]

/** @deprecated 使用 gridColumns 代替 */
export const gridBreakpoints = useStorageLocal<GridBreakpoint[]>(
  'gridBreakpoints',
  ref(defaultGridBreakpoints),
  { mergeDefaults: true },
)

export const sidePanel = useStorageLocal('sidePanel', ref<{
  home: boolean
}>({
  home: true,
}), { mergeDefaults: true })
