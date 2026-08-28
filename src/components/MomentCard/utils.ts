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

/** 图文单张横图的最大显示宽度 */
export const LANDSCAPE_SINGLE_IMAGE_MAX_WIDTH = 560
/** 多图横向画廊：同组图片等高，高度上限 350px */
export const MULTI_IMAGE_GALLERY_MAX_HEIGHT = 350
/** 与 `.moment-image-gallery__track` 的 gap（`--bew-space-2`）保持一致 */
export const MULTI_IMAGE_GALLERY_GAP = 8
/** 与 `.moment-image-grid` 的 gap（`--bew-space-2`）保持一致 */
export const NINE_GRID_GAP = 8
export const NINE_GRID_COLUMNS = 3
/** 露出下一张的最小宽度，保证至少能看到「1 张多一点」 */
const MULTI_IMAGE_GALLERY_PEEK_MIN = 48
const MULTI_IMAGE_GALLERY_PEEK_RATIO = 0.18
/** 竖图缩略图最高按 2:1（高:宽）裁切，对应宽高比 0.5 */
export const PORTRAIT_THUMBNAIL_MIN_RATIO = 0.5

export function isUsableImageRatio(ratio?: number): ratio is number {
  return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0
}

function getMultiImageGalleryPeekWidth(containerWidth: number) {
  return Math.min(
    Math.max(MULTI_IMAGE_GALLERY_PEEK_MIN, Math.round(containerWidth * MULTI_IMAGE_GALLERY_PEEK_RATIO)),
    Math.round(containerWidth * 0.32),
  )
}

/**
 * 缩略图显示宽高比：超过 1:2 的长图按 1:2 裁切，其余保持原比例。
 */
export function getClampedThumbnailRatio(ratio?: number) {
  if (!isUsableImageRatio(ratio))
    return undefined
  return Math.max(ratio, PORTRAIT_THUMBNAIL_MIN_RATIO)
}

/**
 * 多图共用同一高度：按第 1 张完整可见、并露出一点第 2 张来取高度，封顶 350px。
 * 单张（含竖图）按容器宽度适配，不预留下一张，同样封顶 350px。
 * 首图超过 1:2 时按 1:2 计算高度，缩略图只显示局部。
 */
export function computeMultiImageGalleryHeight(
  containerWidth: number,
  ratios?: Array<number | undefined>,
) {
  const maxHeight = MULTI_IMAGE_GALLERY_MAX_HEIGHT
  if (!(containerWidth > 0))
    return maxHeight

  const firstRatio = getClampedThumbnailRatio(ratios?.[0]) ?? 1
  const usableCount = Math.max(1, ratios?.length || 1)
  if (usableCount < 2) {
    return Math.min(maxHeight, Math.max(1, Math.round(containerWidth / firstRatio)))
  }

  const peek = getMultiImageGalleryPeekWidth(containerWidth)
  const height = Math.round((containerWidth - MULTI_IMAGE_GALLERY_GAP - peek) / firstRatio)
  return Math.min(maxHeight, Math.max(1, height))
}

/**
 * 九宫格只展示完整的三列行；非完整行（1/2/4/5/7/8 图）继续使用横向画廊。
 */
export function shouldUseMomentImageGrid(images: string[] | undefined, isNineGrid?: boolean) {
  const count = images?.length || 0
  return Boolean(
    isNineGrid
    && count >= NINE_GRID_COLUMNS
    && count <= NINE_GRID_COLUMNS ** 2
    && count % NINE_GRID_COLUMNS === 0,
  )
}

export function computeMomentImageGridHeight(containerWidth: number, imageCount: number) {
  if (!(containerWidth > 0) || imageCount <= 0)
    return 0

  const rows = Math.ceil(imageCount / NINE_GRID_COLUMNS)
  const cellSize = Math.max(
    1,
    (containerWidth - NINE_GRID_GAP * (NINE_GRID_COLUMNS - 1)) / NINE_GRID_COLUMNS,
  )
  return Math.round(cellSize * rows + NINE_GRID_GAP * (rows - 1))
}

export function shouldUseMomentImageGallery(
  images: string[] | undefined,
  options?: {
    isVideo?: boolean
    isLive?: boolean
    imageRatio?: number
    imageRatios?: Array<number | undefined>
  },
) {
  if (options?.isVideo || options?.isLive || !images?.length)
    return false
  if (images.length > 1)
    return true
  return isPortraitImageRatio(options?.imageRatios?.[0] ?? options?.imageRatio)
}

export function getMultiImageThumbnailWidth(ratio: number | undefined, height: number) {
  const safeRatio = getClampedThumbnailRatio(ratio) ?? 1
  return Math.min(1600, Math.max(360, Math.round(height * safeRatio * 2)))
}

export function isPortraitImageRatio(ratio?: number): ratio is number {
  return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 && ratio < 1
}

export function getPortraitThumbnailRatio(ratio?: number) {
  if (!isPortraitImageRatio(ratio))
    return PORTRAIT_THUMBNAIL_MIN_RATIO
  return Math.max(PORTRAIT_THUMBNAIL_MIN_RATIO, ratio)
}

export function getOwnPortraitThumbnailImages(moment: DisplayMoment) {
  if (moment.isVideo || moment.isLive || (moment.isChargeExclusive && !moment.images.length))
    return []
  return moment.images.length === 1 ? moment.images : []
}

export function getForwardPortraitThumbnailImages(moment: DisplayMoment) {
  if (moment.isVideo || moment.isLive)
    return []
  return moment.forward?.images?.length === 1 ? moment.forward.images : []
}

export function getPortraitThumbnailImages(moment: DisplayMoment) {
  const ownImages = getOwnPortraitThumbnailImages(moment)
  return ownImages.length ? ownImages : getForwardPortraitThumbnailImages(moment)
}

export function isOwnPortraitMomentLayout(moment: DisplayMoment, ratio?: number) {
  return getOwnPortraitThumbnailImages(moment).length > 0 && isPortraitImageRatio(ratio)
}

export function isForwardPortraitMomentLayout(moment: DisplayMoment, ratio?: number) {
  return getForwardPortraitThumbnailImages(moment).length > 0 && isPortraitImageRatio(ratio)
}

export function isPortraitMomentLayout(moment: DisplayMoment, ratio?: number) {
  return isOwnPortraitMomentLayout(moment, ratio) || isForwardPortraitMomentLayout(moment, ratio)
}
