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
import { applyBewlyWidescreen, exitBewlyWidescreen, isBewlyWidescreenActive } from '~/utils/bewlyWidescreen'
import { cleanupBilibiliScripts } from '~/utils/bilibiliScriptCleanup'
import { captureOriginalBilibiliTopBar, ensureOriginalBilibiliTopBarAppended, resetBilibiliTopBarInlineStyles, setupLoginButtonClickHandlers } from '~/utils/bilibiliTopBar'
import { initFavoriteDialogEnhancement } from '~/utils/favoriteDialog'
import { runWhenIdle } from '~/utils/lazyLoad'
import { getLocalWallpaper, hasLocalWallpaper, isLocalWallpaperUrl } from '~/utils/localWallpaper'
import { compareVersions, getCookie, injectCSS, isElectron, isHomePage, isInIframe, isNotificationPage, isVideoOrBangumiPage, isVideoPlaybackPage, isWatchLaterListPage } from '~/utils/main'
import { initNativeFavoriteSeasonPlayAllIntercept } from '~/utils/nativeFavoriteSeasonPlayAll'
import { applyAutoPlayByVideoType, applyDefaultCaptionState, applyDefaultDanmakuState, defaultMode, handleVideoPageNavigation, isPlayerDisplayModeReady, isVideoPage, resolveDefaultVideoPlayerMode, startAutoExitFullscreenMonitoring, startAutoPlayUserChangeMonitoring, webFullscreen, widescreen } from '~/utils/player'
import { applyRandomPlayActivationSettings, destroyRandomPlay, initRandomPlay, isCustomPlayPage, resetRandomPlayInitialization, syncRandomPlayOrder } from '~/utils/randomPlay'
import { getPluginSearchResultsUrl } from '~/utils/searchNavigation'
import { setupShortcutHandlers } from '~/utils/shortcuts'
import { SVG_ICONS } from '~/utils/svgIcons'
import { openLinkInBackground } from '~/utils/tabs'
import { initVerticalVideoZoom, resetVerticalVideoZoom } from '~/utils/verticalVideoZoom'
import { recordVideoVisitFromUrl } from '~/utils/videoVisitHistory'
import { ensureResponsiveViewport } from '~/utils/viewportMeta'

import { version } from '../../package.json'
import { setupIframePhotoViewerDetector } from './features/iframePhotoViewerDetector'
import { setupNotificationStateInvalidation } from './features/notificationStateInvalidation'
import { setupOpusDetailDrawerLayout } from './features/opusDetailDrawerLayout'
import { initTouchPlayerGestures } from './touchPlayerGestures'
import { initVideoAspectRatioMemory } from './videoAspectRatioMemory'
import { initVideoScreenshotControl } from './videoScreenshotControl'
import App from './views/App.vue'

const contentScriptGlobal = globalThis as typeof globalThis & {
  __BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__?: boolean
}
const shouldInitializeContentScript = !contentScriptGlobal.__BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__

