import { VIDEO_ZONES } from '~/constants/videoZones'
import type { FavoriteOrganizerFolder, FavoriteOrganizerRule } from '~/logic'
import { settings } from '~/logic'
import type { FavoritesCategoryResult, List as FavoriteFolder } from '~/models/video/favoriteCategory'
import type { VideoInfo } from '~/models/video/videoInfo'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'

export interface FavoriteOrganizerVideo {
  aid: number
  mid: string
  tid: number
  title: string
}

export interface FavoriteOrganizerProgress {
  phase: 'scan' | 'copy'
  scanned: number
  copied: number
}

export interface FavoriteOrganizerFolderResult {
  mediaId: number
  title: string
  matched: number
  copied: number
  error?: string
}

export interface FavoriteOrganizerResult {
  scanned: number
  folders: FavoriteOrganizerFolderResult[]
}

export class FavoriteOrganizerError extends Error {
  constructor(readonly reason: 'not_logged_in' | 'account_changed' | 'no_rules' | 'no_default_folder' | 'request_failed', message?: string) {
    super(message || reason)
    this.name = 'FavoriteOrganizerError'
  }
}

const VIDEO_RESOURCE_TYPE = 2
const COPY_BATCH_SIZE = 50
const REQUEST_INTERVAL = 300
// 默认收藏夹上限 5 万条以内，游标分页兜底防止接口异常时死循环。
const MAX_SCAN_PAGES = 600

const zoneParentMap = new Map<number, number>(
  VIDEO_ZONES.flatMap(zone => zone.children.map(child => [child.tid, zone.tid] as const)),
)

export function getZoneName(tid: number): string {
  for (const zone of VIDEO_ZONES) {
    if (zone.tid === tid)
      return zone.name
    const child = zone.children.find(item => item.tid === tid)
    if (child)
      return `${zone.name} · ${child.name}`
  }
  return String(tid)
}

export function isDefaultFavoriteFolder(folder: Pick<FavoriteFolder, 'attr'>): boolean {
  return ((folder.attr >> 1) & 1) === 0
}

export function hasRuleConditions(rule: FavoriteOrganizerRule): boolean {
  return rule.ups.length > 0 || rule.zones.length > 0 || rule.titleKeywords.length > 0
}

export function matchesRule(rule: FavoriteOrganizerRule, video: FavoriteOrganizerVideo): boolean {
  // 没有任何条件的规则不匹配，避免把默认收藏夹整体复制过去。
  if (!hasRuleConditions(rule))
    return false
  if (rule.ups.length && !rule.ups.some(up => up.mid === video.mid))
    return false
  if (rule.zones.length && !rule.zones.some(tid => tid === video.tid || tid === zoneParentMap.get(video.tid)))
    return false
  if (rule.titleKeywords.length) {
    const title = video.title.toLowerCase()
    if (!rule.titleKeywords.some(keyword => title.includes(keyword.toLowerCase())))
      return false
  }
  return true
}

/**
 * outer 是否包含 inner：凡命中 inner 的视频必然命中 outer。两者互相包含即为重复规则。
 * 仅按条件判断：outer 限定的每类条件，inner 都须限定且每个取值都落在 outer 的范围内。
 */
export function ruleCovers(outer: FavoriteOrganizerRule, inner: FavoriteOrganizerRule): boolean {
  if (!hasRuleConditions(outer) || !hasRuleConditions(inner))
    return false
  if (outer.ups.length) {
    const outerMids = new Set(outer.ups.map(up => up.mid))
    if (!inner.ups.length || inner.ups.some(up => !outerMids.has(up.mid)))
      return false
  }
  if (outer.zones.length) {
    // 主分区包含其子分区，反之不成立
    if (!inner.zones.length || inner.zones.some(tid => !outer.zones.some(outerTid => outerTid === tid || outerTid === zoneParentMap.get(tid))))
      return false
  }
  if (outer.titleKeywords.length) {
    // 标题含较长关键词时必然也含其中的较短关键词
    const outerKeywords = outer.titleKeywords.map(keyword => keyword.toLowerCase())
    if (!inner.titleKeywords.length || inner.titleKeywords.some(keyword => !outerKeywords.some(outerKeyword => keyword.toLowerCase().includes(outerKeyword))))
      return false
  }
  return true
}

