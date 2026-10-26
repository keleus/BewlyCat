import { watch } from 'vue'

import { settings, settingsReady } from '~/logic'
import { i18n } from '~/utils/i18n'

import {
  isOriginalMomentsFeed,
  ORIGINAL_MOMENTS_CARD_SELECTOR,
  ORIGINAL_MOMENTS_FEED_SELECTOR,
} from './originalMomentsFeed'

const COMMENT_CONTAINER_SELECTOR = '.bili-comment-container, .bb-comment'
const COMMENT_ACTION_SELECTOR = '.bili-dyn-action.comment'
const COLLAPSE_BUTTON_CLASS = 'bewly-original-moments-fold-comment'
const NATIVE_COLLAPSE_BUTTON_SELECTOR = '.fold-comment'
const CARD_SCROLL_OFFSET = 75

function getCollapseLabel() {
  const locale = settings.value.language || i18n.global.locale.value
  return String(i18n.global.t('moment_card.collapse_comments', {}, { locale }))
}

function updateCollapseButtonLabel(button: HTMLButtonElement) {
  button.textContent = getCollapseLabel()
}

function getCard(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>(ORIGINAL_MOMENTS_CARD_SELECTOR) ?? null
}

function getCommentAction(card: HTMLElement): HTMLElement | null {
  return card.querySelector<HTMLElement>(COMMENT_ACTION_SELECTOR)
}

