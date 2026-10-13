import { watch } from 'vue'

import { useStorageLocal } from '~/composables/useStorageLocal'
import { HDAppKey } from '~/utils/appSign'

export interface AppAuthTokens {
  /** 签发 token 时使用的 APPKEY；旧版 TV 授权没有该字段 */
  appKey: string
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: number | null
  refreshTokenExpiresAt: number | null
  mid: number | null
  lastUpdatedAt: number | null
}

export const defaultAppAuthTokens: AppAuthTokens = {
  appKey: '',
  accessToken: '',
  refreshToken: '',
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
  mid: null,
  lastUpdatedAt: null,
}

export const appAuthTokens = useStorageLocal<AppAuthTokens>('appAuthTokens', defaultAppAuthTokens, { mergeDefaults: true, writeDefaults: false })

const legacyAccessKey = useStorageLocal('accessKey', '')

// 遗留的 accessKey 由 TV 端 APPKEY 签发，无法用于 HD 接口签名，直接清理。
watch(
  () => legacyAccessKey.value,
  (value) => {
    if (value)
      legacyAccessKey.value = ''
  },
  { immediate: true },
)

// access token 只能配合签发它的 APPKEY 签名使用；旧版 TV 授权的 token 会鉴权失败，清除后由首页提示重新授权。
// https://socialsisteryi.github.io/bilibili-API-collect/docs/login/login_action/QR.html#appkey-可用列表
watch(
  () => appAuthTokens.value,
  (tokens) => {
    if (tokens.accessToken && tokens.appKey !== HDAppKey.appkey)
      resetAppAuthTokens()
  },
  { immediate: true },
)

export function resetAppAuthTokens() {
  appAuthTokens.value = { ...defaultAppAuthTokens }
  legacyAccessKey.value = ''
}
