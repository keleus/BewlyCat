import browser from 'webextension-polyfill'

import type { AppClientEndpoint, AppClientRequest } from '~/constants/appClient'
import { APP_CLIENT_REQUEST } from '~/constants/appClient'
import { signAppParams } from '~/utils/appSign'
import { onMessage } from '~/utils/messaging'

// APP 接口（扫码授权、token 刷新、推荐流、不感兴趣）统一由后台按 PiliPlus 的请求构造发出：
// 不带网页 Cookie，使用 PiliPlus 的 User-Agent 与 APP 请求头，避免把浏览器信息透传给 B 站。
// PiliPlus 的 AccountManager 会在单个请求的请求头之后再合并账号请求头，下面的取值均为合并后的最终结果。

type AppClientProfile = 'login' | 'feed' | 'account'

interface AppClientEndpointConfig {
  url: string
  method: 'GET' | 'POST'
  /** POST 时参数放在表单中；否则与 PiliPlus 一致放在 query 中 */
  form?: boolean
  profile: AppClientProfile
}

const APP_CLIENT_ENDPOINTS: Record<AppClientEndpoint, AppClientEndpointConfig> = {
  qrcodeAuthCode: { url: 'https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code', method: 'POST', profile: 'login' },
  qrcodePoll: { url: 'https://passport.bilibili.com/x/passport-tv-login/qrcode/poll', method: 'POST', profile: 'login' },
  refreshTokenV3: { url: 'https://passport.bilibili.com/api/v3/oauth2/refresh_token', method: 'POST', form: true, profile: 'login' },
  refreshTokenV2: { url: 'https://passport.bilibili.com/api/v2/oauth2/refresh_token', method: 'POST', form: true, profile: 'login' },
  feedIndex: { url: 'https://app.bilibili.com/x/v2/feed/index', method: 'GET', profile: 'feed' },
  feedDislike: { url: 'https://app.bilibili.com/x/feed/dislike', method: 'GET', profile: 'account' },
  feedDislikeCancel: { url: 'https://app.bilibili.com/x/feed/dislike/cancel', method: 'GET', profile: 'account' },
}

const APP_CLIENT_REFERER = 'https://www.bilibili.com'
// PiliPlus 的 Dio 默认 User-Agent
const DART_USER_AGENT = 'Dart/3.6 (dart:io)'
// PiliPlus 推荐流使用的 HD 客户端 User-Agent
const HD_USER_AGENT = 'Mozilla/5.0 BiliDroid/2.0.1 (bbcallen@gmail.com) os/android model/android_hd mobi_app/android_hd build/2001100 channel/master innerVer/2001100 osVer/15 network/2'
const APP_BASE_HEADERS = {
  'env': 'prod',
  'app-key': 'android64',
  'x-bili-aurora-zone': 'sh001',
}
const APP_CLIENT_REQUEST_TIMEOUT = 15_000

const PROFILE_USER_AGENTS: Record<AppClientProfile, string> = {
  login: DART_USER_AGENT,
  feed: HD_USER_AGENT,
  account: DART_USER_AGENT,
}

// https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/grpc_api/readme.md#x-bili-aurora-eid-生成算法
function genAuroraEid(mid: number): string {
  if (!mid)
    return ''

  const key = 'ad1va46a7lza'
  const bytes = Array.from(`${mid}`, (char, index) => char.charCodeAt(0) ^ key.charCodeAt(index % key.length))
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '')
}

// 与 PiliPlus 的 LoginUtils.generateBuvid 相同，生成后持久保存
const APP_BUVID_STORAGE_KEY = 'appClientBuvid'
let appBuvidPromise: Promise<string> | undefined

function generateBuvid(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  return `XY${hex[2]}${hex[12]}${hex[22]}${hex}`
}

function getAppBuvid(): Promise<string> {
  appBuvidPromise ??= browser.storage.local.get(APP_BUVID_STORAGE_KEY).then(async (result) => {
    const stored = result[APP_BUVID_STORAGE_KEY]
    if (typeof stored === 'string' && stored)
      return stored

    const buvid = generateBuvid()
    await browser.storage.local.set({ [APP_BUVID_STORAGE_KEY]: buvid })
    return buvid
  }).catch((error) => {
    appBuvidPromise = undefined
    throw error
  })
  return appBuvidPromise
}

