// import browser from 'webextension-polyfill'
import { appAuthTokens, defaultAppAuthTokens, resetAppAuthTokens } from '~/logic/storage'

import { appSign } from './appSign'

export function revokeAccessKey() {
  resetAppAuthTokens()
}

// PiliPlus 使用的 Android HD 客户端密钥，推荐流反馈接口接受该身份。
export const HDAppKey = {
  appkey: 'dfca71928277209b',
  appsec: 'b5475a8825547a4fc26c7d518eaaa02e',
}

function hdSignSearchParams(params: Record<string, any>) {
  const sign = appSign(params, HDAppKey.appkey, HDAppKey.appsec)
  return new URLSearchParams({
    ...params,
    sign,
  })
}

const HD_LOGIN_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  'app-key': 'android_hd',
  'env': 'prod',
  'x-bili-trace-id': '11111111111111111111111111111111:1111111111111111:0:0',
  'bili-http-engine': 'cronet',
}

export function getHDSign(params: Record<string, any>) {
  return appSign(params, HDAppKey.appkey, HDAppKey.appsec)
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
    clientType: 'hd',
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

export async function refreshAppAccessToken(): Promise<boolean> {
  const { accessToken, refreshToken } = appAuthTokens.value
  if (!accessToken || !refreshToken)
    return false

  const ts = Math.floor(Date.now() / 1000)
  const basePayload = {
    access_token: accessToken,
    refresh_token: refreshToken,
    ts: ts.toString(),
  }

  for (const endpoint of APP_TOKEN_REFRESH_ENDPOINTS) {
    try {
      const payload = { ...basePayload }
      const sign = appSign({ ...payload }, HDAppKey.appkey, HDAppKey.appsec)
      const body = new URLSearchParams({
        ...payload,
        appkey: HDAppKey.appkey,
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
      if (data.code !== 0 || !data.data)
        continue

      const tokenInfo = data.data.token_info || {}
      const refreshInfo = data.data.refresh_token_info || {}

      const nextAccessToken = tokenInfo.access_token || appAuthTokens.value.accessToken
      const nextRefreshToken = tokenInfo.refresh_token || appAuthTokens.value.refreshToken
      const expiresIn = tokenInfo.expires_in ?? null
      const refreshExpiresIn = refreshInfo.expires_in ?? null

      appAuthTokens.value = {
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        clientType: 'hd',
        accessTokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
        refreshTokenExpiresAt: refreshExpiresIn ? Date.now() + refreshExpiresIn * 1000 : appAuthTokens.value.refreshTokenExpiresAt,
        mid: tokenInfo.mid ?? appAuthTokens.value.mid,
        lastUpdatedAt: Date.now(),
      }
      return true
    }
    catch (error) {
      console.error('刷新 APP access_token 失败:', error)
    }
  }

  return false
}

export function hasValidAppAuthTokens(bufferMs = 5 * 60 * 1000) {
  const { accessToken, refreshToken, refreshTokenExpiresAt, clientType } = appAuthTokens.value
  if (!accessToken || !refreshToken || clientType !== 'hd')
    return false

  if (refreshTokenExpiresAt && refreshTokenExpiresAt < Date.now() + bufferMs)
    return false

  return true
}

export function clearAppAuthTokens() {
  appAuthTokens.value = { ...defaultAppAuthTokens }
}

export function pollHDLoginQRCode(authCode: string): Promise<any> {
  const url = 'https://passport.bilibili.com/x/passport-tv-login/qrcode/poll'

  return new Promise<void>((resolve, reject) => {
    fetch(url, {
      method: 'POST',
      headers: HD_LOGIN_HEADERS,
      body: hdSignSearchParams({
        appkey: HDAppKey.appkey,
        auth_code: authCode,
        local_id: '0',
        ts: Math.floor(Date.now() / 1000).toString(),
      }),
    })
      .then(response => response.json())
      .then(data => resolve(data))
      .catch(error => reject(error))
  })
}

export function getHDLoginQRCode(): Promise<any> {
  const url = 'https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code'

  return new Promise<void>((resolve, reject) => {
    fetch(url, {
      method: 'POST',
      headers: HD_LOGIN_HEADERS,
      body: hdSignSearchParams({
        appkey: HDAppKey.appkey,
        local_id: '0',
        platform: 'android',
        mobi_app: 'android_hd',
        ts: Math.floor(Date.now() / 1000).toString(),
      }),
    })
      .then(response => response.json())
      .then(data => resolve(data))
      .catch(error => reject(error))
  })
}
