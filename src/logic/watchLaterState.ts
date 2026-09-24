import { shallowRef } from 'vue'

import { TOP_BAR_STATE_MESSAGE } from '~/constants/topBarState'
import type {
  WatchLaterChange,
  WatchLaterEntry,
  WatchLaterSnapshot,
  WatchLaterStateClaim,
  WatchLaterStateClaimResult,
  WatchLaterStateMutate,
  WatchLaterStatePublish,
  WatchLaterStateRelease,
  WatchLaterStateUpdated,
} from '~/constants/watchLaterState'
import { WATCH_LATER_STATE_MESSAGE } from '~/constants/watchLaterState'
import { parseDedeUserID } from '~/logic/loginStatus'
import type { WatchLaterResult } from '~/models/video/watchLater'
import api from '~/utils/api'
import { onMessage, sendMessage } from '~/utils/messaging'
import type { WatchLaterTarget } from '~/utils/watchLaterSnapshot'
import { applyWatchLaterChange, createWatchLaterSnapshot, toWatchLaterEntry } from '~/utils/watchLaterSnapshot'

/**
 * 当前账号的稍后再看成员关系（只含 aid/bvid/epid），供各处卡片判断“是否已加入”。
 * 完整列表由后台 broker 跨标签页缓存与合并请求；增删通过广播同步，无需重新拉取。
 */

const DEFAULT_MAX_AGE = 5 * 60_000
// 非强制加载的最小间隔：悬停等高频入口在请求失败或等待其他标签页时不会反复发消息
const MIN_LOAD_INTERVAL = 10_000
const PEER_REFRESH_TIMEOUT = 15_000
// 本地与其他标签页的增删在此窗口内会叠加到刷新结果上，抵消列表接口的短暂延迟
const CHANGE_OVERLAY_WINDOW = 15_000
const EMPTY_SNAPSHOT: WatchLaterSnapshot = { entries: [], count: 0 }

interface OverlayChange {
  change: WatchLaterChange
  at: number
}

interface WatchLaterIndex {
  aid: Map<number, WatchLaterEntry>
  bvid: Map<string, WatchLaterEntry>
  epid: Map<number, WatchLaterEntry>
}

/** 区分本页发出的变更广播，避免回声与其他标签页的变更交错 */
const sourceId = Math.random().toString(36).slice(2)
const view = shallowRef<WatchLaterSnapshot>(EMPTY_SNAPSHOT)
const ready = shallowRef(false)
let accountId = 0
let baseSnapshot: WatchLaterSnapshot | undefined
let updatedAt = 0
let overlay: OverlayChange[] = []
let indexedSnapshot: WatchLaterSnapshot | undefined
let index: WatchLaterIndex = { aid: new Map(), bvid: new Map(), epid: new Map() }
let pendingLoad: Promise<void> | undefined
let lastLoadStartedAt = 0
let peerWaiters: Array<() => void> = []
let listenersReady = false

function getCurrentAccountId() {
  return parseDedeUserID(document.cookie) ?? 0
}

function pruneOverlay() {
  const now = Date.now()
  overlay = overlay.filter(item => now - item.at < CHANGE_OVERLAY_WINDOW)
}

function applyOverlay(snapshot: WatchLaterSnapshot) {
  pruneOverlay()
  return overlay.reduce((current, item) => applyWatchLaterChange(current, item.change), snapshot)
}

function isSameEntry(a: WatchLaterEntry, b: WatchLaterEntry) {
  return a.aid === b.aid && a.bvid === b.bvid && a.epid === b.epid
}

function isSameSnapshot(a: WatchLaterSnapshot, b: WatchLaterSnapshot) {
  return a.count === b.count
    && a.entries.length === b.entries.length
    && a.entries.every((entry, i) => isSameEntry(entry, b.entries[i]))
}

function render() {
  // 列表未加载时也要反映本页刚做的增删
  view.value = baseSnapshot ?? applyOverlay(EMPTY_SNAPSHOT)
}

