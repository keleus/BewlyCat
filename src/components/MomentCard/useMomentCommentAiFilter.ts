import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'

import { settings } from '~/logic'
import type { CommentAiFilterInputItem, CommentAiFilterVerdict } from '~/utils/commentAiFilter'
import { normalizeCommentTextForAiFilter } from '~/utils/commentAiFilter'
import {
  classifyCommentsBatch,
  clearCommentAiFilterCache,
  getCachedCommentVerdict,
  getCommentAiFilterConfigFingerprint,
} from '~/utils/commentAiFilterClient'

import type { CommentPreviewState, PreviewComment } from './commentPreview'
import type { DisplayMoment } from './types'

const AUTO_SCAN_DEBOUNCE_MS = 350

function extractCommentText(comment: PreviewComment): string {
  return comment.content.map((part) => part.text).join('')
}

export function useMomentCommentAiFilter(
  moment: DisplayMoment,
  state: CommentPreviewState,
  scrollerRef?: Ref<HTMLElement | undefined>,
) {
  const enabled = computed(
    () => settings.value.enableCommentEnhancements && settings.value.enableCommentAiFilter,
  )
  const displayMode = computed(() => settings.value.commentAiFilterDisplayMode)
  const autoScan = computed(() => settings.value.commentAiFilterAutoScan)
  const includeReplies = computed(() => settings.value.commentAiFilterIncludeReplies)

  const paused = ref(false)
  const scanning = ref(false)
  const error = ref('')

  const verdicts = reactive(new Map<string, CommentAiFilterVerdict>())
  const failedErrors = reactive(new Map<string, string>())
  const expandedIds = reactive(new Set<string>())
  const dismissedIds = reactive(new Set<string>())
  const visibleIds = reactive(new Set<string>())
  const inFlightIds = reactive(new Set<string>())

  let generation = 0
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let observer: IntersectionObserver | null = null
  let observedElements = new WeakSet<Element>()

  function disconnectObserver() {
    observer?.disconnect()
    observer = null
    observedElements = new WeakSet<Element>()
    visibleIds.clear()
  }

  function syncViewportObserver() {
    const scroller = scrollerRef?.value
    if (
      !scroller ||
      !state.expanded ||
      !enabled.value ||
      typeof IntersectionObserver === 'undefined'
    ) {
      disconnectObserver()
      return
    }

    if (!observer) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.commentId
            if (!id) continue
            if (entry.isIntersecting) visibleIds.add(id)
            else visibleIds.delete(id)
          }
        },
        {
          root: scroller,
          rootMargin: '80px 0px',
          threshold: 0.01,
        },
      )
    }

    const nodes = Array.from(scroller.querySelectorAll<HTMLElement>('[data-comment-id]'))
    for (const node of nodes) {
      if (!observedElements.has(node)) {
        observedElements.add(node)
        observer.observe(node)
      }
    }
  }

  function isCommentVisible(id: string): boolean {
    if (!scrollerRef || typeof IntersectionObserver === 'undefined') return true
    return visibleIds.has(id)
  }

  const eligibleComments = computed<CommentAiFilterInputItem[]>(() => {
    const items: CommentAiFilterInputItem[] = []
    const seen = new Set<string>()

    const pushComment = (comment: PreviewComment, isReply: boolean) => {
      if (!comment.id || seen.has(comment.id)) return
      const text = extractCommentText(comment)
      if (!normalizeCommentTextForAiFilter(text)) return
      seen.add(comment.id)
      items.push({
        id: comment.id,
        author: comment.author || undefined,
        text,
        isReply,
        isUp: Boolean(moment.author.mid && comment.mid && moment.author.mid === comment.mid),
        isTop: comment.isTop === true,
        upLiked: comment.upLiked === true,
        likeCount: comment.likeCount,
        hasPictures: comment.pictures.length > 0,
      })
    }

    for (const root of state.comments) {
      pushComment(root, false)
      if (includeReplies.value) {
        const replies = root.repliesExpanded && root.replyPage > 0 ? root.replies : root.hotReplies
        for (const reply of replies) pushComment(reply, true)
      }
    }

    return items
  })

  const unscannedComments = computed(() =>
    eligibleComments.value.filter(
      (item) => isCommentVisible(item.id) && !verdicts.has(item.id) && !inFlightIds.has(item.id),
    ),
  )

  const flaggedCount = computed(() => {
    if (!enabled.value || paused.value) return 0

    let count = 0
    for (const item of eligibleComments.value) {
      if (dismissedIds.has(item.id)) continue
      if (verdicts.get(item.id)?.lowQuality) count += 1
    }
    return count
  })

  function hydrateFromCache(items: CommentAiFilterInputItem[]) {
    for (const item of items) {
      if (verdicts.has(item.id)) continue
      const cached = getCachedCommentVerdict(item.text, item)
      if (cached) {
        verdicts.set(item.id, {
          id: item.id,
          lowQuality: cached.lowQuality,
          category: cached.category,
          reason: cached.reason,
        })
      }
    }
  }

  function getCommentAiStatus(
    commentId: string,
  ): 'analyzing' | 'passed' | 'flagged' | 'error' | null {
    if (!enabled.value || paused.value) return null
    if (dismissedIds.has(commentId)) return 'passed'
    if (inFlightIds.has(commentId)) return 'analyzing'
    const verdict = verdicts.get(commentId)
    if (verdict) return verdict.lowQuality ? 'flagged' : 'passed'
    if (failedErrors.has(commentId)) return 'error'
    return null
  }

  function getCommentError(commentId: string): string {
    return failedErrors.get(commentId) ?? ''
  }

  async function retryComment(commentId: string) {
    if (!enabled.value || paused.value) return
    const target = eligibleComments.value.find((item) => item.id === commentId)
    if (!target || inFlightIds.has(commentId)) return

    const currentGen = generation
    failedErrors.delete(commentId)
    inFlightIds.add(commentId)
    scanning.value = true
    try {
      const response = await classifyCommentsBatch([target], {
        context: {
          title: moment.title || moment.author.name || '',
          source: 'moments',
        },
        bypassCache: true,
      })
      if (currentGen !== generation) return
      for (const item of response.results) {
        verdicts.set(item.id, item)
        failedErrors.delete(item.id)
      }
      if (!response.ok && response.error && !verdicts.has(commentId))
        failedErrors.set(commentId, response.error)
    } catch (err) {
      if (currentGen === generation)
        failedErrors.set(commentId, err instanceof Error ? err.message : String(err))
    } finally {
      inFlightIds.delete(commentId)
      if (currentGen === generation) scanning.value = inFlightIds.size > 0
    }
  }

  function getFlaggedVerdict(commentId: string): CommentAiFilterVerdict | undefined {
    if (!enabled.value || paused.value || dismissedIds.has(commentId)) return undefined
    const verdict = verdicts.get(commentId)
    return verdict?.lowQuality ? verdict : undefined
  }

  function isCommentHidden(commentId: string): boolean {
    return Boolean(getFlaggedVerdict(commentId)) && displayMode.value === 'hide'
  }

  function isCommentCollapsed(commentId: string): boolean {
    return (
      Boolean(getFlaggedVerdict(commentId)) &&
      displayMode.value === 'collapse' &&
      !expandedIds.has(commentId)
    )
  }

  function isCommentExpanded(commentId: string): boolean {
    return expandedIds.has(commentId)
  }

  function toggleExpand(commentId: string) {
    if (expandedIds.has(commentId)) expandedIds.delete(commentId)
    else expandedIds.add(commentId)
  }

  function dismissComment(commentId: string) {
    dismissedIds.add(commentId)
  }

  async function scanNow(forceRescan = false) {
    if (!enabled.value) return
    paused.value = false
    error.value = ''

    if (forceRescan) {
      generation += 1
      verdicts.clear()
      failedErrors.clear()
      dismissedIds.clear()
      inFlightIds.clear()
      clearCommentAiFilterCache(eligibleComments.value)
    } else {
      hydrateFromCache(eligibleComments.value)
    }

    const visibleTargets = eligibleComments.value.filter((item) => isCommentVisible(item.id))
    const targets = forceRescan ? visibleTargets : [...unscannedComments.value]
    if (!targets.length) return

    const currentGen = generation
    for (const item of targets) {
      inFlightIds.add(item.id)
      failedErrors.delete(item.id)
    }
    scanning.value = true

    try {
      const response = await classifyCommentsBatch(targets, {
        context: {
          title: moment.title || moment.author.name || '',
          source: 'moments',
        },
        bypassCache: forceRescan,
        onChunkResult: (chunkResults) => {
          if (currentGen !== generation) return
          for (const item of chunkResults) {
            verdicts.set(item.id, item)
            failedErrors.delete(item.id)
            inFlightIds.delete(item.id)
          }
        },
      })

      if (currentGen !== generation) return

      for (const item of response.results) {
        verdicts.set(item.id, item)
        failedErrors.delete(item.id)
      }

      if (!response.ok && response.error) {
        error.value = response.error
        for (const item of targets) {
          if (!verdicts.has(item.id)) failedErrors.set(item.id, response.error)
        }
      }
    } catch (err) {
      if (currentGen === generation) {
        const message = err instanceof Error ? err.message : String(err)
        error.value = message
        for (const item of targets) {
          if (!verdicts.has(item.id)) failedErrors.set(item.id, message)
        }
      }
    } finally {
      for (const item of targets) inFlightIds.delete(item.id)
      if (currentGen === generation) scanning.value = inFlightIds.size > 0
    }
  }

  function togglePaused() {
    paused.value = !paused.value
    if (!paused.value && autoScan.value) void scanNow(false)
  }

  function scheduleAutoScan() {
    clearTimeout(debounceTimer)
    if (!state.expanded || !enabled.value || paused.value || !autoScan.value) return

    hydrateFromCache(eligibleComments.value)
    if (!unscannedComments.value.length) return

    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      if (state.expanded && enabled.value && !paused.value && autoScan.value) void scanNow(false)
    }, AUTO_SCAN_DEBOUNCE_MS)
  }

  watch(getCommentAiFilterConfigFingerprint, () => {
    generation += 1
    verdicts.clear()
    inFlightIds.clear()
    error.value = ''
    scanning.value = false
    scheduleAutoScan()
  })

  watch(
    () => [
      state.expanded,
      enabled.value,
      scrollerRef?.value,
      eligibleComments.value.map((item) => item.id).join(','),
    ],
    () => {
      void nextTick(() => syncViewportObserver())
    },
    { immediate: true },
  )

  watch(
    () => [
      state.expanded,
      enabled.value,
      paused.value,
      autoScan.value,
      unscannedComments.value.map((item) => item.id).join(','),
    ],
    () => {
      scheduleAutoScan()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    clearTimeout(debounceTimer)
    disconnectObserver()
    generation += 1
  })

  return {
    enabled,
    displayMode,
    autoScan,
    paused,
    scanning,
    error,
    eligibleComments,
    unscannedComments,
    flaggedCount,
    getCommentAiStatus,
    getCommentError,
    retryComment,
    getFlaggedVerdict,
    isCommentHidden,
    isCommentCollapsed,
    isCommentExpanded,
    toggleExpand,
    dismissComment,
    togglePaused,
    scanNow,
  }
}
