import { BEWLY_MOUNTED } from '../constants/globalEvents'
import { isInBilibiliLiveContext } from '../utils/bilibiliLive'
import { stripBilibiliLocalePathname } from '../utils/bilibiliLocale'

export interface PageLoadingGuard {
  revealHomepage: () => void
  dispose: () => void
}

// 独立的小入口先于主包执行，不导入 Vue、设置或页面组件。
const loadingGlobal = globalThis as typeof globalThis & {
  __BEWLYCAT_PAGE_LOADING__?: PageLoadingGuard
}

if (!/Electron/i.test(navigator.userAgent) && !loadingGlobal.__BEWLYCAT_PAGE_LOADING__ && !isInBilibiliLiveContext()) {
  const isHomepage = window === window.top
    && /^(?:www\.)?bilibili\.com$/.test(location.hostname)
    && ['/', '/index.html'].includes(stripBilibiliLocalePathname(location.pathname))
  const homepageStyle = document.createElement('style')
  const headerStyle = document.createElement('style')
  // 保留原站布局测量；设置读取完成后，原版首页立即恢复显示。
  homepageStyle.textContent = isHomepage
    ? 'html > body { opacity: 0 !important; pointer-events: none !important; transition: none !important; }'
    : ''
  headerStyle.textContent = '.bili-header, #biliMainHeader, .header-channel, .bili-header-channel-panel { visibility: hidden !important; }'

  let disposed = false
  let homepageRevealed = false
  let timeout: ReturnType<typeof setTimeout>
  const observer = new MutationObserver(attachStyles)
  function attachStyles() {
    if (disposed || !document.documentElement)
      return
    if (!homepageRevealed)
      document.documentElement.append(homepageStyle)
    document.documentElement.append(headerStyle)
    observer.disconnect()
  }

  function dispose() {
    disposed = true
    observer.disconnect()
    homepageStyle.remove()
    headerStyle.remove()
    clearTimeout(timeout)
    window.removeEventListener(BEWLY_MOUNTED, dispose)
  }

  loadingGlobal.__BEWLYCAT_PAGE_LOADING__ = {
    revealHomepage: () => {
      homepageRevealed = true
      homepageStyle.remove()
    },
    dispose,
  }
  // 主包、设置读取或挂载失败时自动恢复原站，避免永久白屏。
  timeout = setTimeout(dispose, 8000)
  window.addEventListener(BEWLY_MOUNTED, dispose, { once: true })
  observer.observe(document, { childList: true })
  attachStyles()
}
