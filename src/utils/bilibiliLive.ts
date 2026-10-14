// 该模块会被提前执行的小入口和页面主世界脚本引用，保持无依赖。
const BILIBILI_LIVE_HOSTNAME = 'live.bilibili.com'

function isBilibiliLiveOrigin(value: string): boolean {
  try {
    return new URL(value).hostname === BILIBILI_LIVE_HOSTNAME
  }
  catch {
    return false
  }
}

/**
 * 直播站本身不在匹配列表中，但直播页会嵌入主站、登录等匹配域名的框架。
 * 当前页面或任一上层页面属于直播站时，BewlyCat 不执行任何页面处理。
 */
export function isInBilibiliLiveContext(): boolean {
  try {
    if (location.hostname === BILIBILI_LIVE_HOSTNAME)
      return true
    if (window === window.top)
      return false

    // Chromium / Safari 提供完整的上层来源链；Firefox 退回直接父页面的 referrer。
    const ancestorOrigins = location.ancestorOrigins
    if (ancestorOrigins)
      return Array.from(ancestorOrigins).some(isBilibiliLiveOrigin)
    return isBilibiliLiveOrigin(document.referrer)
  }
  catch {
    return false
  }
}
