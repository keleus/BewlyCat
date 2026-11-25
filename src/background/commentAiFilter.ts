import browser from 'webextension-polyfill'

import type {
  CommentAiFilterClassifyRequest,
  CommentAiFilterClassifyResponse,
  CommentAiFilterConfigSnapshot,
  CommentAiFilterInputItem,
  CommentAiFilterTestRequest,
  CommentAiFilterTestResponse,
} from '~/utils/commentAiFilter'
import {
  buildCommentAiFilterMessages,
  COMMENT_AI_FILTER_CLASSIFY_MESSAGE,
  COMMENT_AI_FILTER_DEFAULT_DIMENSIONS,
  COMMENT_AI_FILTER_DEFAULT_INDEX_TRANSLATE_MODEL,
  COMMENT_AI_FILTER_FALLBACK_INDEX_TRANSLATE_MODELS,
  COMMENT_AI_FILTER_INDEX_TRANSLATE_BASE_URL,
  COMMENT_AI_FILTER_TEST_MESSAGE,
  normalizeCommentAiFilterDimensions,
  parseCommentAiFilterResponse,
  resolveChatCompletionsUrl,
} from '~/utils/commentAiFilter'
import { onMessage } from '~/utils/messaging'

const REQUEST_TIMEOUT_MS = 45_000
const MAX_COMMENTS_PER_CALL = 40
const INDEX_TRANSLATE_HEADER_RULE_ID = 1005
const INDEX_TRANSLATE_ORIGIN = 'https://index-translate.bilibili.com'

let indexTranslateHeaderRuleReady: Promise<void> | null = null

/**
 * Chromium 后台 Service Worker 发起 POST 请求会自动附带 `Origin: chrome-extension://...`，
 * 会被 B 站 WAF（openresty）直接拦截并返回 HTTP 412。
 * 用仅作用于非标签页（后台自身）的会话规则把 Origin/Referer 改写为目标站，避免 412。
 */
function ensureIndexTranslateHeaderRule(): Promise<void> {
  if (
    process.env.FIREFOX ||
    typeof browser.declarativeNetRequest?.updateSessionRules !== 'function'
  )
    return Promise.resolve()

  indexTranslateHeaderRuleReady ??= browser.declarativeNetRequest
    .updateSessionRules({
      removeRuleIds: [INDEX_TRANSLATE_HEADER_RULE_ID],
      addRules: [
        {
          id: INDEX_TRANSLATE_HEADER_RULE_ID,
          priority: 2,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'origin', operation: 'set', value: INDEX_TRANSLATE_ORIGIN },
              { header: 'referer', operation: 'set', value: `${INDEX_TRANSLATE_ORIGIN}/` },
            ],
          },
          condition: {
            urlFilter: '||index-translate.bilibili.com',
            resourceTypes: ['xmlhttprequest'],
            requestMethods: ['post'],
            tabIds: [-1],
          },
        },
      ],
    })
    .catch((error) => {
      indexTranslateHeaderRuleReady = null
      console.warn('[BewlyCat] Failed to register Index-Translate header rule:', error)
    })

  return indexTranslateHeaderRuleReady
}

function parseStoredObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  return {}
}

async function readCommentAiFilterConfig(
  override?: Partial<CommentAiFilterConfigSnapshot>,
): Promise<CommentAiFilterConfigSnapshot> {
  const stored = await browser.storage.local.get(['settings'])
  const settingsObj = parseStoredObject(stored.settings)

  const base: CommentAiFilterConfigSnapshot = {
    dimensions: normalizeCommentAiFilterDimensions(
      settingsObj.commentAiFilterDimensions ?? COMMENT_AI_FILTER_DEFAULT_DIMENSIONS,
    ),
    customPrompt:
      typeof settingsObj.commentAiFilterCustomPrompt === 'string'
        ? settingsObj.commentAiFilterCustomPrompt.trim()
        : '',
  }

  if (!override) return base

  return {
    dimensions:
      override.dimensions !== undefined
        ? normalizeCommentAiFilterDimensions(override.dimensions)
        : base.dimensions,
    customPrompt:
      typeof override.customPrompt === 'string' ? override.customPrompt.trim() : base.customPrompt,
  }
}

