const BLOCKED_FEED_CARD_CLASS = 'bewly-blocked-feed-card'

// Homepage recommended cards (that do NOT support "not interested")
const RCMD_VIDEO_CARD_SELECTOR = '.bili-video-card.is-rcmd:not(.enable-no-interest)'

let feedCardObserver: MutationObserver | null = null
let observeRoot: Element | null = null
let flushScheduled = false
const pendingRoots = new Set<Element>()
const recheckScheduled = new WeakSet<HTMLElement>()

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
    feedCardObserver.observe(preferred, { childList: true, subtree: true })
    observeRoot = preferred
  }
  catch {
    // ignore
  }
}

function scheduleRecheckBlockedFeedCard(feedCard: HTMLElement) {
  if (recheckScheduled.has(feedCard))
    return

  recheckScheduled.add(feedCard)

  // Defensive: some classes are attached asynchronously after upgrade/hydration.
  window.setTimeout(() => {
    recheckScheduled.delete(feedCard)

    if (!feedCard.isConnected)
      return

    if (!feedCard.querySelector(RCMD_VIDEO_CARD_SELECTOR)) {
      feedCard.classList.remove(BLOCKED_FEED_CARD_CLASS)
    }
  }, 1500)
}

function markBlockedFeedCardFromVideoCard(videoCard: Element) {
  const feedCard = videoCard.closest<HTMLElement>('.feed-card')
  if (!feedCard)
    return

  if (!feedCard.classList.contains(BLOCKED_FEED_CARD_CLASS)) {
    feedCard.classList.add(BLOCKED_FEED_CARD_CLASS)
    scheduleRecheckBlockedFeedCard(feedCard)
  }
}

function scanForRcmdCards(root: ParentNode) {
  // When root itself is a target element
  if (root instanceof Element && root.matches(RCMD_VIDEO_CARD_SELECTOR))
    markBlockedFeedCardFromVideoCard(root)

  root.querySelectorAll?.(RCMD_VIDEO_CARD_SELECTOR).forEach(markBlockedFeedCardFromVideoCard)
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
  feedCardObserver.observe(observeRoot, { childList: true, subtree: true })
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
