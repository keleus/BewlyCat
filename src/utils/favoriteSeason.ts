/**
 * 收藏「订阅合集」相关工具
 * 供 Dock 新版收藏页与顶栏收藏弹层共用
 */

import type { FavoriteSeasonMedia } from '~/models/video/favoriteSeason'
import api from '~/utils/api'

const SEASON_PAGE_SIZE = 40
/** 防止异常接口一直返回满页时死循环 */
const MAX_SEASON_PAGES = 100

export interface FavoriteSeasonPlayTarget {
  seasonId: number
  link?: string
  playFromLatest?: boolean
}

interface FetchAllSeasonMediasResult {
  medias: FavoriteSeasonMedia[]
  /** 是否完整拉完（失败中断时为 false，调用方不得把末项当「最新」） */
  complete: boolean
}

/**
 * 合集入口 URL（B 站默认「播放全部」行为）
 * 优先用 collected season 的 bilibili://video/{aid} link，否则回退 list/season
 */
export function buildFavoriteSeasonEntryUrl(seasonId: number, link?: string): string {
  const fallbackUrl = `https://www.bilibili.com/list/season/${seasonId}`
  const matchedVideoLink = link?.match(/^bilibili:\/\/video\/(\d+)(\?.*)?$/)

  if (!matchedVideoLink)
    return fallbackUrl

  return `https://www.bilibili.com/video/av${matchedVideoLink[1]}${matchedVideoLink[2] || ''}`
}

/**
 * 在合集列表播放页打开指定稿件（保留侧栏连播上下文）
 */
export function buildFavoriteSeasonListPlayUrl(seasonId: number, bvid: string, oid?: number): string {
  const url = new URL(`https://www.bilibili.com/list/season/${seasonId}`)
  url.searchParams.set('bvid', bvid)
  if (typeof oid === 'number' && Number.isFinite(oid) && oid > 0)
    url.searchParams.set('oid', String(oid))
  return url.toString()
}

/**
 * 拉取订阅合集全部稿件（API 无排序参数，只能翻页）
 * complete=false 表示中途失败或异常截断，medias 可能不完整
 */
export async function fetchAllFavoriteSeasonMedias(seasonId: number): Promise<FetchAllSeasonMediasResult> {
  const medias: FavoriteSeasonMedia[] = []
  let pn = 1
  let expectedCount: number | undefined

  while (pn <= MAX_SEASON_PAGES) {
    let res: Awaited<ReturnType<typeof api.favorite.getFavoriteSeasonResources>>
    try {
      res = await api.favorite.getFavoriteSeasonResources({
        season_id: seasonId,
        pn,
        ps: SEASON_PAGE_SIZE,
      })
    }
    catch {
      return { medias, complete: false }
    }

    if (res.code !== 0 || !res.data)
      return { medias, complete: false }

    if (typeof res.data.info?.media_count === 'number' && res.data.info.media_count >= 0)
      expectedCount = res.data.info.media_count

    const pageMedias = Array.isArray(res.data.medias)
      ? res.data.medias.filter((item: FavoriteSeasonMedia | null | undefined): item is FavoriteSeasonMedia => item != null)
      : []

    if (pageMedias.length === 0) {
      // 首页就空：完整空合集；后续页突然空：视为异常截断
      return { medias, complete: pn === 1 || (expectedCount !== undefined && medias.length >= expectedCount) }
    }

    medias.push(...pageMedias)

    if (pageMedias.length < SEASON_PAGE_SIZE) {
      if (expectedCount !== undefined && medias.length < expectedCount)
        return { medias, complete: false }
      return { medias, complete: true }
    }

    pn += 1
  }

  // 触达页数上限：若已知总数且已对齐，仍算完整；否则不信任末项
  if (expectedCount !== undefined && medias.length >= expectedCount)
    return { medias, complete: true }

  return { medias, complete: false }
}

/**
 * 解析「播放全部」目标地址
 * playFromLatest：仅在完整拉完全部稿件后，用末项起播（API 默认可视为正序，末项≈最新）
 */
export async function resolveFavoriteSeasonPlayAllUrl(target: FavoriteSeasonPlayTarget): Promise<string> {
  const { seasonId, link, playFromLatest = false } = target

  if (!playFromLatest)
    return buildFavoriteSeasonEntryUrl(seasonId, link)

  const { medias, complete } = await fetchAllFavoriteSeasonMedias(seasonId)
  if (!complete)
    return buildFavoriteSeasonEntryUrl(seasonId, link)

  const latest = medias.at(-1)
  if (!latest?.bvid)
    return buildFavoriteSeasonEntryUrl(seasonId, link)

  return buildFavoriteSeasonListPlayUrl(seasonId, latest.bvid, latest.id)
}
