import type { Video } from '~/components/VideoCard/types'
import { useStorageLocal } from '~/composables/useStorageLocal'

export const VIDEO_VISIT_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
export const VIDEO_VISIT_HISTORY_MAX_ENTRIES = 1000

export type VideoVisitHistory = Record<string, number>

type VideoIdentity = Partial<Pick<Video, 'aid' | 'bvid' | 'id'>>

function getVideoHistoryKeys(video: VideoIdentity): string[] {
  const keys: string[] = []

  if (video.bvid?.trim())
    keys.push(`bv:${video.bvid.trim().toLowerCase()}`)

  const aid = video.aid ?? video.id
  if (typeof aid === 'number' && Number.isFinite(aid) && aid > 0)
    keys.push(`av:${aid}`)

  return keys
}

function getPreferredVideoHistoryKey(video: VideoIdentity): string | undefined {
  return getVideoHistoryKeys(video)[0]
}

export function pruneVideoVisitHistory(history: VideoVisitHistory, now = Date.now()): VideoVisitHistory {
  const expiresBefore = now - VIDEO_VISIT_HISTORY_RETENTION_MS

  return Object.fromEntries(
    Object.entries(history)
      .filter(([, visitedAt]) =>
        Number.isFinite(visitedAt) && visitedAt >= expiresBefore,
      )
      .sort(([, leftVisitedAt], [, rightVisitedAt]) => rightVisitedAt - leftVisitedAt)
      .slice(0, VIDEO_VISIT_HISTORY_MAX_ENTRIES),
  )
}

let storageReady = false
const pendingVisits = new Map<string, number>()

const videoVisitHistory = useStorageLocal<VideoVisitHistory>('videoVisitHistory', {}, {
  writeDefaults: false,
  onReady: (history) => {
    storageReady = true

    const hadPendingVisits = pendingVisits.size > 0
    pendingVisits.forEach((visitedAt, key) => {
      history[key] = Math.max(history[key] ?? 0, visitedAt)
    })
    pendingVisits.clear()

    const normalizedHistory = pruneVideoVisitHistory(history)
    if (hadPendingVisits || Object.keys(normalizedHistory).length !== Object.keys(history).length) {
      queueMicrotask(() => {
        videoVisitHistory.value = normalizedHistory
      })
    }
  },
})

function recordVideoVisit(video: VideoIdentity, visitedAt = Date.now()): boolean {
  const key = getPreferredVideoHistoryKey(video)
  if (!key)
    return false

  if (!storageReady) {
    pendingVisits.set(key, Math.max(pendingVisits.get(key) ?? 0, visitedAt))
    return true
  }

  const nextHistory = { ...videoVisitHistory.value }
  nextHistory[key] = visitedAt
  videoVisitHistory.value = pruneVideoVisitHistory(nextHistory, visitedAt)
  return true
}

export function getVideoIdentityFromUrl(url: string): VideoIdentity | undefined {
  try {
    const urlObject = new URL(url)
    if (urlObject.hostname !== 'bilibili.com' && !urlObject.hostname.endsWith('.bilibili.com'))
      return undefined

    const bvidPathMatch = urlObject.pathname.match(/\/(BV[a-z0-9]+)(?:\/|$)/i)
    const bvid = urlObject.searchParams.get('bvid') || bvidPathMatch?.[1]
    if (bvid)
      return { bvid }

    const aidPathMatch = urlObject.pathname.match(/\/av(\d+)(?:\/|$)/i)
    const aidText = urlObject.searchParams.get('avid') || urlObject.searchParams.get('aid') || aidPathMatch?.[1]
    if (aidText) {
      const aid = Number.parseInt(aidText, 10)
      if (Number.isFinite(aid) && aid > 0)
        return { aid, id: aid }
    }
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

export function wasVideoVisitedRecently(video: VideoIdentity, now = Date.now()): boolean {
  const expiresBefore = now - VIDEO_VISIT_HISTORY_RETENTION_MS

  return getVideoHistoryKeys(video).some((key) => {
    const visitedAt = videoVisitHistory.value[key]
    return Number.isFinite(visitedAt) && visitedAt >= expiresBefore
  })
}
