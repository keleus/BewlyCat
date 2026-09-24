import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { CONTENT_SCRIPT_MATCHES } from '~/constants/contentScript'
import type {
  WatchLaterChange,
  WatchLaterSnapshot,
  WatchLaterStateClaim,
  WatchLaterStateClaimResult,
  WatchLaterStateMutate,
  WatchLaterStatePublish,
  WatchLaterStateRelease,
} from '~/constants/watchLaterState'
import { WATCH_LATER_STATE_MESSAGE } from '~/constants/watchLaterState'
import { onMessage } from '~/utils/messaging'
import { applyWatchLaterChange } from '~/utils/watchLaterSnapshot'

interface RecentMutation {
  change: WatchLaterChange
  at: number
}

interface WatchLaterStateEntry {
  snapshot?: WatchLaterSnapshot
  updatedAt: number
  refreshStartedAt: number
  refreshId: number
  mutations: RecentMutation[]
}

export interface WatchLaterStateBrokerBrowser {
  storage?: {
    session?: Pick<Browser.Storage.StorageAreaWithUsage, 'get' | 'set'>
  }
  tabs: Pick<Browser.Tabs.Static, 'query' | 'sendMessage'>
}

const REFRESH_LEASE_TIMEOUT = 30_000
// B 站写入后列表查询偶尔短暂返回旧数据：在此窗口内发生的本地变更会覆盖到刷新结果上
const MUTATION_SETTLE_WINDOW = 5_000
const MUTATION_RETENTION = 60_000
const STORAGE_KEY = 'watchLaterStateBroker:v1'
// 批量添加等连续变更只合并写入一次会话存储，避免每次都序列化整份快照
const PERSIST_DELAY = 300

