import { runWhenIdle } from '~/utils/lazyLoad'
import { findOpenPhotoViewer, PHOTO_VIEWER_OPEN_SELECTOR } from '~/utils/photoViewer'

const PLAYER_CONTAINER_SELECTOR = '.bpx-player-container, .bilibili-player'

let observer: MutationObserver | null = null
let wasPhotoViewerOpen = false
let activeViewer: Element | null = null
let checkScheduled = false
let idleSetup: ReturnType<typeof runWhenIdle> | null = null
let domReadyListener: (() => void) | null = null
let rootReadyRetryTimer: number | null = null

function isPhotoViewerElement(element: Element): boolean {
  return element.classList.contains('pswp') || element.classList.contains('bewly-opus-viewer')
}

function isRelevantMutation(mutation: MutationRecord): boolean {
  if (mutation.type === 'attributes') {
    const target = mutation.target
    if (!(target instanceof Element)) return false
    return (
      isPhotoViewerElement(target) ||
      (wasPhotoViewerOpen && (!activeViewer || target === activeViewer))
    )
  }

  if (wasPhotoViewerOpen && mutation.removedNodes.length > 0) {
    if (!activeViewer?.isConnected || !activeViewer.matches(PHOTO_VIEWER_OPEN_SELECTOR)) return true
  }

  if (mutation.addedNodes.length === 0) return false

  // 播放器内部的弹幕与控件频繁增删，不会挂载图片查看器。
  if (mutation.target instanceof Element && mutation.target.closest(PLAYER_CONTAINER_SELECTOR))
    return false

  for (let i = 0; i < mutation.addedNodes.length; i++) {
    const node = mutation.addedNodes[i]
    if (!(node instanceof Element)) continue
    if (isPhotoViewerElement(node)) return true
    if (node.childElementCount > 0 && findOpenPhotoViewer(node) !== null) return true
  }
  return false
}

function scheduleCheckPhotoViewerState() {
  if (checkScheduled) return
  checkScheduled = true
  queueMicrotask(() => {
    checkScheduled = false
    if (observer) checkPhotoViewerState()
  })
}

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
  if (observer) return

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
    } else if (rootReadyRetryTimer === null) {
      rootReadyRetryTimer = window.setTimeout(() => {
        rootReadyRetryTimer = null
        setupObserverWhenReady()
      }, 0)
    }
    return
  }

  observer = new MutationObserver((mutations) => {
    if (mutations.some(isRelevantMutation)) scheduleCheckPhotoViewerState()
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
  if (window.self === window.top) return

  // 避免重复初始化
  if (observer || idleSetup || domReadyListener || rootReadyRetryTimer !== null) return

  idleSetup = runWhenIdle(() => {
    idleSetup = null
    setupObserverWhenReady()
  })
}

function checkPhotoViewerState() {
  const openViewer =
    activeViewer?.isConnected && activeViewer.matches(PHOTO_VIEWER_OPEN_SELECTOR)
      ? activeViewer
      : findOpenPhotoViewer()
  activeViewer = openViewer
  const isOpen = openViewer !== null

  // 只在状态变化时发送消息
  if (isOpen !== wasPhotoViewerOpen) {
    wasPhotoViewerOpen = isOpen

    // 通知父页面 PhotoSwipe 的状态
    window.parent.postMessage(
      {
        type: 'IFRAME_PHOTO_VIEWER_STATE',
        isOpen,
      },
      '*',
    )
  }
}

export function cleanupIframePhotoViewerDetector() {
  clearDeferredSetup()
  observer?.disconnect()
  observer = null
  activeViewer = null
  checkScheduled = false
  wasPhotoViewerOpen = false
}
