import browser from 'webextension-polyfill'

import type { AppPassportEndpoint, AppPassportRequest } from '~/constants/appPassport'
import { APP_PASSPORT_REQUEST } from '~/constants/appPassport'
import { signAppParams } from '~/utils/appSign'
import { onMessage } from '~/utils/messaging'

// APP 扫码授权与 token 刷新统一由后台发出，按 PiliPlus 的登录请求构造：
// 不带网页 Cookie，使用 Dart 客户端的 User-Agent 与 APP 公共请求头，避免把浏览器信息透传给授权设备。
const PASSPORT_ENDPOINTS: Record<AppPassportEndpoint, { url: string, form: boolean }> = {
  // PiliPlus 以 query 参数 POST 扫码接口
  qrcodeAuthCode: { url: 'https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code', form: false },
  qrcodePoll: { url: 'https://passport.bilibili.com/x/passport-tv-login/qrcode/poll', form: false },
  refreshTokenV3: { url: 'https://passport.bilibili.com/api/v3/oauth2/refresh_token', form: true },
  refreshTokenV2: { url: 'https://passport.bilibili.com/api/v2/oauth2/refresh_token', form: true },
}

const APP_PASSPORT_USER_AGENT = 'Dart/3.6 (dart:io)'
const APP_PASSPORT_REFERER = 'https://www.bilibili.com'
const APP_PASSPORT_HEADERS = {
  'User-Agent': APP_PASSPORT_USER_AGENT,
  'env': 'prod',
  'app-key': 'android64',
  'x-bili-aurora-zone': 'sh001',
}
const APP_PASSPORT_REQUEST_TIMEOUT = 15_000

// Chromium 的 fetch 无法改写 User-Agent，也会附带 sec-ch-ua 客户端提示；
// 用仅匹配非标签页请求（即扩展后台自身）的会话规则改写，网页自己的请求不受影响。
const APP_PASSPORT_HEADER_RULE_ID = 1002
const appPassportHeaderRule: browser.DeclarativeNetRequest.Rule = {
  id: APP_PASSPORT_HEADER_RULE_ID,
  // 高于 assets/rules.json 中为 passport POST 设置 Origin 的静态规则
  priority: 3,
  action: {
    type: 'modifyHeaders',
    requestHeaders: [
      { header: 'user-agent', operation: 'set', value: APP_PASSPORT_USER_AGENT },
      { header: 'referer', operation: 'set', value: APP_PASSPORT_REFERER },
      { header: 'origin', operation: 'remove' },
      { header: 'sec-ch-ua', operation: 'remove' },
      { header: 'sec-ch-ua-mobile', operation: 'remove' },
      { header: 'sec-ch-ua-platform', operation: 'remove' },
    ],
  },
  condition: {
    regexFilter: '^https://passport\\.bilibili\\.com/(x/passport-tv-login/qrcode/|api/v[23]/oauth2/refresh_token)',
    resourceTypes: ['xmlhttprequest'],
    tabIds: [-1],
  },
}

async function syncAppPassportHeaderRule() {
  // eslint-disable-next-line node/prefer-global/process
  if (process.env.FIREFOX)
    return

  try {
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [APP_PASSPORT_HEADER_RULE_ID],
      addRules: [appPassportHeaderRule],
    })
  }
  catch (error) {
    console.error('[BewlyCat] Failed to update the APP passport header rule:', error)
  }
}

const appPassportHeaderRuleReady = syncAppPassportHeaderRule()

async function requestAppPassport({ endpoint, params }: AppPassportRequest) {
  const target = Object.hasOwn(PASSPORT_ENDPOINTS, endpoint) ? PASSPORT_ENDPOINTS[endpoint] : undefined
  if (!target)
    return { code: -400, message: `Unknown APP passport endpoint: ${endpoint}` }

  await appPassportHeaderRuleReady

  const signedParams = new URLSearchParams(signAppParams(params ?? {}))
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('APP passport request timed out', 'TimeoutError'))
  }, APP_PASSPORT_REQUEST_TIMEOUT)

  try {
    const response = await fetch(target.form ? target.url : `${target.url}?${signedParams}`, {
      method: 'POST',
      credentials: 'omit',
      signal: controller.signal,
      headers: target.form
        ? { ...APP_PASSPORT_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
        : APP_PASSPORT_HEADERS,
      body: target.form ? signedParams : undefined,
    })

    if (!response.ok)
      return { code: -response.status, message: `HTTP ${response.status}` }
    return await response.json()
  }
  catch (error) {
    return { code: -1, message: error instanceof Error ? error.message : String(error) }
  }
  finally {
    clearTimeout(timeout)
  }
}

export function setupAppPassport() {
  onMessage<AppPassportRequest>(APP_PASSPORT_REQUEST, requestAppPassport)
}
