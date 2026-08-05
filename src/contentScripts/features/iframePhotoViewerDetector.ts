import { runWhenIdle } from '~/utils/lazyLoad'

let observer: MutationObserver | null = null
let isPhotoViewerOpen = false
let idleSetup: ReturnType<typeof runWhenIdle> | null = null
let domReadyListener: (() => void) | null = null
let rootReadyRetryTimer: number | null = null

function clearDeferredSetup() {
  idleSetup?.dispose()
  idleSetup = null

  if (domReadyListener) {
    document.removeEventListener('DOMContentLoaded', domReadyListener)
    domReadyListener = null
  }

  if (rootReadyRetryTimer !== null) {
    window.clearTimeout(rootReadyRetryTimer)
    rootReadyRetryTimer = null
  }
}

function setupObserverWhenReady() {
  if (observer)
    return

  const target = document.body ?? document.documentElement
  if (!target) {
    if (document.readyState === 'loading') {
      if (!domReadyListener) {
        domReadyListener = () => {
          domReadyListener = null
          setupObserverWhenReady()
        }
        document.addEventListener('DOMContentLoaded', domReadyListener, { once: true })
      }
    }
    else if (rootReadyRetryTimer === null) {
      rootReadyRetryTimer = window.setTimeout(() => {
        rootReadyRetryTimer = null
        setupObserverWhenReady()
      }, 0)
    }
    return
  }

  observer = new MutationObserver(() => {
    checkPhotoViewerState()
  })

  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })

  // 初始检查
  checkPhotoViewerState()
}

/**
 * 监听页面中 PhotoSwipe (pswp) 图片查看器的打开/关闭状态
 * 当检测到图片查看器打开时，通知父页面隐藏顶栏和 Dock
 */
export function setupIframePhotoViewerDetector() {
  // 只在 iframe 内运行
  if (window.self === window.top)
    return

  // 避免重复初始化
  if (observer || idleSetup || domReadyListener || rootReadyRetryTimer !== null)
    return

  idleSetup = runWhenIdle(() => {
    idleSetup = null
    setupObserverWhenReady()
  })
}

function checkPhotoViewerState() {
  // 检查是否存在打开的 PhotoSwipe 元素
  const pswpElement = document.querySelector('.pswp')
  const isOpen = pswpElement?.classList.contains('pswp--open') ?? false

  // 只在状态变化时发送消息
  if (isOpen !== isPhotoViewerOpen) {
    isPhotoViewerOpen = isOpen

    // 通知父页面 PhotoSwipe 的状态
    window.parent.postMessage({
      type: 'IFRAME_PHOTO_VIEWER_STATE',
      isOpen,
    }, '*')
  }
}

export function cleanupIframePhotoViewerDetector() {
  clearDeferredSetup()
  observer?.disconnect()
  observer = null
  isPhotoViewerOpen = false
}
