import '~/styles'
import 'uno.css'

import { createApp } from 'vue'

import { useDark } from '~/composables/useDark'
import { BEWLY_MOUNTED } from '~/constants/globalEvents'
import { localSettings, settings } from '~/logic'
import { setupApp } from '~/logic/common-setup'
import { useTopBarStore } from '~/stores/topBarStore'
import RESET_BEWLY_CSS from '~/styles/reset.css?raw'
import { initFavoriteDialogEnhancement } from '~/utils/favoriteDialog'
import { runWhenIdle } from '~/utils/lazyLoad'
import { getLocalWallpaper, hasLocalWallpaper, isLocalWallpaperUrl } from '~/utils/localWallpaper'
import { compareVersions, injectCSS, isHomePage, isInIframe, isNotificationPage, isVideoOrBangumiPage } from '~/utils/main'
import { applyAutoPlayByVideoType, applyDefaultDanmakuState, defaultMode, handleVideoPageNavigation, isCollectionVideo, isVideoPage, startAutoExitFullscreenMonitoring, webFullscreen, widescreen } from '~/utils/player'
import { initRandomPlay, resetRandomPlayInitialization } from '~/utils/randomPlay'
import { setupShortcutHandlers } from '~/utils/shortcuts'
import { SVG_ICONS } from '~/utils/svgIcons'
import { openLinkInBackground } from '~/utils/tabs'

import { version } from '../../package.json'
import { initAudioInterceptor, setupSettingsWatcher } from './audioInterceptor'
import { setupIframePhotoViewerDetector } from './features/iframePhotoViewerDetector'
import App from './views/App.vue'
import { initVolumeNormalizationControl } from './volumeNormalizationControl'

const isFirefox: boolean = /Firefox/i.test(navigator.userAgent)

// Fix `OverlayScrollbars` not working in Firefox
// https://github.com/fingerprintjs/fingerprintjs/issues/683#issuecomment-881210244
if (isFirefox) {
  window.requestIdleCallback = window.requestIdleCallback.bind(window)
  window.cancelIdleCallback = window.cancelIdleCallback.bind(window)
  window.requestAnimationFrame = window.requestAnimationFrame.bind(window)
  window.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
  window.setTimeout = window.setTimeout.bind(window)
  window.clearTimeout = window.clearTimeout.bind(window)
}

const currentUrl = document.URL

function isFestivalPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(document.URL)
}

function isSupportedPages(): boolean {
  if (isInIframe())
    return false
  if (
    // homepage
    isHomePage()
    // video or bangumi page
    || isVideoOrBangumiPage()
    // watchlater list page
    || /https?:\/\/(?:www\.)?bilibili\.com\/watchlater\/list.*/.test(currentUrl)
    // popular page https://www.bilibili.com/v/popular/all
    || /https?:\/\/(?:www\.)?bilibili\.com\/v\/popular\/all.*/.test(currentUrl)
    // search page
    || /https?:\/\/search\.bilibili\.com\.*/.test(currentUrl)
    // moments page
    // https://github.com/BewlyBewly/BewlyBewly/issues/1246
    // https://github.com/BewlyBewly/BewlyBewly/issues/1256
    // https://github.com/BewlyBewly/BewlyBewly/issues/1266
    // https://github.com/keleus/BewlyCat/issues/150
    || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share|\/pages\/nav).*/.test(currentUrl)
    // moment detail
    || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/.*/.test(currentUrl)
    // history page
    || /https?:\/\/(?:www\.)?bilibili\.com\/history.*/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/account\/history.*/.test(currentUrl)
    // watcher later page
    || /https?:\/\/(?:www\.)?bilibili\.com\/watchlater\/#\/list.*/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/watchlater\/list.*/.test(currentUrl)
    // user space page
    || /https?:\/\/space\.bilibili\.com\.*/.test(currentUrl)
    // notifications page
    || /https?:\/\/message\.bilibili\.com\.*/.test(currentUrl)
    // bilibili channel page b站分区页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/v\/(?!popular).*/.test(currentUrl)
    // bilibili channel page 新版本页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/c\/(?!popular).*/.test(currentUrl)
    // anime page & chinese anime page
    || /https?:\/\/(?:www\.)?bilibili\.com\/(?:anime|guochuang).*/.test(currentUrl)
    // channel page e.g. tv shows, movie, variety shows, mooc page
    || /https?:\/\/(?:www\.)?bilibili\.com\/(?:tv|movie|variety|mooc|documentary).*/.test(currentUrl)
    // article page
    || /https?:\/\/(?:www\.)?bilibili\.com\/read\/.*/.test(currentUrl)
    // 404 page
    || /^https?:\/\/(?:www\.)?bilibili\.com\/404.*$/.test(currentUrl)
    // creative center page 創作中心頁
    || /^https?:\/\/member\.bilibili\.com\/platform.*$/.test(currentUrl)
    // account settings page 帳號設定頁
    || /^https?:\/\/account\.bilibili\.com\/.*$/.test(currentUrl)
    // login page
    || /^https?:\/\/passport\.bilibili\.com\/login.*$/.test(currentUrl)
    // music center page 新歌熱榜 https://music.bilibili.com/pc/music-center/
    || /https?:\/\/music\.bilibili\.com\/pc\/music-center.*$/.test(currentUrl)
    // // blackboard 存在和B站其他页面不一样的元素，需要独立适配
    // || /https?:\/\/(?:www\.)?bilibili\.com\/blackboard.*$/.test(currentUrl)
    // // judgement 存在和B站其他页面不一样的元素，需要独立适配
    // || /https?:\/\/(?:www\.)?bilibili\.com\/judgement.*$/.test(currentUrl)
  ) {
    return true
  }
  else {
    return false
  }
}

