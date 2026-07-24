import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { CONTENT_SCRIPT_MATCHES } from '~/constants/contentScript'
import type {
  TopBarRefreshClaim,
  TopBarSharedState,
  TopBarStateClaim,
  TopBarStatePublish,
  TopBarStateRelease,
} from '~/constants/topBarState'
import {
  TOP_BAR_STATE_MESSAGE,
} from '~/constants/topBarState'
import { onMessage } from '~/utils/messaging'

interface TopBarStateEntry {
  snapshot?: TopBarSharedState
  updatedAt: number
  refreshStartedAt: number
  refreshId: number
}

export interface TopBarStateBrokerBrowser {
  storage?: {
    session?: Pick<Browser.Storage.StorageAreaWithUsage, 'get' | 'set'>
  }
  tabs: Pick<Browser.Tabs.Static, 'query' | 'sendMessage'>
}

export interface TopBarStateBroker {
  claimRefresh: (
    data: TopBarStateClaim,
    sender?: Browser.Runtime.MessageSender,
  ) => Promise<TopBarRefreshClaim>
  publish: (
    data: TopBarStatePublish,
    sender?: Browser.Runtime.MessageSender,
  ) => Promise<void>
  releaseRefresh: (
    data: TopBarStateRelease,
    sender?: Browser.Runtime.MessageSender,
  ) => Promise<void>
}

const REFRESH_LEASE_TIMEOUT = 30_000
const TOP_BAR_STATE_STORAGE_KEY = 'topBarStateBroker:v2'
const TOP_BAR_STATE_STORAGE_VERSION = 2

