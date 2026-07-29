import md5 from 'md5'

import { PAGE_PRIVATE_MESSAGE_RESPONSE } from '~/constants/api'

const PRIVATE_MESSAGE_API_BASE = 'https://api.vc.bilibili.com/session_svr/v1/session_svr'
const PRIVATE_MESSAGE_WBI_MIXIN_KEY_ENC_TAB = [
  46,
  47,
  18,
  2,
  53,
  8,
  23,
  32,
  15,
  50,
  10,
  31,
  58,
  3,
  45,
  35,
  27,
  43,
  5,
  49,
  33,
  9,
  42,
  19,
  29,
  28,
  14,
  39,
  12,
  38,
  41,
  13,
  37,
  48,
  7,
  16,
  24,
  55,
  40,
  61,
  26,
  17,
  0,
  1,
  60,
  51,
  30,
  4,
  22,
  25,
  54,
  21,
  56,
  59,
  6,
  63,
  57,
  62,
  11,
  36,
  20,
  34,
  44,
  52,
]

interface PrivateMessageWbiKeys {
  imgKey: string
  subKey: string
  timestamp: number
}

export function createPrivateMessageRequestHandler(originalFetch: typeof window.fetch) {
  let privateMessageWbiKeys: PrivateMessageWbiKeys | null = null

  function getPrivateMessageWbiMixinKey(imgKey: string, subKey: string) {
    const rawKey = imgKey + subKey
    return PRIVATE_MESSAGE_WBI_MIXIN_KEY_ENC_TAB
      .slice(0, 32)
      .map(index => rawKey[index])
      .join('')
  }

  function extractPrivateMessageWbiKey(url: string) {
    return url.match(/\/([^/]+)\.png$/)?.[1] ?? ''
  }

  function encodePrivateMessageWbiValue(value: unknown) {
    return encodeURIComponent(String(value).replace(/[!'()*]/g, ''))
  }

  async function parsePrivateMessageJsonResponse(response: Response) {
    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()

    if (contentType.includes('text/html') || /^\s*<(?:!doctype|html)/i.test(text))
      throw new Error('检测到风控页面，API 返回了 HTML 而不是 JSON')

    try {
      return text ? JSON.parse(text) : null
    }
    catch {
      throw new Error(`消息 API 返回格式异常（HTTP ${response.status}）`)
    }
  }

  async function getPrivateMessageWbiKeys(forceRefresh = false) {
    const maxAge = 24 * 60 * 60 * 1000
    if (
      !forceRefresh
      && privateMessageWbiKeys
      && Date.now() - privateMessageWbiKeys.timestamp <= maxAge
    ) {
      return privateMessageWbiKeys
    }

    const response = await originalFetch.call(
      window,
      'https://api.bilibili.com/x/web-interface/nav',
      {
        method: 'GET',
        credentials: 'include',
      },
    )
    const data = await parsePrivateMessageJsonResponse(response)
    const imgKey = extractPrivateMessageWbiKey(data?.data?.wbi_img?.img_url ?? '')
    const subKey = extractPrivateMessageWbiKey(data?.data?.wbi_img?.sub_url ?? '')

    if (!imgKey || !subKey)
      throw new Error(data?.message || '无法获取 WBI 签名密钥')

    privateMessageWbiKeys = {
      imgKey,
      subKey,
      timestamp: Date.now(),
    }
    return privateMessageWbiKeys
  }

  async function signPrivateMessageParams(
    params: Record<string, string | number>,
    forceRefresh = false,
  ) {
    const { imgKey, subKey } = await getPrivateMessageWbiKeys(forceRefresh)
    const signedParams: Record<string, string | number> = {
      ...params,
      wts: Math.floor(Date.now() / 1000),
    }
    const query = Object.keys(signedParams)
      .sort()
      .filter(key => signedParams[key] !== '')
      .map(key => `${encodePrivateMessageWbiValue(key)}=${encodePrivateMessageWbiValue(signedParams[key])}`)
      .join('&')

    signedParams.w_rid = md5(query + getPrivateMessageWbiMixinKey(imgKey, subKey))
    return signedParams
  }

  async function fetchPrivateMessageSessions(endTs: string, forceRefresh = false) {
    const signedParams = await signPrivateMessageParams({
      session_type: 1,
      group_fold: 0,
      unfollow_fold: 0,
      sort_rule: 2,
      size: 20,
      end_ts: endTs,
      build: 0,
      mobi_app: 'web',
    }, forceRefresh)
    const urlParams = new URLSearchParams()

    Object.entries(signedParams).forEach(([key, value]) => {
      if (value !== '')
        urlParams.append(key, String(value))
    })

    const response = await originalFetch.call(
      window,
      `${PRIVATE_MESSAGE_API_BASE}/get_sessions?${urlParams.toString()}`,
      {
        method: 'GET',
        credentials: 'include',
      },
    )
    const data = await parsePrivateMessageJsonResponse(response)

    if (data?.code === -403 && !forceRefresh)
      return fetchPrivateMessageSessions(endTs, true)

    return data
  }

  async function markPrivateMessageSessionRead(data: any) {
    const talkerId = Number(data?.talkerId)
    const sessionType = Number(data?.sessionType)
    const ackSeqno = Number(data?.ackSeqno)
    const csrf = typeof data?.csrf === 'string' ? data.csrf : ''

    if (
      !Number.isFinite(talkerId)
      || !Number.isFinite(ackSeqno)
      || (sessionType !== 1 && sessionType !== 2)
      || !csrf
    ) {
      throw new Error('无效的私信已读请求')
    }

    const response = await originalFetch.call(
      window,
      `${PRIVATE_MESSAGE_API_BASE}/update_ack`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          talker_id: String(talkerId),
          session_type: String(sessionType),
          ack_seqno: String(ackSeqno),
          csrf,
          csrf_token: csrf,
          build: '0',
          mobi_app: 'web',
        }),
      },
    )

    return parsePrivateMessageJsonResponse(response)
  }

  return async function handlePagePrivateMessageRequest(data: any) {
    const id = data?.id
    if (typeof id !== 'string')
      return

    try {
      if (location.hostname !== 'message.bilibili.com')
        throw new Error('Private-message requests are only available on the message page')

      let response: unknown
      if (data.operation === 'getSessions') {
        response = await fetchPrivateMessageSessions(
          typeof data.endTs === 'string' ? data.endTs : '',
        )
      }
      else if (data.operation === 'markSessionRead') {
        response = await markPrivateMessageSessionRead(data)
      }
      else {
        throw new Error('Unsupported private-message request')
      }

      window.postMessage({
        type: PAGE_PRIVATE_MESSAGE_RESPONSE,
        data: { id, response },
      }, '*')
    }
    catch (error) {
      window.postMessage({
        type: PAGE_PRIVATE_MESSAGE_RESPONSE,
        data: {
          id,
          error: error instanceof Error ? error.message : String(error),
        },
      }, '*')
    }
  }
}
