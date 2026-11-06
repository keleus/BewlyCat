import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import type { ApiFailureRecord } from '~/constants/apiDiagnostics'
import { API_FAILURE_DIAGNOSTIC_MESSAGE } from '~/constants/apiDiagnostics'
import {
  sanitizeDiagnosticBody,
  sanitizeDiagnosticText,
  sanitizeDiagnosticUrl,
  sanitizeDiagnosticValue,
} from '~/utils/apiDiagnosticSanitizer'
import { isBilibiliRiskControl } from '~/utils/bilibiliApiError'

const BODY_PREVIEW_LENGTH = 2000

export interface ApiRequestAttempt {
  url: string
  method: string
  body?: unknown
  credentials?: RequestCredentials
  wbi?: ApiFailureRecord['wbi']
  status?: number
  contentType?: string
  preview?: Promise<string>
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null
}

/** code=0 也可能是风控：网页接口用 v_voucher 或 is_risk 标记校验响应。 */
export function isApiResponseFailure(response: unknown): boolean {
  if (!isRecord(response))
    return false
  if (typeof response.code === 'number' && response.code !== 0)
    return true
  return isBilibiliRiskControl(response) || Boolean(response.data?.is_risk || response.data?.gaia_res_type)
}

/** 记录请求的状态和响应类型，并为无法解析成 JSON 的响应保留正文开头。 */
export function captureApiResponse(attempt: ApiRequestAttempt, response: Response) {
  attempt.status = response.status
  attempt.contentType = response.headers.get('content-type') ?? undefined
  attempt.preview = !response.ok || !attempt.contentType?.includes('json')
    ? response.clone().text().catch(() => '')
    : undefined
}

/**
 * Service Worker 随时可能休眠，诊断记录在失败时直接发给发起请求的页面保存。
 * 诊断是尽力而为的旁路，不能影响接口结果，因此这里不抛出任何错误。
 */
export async function reportApiFailure(
  sender: Browser.Runtime.MessageSender | undefined,
  source: 'web' | 'app',
  query: string,
  attempt: ApiRequestAttempt,
  startedAt: number,
  failure: { response?: unknown, error?: unknown },
) {
  const tabId = sender?.tab?.id
  if (tabId === undefined)
    return

  try {
    const { response, error } = failure
    const responseRecord = isRecord(response) ? response : undefined
    const errorRecord = isRecord(error) ? error : undefined
    const preview = await attempt.preview
    const message = responseRecord?.message ?? errorRecord?.message ?? (error === undefined ? undefined : String(error))
    const record: ApiFailureRecord = {
      time: Date.now(),
      source,
      query,
      method: attempt.method.toUpperCase(),
      ...sanitizeDiagnosticUrl(attempt.url),
      body: sanitizeDiagnosticBody(attempt.body),
      credentials: attempt.credentials,
      wbi: attempt.wbi,
      status: attempt.status,
      contentType: attempt.contentType,
      durationMs: Date.now() - startedAt,
      code: responseRecord?.code ?? errorRecord?.code,
      message: typeof message === 'string' ? sanitizeDiagnosticText(message) : undefined,
      errorName: errorRecord?.name,
      likelyRiskControl: attempt.status === 412 || isBilibiliRiskControl(response) || isBilibiliRiskControl(error),
      response: sanitizeDiagnosticValue(response),
      bodyPreview: preview ? sanitizeDiagnosticText(preview, BODY_PREVIEW_LENGTH) : undefined,
    }
    await browser.tabs.sendMessage(
      tabId,
      { type: API_FAILURE_DIAGNOSTIC_MESSAGE, data: record },
      sender?.frameId === undefined ? undefined : { frameId: sender.frameId },
    )
  }
  catch {
    // 页面可能已关闭或没有内容脚本。
  }
}