interface PersistedTopBarState {
  version: typeof TOP_BAR_STATE_STORAGE_VERSION
  entries: Record<string, TopBarStateEntry>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTopBarSharedState(value: unknown): value is TopBarSharedState {
  return isRecord(value)
    && isRecord(value.unReadMessage)
    && isRecord(value.unReadDm)
    && typeof value.newMomentsCount === 'number'
    && typeof value.watchLaterCount === 'number'
    && typeof value.hasBCoinToReceive === 'boolean'
    && typeof value.bCoinAlreadyReceived === 'boolean'
    && typeof value.vipExpAlreadyReceived === 'boolean'
}

function isTopBarStateEntry(value: unknown): value is TopBarStateEntry {
  return isRecord(value)
    && typeof value.updatedAt === 'number'
    && typeof value.refreshStartedAt === 'number'
    && typeof value.refreshId === 'number'
    && (value.snapshot === undefined || isTopBarSharedState(value.snapshot))
}

function isPersistedTopBarState(value: unknown): value is PersistedTopBarState {
  return isRecord(value)
    && value.version === TOP_BAR_STATE_STORAGE_VERSION
    && isRecord(value.entries)
    && Object.values(value.entries).every(isTopBarStateEntry)
}

function getStateKey(tab: Browser.Tabs.Tab | undefined, accountId: number) {
  const cookieStoreId = tab?.cookieStoreId || 'default'
  const privacyContext = tab?.incognito ? 'private' : 'normal'
  return `${privacyContext}:${cookieStoreId}:${accountId}`
}

function getBrowserContextKey(tab?: Browser.Tabs.Tab) {
  const cookieStoreId = tab?.cookieStoreId || 'default'
  const privacyContext = tab?.incognito ? 'private' : 'normal'
  return `${privacyContext}:${cookieStoreId}`
}

export function createTopBarStateBroker(
  extensionApi: TopBarStateBrokerBrowser = browser,
): TopBarStateBroker {
  const stateByCookieStore = new Map<string, TopBarStateEntry>()
  const sessionStorage = extensionApi.storage?.session
  let stateLoadPromise: Promise<void> | undefined
  let operationQueue: Promise<void> = Promise.resolve()

  function runExclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = operationQueue.then(operation, operation)
    operationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async function loadPersistedState(): Promise<void> {
    if (!sessionStorage)
      return

    try {
      const stored = await sessionStorage.get(TOP_BAR_STATE_STORAGE_KEY)
      const persistedState = stored[TOP_BAR_STATE_STORAGE_KEY]

      if (!isPersistedTopBarState(persistedState))
        return

      Object.entries(persistedState.entries).forEach(([key, entry]) => {
        stateByCookieStore.set(key, entry)
      })
    }
    catch {
      // 不支持会话存储时继续使用当前后台进程内的状态
    }
  }

  async function ensureStateLoaded(): Promise<void> {
    stateLoadPromise ??= loadPersistedState()
    await stateLoadPromise
  }

  async function persistState(): Promise<void> {
    if (!sessionStorage)
      return

    const persistedState: PersistedTopBarState = {
      version: TOP_BAR_STATE_STORAGE_VERSION,
      entries: Object.fromEntries(stateByCookieStore),
    }

    try {
      await sessionStorage.set({
        [TOP_BAR_STATE_STORAGE_KEY]: persistedState,
      })
    }
    catch {
      // 写入失败不影响当前后台进程继续协调刷新
    }
  }

  function getEntry(accountId: number, sender?: Browser.Runtime.MessageSender) {
    const key = getStateKey(sender?.tab, accountId)
    let entry = stateByCookieStore.get(key)

    if (!entry) {
      entry = {
        updatedAt: 0,
        refreshStartedAt: 0,
        refreshId: 0,
      }
      stateByCookieStore.set(key, entry)
    }

    return entry
  }

  async function broadcastSnapshot(
    data: TopBarStatePublish,
    sender?: Browser.Runtime.MessageSender,
  ): Promise<void> {
    const browserContextKey = getBrowserContextKey(sender?.tab)
    let tabs: Browser.Tabs.Tab[]

    try {
      tabs = await extensionApi.tabs.query({
        url: [...CONTENT_SCRIPT_MATCHES],
      })
    }
    catch {
      return
    }

    await Promise.allSettled(
      tabs
        .filter(tab => tab.id !== undefined && getBrowserContextKey(tab) === browserContextKey)
        .map(tab => extensionApi.tabs.sendMessage(tab.id!, {
          type: TOP_BAR_STATE_MESSAGE.UPDATED,
          data,
        })),
    )
  }

  return {
    claimRefresh({ accountId, maxAge }, sender) {
      return runExclusive(async () => {
        await ensureStateLoaded()

        const entry = getEntry(accountId, sender)
        const now = Date.now()
        const snapshotFresh = entry.snapshot !== undefined && now - entry.updatedAt < maxAge
        const refreshInProgress = entry.refreshStartedAt > 0
          && now - entry.refreshStartedAt < REFRESH_LEASE_TIMEOUT
        const shouldRefresh = !snapshotFresh && !refreshInProgress

        if (shouldRefresh) {
          entry.refreshStartedAt = now
          entry.refreshId += 1
          await persistState()
        }

        return {
          shouldRefresh,
          snapshot: entry.snapshot,
          ...(shouldRefresh ? { refreshId: entry.refreshId } : {}),
        }
      })
    },

    async publish(data, sender) {
      const { accountId, snapshot, refreshId } = data
      const published = await runExclusive(async () => {
        await ensureStateLoaded()

        const entry = getEntry(accountId, sender)
        if (entry.refreshId !== refreshId)
          return false

        entry.snapshot = snapshot
        entry.updatedAt = Date.now()
        entry.refreshStartedAt = 0
        await persistState()
        return true
      })

      if (published)
        await broadcastSnapshot(data, sender)
    },

    releaseRefresh({ accountId, refreshId }, sender) {
      return runExclusive(async () => {
        await ensureStateLoaded()
        const entry = getEntry(accountId, sender)
        if (entry.refreshId !== refreshId)
          return

        entry.refreshStartedAt = 0
        await persistState()
      })
    },
  }
}

export function setupTopBarStateBroker() {
  const broker = createTopBarStateBroker()

  onMessage<TopBarStateClaim>(
    TOP_BAR_STATE_MESSAGE.CLAIM_REFRESH,
    (data, sender) => broker.claimRefresh(data, sender),
  )

  onMessage<TopBarStatePublish>(
    TOP_BAR_STATE_MESSAGE.PUBLISH,
    (data, sender) => broker.publish(data, sender),
  )

  onMessage<TopBarStateRelease>(
    TOP_BAR_STATE_MESSAGE.RELEASE_REFRESH,
    (data, sender) => broker.releaseRefresh(data, sender),
  )
}
