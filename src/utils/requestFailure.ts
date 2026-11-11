import { isBilibiliRiskControl } from './bilibiliApiError'
import { isBackgroundUnavailableError } from './messaging'

/**
 * 请求失败的原因分类，用于给出可操作的提示。
 *
 * 经 `runtime.sendMessage` 返回的错误在 Chrome 中只保留 message，
 * 因此网络层的分类依赖后台抛出的错误文案，而不是附加字段。
 */
export type RequestFailureKind
  = | 'background'
    | 'offline'
    | 'riskControl'
    | 'http'
    | 'invalidResponse'
    | 'api'
    | 'empty'
    | 'timeout'
    | 'network'
    | 'unknown'

export interface RequestFailure {
  kind: RequestFailureKind
  /** HTTP 状态码，仅 `http` 类型 */
  status?: number
  /** B 站接口返回的 code，仅 `api` 类型 */
  code?: number
  message?: string
}

// 多次尝试结果不同时，展示最能说明问题的一条：
// 本地环境问题优先于服务端响应，明确的响应优先于含糊的连接失败。
const KIND_PRIORITY: Record<RequestFailureKind, number> = {
  background: 100,
  offline: 90,
  riskControl: 80,
  http: 70,
  invalidResponse: 60,
  api: 50,
  empty: 40,
  timeout: 30,
  network: 20,
  unknown: 0,
}

// 匹配 timeout、timed out
const TIMEOUT_PATTERN = /timed?\s*out/i
const NETWORK_PATTERN = /failed to fetch|networkerror|network error|load failed|net::|err_[a-z_]+/i
const INVALID_JSON_PATTERN = /json|unexpected (?:token|end|character)|invalid response/i
const HTTP_STATUS_PATTERN = /\bHTTP (\d{3})\b/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toFiniteNumber(value: unknown): number | undefined {
  const numberValue = typeof value === 'string' && value.trim() ? Number(value) : value
  return typeof numberValue === 'number' && Number.isFinite(numberValue) ? numberValue : undefined
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function classifyErrorMessage(message: string, name?: string): RequestFailure {
  if (name === 'TimeoutError' || TIMEOUT_PATTERN.test(message))
    return { kind: isBrowserOffline() ? 'offline' : 'timeout', message }

  const status = toFiniteNumber(HTTP_STATUS_PATTERN.exec(message)?.[1])
  if (status !== undefined && (status < 200 || status >= 300))
    return { kind: 'http', status, message }

  if (NETWORK_PATTERN.test(message))
    return { kind: isBrowserOffline() ? 'offline' : 'network', message }

  if (name === 'SyntaxError' || INVALID_JSON_PATTERN.test(message))
    return { kind: 'invalidResponse', message }

  return { kind: isBrowserOffline() ? 'offline' : 'unknown', message }
}

function classifyError(error: unknown): RequestFailure {
  if (isBackgroundUnavailableError(error))
    return { kind: 'background', message: error instanceof Error ? error.message : String(error) }

  if (isBilibiliRiskControl(error))
    return { kind: 'riskControl', message: isRecord(error) ? String(error.message ?? '') : undefined }

  const name = error instanceof Error || isRecord(error) ? String(error.name ?? '') : undefined
  const message = error instanceof Error
    ? error.message
    : isRecord(error) ? String(error.message ?? '') : String(error)
  return classifyErrorMessage(message, name)
}

function classifyResponse(response: Record<string, unknown>, listKey: string): RequestFailure {
  if (isBilibiliRiskControl(response))
    return { kind: 'riskControl', code: toFiniteNumber(response.code), message: String(response.message ?? '') }

  const code = toFiniteNumber(response.code)
  const message = typeof response.message === 'string' ? response.message : ''

  if (code === 0) {
    const list = isRecord(response.data) ? response.data[listKey] : undefined
    return Array.isArray(list) && list.length > 0
      ? { kind: 'unknown' }
      : { kind: 'empty', code }
  }

  // 后台在网络层失败时返回 { code: -1, message }，HTTP 错误返回 { code: -status, message: 'HTTP xxx' }。
  if (code === -1 || HTTP_STATUS_PATTERN.test(message)) {
    const failure = classifyErrorMessage(message)
    if (failure.kind !== 'unknown')
      return failure
  }

  return { kind: 'api', code, message }
}

/**
 * 将一次请求的异常或非成功响应归类。
 * `listKey` 为响应 `data` 中列表字段的名称，用于识别 code=0 的空列表。
 */
export function classifyRequestFailure(
  { error, response }: { error?: unknown, response?: unknown },
  listKey = 'item',
): RequestFailure {
  if (error !== undefined)
    return classifyError(error)
  if (isRecord(response))
    return classifyResponse(response, listKey)
  return { kind: isBrowserOffline() ? 'offline' : 'unknown' }
}

/** 在多次尝试的失败中保留更能说明问题的一条，同级时以较新的为准。 */
export function pickRequestFailure(current: RequestFailure | undefined, next: RequestFailure): RequestFailure {
  if (!current)
    return next
  return KIND_PRIORITY[next.kind] >= KIND_PRIORITY[current.kind] ? next : current
}

/** 携带失败分类的错误，用于跨函数传递给展示提示的调用方。 */
export class RequestFailureError extends Error {
  readonly failure: RequestFailure

  constructor(message: string, failure: RequestFailure) {
    super(message)
    this.name = 'RequestFailureError'
    this.failure = failure
  }
}

export function getRequestFailure(error: unknown): RequestFailure {
  return error instanceof RequestFailureError ? error.failure : classifyRequestFailure({ error })
}
