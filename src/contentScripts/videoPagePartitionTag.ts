import { watch } from 'vue'

import { VIDEO_PAGE_PARTITION_DATA_REQUEST, VIDEO_PAGE_PARTITION_DATA_RESPONSE } from '~/constants/globalEvents'
import type { VideoPartition } from '~/constants/videoPartitions'
import { getPgcVideoPartition, getUgcVideoPartition, PGC_VIDEO_PARTITIONS, UGC_VIDEO_PARTITIONS } from '~/constants/videoPartitions'
import { settings } from '~/logic'
import { isVideoOrBangumiPage } from '~/utils/main'

interface VideoPageLookup {
  aid?: number
  bvid?: string
  epid?: number
  seasonId?: number
}

interface VideoPagePartitionPayload extends VideoPageLookup {
  requestId: number
  url: string
  seasonType?: number
  tidV2?: number
  tnameV2?: string
}

const PARTITION_TAG_CLASS = 'bewly-video-page-partition-tag'
const PARTITION_TAG_HOST_CLASS = 'bewly-video-page-partition-host'
const PARTITION_TAG_STYLE_ID = 'bewly-video-page-partition-style'
const PARTITION_TAG_WIDTH_PROPERTY = '--bewly-video-page-partition-width'
const PARTITION_TAG_HEIGHT_PROPERTY = '--bewly-video-page-partition-height'
const RETRY_INTERVAL_MS = 500
const MAX_RETRY_COUNT = 30
const ALL_PGC_PARTITIONS = Object.values(PGC_VIDEO_PARTITIONS) as readonly VideoPartition[]

let refreshToken = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let currentPartition: VideoPartition | undefined
let hasInitialized = false

