import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Browser from 'webextension-polyfill'

import type { TopBarStateBrokerBrowser } from '~/background/topBarStateBroker'
import {
  createTopBarStateBroker,
} from '~/background/topBarStateBroker'
import type { TopBarSharedState } from '~/constants/topBarState'
import { TOP_BAR_STATE_MESSAGE } from '~/constants/topBarState'

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
      },
    },
    tabs: {},
  },
}))

const MAX_AGE = 5 * 60 * 1000

function createSnapshot(seed: number): TopBarSharedState {
  return {
    unReadMessage: {
      at: seed,
      chat: seed,
      like: seed,
      reply: seed,
      sys_msg: seed,
      up: seed,
    },
    unReadDm: {
      unfollow_unread: seed,
      follow_unread: seed,
      unfollow_push_msg: seed,
      dustbin_push_msg: seed,
      dustbin_unread: seed,
      biz_msg_unfollow_unread: seed,
      biz_msg_follow_unread: seed,
    },
    newMomentsCount: seed,
    watchLaterCount: seed,
  }
}

function createSender(
  id: number,
  cookieStoreId?: string,
  incognito = false,
): Browser.Runtime.MessageSender {
  return {
    tab: {
      id,
      cookieStoreId,
      incognito,
    },
  } as Browser.Runtime.MessageSender
}

function cloneStoredValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createSessionStorage() {
  const values: Record<string, unknown> = {}

  return {
    get: vi.fn(async (key: null | string | string[] | Record<string, unknown> = null) => {
      if (typeof key === 'string' && key in values)
        return { [key]: cloneStoredValue(values[key]) }

      return {}
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, cloneStoredValue(items))
    }),
  }
}

function createExtensionApi(session = createSessionStorage()) {
  const tabs = {
    query: vi.fn(),
    sendMessage: vi.fn(),
  }

  return {
    extensionApi: {
      storage: { session },
      tabs,
    } as unknown as TopBarStateBrokerBrowser,
    session,
    tabs,
  }
}

