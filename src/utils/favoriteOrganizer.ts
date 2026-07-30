import type { FavoriteDealSuccessPayload } from '~/constants/favoriteOrganizer'
import { BEWLY_FAVORITE_DEAL_SUCCESS } from '~/constants/favoriteOrganizer'
import { getFavoriteVideoPartition, matchesFavoriteVideoPartition } from '~/constants/videoPartitions'
import { settings } from '~/logic'
import type {
  FavoriteOrganizerCondition,
  FavoriteOrganizerConditionValue,
  FavoriteOrganizerRule,
} from '~/logic/storage'
import { getFavoriteOrganizerConditionValues } from '~/logic/storage'
import type { Media as FavoriteMedia } from '~/models/video/favorite'
import type { List as FavoriteFolder } from '~/models/video/favoriteCategory'

import api from './api'
import { getCSRF, getUserID } from './main'

const FAVORITE_PAGE_SIZE = 20
const MUTATION_BATCH_SIZE = 20
const READ_DELAY_MS = 450
const MUTATION_DELAY_MS = 900
const FOLDER_CACHE_TTL_MS = 60_000

export type FavoriteOrganizerMode = 'copy' | 'move'
export type FavoriteOrganizerPhase = 'folders' | 'scanning' | 'matching' | 'applying' | 'cleaning' | 'done'

export interface FavoriteOrganizerProgress {
  phase: FavoriteOrganizerPhase
  percentage: number
  current: number
  total: number
  scanned: number
  matched: number
  processed: number
  failed: number
}

export interface FavoriteOrganizerResult {
  scanned: number
  matched: number
  processed: number
  failed: number
}

type ProgressCallback = (progress: FavoriteOrganizerProgress) => void

interface VideoMatchContext {
  media: FavoriteMedia
  categoryName?: string
  categoryIds?: number[]
  tags?: string[]
}

interface FolderCache {
  fetchedAt: number
  folders: FavoriteFolder[]
}

let folderCache: FolderCache | null = null
let automaticOrganizerInitialized = false
let automaticQueue = Promise.resolve()

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size))
  return chunks
}

function emitProgress(
  callback: ProgressCallback | undefined,
  progress: FavoriteOrganizerProgress,
  updates: Partial<FavoriteOrganizerProgress>,
) {
  Object.assign(progress, updates)
  callback?.({ ...progress })
}

function createProgress(): FavoriteOrganizerProgress {
  return {
    phase: 'folders',
    percentage: 0,
    current: 0,
    total: 0,
    scanned: 0,
    matched: 0,
    processed: 0,
    failed: 0,
  }
}

async function getFavoriteFolders(force = false): Promise<FavoriteFolder[]> {
  if (
    !force
    && folderCache
    && Date.now() - folderCache.fetchedAt < FOLDER_CACHE_TTL_MS
  ) {
    return folderCache.folders
  }

  const userId = getUserID()
  if (!userId)
    throw new Error('LOGIN_REQUIRED')

  const response = await api.favorite.getFavoriteCategories({ up_mid: userId })
  if (response.code !== 0 || !Array.isArray(response.data?.list))
    throw new Error(response.message || 'FAVORITE_FOLDERS_LOAD_FAILED')

  const folders = response.data.list as FavoriteFolder[]
  folderCache = { fetchedAt: Date.now(), folders }
  return folders
}

export async function loadFavoriteOrganizerFolders(force = false) {
  return await getFavoriteFolders(force)
}

async function scanFavoriteFolder(
  folder: FavoriteFolder,
  onPage?: (items: FavoriteMedia[], scanned: number, total: number) => void,
): Promise<FavoriteMedia[]> {
  const medias: FavoriteMedia[] = []
  let page = 1
  let total = Math.max(0, folder.media_count || 0)

  while (true) {
    const response = await api.favorite.getFavoriteResources({
      media_id: folder.id,
      pn: page,
      ps: FAVORITE_PAGE_SIZE,
      keyword: '',
      order: 'mtime',
      type: 0,
    })

    if (response.code !== 0)
      throw new Error(response.message || 'FAVORITE_RESOURCES_LOAD_FAILED')

    const pageItems = Array.isArray(response.data?.medias)
      ? response.data.medias.filter((item: FavoriteMedia | null): item is FavoriteMedia => item != null)
      : []
    total = Math.max(total, Number(response.data?.info?.media_count) || 0)
    medias.push(...pageItems)
    onPage?.(pageItems, medias.length, total)

    if (!response.data?.has_more || pageItems.length === 0)
      break

    page += 1
    await wait(READ_DELAY_MS)
  }

  return medias
}

