/**
 * 订阅合集：单一数据层
 * - 分页语义（含「接口一次返回全量」）
 * - 播放全部起播解析
 * Dock 收藏页与顶栏弹层共用，UI 只负责触发加载/展示。
 */

import type { CollectedSeasonPlayAllMode } from '~/logic/storage'
import type { List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import type { FavoriteSeasonMedia } from '~/models/video/favoriteSeason'
import api from '~/utils/api'

/** 与 B 站 fav/season/list 默认 ps、以及收藏页「一屏约 40」展示一致 */
export const FAVORITE_SEASON_PAGE_SIZE = 40
/** 防止异常接口一直返回满页时死循环 */
const MAX_SEASON_PAGES = 100
const HISTORY_PAGE_SIZE = 20
/** 在最近历史中查找合集内上次观看（约 300 条） */
const MAX_HISTORY_PAGES = 15
/** mid → face，跨合集复用，避免重复打卡片接口 */
const userFaceCache = new Map<number, string>()

export type { CollectedSeasonPlayAllMode }

export interface FavoriteSeasonPlayTarget {
  seasonId: number
  link?: string
  /** beginning 模式入口补充（无 link 时用） */
  bvid?: string
  mode?: CollectedSeasonPlayAllMode
  /**
   * UI 已通过同一套分页语义加载过的列表。
   * complete=true 时可跳过再次全量请求。
   * expectedCount 来自合集 media_count，用于 complete 标记未同步时的兜底判定。
   */
  preloaded?: {
    medias: FavoriteSeasonMedia[]
    complete: boolean
    expectedCount?: number
  }
}

export interface FavoriteSeasonPlayAllResult {
  url: string
  /** 是否回退到合集入口（开头 / 数据不完整 / 无历史等） */
  usedFallback: boolean
  reason: 'beginning' | 'resolved' | 'incomplete' | 'empty' | 'missing-bvid' | 'no-history'
}

export interface FavoriteSeasonPageFetchResult {
  ok: boolean
  pageMedias: FavoriteSeasonMedia[]
  mediaCount?: number
  cover?: string
}

export interface FavoriteSeasonPageMergeResult {
  medias: FavoriteSeasonMedia[]
  hasMore: boolean
}

interface FetchAllSeasonMediasResult {
  medias: FavoriteSeasonMedia[]
  complete: boolean
}

/**
 * 合集列表接口通常不带 upper.face；按 mid 补全头像（同 UP 只请求一次）
 */
export async function enrichFavoriteSeasonMediaFaces(
  medias: FavoriteSeasonMedia[],
): Promise<FavoriteSeasonMedia[]> {
  const missingMids = [...new Set(
    medias
      .map(item => item.upper?.mid)
      .filter((mid): mid is number => typeof mid === 'number' && mid > 0 && !userFaceCache.has(mid)),
  )]

  await Promise.all(missingMids.map(async (mid) => {
    try {
      const res = await api.user.getUserCard({ mid: String(mid) })
      const face = res?.data?.card?.face
      if (res?.code === 0 && typeof face === 'string' && face.length > 0)
        userFaceCache.set(mid, face)
    }
    catch {
      // 单个失败不影响其它
    }
  }))

  return medias.map((item) => {
    const mid = item.upper?.mid
    const cachedFace = typeof mid === 'number' ? userFaceCache.get(mid) : undefined
    if (!cachedFace || item.upper?.face === cachedFace)
      return item
    return {
      ...item,
      upper: {
        ...item.upper,
        face: cachedFace,
      },
    }
  })
}

/**
 * 合集入口 URL（B 站默认「从开头播放」）
 * 优先 collected season 的 bilibili://video/{aid} link，否则封面/入口 bvid
 */
export function buildFavoriteSeasonEntryUrl(seasonId: number, link?: string, bvid?: string): string {
  const matchedVideoLink = link?.match(/^bilibili:\/\/video\/(\d+)(\?.*)?$/)

  if (matchedVideoLink)
    return `https://www.bilibili.com/video/av${matchedVideoLink[1]}${matchedVideoLink[2] || ''}`

  if (bvid)
    return `https://www.bilibili.com/video/${bvid}/`

  // list/season/{id} 对 UGC 订阅合集常 404，仅作无 link/bvid 时的最后兜底
  return `https://www.bilibili.com/list/season/${seasonId}`
}

/**
 * 打开合集内指定稿件（普通视频页，仍可带合集侧栏）
 * 实测 /list/season/{id}?bvid= 对订阅合集会 404
 */
export function buildFavoriteSeasonVideoUrl(bvid: string): string {
  return `https://www.bilibili.com/video/${bvid}/`
}

/**
 * 合并一页合集稿件，并给出是否还有更多。
 * 顶栏滚动加载 / 收藏页列表 / 播放全部全量拉取 共用此语义。
 */
export function mergeFavoriteSeasonPage(input: {
  pn: number
  pageMedias: FavoriteSeasonMedia[]
  mediaCount?: number
  previousMedias: FavoriteSeasonMedia[]
  pageSize?: number
}): FavoriteSeasonPageMergeResult {
  const pageSize = input.pageSize ?? FAVORITE_SEASON_PAGE_SIZE
  const count = typeof input.mediaCount === 'number' && input.mediaCount >= 0
    ? input.mediaCount
    : undefined
  const pageMedias = input.pageMedias

  if (pageMedias.length === 0) {
    return {
      medias: input.previousMedias,
      hasMore: false,
    }
  }

  // 接口无视 ps、一次返回 ≥ media_count：整表替换，不再翻页
  if (count !== undefined && pageMedias.length >= count) {
    return {
      medias: pageMedias.slice(0, count),
      hasMore: false,
    }
  }

  // 无可靠 count，但首页就超过 pageSize：视为一次性全量（避免狂翻）
  if (input.pn === 1 && pageMedias.length > pageSize) {
    return {
      medias: pageMedias,
      hasMore: false,
    }
  }

  const medias = input.pn === 1
    ? [...pageMedias]
    : [...input.previousMedias, ...pageMedias]

  if (count !== undefined && medias.length >= count) {
    return {
      medias: medias.slice(0, count),
      hasMore: false,
    }
  }

  return {
    medias,
    hasMore: pageMedias.length >= pageSize,
  }
}

/** 拉取合集单页原始数据 */
export async function fetchFavoriteSeasonPage(
  seasonId: number,
  pn: number,
  pageSize: number = FAVORITE_SEASON_PAGE_SIZE,
): Promise<FavoriteSeasonPageFetchResult> {
  try {
    const res = await api.favorite.getFavoriteSeasonResources({
      season_id: seasonId,
      pn,
      ps: pageSize,
    })

    if (res.code !== 0 || !res.data) {
      return { ok: false, pageMedias: [] }
    }

    const pageMedias = Array.isArray(res.data.medias)
      ? res.data.medias.filter((item: FavoriteSeasonMedia | null | undefined): item is FavoriteSeasonMedia => item != null)
      : []

    const mediaCount = typeof res.data.info?.media_count === 'number' && res.data.info.media_count >= 0
      ? res.data.info.media_count
      : undefined

    return {
      ok: true,
      pageMedias,
      mediaCount,
      cover: res.data.info?.cover,
    }
  }
  catch {
    return { ok: false, pageMedias: [] }
  }
}

/**
 * 拉取订阅合集全部稿件
 * complete=false 表示中途失败或异常截断，不得把末项当「最新」
 */
export async function fetchAllFavoriteSeasonMedias(seasonId: number): Promise<FetchAllSeasonMediasResult> {
  let medias: FavoriteSeasonMedia[] = []
  let pn = 1

  while (pn <= MAX_SEASON_PAGES) {
    const page = await fetchFavoriteSeasonPage(seasonId, pn)
    if (!page.ok)
      return { medias, complete: false }

    const merged = mergeFavoriteSeasonPage({
      pn,
      pageMedias: page.pageMedias,
      mediaCount: page.mediaCount,
      previousMedias: medias,
    })
    medias = merged.medias

    if (!merged.hasMore)
      return { medias, complete: true }

    pn += 1
  }

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

async function resolveSeasonMedias(
  seasonId: number,
  preloaded?: FavoriteSeasonPlayTarget['preloaded'],
): Promise<FetchAllSeasonMediasResult> {
  // 已完整加载：直接复用，避免收藏页再打一遍接口
  if (preloaded?.complete && preloaded.medias.length > 0)
    return { medias: preloaded.medias, complete: true }

  // 未标 complete，但条数已达已知总数：也视为完整（避免 flag 与 media_count 不同步）
  if (
    preloaded
    && typeof preloaded.expectedCount === 'number'
    && preloaded.expectedCount > 0
    && preloaded.medias.length >= preloaded.expectedCount
  ) {
    return {
      medias: preloaded.medias.slice(0, preloaded.expectedCount),
      complete: true,
    }
  }

  return fetchAllFavoriteSeasonMedias(seasonId)
}

/**
 * 解析「播放全部」目标地址
 * - beginning：合集入口
 * - latest：完整列表末项
 * - lastWatched：观看历史中该合集最近一次；找不到则回退入口
 */
export async function resolveFavoriteSeasonPlayAllUrl(
  target: FavoriteSeasonPlayTarget,
): Promise<FavoriteSeasonPlayAllResult> {
  const { seasonId, link, bvid, mode = 'beginning', preloaded } = target
  const entryUrl = buildFavoriteSeasonEntryUrl(seasonId, link, bvid)

  if (mode === 'beginning') {
    return { url: entryUrl, usedFallback: false, reason: 'beginning' }
  }

  const { medias, complete } = await resolveSeasonMedias(seasonId, preloaded)
  if (!complete)
    return { url: entryUrl, usedFallback: true, reason: 'incomplete' }
  if (medias.length === 0)
    return { url: entryUrl, usedFallback: true, reason: 'empty' }

  if (mode === 'latest') {
    const latest = medias.at(-1)
    if (!latest?.bvid)
      return { url: entryUrl, usedFallback: true, reason: 'missing-bvid' }
    return { url: buildFavoriteSeasonVideoUrl(latest.bvid), usedFallback: false, reason: 'resolved' }
  }

  const lastWatched = await findLastWatchedSeasonMedia(medias)
  if (!lastWatched?.bvid)
    return { url: entryUrl, usedFallback: true, reason: 'no-history' }

  return { url: buildFavoriteSeasonVideoUrl(lastWatched.bvid), usedFallback: false, reason: 'resolved' }
}
