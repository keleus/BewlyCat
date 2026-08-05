import type { DisplayMoment, WatchLaterTarget } from './types'

function httpsUrl(url = '') {
  return url.replace(/^http:/, 'https:')
}

export function getMomentThumbnailUrl(url = '', width = 560) {
  const normalized = httpsUrl(url).replace(/@[^/]*$/, '')
  if (!normalized || !/hdslb\.com|biliimg\.com|bilivideo\.com|bilibili\.com/.test(normalized))
    return normalized
  return `${normalized}@${width}w.webp`
}

export function getAvatarThumbnailUrl(url = '') {
  const normalized = httpsUrl(url).replace(/@[^/]*$/, '')
  if (!normalized || !/hdslb\.com|biliimg\.com|bilibili\.com/.test(normalized))
    return normalized
  return `${normalized}@48w_48h_1c.webp`
}

export function formatCount(value: number) {
  return value > 9999 ? `${(value / 10000).toFixed(1)}万` : value || 0
}

/** 卡片文字预览：展示正文开头，不出现“点击查看详情”类占位 */
export function getCardPreviewText(moment: DisplayMoment) {
  const text = (moment.text || '').trim()
  if (text)
    return text

  if (moment.isChargeExclusive) {
    const chargeText = (moment.chargeHint || moment.chargeBadge || '充电专属动态').trim()
    if (chargeText)
      return chargeText
  }

  // 纯文字/无封面时，尽量用转发原文顶上预览
  if (!moment.images.length && !moment.isVideo && !moment.isLive) {
    const forwardText = (moment.forward?.text || moment.forward?.title || '').trim()
    if (forwardText)
      return forwardText
  }

  return ''
}

export function isCompactPlainTextMoment(moment: DisplayMoment) {
  return !moment.images.length
    && !moment.isVideo
    && !moment.isLive
    && !moment.isChargeExclusive
    && !moment.title
    && !moment.forward
    && !moment.additional
}

export function getWatchLaterStateKey(target: WatchLaterTarget) {
  const aid = Number(target.aid || 0)
  if (aid)
    return `aid:${aid}`
  if (target.bvid)
    return `bvid:${target.bvid}`
  return target.epid ? `epid:${target.epid}` : ''
}