export function isSupportedIframePages(): boolean {
  if (
    isInIframe()
    && (
      // supports Bilibili page URLs recorded in the dock
      isHomePage()
      // Since `Open in drawer` will open the video page within an iframe, so we need to support the following pages
      || isVideoOrBangumiPage()
      || /https?:\/\/search\.bilibili\.com\/all.*/.test(currentUrl)
      || /https?:\/\/www\.bilibili\.com\/anime.*/.test(currentUrl)
      || /https?:\/\/space\.bilibili\.com\/\d+\/favlist.*/.test(currentUrl)
      || /https?:\/\/www\.bilibili\.com\/history.*/.test(currentUrl)
      || /https?:\/\/www\.bilibili\.com\/watchlater\/#\/list.*/.test(currentUrl)
      || /https?:\/\/www\.bilibili\.com\/watchlater\/list.*/.test(currentUrl)
      // moments page
      // https://github.com/BewlyBewly/BewlyBewly/issues/1246
      // https://github.com/BewlyBewly/BewlyBewly/issues/1256
      // https://github.com/BewlyBewly/BewlyBewly/issues/1266
      // https://github.com/keleus/BewlyCat/issues/150
      || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share|\/pages\/nav).*/.test(currentUrl)
      // notifications page, for `Open the notifications page as a drawer`
      || isNotificationPage()
    )
  ) {
    return true
  }
  else {
    return false
  }
}

let beforeLoadedStyleEl: HTMLStyleElement | undefined
let lastUrl = location.href
let hasAppliedPlayerMode = false // 添加标志变量
let watchLaterButtonAdded = false // 标记稍后再看按钮是否已添加

if (isSupportedPages() || isSupportedIframePages()) {
  // Always use dark mode if enabled, but let useDark() handle selective application
  if (settings.value.adaptToOtherPageStyles)
    useDark()

  const shouldApplyFullStyles = settings.value.adaptToOtherPageStyles && !isFestivalPage()
  if (shouldApplyFullStyles) {
    document.documentElement.classList.add('bewly-design')

    // Setup iframe photo viewer detector (only in iframe)
    if (isInIframe())
      setupIframePhotoViewerDetector()

    // Remove the Bilibili Evolved's dark mode style
    runWhenIdle(async () => {
      const darkModeStyle = document.head.querySelector('#dark-mode')
      if (darkModeStyle)
        document.head.removeChild(darkModeStyle)
    })
  }

  else {
    document.documentElement.classList.remove('bewly-design')
  }
}

if (settings.value.adaptToOtherPageStyles && isHomePage()) {
  beforeLoadedStyleEl = injectCSS(`
    html.bewly-design {
      background-color: var(--bew-bg);
      transition: background-color 0.2s ease-in;
    }

    body {
      display: none;
    }
  `)

  // Add opacity transition effect for page loaded
  injectCSS(`
    body {
      transition: opacity 0.5s;
    }
  `)
}