if (shouldInitializeContentScript) {
  contentScriptGlobal.__BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__ = true
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message === 'object' && message !== null && 'type' in message && message.type === CONTENT_SCRIPT_PING)
      return Promise.resolve(CONTENT_SCRIPT_PONG)

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
  let hasAppliedPlayerMode = false // 添加标志变量
  let playerModeRetryTimer: ReturnType<typeof setTimeout> | undefined
  let pendingWidescreenReloadNavigationKey: string | undefined
  let pendingWidescreenReloadTimer: ReturnType<typeof setTimeout> | undefined
  let watchLaterButtonAdded = false // 标记稍后再看按钮是否已添加

  void settingsReady.then(() => recordVideoVisitFromUrl(lastUrl))

  function setupPluginSearchLinkNavigation() {
    document.addEventListener('click', (event) => {
      if (!settings.value.usePluginSearchResultsPage || !getCookie('DedeUserID'))
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
      if (pluginSearchResultsUrl)
        anchor.href = pluginSearchResultsUrl
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
  function applyDefaultPlayerMode(showBewlyWidescreenLoading = true) {
    if (!isVideoOrBangumiPage()) {
      clearPlayerModeRetry()
      return
    }

    // 后台新开的标签页中，B 站播放器还没有完成可见状态下的初始化。
    // 此时切换播放器模式会与它的恢复流程竞争，可能导致媒体重载或重复 video 节点。
    if (document.hidden) {
      clearPlayerModeRetry()
      return
    }

    if (hasAppliedPlayerMode)
      return // 如果已经应用过，直接返回

    // 检查是否处于全屏或网页全屏状态（互动视频场景）
    const isInFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
    const webFullscreenBtn = document.querySelector('.bpx-player-ctrl-web,.bilibili-player-video-web-fullscreen') as HTMLElement
    const isInWebFullscreen = webFullscreenBtn?.classList.contains('bpx-state-entered')

    // 如果播放器已经在全屏状态，跳过应用模式（避免互动视频退出全屏）
    if (isInFullscreen || isInWebFullscreen) {
      applyDefaultDanmakuState()
      applyDefaultCaptionState()
      hasAppliedPlayerMode = true // 标记已应用，避免重复检查
      return
    }

    let targetPlayerMode = resolveDefaultVideoPlayerMode()
    if (isFestivalPage() && targetPlayerMode === 'bewlyWidescreen')
      targetPlayerMode = 'widescreen'

    if (!isPlayerDisplayModeReady(targetPlayerMode)) {
      schedulePlayerModeRetry(showBewlyWidescreenLoading)
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
            showBewlyWidescreenLoading,
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
    setupShortcutHandlers()
    applyDefaultDanmakuState()
    applyDefaultCaptionState()
    if (settings.value.showVerticalVideoZoomButton)
      initVerticalVideoZoom()
    else
      resetVerticalVideoZoom()
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

  function clearPlayerModeRetry() {
    if (playerModeRetryTimer) {
      clearTimeout(playerModeRetryTimer)
      playerModeRetryTimer = undefined
    }
  }

  function schedulePlayerModeRetry(showBewlyWidescreenLoading = true) {
    if (playerModeRetryTimer)
      return

    playerModeRetryTimer = setTimeout(() => {
      playerModeRetryTimer = undefined
      applyDefaultPlayerMode(showBewlyWidescreenLoading)
    }, document.visibilityState === 'visible' ? 500 : 1000)
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
          if (!settings.value.externalWatchLaterButton)
            return
          watchLaterButtonAdded = addWatchLaterButton()
        }).catch(err => console.error('添加稍后再看按钮失败:', err))
      }
    }, 5000) // 5秒后添加，确保页面已完全稳定
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
    pendingWidescreenReloadTimer = setTimeout(() => {
      pendingWidescreenReloadNavigationKey = undefined
      pendingWidescreenReloadTimer = undefined
    }, 5000)
    clearPlayerModeRetry()
    hasAppliedPlayerMode = false
    // 先退出宽屏，再让 B 站执行原本的 SPA 路由切换；真正 URL 变化后由
    // checkForUrlChanges 复用 SPA 路由并按需重载评论区。
    exitBewlyWidescreen()
  }

  function checkForUrlChanges() {
    if (location.href !== lastUrl) {
      const navigationRequestId = ++widescreenCommentReloadRequestId
      const currentVideoNavigationKey = getVideoNavigationKey(location.href)
      const isMeaningfulVideoNavigation = currentVideoNavigationKey !== lastVideoNavigationKey

      lastUrl = location.href
      lastVideoNavigationKey = currentVideoNavigationKey
      recordVideoVisitFromUrl(lastUrl)
      applyBewlyDesignClasses()

      if (!isVideoOrBangumiPage())
        clearPendingWidescreenReloadNavigation()

      if (isVideoOrBangumiPage()) {
        if (!isMeaningfulVideoNavigation) {
          clearPendingWidescreenReloadNavigation()
          scheduleUrlChangeCheck()
          return
        }

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
          scheduleUrlChangeCheck()
          return
        }

        exitBewlyWidescreen()
        resetVerticalVideoZoom()
        hasAppliedPlayerMode = false // URL变化时重置标志
        document.querySelector('.bewly-watch-later-btn')?.remove()
        watchLaterButtonAdded = false // URL变化时重置稍后再看按钮标志
        // 不再重置用户手动修改标志，保持用户的自动播放偏好设置

        // 重置随机播放初始化状态，避免重复加载
        resetRandomPlayInitialization()

        applyDefaultPlayerMode(false)
        if (videoCommentIdentifier)
          void reloadCommentsForWidescreenNavigation(currentVideoNavigationKey, navigationRequestId, videoCommentIdentifier)
        // 如果是视频页面内部跳转，延迟执行滚动
        if (isVideoOrBangumiPage()) {
          handleVideoPageNavigation()
        }
        // 重新初始化随机播放功能
        if (isCustomPlayPage() && settings.value.enableRandomPlay) {
          setTimeout(() => {
            initRandomPlayFeature()
          }, 2000) // 延迟2秒初始化，确保页面完全加载
        }
      }
    }
    scheduleUrlChangeCheck()
  }

  function scheduleUrlChangeCheck() {
    if (document.visibilityState === 'visible')
      requestAnimationFrame(checkForUrlChanges)
    else
      setTimeout(checkForUrlChanges, 1000)
  }

  scheduleUrlChangeCheck()

  // inject/index.ts 在调用 history.pushState 前派发此事件，先退出宽屏；URL
  // 真正变化后由 checkForUrlChanges 复用 SPA 路由并按需重载评论区。
  // popstate/replaceState 由轮询兜底。
  window.addEventListener('pushstate', prepareVideoNavigationBeforeRouteChange, true)

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
    }
    else if (isVideoOrBangumiPage()) {
      applyDefaultPlayerMode()
    }

    // 初始化自定义播放功能
    if (isCustomPlayPage() && settings.value.enableRandomPlay) {
      setTimeout(() => {
        initRandomPlayFeature()
      }, 3000) // 延迟3秒初始化，确保页面完全加载
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
  window.addEventListener('pageshow', () => {
    if ((isVideoOrBangumiPage()) && !hasAppliedPlayerMode) {
      applyDefaultPlayerMode()
    }
  })
  document.addEventListener('visibilitychange', handleVisibilityChange)

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

      // 始终把原版顶栏移出被隐藏的 #app，避免后续开关原版顶栏时节点仍埋在不可见树里。
      // 使用 Bewly 顶栏时由 .remove-top-bar 隐藏占位，逻辑对齐 1.6.9。
      ensureOriginalBilibiliTopBarAppended(document)

      // Setup login button click handlers for the original Bilibili top bar
      setupLoginButtonClickHandlers(document)

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
        if (enabled) {
          setTimeout(() => {
            initRandomPlayFeature()
          }, 1000)
        }
        else {
          destroyRandomPlay()
        }
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

  // 监听设置变化
  watch(settings, (newSettings, oldSettings) => {
    sendSettingsToPage(newSettings)

    // 监听自动播放设置变化
    if (isCustomPlayPage()) {
    // 检查自动播放相关设置是否发生变化
      const autoPlaySettingsChanged = oldSettings && (
        newSettings.useBilibiliDefaultAutoPlay !== oldSettings.useBilibiliDefaultAutoPlay
        || newSettings.enableRandomPlay !== oldSettings.enableRandomPlay
        || newSettings.autoPlayMultipart !== oldSettings.autoPlayMultipart
        || newSettings.autoPlayCollection !== oldSettings.autoPlayCollection
        || newSettings.autoPlayRecommend !== oldSettings.autoPlayRecommend
        || newSettings.autoPlayWatchLater !== oldSettings.autoPlayWatchLater
        || newSettings.autoPlayPlaylist !== oldSettings.autoPlayPlaylist
      )

      if (autoPlaySettingsChanged) {
      // 自动播放设置发生变化，同步更新页面上的自动播放开关
      // 延迟时间增加，确保页面元素已经渲染
        setTimeout(() => {
          applyAutoPlayByVideoType()
          applyRandomPlayActivationSettings()
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
          existingButton?.remove()
          watchLaterButtonAdded = false
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
      void settingsReady.then(() => {
        sendSettingsToPage(settings.value)
      })
    }
  })

  // 监听来自父页面的黑暗模式切换消息（用于iframe跨域场景）
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent)
      return

    const { type, isDark, darkModeBaseColor, useOriginalBilibiliTopBar } = event.data

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

      document.documentElement.classList.toggle('remove-top-bar', !useOriginalBilibiliTopBar)
      if (useOriginalBilibiliTopBar) {
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
    const pageType = isNotificationPage() ? 'message' : isVideoOrBangumiPage() ? 'video' : 'moment-detail'
    console.log(`[Bewly IFrame] ESC listener initialized for ${pageType} page`)

    window.addEventListener('keydown', (e: KeyboardEvent) => {
    // 只处理ESC键
      if (e.key !== 'Escape' && e.code !== 'Escape')
        return

      console.log('[Bewly IFrame] ESC key pressed in iframe')

      // 检查当前焦点元素
      const activeElement = document.activeElement
      const tagName = activeElement?.tagName?.toLowerCase()

      // 检查是否是输入框或可编辑元素
      const isInputElement
      = tagName === 'input'
        || tagName === 'textarea'
        || activeElement?.hasAttribute('contenteditable')

      console.log('[Bewly IFrame] Active element:', tagName, 'isInput:', isInputElement)

      // 如果焦点在输入框内，不处理ESC键，让用户正常使用
      if (isInputElement) {
        console.log('[Bewly IFrame] Focus in input element, ignoring ESC')
        return
      }

      // 视频页面：检查视频播放器是否处于网页全屏或宽屏状态
      if (isVideoOrBangumiPage()) {
        const webFullBtn = document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-web')
        const wideBtn = document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-wide')
        const isWebFull = webFullBtn?.classList.contains('bpx-state-entered')
        const isWide = wideBtn?.classList.contains('bpx-state-entered')

        console.log('[Bewly IFrame] Video state - webFull:', isWebFull, 'wide:', isWide)

        // 如果视频处于网页全屏或宽屏状态，让播放器自己处理ESC
        if (isWebFull || isWide) {
          console.log('[Bewly IFrame] Video in fullscreen/wide mode, letting player handle ESC')
          return
        }
      }

      // 焦点不在输入框，通知父窗口关闭抽屉
      console.log('[Bewly IFrame] Sending close request to parent')
      e.preventDefault()
      e.stopPropagation()

      window.parent.postMessage({
        type: 'BEWLY_DRAWER_CLOSE_REQUEST',
        source: 'iframe',
      }, '*')
    }, true) // 使用捕获阶段
  }
}
