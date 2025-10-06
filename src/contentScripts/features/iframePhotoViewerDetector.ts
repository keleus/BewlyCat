import { runWhenIdle } from '~/utils/lazyLoad'

let observer: MutationObserver | null = null
let isPhotoViewerOpen = false

/**
 * 监听页面中 PhotoSwipe (pswp) 图片查看器的打开/关闭状态
 * 当检测到图片查看器打开时，通知父页面隐藏顶栏和 Dock
 */
export function setupIframePhotoViewerDetector() {
  // 只在 iframe 内运行
  if (window.self === window.top)
    return

  // 避免重复初始化
  if (observer)
    return

  runWhenIdle(() => {
    observer = new MutationObserver(() => {
      checkPhotoViewerState()
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    })

    // 初始检查
    checkPhotoViewerState()
  })
}

function checkPhotoViewerState() {
  // 检查是否存在打开的 PhotoSwipe 元素
  const pswpElement = document.querySelector('.pswp')
  const isOpen = pswpElement?.classList.contains('pswp--open') ?? false

  // 只在状态变化时发送消息
  if (isOpen !== isPhotoViewerOpen) {
    isPhotoViewerOpen = isOpen

    // 通知父页面
    window.parent.postMessage({
      type: 'IFRAME_PHOTO_VIEWER_STATE',
      isOpen,
    }, '*')
  }
}

export function cleanupIframePhotoViewerDetector() {
  observer?.disconnect()
  observer = null
  isPhotoViewerOpen = false
}
