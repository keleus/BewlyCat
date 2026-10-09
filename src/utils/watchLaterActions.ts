import { reactive } from 'vue'
import { useToast } from 'vue-toastification'

import { getWatchLaterAid, isInWatchLater, markWatchLater } from '~/logic/watchLaterState'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { i18n } from '~/utils/i18n'
import { getCSRF } from '~/utils/main'
import { resolvePgcEpisodeVideoIds } from '~/utils/pgcEpisode'
import type { WatchLaterTarget } from '~/utils/watchLaterSnapshot'

/**
 * 全站「加入稍后再看」的共享动作层：
 * 状态判断与缓存见 ~/logic/watchLaterState，这里只负责增删切换、loading 去重、
 * PGC 解析、bvid 补查 aid 以及成功后的顶栏同步。封面按钮与视频页工具栏按钮共用。
 */

/** 同一视频在封面上可能只有 bvid，移除接口只认 aid；解析结果在本页缓存。 */
const bvidAidCache = new Map<string, number>()
/** 按视频去重的进行中请求，同一视频的多个入口（卡片/弹窗/其他标签镜像）不会并发提交。 */
const loadingKeys = reactive(new Set<string>())

export function getWatchLaterTargetKey(target: WatchLaterTarget | null | undefined): string {
  if (!target)
    return ''
  const aid = Number(target.aid || 0)
  if (aid)
    return `aid:${aid}`
  if (target.bvid)
    return `bvid:${target.bvid}`
  return target.epid ? `epid:${target.epid}` : ''
}

/**
 * 将卡片数据规整为稍后再看目标。
 * 仅在 aid/bvid/epid 都缺失时才把 id 当作 aid，调用方需通过 target 门控排除直播等
 * id 语义不同的卡片。
 */
export function normalizeWatchLaterTarget(input: {
  aid?: number | string
  // 卡片数据常用 `id` 作为兜底字段
  id?: number | string
  bvid?: string
  epid?: number
} | null | undefined): WatchLaterTarget | undefined {
  if (!input)
    return undefined
  // 追番卡片的 id 来自 module_author.mid（剧集 SeasonId），不能覆盖分集 epid。
  const fallbackAid = !input.bvid && !input.epid ? input.id : undefined
  const aid = Number(input.aid || fallbackAid || 0)
  if (aid || input.bvid || input.epid)
    return { aid: aid || undefined, bvid: input.bvid, epid: input.epid }
  return undefined
}

export function isWatchLaterTargetLoading(target: WatchLaterTarget | null | undefined): boolean {
  const key = getWatchLaterTargetKey(target)
  return Boolean(key) && loadingKeys.has(key)
}

function translate(key: string): string {
  return i18n.global.t(key)
}

/** 普通入口弹 toast；silent 入口（视频页工具栏按钮）只打控制台告警。 */
function reportError(message: string, silent: boolean) {
  if (silent)
    console.warn(message)
  else
    useToast().error(message)
}

function notifyTopBarChanged() {
  const refresh = () => {
    try {
      void useTopBarStore().syncWatchLaterState(true).catch((error) => {
        console.error('刷新顶栏稍后再看状态失败:', error)
      })
    }
    catch (error) {
      console.error('刷新顶栏稍后再看状态失败:', error)
    }
  }

  // 立即同步一次；B 站写入偶尔有短暂延迟，再补一次最终状态。
  refresh()
  window.setTimeout(refresh, 1000)
}

async function resolveAidByBvid(bvid: string): Promise<number | undefined> {
  const cached = bvidAidCache.get(bvid)
  if (cached)
    return cached

  const result: any = await api.video.getVideoInfo({ bvid })
  const aid = result?.code === 0 && Number.isFinite(result.data?.aid)
    ? Number(result.data.aid)
    : undefined
  if (aid)
    bvidAidCache.set(bvid, aid)
  return aid
}

export interface ToggleWatchLaterOptions {
  /** 静默模式只输出告警/错误日志，不弹 toast（用于视频页原生工具栏注入按钮） */
  silent?: boolean
}

/**
 * 切换目标视频的稍后再看状态。
 * @returns 本次接口调用是否成功；目标无效、已在进行中或未登录时返回 false
 */
export async function toggleWatchLaterTarget(
  target: WatchLaterTarget | null | undefined,
  options: ToggleWatchLaterOptions = {},
): Promise<boolean> {
  const { silent = false } = options
  const key = getWatchLaterTargetKey(target)
  if (!target || !key || loadingKeys.has(key))
    return false

  const csrf = getCSRF()
  if (!csrf) {
    if (silent)
      console.warn('未登录或缺少 CSRF，不能更新稍后再看')
    else
      useToast().warning(translate('common.please_log_in_first'))
    return false
  }

  loadingKeys.add(key)
  try {
    let aid = Number(target.aid || 0) || getWatchLaterAid(target) || 0
    let bvid = target.bvid

    if (!aid && !bvid && target.epid) {
      const ids = await resolvePgcEpisodeVideoIds(target.epid)
      if (!ids) {
        reportError(translate('video_card.episode_watch_later_info_failed'), silent)
        return false
      }
      aid = ids.aid
      bvid = ids.bvid
    }

    const added = isInWatchLater(target)
    if (!added) {
      const response = await api.watchlater.saveToWatchLater({ aid: aid || undefined, bvid, csrf })
      if (response.code !== 0) {
        reportError(response.message, silent)
        return false
      }
      markWatchLater({ aid: aid || undefined, bvid, epid: target.epid }, true)
    }
    else {
      if (!aid) {
        if (bvid)
          aid = await resolveAidByBvid(bvid) ?? 0
        if (!aid) {
          reportError(translate('moments.watch_later_info_failed'), silent)
          return false
        }
      }

      const response = await api.watchlater.removeFromWatchLater({ aid, csrf })
      if (response.code !== 0) {
        reportError(response.message, silent)
        return false
      }
      markWatchLater({ aid, bvid, epid: target.epid }, false)
    }

    notifyTopBarChanged()
    return true
  }
  catch (error) {
    console.error('更新稍后再看状态失败:', error)
    reportError(
      error instanceof Error ? error.message : translate('moments.watch_later_operation_failed'),
      silent,
    )
    return false
  }
  finally {
    loadingKeys.delete(key)
  }
}
