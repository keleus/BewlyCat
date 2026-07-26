import type { TopBarStateInvalidate } from '~/constants/topBarState'
import { TOP_BAR_STATE_MESSAGE } from '~/constants/topBarState'
import { getUserID, isNotificationPage } from '~/utils/main'
import { sendMessage } from '~/utils/messaging'

const INVALIDATION_DELAY = 800

export function setupNotificationStateInvalidation() {
  if (!isNotificationPage())
    return

  let timer: ReturnType<typeof setTimeout> | undefined

  function scheduleInvalidation() {
    if (timer)
      clearTimeout(timer)

    timer = setTimeout(() => {
      const accountId = Number(getUserID())
      if (!accountId)
        return

      sendMessage<TopBarStateInvalidate>(
        TOP_BAR_STATE_MESSAGE.INVALIDATE,
        { accountId },
      ).catch(() => {})
    }, INVALIDATION_DELAY)
  }

  // 消息中心会在进入分类或点击消息后异步上报已读，稍后使共享缓存失效。
  window.addEventListener('hashchange', scheduleInvalidation)
  document.addEventListener('click', scheduleInvalidation, true)
  scheduleInvalidation()
}
