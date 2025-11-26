import { runWhenIdle } from '~/utils/lazyLoad'

let observer: MutationObserver | null = null
let isPhotoViewerOpen = false
let styleElement: HTMLStyleElement | null = null

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

    // 注入样式修正 PhotoSwipe 在 iframe 内的定位问题
    if (isOpen) {
      injectPhotoViewerStyles()
    }
    else {
      removePhotoViewerStyles()
    }
  }
}

/**
 * 注入样式修正 PhotoSwipe 在 iframe drawer 内的定位
 * 当在抽屉内时，需要考虑 iframe 本身的负 top 偏移导致的可视区域裁剪
 */
function injectPhotoViewerStyles() {
  if (!styleElement) {
    styleElement = document.createElement('style')
    styleElement.id = 'bewly-pswp-iframe-fix'
    document.head.appendChild(styleElement)
  }

  // 获取 CSS 变量 --bew-top-bar-height 的值
  const topBarHeight = getComputedStyle(document.documentElement).getPropertyValue('--bew-top-bar-height').trim()

  // 修正 PhotoSwipe 容器的定位
  // iframe 有负的 top 偏移，导致顶部被裁剪，需要向下偏移补偿
  styleElement.textContent = `
    .pswp {
      /* 补偿 iframe 的负 top 偏移 */
      position: fixed !important;
      top: ${topBarHeight} !important;
      left: 0 !important;
      width: 100vw !important;
      height: calc(100vh - ${topBarHeight}) !important;
    }

    .pswp__scroll-wrap {
      /* 确保滚动容器填满调整后的容器 */
      width: 100% !important;
      height: 100% !important;
    }

    .pswp__bg {
      /* 背景层也需要调整 */
      width: 100% !important;
      height: 100% !important;
    }

    .pswp__img {
      /* 确保图片在受限空间内正确缩放 */
      max-width: 100% !important;
      max-height: 100% !important;
      object-fit: contain !important;
    }

    .pswp__zoom-wrap {
      /* 确保图片容器不超出可视区域 */
      width: 100% !important;
      height: 100% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
  `
}

/**
 * 移除注入的样式
 */
function removePhotoViewerStyles() {
  if (styleElement) {
    styleElement.remove()
    styleElement = null
  }
}

export function cleanupIframePhotoViewerDetector() {
  observer?.disconnect()
  observer = null
  isPhotoViewerOpen = false
  removePhotoViewerStyles()
}
