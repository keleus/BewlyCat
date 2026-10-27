import { watch } from 'vue'

import { settings, settingsReady } from '~/logic'
import { findLeafActiveElement } from '~/utils/element'
import { i18n } from '~/utils/i18n'

import {
  isOriginalMomentsFeed,
  ORIGINAL_MOMENTS_CARD_SELECTOR,
  ORIGINAL_MOMENTS_FEED_SELECTOR,
} from './originalMomentsFeed'

const COMMENT_CONTAINER_SELECTOR = '.bili-comment-container, .bb-comment'
const FEED_COMMENT_CONTAINER_SELECTOR = `${ORIGINAL_MOMENTS_FEED_SELECTOR} :is(${COMMENT_CONTAINER_SELECTOR})`
const COMMENT_ACTION_SELECTOR = '.bili-dyn-action.comment'
const COLLAPSE_BUTTON_CLASS = 'bewly-original-moments-fold-comment'
const NATIVE_COLLAPSE_BUTTON_CLASS = 'fold-comment'
const NATIVE_COLLAPSE_BUTTON_SELECTOR = `.${NATIVE_COLLAPSE_BUTTON_CLASS}`
// 与 B-E 一致：滚动到卡片时为吸顶导航留出高度。
const CARD_SCROLL_OFFSET = 75
const BLANK_LAYOUT_SELECTOR = [
  'html',
  'body',
  '#app',
  '#app .bg',
  '#app .bgc',
  '.bili-dyn-home--member',
  '.bili-dyn-home--visitor',
  'main',
  'aside',
  '.bili-dyn-list',
  '.bili-dyn-list__items',
].join(',')
// 侧栏、发布区等内容卡片；点击落在卡片内或其矩形范围内都不算空白。
const BLANK_CLICK_CONTENT_CARD_SELECTORS = [
  '.bili-dyn-my-info',
  '.bili-dyn-my-info--skeleton',
  '.bili-dyn-live-users',
  '.bili-dyn-banner',
  '.bili-dyn-topic-box',
  '.bili-dyn-search-trendings',
  '.topic-panel',
  '.bili-dyn-up-list',
  '.bili-dyn-publishing',
  '.bili-dyn-list-tabs',
]
const BLANK_CLICK_CONTENT_CARD_SELECTOR = BLANK_CLICK_CONTENT_CARD_SELECTORS.join(',')

// 侧栏卡片、页头页脚、浮层和可交互元素内的点击都不算空白。
const BLANK_CLICK_EXCLUDED_SELECTOR = [
  '#bewly',
  '#bili-header-container',
  '#biliMainHeader',
  '#biliMainFooter',
  'header',
  'footer',
  'nav',
  '.bili-header',
  '.bili-footer',
  '.be-settings',
  '.side-toolbar',
  ...BLANK_CLICK_CONTENT_CARD_SELECTORS,
  '.bili-album__watch',
  '.bili-dialog-bomb',
  '.modal-wrapper',
  '.pswp',
  '[aria-modal="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="dialog"]',
  '[role="link"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="option"]',
  '[role="slider"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
  '[contenteditable="true"]',
  'a',
  'audio',
  'button',
  'input',
  'label',
  'select',
  'summary',
  'textarea',
  'video',
].join(',')

function isPointInsideContentCard(x: number, y: number) {
  const elements = document.querySelectorAll<HTMLElement>(BLANK_CLICK_CONTENT_CARD_SELECTOR)
  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0
      && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return true
    }
  }
  return false
}

function getCollapseLabel() {
  const locale = settings.value.language || i18n.global.locale.value
  return String(i18n.global.t('moment_card.collapse_comments', {}, { locale }))
}

function updateCollapseButtonLabel(button: HTMLButtonElement) {
  const label = getCollapseLabel()
  if (button.textContent !== label)
    button.textContent = label
}

function getCard(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>(ORIGINAL_MOMENTS_CARD_SELECTOR) ?? null
}

