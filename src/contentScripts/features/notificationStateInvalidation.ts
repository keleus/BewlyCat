import type { TopBarStateInvalidate } from '~/constants/topBarState'
import { TOP_BAR_STATE_MESSAGE } from '~/constants/topBarState'
import { getUserID, isNotificationPage } from '~/utils/main'
import { sendMessage } from '~/utils/messaging'

const INVALIDATION_DELAY = 800
let invalidationTimer: ReturnType<typeof setTimeout> | undefined

export function scheduleNotificationStateInvalidation(delay = INVALIDATION_DELAY) {
  if (invalidationTimer)
    clearTimeout(invalidationTimer)

  invalidationTimer = setTimeout(() => {
    const accountId = Number(getUserID())
    if (!accountId)
      return

    sendMessage<TopBarStateInvalidate>(
      TOP_BAR_STATE_MESSAGE.INVALIDATE,
      { accountId },
    ).catch(() => {})
  }, delay)
}

export function setupNotificationStateInvalidation() {
  if (!isNotificationPage())
    return

  // 消息中心会在进入分类或点击消息后异步上报已读，稍后使共享缓存失效。
  window.addEventListener('hashchange', () => scheduleNotificationStateInvalidation())
  document.addEventListener('click', () => scheduleNotificationStateInvalidation(), true)
  scheduleNotificationStateInvalidation()
}
