import { settings } from '~/logic'
import type {
  CommentAiFilterClassifyRequest,
  CommentAiFilterClassifyResponse,
  CommentAiFilterConfigSnapshot,
  CommentAiFilterInputItem,
  CommentAiFilterTestRequest,
  CommentAiFilterTestResponse,
  CommentAiFilterVerdict,
} from '~/utils/commentAiFilter'
import {
  COMMENT_AI_FILTER_CLASSIFY_MESSAGE,
  COMMENT_AI_FILTER_PROMPT_VERSION,
  COMMENT_AI_FILTER_TEST_MESSAGE,
  matchLocalCommentAiFilterRule,
  normalizeCommentAiFilterBatchSize,
  normalizeCommentTextForAiFilter,
} from '~/utils/commentAiFilter'
import { sendMessage } from '~/utils/messaging'

const MAX_CACHE_ENTRIES = 1200
const MAX_CONCURRENT_BATCHES = 2
const MAX_CONCURRENT_SINGLE = 4
const TRANSIENT_RETRY_DELAY_MS = 500

function isTransientError(message: string | undefined): boolean {
  if (!message) return false
  return /HTTP (?:429|5\d\d)\b|timed out/iu.test(message)
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

interface CachedVerdict {
  lowQuality: boolean
  category?: string
  reason?: string
}

const verdictCache = new Map<string, CachedVerdict>()

export function getCommentAiFilterConfigFingerprint(): string {
  const s = settings.value
  const dims = [...(s.commentAiFilterDimensions || [])].sort().join(',')
  return `${COMMENT_AI_FILTER_PROMPT_VERSION}|${dims}|${s.commentAiFilterCustomPrompt.trim()}`
}

interface CacheKeyCommentMeta {
  author?: string
  isReply?: boolean
  isUp?: boolean
  isTop?: boolean
  upLiked?: boolean
  hasPictures?: boolean
}

function buildCacheKey(
  fingerprint: string,
  normalizedText: string,
  meta?: CacheKeyCommentMeta,
): string {
  const cleanAuthor = meta?.author?.trim() ?? ''
  const flags = [
    meta?.isReply ? 'R' : 'M',
    meta?.isUp ? 'U' : '',
    meta?.isTop ? 'T' : '',
    meta?.upLiked ? 'L' : '',
    meta?.hasPictures ? 'P' : '',
  ].join('')
  return `${fingerprint}\n${flags}\n${cleanAuthor}\n${normalizedText}`
}

function setCacheEntry(key: string, value: CachedVerdict) {
  if (verdictCache.has(key)) verdictCache.delete(key)
  verdictCache.set(key, value)
  if (verdictCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = verdictCache.keys().next().value
    if (oldestKey !== undefined) verdictCache.delete(oldestKey)
  }
}

export function clearCommentAiFilterCache(comments?: CommentAiFilterInputItem[]) {
  if (!comments?.length) {
    verdictCache.clear()
    return
  }

  const fingerprint = getCommentAiFilterConfigFingerprint()
  for (const comment of comments) {
    const normalized = normalizeCommentTextForAiFilter(comment.text)
    if (normalized) verdictCache.delete(buildCacheKey(fingerprint, normalized, comment))
  }
}

export function getCachedCommentVerdict(
  text: string,
  meta?: CacheKeyCommentMeta,
): CachedVerdict | undefined {
  const normalized = normalizeCommentTextForAiFilter(text)
  if (!normalized) return undefined
  const key = buildCacheKey(getCommentAiFilterConfigFingerprint(), normalized, meta)
  const hit = verdictCache.get(key)
  if (!hit) return undefined
  // Refresh LRU order
  verdictCache.delete(key)
  verdictCache.set(key, hit)
  return hit
}

export interface ClassifyBatchResult {
  ok: boolean
  results: CommentAiFilterVerdict[]
  error?: string
}

export async function classifyCommentsBatch(
  comments: CommentAiFilterInputItem[],
  options?: {
    context?: CommentAiFilterClassifyRequest['context']
    bypassCache?: boolean
    onChunkResult?: (verdicts: CommentAiFilterVerdict[]) => void
  },
): Promise<ClassifyBatchResult> {
  if (!comments.length) return { ok: true, results: [] }

  const fingerprint = getCommentAiFilterConfigFingerprint()
  const resultsById = new Map<string, CommentAiFilterVerdict>()
  const initialHits: CommentAiFilterVerdict[] = []

  // 相同正文合并去重，只向模型发送一次，结果回填给所有同文案评论。
  const uncachedByText = new Map<string, CommentAiFilterInputItem[]>()
  const uniqueUncachedItems: CommentAiFilterInputItem[] = []

  const dimensions = settings.value.commentAiFilterDimensions || []
  const customPrompt = settings.value.commentAiFilterCustomPrompt.trim()
  if (dimensions.length === 0 && !customPrompt) {
    const passthrough = comments.map((comment) => ({
      id: comment.id,
      lowQuality: false,
    }))
    options?.onChunkResult?.(passthrough)
    return {
      ok: true,
      results: passthrough,
    }
  }

  for (const comment of comments) {
    const normalized = normalizeCommentTextForAiFilter(comment.text)
    if (!normalized) {
      const verdict: CommentAiFilterVerdict = { id: comment.id, lowQuality: false }
      resultsById.set(comment.id, verdict)
      initialHits.push(verdict)
      continue
    }

    const localMatch = matchLocalCommentAiFilterRule(comment, dimensions)
    if (localMatch) {
      resultsById.set(comment.id, localMatch)
      initialHits.push(localMatch)
      continue
    }

    const cacheKey = buildCacheKey(fingerprint, normalized, comment)
    if (!options?.bypassCache) {
      const cached = verdictCache.get(cacheKey)
      if (cached) {
        const verdict: CommentAiFilterVerdict = {
          id: comment.id,
          lowQuality: cached.lowQuality,
          category: cached.category,
          reason: cached.reason,
        }
        resultsById.set(comment.id, verdict)
        initialHits.push(verdict)
        continue
      }
    }

    const bucket = uncachedByText.get(cacheKey)
    if (bucket) {
      bucket.push(comment)
    } else {
      uncachedByText.set(cacheKey, [comment])
      uniqueUncachedItems.push({
        ...comment,
        text: normalized,
      })
    }
  }

  if (initialHits.length > 0) options?.onChunkResult?.(initialHits)

  if (!uniqueUncachedItems.length) {
    return {
      ok: true,
      results: comments
        .map((c) => resultsById.get(c.id))
        .filter((v): v is CommentAiFilterVerdict => Boolean(v)),
    }
  }

  const batchSize = normalizeCommentAiFilterBatchSize(settings.value.commentAiFilterBatchSize)
  const chunks: CommentAiFilterInputItem[][] = []
  for (let i = 0; i < uniqueUncachedItems.length; i += batchSize)
    chunks.push(uniqueUncachedItems.slice(i, i + batchSize))

  let lastError: string | undefined
  let cursor = 0

  async function requestChunk(
    chunk: CommentAiFilterInputItem[],
  ): Promise<CommentAiFilterClassifyResponse> {
    let response = await sendMessage<
      CommentAiFilterClassifyRequest,
      CommentAiFilterClassifyResponse
    >(COMMENT_AI_FILTER_CLASSIFY_MESSAGE, {
      comments: chunk,
      context: options?.context,
    })
    if (response && !response.ok && isTransientError(response.error)) {
      await delay(TRANSIENT_RETRY_DELAY_MS)
      response = await sendMessage<CommentAiFilterClassifyRequest, CommentAiFilterClassifyResponse>(
        COMMENT_AI_FILTER_CLASSIFY_MESSAGE,
        {
          comments: chunk,
          context: options?.context,
        },
      )
    }
    return response
  }

  async function runWorker() {
    while (cursor < chunks.length) {
      const chunkIndex = cursor
      cursor += 1
      const chunk = chunks[chunkIndex]
      if (!chunk?.length) continue

      try {
        const response = await requestChunk(chunk)

        if (!response || !response.ok) {
          lastError = response?.error || 'AI classification failed.'
          continue
        }

        const verdictByRepresentativeId = new Map(response.results.map((item) => [item.id, item]))
        const chunkVerdicts: CommentAiFilterVerdict[] = []
        for (const representative of chunk) {
          const verdict = verdictByRepresentativeId.get(representative.id) ?? {
            id: representative.id,
            lowQuality: false,
          }
          const cacheValue: CachedVerdict = {
            lowQuality: verdict.lowQuality,
            category: verdict.category,
            reason: verdict.reason,
          }
          const repCacheKey = buildCacheKey(fingerprint, representative.text, representative)
          setCacheEntry(repCacheKey, cacheValue)

          const group = uncachedByText.get(repCacheKey) ?? [representative]
          for (const member of group) {
            const resolved: CommentAiFilterVerdict = {
              id: member.id,
              lowQuality: verdict.lowQuality,
              category: verdict.category,
              reason: verdict.reason,
            }
            resultsById.set(member.id, resolved)
            chunkVerdicts.push(resolved)
          }
        }

        if (chunkVerdicts.length > 0) options?.onChunkResult?.(chunkVerdicts)
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
      }
    }
  }

  const maxConcurrency = batchSize === 1 ? MAX_CONCURRENT_SINGLE : MAX_CONCURRENT_BATCHES
  const workerCount = Math.min(maxConcurrency, chunks.length)
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))

  const orderedResults = comments
    .map((c) => resultsById.get(c.id))
    .filter((v): v is CommentAiFilterVerdict => Boolean(v))

  return {
    ok: !lastError,
    results: orderedResults,
    error: lastError,
  }
}

export function testCommentAiFilterConnection(
  configOverride?: Partial<CommentAiFilterConfigSnapshot>,
): Promise<CommentAiFilterTestResponse> {
  return sendMessage<CommentAiFilterTestRequest, CommentAiFilterTestResponse>(
    COMMENT_AI_FILTER_TEST_MESSAGE,
    configOverride ? { config: configOverride } : {},
  )
}
