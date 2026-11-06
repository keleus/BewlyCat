import browser from 'webextension-polyfill'

import type { ApiFailureRecord } from '~/constants/apiDiagnostics'
import { API_FAILURE_DIAGNOSTIC_MESSAGE } from '~/constants/apiDiagnostics'
import { settings } from '~/logic'
import { sanitizeDiagnosticText, sanitizeDiagnosticValue } from '~/utils/apiDiagnosticSanitizer'
import type { BrowserInfo } from '~/utils/browserInfo'
import { GET_BROWSER_INFO_MESSAGE, getBrowserInfo } from '~/utils/browserInfo'
import { getCookie } from '~/utils/main'
import { isBackgroundUnavailableError, sendMessage } from '~/utils/messaging'

const MAX_RECORDS = 20
const MAX_REPORTED_REQUESTS = 6

// 排查只需要当前状态：每个接口只保留最新一次失败，重试和轮询不会堆积成历史。
const latestRecords = new Map<string, ApiFailureRecord>()

export type ApiErrorReportItems = Record<string, string | number | boolean>

/** 描述一个可能出现请求失败的页面，用于在报告中筛选接口并附上相关设置。 */
export interface ApiErrorReportSource {
  scene: string
  /** 该页面依赖的接口；报告只展示它们的失败。 */
  queries?: readonly string[]
  /** 键为分节标题，值为该节的“名称: 取值”条目。 */
  getContext?: () => Record<string, ApiErrorReportItems>
}

export interface ApiErrorReport {
  likelyRiskControl: boolean
  hasRequestRecords: boolean
  text: string
}

function addRecord(record: ApiFailureRecord) {
  latestRecords.delete(record.query)
  latestRecords.set(record.query, record)
  if (latestRecords.size > MAX_RECORDS)
    latestRecords.delete(latestRecords.keys().next().value!)
}

export function setupApiFailureDiagnostics() {
  browser.runtime.onMessage.addListener((message: any) => {
    if (message?.type === API_FAILURE_DIAGNOSTIC_MESSAGE && message.data)
      addRecord(message.data as ApiFailureRecord)
  })
}

/** 记录后台无法判断的失败，比如接口成功返回但列表为空。 */
export function recordPageApiFailure(failure: {
  query: string
  message: string
  params?: unknown
  response?: unknown
  likelyRiskControl?: boolean
}) {
  addRecord({
    time: Date.now(),
    source: 'page',
    query: failure.query,
    message: sanitizeDiagnosticText(failure.message),
    params: sanitizeDiagnosticValue(failure.params),
    response: sanitizeDiagnosticValue(failure.response),
    likelyRiskControl: Boolean(failure.likelyRiskControl),
  })
}

/** 请求没能到达后台时，后台不会产生记录，由调用方在页面侧补上。 */
export function recordBackgroundUnavailable(query: string, params: unknown, error: unknown) {
  if (!isBackgroundUnavailableError(error))
    return

  recordPageApiFailure({
    query,
    params,
    message: error instanceof Error ? error.message : String(error),
  })
}

function formatItemValue(value: string | number | boolean): string {
  if (typeof value === 'boolean')
    return value ? '是' : '否'
  return String(value)
}

function formatParams(params: unknown): string {
  if (typeof params !== 'object' || params === null)
    return String(params)
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join('&')
}

function formatJson(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function formatWbi({ signed, refreshedKeys, fellBackToUnsigned }: NonNullable<ApiFailureRecord['wbi']>): string {
  return [
    signed ? '已签名' : '未签名',
    refreshedKeys ? '已刷新密钥' : '',
    fellBackToUnsigned ? '签名请求失败后改用无签名重试' : '',
  ].filter(Boolean).join('，')
}

function formatRecord(record: ApiFailureRecord, index: number): string {
  const result = [
    record.status === undefined ? '' : `HTTP ${record.status}`,
    record.code === undefined ? '' : `code ${record.code}`,
    record.message ?? '',
    record.errorName ?? '',
  ].filter(Boolean).join(' / ')

  const lines = [
    `${index + 1}. ${record.query}${record.likelyRiskControl ? '（疑似风控）' : ''}`,
    `时间: ${new Date(record.time).toLocaleString()}${record.durationMs === undefined ? '' : `，耗时 ${record.durationMs} ms`}`,
    `结果: ${result || '未知'}`,
  ]
  if (record.url)
    lines.push(`请求: ${record.method ?? ''} ${record.url}`.trim())
  if (record.credentials)
    lines.push(`Cookie: ${record.credentials === 'omit' ? '不携带' : '携带'}`)
  if (record.wbi)
    lines.push(`WBI: ${formatWbi(record.wbi)}`)
  if (record.contentType)
    lines.push(`响应类型: ${record.contentType}`)
  if (record.params !== undefined)
    lines.push(`参数: ${formatParams(record.params)}`)
  if (record.body !== undefined)
    lines.push(`请求体: ${formatJson(record.body)}`)
  if (record.response !== undefined)
    lines.push(`响应: ${formatJson(record.response)}`)
  if (record.bodyPreview)
    lines.push(`响应内容: ${record.bodyPreview}`)
  return lines.join('\n')
}

export async function buildApiErrorReport(source: ApiErrorReportSource): Promise<ApiErrorReport> {
  // 先同步取设置快照，等待后台返回浏览器信息期间设置可能已变化。
  const context = source.getContext?.() ?? {}
  const records = [...latestRecords.values()]
  const relatedQueries = new Set(source.queries)
  const related = records.filter(record => relatedQueries.has(record.query))
  // 找不到相关接口时可能是接口清单没覆盖到，展示其余接口比留空更有用。
  const requests = (related.length ? related : records).slice(-MAX_REPORTED_REQUESTS).reverse()

  const browserInfo = await sendMessage<undefined, BrowserInfo>(GET_BROWSER_INFO_MESSAGE)
    .catch(() => getBrowserInfo())
  const likelyRiskControl = requests.some(record => record.likelyRiskControl)

  const sections = [
    [
      'BewlyCat 错误报告',
      `页面: ${source.scene}（${location.origin}${location.pathname}）`,
      `时间: ${new Date().toLocaleString()}`,
      `版本: BewlyCat ${browser.runtime.getManifest().version}`,
      `浏览器: ${browserInfo.name ?? '未知'} ${browserInfo.version ?? ''}`.trim(),
      `语言: ${settings.value.language}`,
      `登录状态: ${getCookie('DedeUserID') ? '已登录' : '未登录'}`,
      `疑似风控: ${likelyRiskControl ? '是' : '否'}`,
    ].join('\n'),
    ...Object.entries(context).map(([title, items]) => [
      `【${title}】`,
      ...Object.entries(items).map(([name, value]) => `${name}: ${formatItemValue(value)}`),
    ].join('\n')),
    `【失败请求】\n${requests.length ? requests.map(formatRecord).join('\n\n') : '无记录'}`,
  ]

  return {
    likelyRiskControl,
    hasRequestRecords: requests.length > 0,
    text: sections.join('\n\n'),
  }
}
