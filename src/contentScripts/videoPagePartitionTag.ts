import { watch } from 'vue'

import type { VideoPartition } from '~/constants/videoPartitions'
import { settings } from '~/logic'
import { isVideoOrBangumiPage } from '~/utils/main'
import { loadVideoPartition } from '~/utils/videoPartition'

interface VideoPageLookup {
  aid?: number
  bvid?: string
  epid?: number
  seasonId?: number
}

const PARTITION_TAG_CLASS = 'bewly-video-page-partition-tag'
const RETRY_INTERVAL_MS = 500
const MAX_RETRY_COUNT = 30

let refreshToken = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let hasInitialized = false

function parsePositiveInteger(value: string | undefined) {
  if (!value)
    return undefined

  const parsed = Number.parseInt(value, 10)
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

function removePartitionTags() {
  document.querySelectorAll(`.${PARTITION_TAG_CLASS}`).forEach(element => element.remove())
}

function findTagPanel() {
  return document.querySelector<HTMLElement>([
    '.video-tag-container .tag-panel',
    '#v_tag .tag-panel',
    '.video-tag-container .tag-area',
    '#v_tag .tag-area',
    '.video-tag-container',
    '#v_tag',
  ].join(','))
}

function hasNativeTagWithLabel(panel: HTMLElement, label: string) {
  const normalizedLabel = label.trim().toLocaleLowerCase()
  return Array.from(panel.querySelectorAll<HTMLElement>('a.tag-link, .tag-link'))
    .some(element => !element.closest(`.${PARTITION_TAG_CLASS}`)
      && element.textContent?.trim().toLocaleLowerCase() === normalizedLabel)
}

function insertPartitionTag(partition: VideoPartition) {
  const panel = findTagPanel()
  if (!panel)
    return false

  const existingTag = panel.querySelector<HTMLElement>(`.${PARTITION_TAG_CLASS}`)
  if (hasNativeTagWithLabel(panel, partition.name)) {
    existingTag?.remove()
    return true
  }

  if (existingTag)
    return true

  const tag = document.createElement('div')
  tag.className = `tag ${PARTITION_TAG_CLASS}`
  tag.dataset.partitionId = partition.id.toString()

  const link = document.createElement('a')
  link.className = 'tag-link'
  link.href = partition.url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = partition.name

  tag.appendChild(link)
  panel.prepend(tag)
  return true
}

function scheduleInsertion(partition: VideoPartition, token: number, attempt = 0) {
  if (token !== refreshToken || !settings.value.showVideoPagePartitionTag || !isVideoOrBangumiPage())
    return

  insertPartitionTag(partition)
  if (attempt >= MAX_RETRY_COUNT)
    return

  retryTimer = setTimeout(() => {
    retryTimer = undefined
    scheduleInsertion(partition, token, attempt + 1)
  }, RETRY_INTERVAL_MS)
}

export function refreshVideoPagePartitionTag() {
  refreshToken++
  const token = refreshToken

  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
  removePartitionTags()

  if (!settings.value.showVideoPagePartitionTag || !isVideoOrBangumiPage())
    return

  const lookup = getVideoPageLookup(location.href)
  if (!lookup)
    return

  void loadVideoPartition(lookup).then((partition) => {
    if (partition)
      scheduleInsertion(partition, token)
  })
}

export function initVideoPagePartitionTag() {
  if (hasInitialized)
    return

  hasInitialized = true
  refreshVideoPagePartitionTag()
  watch(
    () => settings.value.showVideoPagePartitionTag,
    () => refreshVideoPagePartitionTag(),
  )
}
