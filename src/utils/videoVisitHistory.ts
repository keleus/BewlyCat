import { shallowRef } from 'vue'
import browser from 'webextension-polyfill'

import { settings, settingsReady } from '~/logic'

export const VIDEO_VISIT_HISTORY_MAX_ENTRIES = 10_000

const VIDEO_VISIT_HISTORY_STORAGE_KEY = 'bewlycat_video_visit_history'
const LEGACY_VIDEO_VISIT_HISTORY_STORAGE_KEY = 'videoVisitHistory'
const VIDEO_VISIT_HISTORY_MIGRATION_KEY = 'bewlycat_video_visit_history_migrated'

/**
 * 仅打开过的视频只存访问时间；在视频页实际播放过的视频存
 * `[访问时间, 播放进度秒数, 视频时长秒数]`，用紧凑元组控制本地缓存体积。
 */
export type VideoVisitEntry = number | [visitedAt: number, progress: number, duration: number]
export type VideoVisitHistory = Record<string, VideoVisitEntry>

interface VideoWatchedState {
  status: 'watched'
  progress: number
  duration: number
  /** 播放进度百分比（0–100）。 */
  percentage: number
}

export type VideoWatchState = { status: 'browsed' } | VideoWatchedState

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

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function normalizeVideoVisitEntry(entry: unknown): VideoVisitEntry | undefined {
  if (isValidTimestamp(entry))
    return entry

  if (!Array.isArray(entry) || !isValidTimestamp(entry[0]))
    return undefined

  const [visitedAt, progress, duration] = entry
  if (!isValidTimestamp(duration) || typeof progress !== 'number' || !Number.isFinite(progress))
    return visitedAt

  return [visitedAt, Math.min(duration, Math.max(0, progress)), duration]
}

function getEntryVisitedAt(entry: VideoVisitEntry): number {
  return typeof entry === 'number' ? entry : entry[0]
}

export function pruneVideoVisitHistory(history: Record<string, unknown>): VideoVisitHistory {
  return Object.fromEntries(
    Object.entries(history)
      .map(([key, entry]) => [key, normalizeVideoVisitEntry(entry)] as const)
      .filter((item): item is readonly [string, VideoVisitEntry] => item[1] !== undefined)
      .sort(([, leftEntry], [, rightEntry]) => getEntryVisitedAt(rightEntry) - getEntryVisitedAt(leftEntry))
      .slice(0, VIDEO_VISIT_HISTORY_MAX_ENTRIES),
  )
}

/** 合并同一视频的两条记录：访问时间取较新者，播放进度取较新的一条。 */
function mergeVideoVisitEntry(current: VideoVisitEntry | undefined, next: VideoVisitEntry): VideoVisitEntry {
  if (current === undefined)
    return next

  const visitedAt = Math.max(getEntryVisitedAt(current), getEntryVisitedAt(next))
  const currentProgress = typeof current === 'number' ? undefined : current
  const nextProgress = typeof next === 'number' ? undefined : next
  const progressEntry = currentProgress && nextProgress
    ? (nextProgress[0] >= currentProgress[0] ? nextProgress : currentProgress)
    : nextProgress ?? currentProgress

  return progressEntry ? [visitedAt, progressEntry[1], progressEntry[2]] : visitedAt
}

function parseVideoVisitHistory(rawValue: unknown): VideoVisitHistory {
  try {
    const value = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return {}

    return pruneVideoVisitHistory(value as Record<string, unknown>)
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
      const mergedHistory = { ...videoVisitHistory.value }

      Object.entries(legacyHistory).forEach(([key, entry]) => {
        mergedHistory[key] = mergeVideoVisitEntry(mergedHistory[key], entry)
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

function recordVideoVisitEntry(video: VideoIdentity, entry: VideoVisitEntry): boolean {
  if (!settingsLoaded || !settings.value.showVideoWatchedBadge)
    return false

  const keys = getVideoHistoryKeys(video)
  if (!keys.length)
    return false

  const nextHistory = { ...videoVisitHistory.value }
  keys.forEach((key) => {
    nextHistory[key] = mergeVideoVisitEntry(nextHistory[key], entry)
  })
  persistVideoVisitHistory(nextHistory)
  return true
}

/** 记录视频已被打开（已浏览），保留此前的播放进度。 */
export function recordVideoVisit(video: VideoIdentity, visitedAt = Date.now()): boolean {
  return recordVideoVisitEntry(video, visitedAt)
}

/** 记录视频页的实际播放进度（已观看）。 */
export function recordVideoWatchProgress(
  video: VideoIdentity,
  progress: number,
  duration: number,
  visitedAt = Date.now(),
): boolean {
  if (!isValidTimestamp(duration) || !Number.isFinite(progress))
    return false

  const roundedDuration = Math.max(1, Math.round(duration))
  const roundedProgress = Math.min(roundedDuration, Math.max(0, Math.floor(progress)))
  return recordVideoVisitEntry(video, [visitedAt, roundedProgress, roundedDuration])
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

export function getVideoWatchState(video: VideoIdentity): VideoWatchState | undefined {
  let visited = false
  let latestProgress: [number, number, number] | undefined

  for (const key of getVideoHistoryKeys(video)) {
    const entry = videoVisitHistory.value[key]
    if (entry === undefined)
      continue

    visited = true
    if (typeof entry !== 'number' && (!latestProgress || entry[0] > latestProgress[0]))
      latestProgress = entry
  }

  if (latestProgress) {
    const [, progress, duration] = latestProgress
    return {
      status: 'watched',
      progress,
      duration,
      percentage: Math.min(100, Math.max(0, (progress / duration) * 100)),
    }
  }

  return visited ? { status: 'browsed' } : undefined
}