function getContextKey(tab?: Browser.Tabs.Tab) {
  const cookieStoreId = tab?.cookieStoreId || 'default'
  const privacyContext = tab?.incognito ? 'private' : 'normal'
  return `${privacyContext}:${cookieStoreId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStateEntry(value: unknown): value is WatchLaterStateEntry {
  return isRecord(value)
    && typeof value.updatedAt === 'number'
    && typeof value.refreshStartedAt === 'number'
    && typeof value.refreshId === 'number'
    && Array.isArray(value.mutations)
    && (value.snapshot === undefined || (isRecord(value.snapshot) && Array.isArray(value.snapshot.entries)))
}

export function createWatchLaterStateBroker(extensionApi: WatchLaterStateBrokerBrowser = browser) {
  const entries = new Map<string, WatchLaterStateEntry>()
  const sessionStorage = extensionApi.storage?.session
  let loadPromise: Promise<void> | undefined
  let operationQueue: Promise<void> = Promise.resolve()
  let persistTimer: ReturnType<typeof setTimeout> | undefined

  function runExclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = operationQueue.then(operation, operation)
    operationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async function ensureLoaded() {
    loadPromise ??= (async () => {
      try {
        const stored = (await sessionStorage?.get(STORAGE_KEY))?.[STORAGE_KEY]
        if (!isRecord(stored))
          return
        for (const [key, entry] of Object.entries(stored)) {
          if (isStateEntry(entry))
            entries.set(key, entry)
        }
      }
      catch {
        // 不支持会话存储时只在当前后台进程内共享
      }
    })()
    await loadPromise
  }

  function schedulePersist() {
    if (!sessionStorage || persistTimer)
      return
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      sessionStorage.set({ [STORAGE_KEY]: Object.fromEntries(entries) }).catch(() => {
        // 写入失败不影响当前后台进程继续协调
      })
    }, PERSIST_DELAY)
  }

  function getEntry(accountId: number, sender?: Browser.Runtime.MessageSender) {
    const key = `${getContextKey(sender?.tab)}:${accountId}`
    let entry = entries.get(key)
    if (!entry) {
      entry = { updatedAt: 0, refreshStartedAt: 0, refreshId: 0, mutations: [] }
      entries.set(key, entry)
    }
    const now = Date.now()
    entry.mutations = entry.mutations.filter(mutation => now - mutation.at < MUTATION_RETENTION)
    return entry
  }

  async function broadcast(type: string, data: unknown, sender?: Browser.Runtime.MessageSender) {
    const contextKey = getContextKey(sender?.tab)
    try {
      const tabs = await extensionApi.tabs.query({ url: [...CONTENT_SCRIPT_MATCHES] })
      await Promise.allSettled(
        tabs
          .filter(tab => tab.id !== undefined && getContextKey(tab) === contextKey)
          .map(tab => extensionApi.tabs.sendMessage(tab.id!, { type, data })),
      )
    }
    catch {
      // 页面可能已关闭；其余页面下次读取时仍会拿到最新快照
    }
  }

  return {
    claimRefresh({ accountId, maxAge, force = false }: WatchLaterStateClaim, sender?: Browser.Runtime.MessageSender) {
      return runExclusive(async (): Promise<WatchLaterStateClaimResult> => {
        await ensureLoaded()
        const entry = getEntry(accountId, sender)
        const now = Date.now()
        const fresh = entry.snapshot !== undefined && now - entry.updatedAt < maxAge
        const refreshing = entry.refreshStartedAt > 0 && now - entry.refreshStartedAt < REFRESH_LEASE_TIMEOUT
        // 完整列表较大，多个标签页共享同一把刷新锁；force 仅用于需要最新服务器结果的操作
        const shouldRefresh = force || (!fresh && !refreshing)
        if (shouldRefresh) {
          entry.refreshStartedAt = now
          entry.refreshId += 1
          schedulePersist()
        }
        return {
          shouldRefresh,
          snapshot: entry.snapshot,
          updatedAt: entry.updatedAt,
          ...(shouldRefresh ? { refreshId: entry.refreshId } : {}),
        }
      })
    },

    async publish({ accountId, refreshId, snapshot }: WatchLaterStatePublish, sender?: Browser.Runtime.MessageSender) {
      const published = await runExclusive(async () => {
        await ensureLoaded()
        const entry = getEntry(accountId, sender)
        if (entry.refreshId !== refreshId)
          return undefined

        // 请求期间或刚结束前的变更，服务器可能尚未反映，重新叠加到结果上
        const settleFrom = entry.refreshStartedAt - MUTATION_SETTLE_WINDOW
        const merged = entry.mutations
          .filter(mutation => mutation.at >= settleFrom)
          .reduce((current, mutation) => applyWatchLaterChange(current, mutation.change), snapshot)
        entry.snapshot = merged
        entry.updatedAt = Date.now()
        entry.refreshStartedAt = 0
        schedulePersist()
        return { accountId, snapshot: merged, updatedAt: entry.updatedAt }
      })

      if (published)
        await broadcast(WATCH_LATER_STATE_MESSAGE.UPDATED, published, sender)
      return published
    },

    releaseRefresh({ accountId, refreshId }: WatchLaterStateRelease, sender?: Browser.Runtime.MessageSender) {
      return runExclusive(async () => {
        await ensureLoaded()
        const entry = getEntry(accountId, sender)
        if (entry.refreshId !== refreshId)
          return
        entry.refreshStartedAt = 0
        schedulePersist()
      })
    },

    async mutate(data: WatchLaterStateMutate, sender?: Browser.Runtime.MessageSender) {
      await runExclusive(async () => {
        await ensureLoaded()
        const entry = getEntry(data.accountId, sender)
        entry.mutations.push({ change: data.change, at: Date.now() })
        if (entry.snapshot)
          entry.snapshot = applyWatchLaterChange(entry.snapshot, data.change)
        schedulePersist()
      })
      await broadcast(WATCH_LATER_STATE_MESSAGE.MUTATED, data, sender)
    },
  }
}

export function setupWatchLaterStateBroker() {
  const broker = createWatchLaterStateBroker()

  onMessage<WatchLaterStateClaim>(
    WATCH_LATER_STATE_MESSAGE.CLAIM_REFRESH,
    (data, sender) => broker.claimRefresh(data, sender),
  )
  onMessage<WatchLaterStatePublish>(
    WATCH_LATER_STATE_MESSAGE.PUBLISH,
    (data, sender) => broker.publish(data, sender),
  )
  onMessage<WatchLaterStateRelease>(
    WATCH_LATER_STATE_MESSAGE.RELEASE_REFRESH,
    (data, sender) => broker.releaseRefresh(data, sender),
  )
  onMessage<WatchLaterStateMutate>(
    WATCH_LATER_STATE_MESSAGE.MUTATE,
    (data, sender) => broker.mutate(data, sender),
  )
}
