import { BEWLY_WIDESCREEN_APPLIED, BEWLY_WIDESCREEN_USER_EXIT, isBewlyWidescreenActive, setBewlyWidescreenPlaylistOverride } from '~/utils/bewlyWidescreen'
import { i18n } from '~/utils/i18n'
import type { ImmersiveFeedFrameState } from '~/utils/immersiveFeed'
import {
  createImmersiveFeedMessage,
  ImmersiveFeedMessageType,
  isImmersiveFeedFrame,
  isImmersiveFeedMessage,
} from '~/utils/immersiveFeed'
import { injectCSS, isVideoOrBangumiPage } from '~/utils/main'

/**
 * 沉浸式模式 iframe 内的视频详情页：播放完全使用 B 站原生播放器，
 * 这里只把 Bewly 宽屏的「选集 / 推荐」面板换成首页推荐流，并在原生控制栏补充上一个 / 下一个，
 * 所有切换请求交给首页处理（首页更换 iframe 地址）。
 */

const PANEL_CLASS = 'bewly-immersive-feed-panel'
const CONTROL_CLASS = 'bewly-immersive-ctrl'
const CONTROL_BAR_SELECTOR = '.bpx-player-control-bottom-left'
const PLAY_BUTTON_SELECTOR = '.bpx-player-ctrl-play'
// 滚轮只在画面区域切换视频；控制栏、音量等弹层保留原生滚轮行为
const WHEEL_AREA_SELECTOR = '.bpx-player-video-area'
const WHEEL_EXCLUDE_SELECTOR = '.bpx-player-control-wrap, .bpx-player-sending-area, [class*="popover"], [class*="panel"]'
const WHEEL_SWITCH_THRESHOLD = 40
const WHEEL_SWITCH_COOLDOWN_MS = 600
// 等待原生自动开播生效后再检查，避免与 B 站自身的开播逻辑互相切换暂停
const AUTO_START_DELAY_MS = 500

// 与原生控制栏图标相同的 28 网格面性图形
const previousIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><path d="M8 7.5a1 1 0 0 1 1 1v11a1 1 0 1 1-2 0v-11a1 1 0 0 1 1-1Zm12.4.7a1 1 0 0 1 .6.92v9.76a1 1 0 0 1-1.58.81l-7.1-4.88a1 1 0 0 1 0-1.65l7.1-4.88a1 1 0 0 1 .98-.08Z" fill="#fff"/></svg>`
const nextIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><path d="M20 7.5a1 1 0 0 1 1 1v11a1 1 0 1 1-2 0v-11a1 1 0 0 1 1-1ZM7.6 8.2a1 1 0 0 1 .98.08l7.1 4.88a1 1 0 0 1 0 1.65l-7.1 4.88A1 1 0 0 1 7 18.88V9.12a1 1 0 0 1 .6-.92Z" fill="#fff"/></svg>`

let state: ImmersiveFeedFrameState = {
  items: [],
  loading: true,
  noMoreContent: false,
  hasPrevious: false,
  hasNext: false,
}
let panel: HTMLElement | null = null
let list: HTMLElement | null = null
let footer: HTMLElement | null = null
let renderedKeys = ''
let renderedCurrentKey: string | undefined
let controlSyncQueued = false
let wheelDelta = 0
let wheelLockedUntil = 0
let autoStartChecked = false
let hasPlayed = false
let shownPosted = false

function t(key: string) {
  return String(i18n.global.t(key))
}

function postToHost(type: ImmersiveFeedMessageType, key?: string) {
  window.parent.postMessage(createImmersiveFeedMessage(type, key ? { key } : {}), location.origin)
}

function createFeedPanel() {
  panel = document.createElement('div')
  panel.className = PANEL_CLASS

  const hint = document.createElement('div')
  hint.className = `${PANEL_CLASS}__hint`
  hint.textContent = t('home.immersive_shortcut_hint')

  list = document.createElement('div')
  list.className = `${PANEL_CLASS}__list`
  list.setAttribute('role', 'list')

  footer = document.createElement('div')
  footer.className = `${PANEL_CLASS}__footer`

  panel.append(hint, list, footer)

  // 列表末尾进入视口时请求首页继续加载推荐
  new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting) && !state.loading && !state.noMoreContent)
      postToHost(ImmersiveFeedMessageType.LoadMore)
  }, { rootMargin: '400px 0px' }).observe(footer)

  return panel
}