window.addEventListener(BEWLY_MOUNTED, () => {
  if (beforeLoadedStyleEl) {
    document.documentElement.removeChild(beforeLoadedStyleEl)
    if (isVideoPage()) {
      // 根据设置应用默认播放器模式
      applyDefaultPlayerMode()
    }
  }
})

// 应用默认播放器模式
function applyDefaultPlayerMode() {
  if (hasAppliedPlayerMode)
    return // 如果已经应用过，直接返回

  // 检查是否处于全屏或网页全屏状态（互动视频场景）
  const isInFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
  const webFullscreenBtn = document.querySelector('.bpx-player-ctrl-web,.bilibili-player-video-web-fullscreen') as HTMLElement
  const isInWebFullscreen = webFullscreenBtn?.classList.contains('bpx-state-entered')

  // 如果播放器已经在全屏状态，跳过应用模式（避免互动视频退出全屏）
  if (isInFullscreen || isInWebFullscreen) {
    hasAppliedPlayerMode = true // 标记已应用，避免重复检查
    return
  }

  const playerMode = settings.value.defaultVideoPlayerMode

  // 检查是否为合集视频且启用了保持默认模式
  if (settings.value.keepCollectionVideoDefaultMode && isCollectionVideo()) {
    // 合集视频强制使用默认模式
    defaultMode()
  }
  else if (!playerMode || playerMode === 'default') {
    // 默认模式也需要居中显示
    defaultMode()
  }
  else {
    switch (playerMode) {
      case 'webFullscreen':
        webFullscreen()
        break
      case 'widescreen':
        widescreen()
        break
    }
  }
  setupShortcutHandlers()
  applyDefaultDanmakuState()
  // 应用自动连播设置，延迟更长时间确保播放器完全初始化
  setTimeout(() => {
    applyAutoPlayByVideoType()
  }, 2000)
  // 启动自动退出全屏监听
  setTimeout(() => {
    startAutoExitFullscreenMonitoring()
  }, 2000)
  hasAppliedPlayerMode = true // 标记已应用

  // 延迟添加稍后再看按钮
  scheduleAddWatchLaterButton()
}

// 延迟添加稍后再看按钮
function scheduleAddWatchLaterButton() {
  // 如果已经添加过或者设置未启用，直接返回
  if (watchLaterButtonAdded || !settings.value.externalWatchLaterButton) {
    return
  }

  // 等待播放器模式调整和滚动完成
  // RetryTask最多20次*500ms=10s，滚动最多3s，再加1s保险 = 14s
  // 实际上大部分情况会更快完成，这里取一个保守值
  setTimeout(() => {
    if (!watchLaterButtonAdded && settings.value.externalWatchLaterButton) {
      import('~/utils/watchLaterButton').then(({ addWatchLaterButton }) => {
        addWatchLaterButton()
        watchLaterButtonAdded = true
      }).catch(err => console.error('添加稍后再看按钮失败:', err))
    }
  }, 5000) // 5秒后添加，确保页面已完全稳定
}

// 初始化随机播放功能
function initRandomPlayFeature() {
  // 只在视频页面初始化随机播放功能
  if (isVideoPage() && settings.value.enableRandomPlay) {
    initRandomPlay()
  }
}

function checkForUrlChanges() {
  if (location.href !== lastUrl) {
    lastUrl = location.href
    hasAppliedPlayerMode = false // URL变化时重置标志
    watchLaterButtonAdded = false // URL变化时重置稍后再看按钮标志

    // 重置随机播放初始化状态，避免重复加载
    resetRandomPlayInitialization()

    if (isVideoOrBangumiPage()) {
      applyDefaultPlayerMode()
      // 如果是视频页面内部跳转，延迟执行滚动
      if (isVideoOrBangumiPage()) {
        handleVideoPageNavigation()
      }
      // 重新初始化随机播放功能
      if (isVideoPage() && settings.value.enableRandomPlay) {
        setTimeout(() => {
          initRandomPlayFeature()
        }, 2000) // 延迟2秒初始化，确保页面完全加载
      }
    }
  }
  requestAnimationFrame(checkForUrlChanges)
}
requestAnimationFrame(checkForUrlChanges)

