export const COMMENT_SHADOW_BAN_CHECK_REQUEST = 'BEWLY_COMMENT_SHADOW_BAN_CHECK_REQUEST'

export interface CommentShadowBanReplyData {
  oid?: string | number
  oid_str?: string
  type?: string | number
  rpid?: string | number
  rpid_str?: string
  root?: string | number
  root_str?: string
  ctime?: number
  invisible?: boolean
  content?: {
    message?: string
  }
  replies?: CommentShadowBanReplyData[]
}

export interface CommentShadowBanContext {
  oid: string
  type: string
  rpid: string
  root: string
  ctime: number
  message: string
}

export type CommentShadowBanVerdict
  = | 'ok'
    | 'shadowban'
    | 'deleted'
    | 'invisible'
    | 'suspicious'
    | 'error'

export interface CommentShadowBanResult {
  verdict: CommentShadowBanVerdict
  detail?: string
}