function createCard(item: ImmersiveFeedFrameState['items'][number]) {
  const card = document.createElement('a')
  card.className = `${PANEL_CLASS}__card`
  card.href = `/video/${item.bvid}/`
  card.dataset.key = item.key
  card.setAttribute('role', 'listitem')
  card.title = item.title

  const cover = document.createElement('div')
  cover.className = `${PANEL_CLASS}__cover`
  if (item.cover) {
    const image = document.createElement('img')
    image.src = `${item.cover.replace(/^https?:/, '')}@320w_180h_1c`
    image.alt = ''
    image.loading = 'lazy'
    image.decoding = 'async'
    cover.appendChild(image)
  }
  const badge = document.createElement('span')
  badge.className = `${PANEL_CLASS}__badge`
  badge.dataset.duration = item.durationStr ?? ''
  badge.textContent = item.durationStr ?? ''
  cover.appendChild(badge)

  const body = document.createElement('div')
  body.className = `${PANEL_CLASS}__body`
  const title = document.createElement('span')
  title.className = `${PANEL_CLASS}__title`
  title.textContent = item.title
  const author = document.createElement('span')
  author.className = `${PANEL_CLASS}__meta`
  author.textContent = item.author
  body.append(title, author)
  if (item.viewStr) {
    const view = document.createElement('span')
    view.className = `${PANEL_CLASS}__meta`
    view.textContent = `${t('home.immersive_views')} ${item.viewStr}`
    body.appendChild(view)
  }

  card.append(cover, body)
  card.addEventListener('click', (event) => {
    // 保留中键 / 修饰键在新标签页打开原视频
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return
    event.preventDefault()
    postToHost(ImmersiveFeedMessageType.Select, item.key)
  })
  return card
}

function syncCurrentCard() {
  if (!list)
    return
  for (const card of Array.from(list.children) as HTMLElement[]) {
    const current = card.dataset.key === state.currentKey
    card.classList.toggle(`${PANEL_CLASS}__card--current`, current)
    if (current)
      card.setAttribute('aria-current', 'true')
    else
      card.removeAttribute('aria-current')
    const badge = card.querySelector<HTMLElement>(`.${PANEL_CLASS}__badge`)
    if (badge)
      badge.textContent = current ? t('home.immersive_now_playing') : badge.dataset.duration ?? ''
  }

  if (renderedCurrentKey === state.currentKey)
    return
  renderedCurrentKey = state.currentKey
  const currentCard = list.querySelector<HTMLElement>(`.${PANEL_CLASS}__card--current`)
  currentCard?.scrollIntoView({ block: 'nearest' })
}

function renderPanel() {
  if (!list || !footer)
    return

  const keys = state.items.map(item => item.key).join('\n')
  if (keys !== renderedKeys) {
    const existing = new Map((Array.from(list.children) as HTMLElement[]).map(card => [card.dataset.key, card]))
    const fragment = document.createDocumentFragment()
    for (const item of state.items)
      fragment.appendChild(existing.get(item.key) ?? createCard(item))
    list.replaceChildren(fragment)
    renderedKeys = keys
  }
  syncCurrentCard()

  footer.textContent = state.loading
    ? t('home.immersive_loading')
    : state.noMoreContent ? t('home.immersive_no_more') : ''
}

function createControlButton(type: 'previous' | 'next') {
  const button = document.createElement('div')
  button.className = `bpx-player-ctrl-btn ${CONTROL_CLASS} ${CONTROL_CLASS}-${type}`
  button.setAttribute('role', 'button')
  button.tabIndex = 0
  const label = t(type === 'previous' ? 'home.immersive_previous' : 'home.immersive_next')
  button.setAttribute('aria-label', label)
  button.title = `${label} (${type === 'previous' ? '↑ / W' : '↓ / S'})`
  button.innerHTML = `<div class="bpx-player-ctrl-btn-icon"><span class="bpx-common-svg-icon">${type === 'previous' ? previousIcon : nextIcon}</span></div>`

  const trigger = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    if (button.getAttribute('aria-disabled') === 'true')
      return
    postToHost(type === 'previous' ? ImmersiveFeedMessageType.Previous : ImmersiveFeedMessageType.Next)
  }
  button.addEventListener('click', trigger)
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ')
      trigger(event)
  })
  return button
}

function syncControlButtonState() {
  document.querySelectorAll<HTMLElement>(`.${CONTROL_CLASS}-previous`).forEach((button) => {
    button.setAttribute('aria-disabled', String(!state.hasPrevious))
  })
  document.querySelectorAll<HTMLElement>(`.${CONTROL_CLASS}-next`).forEach((button) => {
    button.setAttribute('aria-disabled', String(!state.hasNext))
  })
}

