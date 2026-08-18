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

/** Keep the dynamic image's original URL while removing only Bilibili resize suffixes. */
export function getMomentOriginalImageUrl(url = '') {
  const normalized = httpsUrl(url)
  const queryStart = normalized.search(/[?#]/)
  const path = queryStart === -1 ? normalized : normalized.slice(0, queryStart)
  if (!path || !/hdslb\.com|biliimg\.com|bilivideo\.com|bilibili\.com/.test(path))
    return normalized

  const suffix = path.match(/@\d+w(?:_\d+h)?(?:_\d+c)?(?:\.(?:avif|webp|jpe?g|png))?$/i)?.[0]
  if (!suffix)
    return normalized

  return `${path.slice(0, -suffix.length)}${queryStart === -1 ? '' : normalized.slice(queryStart)}`
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
  const isReservation = Boolean(
    moment.additional?.isVideoReservation
    || moment.additional?.isLiveReservation,
  )

  return !moment.images.length
    && !moment.isVideo
    && !moment.isLive
    && !moment.isChargeExclusive
    && !moment.title
    && !moment.forward
    && (!moment.additional || isReservation)
}

export function getWatchLaterStateKey(target: WatchLaterTarget) {
  const aid = Number(target.aid || 0)
  if (aid)
    return `aid:${aid}`
  if (target.bvid)
    return `bvid:${target.bvid}`
  return target.epid ? `epid:${target.epid}` : ''
}

export type MomentLinkKind = 'video' | 'moment' | 'other'

export function getAuthorSpaceUrl(mid?: string | number) {
  const value = String(mid || '').trim()
  return value ? `https://space.bilibili.com/${value}` : ''
}

export function classifyMomentLink(url = ''): MomentLinkKind {
  if (!url)
    return 'other'

  try {
    const parsed = new URL(url.startsWith('//') ? `https:${url}` : url, 'https://www.bilibili.com')
    const host = parsed.hostname.replace(/^www\./, '')
    const path = parsed.pathname

    if (
      /\/video\//.test(path)
      || /\/bangumi\/play\//.test(path)
      || /\/cheese\/play\//.test(path)
      || /\/festival\//.test(path)
    ) {
      return 'video'
    }

    if (
      host === 't.bilibili.com'
      || /\/opus\//.test(path)
      || /\/dynamic\//.test(path)
    ) {
      return 'moment'
    }
  }
  catch {
    return 'other'
  }

  return 'other'
}

export function shouldUseNativeLinkOpen(event: MouseEvent) {
  return event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
}

/** 竖图缩略图最高按 2:1（高:宽）裁切，对应宽高比 0.5 */
export const PORTRAIT_THUMBNAIL_MIN_RATIO = 0.5

export function isPortraitImageRatio(ratio?: number) {
  return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 && ratio < 1
}

export function getPortraitThumbnailRatio(ratio?: number) {
  if (!isPortraitImageRatio(ratio))
    return PORTRAIT_THUMBNAIL_MIN_RATIO
  return Math.max(PORTRAIT_THUMBNAIL_MIN_RATIO, ratio)
}

export function getPortraitThumbnailImages(moment: DisplayMoment) {
  if (moment.isVideo || moment.isLive || (moment.isChargeExclusive && !moment.images.length))
    return []
  if (moment.images.length === 1)
    return moment.images
  if (!moment.images.length && moment.forward?.images?.length === 1)
    return moment.forward.images
  return []
}

export function isPortraitMomentLayout(moment: DisplayMoment, ratio?: number) {
  return getPortraitThumbnailImages(moment).length > 0 && isPortraitImageRatio(ratio)
}