// 处理页面可见性变化
function handleVisibilityChange() {
  // 当页面变为可见且是视频或番剧页面时，且尚未应用播放器模式
  if (document.visibilityState === 'visible'
    && (isVideoOrBangumiPage())
    && !hasAppliedPlayerMode) {
    applyDefaultPlayerMode()
  }
}

// 添加页面加载和可见性变化的监听
window.addEventListener('load', () => {
  if (isVideoPage()) {
    applyDefaultPlayerMode()
    // 初始化随机播放功能
    if (settings.value.enableRandomPlay) {
      setTimeout(() => {
        initRandomPlayFeature()
      }, 3000) // 延迟3秒初始化，确保页面完全加载
    }
  }
  else if (isVideoOrBangumiPage()) {
    applyDefaultPlayerMode()
  }

  // 添加搜索页面视频卡片点击事件处理
  if (/https?:\/\/search\.bilibili\.com\.*/.test(location.href)) {
    setupBiliVideoCardClickHandler()
  }
})

// 添加bili-video-card点击事件处理
function setupBiliVideoCardClickHandler() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement

    // 检查点击的是否是稍后再看按钮或其子元素
    const watchLaterButton = target.closest('.bili-watch-later, .bili-watch-later--wrap, .bili-watch-later__icon')
    if (watchLaterButton) {
      // 如果点击的是稍后再看按钮，延迟1秒后更新顶栏数据
      setTimeout(() => {
        // 动态导入topBarStore来更新稍后再看列表
        const topBarStore = useTopBarStore()
        topBarStore.getAllWatchLaterList()
      }, 1000)
      return
    }

    const linkElement = target.closest('.bili-video-card a, .bili-video-card__wrap a')

    if (linkElement instanceof HTMLAnchorElement) {
      event.preventDefault()

      const href = linkElement.href
      const videoCardLinkOpenMode = settings.value.videoCardLinkOpenMode

      if (videoCardLinkOpenMode === 'background') {
        // 后台打开标签页
        openLinkInBackground(href)
      }
      else {
        // 默认新标签页打开
        window.open(href, '_blank')
      }
    }
  }, true)
}
window.addEventListener('pageshow', () => {
  if ((isVideoOrBangumiPage()) && !hasAppliedPlayerMode) {
    applyDefaultPlayerMode()
  }
})
window.addEventListener('visibilitychange', handleVisibilityChange)

// Set the original Bilibili top bar to `display: none` to prevent it from showing before the load
// see: https://github.com/BewlyBewly/BewlyBewly/issues/967
const removeOriginalTopBar = injectCSS(`.bili-header, #biliMainHeader { visibility: hidden !important; }`)

async function onDOMLoaded() {
  let originalTopBar: HTMLElement | null = null

  const changeHomePage = !isInIframe() && !settings.value.useOriginalBilibiliHomepage && isHomePage()

  // Remove the original Bilibili homepage if in Bilibili homepage & useOriginalBilibiliHomepage is enabled
  if (changeHomePage) {
    originalTopBar = document.querySelector<HTMLElement>('.bili-header')
    const originalTopBarInnerUselessContents = document.querySelectorAll<HTMLElement>('.bili-header > *:not(.bili-header__bar)')

    if (originalTopBar) {
      // always show the background on the original bilibili top bar
      originalTopBar.querySelector('.bili-header__bar')?.classList.add('slide-down')
    }

    // Remove the original Bilibili homepage if in Bilibili homepage & useOriginalBilibiliHomepage is enabled
    document.body.innerHTML = ''

    // Remove the Bilibili Evolved homepage & Bilibili-Gate homepage
    injectCSS(`
      .home-redesign-base, .bilibili-gate-root {
        display: none !important;
      }
    `)

    if (originalTopBarInnerUselessContents)
      originalTopBarInnerUselessContents.forEach(item => (item as HTMLElement).style.display = 'none')
    if (originalTopBar)
      document.body.appendChild(originalTopBar)
  }

  if (isSupportedPages() || isSupportedIframePages()) {
    // Then inject the app
    if (isHomePage()) {
      injectApp()
    }
    else {
      await injectAppWhenIdle()
    }
  }

  // Reset the original Bilibili top bar display style
  if (removeOriginalTopBar)
    document.documentElement.removeChild(removeOriginalTopBar)

  // Initialize Audio Interceptor
  initAudioInterceptor()
  setupSettingsWatcher()
  initVolumeNormalizationControl()

  // Initialize Favorite Dialog Enhancement (for video pages)
  if (isVideoOrBangumiPage()) {
    initFavoriteDialogEnhancement()
  }
}