function ensureControlButtons() {
  controlSyncQueued = false
  const controlBar = document.querySelector<HTMLElement>(CONTROL_BAR_SELECTOR)
  const playButton = controlBar?.querySelector<HTMLElement>(PLAY_BUTTON_SELECTOR)
  if (!controlBar || !playButton)
    return

  if (playButton.previousElementSibling?.classList.contains(`${CONTROL_CLASS}-previous`)
    && playButton.nextElementSibling?.classList.contains(`${CONTROL_CLASS}-next`)) {
    return
  }

  controlBar.querySelectorAll(`.${CONTROL_CLASS}`).forEach(button => button.remove())
  playButton.before(createControlButton('previous'))
  playButton.after(createControlButton('next'))
  syncControlButtonState()
}

function queueControlSync() {
  if (controlSyncQueued)
    return
  controlSyncQueued = true
  requestAnimationFrame(ensureControlButtons)
}

function isEditableTarget(event: Event) {
  const target = event.composedPath()[0]
  if (!(target instanceof HTMLElement))
    return false
  const tagName = target.tagName.toLowerCase()
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

// 沉浸式模式下 ↑↓ 用于切换视频（替代原生音量快捷键），W / S 与 PageUp / PageDown 同理
function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event))
    return

  let type: ImmersiveFeedMessageType | undefined
  switch (event.key) {
    case 'ArrowUp':
    case 'PageUp':
    case 'w':
    case 'W':
      type = ImmersiveFeedMessageType.Previous
      break
    case 'ArrowDown':
    case 'PageDown':
    case 's':
    case 'S':
      type = ImmersiveFeedMessageType.Next
      break
  }
  if (!type)
    return

  event.preventDefault()
  event.stopImmediatePropagation()
  if (!event.repeat)
    postToHost(type)
}

function handleWheel(event: WheelEvent) {
  const target = event.composedPath()[0]
  if (!(target instanceof Element) || !target.closest(WHEEL_AREA_SELECTOR) || target.closest(WHEEL_EXCLUDE_SELECTOR))
    return
  if (event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX))
    return

  event.preventDefault()
  event.stopImmediatePropagation()
  const now = performance.now()
  if (now < wheelLockedUntil)
    return

  wheelDelta += event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY
  if (Math.abs(wheelDelta) < WHEEL_SWITCH_THRESHOLD)
    return

  postToHost(wheelDelta > 0 ? ImmersiveFeedMessageType.Next : ImmersiveFeedMessageType.Previous)
  wheelDelta = 0
  wheelLockedUntil = now + WHEEL_SWITCH_COOLDOWN_MS
}

function handleMediaEnded(event: Event) {
  // 原生播放器的视频元素可能被替换，捕获阶段统一监听；循环播放不会触发 ended
  if (event.target instanceof HTMLVideoElement)
    postToHost(ImmersiveFeedMessageType.Ended)
}

// 沉浸式模式切换到视频后应直接开播；用户关闭了 B 站「自动开播」时，用原生播放按钮补一次开播
function handleMediaCanPlay(event: Event) {
  const video = event.target
  if (autoStartChecked || !(video instanceof HTMLVideoElement))
    return
  autoStartChecked = true
  window.setTimeout(() => {
    // 原生续播会先跳到上次进度，因此以是否播放过判断，而不是 currentTime
    if (!video.isConnected || !video.paused || video.played.length > 0)
      return
    const playButton = document.querySelector<HTMLElement>(PLAY_BUTTON_SELECTOR)
    if (playButton)
      playButton.click()
    else
      void video.play().catch(() => {})
  }, AUTO_START_DELAY_MS)
}

// 宽屏会在开播时提前撤下自身 loading，此时布局可能仍未完成；
// 两者都就绪后再通知首页撤下遮罩，避免露出未整理的原始视频页
function notifyShownWhenReady() {
  if (shownPosted || !hasPlayed || !isBewlyWidescreenActive())
    return
  shownPosted = true
  postToHost(ImmersiveFeedMessageType.Shown)
}

function handleMediaPlaying(event: Event) {
  if (!(event.target instanceof HTMLVideoElement))
    return
  hasPlayed = true
  notifyShownWhenReady()
}