export function matchesFolder(folder: FavoriteOrganizerFolder, video: FavoriteOrganizerVideo): boolean {
  return folder.rules.some(rule => matchesRule(rule, video))
}

function getActiveFolderConfigs(): FavoriteOrganizerFolder[] {
  return settings.value.favoriteOrganizerFolders.filter(folder => folder.rules.some(hasRuleConditions))
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(signal!.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function requireAccount(): { accountId: string, csrf: string } {
  const accountId = getUserID()
  const csrf = getCSRF()
  if (!accountId || !csrf)
    throw new FavoriteOrganizerError('not_logged_in')
  return { accountId, csrf }
}

function assertSameAccount(accountId: string) {
  if (getUserID() !== accountId)
    throw new FavoriteOrganizerError('account_changed')
}

function assertSuccess(result: { code?: number, message?: string } | undefined) {
  if (result?.code !== 0)
    throw new FavoriteOrganizerError('request_failed', result?.message || String(result?.code ?? ''))
}

export async function loadOwnFavoriteFolders(accountId: string, rid?: number): Promise<FavoriteFolder[]> {
  const result: FavoritesCategoryResult = await api.favorite.getFavoriteCategories({
    up_mid: accountId,
    ...(rid ? { type: VIDEO_RESOURCE_TYPE, rid } : {}),
  })
  assertSuccess(result)
  return result.data?.list ?? []
}

/**
 * 三连后把视频补加到规则命中的收藏夹，只新增不移除。
 * @returns 本次新加入的收藏夹标题；无命中或已全部收藏时为空数组
 */
export async function syncVideoToMatchedFolders(target: { aid?: number, bvid?: string }): Promise<string[]> {
  const { accountId, csrf } = requireAccount()
  const configs = getActiveFolderConfigs()
  if (!configs.length)
    return []

  const info: VideoInfo = await api.video.getVideoInfo({
    aid: target.aid ? String(target.aid) : undefined,
    bvid: target.aid ? undefined : target.bvid,
  })
  assertSuccess(info)
  const video: FavoriteOrganizerVideo = {
    aid: Number(info.data.aid),
    mid: String(info.data.owner?.mid ?? ''),
    tid: Number(info.data.tid),
    title: info.data.title ?? '',
  }
  if (!Number.isSafeInteger(video.aid) || video.aid <= 0)
    throw new FavoriteOrganizerError('request_failed')

  const matchedIds = new Set(configs.filter(config => matchesFolder(config, video)).map(config => config.mediaId))
  if (!matchedIds.size)
    return []

  assertSameAccount(accountId)
  const folders = await loadOwnFavoriteFolders(accountId, video.aid)
  const targets = folders.filter(folder => matchedIds.has(folder.id) && folder.fav_state !== 1 && !isDefaultFavoriteFolder(folder))
  if (!targets.length)
    return []

  assertSameAccount(accountId)
  const result = await api.favorite.updateVideoFavorites({
    rid: video.aid,
    add_media_ids: targets.map(folder => folder.id).join(','),
    del_media_ids: '',
    csrf,
  })
  assertSuccess(result)
  return targets.map(folder => folder.title)
}

async function scanFavoriteFolder(mediaId: number, onPage: (scanned: number) => void, signal?: AbortSignal): Promise<FavoriteOrganizerVideo[]> {
  const videos: FavoriteOrganizerVideo[] = []
  const seen = new Set<number>()
  let oid = ''
  for (let page = 0; page < MAX_SCAN_PAGES; page++) {
    signal?.throwIfAborted()
    const result = await api.favorite.getFavoriteMediaList({ biz_id: mediaId, oid }, { signal })
    assertSuccess(result)
    const list: any[] = result.data?.media_list ?? []
    let lastId = ''
    for (const item of list) {
      lastId = String(item?.id ?? '')
      const aid = Number(item?.id)
      if (item?.type !== VIDEO_RESOURCE_TYPE || !Number.isSafeInteger(aid) || seen.has(aid))
        continue
      seen.add(aid)
      videos.push({
        aid,
        mid: String(item.upper?.mid ?? ''),
        tid: Number(item.tid) || 0,
        title: String(item.title ?? ''),
      })
    }
    onPage(videos.length)
    if (!result.data?.has_more || !lastId || lastId === oid)
      break
    oid = lastId
    await delay(REQUEST_INTERVAL, signal)
  }
  return videos
}

async function getFolderVideoIds(mediaId: number, signal?: AbortSignal): Promise<Set<number>> {
  const result = await api.favorite.getFavoriteResourceIds({ media_id: mediaId }, { signal })
  assertSuccess(result)
  const ids = (result.data ?? []) as { id: number, type: number }[]
  return new Set(ids.filter(item => item.type === VIDEO_RESOURCE_TYPE).map(item => Number(item.id)))
}

/** 扫描默认收藏夹，把命中规则的视频复制到对应收藏夹；已在目标收藏夹的视频跳过。 */
export async function organizeDefaultFavoriteFolder(
  onProgress: (progress: FavoriteOrganizerProgress) => void,
  signal?: AbortSignal,
): Promise<FavoriteOrganizerResult> {
  const { accountId, csrf } = requireAccount()
  const configs = getActiveFolderConfigs()
  if (!configs.length)
    throw new FavoriteOrganizerError('no_rules')

  const folders = await loadOwnFavoriteFolders(accountId)
  const defaultFolder = folders.find(isDefaultFavoriteFolder)
  if (!defaultFolder)
    throw new FavoriteOrganizerError('no_default_folder')

  const folderMap = new Map(folders.map(folder => [folder.id, folder]))
  // 规则里的收藏夹可能属于其他账号或已被删除，只处理当前账号仍存在的收藏夹。
  const targets = configs.filter(config => config.mediaId !== defaultFolder.id && folderMap.has(config.mediaId))
  if (!targets.length)
    throw new FavoriteOrganizerError('no_rules')

  const progress: FavoriteOrganizerProgress = { phase: 'scan', scanned: 0, copied: 0 }
  onProgress({ ...progress })
  const videos = await scanFavoriteFolder(defaultFolder.id, (scanned) => {
    progress.scanned = scanned
    onProgress({ ...progress })
  }, signal)

  progress.phase = 'copy'
  onProgress({ ...progress })
  const results: FavoriteOrganizerFolderResult[] = []
  for (const config of targets) {
    const title = folderMap.get(config.mediaId)?.title || config.title
    const matched = videos.filter(video => matchesFolder(config, video))
    const folderResult: FavoriteOrganizerFolderResult = { mediaId: config.mediaId, title, matched: matched.length, copied: 0 }
    results.push(folderResult)
    if (!matched.length)
      continue

    try {
      signal?.throwIfAborted()
      assertSameAccount(accountId)
      const existing = await getFolderVideoIds(config.mediaId, signal)
      const pending = matched.filter(video => !existing.has(video.aid))
      for (let start = 0; start < pending.length; start += COPY_BATCH_SIZE) {
        await delay(REQUEST_INTERVAL, signal)
        assertSameAccount(accountId)
        const batch = pending.slice(start, start + COPY_BATCH_SIZE)
        const result = await api.favorite.copyFavoriteResources({
          resources: batch.map(video => `${video.aid}:${VIDEO_RESOURCE_TYPE}`).join(','),
          src_media_id: defaultFolder.id,
          tar_media_id: config.mediaId,
          mid: accountId,
          csrf,
        })
        assertSuccess(result)
        folderResult.copied += batch.length
        progress.copied += batch.length
        onProgress({ ...progress })
      }
    }
    catch (error) {
      if (signal?.aborted || (error instanceof FavoriteOrganizerError && error.reason === 'account_changed'))
        throw error
      folderResult.error = error instanceof Error ? error.message : String(error)
    }
  }

  return { scanned: videos.length, folders: results }
}
