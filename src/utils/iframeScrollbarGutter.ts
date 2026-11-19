import { IFRAME_SCROLLBAR_GUTTER_CHANGE } from '~/constants/globalEvents'

const INITIAL_ZERO_REPORT_DELAY_MS = 400

/**
 * 在首页 iframe 中打开的原版页面里，把文档滚动条占位宽度报告给首页，
 * 让首页的顶栏和 Dock 与新标签中打开的原版页面保持相同的右侧位置。
 */
export function reportScrollbarGutterToParent() {
  if (window.self === window.top)
    return

  let lastWidth = -1
  let frame = 0
  let initialZeroTimer: ReturnType<typeof setTimeout> | undefined

  function clearInitialZeroTimer() {
    if (initialZeroTimer !== undefined) {
      clearTimeout(initialZeroTimer)
      initialZeroTimer = undefined
    }
  }

  function postWidth(width: number) {
    clearInitialZeroTimer()
    if (width === lastWidth)
      return
    lastWidth = width
    window.parent.postMessage({ type: IFRAME_SCROLLBAR_GUTTER_CHANGE, width }, '*')
  }

  function measureWidth() {
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth)
  }

  function report() {
    frame = 0
    const width = measureWidth()

    // 首次加载期间（文档未完成或 SPA 首屏尚未撑开）不立即上报 0，
    // 避免父页顶栏和 Dock 在加载期间先向右跳再恢复。
    if (lastWidth === -1 && width === 0) {
      if (document.readyState !== 'complete')
        return
      if (initialZeroTimer === undefined) {
        initialZeroTimer = setTimeout(() => {
          initialZeroTimer = undefined
          postWidth(measureWidth())
        }, INITIAL_ZERO_REPORT_DELAY_MS)
      }
      return
    }

    postWidth(width)
  }

  function scheduleReport() {
    if (!frame)
      frame = requestAnimationFrame(report)
  }

  // 滚动条出现或消失时根元素宽度随之变化。
  new ResizeObserver(scheduleReport).observe(document.documentElement)
  window.addEventListener('resize', scheduleReport, { passive: true })
  if (document.readyState !== 'complete')
    window.addEventListener('load', scheduleReport, { once: true })
  scheduleReport()
}
