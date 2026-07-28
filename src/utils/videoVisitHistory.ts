import { shallowRef } from 'vue'
import browser from 'webextension-polyfill'

import { settings, settingsReady } from '~/logic'

export const VIDEO_VISIT_HISTORY_MAX_ENTRIES = 10_000

const VIDEO_VISIT_HISTORY_STORAGE_KEY = 'bewlycat_video_visit_history'
const LEGACY_VIDEO_VISIT_HISTORY_STORAGE_KEY = 'videoVisitHistory'
const VIDEO_VISIT_HISTORY_MIGRATION_KEY = 'bewlycat_video_visit_history_migrated'

export type VideoVisitHistory = Record<string, number>

export interface VideoIdentity {
  aid?: number | string
  bvid?: string
  id?: number | string
}

function getVideoHistoryKeys(video: VideoIdentity): string[] {
  const keys: string[] = []
  const bvid = video.bvid?.trim()

  if (bvid)
    keys.push(`bv:${bvid.toLowerCase()}`)

  const aid = String(video.aid ?? video.id ?? '').trim()
  if (/^[1-9]\d*$/.test(aid))
    keys.push(`av:${aid}`)

  return keys
}

export function pruneVideoVisitHistory(history: VideoVisitHistory): VideoVisitHistory {
  return Object.fromEntries(
    Object.entries(history)
      .filter(([, visitedAt]) => Number.isFinite(visitedAt) && visitedAt > 0)
      .sort(([, leftVisitedAt], [, rightVisitedAt]) => rightVisitedAt - leftVisitedAt)
      .slice(0, VIDEO_VISIT_HISTORY_MAX_ENTRIES),
  )
}

function parseVideoVisitHistory(rawValue: unknown): VideoVisitHistory {
  try {
    const value = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return {}

    return pruneVideoVisitHistory(value as VideoVisitHistory)
  }
  catch {
    return {}
  }
}

function readVideoVisitHistory(): VideoVisitHistory {
  try {
    return parseVideoVisitHistory(localStorage.getItem(VIDEO_VISIT_HISTORY_STORAGE_KEY))
  }
  catch {
    return {}
  }
}

const videoVisitHistory = shallowRef<VideoVisitHistory>(readVideoVisitHistory())
let settingsLoaded = false

void settingsReady.then(() => {
  settingsLoaded = true
})

function persistVideoVisitHistory(history: VideoVisitHistory) {
  const normalizedHistory = pruneVideoVisitHistory(history)
  videoVisitHistory.value = normalizedHistory

  try {
    localStorage.setItem(VIDEO_VISIT_HISTORY_STORAGE_KEY, JSON.stringify(normalizedHistory))
  }
  catch (error) {
    console.warn('[BewlyCat] Failed to persist video visit history.', error)
  }
}

function migrateLegacyVideoVisitHistory() {
  try {
    if (localStorage.getItem(VIDEO_VISIT_HISTORY_MIGRATION_KEY) === '1')
      return
  }
  catch {
    return
  }

  void browser.storage.local.get(LEGACY_VIDEO_VISIT_HISTORY_STORAGE_KEY)
    .then((result) => {
      const legacyHistory = parseVideoVisitHistory(result[LEGACY_VIDEO_VISIT_HISTORY_STORAGE_KEY])
      const mergedHistory = { ...legacyHistory, ...videoVisitHistory.value }

      Object.entries(legacyHistory).forEach(([key, visitedAt]) => {
        mergedHistory[key] = Math.max(visitedAt, videoVisitHistory.value[key] ?? 0)
      })

      persistVideoVisitHistory(mergedHistory)
      localStorage.setItem(VIDEO_VISIT_HISTORY_MIGRATION_KEY, '1')
    })
    .catch(error => console.warn('[BewlyCat] Failed to migrate video visit history.', error))
}

migrateLegacyVideoVisitHistory()

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === VIDEO_VISIT_HISTORY_STORAGE_KEY)
      videoVisitHistory.value = parseVideoVisitHistory(event.newValue)
  })
}

export function recordVideoVisit(video: VideoIdentity, visitedAt = Date.now()): boolean {
  if (!settingsLoaded || !settings.value.showVideoWatchedBadge)
    return false

  const keys = getVideoHistoryKeys(video)
  if (!keys.length)
    return false

  const nextHistory = { ...videoVisitHistory.value }
  keys.forEach((key) => {
    nextHistory[key] = Math.max(nextHistory[key] ?? 0, visitedAt)
  })
  persistVideoVisitHistory(nextHistory)
  return true
}

export function getVideoIdentityFromUrl(url: string): VideoIdentity | undefined {
  try {
    const urlObject = new URL(url)
    if (urlObject.hostname !== 'bilibili.com' && !urlObject.hostname.endsWith('.bilibili.com'))
      return undefined

    const bvidPathMatch = urlObject.pathname.match(/\/(BV[a-z0-9]+)(?:\/|$)/i)
    const bvid = urlObject.searchParams.get('bvid') || bvidPathMatch?.[1]
    const aidPathMatch = urlObject.pathname.match(/\/av(\d+)(?:\/|$)/i)
    const aid = urlObject.searchParams.get('avid') || urlObject.searchParams.get('aid') || aidPathMatch?.[1]

    if (bvid || aid)
      return { bvid: bvid || undefined, aid: aid || undefined }
  }
  catch {
    return undefined
  }

  return undefined
}

export function recordVideoVisitFromUrl(url: string, visitedAt = Date.now()): boolean {
  const identity = getVideoIdentityFromUrl(url)
  return identity ? recordVideoVisit(identity, visitedAt) : false
}

export function wasVideoVisited(video: VideoIdentity): boolean {
  return getVideoHistoryKeys(video).some(key => Number.isFinite(videoVisitHistory.value[key]))
}
