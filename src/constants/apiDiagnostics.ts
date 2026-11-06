export const API_FAILURE_DIAGNOSTIC_MESSAGE = 'bewly-api-failure-diagnostic'

/** 一次失败请求的诊断记录。离开产生记录的上下文前必须已完成脱敏和截断。 */
export interface ApiFailureRecord {
  time: number
  /** web：后台 fetch；app：后台 APP 客户端；page：只有页面能判断的失败，如 code=0 的空列表 */
  source: 'web' | 'app' | 'page'
  query: string
  method?: string
  url?: string
  params?: unknown
  body?: unknown
  credentials?: RequestCredentials
  wbi?: {
    signed: boolean
    refreshedKeys: boolean
    fellBackToUnsigned: boolean
  }
  status?: number
  contentType?: string
  durationMs?: number
  code?: number
  message?: string
  errorName?: string
  likelyRiskControl: boolean
  response?: unknown
  /** 非 JSON 响应的正文开头，如风控 HTML 页面 */
  bodyPreview?: string
}