function resetForAccount(nextAccountId: number) {
  accountId = nextAccountId
  baseSnapshot = undefined
  updatedAt = 0
  overlay = []
  pendingLoad = undefined
  lastLoadStartedAt = 0
  ready.value = false
  render()
}

function syncAccount() {
  const currentAccountId = getCurrentAccountId()
  if (currentAccountId !== accountId)
    resetForAccount(currentAccountId)
  return currentAccountId
}

function setBaseSnapshot(snapshot: WatchLaterSnapshot, time: number) {
  const next = applyOverlay(snapshot)
  // 内容未变时保留原对象：各标签页定期收到的刷新广播不会让所有卡片重新计算和渲染
  if (!baseSnapshot || !isSameSnapshot(baseSnapshot, next)) {
    baseSnapshot = next
    render()
  }
  updatedAt = time
  ready.value = true
  peerWaiters.splice(0).forEach(resolve => resolve())
}

function addOverlayChange(change: WatchLaterChange) {
  // 立即并入当前快照；保留一段时间，用于覆盖随后到达、尚未反映该变更的列表结果
  pruneOverlay()
  overlay.push({ change, at: Date.now() })
  if (baseSnapshot)
    baseSnapshot = applyWatchLaterChange(baseSnapshot, change)
  render()
}

function getIndex(snapshot: WatchLaterSnapshot) {
  if (indexedSnapshot === snapshot)
    return index

  index = { aid: new Map(), bvid: new Map(), epid: new Map() }
  for (const entry of snapshot.entries) {
    if (entry.aid)
      index.aid.set(entry.aid, entry)
    if (entry.bvid)
      index.bvid.set(entry.bvid, entry)
    if (entry.epid)
      index.epid.set(entry.epid, entry)
  }
  indexedSnapshot = snapshot
  return index
}

function setupListeners() {
  if (listenersReady)
    return
  listenersReady = true

  onMessage<WatchLaterStateUpdated>(WATCH_LATER_STATE_MESSAGE.UPDATED, (data) => {
    if (data.accountId === syncAccount())
      setBaseSnapshot(data.snapshot, data.updatedAt)
  })

  onMessage<WatchLaterStateMutate>(WATCH_LATER_STATE_MESSAGE.MUTATED, (data) => {
    if (data.sourceId !== sourceId && data.accountId === syncAccount())
      addOverlayChange(data.change)
  })

  // 登录/登出/切号时立即丢弃旧账号的状态；查询路径因此无需每次读取 Cookie
  onMessage(TOP_BAR_STATE_MESSAGE.LOGIN_STATE_CHANGED, () => {
    syncAccount()
  })
}

async function fetchSnapshot() {
  const response = await api.watchlater.getAllWatchLaterList() as WatchLaterResult
  if (response.code !== 0)
    throw new Error(response.message || String(response.code))
  return createWatchLaterSnapshot(response.data?.list ?? [], response.data?.count ?? 0)
}

function waitForPeerRefresh() {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, PEER_REFRESH_TIMEOUT)
    function done() {
      clearTimeout(timer)
      peerWaiters = peerWaiters.filter(waiter => waiter !== done)
      resolve()
    }
    peerWaiters.push(done)
  })
}

async function releaseRefresh(id: number, refreshId: number) {
  await sendMessage<WatchLaterStateRelease>(WATCH_LATER_STATE_MESSAGE.RELEASE_REFRESH, { accountId: id, refreshId })
    .catch(() => {})
}

