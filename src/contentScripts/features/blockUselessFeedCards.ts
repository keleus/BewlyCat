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
let flushScheduled = false
const pendingRoots = new Set<Element>()

interface UselessFeedCardBlockerContext {
  blockAds: boolean
  homePage: boolean
  inIframe: boolean
}

export function shouldEnableUselessFeedCardBlocker({
  blockAds,
  homePage,
}: UselessFeedCardBlockerContext) {
  return blockAds && homePage
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
  flushScheduled = false

  for (const root of pendingRoots)
    scanForRcmdCards(root)

  pendingRoots.clear()

  // If we started early (before feed cards existed), retarget the observer to the feed container.
  ensureObserveRoot()
}

function scheduleFlushPending() {
  if (flushScheduled)
    return

  flushScheduled = true
  requestAnimationFrame(flushPending)
}

function start() {
  if (feedCardObserver)
    return

  // Initial scan (covers already-rendered cards)
  scanForRcmdCards(document)

  feedCardObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const target = mutation.target
        const wasVideoCard = mutation.oldValue?.split(/\s+/).includes(VIDEO_CARD_CLASS)

        // Bilibili attaches recommendation classes asynchronously during hydration.
        if (target instanceof Element && (target.classList.contains(VIDEO_CARD_CLASS) || wasVideoCard))
          pendingRoots.add(target)

        continue
      }

      // If the matching child is removed, resync its existing feed-card parent.
      if (mutation.removedNodes.length > 0 && mutation.target instanceof Element)
        pendingRoots.add(mutation.target)

      for (let index = 0; index < mutation.addedNodes.length; index++) {
        const node = mutation.addedNodes[index]
        if (node.nodeType !== Node.ELEMENT_NODE)
          continue
        pendingRoots.add(node as Element)
      }
    }

    if (pendingRoots.size > 0)
      scheduleFlushPending()
  })

  observeRoot = getObserveRoot()
  feedCardObserver.observe(observeRoot, OBSERVER_OPTIONS)
}

function stop() {
  if (!feedCardObserver)
    return

  feedCardObserver.disconnect()
  feedCardObserver = null
  observeRoot = null

  pendingRoots.clear()
  flushScheduled = false
}

export function setUselessFeedCardBlockerEnabled(enabled: boolean) {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined')
    return

  if (enabled)
    start()
  else
    stop()
}
