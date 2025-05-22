import '~/styles'
import 'uno.css'

import { createApp } from 'vue'

import { useDark } from '~/composables/useDark'
import { BEWLY_MOUNTED } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { setupApp } from '~/logic/common-setup'
import RESET_BEWLY_CSS from '~/styles/reset.css?raw'
import { runWhenIdle } from '~/utils/lazyLoad'
import { compareVersions, injectCSS, isHomePage, isInIframe, isNotificationPage, isVideoOrBangumiPage } from '~/utils/main'
import { defaultMode, disableAutoPlayCollection, fullscreen, isBangumiOrWatchLaterPage, isVideoPage, webFullscreen, widescreen } from '~/utils/player'
import { setupShortcutHandlers } from '~/utils/shortcuts'
import { SVG_ICONS } from '~/utils/svgIcons'
import { openLinkInBackground } from '~/utils/tabs'

import { version } from '../../package.json'
import App from './views/App.vue'

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

function isSupportedPages(): boolean {
  if (isInIframe())
    return false
  if (
    // homepage
    isHomePage()
    // video or bangumi page
    || isVideoOrBangumiPage()
    // popular page https://www.bilibili.com/v/popular/all
    || /https?:\/\/(?:www\.)?bilibili\.com\/v\/popular\/all.*/.test(currentUrl)
    // search page
    || /https?:\/\/search\.bilibili\.com\.*/.test(currentUrl)
    // moments page
    // https://github.com/BewlyBewly/BewlyBewly/issues/1246
    // https://github.com/BewlyBewly/BewlyBewly/issues/1256
    // https://github.com/BewlyBewly/BewlyBewly/issues/1266
    || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share).*/.test(currentUrl)
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
      || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share).*/.test(currentUrl)
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

if (isSupportedPages() || isSupportedIframePages()) {
  if (settings.value.adaptToOtherPageStyles)
    useDark()

  if (settings.value.adaptToOtherPageStyles) {
    document.documentElement.classList.add('bewly-design')

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

let lastUrl = location.href

// 应用默认播放器模式
function applyDefaultPlayerMode() {
  const playerMode = settings.value.defaultVideoPlayerMode
  if (!playerMode || playerMode === 'default') {
    // 默认模式也需要居中显示
    defaultMode()
    return
  }
  switch (playerMode) {
    case 'fullscreen':
      fullscreen()
      break
    case 'webFullscreen':
      webFullscreen()
      break
    case 'widescreen':
      widescreen()
      break
  }
  setupShortcutHandlers()
}

function checkForUrlChanges() {
  if (location.href !== lastUrl) {
    lastUrl = location.href
    if (isVideoPage() || isBangumiOrWatchLaterPage()) {
      applyDefaultPlayerMode()
      setupShortcutHandlers() // URL变化时重新注册快捷键
    }
  }
  requestAnimationFrame(checkForUrlChanges)
}
requestAnimationFrame(checkForUrlChanges)

// 处理页面可见性变化
function handleVisibilityChange() {
  // 当页面变为可见且是视频或番剧页面时，且尚未应用播放器模式
  if (document.visibilityState === 'visible'
    && (isVideoPage() || isBangumiOrWatchLaterPage())) {
    applyDefaultPlayerMode()
    setupShortcutHandlers()
  }
}

// 添加页面加载和可见性变化的监听
window.addEventListener('load', () => {
  if (isVideoPage()) {
    applyDefaultPlayerMode()
    disableAutoPlayCollection(settings.value)
    setupShortcutHandlers()
  }
  else if (isBangumiOrWatchLaterPage()) {
    applyDefaultPlayerMode()
    setupShortcutHandlers()
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
  if (isVideoPage() || isBangumiOrWatchLaterPage()) {
    applyDefaultPlayerMode()
    setupShortcutHandlers() // 页面显示时注册快捷键
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
watch(settings, (newSettings) => {
  sendSettingsToPage(newSettings)
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
