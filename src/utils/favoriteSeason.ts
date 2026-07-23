/**
 * 收藏「订阅合集」相关工具
 * 供 Dock 新版收藏页与顶栏收藏弹层共用
 */

import type { CollectedSeasonPlayAllMode } from '~/logic/storage'
import type { List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import type { FavoriteSeasonMedia } from '~/models/video/favoriteSeason'
import api from '~/utils/api'

const SEASON_PAGE_SIZE = 40
/** 防止异常接口一直返回满页时死循环 */
const MAX_SEASON_PAGES = 100
const HISTORY_PAGE_SIZE = 20
/** 在最近历史中查找合集内上次观看（约 300 条） */
const MAX_HISTORY_PAGES = 15

export type { CollectedSeasonPlayAllMode }

export interface FavoriteSeasonPlayTarget {
  seasonId: number
  link?: string
  mode?: CollectedSeasonPlayAllMode
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

function matchSeasonMediaFromHistory(
  medias: FavoriteSeasonMedia[],
  historyItems: HistoryItem[],
): FavoriteSeasonMedia | undefined {
  const byBvid = new Map(
    medias
      .filter(item => typeof item.bvid === 'string' && item.bvid.length > 0)
      .map(item => [item.bvid, item]),
  )
  const byAid = new Map(medias.map(item => [item.id, item]))

  for (const item of historyItems) {
    if (item.history?.business && item.history.business !== Business.ARCHIVE)
      continue

    const byVid = item.history?.bvid ? byBvid.get(item.history.bvid) : undefined
    if (byVid)
      return byVid

    const oid = item.history?.oid
    if (typeof oid === 'number' && byAid.has(oid))
      return byAid.get(oid)
  }

  return undefined
}

/**
 * 在最近观看历史中找合集内最近一次看过的稿件（历史按时间倒序）
 */
export async function findLastWatchedSeasonMedia(
  medias: FavoriteSeasonMedia[],
): Promise<FavoriteSeasonMedia | undefined> {
  if (medias.length === 0)
    return undefined

  let viewAt = 0

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    let res: Awaited<ReturnType<typeof api.history.getHistoryList>>
    try {
      res = await api.history.getHistoryList({
        type: 'archive',
        view_at: viewAt,
        ps: HISTORY_PAGE_SIZE,
      })
    }
    catch {
      return undefined
    }

    if (res.code !== 0 || !res.data)
      return undefined

    const list = Array.isArray(res.data.list) ? res.data.list as HistoryItem[] : []
    if (list.length === 0)
      return undefined

    const matched = matchSeasonMediaFromHistory(medias, list)
    if (matched)
      return matched

    viewAt = list[list.length - 1]?.view_at ?? 0
    if (!viewAt || list.length < HISTORY_PAGE_SIZE)
      return undefined
  }

  return undefined
}

/**
 * 解析「播放全部」目标地址
 * - beginning：合集入口（默认）
 * - latest：完整列表末项（≈最新一期）
 * - lastWatched：观看历史中该合集最近一次看过的稿件；找不到则回退 beginning
 */
export async function resolveFavoriteSeasonPlayAllUrl(target: FavoriteSeasonPlayTarget): Promise<string> {
  const { seasonId, link, mode = 'beginning' } = target
  const entryUrl = buildFavoriteSeasonEntryUrl(seasonId, link)

  if (mode === 'beginning')
    return entryUrl

  const { medias, complete } = await fetchAllFavoriteSeasonMedias(seasonId)
  if (!complete || medias.length === 0)
    return entryUrl

  if (mode === 'latest') {
    const latest = medias.at(-1)
    if (!latest?.bvid)
      return entryUrl
    return buildFavoriteSeasonListPlayUrl(seasonId, latest.bvid, latest.id)
  }

  // lastWatched：历史扫描不要求「必须完整」以外的额外条件，但上面已要求 complete，
  // 避免用残缺合集集合误匹配到其它历史项之外的错觉；找不到则回退入口
  const lastWatched = await findLastWatchedSeasonMedia(medias)
  if (!lastWatched?.bvid)
    return entryUrl

  return buildFavoriteSeasonListPlayUrl(seasonId, lastWatched.bvid, lastWatched.id)
}
