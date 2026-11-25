import { watch } from 'vue'

import { settings } from '~/logic'
import type { CommentAiFilterInputItem } from '~/utils/commentAiFilter'
import {
  COMMENT_AI_FILTER_PAGE_CACHE_CLEAR,
  COMMENT_AI_FILTER_PAGE_REQUEST,
  COMMENT_AI_FILTER_PAGE_RESPONSE,
} from '~/utils/commentAiFilter'
import {
  classifyCommentsBatch,
  clearCommentAiFilterCache,
  getCommentAiFilterConfigFingerprint,
} from '~/utils/commentAiFilterClient'

let bridgeInstalled = false

export function setupCommentAiFilterBridge() {
  if (bridgeInstalled) return
  bridgeInstalled = true

  watch(getCommentAiFilterConfigFingerprint, () => {
    clearCommentAiFilterCache()
  })

  window.addEventListener('message', (event) => {
    if (
      event.source !== window ||
      !event.data ||
      typeof event.data !== 'object' ||
      Array.isArray(event.data)
    )
      return

    const { type } = event.data as { type?: unknown }
    if (type === COMMENT_AI_FILTER_PAGE_CACHE_CLEAR) {
      clearCommentAiFilterCache()
      return
    }

    if (type !== COMMENT_AI_FILTER_PAGE_REQUEST) return

    const payload = event.data as {
      requestId?: unknown
      comments?: unknown
      context?: { title?: unknown; source?: unknown }
      bypassCache?: unknown
    }
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
    if (!requestId) return

    const reply = (body: Record<string, unknown>) => {
      try {
        window.postMessage(
          {
            type: COMMENT_AI_FILTER_PAGE_RESPONSE,
            requestId,
            ...body,
          },
          window.location.origin,
        )
      } catch {
        // 忽略不透明来源或已卸载窗口的 postMessage 异常
      }
    }

    if (!settings.value.enableCommentEnhancements || !settings.value.enableCommentAiFilter) {
      reply({ ok: true, results: [] })
      return
    }

    const rawComments = Array.isArray(payload.comments) ? payload.comments : []
    const comments: CommentAiFilterInputItem[] = []
    for (const item of rawComments) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      if (typeof record.id !== 'string' || !record.id.trim() || typeof record.text !== 'string')
        continue
      comments.push({
        id: record.id.trim(),
        author: typeof record.author === 'string' ? record.author : undefined,
        text: record.text,
        isReply: record.isReply === true,
        isUp: record.isUp === true,
        isTop: record.isTop === true,
        upLiked: record.upLiked === true,
        likeCount: typeof record.likeCount === 'number' ? record.likeCount : undefined,
        hasPictures: record.hasPictures === true,
      })
    }

    const title =
      typeof payload.context?.title === 'string' ? payload.context.title : document.title
    void classifyCommentsBatch(comments, {
      context: { title, source: 'native' },
      bypassCache: payload.bypassCache === true,
      onChunkResult: (chunkResults) => {
        reply({
          partial: true,
          ok: true,
          results: chunkResults,
        })
      },
    })
      .then((result) => {
        reply({
          partial: false,
          ok: result.ok,
          results: result.results,
          error: result.error,
        })
      })
      .catch((error) => {
        reply({
          partial: false,
          ok: false,
          results: [],
          error: error instanceof Error ? error.message : String(error),
        })
      })
  })
}
