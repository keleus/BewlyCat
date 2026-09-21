import { getActivePinia } from 'pinia'
import { watch } from 'vue'
import browser from 'webextension-polyfill'

import { TOP_BAR_STATE_MESSAGE } from '~/constants/topBarState'
import { appAuthTokens, settings, settingsReady } from '~/logic'
import { appAuthTokensReady } from '~/logic/appAuthStorage'
import { useTopBarStore } from '~/stores/topBarStore'
import { ensureFreshAppAccessToken } from '~/utils/authProvider'
import { getUserID } from '~/utils/main'
import { sendMessage } from '~/utils/messaging'
import type { FetchTrialQualityRequest, TrialQualityPageRequest, TrialQualityResult } from '~/utils/trialQualityProtocol'
import { isTrialQualityPageUrl, isTrialRecord, normalizeTrialQualityPageRequest, TRIAL_QUALITY_FETCH_STREAMS_MESSAGE, TRIAL_QUALITY_PAGE_REQUEST, TRIAL_QUALITY_PAGE_RESET, TRIAL_QUALITY_PAGE_RESPONSE } from '~/utils/trialQualityProtocol'

function failure(reason: string): TrialQualityResult {
  return { ok: false, entries: [], deadline: null, reason }
}

export function setupTrialVipQuality() {
  if (!isTrialQualityPageUrl(location.href))
    return
  const pending = new Map<number, Promise<TrialQualityResult>>()
  const requestTimes: number[] = []
  let generation = 0
  let accountId = getUserID()

  function reset() {
    generation++
    pending.clear()
    window.postMessage({ type: TRIAL_QUALITY_PAGE_RESET }, location.origin)
  }

  function syncAccount() {
    const next = getUserID()
    if (next !== accountId) {
      accountId = next
      reset()
    }
  }

  watch(() => [settings.value.trialVipQuality, appAuthTokens.value.accessToken, appAuthTokens.value.mid], reset, { flush: 'sync' })
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isTrialRecord(message) && message.type === TOP_BAR_STATE_MESSAGE.LOGIN_STATE_CHANGED)
      syncAccount()
    return false
  })
  window.addEventListener('pageshow', syncAccount)
  document.addEventListener('visibilitychange', syncAccount)

  async function fetchEntries(request: TrialQualityPageRequest): Promise<TrialQualityResult> {
    await Promise.all([settingsReady, appAuthTokensReady])
    syncAccount()
    if (!settings.value.trialVipQuality || !isTrialQualityPageUrl(location.href))
      return failure('disabled')
    if (!accountId)
      return failure('not-logged-in')
    if (!appAuthTokens.value.accessToken)
      return failure('no-app-token')
    if (!await ensureFreshAppAccessToken())
      return failure('app-token-expired')
    syncAccount()
    const { accessToken, mid } = appAuthTokens.value
    if (!accountId || !settings.value.trialVipQuality || !accessToken)
      return failure('state-changed')
    if (mid && String(mid) !== String(accountId))
      return failure('account-mismatch')
    const pinia = getActivePinia()
    if (pinia && useTopBarStore(pinia).userInfo?.vip?.status === 1)
      return failure('already-vip')
    const startedGeneration = generation
    const startedAccount = accountId
    const result = await sendMessage<FetchTrialQualityRequest, TrialQualityResult>(TRIAL_QUALITY_FETCH_STREAMS_MESSAGE, {
      accessKey: accessToken,
      cid: request.cid,
      aid: request.aid,
      bvid: request.bvid,
    })
    syncAccount()
    if (generation !== startedGeneration || startedAccount !== accountId
      || accessToken !== appAuthTokens.value.accessToken || !settings.value.trialVipQuality) {
      return failure('state-changed')
    }
    return result
  }

  function handle(request: TrialQualityPageRequest): Promise<TrialQualityResult> {
    syncAccount()
    const existing = pending.get(request.cid)
    if (existing)
      return existing
    const now = Date.now()
    while (requestTimes.length && requestTimes[0] < now - 60000)
      requestTimes.shift()
    // 滑动窗口只限制突发请求，不限制正常连续播放的试用次数。
    if (pending.size >= 4 || requestTimes.length >= 20)
      return Promise.resolve(failure('busy'))
    requestTimes.push(now)
    const task = fetchEntries(request).catch(() => failure('background-error')).finally(() => {
      if (pending.get(request.cid) === task)
        pending.delete(request.cid)
    })
    pending.set(request.cid, task)
    return task
  }

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window || event.origin !== location.origin || !isTrialQualityPageUrl(location.href))
      return
    if (!isTrialRecord(event.data) || event.data.type !== TRIAL_QUALITY_PAGE_REQUEST)
      return
    const request = normalizeTrialQualityPageRequest(event.data.data)
    if (!request)
      return
    void handle(request).then((result) => {
      // 白名单组装回复，永远不把 access key 或其它存储内容交给页面。
      window.postMessage({
        type: TRIAL_QUALITY_PAGE_RESPONSE,
        data: {
          requestId: request.requestId,
          cid: request.cid,
          ok: result?.ok === true,
          entries: result?.entries || [],
          deadline: result?.deadline ?? null,
          reason: result?.reason,
        },
      }, location.origin)
    })
  })
}
