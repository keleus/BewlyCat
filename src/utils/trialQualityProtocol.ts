export const TRIAL_QUALITY_PAGE_REQUEST = 'BEWLY_TRIAL_QUALITY_REQUEST'
export const TRIAL_QUALITY_PAGE_RESPONSE = 'BEWLY_TRIAL_QUALITY_RESPONSE'
export const TRIAL_QUALITY_PAGE_RESET = 'BEWLY_TRIAL_QUALITY_RESET'
export const TRIAL_QUALITY_FETCH_STREAMS_MESSAGE = 'fetchTrialQualityStreams'
export const TRIAL_STREAM_USER_AGENT = 'Bilibili Freedoooooom/MarkII'
// 同时供 Chromium 的 RE2 规则与普通正则使用，覆盖带端口的 CDN 地址。
export const TRIAL_STREAM_URL_REGEX_SOURCE = '^https://[a-zA-Z0-9.-]+\\.bilivideo\\.(com|cn)(:[0-9]+)?/.*[?&]platform=android(&|$)'
export const TRIAL_STREAM_DEADLINE_MARGIN_SECONDS = 600

export interface TrialQualityPageRequest {
  requestId: number
  cid: number
  aid?: number
  bvid?: string
}

export interface FetchTrialQualityRequest {
  accessKey: string
  cid: number
  aid?: number
  bvid?: string
}

export interface TrialQualityResult {
  ok: boolean
  entries: WebDashVideoEntry[]
  deadline: number | null
  reason?: string
}

export interface TrialQualityPageResponse extends TrialQualityResult {
  requestId: number
  cid: number
}

export interface TrialStream {
  quality: number
  format: string
  description: string
  needVip: boolean
  vipFree: boolean
  codecid: number
  width: number
  height: number
  bandwidth: number
  frameRate: string
  size: number
  audioId: number
  urls: string[]
}

/** 网页播放器兼容两种字段命名。标记仅用于识别扩展补入的条目。 */
export interface WebDashVideoEntry {
  id: number
  baseUrl: string
  base_url: string
  backupUrl: string[]
  backup_url: string[]
  bandwidth: number
  mimeType: 'video/mp4'
  mime_type: 'video/mp4'
  codecs: string
  width: number
  height: number
  frameRate: string
  frame_rate: string
  sar: string
  startWithSap: number
  start_with_sap: number
  SegmentBase: { Initialization: string, indexRange: string }
  segment_base: { initialization: string, index_range: string }
  codecid: number
  __bewlyTrial: true
}

export function isTrialRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function isTrialVipQualityEnabled(value: unknown): boolean {
  try {
    const settings = typeof value === 'string' ? JSON.parse(value) : value
    return isTrialRecord(settings) && settings.trialVipQuality === true
  }
  catch {
    return false
  }
}

export function isTrialStreamUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      && /\.bilivideo\.(?:com|cn)$/i.test(url.hostname)
      && url.searchParams.get('platform') === 'android'
  }
  catch {
    return false
  }
}

export function isTrialQualityPageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'www.bilibili.com'
      && /^\/(?:video\/|list\/|medialist\/play\/)/.test(url.pathname)
  }
  catch {
    return false
  }
}

export function getStreamDeadline(value: string): number | null {
  try {
    const deadline = Number(new URL(value).searchParams.get('deadline'))
    return isPositiveSafeInteger(deadline) ? deadline : null
  }
  catch {
    return null
  }
}

export function normalizeTrialQualityPageRequest(value: unknown): TrialQualityPageRequest | null {
  if (!isTrialRecord(value) || !isPositiveSafeInteger(value.requestId) || !isPositiveSafeInteger(value.cid))
    return null
  if (value.aid !== undefined && !isPositiveSafeInteger(value.aid))
    return null
  if (value.bvid !== undefined && (typeof value.bvid !== 'string' || !/^BV[0-9A-Za-z]{10}$/.test(value.bvid)))
    return null
  return { requestId: value.requestId, cid: value.cid, aid: value.aid as number | undefined, bvid: value.bvid as string | undefined }
}

/** 页面消息始终视为不可信输入，拒绝任意域名、异常条目与无界数组。 */
export function isWebDashVideoEntry(value: unknown): value is WebDashVideoEntry {
  if (!isTrialRecord(value) || value.__bewlyTrial !== true || value.codecid !== 7
    || !isPositiveSafeInteger(value.id) || !isPositiveSafeInteger(value.width)
    || !isPositiveSafeInteger(value.height) || !isPositiveSafeInteger(value.bandwidth)
    || typeof value.baseUrl !== 'string' || !isTrialStreamUrl(value.baseUrl) || value.base_url !== value.baseUrl
    || !Array.isArray(value.backupUrl) || value.backupUrl.length > 8
    || !value.backupUrl.every(url => typeof url === 'string' && isTrialStreamUrl(url))
    || !Array.isArray(value.backup_url) || value.backup_url.length !== value.backupUrl.length
    || !value.backup_url.every((url, index) => url === (value.backupUrl as unknown[])[index])
    || value.mimeType !== 'video/mp4' || value.mime_type !== 'video/mp4'
    || typeof value.codecs !== 'string' || !/^avc1\.[0-9A-F]{6}$/i.test(value.codecs)
    || typeof value.frameRate !== 'string' || value.frame_rate !== value.frameRate
    || !isTrialRecord(value.SegmentBase) || !isTrialRecord(value.segment_base)) {
    return false
  }
  const { Initialization: initialization, indexRange } = value.SegmentBase
  if (typeof initialization !== 'string' || !/^0-\d{1,8}$/.test(initialization)
    || typeof indexRange !== 'string' || !/^\d{1,8}-\d{1,8}$/.test(indexRange)) {
    return false
  }
  const initializationEnd = Number(initialization.split('-')[1])
  const [indexStart, indexEnd] = indexRange.split('-').map(Number)
  return initializationEnd < indexStart && indexStart <= indexEnd && indexEnd < 65536
    && value.segment_base.initialization === initialization && value.segment_base.index_range === indexRange
    && value.sar === '1:1' && value.startWithSap === 1 && value.start_with_sap === 1
}
