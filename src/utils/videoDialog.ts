/** 视口宽度不超过该值时，弹窗打开回退为新标签页。 */
export const VIDEO_DIALOG_MIN_VIEWPORT_WIDTH = 860

/** 详情弹窗预留视口四边 32px 安全边距；极矮视口由外层 min() 保证不溢出。 */
const PLAYER_DIALOG_WIDTH_SCALE = 0.92
export const DIALOG_VIEWPORT_GUTTER = 64
export const DIALOG_SAFE_WIDTH = `calc(100vw - ${DIALOG_VIEWPORT_GUTTER}px)`
const DIALOG_REFERENCE_HEIGHT = 'min(88dvh, 49.5vw)'
export const DIALOG_SAFE_HEIGHT = `min(calc(100dvh - ${DIALOG_VIEWPORT_GUTTER}px), max(280px, ${DIALOG_REFERENCE_HEIGHT}))`
export const PLAYER_DIALOG_MAX_WIDTH = `min(92vw, calc(${PLAYER_DIALOG_WIDTH_SCALE * 100}dvh * 16 / 9), ${DIALOG_SAFE_WIDTH})`

/** 弹窗可承载的视频地址：主站视频、番剧与列表播放页；直播等跨站页面回退为新标签页。 */
export function canOpenInVideoDialog(url: string) {
  if (window.innerWidth <= VIDEO_DIALOG_MIN_VIEWPORT_WIDTH)
    return false

  try {
    const { protocol, hostname, pathname } = new URL(url, location.href)
    return /^https?:$/.test(protocol)
      && (hostname === 'www.bilibili.com' || hostname === 'bilibili.com')
      && /^\/(?:video|bangumi\/play|cheese\/play|list|festival)\//.test(pathname)
  }
  catch {
    return false
  }
}

const WEB_FULLSCREEN_BTN_SELECTOR = '.bpx-player-ctrl-web, .bilibili-player-video-web-fullscreen, .squirtle-video-pagefullscreen'
const FULLSCREEN_BTN_SELECTOR = '.bpx-player-ctrl-full, .bilibili-player-video-btn-fullscreen, .squirtle-video-fullscreen'

