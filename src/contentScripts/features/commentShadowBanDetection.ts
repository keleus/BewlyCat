import { useToast } from 'vue-toastification'

import type { CommentShadowBanContext, CommentShadowBanReplyData, CommentShadowBanResult } from '~/constants/commentShadowBan'
import { COMMENT_SHADOW_BAN_CHECK_REQUEST } from '~/constants/commentShadowBan'
import { settings } from '~/logic'
import api from '~/utils/api'
import { i18n } from '~/utils/i18n'

interface ApiResponse {
  code?: number
  message?: string
  data?: {
    replies?: CommentShadowBanReplyData[] | null
    top_replies?: CommentShadowBanReplyData[] | null
    root?: CommentShadowBanReplyData | null
    cursor?: {
      pagination_reply?: {
        next_offset?: string
      }
    }
  }
}

interface LookupResult {
  status: 'found' | 'missing' | 'error'
  reply?: CommentShadowBanReplyData
  detail?: string
}

const CHECK_DELAY_MS = 5000
const SORT_MODE_TIME = 2
const MAX_PUBLIC_LIST_PAGES = 10

function toIdString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function findReply(replies: CommentShadowBanReplyData[] | null | undefined, rpid: string): CommentShadowBanReplyData | null {
  if (!replies)
    return null

  for (const reply of replies) {
    if (toIdString(reply.rpid_str ?? reply.rpid) === rpid)
      return reply

    const nestedReply = findReply(reply.replies, rpid)
    if (nestedReply)
      return nestedReply
  }

  return null
}

function getResponseError(response: ApiResponse): string {
  return `code=${response.code ?? 'unknown'} ${response.message ?? ''}`.trim()
}

function getMainParams(context: CommentShadowBanContext, nextOffset: string, seekRpid = '') {
  return {
    mode: SORT_MODE_TIME,
    oid: context.oid,
    pagination_str: JSON.stringify({ offset: nextOffset }),
    plat: 1,
    seek_rpid: seekRpid,
    type: context.type,
    web_location: 1315875,
  }
}

function getRepliesParams(context: CommentShadowBanContext) {
  return {
    oid: context.oid,
    pn: 0,
    root: context.rpid,
    sort: 0,
    type: context.type,
  }
}

async function getMainCommentList(
  context: CommentShadowBanContext,
  nextOffset: string,
  noCookie: boolean,
  seekRpid = '',
): Promise<ApiResponse> {
  const params = getMainParams(context, nextOffset, seekRpid)
  return noCookie
    ? await api.comment.getNoCookieCommentMain(params)
    : await api.comment.getCommentMain(params)
}

async function getCommentReplies(
  context: CommentShadowBanContext,
  noCookie: boolean,
): Promise<ApiResponse> {
  const params = getRepliesParams(context)
  return noCookie
    ? await api.comment.getNoCookieCommentReplies(params)
    : await api.comment.getCommentReplies(params)
}

async function findUsingSeekRpid(
  context: CommentShadowBanContext,
  noCookie: boolean,
): Promise<LookupResult> {
  const response = await getMainCommentList(context, '', noCookie, context.rpid)
  if (response.code !== 0)
    return { status: 'error', detail: getResponseError(response) }

  const replies = [
    ...(response.data?.replies ?? []),
    ...(response.data?.top_replies ?? []),
  ]
  const reply = findReply(replies, context.rpid)
  return reply ? { status: 'found', reply } : { status: 'missing' }
}

