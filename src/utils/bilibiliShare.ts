export const BILIBILI_SHARE_ADAPTER_VERSION = '1.0.0'
export const BILIBILI_SHARE_SOURCE = 'copy_web'

const VIDEO_PATH_PATTERN = /^\/video\/(BV[0-9A-Z]{10})\/?(?:[?#].*)?$/i
const BILIBILI_IMAGE_HOSTS = [
  'hdslb.com',
  'biliimg.com',
  'bilivideo.com',
  'bstarstatic.com',
] as const
const MAX_UNTRUSTED_TEXT_LENGTH = 512
const MAX_TAG_TEXT_LENGTH = 40
const PLAYER_VIDEO_SELECTOR = [
  '#bilibiliPlayer video',
  '#bilibili-player video',
  '.bpx-player-container video',
  '.bilibili-player video',
  '.bilibili-player-video-wrap video',
  '.player-container video',
  '#playerWrap video',
  '#bofqi video',
  '[aria-label="哔哩哔哩播放器"] video',
].join(', ')
const MINI_PLAYER_SELECTOR = '[data-screen="mini"], .mini-player'
const PLAYER_ROOT_PRIORITY = [
  '#bilibili-player',
  '#bilibiliPlayer',
  '.bpx-player-container',
  '.bilibili-player',
  '.bilibili-player-video-wrap',
  '.player-container',
  '#playerWrap',
  '#bofqi',
  '[aria-label="哔哩哔哩播放器"]',
] as const

export interface ShareCapabilities {
  qr: boolean
  poster: boolean
  copy: boolean
  webShare: boolean
  nativeFallback: boolean
  download: boolean
}

export interface VideoShareSession {
  adapterVersion: string
  bvid: string
  title: string
  coverUrl: string
  coverState: 'available' | 'unavailable'
  owner: string
  tags?: string[]
  duration: number
  currentTime: number
  withTimestamp: boolean
  url: string
  text: string
  capabilities: ShareCapabilities
}

export interface ShareOutputPolicy {
  enabled?: boolean
  includeTitle?: boolean
  removeTrackingParams?: boolean
  cleanUrl?: (url: string) => string
  cleanText?: (
    text: string,
    options: { includeTitle?: boolean, removeTrackingParams?: boolean },
  ) => string
}

export interface ShareLocationLike {
  protocol?: string
  hostname?: string
  pathname?: string
  href?: string
}

function normalizeText(value: unknown, maxLength?: number): string {
  if (typeof value !== 'string')
    return ''

  const normalized: string[] = []
  let count = 0
  for (const character of value) {
    if (maxLength !== undefined && count >= maxLength)
      break
    const code = character.codePointAt(0) ?? 0
    normalized.push(code < 0x20 || code === 0x7F ? ' ' : character)
    count++
  }

  return normalized.join('').replace(/\s+/g, ' ').trim()
}

function asText(value: unknown, maxLength = MAX_UNTRUSTED_TEXT_LENGTH): string {
  return normalizeText(value, maxLength)
}

function asTitle(value: unknown): string {
  return normalizeText(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function firstString(...values: unknown[]): string {
  return values.map(value => asText(value)).find(Boolean) ?? ''
}

function firstTitleString(...values: unknown[]): string {
  return values.map(value => asTitle(value)).find(Boolean) ?? ''
}

function normalizeComparableTitle(value: unknown): string {
  return firstTitleString(value)
    .replace(
      /\s*[_｜|]\s*(?:哔哩哔哩|bilibili)(?:\s*[_｜|]\s*bilibili)?\s*$/i,
      '',
    )
    .trim()
}

function getPageWindow(
  root: Document,
): (Window & { __INITIAL_STATE__?: unknown }) | null {
  return root.defaultView as (Window & { __INITIAL_STATE__?: unknown }) | null
}

function getInitialStateVideoData(
  root: Document,
): Record<string, unknown> | null {
  const pageWindow = getPageWindow(root)
  const state = asRecord(pageWindow?.__INITIAL_STATE__)
  return asRecord(state?.videoData)
}

function extractBvidFromUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    return ''

  try {
    const url = new URL(value, 'https://www.bilibili.com/')
    const hostname = url.hostname.toLowerCase()
    if (
      url.protocol !== 'https:'
      || !['www.bilibili.com', 'player.bilibili.com'].includes(hostname)
    ) {
      return ''
    }

    const pathBvid = extractBvid(url.pathname)
    if (pathBvid)
      return pathBvid

    const queryBvid
      = url.searchParams.get('bvid') || url.searchParams.get('bv_id') || ''
    return hostname === 'player.bilibili.com' && isValidBvid(queryBvid)
      ? queryBvid
      : ''
  }
  catch {
    return ''
  }
}

function getMetadataVideoBvids(root: Document): string[] {
  const values = [
    root.querySelector('meta[property="og:url"]')?.getAttribute('content'),
    root.querySelector('meta[property="og:video"]')?.getAttribute('content'),
    root
      .querySelector('meta[property="og:video:secure_url"]')
      ?.getAttribute('content'),
    root.querySelector('link[rel="canonical"]')?.getAttribute('href'),
  ]
  return values.map(extractBvidFromUrl).filter(Boolean)
}

function getVideoPageNumber(root: Document): number {
  const search = root.defaultView?.location?.search ?? ''
  const value = Number(new URLSearchParams(search).get('p'))
  return Number.isInteger(value) && value > 0 ? value : 1
}

function isVideoDataPageCurrent(
  root: Document,
  videoData: Record<string, unknown>,
): boolean {
  const statePage = Number(videoData.page ?? videoData.p)
  if (
    Number.isInteger(statePage)
    && statePage > 0
    && statePage !== getVideoPageNumber(root)
  ) {
    return false
  }

  const pages = Array.isArray(videoData.pages) ? videoData.pages : []
  if (!pages.length)
    return true

  const selectedPage = asRecord(pages[getVideoPageNumber(root) - 1])
  const selectedCid = Number(selectedPage?.cid)
  const currentCid = Number(videoData.cid)
  if (
    Number.isFinite(selectedCid)
    && Number.isFinite(currentCid)
    && selectedCid > 0
    && currentCid > 0
  ) {
    return selectedCid === currentCid
  }

  return true
}

function getDomVideoTitles(root: Document): string[] {
  return [
    root.querySelector('.video-info-title')?.textContent,
    root.querySelector('h1.video-title')?.getAttribute('data-title'),
    root.querySelector('h1.video-title')?.textContent,
  ]
    .map(normalizeComparableTitle)
    .filter(Boolean)
}

function getVideoData(
  root: Document,
  expectedBvid: string,
): Record<string, unknown> {
  const videoData = getInitialStateVideoData(root) ?? {}
  const stateBvid = asText(videoData.bvid)
  return stateBvid.toLowerCase() === expectedBvid.toLowerCase()
    ? videoData
    : {}
}

function readMeta(
  root: Document,
  selector: string,
  attribute = 'content',
): string {
  return asText(root.querySelector(selector)?.getAttribute(attribute))
}

function readImageSource(element: Element | null): string {
  if (!element)
    return ''

  const image = element as HTMLImageElement
  return firstString(
    image.currentSrc,
    image.src,
    element.getAttribute('data-src'),
  )
}

function isAllowedBilibiliImageHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return BILIBILI_IMAGE_HOSTS.some(
    host => normalized === host || normalized.endsWith(`.${host}`),
  )
}

function isValidBvid(value: string): boolean {
  return (
    value.startsWith('BV')
    && value.length === 12
    && /^[0-9A-Z]{10}$/i.test(value.slice(2))
  )
}

export function extractBvid(pathname: string | undefined): string {
  const match = String(pathname ?? '').match(VIDEO_PATH_PATTERN)
  const bvid = match?.[1] ?? ''
  return isValidBvid(bvid) ? bvid : ''
}

export function isSupportedVideoPage(
  locationLike?: ShareLocationLike | null,
): boolean {
  if (!locationLike || String(locationLike.protocol).toLowerCase() !== 'https:')
    return false
  if (String(locationLike.hostname).toLowerCase() !== 'www.bilibili.com')
    return false

  return Boolean(extractBvid(locationLike.pathname))
}

export function isCurrentVideoPageReady(
  root: Document,
  expectedBvid: string,
): boolean {
  if (!isValidBvid(expectedBvid))
    return false

  const expected = expectedBvid.toLowerCase()
  const stateVideoData = getInitialStateVideoData(root)
  const metadataBvids = getMetadataVideoBvids(root)
  const domTitles = getDomVideoTitles(root)
  if (!domTitles.length)
    return false

  if (stateVideoData) {
    // 有 videoData 但没有可验证 BVID 时，不能把过渡期旧 DOM 当成当前视频。
    const stateBvid = asText(stateVideoData.bvid)
    if (stateBvid.toLowerCase() !== expected)
      return false
    if (!isVideoDataPageCurrent(root, stateVideoData))
      return false

    const stateTitle = normalizeComparableTitle(stateVideoData.title)
    if (stateTitle && domTitles.some(title => title !== stateTitle))
      return false

    // state 的 BVID 和标题已确认时，允许 canonical/OG 在 SPA 更新中暂时落后。
    return true
  }

  if (
    !metadataBvids.length
    || metadataBvids.some(bvid => bvid.toLowerCase() !== expected)
  ) {
    return false
  }

  const metadataTitle = normalizeComparableTitle(
    readMeta(root, 'meta[property="og:title"]'),
  )
  return !metadataTitle || domTitles.every(title => title === metadataTitle)
}

export function normalizeCoverUrl(
  value: unknown,
  base = 'https://www.bilibili.com/',
): string {
  const source = asText(value)
  if (!source || /^data:/i.test(source))
    return ''

  try {
    const url = new URL(source, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return ''
    if (
      url.username
      || url.password
      || !isAllowedBilibiliImageHost(url.hostname)
    ) {
      return ''
    }

    url.protocol = 'https:'
    return url.href
  }
  catch {
    return ''
  }
}

function isVisible(element: Element | null): boolean {
  if (!element || !element.isConnected)
    return false

  const view = element.ownerDocument.defaultView
  const style = view?.getComputedStyle(element)
  if (
    style
    && (style.display === 'none'
      || style.visibility === 'hidden'
      || Number.parseFloat(style.opacity || '1') <= 0)
  ) {
    return false
  }

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function isCovered(element: Element): boolean {
  if (!isVisible(element))
    return true

  const elementFromPoint = element.ownerDocument.elementFromPoint
  if (typeof elementFromPoint !== 'function')
    return false

  const rect = element.getBoundingClientRect()
  const point = {
    x: rect.left + Math.min(rect.width / 2, 12),
    y: rect.top + rect.height / 2,
  }
  const top = elementFromPoint.call(element.ownerDocument, point.x, point.y)
  return Boolean(top && top !== element && !element.contains(top))
}

function isInVideoToolbar(element: Element): boolean {
  return Boolean(
    element.closest(
      '.video-share-wrap, .video-toolbar, .video-info, #viewbox_report, .bpx-player-control-wrap',
    ),
  )
}

function hasNativeShareLabel(element: Element): boolean {
  const label = [
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
  ]
    .map(value => asText(value))
    .join(' ')

  return /点击复制|复制(?:链接|网址)?|分享|share|copy/i.test(label)
}

function isUsableShareEntry(
  element: Element | null,
  requireLabel: boolean,
): element is HTMLElement {
  return Boolean(
    element
    && isNativeShareEntryEnabled(element)
    && isVisible(element)
    && !isCovered(element)
    && isInVideoToolbar(element)
    && (!requireLabel || hasNativeShareLabel(element)),
  )
}

export function isNativeShareEntryEnabled(
  element: Element | null,
): element is HTMLElement {
  if (!element || !element.isConnected)
    return false

  let current: Element | null = element
  while (current) {
    if (
      current.hasAttribute('hidden')
      || current.hasAttribute('inert')
      || current.hasAttribute('disabled')
      || current.getAttribute('aria-hidden')?.toLowerCase() === 'true'
      || current.getAttribute('aria-disabled')?.toLowerCase() === 'true'
    ) {
      return false
    }
    current = current.parentElement
  }

  return isVisible(element) && !element.matches(':disabled')
}

export function findNativeShareEntry(root?: ParentNode): HTMLElement | null {
  const searchRoot
    = root ?? (typeof document !== 'undefined' ? document : null)
  if (!searchRoot)
    return null

  const preferred = searchRoot.querySelector('#share-btn-outer.video-share')
  if (isUsableShareEntry(preferred, false))
    return preferred

  const contextualSelectors = [
    '.video-share-wrap.video-toolbar-left-item .video-share',
    '.video-share-wrap .video-share',
    '.video-toolbar .video-share',
  ]
  for (const selector of contextualSelectors) {
    for (const element of Array.from(searchRoot.querySelectorAll(selector))) {
      if (isUsableShareEntry(element, true))
        return element
    }
  }

  const candidates = Array.from(
    searchRoot.querySelectorAll('[class*="video-share"], [id*="share-btn"]'),
  )
  for (const element of candidates) {
    if (isUsableShareEntry(element, true))
      return element
  }

  return null
}

function isMiniPlayer(player: HTMLVideoElement): boolean {
  return Boolean(player.closest(MINI_PLAYER_SELECTOR))
}

function getPlayerRootPriority(player: HTMLVideoElement): number {
  const priority = PLAYER_ROOT_PRIORITY.findIndex(selector =>
    player.closest(selector),
  )
  return priority === -1 ? PLAYER_ROOT_PRIORITY.length : priority
}

function getPlayerArea(player: HTMLVideoElement): number {
  const rect = player.getBoundingClientRect()
  return Math.max(0, rect.width * rect.height)
}

function getActivePlayerScore(player: HTMLVideoElement): number {
  const ready
    = player.readyState > 0 && Number.isFinite(player.currentTime) ? 1 : 0
  const playing = player.paused === false && player.ended !== true ? 1 : 0
  return (
    (PLAYER_ROOT_PRIORITY.length - getPlayerRootPriority(player)) * 1_000_000
    + Math.min(getPlayerArea(player), 2_000_000)
    + ready * 10_000
    + playing * 5_000
  )
}

export function findActivePlayer(root?: ParentNode): HTMLVideoElement | null {
  const searchRoot
    = root ?? (typeof document !== 'undefined' ? document : null)
  if (!searchRoot)
    return null

  const players = Array.from(
    searchRoot.querySelectorAll<HTMLVideoElement>(PLAYER_VIDEO_SELECTOR),
  ).filter(isVisible)
  if (!players.length)
    return null

  const nonMiniPlayers = players.filter(player => !isMiniPlayer(player))
  const candidates = nonMiniPlayers.length ? nonMiniPlayers : players
  return candidates.reduce(
    (best, player) => {
      if (!best || getActivePlayerScore(player) > getActivePlayerScore(best))
        return player
      return best
    },
    null as HTMLVideoElement | null,
  )
}

export function readCurrentTime(root?: ParentNode): number {
  const player = findActivePlayer(root)
  const value = Number(player?.currentTime)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function readPageImage(root: Document): string {
  const selectors = [
    '.video-cover img',
    '.cover-picture img',
    '.b-img__inner[src*="hdslb.com"]',
    'img[src*="hdslb.com"]',
  ]
  const base = root.defaultView?.location?.href

  for (const selector of selectors) {
    const source = normalizeCoverUrl(
      readImageSource(root.querySelector(selector)),
      base,
    )
    if (source)
      return source
  }

  return ''
}

function readTitle(root: Document, videoData: Record<string, unknown>): string {
  const candidates = {
    state: videoData.title,
    info: root.querySelector('.video-info-title')?.textContent,
    h1: root.querySelector('h1.video-title')?.textContent,
    videoTitle: root.querySelector('.video-title')?.textContent,
    meta: readMeta(root, 'meta[property="og:title"]'),
    document: root.title,
  }
  const raw = firstTitleString(
    candidates.state,
    candidates.info,
    candidates.h1,
    candidates.videoTitle,
    candidates.meta,
    candidates.document,
  )

  return normalizeComparableTitle(raw)
}

function readOwner(root: Document, videoData: Record<string, unknown>): string {
  const owner = asRecord(videoData.owner)
  const ownerName = firstString(owner?.name, owner?.uname)
  if (ownerName)
    return ownerName

  for (const selector of [
    '.up-name',
    '.up-info .name',
    '.user-name',
    'a[href*="space.bilibili.com"]',
  ]) {
    const value = asText(root.querySelector(selector)?.textContent)
    if (value)
      return value
  }

  return ''
}

function normalizeTags(value: unknown): string[] {
  const values = (Array.isArray(value) ? value : [value]).slice(0, 16)
  return values
    .map((item) => {
      if (typeof item === 'string')
        return asText(item, MAX_TAG_TEXT_LENGTH)

      const record = asRecord(item)
      return (
        [record?.tag_name, record?.name, record?.title, record?.label]
          .map(tag => asText(tag, MAX_TAG_TEXT_LENGTH))
          .find(Boolean) ?? ''
      )
    })
    .filter(Boolean)
}

function readTags(
  root: Document,
  videoData: Record<string, unknown>,
): string[] {
  const dataTags = normalizeTags(
    videoData.tags ?? videoData.tag ?? videoData.tname,
  )
  if (dataTags.length)
    return Array.from(new Set(dataTags)).slice(0, 4)

  const container = root.querySelector('.video-tag-container, #v_tag')
  const domTags = Array.from(
    container?.querySelectorAll('a, button, span') ?? [],
  )
    .map(element => asText(element.textContent))
    .filter(value => value.length > 0 && value.length <= 40)

  return Array.from(new Set(domTags)).slice(0, 4)
}

function readCover(root: Document, videoData: Record<string, unknown>): string {
  const base = root.defaultView?.location?.href
  const dataUrl = normalizeCoverUrl(videoData.pic, base)
  if (dataUrl)
    return dataUrl

  const shareCover = root.querySelector(
    '.video-share-popover .video-capture .b-img__inner, .video-share-popover .video-capture img',
  )
  const sharePopover = shareCover
    ? shareCover.closest('.video-share-popover')
    : null
  const shareUrl = normalizeCoverUrl(
    isVisible(sharePopover) ? readImageSource(shareCover) : '',
    base,
  )
  if (shareUrl)
    return shareUrl

  const metaUrl = normalizeCoverUrl(
    readMeta(root, 'meta[property="og:image"]'),
    base,
  )
  if (metaUrl)
    return metaUrl

  return readPageImage(root)
}

function readDuration(
  root: Document,
  videoData: Record<string, unknown>,
): number {
  const dataDuration = Number(videoData.duration)
  if (Number.isFinite(dataDuration) && dataDuration >= 0)
    return dataDuration

  const player = findActivePlayer(root)
  const playerDuration = Number(player?.duration)
  return Number.isFinite(playerDuration) && playerDuration >= 0
    ? playerDuration
    : 0
}

export function formatTimestamp(seconds: unknown): string {
  const numeric = Number(seconds)
  const value = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const remainder = value % 60

  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function buildBilibiliShareUrl(
  bvid: string,
  currentTime = 0,
  withTimestamp = false,
): string {
  const normalizedBvid = String(bvid).trim()
  if (!isValidBvid(normalizedBvid))
    throw new TypeError('Invalid BVID')

  const url = new URL(`/video/${normalizedBvid}/`, 'https://www.bilibili.com')
  url.searchParams.set('share_source', BILIBILI_SHARE_SOURCE)
  if (withTimestamp) {
    const numericTime = Number(currentTime)
    const timestamp = Number.isFinite(numericTime)
      ? Math.max(0, Math.floor(numericTime))
      : 0
    url.searchParams.set('t', String(timestamp))
  }

  return url.href
}

export function buildShareText(
  title: unknown,
  url: string,
  currentTime = 0,
  withTimestamp = false,
): string {
  const safeTitle = asTitle(title) || 'Bilibili 视频'
  const timestamp = withTimestamp
    ? ` 【精准空降到 ${formatTimestamp(currentTime)}】`
    : ''
  return `【${safeTitle}】${timestamp} ${url}`
}

function applyShareOutputPolicy(
  title: string,
  canonicalUrl: string,
  currentTime: number,
  withTimestamp: boolean,
  policy?: ShareOutputPolicy,
): { url: string, text: string } {
  const canonicalText = buildShareText(
    title,
    canonicalUrl,
    currentTime,
    withTimestamp,
  )
  if (!policy?.enabled)
    return { url: canonicalUrl, text: canonicalText }

  let url = canonicalUrl
  if (policy.removeTrackingParams && policy.cleanUrl) {
    try {
      url = policy.cleanUrl(canonicalUrl)
    }
    catch {
      url = canonicalUrl
    }
  }

  if (policy.cleanText) {
    try {
      return {
        url,
        // 先放入规范链接，避免标题自身包含 URL 时被 cleaner 误当成目标链接。
        text: policy.cleanText(`${canonicalUrl} ${canonicalText}`, {
          includeTitle: policy.includeTitle,
          removeTrackingParams: policy.removeTrackingParams,
        }),
      }
    }
    catch {
      // Keep the canonical text if a user-configured cleaner cannot run.
    }
  }

  return {
    url,
    text: policy.includeTitle ? `【${title}】 ${url}` : url,
  }
}

export function createShareSession(
  root?: Document,
  locationLike?: ShareLocationLike | null,
  policy?: ShareOutputPolicy,
  options?: { requireCurrentPage?: boolean },
): VideoShareSession | null {
  const documentRoot
    = root ?? (typeof document !== 'undefined' ? document : null)
  const currentLocation
    = locationLike
      ?? (typeof globalThis.location !== 'undefined' ? globalThis.location : null)
  if (
    !documentRoot
    || !currentLocation
    || !isSupportedVideoPage(currentLocation)
  ) {
    return null
  }

  const bvid = extractBvid(currentLocation.pathname)
  if (!bvid)
    return null
  if (
    options?.requireCurrentPage
    && !isCurrentVideoPageReady(documentRoot, bvid)
  ) {
    return null
  }

  const videoData = getVideoData(documentRoot, bvid)
  const title = readTitle(documentRoot, videoData) || bvid
  const coverUrl = readCover(documentRoot, videoData)
  const owner = readOwner(documentRoot, videoData)
  const tags = readTags(documentRoot, videoData)
  const duration = readDuration(documentRoot, videoData)
  const currentTime = readCurrentTime(documentRoot)
  const withTimestamp = false
  const canonicalUrl = buildBilibiliShareUrl(bvid, currentTime, withTimestamp)
  const output = applyShareOutputPolicy(
    title,
    canonicalUrl,
    currentTime,
    withTimestamp,
    policy,
  )
  const browserNavigator
    = typeof navigator !== 'undefined' ? navigator : undefined

  return {
    adapterVersion: BILIBILI_SHARE_ADAPTER_VERSION,
    bvid,
    title,
    coverUrl,
    coverState: coverUrl ? 'available' : 'unavailable',
    owner,
    tags,
    duration,
    currentTime,
    withTimestamp,
    url: output.url,
    text: output.text,
    capabilities: {
      qr: true,
      poster: typeof document !== 'undefined',
      copy: typeof browserNavigator?.clipboard?.writeText === 'function',
      webShare: typeof browserNavigator?.share === 'function',
      nativeFallback: true,
      download: typeof document !== 'undefined',
    },
  }
}

export function updateShareSession(
  session: VideoShareSession,
  currentTime: unknown,
  withTimestamp = session.withTimestamp,
  policy?: ShareOutputPolicy,
): VideoShareSession {
  const numericTime = Number(currentTime)
  const time
    = Number.isFinite(numericTime) && numericTime >= 0 ? numericTime : 0
  const safeTitle = asTitle(session.title) || session.bvid
  const canonicalUrl = buildBilibiliShareUrl(session.bvid, time, withTimestamp)
  const output = applyShareOutputPolicy(
    safeTitle,
    canonicalUrl,
    time,
    withTimestamp,
    policy,
  )

  return {
    ...session,
    title: safeTitle,
    currentTime: time,
    withTimestamp,
    url: output.url,
    text: output.text,
  }
}
