import { watch } from 'vue'

import { settings, settingsReady } from '~/logic'

const CARD_SELECTOR = '.bili-dyn-item'
const FEED_SELECTOR = '.bili-dyn-list__items'
const HIDDEN_CLASS = 'bewly-filtered-original-moment'

function isOriginalMomentsFeed() {
  return location.hostname === 't.bilibili.com' && /^\/?$/.test(location.pathname)
}

function shouldHide(card: HTMLElement) {
  const config = settings.value
  const keywords = config.momentsEnableKeywordFilter
    ? config.momentsBlockedKeywords.split(/[\n,，;；]+/).map(word => word.trim().toLowerCase()).filter(Boolean)
    : []
  const content = card.querySelector('.bili-dyn-content')
  const searchableText = `${card.querySelector('.bili-dyn-title__text')?.textContent || ''} ${content?.textContent || ''}`.toLowerCase()
  if (keywords.some(word => searchableText.includes(word)))
    return true

  const has = (selector: string) => card.querySelector(selector) !== null
  const labels = Array.from(card.querySelectorAll('.bili-dyn-item__tag, [class*="__badge"], .dyn-additional-common__wrap'))
    .map(element => element.textContent || '')
    .join(' ')
  if (config.momentsFilterUpRecommendation && labels.includes('UP主的推荐'))
    return true
  if (config.momentsHideChargeExclusive && (labels.includes('充电专属') || has('.dyn-blocked-mask, .bili-dyn-upower-common')))
    return true

  // 转发内的原动态也可能包含视频等卡片；类型过滤只看转发本身。
  if (has('.bili-dyn-content__orig.reference, .bili-dyn-content__forw')) {
    return config.momentsHideForwardDynamics
  }

  const reservation = card.querySelector('.bili-dyn-card-reserve')?.textContent || ''
  if (reservation && ((config.momentsHideVideoReservation && reservation.includes('视频'))
    || (config.momentsHideLiveReservation && reservation.includes('直播')))) {
    return true
  }
  if (config.momentsHideLiveDynamics && has('.bili-dyn-card-live'))
    return true
  if (config.momentsHideUgcSeasonDynamics && has('.bili-dyn-card-medialist, .dyn-ugc__wrap'))
    return true
  if (config.momentsHidePgcDynamics && has('.bili-dyn-card-pgc'))
    return true
  if (config.momentsHideArticleDynamics && has('.bili-dyn-card-article'))
    return true
  if (config.momentsHideVideoDynamics && has('.bili-dyn-card-video') && !has('.bili-dyn-card-medialist, .dyn-ugc__wrap, .bili-dyn-card-pgc'))
    return true
  return config.momentsHideDrawDynamics && has('.dyn-card-opus__pics, .bili-dyn-card-draw')
}

export function setupOriginalMomentsFilter() {
  if (location.hostname !== 't.bilibili.com')
    return

  let pageObserver: MutationObserver | undefined
  const feedObservers = new Map<Element, MutationObserver>()
  let style: HTMLStyleElement | undefined
  let frame: number | undefined
  const pending = new Set<HTMLElement>()

  function scan(root: Element) {
    root.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach(card => card.classList.toggle(HIDDEN_CLASS, shouldHide(card)))
  }

  function flush() {
    frame = undefined
    pending.forEach(card => card.isConnected && card.classList.toggle(HIDDEN_CLASS, shouldHide(card)))
    pending.clear()
  }

  function queue(element: Element, includeDescendants = false) {
    const card = element.closest<HTMLElement>(CARD_SELECTOR)
    if (card)
      pending.add(card)
    if (includeDescendants)
      element.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach(item => pending.add(item))
    if (pending.size && frame === undefined)
      frame = requestAnimationFrame(flush)
  }

  function observeFeed() {
    const roots = new Set(Array.from(document.querySelectorAll(FEED_SELECTOR)))
    for (const [root, observer] of feedObservers) {
      if (!roots.has(root)) {
        observer.disconnect()
        feedObservers.delete(root)
      }
    }
    for (const root of roots) {
      if (feedObservers.has(root))
        continue
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.target instanceof Element)
            queue(mutation.target)
          else if (mutation.target.parentElement)
            queue(mutation.target.parentElement)
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element)
              queue(node, true)
          })
        }
      })
      observer.observe(root, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true })
      feedObservers.set(root, observer)
      scan(root)
    }
  }

  function refresh() {
    if (!settings.value.originalMomentsUseBewlyFilters || !isOriginalMomentsFeed()) {
      pageObserver?.disconnect()
      pageObserver = undefined
      feedObservers.forEach(observer => observer.disconnect())
      feedObservers.clear()
      style?.remove()
      style = undefined
      if (frame !== undefined)
        cancelAnimationFrame(frame)
      frame = undefined
      pending.clear()
      document.querySelectorAll<HTMLElement>(`.${HIDDEN_CLASS}`).forEach(card => card.classList.remove(HIDDEN_CLASS))
      return
    }

    if (!pageObserver) {
      style = document.createElement('style')
      style.textContent = `.${HIDDEN_CLASS}, .bili-dyn-list__item:has(.${HIDDEN_CLASS}) { display: none !important; }`
      document.documentElement.append(style)
      pageObserver = new MutationObserver((mutations) => {
        if (mutations.some(mutation => !Array.from(feedObservers.keys()).some(root => root.contains(mutation.target))))
          observeFeed()
      })
      pageObserver.observe(document.body || document.documentElement, { childList: true, subtree: true })
      observeFeed()
    }
    else {
      feedObservers.forEach((_, root) => scan(root))
    }
  }

  void settingsReady.then(() => {
    watch([
      () => settings.value.originalMomentsUseBewlyFilters,
      () => settings.value.momentsFilterUpRecommendation,
      () => settings.value.momentsHideChargeExclusive,
      () => settings.value.momentsHideVideoReservation,
      () => settings.value.momentsHideLiveReservation,
      () => settings.value.momentsHideLiveDynamics,
      () => settings.value.momentsHideVideoDynamics,
      () => settings.value.momentsHideDrawDynamics,
      () => settings.value.momentsHideUgcSeasonDynamics,
      () => settings.value.momentsHideForwardDynamics,
      () => settings.value.momentsHidePgcDynamics,
      () => settings.value.momentsHideArticleDynamics,
      () => settings.value.momentsEnableKeywordFilter,
      () => settings.value.momentsBlockedKeywords,
    ], refresh, { immediate: true })
    // 注入层会在原生 history 方法执行前派发事件。
    const refreshAfterNavigation = () => queueMicrotask(refresh)
    window.addEventListener('pushstate', refreshAfterNavigation)
    window.addEventListener('replacestate', refreshAfterNavigation)
    window.addEventListener('popstate', refreshAfterNavigation)
  })
}