async function detectRootComment(context: CommentShadowBanContext): Promise<CommentShadowBanResult> {
  let nextOffset = ''
  for (let page = 0; page < MAX_PUBLIC_LIST_PAGES; page += 1) {
    const response = await getMainCommentList(context, nextOffset, true)
    if (response.code !== 0)
      return { verdict: 'error', detail: `public list ${getResponseError(response)}` }

    const replies = response.data?.replies ?? []
    const visibleReply = findReply([
      ...(page === 0 ? response.data?.top_replies ?? [] : []),
      ...replies,
    ], context.rpid)
    if (visibleReply)
      return { verdict: visibleReply.invisible ? 'invisible' : 'ok' }

    if (replies.length === 0)
      break

    const oldestReplyTime = replies[replies.length - 1]?.ctime
    if (oldestReplyTime && oldestReplyTime < context.ctime)
      break

    const newOffset = response.data?.cursor?.pagination_reply?.next_offset
    if (!newOffset || newOffset === nextOffset)
      break
    nextOffset = newOffset
  }

  const loggedInResponse = await getCommentReplies(context, false)
  if (loggedInResponse.code === 12022)
    return { verdict: 'deleted' }
  if (loggedInResponse.code !== 0)
    return { verdict: 'error', detail: `authenticated thread ${getResponseError(loggedInResponse)}` }

  const publicResponse = await getCommentReplies(context, true)
  if (publicResponse.code === 12022)
    return { verdict: 'shadowban' }
  if (publicResponse.code !== 0)
    return { verdict: 'error', detail: `public thread ${getResponseError(publicResponse)}` }
  if (publicResponse.data?.root?.invisible)
    return { verdict: 'invisible' }
  return { verdict: 'suspicious' }
}

async function detectReply(context: CommentShadowBanContext): Promise<CommentShadowBanResult> {
  const publicLookup = await findUsingSeekRpid(context, true)
  if (publicLookup.status === 'error')
    return { verdict: 'error', detail: `public reply ${publicLookup.detail}` }
  if (publicLookup.status === 'found')
    return { verdict: publicLookup.reply?.invisible ? 'invisible' : 'ok' }

  const loggedInLookup = await findUsingSeekRpid(context, false)
  if (loggedInLookup.status === 'error')
    return { verdict: 'error', detail: `authenticated reply ${loggedInLookup.detail}` }
  if (loggedInLookup.status === 'found')
    return { verdict: 'shadowban' }
  return { verdict: 'deleted' }
}

function reportDetectionResult(result: CommentShadowBanResult, comment: string) {
  if (result.verdict === 'error' || result.verdict === 'suspicious') {
    console.error(
      '[BewlyCat] Comment visibility could not be determined:',
      result.detail ?? result.verdict,
    )
    return
  }

  if (result.verdict !== 'shadowban' && result.verdict !== 'invisible')
    return

  const toast = useToast()
  const { t } = i18n.global
  const description = t(`comment_shadow_ban_detection.${result.verdict}`)
  const truncatedComment = comment.length > 80 ? `${comment.slice(0, 80)}…` : comment
  const message = `${description}「${truncatedComment}」`
  const options = {
    timeout: 9000,
  }

  if (result.verdict === 'invisible')
    toast.warning(message, options)
  else
    toast.error(message, options)
}

function isCommentContext(value: unknown): value is CommentShadowBanContext {
  if (!value || typeof value !== 'object')
    return false

  const context = value as Partial<CommentShadowBanContext>
  return typeof context.oid === 'string'
    && typeof context.type === 'string'
    && typeof context.rpid === 'string'
    && typeof context.root === 'string'
    && typeof context.ctime === 'number'
    && typeof context.message === 'string'
}

export function setupCommentShadowBanDetection() {
  const pendingCommentIds = new Set<string>()

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== COMMENT_SHADOW_BAN_CHECK_REQUEST)
      return
    if (!settings.value.detectCommentShadowBan || !isCommentContext(event.data.data))
      return

    const context = event.data.data
    const commentId = `${context.oid}:${context.rpid}`
    if (pendingCommentIds.has(commentId))
      return
    pendingCommentIds.add(commentId)

    void (async () => {
      await new Promise(resolve => window.setTimeout(resolve, CHECK_DELAY_MS))
      if (!settings.value.detectCommentShadowBan)
        return

      try {
        const result = context.root === '0'
          ? await detectRootComment(context)
          : await detectReply(context)
        reportDetectionResult(result, context.message)
      }
      catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        reportDetectionResult({ verdict: 'error', detail }, context.message)
      }
    })().finally(() => pendingCommentIds.delete(commentId))
  })
}