export function setupOriginalMomentsFoldComments() {
  if (location.hostname !== 't.bilibili.com')
    return

  const feedObservers = new Map<HTMLElement, MutationObserver>()
  const dedupeObservers = new Map<HTMLElement, MutationObserver>()
  const pendingContainers = new Set<HTMLElement>()
  let pageObserver: MutationObserver | undefined
  let pendingFrame: number | undefined
  let feedRefreshFrame: number | undefined

  function ensureButton(container: HTMLElement) {
    if (!container.isConnected || !container.closest(ORIGINAL_MOMENTS_FEED_SELECTOR))
      return

    const card = getCard(container)
    if (!card || container.parentElement?.closest(COMMENT_CONTAINER_SELECTOR))
      return

    const existingButton = container.querySelector<HTMLButtonElement>(`:scope > .${COLLAPSE_BUTTON_CLASS}`)
    // 已有 Bilibili-Evolved 的收起按钮时让位，避免同一评论区出现两个按钮。
    if (container.querySelector(NATIVE_COLLAPSE_BUTTON_SELECTOR)) {
      existingButton?.remove()
      stopDedupeObserver(container)
      return
    }
    if (existingButton) {
      updateCollapseButtonLabel(existingButton)
      if (!dedupeObservers.has(container))
        observeNativeCollapseButton(container, existingButton)
      return
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.className = COLLAPSE_BUTTON_CLASS
    updateCollapseButtonLabel(button)
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const action = getCommentAction(card)
      if (!action)
        return
      action.click()
      action.focus({ preventScroll: true })
      requestAnimationFrame(() => {
        if (!card.isConnected)
          return
        card.scrollIntoView({ block: 'start' })
        window.scrollBy({ top: -CARD_SCROLL_OFFSET })
      })
    })
    container.append(button)
    observeNativeCollapseButton(container, button)
  }

  function stopDedupeObserver(container: HTMLElement) {
    dedupeObservers.get(container)?.disconnect()
    dedupeObservers.delete(container)
  }

  // Bilibili-Evolved 可能晚于本功能注入按钮，出现后立即让位。
  function observeNativeCollapseButton(container: HTMLElement, button: HTMLButtonElement) {
    const observer = new MutationObserver(() => {
      const hasNativeButton = container.querySelector(NATIVE_COLLAPSE_BUTTON_SELECTOR) !== null
      if (hasNativeButton)
        button.remove()
      if (hasNativeButton || !button.isConnected)
        stopDedupeObserver(container)
    })
    observer.observe(container, { childList: true, subtree: true })
    dedupeObservers.set(container, observer)
  }

  function flushPendingContainers() {
    pendingFrame = undefined
    const containers = Array.from(pendingContainers)
    pendingContainers.clear()
    containers.forEach(ensureButton)
  }

  function queueContainer(container: HTMLElement) {
    pendingContainers.add(container)
    if (pendingFrame === undefined)
      pendingFrame = requestAnimationFrame(flushPendingContainers)
  }

  function queueFromAddedNode(node: Node) {
    if (!(node instanceof Element))
      return
    if (node instanceof HTMLElement && node.matches(COMMENT_CONTAINER_SELECTOR)) {
      queueContainer(node)
      return
    }
    if (node.closest(COMMENT_CONTAINER_SELECTOR))
      return
    node.querySelectorAll<HTMLElement>(COMMENT_CONTAINER_SELECTOR).forEach(queueContainer)
  }

  function cleanupRemovedNode(node: Node) {
    if (!(node instanceof Element))
      return
    if (node instanceof HTMLElement && node.matches(COMMENT_CONTAINER_SELECTOR)) {
      stopDedupeObserver(node)
      return
    }
    if (node.closest(COMMENT_CONTAINER_SELECTOR))
      return
    node.querySelectorAll<HTMLElement>(COMMENT_CONTAINER_SELECTOR).forEach(stopDedupeObserver)
  }

  // 只关注评论容器的增删；评论加载、排序等容器内部变更无需重复注入。
  function handleMutations(mutations: MutationRecord[]) {
    for (const mutation of mutations) {
      mutation.removedNodes.forEach(cleanupRemovedNode)
      mutation.addedNodes.forEach(queueFromAddedNode)
    }
  }

  function pruneDedupeObservers() {
    for (const [container, observer] of dedupeObservers) {
      if (container.isConnected)
        continue
      observer.disconnect()
      dedupeObservers.delete(container)
    }
  }

  function observeFeed() {
    const roots = new Set(Array.from(document.querySelectorAll<HTMLElement>(ORIGINAL_MOMENTS_FEED_SELECTOR)))
    let rootsChanged = false

    for (const [root, observer] of feedObservers) {
      if (!roots.has(root)) {
        observer.disconnect()
        feedObservers.delete(root)
        rootsChanged = true
      }
    }
    for (const root of roots) {
      if (feedObservers.has(root))
        continue
      const observer = new MutationObserver(handleMutations)
      observer.observe(root, { childList: true, subtree: true })
      feedObservers.set(root, observer)
      rootsChanged = true
    }

    if (!rootsChanged)
      return
    pruneDedupeObservers()
    roots.forEach(root => root.querySelectorAll<HTMLElement>(COMMENT_CONTAINER_SELECTOR).forEach(queueContainer))
  }

  function scheduleObserveFeed() {
    if (feedRefreshFrame !== undefined)
      return
    feedRefreshFrame = requestAnimationFrame(() => {
      feedRefreshFrame = undefined
      observeFeed()
    })
  }

  function teardown() {
    pageObserver?.disconnect()
    pageObserver = undefined
    feedObservers.forEach(observer => observer.disconnect())
    feedObservers.clear()
    dedupeObservers.forEach(observer => observer.disconnect())
    dedupeObservers.clear()
    if (pendingFrame !== undefined) {
      cancelAnimationFrame(pendingFrame)
      pendingFrame = undefined
    }
    if (feedRefreshFrame !== undefined) {
      cancelAnimationFrame(feedRefreshFrame)
      feedRefreshFrame = undefined
    }
    pendingContainers.clear()
    document.querySelectorAll<HTMLElement>(`.${COLLAPSE_BUTTON_CLASS}`).forEach(button => button.remove())
  }

  function refresh() {
    if (!isOriginalMomentsFeed()) {
      teardown()
      return
    }

    if (!pageObserver) {
      pageObserver = new MutationObserver((mutations) => {
        if (mutations.some(mutation => !Array.from(feedObservers.keys()).some(root => root.contains(mutation.target))))
          scheduleObserveFeed()
      })
      pageObserver.observe(document.body || document.documentElement, { childList: true, subtree: true })
    }
    observeFeed()
  }

  void settingsReady.then(() => {
    refresh()
    watch([() => settings.value.language, i18n.global.locale], () => {
      document.querySelectorAll<HTMLButtonElement>(`.${COLLAPSE_BUTTON_CLASS}`).forEach(updateCollapseButtonLabel)
    })
    // 注入层会在原生 history 方法执行前派发事件。
    const refreshAfterNavigation = () => queueMicrotask(refresh)
    window.addEventListener('pushstate', refreshAfterNavigation)
    window.addEventListener('replacestate', refreshAfterNavigation)
    window.addEventListener('popstate', refreshAfterNavigation)
    window.addEventListener('pageshow', refreshAfterNavigation)
  })
}