function getDocumentFullscreenElement(doc: Document) {
  return doc.fullscreenElement
    || (doc as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement
    || null
}

function isEnteredControl(el: Element | null) {
  return !!el?.classList.contains('bpx-state-entered')
}

/**
 * 读取弹窗 iframe 内播放器是否处于网页全屏或全屏。
 * 跨域页面无法读取时返回 null，由调用方保留当前状态。
 */
export function readIframePlayerImmersive(iframe: HTMLIFrameElement): boolean | null {
  if (getDocumentFullscreenElement(document) === iframe)
    return true

  try {
    const doc = iframe.contentDocument
    if (!doc)
      return false
    if (getDocumentFullscreenElement(doc))
      return true
    if (doc.querySelector('[data-screen="web"], [data-screen="full"]'))
      return true
    return isEnteredControl(doc.querySelector(WEB_FULLSCREEN_BTN_SELECTOR))
      || isEnteredControl(doc.querySelector(FULLSCREEN_BTN_SELECTOR))
  }
  catch {
    return null
  }
}

/** 监听 iframe 播放器的全屏/网页全屏切换；返回停止监听的函数。 */
export function watchIframePlayerImmersive(iframe: HTMLIFrameElement, onChange: () => void) {
  let disposed = false
  let listenersAttached = false
  let retryTimer: ReturnType<typeof setInterval> | null = null
  const observedTargets = new WeakSet<Element>()
  const notify = () => {
    if (!disposed)
      onChange()
  }
  const observer = new MutationObserver(notify)

  const observeTarget = (el: Element | null) => {
    if (!el || observedTargets.has(el))
      return
    observedTargets.add(el)
    observer.observe(el, {
      attributes: true,
      attributeFilter: ['class', 'data-screen'],
    })
  }

  const attach = () => {
    if (disposed)
      return true

    try {
      const win = iframe.contentWindow
      const doc = iframe.contentDocument
      if (!win || !doc)
        return false

      if (!listenersAttached) {
        win.addEventListener('fullscreenchange', notify)
        doc.addEventListener('fullscreenchange', notify)
        win.addEventListener('webkitfullscreenchange', notify)
        listenersAttached = true
      }

      observeTarget(doc.querySelector(WEB_FULLSCREEN_BTN_SELECTOR))
      observeTarget(doc.querySelector(FULLSCREEN_BTN_SELECTOR))
      observeTarget(doc.querySelector('.bpx-player-container, #bilibili-player, .bilibili-player, [data-screen]'))
      notify()
      return Boolean(
        doc.querySelector(WEB_FULLSCREEN_BTN_SELECTOR)
        || doc.querySelector('.bpx-player-container, #bilibili-player, .bilibili-player'),
      )
    }
    catch {
      return true
    }
  }

  document.addEventListener('fullscreenchange', notify)
  document.addEventListener('webkitfullscreenchange', notify)

  if (!attach()) {
    let retries = 0
    retryTimer = setInterval(() => {
      retries++
      if ((attach() || retries >= 40) && retryTimer) {
        clearInterval(retryTimer)
        retryTimer = null
      }
    }, 250)
  }

  return () => {
    disposed = true
    if (retryTimer) {
      clearInterval(retryTimer)
      retryTimer = null
    }
    observer.disconnect()
    document.removeEventListener('fullscreenchange', notify)
    document.removeEventListener('webkitfullscreenchange', notify)
    try {
      const win = iframe.contentWindow
      const doc = iframe.contentDocument
      win?.removeEventListener('fullscreenchange', notify)
      doc?.removeEventListener('fullscreenchange', notify)
      win?.removeEventListener('webkitfullscreenchange', notify)
    }
    catch {
      // iframe 已卸载或跨域时忽略
    }
  }
}

/** 同域 iframe 加载后去掉顶栏占位，并保证视频页可在 iframe 内滚动。 */
export function prepareDialogIframeDocument(iframe: HTMLIFrameElement) {
  try {
    const doc = iframe.contentWindow?.document
    if (!doc)
      return
    doc.documentElement.classList.add('remove-top-bar-without-placeholder')
    doc.documentElement.style.setProperty('overflow-x', 'hidden', 'important')
    doc.documentElement.style.setProperty('overflow-y', 'auto', 'important')
    if (doc.body) {
      doc.body.style.setProperty('overflow-x', 'hidden', 'important')
      doc.body.style.setProperty('overflow-y', 'auto', 'important')
      doc.body.style.setProperty('height', 'auto', 'important')
    }
  }
  catch {
    // 跨域（如 live.bilibili.com）无法注入，依赖 iframe 默认滚动
  }
}

/** 关闭弹窗时销毁 iframe 文档与媒体，避免内存堆积。 */
export function disposeDialogIframe(iframe: HTMLIFrameElement) {
  // 通知同域 iframe 内部主动释放观察器/媒体
  try {
    iframe.contentWindow?.postMessage({ type: 'BEWLY_OPUS_DISPOSE' }, '*')
  }
  catch {
    // ignore
  }

  // 同域时尽量停掉播放器并清空文档
  try {
    const win = iframe.contentWindow
    const doc = win?.document
    if (doc) {
      doc.querySelectorAll('video, audio').forEach((el) => {
        const media = el as HTMLMediaElement
        try {
          media.pause()
          media.srcObject = null
          media.removeAttribute('src')
          media.querySelectorAll('source').forEach((source) => {
            source.removeAttribute('src')
            source.removeAttribute('srcset')
          })
          media.load()
        }
        catch {
          // ignore
        }
      })

      // 断开页面脚本与 DOM，促使浏览器回收
      try {
        doc.open()
        doc.write('<!doctype html><title></title>')
        doc.close()
      }
      catch {
        // ignore
      }
    }
  }
  catch {
    // 跨域（直播等）无法访问 contentDocument
  }

  try {
    iframe.src = 'about:blank'
  }
  catch {
    // ignore
  }
  try {
    iframe.removeAttribute('src')
  }
  catch {
    // ignore
  }
}
