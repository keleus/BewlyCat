import type { AppClientEndpoint, AppClientRequest } from '~/constants/appClient'
import { APP_CLIENT_REQUEST } from '~/constants/appClient'
import type { AppAuthTokens } from '~/logic/appAuthStorage'
import { appAuthTokens, defaultAppAuthTokens, resetAppAuthTokens } from '~/logic/appAuthStorage'

import { waitWithSignal } from './abort'
import { HDAppKey } from './appSign'
import { sendMessage } from './messaging'

export function revokeAccessKey() {
  resetAppAuthTokens()
}

/** APP 接口交由后台按 PiliPlus 的请求方式签名并发出，参数无需在页面侧签名 */
export function requestAppClient(endpoint: AppClientEndpoint, params: AppClientRequest['params']): Promise<any> {
  const request: AppClientRequest = { endpoint, params, mid: appAuthTokens.value.mid }
  return sendMessage(APP_CLIENT_REQUEST, request)
}

interface PollLoginTokenPayload {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  mid?: number
  token_info?: {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    mid?: number
  }
  refresh_token_info?: {
    expires_in?: number
  }
}

const APP_TOKEN_REFRESH_ENDPOINTS: AppClientEndpoint[] = ['refreshTokenV3', 'refreshTokenV2']
const APP_TOKEN_REFRESH_BUFFER = 10 * 60 * 1000
let appTokenRefresh: { tokens: AppAuthTokens, promise: Promise<AppAuthTokens | null> } | null = null

export function saveAppAuthTokens(payload: PollLoginTokenPayload) {
  const tokenInfo = payload.token_info || {}
  const refreshInfo = payload.refresh_token_info || {}

  const accessToken = payload.access_token || tokenInfo.access_token || ''
  const refreshToken = payload.refresh_token || tokenInfo.refresh_token || ''
  const expiresIn = tokenInfo.expires_in ?? payload.expires_in ?? null
  const refreshExpiresIn = refreshInfo.expires_in ?? null
  const mid = payload.mid ?? tokenInfo.mid ?? null

  appAuthTokens.value = {
    appKey: HDAppKey.appkey,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
    refreshTokenExpiresAt: refreshExpiresIn ? Date.now() + refreshExpiresIn * 1000 : null,
    mid: mid ?? null,
    lastUpdatedAt: Date.now(),
  }
}

interface RefreshTokenResponse {
  code: number
  message?: string
  data?: {
    token_info?: {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      mid?: number
    }
    refresh_token_info?: {
      expires_in?: number
    }
  }
}

async function refreshAppTokens(tokens: AppAuthTokens): Promise<AppAuthTokens | null> {
  const { accessToken, refreshToken } = tokens
  if (!accessToken || !refreshToken)
    return null

  const ts = Math.floor(Date.now() / 1000)
  const basePayload = {
    access_token: accessToken,
    refresh_token: refreshToken,
    ts: ts.toString(),
  }

  for (const endpoint of APP_TOKEN_REFRESH_ENDPOINTS) {
    if (appAuthTokens.value !== tokens)
      return null

    try {
      const data = await requestAppClient(endpoint, basePayload) as RefreshTokenResponse
      // 撤销、重新授权和其他标签页的更新都会替换快照；旧请求不得恢复旧授权。
      if (appAuthTokens.value !== tokens)
        return null
      if (data.code !== 0 || !data.data)
        continue

      const tokenInfo = data.data.token_info || {}
      const refreshInfo = data.data.refresh_token_info || {}

      const nextAccessToken = tokenInfo.access_token || tokens.accessToken
      const nextRefreshToken = tokenInfo.refresh_token || tokens.refreshToken
      const expiresIn = tokenInfo.expires_in ?? null
      const refreshExpiresIn = refreshInfo.expires_in ?? null

      appAuthTokens.value = {
        appKey: tokens.appKey,
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        accessTokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
        refreshTokenExpiresAt: refreshExpiresIn ? Date.now() + refreshExpiresIn * 1000 : tokens.refreshTokenExpiresAt,
        mid: tokenInfo.mid ?? tokens.mid,
        lastUpdatedAt: Date.now(),
      }
      return appAuthTokens.value
    }
    catch (error) {
      console.error('刷新 APP access_token 失败:', error)
    }
  }

  return null
}

export async function refreshAppAccessToken(): Promise<boolean> {
  return await refreshAppTokens(appAuthTokens.value) !== null
}

export async function ensureFreshAppAccessToken(bufferMs = APP_TOKEN_REFRESH_BUFFER): Promise<boolean> {
  const tokens = appAuthTokens.value
  if (!tokens.accessToken)
    return false

  const now = Date.now()
  if (!tokens.refreshToken) {
    return !tokens.accessTokenExpiresAt || tokens.accessTokenExpiresAt > now
  }

  if (tokens.refreshTokenExpiresAt && tokens.refreshTokenExpiresAt <= now) {
    resetAppAuthTokens()
    return false
  }

  // Legacy tokens may not have expiry metadata. Preserve their previous
  // behavior and let the actual APP request determine whether they still work.
  if (!tokens.accessTokenExpiresAt || tokens.accessTokenExpiresAt > now + bufferMs)
    return true

  if (!appTokenRefresh || appTokenRefresh.tokens !== tokens) {
    const refresh = {
      tokens,
      promise: refreshAppTokens(tokens)
        .finally(() => {
          if (appTokenRefresh === refresh)
            appTokenRefresh = null
        }),
    }
    appTokenRefresh = refresh
  }

  const refreshed = await appTokenRefresh.promise
  if (refreshed)
    return appAuthTokens.value === refreshed

  // A transient refresh failure should not block a token that has not actually
  // expired yet; the user request can still proceed with the remaining lifetime.
  return appAuthTokens.value === tokens
    && (tokens.accessTokenExpiresAt == null || tokens.accessTokenExpiresAt > Date.now())
}

export function hasValidAppAuthTokens(bufferMs = 5 * 60 * 1000) {
  const { accessToken, refreshToken, refreshTokenExpiresAt } = appAuthTokens.value
  if (!accessToken || !refreshToken)
    return false

  if (refreshTokenExpiresAt && refreshTokenExpiresAt < Date.now() + bufferMs)
    return false

  return true
}

export function clearAppAuthTokens() {
  appAuthTokens.value = { ...defaultAppAuthTokens }
}

// HD 版沿用 TV 扫码登录接口，只是改用 HD APPKEY 签名并标明 mobi_app，参数与 PiliPlus 一致。
export function pollAppLoginQRCode(authCode: string, signal?: AbortSignal): Promise<any> {
  return waitWithSignal(requestAppClient('qrcodePoll', { auth_code: authCode, local_id: '0' }), signal)
}

export function getAppLoginQRCode(signal?: AbortSignal): Promise<any> {
  return waitWithSignal(requestAppClient('qrcodeAuthCode', {
    local_id: '0',
    platform: 'android',
    mobi_app: HDAppKey.mobiApp,
  }), signal)
}