function conditionValueMatches(
  condition: FavoriteOrganizerCondition,
  item: FavoriteOrganizerConditionValue,
  context: VideoMatchContext,
): boolean {
  const expected = normalize(item.value)
  if (!expected)
    return false

  switch (condition.field) {
    case 'uploader':
      return /^\d+$/.test(expected)
        ? String(context.media.upper?.mid ?? '') === expected
        : normalize(context.media.upper?.name) === expected
    case 'category':
      if (getFavoriteVideoPartition(item.value)) {
        return matchesFavoriteVideoPartition(
          item.value,
          context.categoryIds ?? [],
          context.categoryName,
        )
      }
      return /^\d+$/.test(expected)
        ? (context.categoryIds ?? []).some(categoryId => String(categoryId) === expected)
        : normalize(context.categoryName) === expected
    case 'title':
      return normalize(context.media.title).includes(expected)
    case 'tag':
      return (context.tags ?? []).some(tag => normalize(tag).includes(expected))
  }
}

function conditionMatches(condition: FavoriteOrganizerCondition, context: VideoMatchContext): boolean {
  // 同一条件可配置多个候选值，命中任意一个即可。
  return getFavoriteOrganizerConditionValues(condition)
    .some(item => conditionValueMatches(condition, item, context))
}

function validRule(rule: FavoriteOrganizerRule): boolean {
  return rule.enabled
    && Number.isFinite(rule.targetFolderId)
    && rule.conditions.length > 0
    && rule.conditions.every(condition => getFavoriteOrganizerConditionValues(condition).length > 0)
}

function ruleMatchesWithoutDetails(rule: FavoriteOrganizerRule, media: FavoriteMedia): boolean {
  return rule.conditions
    .filter(condition => condition.field === 'uploader' || condition.field === 'title')
    .every(condition => conditionMatches(condition, { media }))
}

function ruleMatches(rule: FavoriteOrganizerRule, context: VideoMatchContext): boolean {
  // 一条规则中的不同条件保持 AND 关系。
  return rule.conditions.every(condition => conditionMatches(condition, context))
}

function needsVideoDetails(rules: FavoriteOrganizerRule[]) {
  return rules.some(rule => rule.conditions.some(condition => condition.field === 'category' || condition.field === 'tag'))
}

function needsVideoTags(rules: FavoriteOrganizerRule[]) {
  return rules.some(rule => rule.conditions.some(condition => condition.field === 'tag'))
}

async function enrichVideoMatchContext(media: FavoriteMedia, rules: FavoriteOrganizerRule[]): Promise<VideoMatchContext> {
  if (!needsVideoDetails(rules))
    return { media }

  const infoResponse = await api.video.getVideoInfo({ aid: String(media.id) })
  if (infoResponse.code !== 0 || !infoResponse.data)
    throw new Error(infoResponse.message || 'VIDEO_INFO_LOAD_FAILED')

  const context: VideoMatchContext = {
    media,
    categoryName: infoResponse.data.tname_v2 || infoResponse.data.tname,
    categoryIds: [infoResponse.data.tid, infoResponse.data.tid_v2].filter(
      (categoryId: unknown): categoryId is number => Number.isFinite(categoryId),
    ),
  }

  if (needsVideoTags(rules)) {
    await wait(READ_DELAY_MS)
    const tagsResponse = await api.video.getVideoTags({ aid: String(media.id) })
    if (tagsResponse.code !== 0)
      throw new Error(tagsResponse.message || 'VIDEO_TAGS_LOAD_FAILED')

    context.tags = Array.isArray(tagsResponse.data)
      ? tagsResponse.data
          .map((tag: { tag_name?: string }) => tag.tag_name)
          .filter((tag: unknown): tag is string => typeof tag === 'string')
      : []
  }

  return context
}

function resourceKey(media: FavoriteMedia) {
  return `${media.id}:${media.type || 2}`
}

async function applyCopyGroups(
  sourceFolderId: number,
  groups: Map<number, FavoriteMedia[]>,
  progress: FavoriteOrganizerProgress,
  onProgress?: ProgressCallback,
) {
  const userId = getUserID()
  const csrf = getCSRF()
  const operations = Array.from(groups.entries()).flatMap(([targetFolderId, medias]) =>
    chunk(medias, MUTATION_BATCH_SIZE).map(batch => ({ targetFolderId, batch })),
  )
  let completedOperations = 0

  for (const operation of operations) {
    const response = await api.favorite.copyFavoriteResources({
      resources: operation.batch.map(resourceKey).join(','),
      src_media_id: sourceFolderId,
      tar_media_id: operation.targetFolderId,
      mid: userId,
      csrf,
    })

    if (response.code === 0)
      progress.processed += operation.batch.length
    else
      progress.failed += operation.batch.length

    completedOperations += 1
    emitProgress(onProgress, progress, {
      phase: 'applying',
      current: completedOperations,
      total: operations.length,
      percentage: operations.length ? 70 + Math.round(completedOperations / operations.length * 30) : 100,
    })

    if (completedOperations < operations.length)
      await wait(MUTATION_DELAY_MS)
  }
}

