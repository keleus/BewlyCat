import type Browser from 'webextension-polyfill'

import { TOP_BAR_STATE_MESSAGE } from '~/constants/topBarState'
import { onMessage } from '~/utils/messaging'

interface TopBarStateEntry {
  snapshot?: unknown
  updatedAt: number
  refreshStartedAt: number
}

const REFRESH_LEASE_TIMEOUT = 30_000
const stateByCookieStore = new Map<string, TopBarStateEntry>()

function getStateKey(sender?: Browser.Runtime.MessageSender) {
  return sender?.tab?.cookieStoreId || 'default'
}

function getEntry(sender?: Browser.Runtime.MessageSender) {
  const key = getStateKey(sender)
  let entry = stateByCookieStore.get(key)

  if (!entry) {
    entry = {
      updatedAt: 0,
      refreshStartedAt: 0,
    }
    stateByCookieStore.set(key, entry)
  }

  return entry
}

export function setupTopBarStateBroker() {
  onMessage<{ maxAge: number }>(
    TOP_BAR_STATE_MESSAGE.CLAIM_REFRESH,
    ({ maxAge }, sender) => {
      const entry = getEntry(sender)
      const now = Date.now()
      const snapshotFresh = entry.snapshot !== undefined && now - entry.updatedAt < maxAge
      const refreshInProgress = entry.refreshStartedAt > 0
        && now - entry.refreshStartedAt < REFRESH_LEASE_TIMEOUT

      if (!snapshotFresh && !refreshInProgress)
        entry.refreshStartedAt = now

      return {
        shouldRefresh: !snapshotFresh && !refreshInProgress,
        snapshot: entry.snapshot,
      }
    },
  )

  onMessage<{ snapshot: unknown }>(
    TOP_BAR_STATE_MESSAGE.PUBLISH,
    ({ snapshot }, sender) => {
      const entry = getEntry(sender)
      entry.snapshot = snapshot
      entry.updatedAt = Date.now()
      entry.refreshStartedAt = 0
    },
  )

  onMessage(
    TOP_BAR_STATE_MESSAGE.RELEASE_REFRESH,
    (_, sender) => {
      getEntry(sender).refreshStartedAt = 0
    },
  )
}