function parsePositiveInteger(value: unknown) {
  if (value === undefined || value === null || value === '')
    return undefined

  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

function getVideoPageLookup(url: string): VideoPageLookup | undefined {
  try {
    const { pathname } = new URL(url)
    const videoMatch = pathname.match(/^\/video\/(BV[0-9a-z]+|av(\d+))(?:\/|$)/i)
    if (videoMatch) {
      if (videoMatch[2])
        return { aid: parsePositiveInteger(videoMatch[2]) }
      return { bvid: videoMatch[1] }
    }

    const bangumiMatch = pathname.match(/^\/bangumi\/play\/(ep|ss)(\d+)(?:\/|$)/i)
    if (!bangumiMatch)
      return undefined

    const id = parsePositiveInteger(bangumiMatch[2])
    if (!id)
      return undefined
    return bangumiMatch[1].toLowerCase() === 'ep' ? { epid: id } : { seasonId: id }
  }
  catch {
    return undefined
  }
}

function normalizePartitionPayload(value: unknown): VideoPagePartitionPayload | undefined {
  if (!value || typeof value !== 'object')
    return undefined

  const payload = value as Record<string, unknown>
  const requestId = parsePositiveInteger(payload.requestId)
  if (!requestId || typeof payload.url !== 'string')
    return undefined

  return {
    requestId,
    url: payload.url,
    aid: parsePositiveInteger(payload.aid),
    bvid: typeof payload.bvid === 'string' ? payload.bvid.trim() : undefined,
    epid: parsePositiveInteger(payload.epid),
    seasonId: parsePositiveInteger(payload.seasonId),
    seasonType: parsePositiveInteger(payload.seasonType),
    tidV2: parsePositiveInteger(payload.tidV2),
    tnameV2: typeof payload.tnameV2 === 'string' ? payload.tnameV2.trim() : undefined,
  }
}

function payloadMatchesLookup(payload: VideoPagePartitionPayload, lookup: VideoPageLookup) {
  if (lookup.bvid)
    return payload.bvid?.toLocaleLowerCase() === lookup.bvid.toLocaleLowerCase()
  if (lookup.aid)
    return payload.aid === lookup.aid
  if (lookup.epid)
    return payload.epid === lookup.epid
  if (lookup.seasonId)
    return payload.seasonId === lookup.seasonId
  return false
}

function createFallbackPartition(id: number | undefined, name: string | undefined) {
  const normalizedName = name?.trim()
  if (!normalizedName)
    return undefined

  return {
    id: id ?? 0,
    name: normalizedName,
    url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(normalizedName)}`,
  }
}

function getPartitionFromPayload(payload: VideoPagePartitionPayload, lookup: VideoPageLookup) {
  if (!payloadMatchesLookup(payload, lookup))
    return undefined

  if (lookup.epid || lookup.seasonId)
    return getPgcVideoPartition(payload.seasonType)

  return getUgcVideoPartition(payload.tidV2)
    ?? createFallbackPartition(payload.tidV2, payload.tnameV2)
}

function removePartitionTags() {
  document.querySelectorAll(`body > .${PARTITION_TAG_CLASS}`).forEach(element => element.remove())
  document.querySelectorAll<HTMLElement>(`.${PARTITION_TAG_HOST_CLASS}`).forEach((panel) => {
    panel.classList.remove(PARTITION_TAG_HOST_CLASS)
    panel.style.removeProperty(PARTITION_TAG_WIDTH_PROPERTY)
    panel.style.removeProperty(PARTITION_TAG_HEIGHT_PROPERTY)
  })
}

function findTagPanel() {
  const selectors = [
    '.video-tag-container .tag-panel',
    '#v_tag .tag-panel',
    '.video-tag-container .tag-area',
    '#v_tag .tag-area',
  ]

  for (const selector of selectors) {
    const panel = document.querySelector<HTMLElement>(selector)
    if (panel)
      return panel
  }

  return null
}

function hasNativeTagWithLabel(panel: HTMLElement, label: string) {
  const normalizedLabel = label.trim().toLocaleLowerCase()
  return Array.from(panel.querySelectorAll<HTMLElement>('a.tag-link, .tag-link'))
    .some(element => !element.closest(`.${PARTITION_TAG_CLASS}`)
      && element.textContent?.trim().toLocaleLowerCase() === normalizedLabel)
}

function getNativePartition(panel: HTMLElement, lookup: VideoPageLookup) {
  const candidates = lookup.epid || lookup.seasonId ? ALL_PGC_PARTITIONS : UGC_VIDEO_PARTITIONS

  for (const link of Array.from(panel.querySelectorAll<HTMLAnchorElement>('a.tag-link'))) {
    if (link.closest(`.${PARTITION_TAG_CLASS}`))
      continue

    let pathname = ''
    try {
      pathname = new URL(link.href, location.href).pathname.replace(/\/$/, '')
    }
    catch {
      // Ignore malformed native links.
    }

    const partition = candidates.find((candidate) => {
      const candidatePath = new URL(candidate.url).pathname.replace(/\/$/, '')
      return Boolean(pathname) && candidatePath === pathname
    })
    if (partition)
      return partition
  }

  return undefined
}

function findNativeTagTemplate(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(':scope > .tag'))
    .find(element => element.querySelector('.ordinary-tag .tag-link'))
}

function ensurePartitionTagStyle() {
  if (document.getElementById(PARTITION_TAG_STYLE_ID))
    return

  const style = document.createElement('style')
  style.id = PARTITION_TAG_STYLE_ID
  style.textContent = `
    .${PARTITION_TAG_HOST_CLASS}::before {
      content: '';
      display: inline-block;
      box-sizing: border-box;
      width: var(${PARTITION_TAG_WIDTH_PROPERTY}, 0px);
      min-width: var(${PARTITION_TAG_WIDTH_PROPERTY}, 0px);
      height: var(${PARTITION_TAG_HEIGHT_PROPERTY}, 24px);
      flex: 0 0 var(${PARTITION_TAG_WIDTH_PROPERTY}, 0px);
      vertical-align: top;
    }

    .${PARTITION_TAG_CLASS} {
      position: absolute;
      z-index: 20;
      display: inline-flex;
      box-sizing: border-box;
      align-items: center;
      justify-content: center;
      height: var(${PARTITION_TAG_HEIGHT_PROPERTY}, 24px);
      padding: 0 12px;
      border: 0;
      border-radius: 6px;
      background: var(--bg2, #f1f2f3);
      color: var(--text2, #61666d);
      font: 400 12px/16px Arial, Helvetica, sans-serif;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
      transition: color 0.2s ease, background-color 0.2s ease;
    }

    .${PARTITION_TAG_CLASS}:hover {
      background: var(--graph_bg_thin, #e3e5e7);
      color: var(--brand_blue, #00aeec);
    }
  `
  const styleHost = document.head ?? document.documentElement
  styleHost.appendChild(style)
}

function clearPartitionTagHost(panel: HTMLElement) {
  panel.classList.remove(PARTITION_TAG_HOST_CLASS)
  panel.style.removeProperty(PARTITION_TAG_WIDTH_PROPERTY)
  panel.style.removeProperty(PARTITION_TAG_HEIGHT_PROPERTY)
}

function getOrCreatePartitionTag() {
  const existingTag = document.querySelector<HTMLAnchorElement>(`body > .${PARTITION_TAG_CLASS}`)
  if (existingTag)
    return existingTag
  if (!document.body)
    return undefined

  const tag = document.createElement('a')
  tag.className = PARTITION_TAG_CLASS
  tag.target = '_blank'
  tag.rel = 'noopener noreferrer'
  document.body.appendChild(tag)
  return tag
}

function insertPartitionTag(partition: VideoPartition) {
  const panel = findTagPanel()
  if (!panel)
    return false

  if (hasNativeTagWithLabel(panel, partition.name)) {
    removePartitionTags()
    return true
  }

  const nativeTagTemplate = findNativeTagTemplate(panel)
  if (!nativeTagTemplate)
    return false

  ensurePartitionTagStyle()
  const tag = getOrCreatePartitionTag()
  if (!tag)
    return false

  document.querySelectorAll<HTMLElement>(`.${PARTITION_TAG_HOST_CLASS}`).forEach((host) => {
    if (host !== panel)
      clearPartitionTagHost(host)
  })
  clearPartitionTagHost(panel)

  const anchorRect = nativeTagTemplate.getBoundingClientRect()
  if (anchorRect.width <= 0 || anchorRect.height <= 0) {
    tag.hidden = true
    return false
  }

  tag.hidden = false
  tag.dataset.partitionId = partition.id.toString()
  tag.href = partition.url
  tag.textContent = partition.name
  tag.style.setProperty(PARTITION_TAG_HEIGHT_PROPERTY, `${anchorRect.height}px`)
  tag.style.left = `${window.scrollX + anchorRect.left}px`
  tag.style.top = `${window.scrollY + anchorRect.top}px`

  const panelStyle = getComputedStyle(panel)
  const nativeTagStyle = getComputedStyle(nativeTagTemplate)
  const isGapLayout = /^(?:flex|grid|inline-flex|inline-grid)$/.test(panelStyle.display)
    && Number.parseFloat(panelStyle.columnGap) > 0
  const nativeEndMargin = Number.parseFloat(nativeTagStyle.marginRight)
  const spacing = isGapLayout ? 0 : (Number.isFinite(nativeEndMargin) ? nativeEndMargin : 8)
  const reservedWidth = Math.ceil(tag.getBoundingClientRect().width + spacing)

  panel.style.setProperty(PARTITION_TAG_WIDTH_PROPERTY, `${reservedWidth}px`)
  panel.style.setProperty(PARTITION_TAG_HEIGHT_PROPERTY, `${anchorRect.height}px`)
  panel.classList.add(PARTITION_TAG_HOST_CLASS)
  return true
}

function requestPagePartitionData(token: number) {
  window.postMessage({
    type: VIDEO_PAGE_PARTITION_DATA_REQUEST,
    data: { requestId: token },
  }, '*')
}

function schedulePartitionTagRefresh(token: number, attempt = 0) {
  if (token !== refreshToken || !settings.value.showVideoPagePartitionTag || !isVideoOrBangumiPage())
    return

  const lookup = getVideoPageLookup(location.href)
  if (!lookup)
    return

  const panel = findTagPanel()
  currentPartition ??= panel ? getNativePartition(panel, lookup) : undefined

  if (currentPartition)
    insertPartitionTag(currentPartition)
  else
    requestPagePartitionData(token)

  if (attempt >= MAX_RETRY_COUNT)
    return

  retryTimer = setTimeout(() => {
    retryTimer = undefined
    schedulePartitionTagRefresh(token, attempt + 1)
  }, RETRY_INTERVAL_MS)
}

function handlePagePartitionData(event: MessageEvent) {
  if (event.source !== window || event.data?.type !== VIDEO_PAGE_PARTITION_DATA_RESPONSE)
    return

  const payload = normalizePartitionPayload(event.data.data)
  if (
    !payload
    || payload.requestId !== refreshToken
    || !settings.value.showVideoPagePartitionTag
    || !isVideoOrBangumiPage(payload.url)
  ) {
    return
  }

  const lookup = getVideoPageLookup(location.href)
  if (!lookup)
    return

  const partition = getPartitionFromPayload(payload, lookup)
  if (!partition)
    return

  currentPartition = partition
  insertPartitionTag(partition)
}

export function refreshVideoPagePartitionTag() {
  refreshToken++
  const token = refreshToken
  currentPartition = undefined

  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
  removePartitionTags()

  if (!settings.value.showVideoPagePartitionTag || !isVideoOrBangumiPage())
    return

  if (!getVideoPageLookup(location.href))
    return

  schedulePartitionTagRefresh(token)
}

export function initVideoPagePartitionTag() {
  if (hasInitialized)
    return

  hasInitialized = true
  window.addEventListener('message', handlePagePartitionData)
  refreshVideoPagePartitionTag()
  watch(
    () => settings.value.showVideoPagePartitionTag,
    () => refreshVideoPagePartitionTag(),
  )
}