async function applyMoveGroups(
  sourceFolderId: number,
  targetsByMedia: Map<FavoriteMedia, number[]>,
  progress: FavoriteOrganizerProgress,
  onProgress?: ProgressCallback,
) {
  const copyGroups = new Map<number, FavoriteMedia[]>()
  const moveGroups = new Map<number, FavoriteMedia[]>()
  const copyFailureKeys = new Set<string>()

  for (const [media, targets] of targetsByMedia) {
    const [moveTarget, ...copyTargets] = targets
    if (moveTarget == null)
      continue

    const moveItems = moveGroups.get(moveTarget) ?? []
    moveItems.push(media)
    moveGroups.set(moveTarget, moveItems)

    for (const target of copyTargets) {
      const copyItems = copyGroups.get(target) ?? []
      copyItems.push(media)
      copyGroups.set(target, copyItems)
    }
  }

  const userId = getUserID()
  const csrf = getCSRF()
  const copyOperations = Array.from(copyGroups.entries()).flatMap(([targetFolderId, medias]) =>
    chunk(medias, MUTATION_BATCH_SIZE).map(batch => ({ kind: 'copy' as const, targetFolderId, batch })),
  )
  const moveOperations = Array.from(moveGroups.entries()).flatMap(([targetFolderId, medias]) =>
    chunk(medias, MUTATION_BATCH_SIZE).map(batch => ({ kind: 'move' as const, targetFolderId, batch })),
  )
  const operationCount = copyOperations.length + moveOperations.length
  let completedOperations = 0

  for (const operation of copyOperations) {
    const response = await api.favorite.copyFavoriteResources({
      resources: operation.batch.map(resourceKey).join(','),
      src_media_id: sourceFolderId,
      tar_media_id: operation.targetFolderId,
      mid: userId,
      csrf,
    })
    if (response.code !== 0) {
      for (const media of operation.batch)
        copyFailureKeys.add(resourceKey(media))
      progress.failed += operation.batch.length
    }

    completedOperations += 1
    emitProgress(onProgress, progress, {
      phase: 'applying',
      current: completedOperations,
      total: operationCount,
      percentage: operationCount ? 70 + Math.round(completedOperations / operationCount * 30) : 100,
    })
    await wait(MUTATION_DELAY_MS)
  }

  for (const operation of moveOperations) {
    const movableBatch = operation.batch.filter(media => !copyFailureKeys.has(resourceKey(media)))
    if (movableBatch.length > 0) {
      const response = await api.favorite.moveFavoriteResources({
        resources: movableBatch.map(resourceKey).join(','),
        src_media_id: sourceFolderId,
        tar_media_id: operation.targetFolderId,
        mid: userId,
        csrf,
      })
      if (response.code === 0)
        progress.processed += movableBatch.length
      else
        progress.failed += movableBatch.length
    }

    completedOperations += 1
    emitProgress(onProgress, progress, {
      phase: 'applying',
      current: completedOperations,
      total: operationCount,
      percentage: operationCount ? 70 + Math.round(completedOperations / operationCount * 30) : 100,
    })
    if (completedOperations < operationCount)
      await wait(MUTATION_DELAY_MS)
  }
}

