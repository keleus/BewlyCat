import '~/styles'
import 'uno.css'

import { createApp } from 'vue'

import { useDark } from '~/composables/useDark'
import { CONTENT_SCRIPT_PING, CONTENT_SCRIPT_PONG } from '~/constants/contentScript'
import { BEWLY_MOUNTED, IFRAME_DARK_MODE_CHANGE, IFRAME_TOP_BAR_CHANGE } from '~/constants/globalEvents'
import { localSettings, settings, settingsReady } from '~/logic'
import { setupApp } from '~/logic/common-setup'
import { useTopBarStore } from '~/stores/topBarStore'
import RESET_BEWLY_CSS from '~/styles/reset.css?raw'
import api from '~/utils/api'
import { applyBewlyWidescreen, exitBewlyWidescreen, isBewlyWidescreenActive, prepareBewlyWidescreenLoading } from '~/utils/bewlyWidescreen'
import { cleanupBilibiliScripts } from '~/utils/bilibiliScriptCleanup'
import { captureOriginalBilibiliTopBar, ensureOriginalBilibiliTopBarAppended, resetBilibiliTopBarInlineStyles, setupLoginButtonClickHandlers, shouldShowOriginalBilibiliTopBar } from '~/utils/bilibiliTopBar'
import { initFavoriteDialogEnhancement } from '~/utils/favoriteDialog'
import { i18n } from '~/utils/i18n'
import { runWhenIdle } from '~/utils/lazyLoad'
import { getLocalWallpaper, hasLocalWallpaper, isLocalWallpaperUrl } from '~/utils/localWallpaper'
import { compareVersions, getCookie, injectCSS, isElectron, isHomePage, isInIframe, isNotificationPage, isVideoOrBangumiPage, isVideoPlaybackPage, isWatchLaterListPage } from '~/utils/main'
import { initNativeFavoriteSeasonPlayAllIntercept } from '~/utils/nativeFavoriteSeasonPlayAll'
import { createPageSettingsPayload } from '~/utils/pageSettingsProtocol'
import { applyAutoPlayByVideoType, applyDefaultCaptionState, applyDefaultDanmakuState, applyRememberedPlaybackRate, defaultMode, getVideoElement, handleVideoPageNavigation, isPlayerDisplayModeReady, isVideoPage, resetAutoPlayUserChangeFlag, resolveDefaultVideoPlayerMode, startAutoExitFullscreenMonitoring, startAutoPlayUserChangeMonitoring, startPlaybackRateMonitoring, webFullscreen, widescreen } from '~/utils/player'
import { applyPreservedOrDefaultCustomPlay, applyRandomPlayActivationSettings, destroyRandomPlay, initRandomPlay, isCustomPlayPage, resetRandomPlayInitialization, syncRandomPlayOrder, syncRandomPlayUI } from '~/utils/randomPlay'
import { getPluginSearchResultsUrl, navigateToPluginSearchResultsInPlace, openSearchResults, shouldUsePluginSearchResultsPage } from '~/utils/searchNavigation'
import { setupShortcutHandlers } from '~/utils/shortcuts'
import { SVG_ICONS } from '~/utils/svgIcons'
import { openLinkInBackground } from '~/utils/tabs'
import { initVerticalVideoZoom, resetVerticalVideoZoom } from '~/utils/verticalVideoZoom'
import { recordVideoVisitFromUrl } from '~/utils/videoVisitHistory'
import { ensureResponsiveViewport } from '~/utils/viewportMeta'

import { version } from '../../package.json'
import { initBewlyWidescreenControl } from './bewlyWidescreenControl'
import { setupIframePhotoViewerDetector } from './features/iframePhotoViewerDetector'
import { setupNotificationStateInvalidation } from './features/notificationStateInvalidation'
import { setupOpusDetailDrawerLayout } from './features/opusDetailDrawerLayout'
import { initTouchPlayerGestures } from './touchPlayerGestures'
import { initVideoAspectRatioMemory } from './videoAspectRatioMemory'
import { initVideoScreenshotControl } from './videoScreenshotControl'
import App from './views/App.vue'

type BewlyHostElement = HTMLElement & {
  __bewlyCatDisposeApp__?: () => void
}

function disposeBewlyHost(element: Element) {
  const host = element as BewlyHostElement
  host.__bewlyCatDisposeApp__?.()
  host.remove()
}

const contentScriptGlobal = globalThis as typeof globalThis & {
  __BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__?: boolean
}
const shouldInitializeContentScript = !contentScriptGlobal.__BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__

if (shouldInitializeContentScript) {
  contentScriptGlobal.__BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__ = true
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message === 'object' && message !== null && 'type' in message && message.type === CONTENT_SCRIPT_PING)
      return Promise.resolve({ type: CONTENT_SCRIPT_PONG, version })

    return false
  })
}

const isFirefox: boolean = /Firefox/i.test(navigator.userAgent)
const isElectronEnv = isElectron()

const currentUrl = document.URL

if (shouldInitializeContentScript && isHomePage()) {
  console.log('[BewlyCat][首页加载] 插件开始加载', {
    time: new Date().toLocaleString(),
    version,
  })
}

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
    // watch later list page
    || isWatchLaterListPage(currentUrl)
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
      || isWatchLaterListPage(currentUrl)
      // moments page
      // https://github.com/BewlyBewly/BewlyBewly/issues/1246
      // https://github.com/BewlyBewly/BewlyBewly/issues/1256
      // https://github.com/BewlyBewly/BewlyBewly/issues/1266
      // https://github.com/keleus/BewlyCat/issues/150
      || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share|\/pages\/nav).*/.test(currentUrl)
      // moment detail (opus)
      || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/.*/.test(currentUrl)
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

