import type { CommentShadowBanContext, CommentShadowBanReplyData } from '~/constants/commentShadowBan'
import { COMMENT_SHADOW_BAN_CHECK_REQUEST } from '~/constants/commentShadowBan'

interface CommentAddResponse {
  code?: number
  data?: {
    reply?: CommentShadowBanReplyData
  }
}

function toIdString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string')
    return input
  return input instanceof URL ? input.href : input.url
}

export function isCommentAddRequest(input: RequestInfo | URL): boolean {
  try {
    return new URL(getRequestUrl(input), location.href).pathname === '/x/v2/reply/add'
  }
  catch {
    return false
  }
}

export async function handleCommentAddResponse(response: Response): Promise<void> {
  try {
    const responseData = await response.clone().json() as CommentAddResponse
    if (responseData.code !== 0)
      return

    const reply = responseData.data?.reply
    if (!reply) {
      console.error('[BewlyCat] Comment visibility check could not start: reply data is missing.')
      return
    }

    const context: CommentShadowBanContext = {
      oid: toIdString(reply.oid_str ?? reply.oid),
      type: toIdString(reply.type ?? 1),
      rpid: toIdString(reply.rpid_str ?? reply.rpid),
      root: toIdString(reply.root_str ?? reply.root ?? 0),
      ctime: reply.ctime ?? Math.floor(Date.now() / 1000),
      message: reply.content?.message ?? '',
    }
    if (!context.oid || !context.rpid) {
      console.error('[BewlyCat] Comment visibility check could not start: comment identifiers are missing.', reply)
      return
    }

    window.postMessage({
      type: COMMENT_SHADOW_BAN_CHECK_REQUEST,
      data: context,
    }, '*')
  }
  catch (error) {
    console.error('[BewlyCat] Comment visibility check could not start:', error)
  }
}