export async function organizeFavorites(
  mode: FavoriteOrganizerMode,
  onProgress?: ProgressCallback,
): Promise<FavoriteOrganizerResult> {
  const progress = createProgress()
  emitProgress(onProgress, progress, { phase: 'folders', percentage: 2 })

  const folders = await getFavoriteFolders(true)
  const sourceFolder = folders[0]
  if (!sourceFolder)
    throw new Error('DEFAULT_FAVORITE_FOLDER_MISSING')

  const existingFolderIds = new Set(folders.map(folder => folder.id))
  const rules = settings.value.favoriteOrganizerRules.filter(rule =>
    validRule(rule)
    && rule.targetFolderId !== sourceFolder.id
    && existingFolderIds.has(rule.targetFolderId as number),
  )
  if (rules.length === 0)
    throw new Error('NO_VALID_FAVORITE_RULES')

  emitProgress(onProgress, progress, {
    phase: 'scanning',
    percentage: 5,
    current: 0,
    total: sourceFolder.media_count,
  })
  const medias = await scanFavoriteFolder(sourceFolder, (_items, scanned, total) => {
    emitProgress(onProgress, progress, {
      phase: 'scanning',
      scanned,
      current: scanned,
      total,
      percentage: total > 0 ? 5 + Math.round(Math.min(scanned / total, 1) * 30) : 35,
    })
  })

  const targetsByMedia = new Map<FavoriteMedia, number[]>()
  const candidates = medias.filter(media => !isInvalidFavoriteMedia(media)).map((media) => {
    const candidateRules = rules.filter(rule => ruleMatchesWithoutDetails(rule, media))
    return { media, rules: candidateRules }
  }).filter(candidate => candidate.rules.length > 0)

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]
    try {
      const context = await enrichVideoMatchContext(candidate.media, candidate.rules)
      const targets = Array.from(new Set(
        candidate.rules
          .filter(rule => ruleMatches(rule, context))
          .map(rule => rule.targetFolderId as number),
      ))
      if (targets.length > 0)
        targetsByMedia.set(candidate.media, targets)
    }
    catch {
      progress.failed += 1
    }

    progress.matched = targetsByMedia.size
    emitProgress(onProgress, progress, {
      phase: 'matching',
      current: index + 1,
      total: candidates.length,
      percentage: candidates.length ? 35 + Math.round((index + 1) / candidates.length * 35) : 70,
    })

    if (index < candidates.length - 1 && needsVideoDetails(candidate.rules))
      await wait(READ_DELAY_MS)
  }

  progress.matched = targetsByMedia.size
  if (targetsByMedia.size > 0) {
    if (mode === 'copy') {
      const copyGroups = new Map<number, FavoriteMedia[]>()
      for (const [media, targets] of targetsByMedia) {
        for (const target of targets) {
          const items = copyGroups.get(target) ?? []
          items.push(media)
          copyGroups.set(target, items)
        }
      }
      await applyCopyGroups(sourceFolder.id, copyGroups, progress, onProgress)
    }
    else {
      await applyMoveGroups(sourceFolder.id, targetsByMedia, progress, onProgress)
    }
  }

  emitProgress(onProgress, progress, {
    phase: 'done',
    percentage: 100,
    current: progress.processed,
    total: progress.matched,
  })
  return {
    scanned: progress.scanned,
    matched: progress.matched,
    processed: progress.processed,
    failed: progress.failed,
  }
}

export function isInvalidFavoriteMedia(media: FavoriteMedia) {
  const title = normalize(media.title)
  return (media.attr & 1) === 1
    || media.id <= 0
    || title.includes('已失效')
    || title.includes('稿件失效')
    || title.includes('视频失效')
}

export async function cleanInvalidFavorites(
  onProgress?: ProgressCallback,
): Promise<FavoriteOrganizerResult> {
  const progress = createProgress()
  emitProgress(onProgress, progress, { phase: 'folders', percentage: 2 })
  const folders = await getFavoriteFolders(true)
  if (folders.length === 0)
    throw new Error('DEFAULT_FAVORITE_FOLDER_MISSING')

  const invalidByFolder = new Map<number, FavoriteMedia[]>()
  const expectedTotal = folders.reduce((sum, folder) => sum + Math.max(0, folder.media_count || 0), 0)
  let scannedTotal = 0

  for (let folderIndex = 0; folderIndex < folders.length; folderIndex++) {
    const folder = folders[folderIndex]
    const scannedBeforeFolder = scannedTotal
    const medias = await scanFavoriteFolder(folder, (_items, scanned) => {
      const current = scannedBeforeFolder + scanned
      const total = Math.max(expectedTotal, current)
      emitProgress(onProgress, progress, {
        phase: 'scanning',
        current,
        total,
        scanned: current,
        percentage: total > 0 ? 5 + Math.round(current / total * 60) : 65,
      })
    })
    scannedTotal += medias.length
    progress.scanned = scannedTotal
    const invalidItems = medias.filter(isInvalidFavoriteMedia)
    if (invalidItems.length > 0)
      invalidByFolder.set(folder.id, invalidItems)
    progress.matched += invalidItems.length

    if (folderIndex < folders.length - 1)
      await wait(READ_DELAY_MS)
  }

  const operations = Array.from(invalidByFolder.entries()).flatMap(([folderId, medias]) =>
    chunk(medias, MUTATION_BATCH_SIZE).map(batch => ({ folderId, batch })),
  )
  const csrf = getCSRF()

  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index]
    const response = await api.favorite.patchDelFavoriteResources({
      resources: operation.batch.map(resourceKey).join(','),
      media_id: operation.folderId,
      csrf,
    })
    if (response.code === 0)
      progress.processed += operation.batch.length
    else
      progress.failed += operation.batch.length

    emitProgress(onProgress, progress, {
      phase: 'cleaning',
      current: index + 1,
      total: operations.length,
      percentage: operations.length ? 65 + Math.round((index + 1) / operations.length * 35) : 100,
    })
    if (index < operations.length - 1)
      await wait(MUTATION_DELAY_MS)
  }

  emitProgress(onProgress, progress, {
    phase: 'done',
    percentage: 100,
    current: progress.processed,
    total: progress.matched,
  })
  return {
    scanned: progress.scanned,
    matched: progress.matched,
    processed: progress.processed,
    failed: progress.failed,
  }
}