if (document.readyState !== 'loading')
  onDOMLoaded()
else
  document.addEventListener('DOMContentLoaded', () => onDOMLoaded())

function injectAppWhenIdle() {
  return new Promise<void>((resolve) => {
    // Inject app when idle
    runWhenIdle(async () => {
      injectApp()
      resolve()
    })
  })
}

function injectApp() {
  const bewlyElArr: NodeListOf<Element> = document.querySelectorAll('#bewly')
  if (bewlyElArr.length > 0) {
    bewlyElArr.forEach((el: Element) => {
      const elVersion = el.getAttribute('data-version') || '0.0.0'
      const elIsDev = el.getAttribute('data-dev') === 'true'

      // Remove bewly element if the version is less than the current version
      if (compareVersions(elVersion, version) < 0)
        el.remove()
      // Only the development mode element remains
      else if (!elIsDev)
        el.remove()
    })
  }

  // mount component to context window
  const container = document.createElement('div')
  container.id = 'bewly'
  container.setAttribute('data-version', version)
  container.setAttribute('data-dev', import.meta.env.DEV ? 'true' : 'false')

  // 立即设置Shadow DOM容器的基准颜色，确保Vue组件能够访问到正确的CSS变量
  if (settings.value.darkModeBaseColor) {
    container.style.setProperty('--bew-dark-base-color', settings.value.darkModeBaseColor)
  }

  const root = document.createElement('div')
  const styleEl = document.createElement('link')
  // Fix #69 https://github.com/hakadao/BewlyBewly/issues/69
  // https://medium.com/@emilio_martinez/shadow-dom-open-vs-closed-1a8cf286088a - open shadow dom
  const shadowDOM = container.attachShadow?.({ mode: 'open' }) || container
  const resetStyleEl = document.createElement('style')
  resetStyleEl.textContent = `${RESET_BEWLY_CSS}`
  styleEl.setAttribute('rel', 'stylesheet')
  styleEl.setAttribute('href', browser.runtime.getURL('dist/contentScripts/style.css'))
  shadowDOM.appendChild(resetStyleEl)
  shadowDOM.appendChild(styleEl)
  shadowDOM.appendChild(root)
  container.style.opacity = '0'
  container.style.transition = 'opacity 0.5s'
  styleEl.onload = () => {
    // To prevent abrupt style transitions caused by sudden style changes
    setTimeout(() => {
      container.style.opacity = '1'
    }, 500)
  }

  // startShadowDOMStyleInjection()

  // inject svg icons
  const svgDiv = document.createElement('div')
  svgDiv.innerHTML = SVG_ICONS
  shadowDOM.appendChild(svgDiv)

  document.body.appendChild(container)

  const app = createApp(App)
  setupApp(app)
  app.mount(root)
}

// 发送设置更新到网页环境
function sendSettingsToPage(settings: any) {
  // 将响应式对象转换为普通对象
  const serializedSettings = JSON.parse(JSON.stringify(settings))
  window.postMessage({
    type: 'BEWLY_SETTINGS_UPDATE',
    data: serializedSettings,
  }, '*')
}

