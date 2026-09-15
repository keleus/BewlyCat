const BLOCKED_FEED_CARD_CLASS = 'bewly-blocked-feed-card'
const VIDEO_CARD_CLASS = 'bili-video-card'

// Homepage recommended cards (that do NOT support "not interested")
const RCMD_VIDEO_CARD_SELECTOR = '.bili-video-card.is-rcmd:not(.enable-no-interest)'
const FEED_CARD_SELECTOR = '.feed-card, .bili-feed-card'
const OBSERVER_OPTIONS: MutationObserverInit = {
  attributeFilter: ['class'],
  attributeOldValue: true,
  attributes: true,
  childList: true,
  subtree: true,
}

let feedCardObserver: MutationObserver | null = null
let observeRoot: Element | null = null
let flushFrame: number | undefined
let fullScanPending = false
const MAX_PENDING_ROOTS = 100
const pendingRoots = new Set<Element>()

interface UselessFeedCardBlockerContext {
  blockAds: boolean
  homePage: boolean
  inIframe: boolean
  useOriginalBilibiliHomepage: boolean
}

export function shouldEnableUselessFeedCardBlocker({
  blockAds,
  homePage,
  inIframe,
  useOriginalBilibiliHomepage,
}: UselessFeedCardBlockerContext) {
  // 自定义首页隐藏了原站信息流，无需监听；iframe 内仍使用原站页面。
  return blockAds && homePage && (inIframe || useOriginalBilibiliHomepage)
}

function getObserveRoot(): Element {
  // Prefer the feed container if it exists; fallback to body.
  const firstFeedCard = document.querySelector('.feed-card')
  return firstFeedCard?.parentElement || document.body || document.documentElement
}

function ensureObserveRoot() {
  if (!feedCardObserver)
    return

  const preferred = getObserveRoot()
  if (observeRoot === preferred && observeRoot?.isConnected)
    return

  try {
    feedCardObserver.disconnect()
    feedCardObserver.observe(preferred, OBSERVER_OPTIONS)
    observeRoot = preferred
  }
  catch {
    // ignore
  }
}

function syncFeedCard(feedCard: HTMLElement) {
  feedCard.classList.toggle(
    BLOCKED_FEED_CARD_CLASS,
    feedCard.querySelector(RCMD_VIDEO_CARD_SELECTOR) !== null,
  )
}

function getFeedCardSlot(element: Element): HTMLElement | null {
  // 首屏卡片有 .feed-card 外层，后续懒加载卡片则可能直接使用 .bili-feed-card。
  return element.closest<HTMLElement>('.feed-card')
    || element.closest<HTMLElement>('.bili-feed-card')
}

function scanForRcmdCards(root: ParentNode) {
  const feedCardSlots = new Set<HTMLElement>()

  // 新增或更新的节点可能位于已有卡片内部。
  if (root instanceof Element) {
    const closestFeedCard = getFeedCardSlot(root)
    if (closestFeedCard)
      feedCardSlots.add(closestFeedCard)
  }

  root.querySelectorAll?.<HTMLElement>(FEED_CARD_SELECTOR).forEach((feedCard) => {
    const feedCardSlot = getFeedCardSlot(feedCard)
    if (feedCardSlot)
      feedCardSlots.add(feedCardSlot)
  })

  feedCardSlots.forEach(syncFeedCard)
}

function flushPending() {
  flushFrame = undefined
  if (!feedCardObserver)
    return
  if (document.visibilityState === 'hidden') {
    deferFullScan()
    return
  }

  if (fullScanPending) {
    fullScanPending = false
    scanForRcmdCards(document)
  }
  else {
    for (const root of pendingRoots) {
      if (root.isConnected)
        scanForRcmdCards(root)
    }
  }

  pendingRoots.clear()

  // If we started early (before feed cards existed), retarget the observer to the feed container.
  ensureObserveRoot()
}

function scheduleFlushPending() {
  if (flushFrame !== undefined)
    return

  flushFrame = requestAnimationFrame(flushPending)
}

function deferFullScan() {
  if (flushFrame !== undefined)
    cancelAnimationFrame(flushFrame)
  flushFrame = undefined
  pendingRoots.clear()
  fullScanPending = true
}

function queueRoot(root: Element) {
  if (fullScanPending || !root.isConnected)
    return

  // 主线程繁忙时也限制待处理引用；溢出后只保留一次重新扫描的标记。
  if (pendingRoots.size >= MAX_PENDING_ROOTS) {
    pendingRoots.clear()
    fullScanPending = true
    return
  }
  pendingRoots.add(root)
}

function handleVisibilityChange() {
  // 后台标签页会暂停 RAF，但 MutationObserver 仍可能接收原站的更新。
  // 不把期间替换、移除的 DOM 树一直保存在 Set 中，回到前台再扫描当前节点。
  if (document.visibilityState === 'hidden')
    deferFullScan()
  else if (fullScanPending || pendingRoots.size > 0)
    scheduleFlushPending()
}

function start() {
  if (feedCardObserver)
    return

  // Initial scan (covers already-rendered cards)
  scanForRcmdCards(document)

  feedCardObserver = new MutationObserver((mutations) => {
    if (document.visibilityState === 'hidden') {
      deferFullScan()
      return
    }

    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const target = mutation.target
        const wasVideoCard = mutation.oldValue?.split(/\s+/).includes(VIDEO_CARD_CLASS)

        // Bilibili attaches recommendation classes asynchronously during hydration.
        if (target instanceof Element && (target.classList.contains(VIDEO_CARD_CLASS) || wasVideoCard))
          queueRoot(target)

        continue
      }

      // If the matching child is removed, resync its existing feed-card parent.
      if (mutation.removedNodes.length > 0 && mutation.target instanceof Element)
        queueRoot(mutation.target)

      for (let index = 0; index < mutation.addedNodes.length; index++) {
        const node = mutation.addedNodes[index]
        if (node.nodeType !== Node.ELEMENT_NODE)
          continue
        queueRoot(node as Element)
      }
    }

    if (fullScanPending || pendingRoots.size > 0)
      scheduleFlushPending()
  })

  observeRoot = getObserveRoot()
  feedCardObserver.observe(observeRoot, OBSERVER_OPTIONS)
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

function stop() {
  if (!feedCardObserver)
    return

  feedCardObserver.disconnect()
  feedCardObserver = null
  observeRoot = null

  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (flushFrame !== undefined)
    cancelAnimationFrame(flushFrame)
  flushFrame = undefined
  pendingRoots.clear()
  fullScanPending = false
}

export function setUselessFeedCardBlockerEnabled(enabled: boolean) {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined')
    return

  if (enabled)
    start()
  else
    stop()
}