function resolveEndpoint():
  | {
      url: string
      models: string[]
      apiKey: string
    }
  | {
      error: string
    } {
  const url = resolveChatCompletionsUrl(COMMENT_AI_FILTER_INDEX_TRANSLATE_BASE_URL)
  if (!url) return { error: 'Failed to resolve Index-Translate endpoint URL.' }

  // 暂不开放外部供应商配置，固定使用 B 站内置免费 Index-Translate 接口（优先 35B-A3B，异常时回退 9B）。
  return {
    url,
    models: [
      COMMENT_AI_FILTER_DEFAULT_INDEX_TRANSLATE_MODEL,
      ...COMMENT_AI_FILTER_FALLBACK_INDEX_TRANSLATE_MODELS,
    ],
    apiKey: 'index',
  }
}

function extractMessageContent(data: unknown): string {
  if (!data || typeof data !== 'object') return ''

  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return ''

  const first = choices[0] as { message?: { content?: unknown }; text?: unknown } | undefined
  const content = first?.message?.content ?? first?.text
  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (
          part &&
          typeof part === 'object' &&
          typeof (part as { text?: unknown }).text === 'string'
        )
          return (part as { text: string }).text
        return ''
      })
      .join('\n')
  }

  return ''
}

function extractApiErrorMessage(status: number, statusText: string, bodyText: string): string {
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText) as {
        error?: { message?: unknown } | string
        message?: unknown
        detail?: unknown
      }
      const detail =
        typeof parsed.error === 'string'
          ? parsed.error
          : typeof parsed.error?.message === 'string'
            ? parsed.error.message
            : typeof parsed.message === 'string'
              ? parsed.message
              : typeof parsed.detail === 'string'
                ? parsed.detail
                : ''
      if (detail) return `HTTP ${status}: ${detail.slice(0, 180)}`
    } catch {
      const trimmed = bodyText.replace(/\s+/gu, ' ').trim()
      if (/^<!doctype\s+html|^<html\b/iu.test(trimmed))
        return `HTTP ${status}: 请求被服务端风控/网关拦截（返回了 HTML 页面）`
      if (trimmed) return `HTTP ${status}: ${trimmed.slice(0, 160)}`
    }
  }
  return `HTTP ${status}${statusText ? ` ${statusText}` : ''}`
}

async function callSingleModel(
  url: string,
  model: string,
  headers: Record<string, string>,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  comments: CommentAiFilterInputItem[],
  config: CommentAiFilterConfigSnapshot,
): Promise<CommentAiFilterClassifyResponse & { fatal?: boolean }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      // 不携带 B 站登录 Cookie，避免凭据泄露给外部模型接口。
      credentials: 'omit',
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: comments.length === 1 ? 256 : 1024,
        stream: false,
      }),
    })

    const bodyText = await response.text()
    if (!response.ok) {
      const fatal = response.status === 401 || response.status === 403 || response.status === 412
      return {
        ok: false,
        fatal,
        error: extractApiErrorMessage(response.status, response.statusText, bodyText),
      }
    }

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(bodyText)
    } catch {
      return {
        ok: false,
        error: 'API returned non-JSON response.',
      }
    }

    const content = extractMessageContent(parsedBody)
    const verdicts = parseCommentAiFilterResponse(content, comments, {
      enabledDimensions: config.dimensions,
      hasCustomPrompt: Boolean(config.customPrompt),
    })
    if (!verdicts) {
      const preview = content.replace(/\s+/gu, ' ').trim().slice(0, 120)
      return {
        ok: false,
        error: preview
          ? `Unexpected model output format: ${preview}`
          : 'Model returned an empty response.',
      }
    }

    return {
      ok: true,
      results: verdicts,
      model,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      return { ok: false, error: `Request timed out (${REQUEST_TIMEOUT_MS / 1000}s).` }

    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message || 'Network request failed.' }
  } finally {
    clearTimeout(timer)
  }
}