describe('顶栏共享状态协调器', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('并发申请时只允许一个标签页成为刷新者', async () => {
    const { extensionApi } = createExtensionApi()
    const broker = createTopBarStateBroker(extensionApi)

    const [firstClaim, secondClaim] = await Promise.all([
      broker.claimRefresh({ maxAge: MAX_AGE }, createSender(1)),
      broker.claimRefresh({ maxAge: MAX_AGE }, createSender(2)),
    ])

    expect(firstClaim).toEqual({
      shouldRefresh: true,
      snapshot: undefined,
      refreshId: 1,
    })
    expect(secondClaim).toEqual({
      shouldRefresh: false,
      snapshot: undefined,
    })
  })

  it('发布后立即广播给同一容器和隐私上下文的标签页', async () => {
    const { extensionApi, tabs } = createExtensionApi()
    const broker = createTopBarStateBroker(extensionApi)
    const snapshot = createSnapshot(3)
    tabs.query.mockResolvedValue([
      { id: 1, incognito: false },
      { id: 2, incognito: false },
      { id: 3, cookieStoreId: 'firefox-container-2', incognito: false },
      { id: 4, incognito: true },
    ])
    tabs.sendMessage.mockResolvedValue(undefined)

    const claim = await broker.claimRefresh({ maxAge: MAX_AGE }, createSender(1))
    await broker.publish({
      snapshot,
      refreshId: claim.refreshId!,
    }, createSender(1))

    expect(tabs.sendMessage).toHaveBeenCalledTimes(2)
    expect(tabs.sendMessage).toHaveBeenNthCalledWith(1, 1, {
      type: TOP_BAR_STATE_MESSAGE.UPDATED,
      data: { snapshot },
    })
    expect(tabs.sendMessage).toHaveBeenNthCalledWith(2, 2, {
      type: TOP_BAR_STATE_MESSAGE.UPDATED,
      data: { snapshot },
    })
    await expect(broker.claimRefresh({ maxAge: MAX_AGE }, createSender(2))).resolves.toEqual({
      shouldRefresh: false,
      snapshot,
    })
  })

  it('旧快照刷新期间仍返回旧值并通过新广播完成追平', async () => {
    const { extensionApi, tabs } = createExtensionApi()
    const broker = createTopBarStateBroker(extensionApi)
    const oldSnapshot = createSnapshot(1)
    const newSnapshot = createSnapshot(2)
    tabs.query.mockResolvedValue([
      { id: 1, incognito: false },
      { id: 2, incognito: false },
    ])
    tabs.sendMessage.mockResolvedValue(undefined)

    const initialClaim = await broker.claimRefresh({ maxAge: MAX_AGE }, createSender(1))
    await broker.publish({
      snapshot: oldSnapshot,
      refreshId: initialClaim.refreshId!,
    }, createSender(1))
    vi.advanceTimersByTime(MAX_AGE + 1)

    const refreshClaim = await broker.claimRefresh({ maxAge: MAX_AGE }, createSender(1))
    expect(refreshClaim).toEqual({
      shouldRefresh: true,
      snapshot: oldSnapshot,
      refreshId: 2,
    })
    await expect(broker.claimRefresh({ maxAge: MAX_AGE }, createSender(2))).resolves.toEqual({
      shouldRefresh: false,
      snapshot: oldSnapshot,
    })

    tabs.sendMessage.mockClear()
    await broker.publish({
      snapshot: newSnapshot,
      refreshId: refreshClaim.refreshId!,
    }, createSender(1))

    expect(tabs.sendMessage).toHaveBeenCalledTimes(2)
    expect(tabs.sendMessage).toHaveBeenCalledWith(2, {
      type: TOP_BAR_STATE_MESSAGE.UPDATED,
      data: { snapshot: newSnapshot },
    })
  })

  it('不同 Firefox 容器可以各自获取刷新权', async () => {
    const { extensionApi } = createExtensionApi()
    const broker = createTopBarStateBroker(extensionApi)

    await expect(broker.claimRefresh(
      { maxAge: MAX_AGE },
      createSender(1, 'firefox-container-1'),
    )).resolves.toMatchObject({ shouldRefresh: true })
    await expect(broker.claimRefresh(
      { maxAge: MAX_AGE },
      createSender(2, 'firefox-container-2'),
    )).resolves.toMatchObject({ shouldRefresh: true })
  })

  it('后台重建后从会话存储恢复新鲜快照', async () => {
    const session = createSessionStorage()
    const firstExtension = createExtensionApi(session)
    const snapshot = createSnapshot(6)
    firstExtension.tabs.query.mockResolvedValue([])

    const firstBroker = createTopBarStateBroker(firstExtension.extensionApi)
    const claim = await firstBroker.claimRefresh({ maxAge: MAX_AGE }, createSender(1))
    await firstBroker.publish({
      snapshot,
      refreshId: claim.refreshId!,
    }, createSender(1))

    const rebuiltExtension = createExtensionApi(session)
    const rebuiltBroker = createTopBarStateBroker(rebuiltExtension.extensionApi)

    await expect(
      rebuiltBroker.claimRefresh({ maxAge: MAX_AGE }, createSender(2)),
    ).resolves.toEqual({
      shouldRefresh: false,
      snapshot,
    })
  })

  it('后台重建后保留刷新租约并在超时后允许接管', async () => {
    const session = createSessionStorage()
    const firstExtension = createExtensionApi(session)
    const firstBroker = createTopBarStateBroker(firstExtension.extensionApi)

    const firstClaim = await firstBroker.claimRefresh(
      { maxAge: MAX_AGE },
      createSender(1),
    )
    expect(firstClaim).toMatchObject({
      shouldRefresh: true,
      refreshId: 1,
    })

    const rebuiltExtension = createExtensionApi(session)
    const rebuiltBroker = createTopBarStateBroker(rebuiltExtension.extensionApi)

    await expect(
      rebuiltBroker.claimRefresh({ maxAge: MAX_AGE }, createSender(2)),
    ).resolves.toMatchObject({ shouldRefresh: false })

    vi.advanceTimersByTime(30_001)

    const takeoverClaim = await rebuiltBroker.claimRefresh(
      { maxAge: MAX_AGE },
      createSender(2),
    )
    expect(takeoverClaim).toMatchObject({
      shouldRefresh: true,
      refreshId: 2,
    })

    const staleSnapshot = createSnapshot(9)
    await rebuiltBroker.publish({
      snapshot: staleSnapshot,
      refreshId: firstClaim.refreshId!,
    }, createSender(1))

    await expect(
      rebuiltBroker.claimRefresh({ maxAge: MAX_AGE }, createSender(3)),
    ).resolves.toEqual({
      shouldRefresh: false,
      snapshot: undefined,
    })

    rebuiltExtension.tabs.query.mockResolvedValue([])
    const currentSnapshot = createSnapshot(10)
    await rebuiltBroker.publish({
      snapshot: currentSnapshot,
      refreshId: takeoverClaim.refreshId!,
    }, createSender(2))

    await expect(
      rebuiltBroker.claimRefresh({ maxAge: MAX_AGE }, createSender(3)),
    ).resolves.toEqual({
      shouldRefresh: false,
      snapshot: currentSnapshot,
    })
  })

  it('浏览器不支持会话存储时退回后台内存状态', async () => {
    const tabs = {
      query: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn(),
    }
    const broker = createTopBarStateBroker({
      tabs,
    } as unknown as TopBarStateBrokerBrowser)
    const snapshot = createSnapshot(8)

    const claim = await broker.claimRefresh({ maxAge: MAX_AGE }, createSender(1))
    await broker.publish({
      snapshot,
      refreshId: claim.refreshId!,
    }, createSender(1))

    await expect(
      broker.claimRefresh({ maxAge: MAX_AGE }, createSender(2)),
    ).resolves.toEqual({
      shouldRefresh: false,
      snapshot,
    })
  })
})
