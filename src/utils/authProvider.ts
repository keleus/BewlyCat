import type { AppAuthTokens } from '~/logic/appAuthStorage'
import { appAuthTokens, defaultAppAuthTokens, resetAppAuthTokens } from '~/logic/appAuthStorage'

import { appSign } from './appSign'

export function revokeAccessKey() {
  resetAppAuthTokens()
}

// https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/APPKey.html#appkey
export const TVAppKey = {
  appkey: '4409e2ce8ffd12b8',
  appsec: '59b43e04ad6965f34319062b478f83dd',
}

// https://github.com/magicdawn/bilibili-app-recommend/blob/e91722cc076fe65b98116fb0248236851ae6e1dc/src/utility/access-key/tv-qrcode/api.ts#L8
export function tvSignSearchParams(params: Record<string, any>) {
  const sign = appSign(params, TVAppKey.appkey, TVAppKey.appsec)
  return new URLSearchParams({
    ...params,
    sign,
  })
}

export function getTvSign(params: Record<string, any>) {
  return appSign(params, TVAppKey.appkey, TVAppKey.appsec)
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

const APP_TOKEN_REFRESH_ENDPOINTS = [
  'https://passport.bilibili.com/api/v3/oauth2/refresh_token',
  'https://passport.bilibili.com/api/v2/oauth2/refresh_token',
]
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
      const payload = { ...basePayload }
      const sign = appSign({ ...payload }, TVAppKey.appkey, TVAppKey.appsec)
      const body = new URLSearchParams({
        ...payload,
        appkey: TVAppKey.appkey,
        sign,
      })

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body,
      })

      if (!response.ok)
        continue

      const data = await response.json() as RefreshTokenResponse
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

const TV_LOGIN_REQUEST_TIMEOUT = 15_000

async function requestTVLoginQRCode(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<any> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted)
    abort()
  else
    signal?.addEventListener('abort', abort, { once: true })

  const timeout = setTimeout(() => {
    controller.abort(new DOMException('QR code request timed out', 'TimeoutError'))
  }, TV_LOGIN_REQUEST_TIMEOUT)

  try {
    const response = await fetch(`https://passport.bilibili.com/x/passport-tv-login/qrcode/${path}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: tvSignSearchParams({
        appkey: TVAppKey.appkey,
        local_id: '0',
        ts: '0',
        ...params,
      }),
    })
    return await response.json()
  }
  finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export function pollTVLoginQRCode(authCode: string, signal?: AbortSignal): Promise<any> {
  return requestTVLoginQRCode('poll', { auth_code: authCode }, signal)
}

export function getTVLoginQRCode(signal?: AbortSignal): Promise<any> {
  return requestTVLoginQRCode('auth_code', {}, signal)
}