async function getRequestHeaders(profile: AppClientProfile, mid?: number | null): Promise<Record<string, string>> {
  const accountHeaders: Record<string, string> = profile === 'login' || !mid
    ? APP_BASE_HEADERS
    : {
        ...APP_BASE_HEADERS,
        'x-bili-mid': `${mid}`,
        'x-bili-aurora-eid': genAuroraEid(mid),
      }

  if (profile !== 'feed')
    return { 'User-Agent': PROFILE_USER_AGENTS[profile], ...accountHeaders }

  return {
    'buvid': await getAppBuvid(),
    'fp_local': '1'.repeat(64),
    'fp_remote': '1'.repeat(64),
    'session_id': '11111111',
    'User-Agent': HD_USER_AGENT,
    'x-bili-trace-id': '11111111111111111111111111111111:1111111111111111:0:0',
    'bili-http-engine': 'cronet',
    ...accountHeaders,
  }
}

// Chromium 的 fetch 无法改写 User-Agent / Referer，也会附带 sec-ch-ua 客户端提示；
// 用仅匹配非标签页请求（即扩展后台自身）的会话规则改写，网页自己的请求不受影响。
const APP_CLIENT_HEADER_RULES: { id: number, regexFilter: string, userAgent: string }[] = [
  {
    id: 1002,
    regexFilter: '^https://passport\\.bilibili\\.com/(x/passport-tv-login/qrcode/|api/v[23]/oauth2/refresh_token)',
    userAgent: DART_USER_AGENT,
  },
  {
    id: 1003,
    regexFilter: '^https://app\\.bilibili\\.com/x/v2/feed/index\\?',
    userAgent: HD_USER_AGENT,
  },
  {
    id: 1004,
    regexFilter: '^https://app\\.bilibili\\.com/x/feed/dislike(/cancel)?\\?',
    userAgent: DART_USER_AGENT,
  },
]

const APP_CLIENT_URL_PATTERN = new RegExp(APP_CLIENT_HEADER_RULES.map(rule => `(?:${rule.regexFilter})`).join('|'))

export function isAppClientRequestUrl(url: string): boolean {
  return APP_CLIENT_URL_PATTERN.test(url)
}

async function syncAppClientHeaderRules() {
  // eslint-disable-next-line node/prefer-global/process
  if (process.env.FIREFOX)
    return

  try {
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: APP_CLIENT_HEADER_RULES.map(rule => rule.id),
      addRules: APP_CLIENT_HEADER_RULES.map(rule => ({
        id: rule.id,
        // 高于 assets/rules.json 中为 passport POST 设置 Origin 的静态规则
        priority: 3,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'user-agent', operation: 'set', value: rule.userAgent },
            { header: 'referer', operation: 'set', value: APP_CLIENT_REFERER },
            { header: 'origin', operation: 'remove' },
            { header: 'sec-ch-ua', operation: 'remove' },
            { header: 'sec-ch-ua-mobile', operation: 'remove' },
            { header: 'sec-ch-ua-platform', operation: 'remove' },
          ],
        },
        condition: {
          regexFilter: rule.regexFilter,
          resourceTypes: ['xmlhttprequest'],
          tabIds: [-1],
        },
      })),
    })
  }
  catch (error) {
    console.error('[BewlyCat] Failed to update the APP client header rules:', error)
  }
}

const appClientHeaderRulesReady = syncAppClientHeaderRules()

async function requestAppClient({ endpoint, params, mid }: AppClientRequest) {
  const target = Object.hasOwn(APP_CLIENT_ENDPOINTS, endpoint) ? APP_CLIENT_ENDPOINTS[endpoint] : undefined
  if (!target)
    return { code: -400, message: `Unknown APP client endpoint: ${endpoint}` }

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('APP client request timed out', 'TimeoutError'))
  }, APP_CLIENT_REQUEST_TIMEOUT)

  try {
    await appClientHeaderRulesReady
    const headers = await getRequestHeaders(target.profile, mid)
    // 每次请求在后台重新签名，保证 ts 有效
    const signedParams = new URLSearchParams(signAppParams(params ?? {}))
    const response = await fetch(target.form ? target.url : `${target.url}?${signedParams}`, {
      method: target.method,
      credentials: 'omit',
      signal: controller.signal,
      headers: target.form
        ? { ...headers, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
        : headers,
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

export function setupAppClient() {
  onMessage<AppClientRequest>(APP_CLIENT_REQUEST, requestAppClient)
}
