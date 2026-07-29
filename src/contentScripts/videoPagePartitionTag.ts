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
  const selectors = [
    '.video-tag-container .tag-panel',
    '#v_tag .tag-panel',
    '.video-tag-container .tag-area',
    '#v_tag .tag-area',
    '.video-tag-container',
    '#v_tag',
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

function findNativeTagTemplate(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(':scope > .tag'))
    .find(element => !element.classList.contains(PARTITION_TAG_CLASS)
      && element.querySelector('.ordinary-tag .tag-link'))
}

function createPartitionTag(partition: VideoPartition, template?: HTMLElement) {
  const tag = (template?.cloneNode(true) as HTMLElement | undefined) ?? document.createElement('div')
  tag.classList.add('tag', 'not-btn-tag', PARTITION_TAG_CLASS)
  tag.dataset.partitionId = partition.id.toString()

  let ordinaryTag = tag.querySelector<HTMLElement>('.ordinary-tag')
  if (!ordinaryTag) {
    ordinaryTag = document.createElement('div')
    ordinaryTag.className = 'ordinary-tag'
    tag.replaceChildren(ordinaryTag)
  }

  let link = ordinaryTag.querySelector<HTMLAnchorElement>('a.tag-link')
  if (!link) {
    link = document.createElement('a')
    link.className = 'tag-link'
    ordinaryTag.replaceChildren(link)
  }

  link.href = partition.url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = partition.name
  return tag
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

  const nativeTagTemplate = findNativeTagTemplate(panel)
  if (existingTag) {
    const isMissingNativeStructure = !existingTag.querySelector('.ordinary-tag')
      || Array.from(nativeTagTemplate?.attributes ?? [])
        .some(attribute => attribute.name.startsWith('data-v-') && !existingTag.hasAttribute(attribute.name))
    if (nativeTagTemplate && isMissingNativeStructure)
      existingTag.replaceWith(createPartitionTag(partition, nativeTagTemplate))
    return true
  }

  panel.prepend(createPartitionTag(partition, nativeTagTemplate))
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
