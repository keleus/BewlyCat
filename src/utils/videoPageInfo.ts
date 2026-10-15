import api from '~/utils/api'
import { getBilibiliPathname } from '~/utils/bilibiliLocale'

/** 普通视频页当前稿件的分 P 数与合集归属。 */
export interface VideoPageInfo {
  videoId: string
  pageCount: number
  inSeason: boolean
}

const VIDEO_ID_PATTERN = /^\/video\/(bv[0-9a-z]{10}|av\d+)\/?$/i

// 同一稿件换 P 只改 URL 的 p 参数，按稿件缓存即可避免重复请求。
let cachedInfo: VideoPageInfo | null = null
let pendingVideoId: string | null = null
let pendingRequest: Promise<VideoPageInfo | null> | null = null

function getCurrentVideoId(url = location.href): string | null {
  try {
    const videoId = getBilibiliPathname(url).match(VIDEO_ID_PATTERN)?.[1]
    if (!videoId)
      return null
    return /^av/i.test(videoId) ? `av${videoId.slice(2)}` : `BV${videoId.slice(2)}`
  }
  catch {
    return null
  }
}

/** 当前分 P 序号（从 1 开始）。B 站第一 P 常省略 p 参数。 */
export function getCurrentVideoPageNumber(url = location.href): number {
  try {
    const page = Number.parseInt(new URL(url).searchParams.get('p') ?? '', 10)
    return Number.isSafeInteger(page) && page > 0 ? page : 1
  }
  catch {
    return 1
  }
}

/** 只返回属于当前稿件的缓存；接口结果未到或失败时为 null，由调用方走 DOM 兜底。 */
export function getCachedCurrentVideoPageInfo(): VideoPageInfo | null {
  const videoId = getCurrentVideoId()
  return videoId && cachedInfo?.videoId === videoId ? cachedInfo : null
}

async function fetchVideoPageInfo(videoId: string): Promise<VideoPageInfo | null> {
  try {
    const params = videoId.startsWith('av') ? { aid: videoId.slice(2) } : { bvid: videoId }
    const result: any = await api.video.getVideoInfo(params)
    if (result?.code !== 0 || !result.data)
      return null

    const pageCount = (Array.isArray(result.data.pages) ? result.data.pages.length : 0)
      || Number(result.data.videos)
      || 1
    return {
      videoId,
      pageCount,
      inSeason: !!result.data.ugc_season,
    }
  }
  catch {
    return null
  }
}

export function loadCurrentVideoPageInfo(): Promise<VideoPageInfo | null> {
  const videoId = getCurrentVideoId()
  if (!videoId)
    return Promise.resolve(null)
  if (cachedInfo?.videoId === videoId)
    return Promise.resolve(cachedInfo)
  if (pendingRequest && pendingVideoId === videoId)
    return pendingRequest

  const request = fetchVideoPageInfo(videoId).then((info) => {
    if (info)
      cachedInfo = info
    return info
  }).finally(() => {
    if (pendingRequest === request) {
      pendingRequest = null
      pendingVideoId = null
    }
  })
  pendingVideoId = videoId
  pendingRequest = request
  return request
}