async function callCommentAiFilterApi(
  comments: CommentAiFilterInputItem[],
  config: CommentAiFilterConfigSnapshot,
  contextTitle?: string,
): Promise<CommentAiFilterClassifyResponse> {
  if (!comments.length) return { ok: true, results: [], model: '' }

  if (config.dimensions.length === 0 && !config.customPrompt) {
    return {
      ok: true,
      results: comments.map((c) => ({ id: c.id, lowQuality: false })),
      model: '',
    }
  }

  const endpoint = resolveEndpoint()
  if ('error' in endpoint) return { ok: false, error: endpoint.error }

  await ensureIndexTranslateHeaderRule()

  const messages = buildCommentAiFilterMessages(comments, {
    dimensions: config.dimensions,
    customPrompt: config.customPrompt,
    contextTitle,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (endpoint.apiKey) headers.Authorization = `Bearer ${endpoint.apiKey}`

  let lastError = 'AI classification failed.'
  for (const model of endpoint.models) {
    const result = await callSingleModel(endpoint.url, model, headers, messages, comments, config)
    if (result.ok) return result
    lastError = result.error
    if (result.fatal) break
  }

  return {
    ok: false,
    error: lastError,
  }
}

async function handleClassifyRequest(
  request: CommentAiFilterClassifyRequest,
): Promise<CommentAiFilterClassifyResponse> {
  if (!request || !Array.isArray(request.comments))
    return { ok: false, error: 'Invalid comment batch payload.' }

  const sanitized: CommentAiFilterInputItem[] = []
  for (const item of request.comments.slice(0, MAX_COMMENTS_PER_CALL)) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || typeof item.text !== 'string')
      continue
    const text = item.text.trim()
    if (!text) continue
    sanitized.push({
      id: item.id.trim(),
      author: typeof item.author === 'string' ? item.author : undefined,
      text,
      isReply: Boolean(item.isReply),
      isUp: item.isUp === true,
      isTop: item.isTop === true,
      upLiked: item.upLiked === true,
      likeCount: typeof item.likeCount === 'number' ? item.likeCount : undefined,
      hasPictures: item.hasPictures === true,
    })
  }

  if (!sanitized.length) return { ok: true, results: [], model: '' }

  const config = await readCommentAiFilterConfig()
  return callCommentAiFilterApi(sanitized, config, request.context?.title)
}

async function handleTestRequest(
  request?: CommentAiFilterTestRequest,
): Promise<CommentAiFilterTestResponse> {
  const startedAt = Date.now()
  const rawConfig = await readCommentAiFilterConfig(request?.config)
  const config: CommentAiFilterConfigSnapshot =
    rawConfig.dimensions.length === 0 && !rawConfig.customPrompt
      ? { ...rawConfig, dimensions: [...COMMENT_AI_FILTER_DEFAULT_DIMENSIONS] }
      : rawConfig

  const sampleComments: CommentAiFilterInputItem[] = [
    {
      id: 'sample-normal',
      text: '剪辑节奏很舒服，细节讲解得很清楚，学到了不少东西！',
    },
    {
      id: 'sample-spam',
      text: '加V免费领全套资源，点我主页简介限时福利先到先得！',
    },
  ]

  // 逐条验证与单条/批量统一协议保持一致。
  const responses = await Promise.all(
    sampleComments.map((sample) =>
      callCommentAiFilterApi([sample], config, 'AI 评论过滤连通性测试'),
    ),
  )
  const latencyMs = Date.now() - startedAt
  const failed = responses.find((res) => !res.ok)
  if (failed && !failed.ok) {
    return {
      ok: false,
      error: failed.error,
      latencyMs,
    }
  }

  const allResults = responses.flatMap((res) => (res.ok ? res.results : []))
  const model = responses.find((res) => res.ok && res.model)?.ok
    ? (responses.find((res) => res.ok && res.model) as { ok: true; model: string }).model
    : ''
  const flagged = allResults.filter((item) => item.lowQuality)
  return {
    ok: true,
    latencyMs,
    model,
    flaggedCount: flagged.length,
    sampleReason: flagged[0]?.reason || flagged[0]?.category,
  }
}

export function setupCommentAiFilter() {
  void ensureIndexTranslateHeaderRule()
  onMessage<CommentAiFilterClassifyRequest, CommentAiFilterClassifyResponse>(
    COMMENT_AI_FILTER_CLASSIFY_MESSAGE,
    (request) => handleClassifyRequest(request),
  )
  onMessage<CommentAiFilterTestRequest | undefined, CommentAiFilterTestResponse>(
    COMMENT_AI_FILTER_TEST_MESSAGE,
    (request) => handleTestRequest(request),
  )
}
