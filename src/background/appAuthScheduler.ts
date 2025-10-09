import { appAuthTokens, resetAppAuthTokens } from '~/logic'
import { refreshAppAccessToken } from '~/utils/authProvider'

const CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes
const REFRESH_BUFFER = 10 * 60 * 1000 // 10 minutes
const MIN_INTERVAL = 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null
let refreshing = false

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

async function ensureFreshTokens() {
  const tokens = appAuthTokens.value

  if (!tokens.accessToken || !tokens.refreshToken)
    return

  if (tokens.refreshTokenExpiresAt && tokens.refreshTokenExpiresAt <= Date.now()) {
    console.warn('[BewlyCat] APP refresh token 已过期，清除授权。')
    resetAppAuthTokens()
    return
  }

  if (!tokens.accessTokenExpiresAt)
    return

  const shouldRefresh = tokens.accessTokenExpiresAt <= Date.now() + REFRESH_BUFFER
  if (!shouldRefresh)
    return

  if (refreshing)
    return

  refreshing = true
  try {
    const ok = await refreshAppAccessToken()
    if (!ok)
      console.warn('[BewlyCat] APP access token 刷新失败，请重新授权。')
  }
  finally {
    refreshing = false
  }
}

export function setupAppAuthScheduler() {
  clearTimer()

  timer = setInterval(() => {
    void ensureFreshTokens()
  }, Math.max(CHECK_INTERVAL, MIN_INTERVAL))

  void ensureFreshTokens()
}

export function teardownAppAuthScheduler() {
  clearTimer()
}