function handleHostMessage(event: MessageEvent) {
  if (event.source !== window.parent || event.origin !== location.origin || !isImmersiveFeedMessage(event.data))
    return
  if (event.data.type !== ImmersiveFeedMessageType.State || !event.data.state)
    return

  state = event.data.state
  renderPanel()
  syncControlButtonState()
}

function injectStyle() {
  injectCSS(`
    /* 原生分 P / 列表的上一个、下一个与首页推荐流的切换语义冲突，沉浸式模式中隐藏 */
    .bpx-player-ctrl-prev,
    .bpx-player-ctrl-next {
      display: none !important;
    }

    .${CONTROL_CLASS}[aria-disabled="true"] {
      opacity: 0.36;
      cursor: not-allowed;
    }

    .${PANEL_CLASS} {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .${PANEL_CLASS}__hint {
      padding: 0 8px 4px;
      color: var(--bewly-widescreen-text-muted, #9499a0);
      font-size: 12px;
      line-height: 16px;
    }

    .${PANEL_CLASS}__list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .${PANEL_CLASS}__card {
      display: grid;
      grid-template-columns: 144px minmax(0, 1fr);
      gap: 12px;
      padding: 8px;
      border-radius: 12px;
      color: var(--bewly-widescreen-text-primary, #18191c);
      text-decoration: none;
      transition: background-color 150ms ease;
    }

    .${PANEL_CLASS}__card:hover {
      background: var(--bewly-widescreen-control-bg, #f1f2f3);
    }

    .${PANEL_CLASS}__card--current,
    .${PANEL_CLASS}__card--current:hover {
      background: color-mix(in oklab, var(--bew-theme-color, #00aeec), transparent 88%);
    }

    .${PANEL_CLASS}__card--current .${PANEL_CLASS}__title {
      color: var(--bew-theme-color, #00aeec);
    }

    .${PANEL_CLASS}__cover {
      position: relative;
      overflow: hidden;
      aspect-ratio: 16 / 9;
      border-radius: 8px;
      background: var(--bewly-widescreen-control-bg, #f1f2f3);
    }

    .${PANEL_CLASS}__cover img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .${PANEL_CLASS}__badge {
      position: absolute;
      right: 4px;
      bottom: 4px;
      padding: 0 4px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      font-size: 12px;
      line-height: 16px;
    }

    .${PANEL_CLASS}__badge:empty {
      display: none;
    }

    .${PANEL_CLASS}__card--current .${PANEL_CLASS}__badge {
      background: var(--bew-theme-color, #00aeec);
    }

    .${PANEL_CLASS}__body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .${PANEL_CLASS}__title {
      display: -webkit-box;
      overflow: hidden;
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      word-break: break-word;
    }

    .${PANEL_CLASS}__meta {
      overflow: hidden;
      color: var(--bewly-widescreen-text-muted, #9499a0);
      font-size: 12px;
      line-height: 16px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .${PANEL_CLASS}__footer {
      min-height: 40px;
      padding: 12px 0;
      color: var(--bewly-widescreen-text-muted, #9499a0);
      font-size: 12px;
      line-height: 16px;
      text-align: center;
    }
  `)
}

export function initImmersiveFeedFrame() {
  if (!isImmersiveFeedFrame() || !isVideoOrBangumiPage())
    return

  injectStyle()
  setBewlyWidescreenPlaylistOverride({
    label: t('home.immersive_feed_title'),
    element: createFeedPanel(),
  })

  window.addEventListener('message', handleHostMessage)
  window.addEventListener('keydown', handleKeydown, { capture: true })
  window.addEventListener('wheel', handleWheel, { capture: true, passive: false })
  document.addEventListener('ended', handleMediaEnded, true)
  document.addEventListener('canplay', handleMediaCanPlay, true)
  document.addEventListener('playing', handleMediaPlaying, true)
  window.addEventListener(BEWLY_WIDESCREEN_APPLIED, notifyShownWhenReady)
  // 宽屏的「退出」按钮与 Esc 都会派发用户退出事件，沉浸式模式中直接返回首页
  window.addEventListener(BEWLY_WIDESCREEN_USER_EXIT, () => postToHost(ImmersiveFeedMessageType.Close))

  const startControlObserver = () => {
    queueControlSync()
    new MutationObserver(queueControlSync).observe(document.body, { childList: true, subtree: true })
  }
  if (document.body)
    startControlObserver()
  else
    document.addEventListener('DOMContentLoaded', startControlObserver, { once: true })

  postToHost(ImmersiveFeedMessageType.Ready)
}