// 监听设置变化
watch(settings, (newSettings, oldSettings) => {
  sendSettingsToPage(newSettings)

  // 监听随机播放设置变化
  if (newSettings.enableRandomPlay !== undefined) {
    if (isVideoPage()) {
      if (newSettings.enableRandomPlay) {
        // 启用随机播放
        setTimeout(() => {
          initRandomPlayFeature()
        }, 1000)
      }
      else {
        // 禁用随机播放，重置状态
        resetRandomPlayInitialization()
      }
    }
  }

  // 监听自动播放设置变化
  if (isVideoPage()) {
    // 检查自动播放相关设置是否发生变化
    const autoPlaySettingsChanged = oldSettings && (
      newSettings.autoPlayMultipart !== oldSettings.autoPlayMultipart
      || newSettings.autoPlayCollection !== oldSettings.autoPlayCollection
      || newSettings.autoPlayRecommend !== oldSettings.autoPlayRecommend
      || newSettings.autoPlayPlaylist !== oldSettings.autoPlayPlaylist
    )

    if (autoPlaySettingsChanged) {
      // 自动播放设置发生变化，同步更新页面上的自动播放开关
      // 延迟时间增加，确保页面元素已经渲染
      setTimeout(() => {
        applyAutoPlayByVideoType()
      }, 1000)
    }
  }

  // 监听稍后再看按钮外置设置变化
  if (isVideoPage() && oldSettings) {
    if (newSettings.externalWatchLaterButton !== oldSettings.externalWatchLaterButton) {
      if (newSettings.externalWatchLaterButton) {
        // 启用稍后再看按钮
        watchLaterButtonAdded = false // 重置标志
        scheduleAddWatchLaterButton()
      }
      else {
        // 移除稍后再看按钮
        const existingButton = document.querySelector('.bewly-watch-later-btn')
        if (existingButton) {
          existingButton.remove()
          watchLaterButtonAdded = false
        }
      }
    }
  }
}, { deep: true })

// 监听来自网页环境的请求
window.addEventListener('message', (event) => {
  if (event.source !== window)
    return

  const { type } = event.data

  if (type === 'BEWLY_REQUEST_SETTINGS') {
    // 发送当前设置到网页环境
    sendSettingsToPage(settings.value)
  }
})

// 监听来自父页面的黑暗模式切换消息（用于iframe跨域场景）
window.addEventListener('message', (event) => {
  if (event.source !== window.parent)
    return

  const { type, isDark, darkModeBaseColor } = event.data

  if (type === 'iframeDarkModeChange') {
    // Check if we should apply selective dark mode (plugin UI only) on festival pages
    const isSelectiveDark = isFestivalPage()

    if (isDark) {
      // Always apply to plugin container if it exists
      const bewlyElement = document.querySelector('#bewly')
      if (bewlyElement) {
        bewlyElement.classList.add('dark')
      }

      // Only apply global styles if not on festival pages
      if (!isSelectiveDark) {
        document.documentElement.classList.add('dark')
        document.body?.classList.add('dark')
      }

      // 如果提供了深色模式基准颜色，则应用它
      if (darkModeBaseColor) {
        document.documentElement.style.setProperty('--bew-dark-base-color', darkModeBaseColor)
      }
    }
    else {
      const bewlyElement = document.querySelector('#bewly')
      if (bewlyElement) {
        bewlyElement.classList.remove('dark')
      }

      // Only remove global classes if not in selective mode
      if (!isSelectiveDark) {
        document.documentElement.classList.remove('dark')
        document.body?.classList.remove('dark')
      }
    }
  }
}, { passive: true })

// 验证和恢复本地壁纸
function validateAndRestoreLocalWallpaper() {
  const localWallpaper = localSettings.value.locallyUploadedWallpaper
  if (localWallpaper?.isLocal && localWallpaper.id) {
    if (!hasLocalWallpaper(localWallpaper.id)) {
      localSettings.value.locallyUploadedWallpaper = null

      // 如果当前壁纸使用的是丢失的本地壁纸，也清理掉
      if (isLocalWallpaperUrl(settings.value.wallpaper)) {
        settings.value.wallpaper = ''
      }
      if (isLocalWallpaperUrl(settings.value.searchPageWallpaper)) {
        settings.value.searchPageWallpaper = ''
      }
    }
    else {
      // 如果本地壁纸存在，确保当前壁纸URL使用正确的格式
      const expectedUrl = `local-wallpaper:${localWallpaper.id}`
      const base64Data = getLocalWallpaper(localWallpaper.id)

      if (base64Data) {
        // 检查当前壁纸是否需要更新格式（从旧的base64格式迁移到新格式）
        if (settings.value.wallpaper.startsWith('data:image/') && settings.value.wallpaper === base64Data) {
          settings.value.wallpaper = expectedUrl
        }
        if (settings.value.searchPageWallpaper.startsWith('data:image/') && settings.value.searchPageWallpaper === base64Data) {
          settings.value.searchPageWallpaper = expectedUrl
        }
      }
    }
  }
}

// 在应用启动时验证本地壁纸
validateAndRestoreLocalWallpaper()