async function load(id: number, maxAge: number, force: boolean) {
  // API 请求同样经由后台，后台不可达时无法退回本页直接请求
  const claim = await sendMessage<WatchLaterStateClaim, WatchLaterStateClaimResult>(
    WATCH_LATER_STATE_MESSAGE.CLAIM_REFRESH,
    { accountId: id, maxAge, force },
  )

  if (id !== accountId) {
    if (claim.refreshId !== undefined)
      await releaseRefresh(id, claim.refreshId)
    return
  }

  // 已有缓存先用于展示；force 时仍以接下来的请求结果为准
  if (claim.snapshot && (!force || !ready.value))
    setBaseSnapshot(claim.snapshot, claim.updatedAt ?? 0)

  if (!claim.shouldRefresh || claim.refreshId === undefined) {
    // 其他标签页正在拉取，等待其广播
    if (!ready.value)
      await waitForPeerRefresh()
    return
  }

  const refreshId = claim.refreshId
  try {
    const snapshot = await fetchSnapshot()
    if (id !== accountId) {
      await releaseRefresh(id, refreshId)
      return
    }
    const published = await sendMessage<WatchLaterStatePublish, WatchLaterStateUpdated | undefined>(
      WATCH_LATER_STATE_MESSAGE.PUBLISH,
      { accountId: id, refreshId, snapshot },
    )
    // 未发布说明已有更新的刷新接手，结果会通过广播到达
    if (published && id === accountId)
      setBaseSnapshot(published.snapshot, published.updatedAt)
  }
  catch (error) {
    await releaseRefresh(id, refreshId)
    throw error
  }
}

/**
 * 确保已加载稍后再看成员关系。缓存未过期时不发请求；多个调用与标签页共享同一次请求。
 * force 用于需要服务器最新结果的场景（如无法得知具体变更的批量移除）。
 */
export function ensureWatchLaterState(options: { maxAge?: number, force?: boolean } = {}): Promise<void> {
  const { maxAge = DEFAULT_MAX_AGE, force = false } = options
  const id = syncAccount()
  if (!id)
    return Promise.resolve()
  if (!force && ready.value && Date.now() - updatedAt < maxAge)
    return Promise.resolve()
  if (pendingLoad && !force)
    return pendingLoad
  if (!force && Date.now() - lastLoadStartedAt < MIN_LOAD_INTERVAL)
    return Promise.resolve()

  setupListeners()
  lastLoadStartedAt = Date.now()
  const request = load(id, maxAge, force)
    .catch((error) => {
      console.error('获取稍后再看状态失败:', error)
    })
    .finally(() => {
      if (pendingLoad === request)
        pendingLoad = undefined
    })
  pendingLoad = request
  return request
}

/** 其他来源（如顶栏数量）显示列表已变化时，按需让已加载的状态重新比对 */
export function noteWatchLaterCount(count: number) {
  if (ready.value && accountId === syncAccount() && count !== view.value.count)
    void ensureWatchLaterState({ maxAge: 0 })
}

export function findWatchLaterEntry(target: WatchLaterTarget): WatchLaterEntry | undefined {
  // 读取 view 建立响应式依赖；账号切换由 syncAccount 清空 view，这里不再读取 Cookie
  const snapshot = view.value
  if (!snapshot.entries.length)
    return undefined
  const entry = toWatchLaterEntry(target)
  if (!entry)
    return undefined
  const { aid, bvid, epid } = getIndex(snapshot)
  return (entry.aid ? aid.get(entry.aid) : undefined)
    ?? (entry.bvid ? bvid.get(entry.bvid) : undefined)
    ?? (entry.epid ? epid.get(entry.epid) : undefined)
}

export function isInWatchLater(target: WatchLaterTarget) {
  return Boolean(findWatchLaterEntry(target))
}

/** 已知的 aid（移除接口只接受 aid），列表中没有时返回 undefined */
export function getWatchLaterAid(target: WatchLaterTarget) {
  return findWatchLaterEntry(target)?.aid || undefined
}

function recordChange(change: WatchLaterChange) {
  const id = syncAccount()
  if (!id)
    return

  setupListeners()
  addOverlayChange(change)
  sendMessage<WatchLaterStateMutate>(
    WATCH_LATER_STATE_MESSAGE.MUTATE,
    { accountId: id, change, sourceId },
  ).catch(() => {
    // 后台不可达时仅影响其他标签页，下次刷新会校正
  })
}

/** 在添加/移除接口成功后调用，同步到所有页面 */
export function markWatchLater(target: WatchLaterTarget, added: boolean) {
  const entry = toWatchLaterEntry(target)
  if (entry)
    recordChange({ type: added ? 'add' : 'remove', entry })
}

export function markWatchLaterCleared() {
  recordChange({ type: 'clear' })
}
