import { watch } from 'vue'

import { useStorageLocal } from '~/composables/useStorageLocal'

export interface AppAuthTokens {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: number | null
  refreshTokenExpiresAt: number | null
  mid: number | null
  lastUpdatedAt: number | null
}

export const defaultAppAuthTokens: AppAuthTokens = {
  accessToken: '',
  refreshToken: '',
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
  mid: null,
  lastUpdatedAt: null,
}

export const appAuthTokens = useStorageLocal<AppAuthTokens>('appAuthTokens', defaultAppAuthTokens, { mergeDefaults: true, writeDefaults: false })

const legacyAccessKey = useStorageLocal('accessKey', '')

watch(
  () => legacyAccessKey.value,
  (value) => {
    if (!value)
      return

    if (!appAuthTokens.value.accessToken) {
      appAuthTokens.value = {
        ...appAuthTokens.value,
        accessToken: value,
        lastUpdatedAt: Date.now(),
      }
    }

    // 清理遗留的 accessKey，避免重复存储
    legacyAccessKey.value = ''
  },
  { immediate: true },
)

export function resetAppAuthTokens() {
  appAuthTokens.value = { ...defaultAppAuthTokens }
  legacyAccessKey.value = ''
}