if (isElectronEnv) {
  console.warn('[BewlyCat] Detected Electron environment, extension disabled.')
}
else if (shouldInitializeContentScript) {
  const playerModeLoadSettleDelay = 500
  const videoOwnerAvatarReadyTimeout = 8000
  const videoOwnerAvatarSelector = [
    '.up-panel-container .up-avatar-wrap img.bili-avatar-img',
    '.up-panel-container .up-avatar-wrap img',
    '.up-panel-container .up-avatar img.bili-avatar-img',
    '.up-panel-container .up-avatar img',
    '.up-panel-container .bili-avatar-face img',
    '.up-panel-container img[src*="/face/"]',
    '.up-info-container .up-avatar-wrap img',
    '.up-info-container .up-avatar img',
    '.up-info-container .bili-avatar-face img',
    '#v_upinfo .u-face img',
    '.up-info .u-face img',
    '.up-info .up-face img',
    '.upinfo .u-face img',
    '.upinfo .face img',
  ].join(',')
  setupNotificationStateInvalidation()
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

  let beforeLoadedStyleEl: HTMLStyleElement | undefined
  let beforeLoadedStyleFailsafeTimer: ReturnType<typeof setTimeout> | undefined
  let lastUrl = location.href
  let lastVideoNavigationKey = getVideoNavigationKey(location.href)
  let lastAppliedPlayerModeNavigationKey: string | undefined
  let playerModeReadyAfter = document.readyState === 'complete'
    ? Date.now() + playerModeLoadSettleDelay
    : Number.POSITIVE_INFINITY
  let playerModeRetryTimer: ReturnType<typeof setTimeout> | undefined
  let playbackBehaviorTimer: ReturnType<typeof setTimeout> | undefined
  let playbackBehaviorScheduledForKey: string | undefined
  let playerModeSettingsReady = false
  let videoOwnerAvatarReadyDeadline = document.readyState === 'complete'
    ? Date.now() + videoOwnerAvatarReadyTimeout
    : Number.POSITIVE_INFINITY
  let pendingWidescreenReloadNavigationKey: string | undefined
  let pendingWidescreenReloadTimer: ReturnType<typeof setTimeout> | undefined
  let autoContinuationNavigationKey: string | undefined
  let lastVideoEndedAt = 0
  let urlChangeCheckQueued = false
  let playerModeResumeQueued = false
  let watchLaterButtonAdded = false // 标记稍后再看按钮是否已添加

  // 设置水合后立即同步 i18n 语言。宽屏遮罩等轻 DOM 元素在 App 挂载前就会
  // 用 t() 渲染一次性文案，若等到 App.vue 里的语言 watcher 才切换 locale，
  // 这些元素会以默认英文显示。Promise 回调按注册顺序执行，需先于下方
  // applyDefaultPlayerMode 的回调注册。
  void settingsReady.then(() => {
    if (settings.value.language)
      i18n.global.locale.value = settings.value.language
  })

  void settingsReady.then(() => {
    playerModeSettingsReady = true
    recordVideoVisitFromUrl(lastUrl)
    applyDefaultPlayerMode()
  })

  function setupPluginSearchLinkNavigation() {
    document.addEventListener('click', (event) => {
      if (!shouldUsePluginSearchResultsPage() || !getCookie('DedeUserID'))
        return

      // 评论区等 B 站 Web Component 会把点击目标重新指向 Shadow Host，
      // 需要从完整事件路径中找到实际的搜索链接。
      const anchor = event.composedPath().find(
        (target): target is HTMLAnchorElement => target instanceof HTMLAnchorElement && target.hasAttribute('href'),
      ) ?? (event.target instanceof Element ? event.target.closest('a[href]') : null)
      if (!(anchor instanceof HTMLAnchorElement))
        return

      if (anchor.closest('.bili-header, #biliMainHeader, #internationalHeader, #bili-header-container'))
        return

      const pluginSearchResultsUrl = getPluginSearchResultsUrl(anchor.href)
      if (!pluginSearchResultsUrl)
        return

      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        anchor.href = pluginSearchResultsUrl
        return
      }

      const keyword = new URL(pluginSearchResultsUrl).searchParams.get('keyword')
      if (!keyword)
        return

      event.preventDefault()
      event.stopPropagation()
      // 就地打开模式仍原地切到插件搜索结果页；新标签页 / 后台标签页模式按「搜索栏链接打开行为」打开
      if (!navigateToPluginSearchResultsInPlace(keyword))
        openSearchResults(keyword)
    }, true)
  }

  void settingsReady.then(() => setupPluginSearchLinkNavigation())

  function shouldApplyBewlyDesign() {
    if (settings.value.adaptToOtherPageStyles)
      return !isFestivalPage()

    return settings.value.videoPageDarkMode && isVideoPlaybackPage()
  }

  function shouldApplyVideoPageDarkOnly() {
    return !settings.value.adaptToOtherPageStyles
      && settings.value.videoPageDarkMode
      && isVideoPlaybackPage()
  }

  function applyBewlyDesignClasses() {
    const shouldApply = shouldApplyBewlyDesign()
    document.documentElement.classList.toggle('bewly-design', shouldApply)
    document.documentElement.classList.toggle('bewly-video-dark-only', shouldApplyVideoPageDarkOnly())
    return shouldApply
  }

  if (isSupportedPages() || isSupportedIframePages()) {
    if (settings.value.adaptToOtherPageStyles || settings.value.videoPageDarkMode)
      useDark()

    const shouldApplyFullStyles = applyBewlyDesignClasses()

    // opus 详情分栏布局不依赖“适配其他页样式”，只要在 iframe 内就尝试重排
    if (isInIframe())
      setupOpusDetailDrawerLayout()

    if (shouldApplyFullStyles) {
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
  }

  // 挂载完成与保险丝两条路径共用的清理，重复调用无副作用
  function removeBeforeLoadedStyleEl() {
    beforeLoadedStyleEl?.remove()
    beforeLoadedStyleEl = undefined
    clearTimeout(beforeLoadedStyleFailsafeTimer)
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
    // Failsafe: never keep the page hidden for too long.
    beforeLoadedStyleFailsafeTimer = setTimeout(removeBeforeLoadedStyleEl, 4000)
  }

  window.addEventListener(BEWLY_MOUNTED, () => {
    removeBeforeLoadedStyleEl()
    // 根据设置应用默认播放器模式
    if (isVideoPage())
      applyDefaultPlayerMode()
  })

  // 应用默认播放器模式
  function isVideoOwnerAvatarReady() {
    return Array.from(document.querySelectorAll<HTMLImageElement>(videoOwnerAvatarSelector)).some((image) => {
      if (!image.isConnected || !image.complete || image.naturalWidth <= 0)
        return false

      const rect = image.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0)
        return false

      const style = getComputedStyle(image)
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
    })
  }

  function clearPlaybackBehaviorTimer() {
    if (playbackBehaviorTimer) {
      clearTimeout(playbackBehaviorTimer)
      playbackBehaviorTimer = undefined
    }
    playbackBehaviorScheduledForKey = undefined
  }

  // 默认播放器模式之后的唯一结束行为入口：先恢复上一集调过的自定义播放，再套自动连播。
  function applyEndPlaybackBehavior() {
    if (isCustomPlayPage() && settings.value.enableRandomPlay) {
      initRandomPlayFeature()
      applyPreservedOrDefaultCustomPlay()
      return
    }

    applyAutoPlayByVideoType()
  }

  function schedulePlaybackBehaviorApply() {
    const navigationKey = getVideoNavigationKey(location.href)
    if (playbackBehaviorScheduledForKey === navigationKey)
      return

    playbackBehaviorScheduledForKey = navigationKey
    if (playbackBehaviorTimer)
      clearTimeout(playbackBehaviorTimer)
    playbackBehaviorTimer = setTimeout(() => {
      playbackBehaviorTimer = undefined
      applyEndPlaybackBehavior()
      startAutoExitFullscreenMonitoring()
    }, 2000)
  }

  function applyPlayerModeCompanionSettings() {
    setupShortcutHandlers()
    applyDefaultDanmakuState()
    applyDefaultCaptionState()
    applyRememberedPlaybackRate()
    startPlaybackRateMonitoring()
    if (settings.value.showVerticalVideoZoomButton)
      initVerticalVideoZoom()
    else
      resetVerticalVideoZoom()

    schedulePlaybackBehaviorApply()
    scheduleAddWatchLaterButton()
  }

  function applyDefaultPlayerMode() {
    if (!isVideoOrBangumiPage()) {
      clearPlayerModeRetry()
      clearPlaybackBehaviorTimer()
      exitBewlyWidescreen()
      return
    }

    // 后台新标签页中，load / pageshow 可能早于 B 站播放器和评论组件恢复。
    // 先等设置和可见状态，默认 Bewly 宽屏则立即用遮罩盖住原始布局。
    if (!playerModeSettingsReady
      || document.visibilityState !== 'visible') {
      clearPlayerModeRetry()
      return
    }

    const currentNavigationKey = getVideoNavigationKey(location.href)
    if (lastAppliedPlayerModeNavigationKey === currentNavigationKey)
      return

    let targetPlayerMode = resolveDefaultVideoPlayerMode()
    if (isFestivalPage() && targetPlayerMode === 'bewlyWidescreen')
      targetPlayerMode = 'widescreen'

    const isInFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
    const webFullscreenBtn = document.querySelector('.bpx-player-ctrl-web,.bilibili-player-video-web-fullscreen') as HTMLElement
    const isInWebFullscreen = webFullscreenBtn?.classList.contains('bpx-state-entered')

    if (targetPlayerMode === 'bewlyWidescreen' && !isInFullscreen && !isInWebFullscreen) {
      prepareBewlyWidescreenLoading()
    }
    else if (!isBewlyWidescreenActive()) {
      exitBewlyWidescreen()
    }

    if (document.readyState !== 'complete') {
      clearPlayerModeRetry()
      return
    }

    const settleDelay = playerModeReadyAfter - Date.now()
    if (settleDelay > 0) {
      schedulePlaybackBehaviorApply()
      schedulePlayerModeRetry(settleDelay)
      return
    }

    // 普通视频页以 UP 主头像完成图片加载和布局作为 B 站主体渲染完成信号。
    // 番剧、活动页等可能没有该头像；普通视频异常时也在超时后继续，避免永久阻塞。
    if (isVideoPage()
      && Date.now() < videoOwnerAvatarReadyDeadline
      && !isVideoOwnerAvatarReady()) {
      schedulePlaybackBehaviorApply()
      schedulePlayerModeRetry()
      return
    }

    // 如果播放器已经在全屏状态，跳过应用模式（避免互动视频退出全屏）
    if (isInFullscreen || isInWebFullscreen) {
      exitBewlyWidescreen()
      autoContinuationNavigationKey = undefined
      applyPlayerModeCompanionSettings()
      lastAppliedPlayerModeNavigationKey = currentNavigationKey
      return
    }

    if (!isPlayerDisplayModeReady(targetPlayerMode)) {
      schedulePlaybackBehaviorApply()
      schedulePlayerModeRetry()
      return
    }

    clearPlayerModeRetry()

    if (!targetPlayerMode || targetPlayerMode === 'default') {
    // 默认模式也需要居中显示
      defaultMode()
    }
    else {
      switch (targetPlayerMode) {
        case 'bewlyWidescreen':
          applyBewlyWidescreen(
            settings.value.bewlyWidescreenSidebarPosition || 'right',
            // 遮罩已在等待阶段挂载，并保持到宽屏布局完成。
            false,
          )
          break
        case 'webFullscreen':
          webFullscreen()
          break
        case 'widescreen':
          widescreen()
          break
      }
    }
    applyPlayerModeCompanionSettings()
    lastAppliedPlayerModeNavigationKey = currentNavigationKey
    autoContinuationNavigationKey = undefined
    lastVideoEndedAt = 0
  }

  function clearPlayerModeRetry() {
    if (playerModeRetryTimer) {
      clearTimeout(playerModeRetryTimer)
      playerModeRetryTimer = undefined
    }
  }

  function schedulePlayerModeRetry(delay?: number) {
    if (playerModeRetryTimer)
      return

    playerModeRetryTimer = setTimeout(() => {
      playerModeRetryTimer = undefined
      applyDefaultPlayerMode()
    }, delay ?? 500)
  }

  function waitForPlayerModePageSettle() {
    clearPlayerModeRetry()
    clearPlaybackBehaviorTimer()
    playerModeReadyAfter = Date.now() + playerModeLoadSettleDelay
    videoOwnerAvatarReadyDeadline = Date.now() + videoOwnerAvatarReadyTimeout
  }

  // 添加稍后再看按钮
  function scheduleAddWatchLaterButton() {
  // 如果已经添加过或者设置未启用，直接返回
    if (watchLaterButtonAdded || !settings.value.externalWatchLaterButton) {
      return
    }

    // 与其他播放器伴随设置在同一时间线触发；实际挂载时机由工具栏 DOM 就绪决定
    // （见 mountWatchLaterButtonWhenToolbarReady），不再盲等固定延迟
    import('~/utils/watchLaterButton')
      .then(({ mountWatchLaterButtonWhenToolbarReady }) => mountWatchLaterButtonWhenToolbarReady())
      .then((added) => {
        watchLaterButtonAdded = added
      })
      .catch(err => console.error('添加稍后再看按钮失败:', err))
  }

  // 初始化随机播放功能
  function initRandomPlayFeature() {
  // 只在视频页面初始化随机播放功能
    if (isCustomPlayPage() && settings.value.enableRandomPlay) {
      initRandomPlay()
    }
  }

  function getVideoNavigationKey(url: string) {
    try {
      const urlObj = new URL(url)
      if (!isVideoOrBangumiPage(urlObj.href))
        return ''

      const semanticParams = [
        'avid',
        'bvid',
        'cid',
        'ep_id',
        'p',
        'page',
        'season_id',
      ]
      const params = new URLSearchParams()

      for (const param of semanticParams) {
        const value = urlObj.searchParams.get(param)
        if (value !== null)
          params.set(param, value)
      }

      const query = params.toString()
      return `${urlObj.origin}${urlObj.pathname}${query ? `?${query}` : ''}`
    }
    catch {
      return url.split('?')[0].split('#')[0]
    }
  }

  function getPushStateTargetUrl(event: Event) {
    if (!(event instanceof CustomEvent) || !Array.isArray(event.detail))
      return null

    const targetUrl = event.detail[2]
    if (typeof targetUrl !== 'string' && !(targetUrl instanceof URL))
      return null

    try {
      return new URL(String(targetUrl), location.href).href
    }
    catch {
      return null
    }
  }

  function clearPendingWidescreenReloadNavigation() {
    pendingWidescreenReloadNavigationKey = undefined
    if (pendingWidescreenReloadTimer) {
      clearTimeout(pendingWidescreenReloadTimer)
      pendingWidescreenReloadTimer = undefined
    }
  }

  const commentRootSelector = '#commentapp, #comment-module, #comment-body, .commentapp, .comment-container, .bili-comment-container, .bb-comment'
  const widescreenCommentReloadRetryInterval = 250
  const widescreenCommentReloadRetryTimeout = 10_000
  let widescreenCommentReloadRequestId = 0

  type VideoCommentIdentifier = { bvid: string } | { aid: string }

  function getVideoCommentIdentifier(url = location.href): VideoCommentIdentifier | null {
    try {
      const urlObj = new URL(url)

      const queryBvid = urlObj.searchParams.get('bvid')
      if (queryBvid && /^BV[0-9A-Za-z]+$/.test(queryBvid))
        return { bvid: queryBvid }

      const queryAid = urlObj.searchParams.get('avid') ?? urlObj.searchParams.get('aid')
      if (queryAid && /^\d+$/.test(queryAid)) {
        const aid = Number(queryAid)
        if (Number.isSafeInteger(aid) && aid > 0)
          return { aid: String(aid) }
      }

      if (!/^\/video\//.test(urlObj.pathname))
        return null

      const bvidPathMatch = urlObj.pathname.match(/^\/video\/(BV[0-9A-Za-z]+)(?:\/|$)/)
      if (bvidPathMatch)
        return { bvid: bvidPathMatch[1] }

      const aidPathMatch = urlObj.pathname.match(/^\/video\/av(\d+)(?:\/|$)/i)
      if (aidPathMatch) {
        const aid = Number(aidPathMatch[1])
        if (Number.isSafeInteger(aid) && aid > 0)
          return { aid: String(aid) }
      }

      return null
    }
    catch {
      return null
    }
  }

  function getCommentParamsWithAid(element: Element, aid: number): string | null {
    const currentParams = element.getAttribute('data-params')
    if (!currentParams)
      return null

    const params = currentParams.split(',')
    if (params.length < 2 || !/^\d+$/.test(params[1].trim()))
      return null

    params[1] = String(aid)
    return params.join(',')
  }

  function findVideoCommentsElement(): HTMLElement | null {
    const commentRoot = document.querySelector<HTMLElement>(commentRootSelector)
    if (!commentRoot)
      return null

    return commentRoot.querySelector<HTMLElement>(':scope > bili-comments')
      ?? commentRoot.querySelector<HTMLElement>('bili-comments')
  }

  function replaceVideoCommentsElement(element: HTMLElement, dataParams: string) {
    const replacement = document.createElement(element.tagName.toLowerCase())
    for (const attribute of Array.from(element.attributes))
      replacement.setAttribute(attribute.name, attribute.value)
    replacement.setAttribute('data-params', dataParams)
    element.replaceWith(replacement)
  }

  async function reloadCommentsForWidescreenNavigation(targetNavigationKey: string, requestId: number, identifier: VideoCommentIdentifier) {
    let response: any
    try {
      response = await api.video.getVideoInfo(identifier)
    }
    catch {
      return
    }

    if (requestId !== widescreenCommentReloadRequestId
      || getVideoNavigationKey(location.href) !== targetNavigationKey
      || response?.code !== 0) {
      return
    }

    const aid = Number(response.data?.aid)
    if (!Number.isSafeInteger(aid) || aid <= 0)
      return

    const deadline = Date.now() + widescreenCommentReloadRetryTimeout
    const retryUntilCommentReady = () => {
      if (requestId !== widescreenCommentReloadRequestId
        || getVideoNavigationKey(location.href) !== targetNavigationKey) {
        return
      }

      const comments = findVideoCommentsElement()
      if (comments) {
        const nextParams = getCommentParamsWithAid(comments, aid)
        if (nextParams) {
          const currentParams = comments.getAttribute('data-params')
          const currentAid = Number(currentParams?.split(',')[1]?.trim())
          if (Number.isSafeInteger(currentAid) && currentAid === aid)
            return

          replaceVideoCommentsElement(comments, nextParams)
          return
        }
      }

      if (Date.now() < deadline)
        window.setTimeout(retryUntilCommentReady, widescreenCommentReloadRetryInterval)
    }

    retryUntilCommentReady()
  }

  function prepareVideoNavigationBeforeRouteChange(event: Event) {
    const wasBewlyWidescreenActive = isBewlyWidescreenActive()
    if (!wasBewlyWidescreenActive)
      return

    const targetUrl = getPushStateTargetUrl(event)
    if (!targetUrl)
      return

    const currentNavigationKey = getVideoNavigationKey(location.href)
    const nextNavigationKey = getVideoNavigationKey(targetUrl)
    if (!nextNavigationKey || nextNavigationKey === currentNavigationKey)
      return

    clearPendingWidescreenReloadNavigation()
    pendingWidescreenReloadNavigationKey = nextNavigationKey
    const video = getVideoElement()
    const remainingPlaybackTime = video && Number.isFinite(video.duration)
      ? video.duration - video.currentTime
      : Number.POSITIVE_INFINITY
    autoContinuationNavigationKey = video?.ended || remainingPlaybackTime <= 1
      ? nextNavigationKey
      : undefined
    pendingWidescreenReloadTimer = setTimeout(() => {
      pendingWidescreenReloadNavigationKey = undefined
      pendingWidescreenReloadTimer = undefined
    }, 5000)
    clearPlayerModeRetry()
    // 先退出宽屏，再让 B 站执行原本的 SPA 路由切换；真正 URL 变化后由
    // checkForUrlChanges 复用 SPA 路由并按需重载评论区。
    exitBewlyWidescreen()
  }

  function checkForUrlChanges() {
    urlChangeCheckQueued = false
    if (location.href !== lastUrl) {
      const navigationRequestId = ++widescreenCommentReloadRequestId
      const currentVideoNavigationKey = getVideoNavigationKey(location.href)
      const isMeaningfulVideoNavigation = currentVideoNavigationKey !== lastVideoNavigationKey

      lastUrl = location.href
      lastVideoNavigationKey = currentVideoNavigationKey
      recordVideoVisitFromUrl(lastUrl)
      applyBewlyDesignClasses()

      if (!isVideoOrBangumiPage()) {
        clearPendingWidescreenReloadNavigation()
        exitBewlyWidescreen()
        autoContinuationNavigationKey = undefined
        lastAppliedPlayerModeNavigationKey = undefined
      }

      if (isVideoOrBangumiPage()) {
        if (!isMeaningfulVideoNavigation) {
          clearPendingWidescreenReloadNavigation()
          autoContinuationNavigationKey = undefined
          return
        }

        if (!autoContinuationNavigationKey && Date.now() - lastVideoEndedAt <= 5000)
          autoContinuationNavigationKey = currentVideoNavigationKey
        if (autoContinuationNavigationKey !== currentVideoNavigationKey)
          autoContinuationNavigationKey = undefined

        const shouldReloadWidescreenNavigation = pendingWidescreenReloadNavigationKey === currentVideoNavigationKey
          || isBewlyWidescreenActive()
        const videoCommentIdentifier = shouldReloadWidescreenNavigation
          ? getVideoCommentIdentifier()
          : null
        clearPendingWidescreenReloadNavigation()

        if (shouldReloadWidescreenNavigation && !videoCommentIdentifier) {
          exitBewlyWidescreen()
          // 评论区无法可靠映射到视频 ID 时保留完整刷新兜底，避免宽屏 SPA
          // 切换后继续复用旧评论组件（例如番剧页面或异常 URL）。
          window.location.reload()
          return
        }

        exitBewlyWidescreen()
        resetVerticalVideoZoom()
        waitForPlayerModePageSettle()
        document.querySelector('.bewly-watch-later-btn')?.remove()
        watchLaterButtonAdded = false // URL变化时重置稍后再看按钮标志
        // 手动修改只覆盖当前视频；切集后重新应用扩展配置，避免播放器重建时开关复位。
        resetAutoPlayUserChangeFlag()

        // 重置随机播放初始化状态，避免重复加载
        resetRandomPlayInitialization()

        applyDefaultPlayerMode()
        if (videoCommentIdentifier)
          void reloadCommentsForWidescreenNavigation(currentVideoNavigationKey, navigationRequestId, videoCommentIdentifier)
        // 如果是视频页面内部跳转，延迟执行滚动
        if (isVideoOrBangumiPage()) {
          handleVideoPageNavigation()
        }
      }
    }
  }

  function scheduleUrlChangeCheck() {
    if (urlChangeCheckQueued)
      return

    urlChangeCheckQueued = true
    // inject/index.ts 在原生 history 方法执行前派发事件；微任务会在 URL
    // 真正更新后执行，同时合并同一轮中的连续 history 操作。
    queueMicrotask(checkForUrlChanges)
  }

  function handlePushState(event: Event) {
    prepareVideoNavigationBeforeRouteChange(event)
    scheduleUrlChangeCheck()
  }

  // inject/index.ts 在调用 history.pushState 前派发此事件，先退出宽屏；URL
  // 真正变化后由事件队列复用 SPA 路由并按需重载评论区。
  window.addEventListener('pushstate', handlePushState, true)
  window.addEventListener('replacestate', scheduleUrlChangeCheck, true)
  window.addEventListener('popstate', scheduleUrlChangeCheck, true)
  window.addEventListener('hashchange', scheduleUrlChangeCheck, true)
  window.addEventListener('pageshow', scheduleUrlChangeCheck, true)
  document.addEventListener('ended', (event) => {
    if (event.target === getVideoElement())
      lastVideoEndedAt = Date.now()
  }, true)

  // 添加页面加载监听
  window.addEventListener('load', () => {
    waitForPlayerModePageSettle()
    if (isVideoPage()) {
      applyDefaultPlayerMode()
    }
    else if (isVideoOrBangumiPage()) {
      applyDefaultPlayerMode()
    }

    // 添加搜索页面视频卡片链接点击事件处理
    if (/https?:\/\/search\.bilibili\.com\.*/.test(location.href))
      setupBiliVideoCardLinkClickHandler()
  })

  // B 站原生视频卡片会在多个页面复用，统一监听稍后再看操作并同步顶栏状态。
  const nativeWatchLaterListSelector = '.watch-later-list, .watchlater-list, [class*="watch-later-list"], [class*="watchlater-list"], bili-watch-later-list'
  const nativeWatchLaterItemSelector = '.av-item, [class*="watch-later-item"], [class*="watchlater-item"], [class*="av-item"], bili-watch-later-item'
  const nativeWatchLaterDeleteControlSelector = '.del, .delete, .d-btn, [class*="delete"], [class*="remove"], [aria-label*="删除"], [aria-label*="移除"], [title*="删除"], [title*="移除"], [data-action*="delete"]'
  let nativeWatchLaterSyncTimer: ReturnType<typeof setTimeout> | undefined
  let nativeWatchLaterLastSyncAt = 0

  function scheduleNativeWatchLaterStateSync(force = false) {
    if (nativeWatchLaterSyncTimer) {
      if (!force)
        return
      clearTimeout(nativeWatchLaterSyncTimer)
      nativeWatchLaterSyncTimer = undefined
    }

    if (!force && Date.now() - nativeWatchLaterLastSyncAt < 2500)
      return

    nativeWatchLaterSyncTimer = setTimeout(() => {
      nativeWatchLaterSyncTimer = undefined
      nativeWatchLaterLastSyncAt = Date.now()

      const refresh = () => {
        void useTopBarStore().syncWatchLaterState(true).catch((error) => {
          console.error('刷新顶栏稍后再看状态失败:', error)
        })
      }

      // 原生列表的删除请求和 DOM 更新不是同一个时序，补一次最终状态。
      refresh()
      window.setTimeout(refresh, 1000)
    }, 800)
  }

  function isNativeWatchLaterDeleteControl(element: Element, eventPath: EventTarget[]) {
    const control = element.closest(nativeWatchLaterDeleteControlSelector)
    const label = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`
    if (!control && !/删除|移除/u.test(label))
      return false

    if (control?.closest(nativeWatchLaterListSelector) || element.closest(nativeWatchLaterListSelector))
      return true

    // 自定义元素的删除按钮可能位于 B 站 shadow root 内，无法用 closest() 找到宿主；
    // 页面本身是稍后再看列表时可放宽判断，但排除 Bewly 自己的 shadow root。
    return !eventPath.some(target => target instanceof Element && target.id === 'bewly')
  }

  function isNativeWatchLaterListMutation(mutation: MutationRecord) {
    const target = mutation.target instanceof Element
      ? mutation.target
      : mutation.target.parentElement
    if (!target?.closest(nativeWatchLaterListSelector))
      return false

    return [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)].some((node) => {
      const element = node instanceof Element ? node : node.parentElement
      return !!element?.matches(nativeWatchLaterItemSelector)
        || !!element?.querySelector(nativeWatchLaterItemSelector)
    })
  }

  function setupNativeWatchLaterStateSync() {
    document.addEventListener('click', (event) => {
      const eventPath = event.composedPath()
      const watchLaterButton = eventPath.find(
        (target): target is Element => target instanceof Element
          && target.matches('.bili-watch-later, .bili-watch-later--wrap, .bili-watch-later__icon'),
      )
      const isWatchLaterDelete = isWatchLaterListPage(location.href)
        && eventPath.some(target => target instanceof Element
          && isNativeWatchLaterDeleteControl(target, eventPath))

      if (watchLaterButton || isWatchLaterDelete)
        scheduleNativeWatchLaterStateSync(true)
    }, true)

    const observer = new MutationObserver((mutations) => {
      if (!isWatchLaterListPage(location.href)
        || !mutations.some(isNativeWatchLaterListMutation)) {
        return
      }

      scheduleNativeWatchLaterStateSync()
    })

    const observeNativeWatchLaterList = () => {
      if (document.documentElement)
        observer.observe(document.documentElement, { childList: true, subtree: true })
    }
    if (document.documentElement)
      observeNativeWatchLaterList()
    else
      window.addEventListener('DOMContentLoaded', observeNativeWatchLaterList, { once: true })
  }

  setupNativeWatchLaterStateSync()

  // 添加搜索页 bili-video-card 链接点击事件处理
  function setupBiliVideoCardLinkClickHandler() {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement

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
  function restoreDefaultPlayerModeAfterPageResume() {
    if (document.visibilityState !== 'visible'
      || !isVideoOrBangumiPage()
      || playerModeResumeQueued) {
      return
    }

    scheduleUrlChangeCheck()
    playerModeResumeQueued = true
    // URL 同步的微任务会先执行。无论后台期间发生的是完整视频导航还是
    // 仅 query 变化，恢复检查都会在同步完成后继续，不会漏掉后台新标签页。
    queueMicrotask(() => {
      playerModeResumeQueued = false
      if (document.visibilityState !== 'visible'
        || !isVideoOrBangumiPage()
        || lastUrl !== location.href) {
        return
      }

      const currentNavigationKey = getVideoNavigationKey(location.href)
      if (lastAppliedPlayerModeNavigationKey === currentNavigationKey
        || playerModeRetryTimer) {
        return
      }

      // 已结束视频的结尾推荐面板属于播放器自身状态。切回标签页时不要再次
      // 触发模式就绪流程，避免 B 站把结尾面板还原成最后一帧。
      if (getVideoElement()?.ended)
        return

      waitForPlayerModePageSettle()
      applyDefaultPlayerMode()
    })
  }

  window.addEventListener('pageshow', restoreDefaultPlayerModeAfterPageResume)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      restoreDefaultPlayerModeAfterPageResume()
  })

  // Set the original Bilibili top bar to `display: none` to prevent it from showing before the load
  // see: https://github.com/BewlyBewly/BewlyBewly/issues/967
  const removeOriginalTopBar = injectCSS(`
    .bili-header,
    #biliMainHeader,
    .header-channel,
    .bili-header-channel-panel {
      visibility: hidden !important;
    }
  `)

  async function onDOMLoaded() {
    // 所有页面都先完成设置读取，避免启动期 watcher 基于默认值生成陈旧写入。
    await settingsReady

    const changeHomePage = !isInIframe() && !settings.value.useOriginalBilibiliHomepage && isHomePage()
    document.documentElement.classList.toggle('bewly-custom-homepage', changeHomePage)

    // 启用自定义首页时隐藏 B 站原始首页。
    if (changeHomePage) {
      // 移动端缺少 viewport 声明时会按 980px 排版后整体缩放，导致响应式断点失效。
      ensureResponsiveViewport(document)

      // 提前保存原始顶栏，以便需要时重新挂载。
      captureOriginalBilibiliTopBar(document)

      // 方案选择：
      // 方案 1: 清理脚本 + 删除 DOM（可能更彻底，但有风险）
      // 方案 2: CSS 隐藏（更安全，性能更好，推荐）

      // 方案2：CSS 完整隐藏原站首页根节点，不再把 #app / .bili-feed4 保活露出。
      // 原版顶栏需要用时再 portal 到 body（见 ensureOriginalBilibiliTopBarAppended），
      // 避免「半隐藏的 B 站首页 Vue 树」与自定义首页双开抢资源。
      injectCSS(`
      /* 自定义首页始终以当前可视视口为尺寸基准，避免原站最小宽度撑大文档。 */
      html,
      body {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
      }
      /* Hide Bilibili's own page elements, preserving third-party extensions (e.g., Bili-Evolved) */
      body > #app,
      body > #i_cecream,
      .home-redesign-base,
      .bilibili-gate-root {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        position: absolute !important;
        left: -9999px !important;
      }
      /* 顶栏 portal 到 body 后的定位；显隐由 .remove-top-bar 控制 */
      body > .bili-header {
        position: relative !important;
        left: 0 !important;
        pointer-events: auto !important;
      }
    `)

      // 温和的脚本清理（可选，减少后台资源消耗）
      cleanupBilibiliScripts()

      // 只有「顶栏可见性 + 原版顶栏」同时开启时才 portal 原生顶栏。
      if (shouldShowOriginalBilibiliTopBar(settings.value.enableTopBar, settings.value.useOriginalBilibiliTopBar)) {
        ensureOriginalBilibiliTopBarAppended(document)
        setupLoginButtonClickHandlers(document)
      }

      // 如果要使用方案1（删除DOM），取消注释以下代码并注释掉上面的 CSS 方案：
    /*
    // 清理 B 站脚本资源，避免内存泄漏和性能问题
    cleanupBilibiliScripts()

    // 延迟一小段时间，让清理逻辑生效
    await new Promise(resolve => setTimeout(resolve, 100))

    // Remove the original Bilibili homepage
    document.body.innerHTML = ''

    // Remove the Bilibili Evolved homepage & Bilibili-Gate homepage
    injectCSS(`
      .home-redesign-base, .bilibili-gate-root {
        display: none !important;
      }
    `)

    ensureOriginalBilibiliTopBarAppended(document)
    */
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

    initVideoAspectRatioMemory()
    initVideoScreenshotControl()
    initBewlyWidescreenControl()
    initTouchPlayerGestures()

    // Initialize Favorite Dialog Enhancement (for video pages)
    if (isVideoOrBangumiPage()) {
      initFavoriteDialogEnhancement()
    }

    // 原生空间订阅合集 favlist「播放全部」按设置起播
    initNativeFavoriteSeasonPlayAllIntercept()
  }

  if (document.readyState !== 'loading') {
    void onDOMLoaded()
  }
  else {
    document.addEventListener('DOMContentLoaded', () => {
      void onDOMLoaded()
    })
  }

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
    const isDev = import.meta.env.DEV
    const bewlyElArr: NodeListOf<Element> = document.querySelectorAll('#bewly')
    if (bewlyElArr.length > 0) {
      bewlyElArr.forEach((el: Element) => {
        const elVersion = el.getAttribute('data-version') || '0.0.0'
        const elIsDev = el.getAttribute('data-dev') === 'true'

        // Remove bewly element if the version is less than the current version
        if (compareVersions(elVersion, version) < 0)
          disposeBewlyHost(el)
        // 同模式重复注入的旧宿主已过期：dev 不清除会越堆越多，
        // watcher 的 querySelector('#bewly') 命中陈旧的第一个宿主，
        // 内联 CSS 变量（如 --bew-filter-glass-1 毛玻璃强度）到不了实际渲染的宿主。
        else if (!elIsDev || isDev)
          disposeBewlyHost(el)
      })
    }

    // mount component to context window
    const container = document.createElement('div') as BewlyHostElement
    container.id = 'bewly'
    container.setAttribute('data-version', version)
    container.setAttribute('data-dev', import.meta.env.DEV ? 'true' : 'false')

    // 立即设置Shadow DOM容器的基准颜色，确保Vue组件能够访问到正确的CSS变量
    if (settings.value.darkModeBaseColor) {
      container.style.setProperty('--bew-dark-base-color', settings.value.darkModeBaseColor)
    }

    const root = document.createElement('div')
    const useViewportLayout = !isInIframe() && !settings.value.useOriginalBilibiliHomepage && isHomePage()

    if (useViewportLayout) {
      Object.assign(container.style, {
        position: 'fixed',
        inset: '0',
        width: 'auto',
        minWidth: '0',
        maxWidth: 'none',
        height: '100dvh',
        overflow: 'hidden',
      })
      Object.assign(root.style, {
        width: '100%',
        height: '100%',
        minWidth: '0',
      })
    }

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

    // 样式就绪前隐藏整个 Shadow DOM，避免未应用样式的内容闪现。
    // 就绪后一次性展示，避免容器淡入与壁纸遮罩透明度叠加，造成遮罩延迟出现。
    container.style.visibility = 'hidden'
    const revealContainer = () => {
      container.style.visibility = 'visible'
    }
    styleEl.addEventListener('load', revealContainer, { once: true })
    styleEl.addEventListener('error', revealContainer, { once: true })

    // startShadowDOMStyleInjection()

    // inject svg icons
    const svgDiv = document.createElement('div')
    svgDiv.innerHTML = SVG_ICONS
    shadowDOM.appendChild(svgDiv)

    document.body.appendChild(container)

    const app = createApp(App)
    setupApp(app)
    app.mount(root)

    let appDisposed = false
    container.__bewlyCatDisposeApp__ = () => {
      if (appDisposed)
        return
      appDisposed = true
      app.unmount()
      delete container.__bewlyCatDisposeApp__
    }
  }

  // 发送设置更新到网页环境
  function sendSettingsToPage(value: unknown) {
    const pageSettings = createPageSettingsPayload(value)
    if (!pageSettings)
      return

    window.postMessage({
      type: 'BEWLY_SETTINGS_UPDATE',
      data: pageSettings,
    }, window.location.origin)
  }

  void settingsReady.then(() => {
    sendSettingsToPage(settings.value)
  })

  watch(
    [
      () => settings.value.enableRandomPlay,
      () => settings.value.randomPlayMode,
      () => settings.value.minVideosForRandom,
      () => settings.value.defaultCustomPlayOrder,
      () => settings.value.enableCustomPlayOrderOverrides,
      () => settings.value.customPlayOrderOverrides.multipart,
      () => settings.value.customPlayOrderOverrides.collection,
      () => settings.value.customPlayOrderOverrides.watchLater,
      () => settings.value.customPlayOrderOverrides.playlist,
    ],
    ([enabled, activationMode, minVideos, ...orderSettings], [previousEnabled, previousActivationMode, previousMinVideos, ...previousOrderSettings]) => {
      if (enabled !== previousEnabled && isCustomPlayPage()) {
        if (enabled)
          applyEndPlaybackBehavior()
        else
          destroyRandomPlay()
      }

      if (orderSettings.some((value, index) => value !== previousOrderSettings[index])) {
        syncRandomPlayOrder()
        applyRandomPlayActivationSettings()
      }

      if (
        activationMode !== previousActivationMode
        || minVideos !== previousMinVideos
      ) {
        applyRandomPlayActivationSettings()
      }
    },
  )

  watch(
    () => settings.value.showVerticalVideoZoomButton,
    (enabled) => {
      if (enabled && isVideoOrBangumiPage())
        initVerticalVideoZoom()
      else
        resetVerticalVideoZoom()
    },
  )

  watch(
    () => settings.value.language,
    () => syncRandomPlayUI(),
  )

  // 监听设置变化
  watch(settings, (newSettings, oldSettings) => {
    sendSettingsToPage(newSettings)

    // 监听自动播放设置变化
    if (isCustomPlayPage()) {
    // 检查自动播放相关设置是否发生变化
      const autoPlaySettingsChanged = oldSettings && (
        newSettings.useBilibiliDefaultAutoPlay !== oldSettings.useBilibiliDefaultAutoPlay
        || newSettings.autoPlayMultipart !== oldSettings.autoPlayMultipart
        || newSettings.autoPlayCollection !== oldSettings.autoPlayCollection
        || newSettings.autoPlayRecommend !== oldSettings.autoPlayRecommend
        || newSettings.autoPlayWatchLater !== oldSettings.autoPlayWatchLater
        || newSettings.autoPlayPlaylist !== oldSettings.autoPlayPlaylist
      )

      if (autoPlaySettingsChanged) {
        setTimeout(() => {
          applyEndPlaybackBehavior()
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
        // 移除稍后再看按钮，并取消尚未完成的挂载等待
          import('~/utils/watchLaterButton')
            .then(({ removeWatchLaterButton }) => removeWatchLaterButton())
            .catch(err => console.error('移除稍后再看按钮失败:', err))
          watchLaterButtonAdded = false
        }
      }
    }
  }, { deep: true })

  // 监听来自网页环境的请求
  window.addEventListener('message', (event) => {
    if (event.source !== window)
      return

    if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data))
      return

    const { type } = event.data

    if (type === 'BEWLY_REQUEST_SETTINGS') {
    // 发送当前设置到网页环境
      void settingsReady.then(() => {
        sendSettingsToPage(settings.value)
      })
    }
  })

  // 监听来自父页面的黑暗模式切换消息（用于iframe跨域场景）
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent)
      return

    if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data))
      return

    const { type, isDark, darkModeBaseColor, useOriginalBilibiliTopBar, enableTopBar } = event.data

    if (type === IFRAME_DARK_MODE_CHANGE) {
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
    else if (type === IFRAME_TOP_BAR_CHANGE) {
      if (typeof useOriginalBilibiliTopBar !== 'boolean')
        return

      const showOriginal = typeof enableTopBar === 'boolean'
        ? shouldShowOriginalBilibiliTopBar(enableTopBar, useOriginalBilibiliTopBar)
        : useOriginalBilibiliTopBar
      document.documentElement.classList.toggle('remove-top-bar', !showOriginal)

      const hideCustomNavbar = typeof enableTopBar === 'boolean'
        ? enableTopBar
        : !useOriginalBilibiliTopBar
      document.documentElement.classList.toggle('remove-custom-navbar', hideCustomNavbar)

      if (showOriginal) {
        resetBilibiliTopBarInlineStyles(document)
        // Setup login button click handlers when switching to original top bar
        setupLoginButtonClickHandlers(document)
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

  // 启动自动播放用户修改监听
  startAutoPlayUserChangeMonitoring()

  // 为 iframe 中运行时添加 ESC 键监听（消息页面、视频页面、动态详情）
  const isMomentDetailPage = /https?:\/\/t\.bilibili\.com\/\d+/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/\d+/.test(currentUrl)
  if (isInIframe() && (isNotificationPage() || isVideoOrBangumiPage() || isMomentDetailPage)) {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
    // 只处理ESC键
      if (e.key !== 'Escape' && e.code !== 'Escape')
        return

      // 检查当前焦点元素
      const activeElement = document.activeElement
      const tagName = activeElement?.tagName?.toLowerCase()

      // 检查是否是输入框或可编辑元素
      const isInputElement
      = tagName === 'input'
        || tagName === 'textarea'
        || activeElement?.hasAttribute('contenteditable')

      // 如果焦点在输入框内，不处理ESC键，让用户正常使用
      if (isInputElement)
        return

      // 视频页面：检查视频播放器是否处于网页全屏或宽屏状态
      if (isVideoOrBangumiPage()) {
        const webFullBtn = document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-web')
        const wideBtn = document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-wide')
        const isWebFull = webFullBtn?.classList.contains('bpx-state-entered')
        const isWide = wideBtn?.classList.contains('bpx-state-entered')

        // 如果视频处于网页全屏或宽屏状态，让播放器自己处理ESC
        if (isWebFull || isWide)
          return
      }

      // 焦点不在输入框，通知父窗口关闭抽屉
      e.preventDefault()
      e.stopPropagation()

      window.parent.postMessage({
        type: 'BEWLY_DRAWER_CLOSE_REQUEST',
        source: 'iframe',
      }, '*')
    }, true) // 使用捕获阶段
  }
}