function getCommentAction(card: HTMLElement): HTMLElement | null {
  return card.querySelector<HTMLElement>(COMMENT_ACTION_SELECTOR)
}

function scrollCardIntoView(card: HTMLElement) {
  if (!card.isConnected)
    return
  card.scrollIntoView({ block: 'start' })
  window.scrollBy({ top: -CARD_SCROLL_OFFSET })
}

function getRenderedRect(element: Element) {
  if (!element.isConnected)
    return null
  if (typeof element.checkVisibility === 'function') {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      return null
  }
  else {
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      return null
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 ? rect : null
}

function isElementInViewport(element: Element) {
  const rect = getRenderedRect(element)
  return rect !== null && rect.bottom > 0 && rect.top < window.innerHeight
}

function isCommentActionExpanded(action: HTMLElement) {
  // 原生 comment action 的 active class 即评论面板展开状态。
  return action.classList.contains('active')
}

function collapseVisibleComments(clickY: number) {
  const actions = new Set<HTMLElement>()
  const candidates: Array<{ card: HTMLElement, distance: number }> = []

  document.querySelectorAll<HTMLElement>(FEED_COMMENT_CONTAINER_SELECTOR).forEach((container) => {
    if (container.parentElement?.closest(COMMENT_CONTAINER_SELECTOR))
      return
    const card = getCard(container)
    const action = card ? getCommentAction(card) : null
    if (!card || !action || !isCommentActionExpanded(action) || !isElementInViewport(container))
      return
    actions.add(action)
    const rect = card.getBoundingClientRect()
    const distance = clickY < rect.top ? rect.top - clickY : clickY > rect.bottom ? clickY - rect.bottom : 0
    candidates.push({ card, distance })
  })

  actions.forEach((action) => {
    if (action.isConnected)
      action.click()
  })

  let primaryCard: HTMLElement | undefined
  let primaryDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    if (candidate.distance < primaryDistance) {
      primaryCard = candidate.card
      primaryDistance = candidate.distance
    }
  }
  return primaryCard
}

function isBlankAreaClick(event: MouseEvent) {
  if (!event.isTrusted || event.button !== 0 || event.detail === 0)
    return false
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return false
  if (event.clientX >= document.documentElement.clientWidth || event.clientY >= document.documentElement.clientHeight)
    return false

  const target = event.target instanceof Element ? event.target : null
  if (!target || target.closest(BLANK_CLICK_EXCLUDED_SELECTOR) || target.closest(ORIGINAL_MOMENTS_CARD_SELECTOR))
    return false
  if (!target.matches(BLANK_LAYOUT_SELECTOR) && getComputedStyle(target).cursor === 'pointer')
    return false

  const selection = window.getSelection()
  if (selection && !selection.isCollapsed)
    return false

  // 目标不在卡片、评论、侧栏卡片或交互元素内，且不落在内容卡片矩形上，即视为空白区域。
  return !isPointInsideContentCard(event.clientX, event.clientY)
}

