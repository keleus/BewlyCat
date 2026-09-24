import { markWatchLater } from '~/logic/watchLaterState'
import api from '~/utils/api'
import { resolvePgcEpisodeVideoIds, resolvePgcSeasonVideoIds } from '~/utils/pgcEpisode'

const OPEN_TAB_ADD_INTERVAL_MS = 50

type WatchLaterTabTarget
  = { type: 'bvid', id: string }
    | { type: 'aid' | 'epid' | 'seasonId', id: number }

export interface AddOpenTabsResult {
  total: number
  added: number
  skipped: number
  failed: number
  message?: string
}

function positiveId(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value))
    return undefined

  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

/** 仅识别播放页，避免把搜索、空间等页面查询参数中的视频误加入列表。 */
export function parseWatchLaterTabUrl(value: string): WatchLaterTabTarget | undefined {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    return undefined
  }

  if (!['http:', 'https:'].includes(url.protocol)
    || !['www.bilibili.com', 'm.bilibili.com', 'bilibili.com'].includes(url.hostname)) {
    return undefined
  }

  const video = url.pathname.match(/^\/video\/(BV[\da-z]{10}|av\d+)\/?$/i)
  if (video) {
    if (/^bv/i.test(video[1]))
      return { type: 'bvid', id: `BV${video[1].slice(2)}` }

    const aid = positiveId(video[1].slice(2))
    return aid ? { type: 'aid', id: aid } : undefined
  }

  const pgc = url.pathname.match(/^\/bangumi\/play\/(ep|ss)(\d+)\/?$/)
  if (pgc) {
    const id = positiveId(pgc[2])
    return id ? { type: pgc[1] === 'ep' ? 'epid' : 'seasonId', id } : undefined
  }

  if (/^\/(?:list\/|medialist\/play\/)/.test(url.pathname)) {
    const bvid = url.searchParams.get('bvid')
    if (bvid && /^BV[\da-zA-Z]{10}$/.test(bvid))
      return { type: 'bvid', id: bvid }

    const aid = positiveId(url.searchParams.get('aid') || url.searchParams.get('avid'))
    if (aid)
      return { type: 'aid', id: aid }
  }

  // 旧版稍后再看播放器把当前视频放在 hash 中。
  if (/^\/watchlater\/?$/.test(url.pathname)) {
    const bvid = url.hash.match(/^#\/(BV[\da-zA-Z]{10})(?:[/?]|$)/)?.[1]
    if (bvid)
      return { type: 'bvid', id: bvid }
  }

  return undefined
}

async function resolveTarget(target: WatchLaterTabTarget) {
  switch (target.type) {
    case 'aid':
      return { aid: target.id }
    case 'bvid': {
      const response = await api.video.getVideoInfo({ bvid: target.id })
      const aid = Number(response.data?.aid)
      return response.code === 0 && Number.isSafeInteger(aid) && aid > 0 ? { aid } : undefined
    }
    case 'epid':
      return resolvePgcEpisodeVideoIds(target.id)
    case 'seasonId':
      return resolvePgcSeasonVideoIds(target.id)
  }
}

export async function addOpenTabsToWatchLater(
  urls: string[],
  csrf: string,
  isCurrentAccount: () => boolean,
  onProgress?: (progress: AddOpenTabsResult) => void,
): Promise<AddOpenTabsResult> {
  const targets = new Map<string, WatchLaterTabTarget>()
  for (const url of urls) {
    const target = parseWatchLaterTabUrl(url)
    if (target)
      targets.set(`${target.type}:${target.id}`, target)
  }

  const result: AddOpenTabsResult = { total: targets.size, added: 0, skipped: 0, failed: 0 }
  onProgress?.({ ...result })
  if (!targets.size || !isCurrentAccount())
    return result

  // 使用完整列表去重，浮层本身只加载了前几项。
  const response = await api.watchlater.getAllWatchLaterList()
  if (response.code !== 0 || !Array.isArray(response.data?.list))
    throw new Error(response.message || 'Failed to load Watch later')

  const existingAids = new Set<number>(response.data.list.map((item: { aid: number }) => Number(item.aid)))
  const existingBvids = new Set<string>(response.data.list.map((item: { bvid: string }) => item.bvid))

  // 串行处理，每项之间留出间隔，避免集中请求并让界面及时更新进度。
  for (const [index, target] of [...targets.values()].entries()) {
    if (!isCurrentAccount())
      break

    if (index > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, OPEN_TAB_ADD_INTERVAL_MS))
      if (!isCurrentAccount())
        break
    }

    try {
      if ((target.type === 'aid' && existingAids.has(target.id))
        || (target.type === 'bvid' && existingBvids.has(target.id))) {
        result.skipped++
        continue
      }

      const ids = await resolveTarget(target)
      if (!isCurrentAccount())
        break
      if (!ids?.aid) {
        result.failed++
        continue
      }
      if (existingAids.has(ids.aid)) {
        result.skipped++
        continue
      }

      const saved = await api.watchlater.saveToWatchLater({ aid: ids.aid, csrf })
      if (saved.code === 0) {
        existingAids.add(ids.aid)
        markWatchLater({
          aid: ids.aid,
          bvid: target.type === 'bvid' ? target.id : undefined,
          epid: target.type === 'epid' ? target.id : undefined,
        }, true)
        result.added++
      }
      else {
        result.failed++
        result.message ||= saved.message
        // 登录、风控或容量问题影响整批，停止剩余请求。
        if ([-101, -111, -412, 90001].includes(saved.code)) {
          result.failed = result.total - result.added - result.skipped
          break
        }
      }
    }
    catch (error) {
      console.error('Failed to add an open tab to Watch later:', error)
      result.failed++
    }
    finally {
      onProgress?.({ ...result })
    }
  }

  return result
}