async function organizeNewFavorite(payload: FavoriteDealSuccessPayload) {
  if (
    !settings.value.enableAutomaticFavoriteOrganization
    || payload.type !== 2
    || payload.addMediaIds.length === 0
  ) {
    return
  }

  const folders = await getFavoriteFolders()
  const defaultFolder = folders[0]
  if (!defaultFolder || !payload.addMediaIds.includes(defaultFolder.id))
    return

  const existingFolderIds = new Set(folders.map(folder => folder.id))
  const rules = settings.value.favoriteOrganizerRules.filter(rule =>
    validRule(rule)
    && rule.targetFolderId !== defaultFolder.id
    && existingFolderIds.has(rule.targetFolderId as number)
    && !payload.addMediaIds.includes(rule.targetFolderId as number),
  )
  if (rules.length === 0)
    return

  const media: FavoriteMedia = {
    id: payload.rid,
    type: payload.type,
    title: '',
    upper: { mid: 0, name: '', face: '' },
  } as FavoriteMedia
  const infoResponse = await api.video.getVideoInfo({ aid: String(payload.rid) })
  if (infoResponse.code !== 0 || !infoResponse.data)
    return

  media.title = infoResponse.data.title
  media.upper = {
    mid: infoResponse.data.owner?.mid ?? 0,
    name: infoResponse.data.owner?.name ?? '',
    face: infoResponse.data.owner?.face ?? '',
  }

  const candidateRules = rules.filter(rule => ruleMatchesWithoutDetails(rule, media))
  if (candidateRules.length === 0)
    return

  const context: VideoMatchContext = {
    media,
    categoryName: infoResponse.data.tname_v2 || infoResponse.data.tname,
    categoryIds: [infoResponse.data.tid, infoResponse.data.tid_v2].filter(
      (categoryId: unknown): categoryId is number => Number.isFinite(categoryId),
    ),
  }
  if (needsVideoTags(candidateRules)) {
    await wait(READ_DELAY_MS)
    const tagsResponse = await api.video.getVideoTags({ aid: String(payload.rid) })
    if (tagsResponse.code !== 0)
      return
    context.tags = Array.isArray(tagsResponse.data)
      ? tagsResponse.data
          .map((tag: { tag_name?: string }) => tag.tag_name)
          .filter((tag: unknown): tag is string => typeof tag === 'string')
      : []
  }

  const targetFolderIds = Array.from(new Set(
    candidateRules
      .filter(rule => ruleMatches(rule, context))
      .map(rule => rule.targetFolderId as number),
  ))
  if (targetFolderIds.length === 0)
    return

  const response = await api.favorite.dealFavoriteResources({
    rid: payload.rid,
    type: payload.type,
    add_media_ids: targetFolderIds.join(','),
    del_media_ids: '',
    csrf: getCSRF(),
  })
  if (response.code !== 0)
    console.warn('[BewlyCat] Automatic favorite organization failed:', response.message)
}

export function setupAutomaticFavoriteOrganizer() {
  if (automaticOrganizerInitialized)
    return

  automaticOrganizerInitialized = true
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== BEWLY_FAVORITE_DEAL_SUCCESS)
      return

    const payload = event.data.data as FavoriteDealSuccessPayload | undefined
    if (
      !payload
      || payload.rid <= 0
      || !Number.isFinite(payload.rid)
      || !Array.isArray(payload.addMediaIds)
      || !Array.isArray(payload.delMediaIds)
      || !payload.addMediaIds.every(Number.isFinite)
      || !payload.delMediaIds.every(Number.isFinite)
    ) {
      return
    }

    automaticQueue = automaticQueue
      .then(() => organizeNewFavorite(payload))
      .catch((error) => {
        console.warn('[BewlyCat] Automatic favorite organization failed:', error)
      })
  })
}
