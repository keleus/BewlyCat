import { IFRAME_SCROLLBAR_GUTTER_CHANGE } from '~/constants/globalEvents'

/**
 * 在首页 iframe 中打开的原版页面里，把文档滚动条占位宽度报告给首页，
 * 让首页的顶栏和 Dock 与新标签中打开的原版页面保持相同的右侧位置。
 */
export function reportScrollbarGutterToParent() {
  if (window.self === window.top)
    return

  let lastWidth = -1
  let frame = 0

  function report() {
    frame = 0
    const width = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
    if (width === lastWidth)
      return
    lastWidth = width
    window.parent.postMessage({ type: IFRAME_SCROLLBAR_GUTTER_CHANGE, width }, '*')
  }

  function scheduleReport() {
    if (!frame)
      frame = requestAnimationFrame(report)
  }

  // 滚动条出现或消失时根元素宽度随之变化。
  new ResizeObserver(scheduleReport).observe(document.documentElement)
  window.addEventListener('resize', scheduleReport, { passive: true })
  scheduleReport()
}
