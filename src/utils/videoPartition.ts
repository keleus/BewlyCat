import type { VideoPartition } from '~/constants/videoPartitions'
import { getPgcVideoPartition, getUgcVideoPartition } from '~/constants/videoPartitions'
import type { VideoInfo } from '~/models/video/videoInfo'
import api from '~/utils/api'

interface VideoPartitionLookup {
  aid?: number
  bvid?: string
  epid?: number
  seasonId?: number
}

interface AnimeDetailResponse {
  code: number
  result?: {
    season_type?: number
    type?: number
  }
}

const MAX_CONCURRENT_REQUESTS = 2
const MIN_REQUEST_START_INTERVAL_MS = 400
const partitionCache = new Map<string, Promise<VideoPartition | undefined>>()
const pendingSlots: Array<() => void> = []
let activeRequestCount = 0
let lastRequestStartedAt = 0
let requestStartTimer: ReturnType<typeof setTimeout> | undefined

function getLookupKey({ aid, bvid, epid, seasonId }: VideoPartitionLookup) {
  const normalizedBvid = bvid?.trim()
  if (normalizedBvid)
    return `bvid:${normalizedBvid}`
  if (aid)
    return `aid:${aid}`
  if (epid)
    return `epid:${epid}`
  if (seasonId)
    return `season:${seasonId}`
  return undefined
}

function startPendingRequests() {
  if (activeRequestCount >= MAX_CONCURRENT_REQUESTS || pendingSlots.length === 0 || requestStartTimer)
    return

  const delay = Math.max(0, lastRequestStartedAt + MIN_REQUEST_START_INTERVAL_MS - Date.now())
  if (delay > 0) {
    requestStartTimer = setTimeout(() => {
      requestStartTimer = undefined
      startPendingRequests()
    }, delay)
    return
  }

  activeRequestCount++
  lastRequestStartedAt = Date.now()
  pendingSlots.shift()?.()
  startPendingRequests()
}

async function acquireRequestSlot() {
  await new Promise<void>((resolve) => {
    pendingSlots.push(resolve)
    startPendingRequests()
  })
}

function releaseRequestSlot() {
  activeRequestCount--
  startPendingRequests()
}

function createFallbackPartition(tidV2: number | undefined, name: string | undefined): VideoPartition | undefined {
  const normalizedName = name?.trim()
  if (!normalizedName)
    return undefined

  return {
    id: tidV2 || 0,
    name: normalizedName,
    url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(normalizedName)}`,
  }
}

async function requestVideoPartition(lookup: VideoPartitionLookup): Promise<VideoPartition | undefined> {
  await acquireRequestSlot()

  try {
    if ((lookup.epid || lookup.seasonId) && !lookup.bvid && !lookup.aid) {
      const response: AnimeDetailResponse = await api.anime.getAnimeDetail({
        ep_id: lookup.epid,
        season_id: lookup.seasonId,
      })
      if (response.code !== 0 || !response.result)
        return undefined

      return getPgcVideoPartition(response.result.season_type ?? response.result.type)
    }

    const response: VideoInfo = await api.video.getVideoInfo({
      aid: lookup.bvid ? undefined : lookup.aid?.toString(),
      bvid: lookup.bvid || undefined,
    })
    if (response.code !== 0 || !response.data)
      return undefined

    const tidV2 = response.data.tid_v2 ?? response.data.tidv2
    return getUgcVideoPartition(tidV2)
      ?? createFallbackPartition(tidV2, response.data.tname_v2 ?? response.data.tnamev2 ?? response.data.tname)
  }
  catch {
    return undefined
  }
  finally {
    releaseRequestSlot()
  }
}

export function loadVideoPartition(lookup: VideoPartitionLookup): Promise<VideoPartition | undefined> {
  const key = getLookupKey(lookup)
  if (!key)
    return Promise.resolve(undefined)

  const cached = partitionCache.get(key)
  if (cached)
    return cached

  const request = requestVideoPartition(lookup).then((partition) => {
    if (!partition)
      partitionCache.delete(key)
    return partition
  })
  partitionCache.set(key, request)
  return request
}