function isEditableElement(element: Element) {
  return element instanceof HTMLElement
    && (element.isContentEditable
      || element.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') !== null)
}

export function setupOriginalMomentsFoldComments() {
  if (location.hostname !== 't.bilibili.com')
    return

  const feedObservers = new Map<HTMLElement, MutationObserver>()
  const pendingContainers = new Set<HTMLElement>()
  let pageObserver: MutationObserver | undefined
  let pendingFrame: number | undefined
  let feedRefreshFrame: number | undefined
  let blankClickEnabled = false
  let suppressBlankClick = false
  let actionClickEnabled = false

  function removeCardFoldButtons(card: HTMLElement) {
    card.querySelectorAll<HTMLButtonElement>(`.${COLLAPSE_BUTTON_CLASS}`).forEach(button => button.remove())
  }

  function ensureButton(container: HTMLElement) {
    if (!isOriginalMomentsFeed() || !container.isConnected || !container.closest(ORIGINAL_MOMENTS_FEED_SELECTOR))
      return

    const card = getCard(container)
    if (!card || container.parentElement?.closest(COMMENT_CONTAINER_SELECTOR))
      return

    if (!settings.value.originalMomentsShowFoldCommentsButton) {
      removeCardFoldButtons(card)
      return
    }

    const cardButton = card.querySelector<HTMLButtonElement>(`.${COLLAPSE_BUTTON_CLASS}`)
    // 已有 Bilibili-Evolved 的收起按钮时让位，避免同一评论区出现两个按钮。
    if (card.querySelector(NATIVE_COLLAPSE_BUTTON_SELECTOR)) {
      removeCardFoldButtons(card)
      return
    }

    const action = getCommentAction(card)
    if (!action || !isCommentActionExpanded(action)) {
      removeCardFoldButtons(card)
      return
    }
    if (cardButton) {
      if (cardButton.parentElement === container)
        updateCollapseButtonLabel(cardButton)
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
      if (!action || !isCommentActionExpanded(action))
        return
      action.click()
      action.focus({ preventScroll: true })
      requestAnimationFrame(() => scrollCardIntoView(card))
    })
    container.append(button)
  }

  function flushPendingContainers() {
    pendingFrame = undefined
    const containers = Array.from(pendingContainers)
    pendingContainers.clear()
    containers.forEach(ensureButton)
  }

  function queueContainer(container: HTMLElement) {
    if (!settings.value.originalMomentsShowFoldCommentsButton)
      return
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

  function handleNativeFoldButton(node: HTMLElement) {
    const card = getCard(node)
    if (card)
      removeCardFoldButtons(card)
  }

  // B-E 的按钮会直接追加到评论容器，直接在 feed 观察器里识别，避免为每个容器单独挂观察器。
  function handleMutations(mutations: MutationRecord[]) {
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : null
      if (target instanceof HTMLElement && target.matches(COMMENT_CONTAINER_SELECTOR)) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement
            && (node.classList.contains(NATIVE_COLLAPSE_BUTTON_CLASS)
              || node.querySelector(NATIVE_COLLAPSE_BUTTON_SELECTOR) !== null)) {
            handleNativeFoldButton(node)
          }
        })
        // 评论组件会在转发/评论面板切换时增删直接子节点，借此同步按钮。
        queueContainer(target)
      }
      if (target?.closest(COMMENT_CONTAINER_SELECTOR))
        continue
      mutation.addedNodes.forEach(queueFromAddedNode)
    }
  }

  function isObservedFeedNode(node: Node) {
    for (const root of feedObservers.keys()) {
      if (root.contains(node))
        return true
    }
    return false
  }

  function observeFeed() {
    const roots = new Set(Array.from(document.querySelectorAll<HTMLElement>(ORIGINAL_MOMENTS_FEED_SELECTOR)))
    let rootsChanged = false

    for (const [root, observer] of feedObservers) {
      if (!roots.has(root)) {
        observer.disconnect()
        feedObservers.delete(root)
        root.querySelectorAll<HTMLElement>(`.${COLLAPSE_BUTTON_CLASS}`).forEach(button => button.remove())
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

  function handleBlankAreaPointerDown(event: PointerEvent) {
    if (event.button !== 0)
      return
    // 用空白点击清空选区或让输入框/编辑器失焦时，不应顺手收起评论。
    const selection = window.getSelection()
    const activeElement = findLeafActiveElement(document)
    suppressBlankClick = (selection !== null && !selection.isCollapsed)
      || (activeElement !== undefined && isEditableElement(activeElement))
  }

  function handleBlankAreaClick(event: MouseEvent) {
    const suppressed = suppressBlankClick
    suppressBlankClick = false
    if (suppressed || !isBlankAreaClick(event))
      return
    const card = collapseVisibleComments(event.clientY)
    if (!card)
      return
    requestAnimationFrame(() => {
      if (!card.isConnected)
        return
      const rect = card.getBoundingClientRect()
      if (rect.bottom > 0 && rect.top < window.innerHeight)
        return
      scrollCardIntoView(card)
    })
  }

  function syncCardFoldButtons(card: HTMLElement) {
    card.querySelectorAll<HTMLElement>(COMMENT_CONTAINER_SELECTOR).forEach(queueContainer)
  }

  function handleActionClick(event: MouseEvent) {
    if (!isOriginalMomentsFeed())
      return
    const target = event.target instanceof Element ? event.target : null
    const action = target?.closest<HTMLElement>('.bili-dyn-action')
    if (!action || !action.matches('.comment, .forward'))
      return
    const card = getCard(action)
    if (!card)
      return
    requestAnimationFrame(() => {
      if (card.isConnected)
        syncCardFoldButtons(card)
    })
  }

  function setActionClickEnabled(enabled: boolean) {
    if (enabled === actionClickEnabled)
      return
    actionClickEnabled = enabled
    if (enabled)
      document.addEventListener('click', handleActionClick, { capture: true, passive: true })
    else
      document.removeEventListener('click', handleActionClick, true)
  }

  function setBlankClickEnabled(enabled: boolean) {
    if (enabled === blankClickEnabled)
      return
    blankClickEnabled = enabled
    if (enabled) {
      document.addEventListener('pointerdown', handleBlankAreaPointerDown, { capture: true, passive: true })
      document.addEventListener('click', handleBlankAreaClick, { passive: true })
    }
    else {
      document.removeEventListener('pointerdown', handleBlankAreaPointerDown, true)
      document.removeEventListener('click', handleBlankAreaClick)
      suppressBlankClick = false
    }
  }

  function syncBlankClick() {
    setBlankClickEnabled(settings.value.originalMomentsClickBlankToFoldComments && isOriginalMomentsFeed())
  }

  function stopFeedObservation() {
    pageObserver?.disconnect()
    pageObserver = undefined
    feedObservers.forEach(observer => observer.disconnect())
    feedObservers.clear()
    if (pendingFrame !== undefined) {
      cancelAnimationFrame(pendingFrame)
      pendingFrame = undefined
    }
    if (feedRefreshFrame !== undefined) {
      cancelAnimationFrame(feedRefreshFrame)
      feedRefreshFrame = undefined
    }
    pendingContainers.clear()
    setActionClickEnabled(false)
    document.querySelectorAll<HTMLElement>(`.${COLLAPSE_BUTTON_CLASS}`).forEach(button => button.remove())
  }

  function syncFoldButtons() {
    if (!settings.value.originalMomentsShowFoldCommentsButton) {
      stopFeedObservation()
      return
    }
    refresh()
  }

  function teardown() {
    stopFeedObservation()
    setBlankClickEnabled(false)
  }

  function refresh() {
    if (!isOriginalMomentsFeed()) {
      teardown()
      return
    }

    syncBlankClick()
    if (!settings.value.originalMomentsShowFoldCommentsButton) {
      stopFeedObservation()
      return
    }

    setActionClickEnabled(true)
    if (!pageObserver) {
      pageObserver = new MutationObserver((mutations) => {
        if (mutations.some(mutation => !isObservedFeedNode(mutation.target)))
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
    watch(() => settings.value.originalMomentsShowFoldCommentsButton, syncFoldButtons)
    watch(() => settings.value.originalMomentsClickBlankToFoldComments, syncBlankClick)
    // 注入层会在原生 history 方法执行前派发事件。
    const refreshAfterNavigation = () => queueMicrotask(refresh)
    window.addEventListener('pushstate', refreshAfterNavigation)
    window.addEventListener('replacestate', refreshAfterNavigation)
    window.addEventListener('popstate', refreshAfterNavigation)
    window.addEventListener('pageshow', refreshAfterNavigation)
  })
}
