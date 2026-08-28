import { watch } from 'vue'
import browser from 'webextension-polyfill'

import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'

import { injectCSS } from './main'
import { isPhotoViewerOpen } from './photoViewer'
import { getVideoElement } from './player'

function t(key: string, params: Record<string, unknown> = {}) {
  return String(i18n.global.t(key, params))
}

type BewlyWidescreenTab = 'comment' | 'danmaku' | 'playlist'
type BewlyWidescreenSidebarMode = 'fit' | 'narrow'

interface MovedNode {
  node: HTMLElement
  placeholder: Comment
}

interface BewlyWidescreenState {
  root: HTMLElement
  playerSlot: HTMLElement
  playerFrame: HTMLElement
  danmakuDock: HTMLElement
  sidebarEl: HTMLElement
  sidebarTop: HTMLElement
  infoSlot: HTMLElement
  upSlot: HTMLElement
  toolbarSlot: HTMLElement
  descriptionSlot: HTMLElement
  tagsSlot: HTMLElement
  panels: Record<BewlyWidescreenTab, HTMLElement>
  tabButtons: Record<BewlyWidescreenTab, HTMLButtonElement>
  sidebarToggleButton: HTMLButtonElement
  movedNodes: MovedNode[]
  styleEl: HTMLStyleElement
  activeTab: BewlyWidescreenTab
  sidebarMode: BewlyWidescreenSidebarMode
  sidebarPosition: 'left' | 'right'
  resizeObserver?: ResizeObserver
  mutationObserver?: MutationObserver
  metadataListener?: () => void
  resizeSyncTimers?: Array<ReturnType<typeof setTimeout>>
  sidebarInteractionCleanup?: () => void
  sidebarToggleAutoHideCleanup?: () => void
  descriptionCleanup?: () => void
  escapeKeyCleanup?: () => void
  descriptionExpanded: boolean
}

const ROOT_ID = 'bewly-widescreen-root'
const LOADING_ROOT_ID = 'bewly-widescreen-loading'
const SWITCH_HINT_ID = 'bewly-widescreen-switch-hint'
export const BEWLY_WIDESCREEN_USER_EXIT = 'bewly-widescreen-user-exit'
const BODY_CLASS = 'bewly-widescreen-active'
const EMPTY_CLASS = 'bewly-widescreen-empty'
const EPISODE_SECTION_CLASS = 'bewly-widescreen-episode-section'
const EPISODE_ITEM_SELECTOR = '.video-pod__item, .multi-page__item, .page-item, .list-item, .episode-item, .section-item, .collect-item, [class*="PlayerEpisodePanel_episodeRow"], [class*="EpisodeVirtualList_numberItem"], [class*="EpisodeVirtualList_listItem"]'
const BANGUMI_EPISODE_LIST_ROOT_SELECTOR = '[class*="PaginatedEpList_root"]'
const BANGUMI_PLAYLIST_ROOT_SELECTOR = `${BANGUMI_EPISODE_LIST_ROOT_SELECTOR}, [class*="SectionPanel_panel"]`
const BANGUMI_PLAYLIST_SKELETON_SELECTOR = '[class*="SectionSkeleton_panel"], [aria-label="选集加载中"]'
const BANGUMI_PLAYLIST_READY_SELECTOR = '[class*="SectionPanel_panel"], [class*="SectionHeader_header"], [class*="EpisodeVirtualList_scroll"], [class*="PlayerEpisodePanel_episodeRow"]'
const REACT_EVENT_BRIDGE_ATTRIBUTE = 'data-bewly-react-bridge'
const SIDEBAR_NARROW_MIN_WIDTH = 360
const SIDEBAR_NARROW_MAX_WIDTH = 460
const MOBILE_BREAKPOINT = 900
const LOAD_SETTLE_DELAY = 1200
const LOADING_FADE_DURATION = 240
const SWITCH_HINT_FADE_DURATION = 180
const SWITCH_HINT_TIMEOUT = 6000
const LOADING_EXIT_BUTTON_DELAY = 5000
const PREPARED_LOADING_TIMEOUT = 30_000
const READY_RETRY_INTERVAL = 500
const READY_RETRY_MAX = 30
const SIDEBAR_REFRESH_DELAY = 800
const SIDEBAR_TOGGLE_IDLE_DELAY = 1000
const BILIBILI_ACTION_ANIMATION_HUE = 196
const COMMENT_ROOT_ID_SELECTOR = '#comment-module, #comment-body, #commentapp'
const COMMENT_TIME_SELECTOR = '.reply-time, .sub-reply-time, .reply-time-location'
const COMMENT_NESTED_UI_SELECTOR = '.reply-item, .sub-reply-item, bili-comment-renderer'
// Light-DOM markers only. Modern bili-comments mounts most UI in shadow roots,
// so readiness must not require these descendants to exist.
const COMMENT_CONTENT_MARKER_SELECTOR = 'bili-comments, bili-comment-box, bili-comment-renderer, .reply-list, .comment-list, .reply-box, .comment-header'
const NATIVE_PLAYER_MODE_BUTTON_SELECTOR = [
  '.bpx-player-ctrl-wide',
  '.bilibili-player-video-btn-widescreen',
  '.squirtle-video-widescreen',
  '.bpx-player-ctrl-web',
  '.bilibili-player-video-web-fullscreen',
  '.squirtle-video-pagefullscreen',
  '.bpx-player-ctrl-full',
  '.bilibili-player-video-btn-fullscreen',
  '.squirtle-video-fullscreen',
].join(', ')

let state: BewlyWidescreenState | null = null
let loadingOverlay: HTMLElement | null = null
let loadingStyleEl: HTMLStyleElement | null = null
let loadingLocaleWatchStop: (() => void) | undefined
let loadingFadeTimer: ReturnType<typeof setTimeout> | undefined
let loadingExitButtonTimer: ReturnType<typeof setTimeout> | undefined
let loadingPlaybackCleanup: (() => void) | undefined
let loadingEscapeCleanup: (() => void) | undefined
let loadingPreparationFallbackTimer: ReturnType<typeof setTimeout> | undefined
let loadingSuppressedUntilExit = false
let switchHint: HTMLElement | null = null
let switchHintStyleEl: HTMLStyleElement | null = null
let switchHintTimer: ReturnType<typeof setTimeout> | undefined
let readyRetryTimer: ReturnType<typeof setTimeout> | undefined
let loadFallbackTimer: ReturnType<typeof setTimeout> | undefined
let sidebarRefreshTimer: ReturnType<typeof setTimeout> | undefined
let pageLoadHandler: (() => void) | undefined
let readyRetryCount = 0
let waitingForLoad = false
let pendingSidebarPosition: 'left' | 'right' = 'right'
let nativePlayerModeGuardInstalled = false

const selectors = {
  player: [
    '#playerWrap',
    '#bilibili-player',
    '#bilibiliPlayer',
    '.bpx-player-container',
    '.player-wrap',
  ],
  title: [
    '.video-title',
    'h1.video-title',
    '.video-info-title h1',
    '.bpx-player-top-title',
    '[class*="mediainfo_mediaTitle"]',
    '#viewbox_report .title',
    'h1[title]',
  ],
  info: [
    '.video-info-detail-list',
    '.video-info-detail-content',
  ],
  upPanel: [
    '.up-panel-container',
    '.up-info-container',
    '.up-info',
    '.upinfo',
  ],
  toolbar: [
    '#arc_toolbar_report',
    '.video-toolbar-container',
  ],
  description: [
    '#v_desc',
    '.video-desc-container',
  ],
  tags: [
    '.video-tag-container',
    '#v_tag',
  ],
  danmakuInput: [
    '.bpx-player-sending-bar',
    '.bilibili-player-video-sendbar',
    '.bilibili-player-video-inputbar',
  ],
  danmakuFocusable: [
    '.danmaku-wrap .bui-collapse-header',
    '.danmaku-box .bui-collapse-header',
    '.danmaku-wrap .bpx-player-dm-setting-left',
    '.danmaku-box .bpx-player-dm-setting-left',
  ],
  comment: [
    '#comment-module',
    '#comment-body',
    '#commentapp',
    '.commentapp',
    '.comment-container',
    '.bili-comment-container',
    '.bb-comment',
  ],
  danmaku: [
    '#danmukuBox',
    '[class*="DanmukuBox_wrap"]',
    '.danmaku-box',
    '.danmaku-wrap',
    '.bpx-player-dm-wrap',
  ],
  playlist: [
    // Watch Later and Favorites use this inner list. Their `.playlist-container`
    // is the page-level layout and must stay outside the widescreen sidebar.
    '.action-list-container',
    '[class*="eplist_ep_list_wrapper"]',
    '#eplist_module',
    '[class*="numberList_wrapper"]',
    '[class*="imageList_wrap"]',
    // Current bangumi pages hydrate a page-level episode module in the right
    // column. Prefer that over the player's lazily created episode popover.
    '[class*="PaginatedEpList_root"]',
    '.video-pod',
    '.video-pod__body',
    '.multi-page',
    '.multi-page-v1',
    '.base-video-sections-v1',
    '.video-sections-v1',
    '.video-sections-content-list',
    '[class*="PlayerEpisodePanel_panel"]',
  ],
  playlistControls: [
    '.auto-play',
    '.continuous-btn',
  ],
  recommend: [
    '[class*="recommend_wrap"]',
    '.recommend-list-v1',
    '.recommend-list',
    '.rec-list',
    '.next-play',
  ],
}

function findFirst(selectors: string[], root: ParentNode = document): HTMLElement | null {
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector)
    if (element)
      return element
  }
  return null
}

function findMovable(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
    const element = candidates.find(candidate =>
      !candidate.closest(`#${ROOT_ID}`)
      && candidate.parentNode
      && candidate.offsetParent !== null,
    ) || candidates.find(candidate => !candidate.closest(`#${ROOT_ID}`) && candidate.parentNode)

    if (element)
      return element
  }
  return null
}

function isBangumiPlaylistSkeleton(node: HTMLElement) {
  if (!node.matches(BANGUMI_PLAYLIST_ROOT_SELECTOR) && !node.querySelector(BANGUMI_PLAYLIST_ROOT_SELECTOR))
    return false

  return !!node.querySelector(BANGUMI_PLAYLIST_SKELETON_SELECTOR)
    && !node.querySelector(BANGUMI_PLAYLIST_READY_SELECTOR)
}

function closestBangumiEpisodeListRoot(node: HTMLElement) {
  return node.closest<HTMLElement>(BANGUMI_EPISODE_LIST_ROOT_SELECTOR)
}

function isDetachedBangumiSection(node: HTMLElement) {
  return node.matches('[class*="SectionPanel_panel"]') && !closestBangumiEpisodeListRoot(node)
}

function resolvePlaylistMoveTarget(node: HTMLElement) {
  const root = closestBangumiEpisodeListRoot(node)
  if (root && !root.closest(`#${ROOT_ID}`))
    return root
  return node
}

function bindReactEventBridge(node: HTMLElement) {
  node.setAttribute(REACT_EVENT_BRIDGE_ATTRIBUTE, 'true')
}

function unbindReactEventBridge(node: HTMLElement) {
  node.removeAttribute(REACT_EVENT_BRIDGE_ATTRIBUTE)
}

function findMovablePlaylist() {
  for (const selector of selectors.playlist) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
    const element = candidates.find(candidate =>
      !candidate.closest(`#${ROOT_ID}`)
      && candidate.parentNode
      && candidate.offsetParent !== null
      && !isBangumiPlaylistSkeleton(candidate),
    ) || candidates.find(candidate =>
      !candidate.closest(`#${ROOT_ID}`)
      && candidate.parentNode
      && !isBangumiPlaylistSkeleton(candidate),
    )

    if (element)
      return resolvePlaylistMoveTarget(element)
  }
  return null
}

function isLikelyCommentRoot(candidate: HTMLElement) {
  if (candidate.closest(COMMENT_NESTED_UI_SELECTOR))
    return false

  const parentCommentRoot = candidate.parentElement?.closest<HTMLElement>(selectors.comment.join(','))
  if (parentCommentRoot)
    return false

  if (candidate.matches(`${COMMENT_ROOT_ID_SELECTOR}, .commentapp`))
    return true

  return !!candidate.querySelector(COMMENT_CONTENT_MARKER_SELECTOR)
}

function findCommentRoot(root: ParentNode = document, excludeWidescreenRoot = false): HTMLElement | null {
  const candidates: HTMLElement[] = []

  for (const selector of selectors.comment) {
    for (const candidate of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
      if (excludeWidescreenRoot && candidate.closest(`#${ROOT_ID}`))
        continue
      if (!isLikelyCommentRoot(candidate))
        continue
      candidates.push(candidate)
    }
  }

  return candidates.find(candidate => candidate.offsetParent !== null) ?? candidates[0] ?? null
}

function moveNode(node: HTMLElement | null, target: HTMLElement, movedNodes: MovedNode[], allowInsideLayout = false) {
  if (!node || (!allowInsideLayout && node.closest(`#${ROOT_ID}`)))
    return false

  if (target.contains(node))
    return false

  const parent = node.parentNode
  if (!parent)
    return false

  const placeholder = document.createComment('bewly-widescreen-placeholder')
  parent.insertBefore(placeholder, node)
  target.appendChild(node)
  movedNodes.push({ node, placeholder })
  return true
}

function moveMatchingNodes(selectors: string[], target: HTMLElement, movedNodes: MovedNode[], limit = 8) {
  let moved = 0
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
    for (const candidate of candidates) {
      if (moved >= limit)
        return moved
      if (candidate.closest(`#${ROOT_ID}`) || !candidate.parentNode || target.contains(candidate))
        continue

      if (moveNode(candidate, target, movedNodes)) {
        moved++
        continue
      }
    }
  }
  return moved
}

function restoreMovedNode(node: HTMLElement, movedNodes: MovedNode[]) {
  const index = movedNodes.findIndex(movedNode => movedNode.node === node)
  if (index < 0)
    return false

  const [movedNode] = movedNodes.splice(index, 1)
  unbindReactEventBridge(movedNode.node)
  const parent = movedNode.placeholder.parentNode
  if (parent)
    parent.insertBefore(movedNode.node, movedNode.placeholder)
  movedNode.placeholder.remove()
  return true
}

function restoreMovedNodes(movedNodes: MovedNode[]) {
  for (const { node, placeholder } of [...movedNodes].reverse()) {
    unbindReactEventBridge(node)
    const parent = placeholder.parentNode
    if (parent) {
      parent.insertBefore(node, placeholder)
      placeholder.remove()
    }
  }
  movedNodes.length = 0
}

function removeMovedNode(node: HTMLElement, movedNodes: MovedNode[]) {
  const index = movedNodes.findIndex(movedNode => movedNode.node === node)
  if (index >= 0) {
    const [movedNode] = movedNodes.splice(index, 1)
    movedNode.placeholder.remove()
  }

  node.remove()
}

function moveOrReplaceNode(selectors: string[], target: HTMLElement, movedNodes: MovedNode[], allowInsideLayout = false) {
  const existing = findFirst(selectors, target)
  const next = allowInsideLayout
    ? findFirst(selectors, target) || findMovable(selectors)
    : findMovable(selectors)

  if (existing && next && existing !== next) {
    removeMovedNode(existing, movedNodes)
    const moved = moveNode(next, target, movedNodes, allowInsideLayout)
    return { found: moved, changed: moved }
  }

  if (existing)
    return { found: true, changed: false }

  const moved = moveNode(next, target, movedNodes, allowInsideLayout)
  return { found: moved, changed: moved }
}

function hasCommentShadowTree(root: HTMLElement) {
  return Array.from(root.querySelectorAll('*')).some((element) => {
    const shadowRoot = (element as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot
    return !!shadowRoot
  })
}

function isCommentRootUsable(root: HTMLElement) {
  if (!root.isConnected)
    return false

  // B 站会先创建空评论壳，再异步挂载 bili-comments / shadow DOM。提前搬走
  // 空壳会与它的初始化竞争，导致头像、编辑器或评论列表漏渲染。
  if (root.querySelector(COMMENT_CONTENT_MARKER_SELECTOR))
    return true

  return hasCommentShadowTree(root)
}

function moveCommentRoot(target: HTMLElement, movedNodes: MovedNode[]) {
  // Once mounted, keep the same root. Replacing it in response to a body
  // mutation can race Bilibili's renderer and create another comment editor.
  const existing = findCommentRoot(target)
  if (existing)
    return { found: true, changed: false }

  const next = findCommentRoot(document, true)
  if (!next || !isCommentRootUsable(next))
    return { found: false, changed: false }

  const moved = moveNode(next, target, movedNodes)
  return { found: moved, changed: moved }
}

function movePlaylistControls(target: HTMLElement, movedNodes: MovedNode[]) {
  if (findFirst(selectors.playlistControls, target))
    return true

  if (!findFirst(selectors.playlist, target) && !findMovable(selectors.playlist))
    return false

  const control = findMovable(selectors.playlistControls)
  const playlistSelector = selectors.playlist.join(',')
  let playlistRoot = control?.closest<HTMLElement>(playlistSelector)
  while (playlistRoot?.parentElement) {
    const parentPlaylistRoot = playlistRoot.parentElement.closest<HTMLElement>(playlistSelector)
    if (!parentPlaylistRoot || parentPlaylistRoot === playlistRoot)
      break
    playlistRoot = parentPlaylistRoot
  }
  const controlRow = playlistRoot ?? control?.parentElement
  if (!controlRow || controlRow === document.body)
    return false

  // The autoplay switch and the episode list are siblings in Bilibili's
  // eplist layout. Move their original row so its listeners and adjacent
  // controls (such as random play) remain intact.
  return moveNode(controlRow, target, movedNodes)
}

function createPanelEmpty(label: string) {
  const empty = document.createElement('div')
  empty.className = EMPTY_CLASS
  empty.textContent = label
  return empty
}

function setActiveTab(nextTab: BewlyWidescreenTab) {
  if (!state)
    return

  state.activeTab = nextTab
  for (const [tab, button] of Object.entries(state.tabButtons) as Array<[BewlyWidescreenTab, HTMLButtonElement]>) {
    const active = tab === nextTab
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-selected', String(active))
    state.panels[tab].hidden = !active
  }

  if (nextTab === 'danmaku')
    expandDanmakuTab(state)
}

function setSidebarMode(nextMode: BewlyWidescreenSidebarMode) {
  if (!state)
    return

  state.sidebarMode = nextMode
  state.root.dataset.sidebarMode = nextMode
  const isFit = nextMode === 'fit'
  const isRight = state.sidebarPosition === 'right'
  state.sidebarToggleButton.textContent = isRight
    ? (isFit ? '‹' : '›')
    : (isFit ? '›' : '‹')
  state.sidebarToggleButton.title = isFit
    ? (isRight ? t('widescreen.show_narrow_right') : t('widescreen.show_narrow_left'))
    : (isRight ? t('widescreen.collapse_right') : t('widescreen.collapse_left'))
  state.sidebarToggleButton.setAttribute('aria-label', state.sidebarToggleButton.title)
  updateSidebarLayoutState()
  schedulePlayerResizeSync(state)
}

function getTitleText() {
  const titleElement = findFirst(selectors.title)
  const title = titleElement?.getAttribute('title') || titleElement?.textContent?.trim()
  if (title)
    return title

  const metaTitle = document.querySelector<HTMLMetaElement>('meta[itemprop="name"], meta[property="og:title"]')?.content
  return metaTitle?.replace(/_哔哩哔哩_bilibili$/, '') || document.title.replace(/_哔哩哔哩_bilibili$/, '')
}

function createSidebarTitle() {
  const title = document.createElement('div')
  title.className = 'bewly-widescreen-title'
  title.textContent = getTitleText()
  return title
}

function createSidebarToolbar() {
  const toolbar = document.createElement('div')
  toolbar.className = 'bewly-widescreen-toolbar'

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'bewly-widescreen-close'
  closeButton.textContent = t('widescreen.exit')
  closeButton.title = t('widescreen.exit_title')
  closeButton.setAttribute('aria-label', closeButton.title)
  closeButton.addEventListener('click', () => exitBewlyWidescreen({ userInitiated: true }))

  toolbar.append(createSidebarTitle(), closeButton)
  return toolbar
}

function createTabButton(tab: BewlyWidescreenTab, label: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bewly-widescreen-tab'
  button.textContent = label
  button.setAttribute('role', 'tab')
  button.addEventListener('click', () => setActiveTab(tab))
  return button
}

function createSidebarToggleButton() {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bewly-widescreen-sidebar-toggle'
  button.addEventListener('click', () => {
    setSidebarMode(state?.sidebarMode === 'fit' ? 'narrow' : 'fit')
  })
  return button
}

function getLoadingGifUrl() {
  try {
    return browser.runtime.getURL('/assets/loading.gif')
  }
  catch {
    return ''
  }
}

function removeSwitchHint(immediate = false) {
  if (switchHintTimer) {
    clearTimeout(switchHintTimer)
    switchHintTimer = undefined
  }

  const hint = switchHint
  const styleEl = switchHintStyleEl
  switchHint = null
  switchHintStyleEl = null
  if (!hint && !styleEl)
    return

  const remove = () => {
    hint?.remove()
    styleEl?.remove()
  }
  if (immediate || !hint) {
    remove()
    return
  }

  hint.classList.add('is-leaving')
  setTimeout(remove, SWITCH_HINT_FADE_DURATION)
}

export function showBewlyWidescreenSwitchHint(label: string) {
  removeWidescreenLoading(true)

  if (switchHint?.isConnected) {
    const labelElement = switchHint.querySelector<HTMLElement>('.bewly-widescreen-switch-hint-label')
    if (labelElement)
      labelElement.textContent = label
    switchHint.classList.remove('is-leaving')
    switchHint.classList.add('is-visible')
    if (switchHintTimer)
      clearTimeout(switchHintTimer)
    switchHintTimer = setTimeout(() => removeSwitchHint(), SWITCH_HINT_TIMEOUT)
    return
  }

  removeSwitchHint(true)
  document.querySelectorAll(`#${SWITCH_HINT_ID}`).forEach(element => element.remove())
  switchHintStyleEl = injectCSS(`
    #${SWITCH_HINT_ID} {
      position: fixed;
      left: 50%;
      top: 50%;
      z-index: 2147482999;
      display: flex;
      max-width: calc(100vw - 24px);
      align-items: center;
      gap: var(--bew-space-2, 8px);
      padding: var(--bew-space-2, 8px);
      color: #fff;
      background: transparent;
      border: 0;
      font-family: var(--bew-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      opacity: 0;
      pointer-events: none;
      transform: translate(-50%, calc(-50% + 4px));
      transition: opacity ${SWITCH_HINT_FADE_DURATION}ms ease, transform ${SWITCH_HINT_FADE_DURATION}ms ease;
    }

    #${SWITCH_HINT_ID}.is-visible {
      opacity: 1;
      transform: translate(-50%, -50%);
    }

    #${SWITCH_HINT_ID}.is-leaving {
      opacity: 0;
      transform: translate(-50%, calc(-50% - 4px));
    }

    #${SWITCH_HINT_ID} .bewly-widescreen-switch-hint-icon {
      width: 36px;
      height: 36px;
      flex: 0 0 auto;
      object-fit: contain;
    }

    #${SWITCH_HINT_ID} .bewly-widescreen-switch-hint-label {
      min-width: 0;
      font-size: var(--bew-font-size-control, 13px);
      font-weight: var(--bew-font-weight-medium, 500);
      line-height: var(--bew-line-height-control, 18px);
      overflow-wrap: anywhere;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 8px rgba(0, 0, 0, 0.72);
    }
  `)

  const hint = document.createElement('div')
  hint.id = SWITCH_HINT_ID
  hint.setAttribute('role', 'status')
  hint.setAttribute('aria-live', 'polite')

  const loadingGifUrl = getLoadingGifUrl()
  if (loadingGifUrl) {
    const icon = document.createElement('img')
    icon.className = 'bewly-widescreen-switch-hint-icon'
    icon.src = loadingGifUrl
    icon.alt = ''
    icon.setAttribute('aria-hidden', 'true')
    hint.appendChild(icon)
  }

  const labelElement = document.createElement('span')
  labelElement.className = 'bewly-widescreen-switch-hint-label'
  labelElement.textContent = label
  hint.appendChild(labelElement)

  const mountTarget = document.body ?? document.documentElement
  mountTarget.appendChild(hint)
  switchHint = hint
  requestAnimationFrame(() => hint.classList.add('is-visible'))
  switchHintTimer = setTimeout(() => removeSwitchHint(), SWITCH_HINT_TIMEOUT)
}

function showWidescreenLoading() {
  if (loadingOverlay)
    return

  loadingStyleEl = injectCSS(`
    #${LOADING_ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: var(--bew-space-3, 12px);
      overflow: hidden;
      color: var(--bew-text-2, #61666d);
      background: var(--bew-bg, #f6f7f8);
      font-family: var(--bew-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      opacity: 1;
      transition: opacity ${LOADING_FADE_DURATION}ms ease;
    }

    html.dark #${LOADING_ROOT_ID} {
      color: var(--bew-text-2, #c9ccd0);
      background: var(--bew-bg, #17181a);
    }

    #${LOADING_ROOT_ID}.is-leaving {
      opacity: 0;
      pointer-events: none;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-content {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      line-height: 20px;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit {
      min-height: var(--bew-control-height, 36px);
      padding: var(--bew-space-2, 8px) var(--bew-space-4, 16px);
      border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
      border-radius: var(--bew-interactive-radius, 8px);
      color: inherit;
      background: color-mix(in srgb, currentColor 8%, transparent);
      cursor: pointer;
      font: inherit;
      font-size: var(--bew-font-size-control, 13px);
      font-weight: var(--bew-font-weight-medium, 500);
      line-height: var(--bew-line-height-control, 18px);
      transition: background-color 150ms ease, border-color 150ms ease;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit:hover {
      border-color: var(--bew-theme-color, #00aeec);
      color: var(--bew-theme-color, #00aeec);
      background: color-mix(in srgb, var(--bew-theme-color, #00aeec) 12%, transparent);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-exit:focus-visible {
      outline: 2px solid var(--bew-theme-color-40, rgba(0, 174, 236, 0.4));
      outline-offset: var(--bew-space-0-5, 2px);
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-icon {
      width: 36px;
      height: 36px;
      object-fit: contain;
      flex-shrink: 0;
    }
  `)

  const overlay = document.createElement('div')
  overlay.id = LOADING_ROOT_ID
  overlay.setAttribute('role', 'status')
  overlay.setAttribute('aria-live', 'polite')

  const content = document.createElement('div')
  content.className = 'bewly-widescreen-loading-content'

  const loadingGifUrl = getLoadingGifUrl()
  if (loadingGifUrl) {
    const icon = document.createElement('img')
    icon.className = 'bewly-widescreen-loading-icon'
    icon.src = loadingGifUrl
    icon.alt = ''
    icon.setAttribute('aria-hidden', 'true')
    content.appendChild(icon)
  }

  const label = document.createElement('span')
  content.appendChild(label)

  const exitButton = document.createElement('button')
  exitButton.type = 'button'
  exitButton.className = 'bewly-widescreen-loading-exit'
  exitButton.hidden = true
  exitButton.addEventListener('click', () => exitBewlyWidescreen({ userInitiated: true }))

  // 遮罩可能在设置水合、App 挂载之前创建，文案需跟随 locale 变化刷新。
  const syncLoadingTexts = () => {
    label.textContent = t('widescreen.loading')
    exitButton.textContent = t('widescreen.exit_overlay')
  }
  syncLoadingTexts()
  loadingLocaleWatchStop?.()
  loadingLocaleWatchStop = watch(i18n.global.locale, syncLoadingTexts)

  overlay.append(content, exitButton)
  const mountTarget = document.body ?? document.documentElement
  mountTarget.appendChild(overlay)
  loadingOverlay = overlay

  loadingExitButtonTimer = setTimeout(() => {
    loadingExitButtonTimer = undefined
    if (loadingOverlay === overlay && overlay.isConnected)
      exitButton.hidden = false
  }, LOADING_EXIT_BUTTON_DELAY)

  const handlePlaying = (event: Event) => {
    const video = event.target
    if (video instanceof HTMLVideoElement
      && video === getVideoElement()) {
      dismissWidescreenLoadingForPlaying()
    }
  }
  document.addEventListener('playing', handlePlaying, true)
  loadingPlaybackCleanup = () => {
    document.removeEventListener('playing', handlePlaying, true)
    loadingPlaybackCleanup = undefined
  }

  const handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape')
      return
    if (isPhotoViewerOpen())
      return

    event.preventDefault()
    event.stopPropagation()
    exitBewlyWidescreen({ userInitiated: true })
  }
  document.addEventListener('keydown', handleEscapeKey, true)
  loadingEscapeCleanup = () => {
    document.removeEventListener('keydown', handleEscapeKey, true)
    loadingEscapeCleanup = undefined
  }
}

function dismissWidescreenLoadingForPlaying() {
  loadingSuppressedUntilExit = true
  removeWidescreenLoading()
}

function removeWidescreenLoading(immediate = false) {
  loadingPlaybackCleanup?.()
  loadingEscapeCleanup?.()
  loadingLocaleWatchStop?.()
  loadingLocaleWatchStop = undefined

  if (loadingExitButtonTimer) {
    clearTimeout(loadingExitButtonTimer)
    loadingExitButtonTimer = undefined
  }

  if (loadingPreparationFallbackTimer) {
    clearTimeout(loadingPreparationFallbackTimer)
    loadingPreparationFallbackTimer = undefined
  }

  if (loadingFadeTimer) {
    clearTimeout(loadingFadeTimer)
    loadingFadeTimer = undefined
  }

  const overlay = loadingOverlay
  const styleEl = loadingStyleEl
  if (!overlay && !styleEl)
    return

  const remove = () => {
    overlay?.remove()
    styleEl?.remove()
    if (loadingOverlay === overlay)
      loadingOverlay = null
    if (loadingStyleEl === styleEl)
      loadingStyleEl = null
    loadingFadeTimer = undefined
  }

  if (immediate || !overlay) {
    remove()
    return
  }

  requestAnimationFrame(() => overlay.classList.add('is-leaving'))
  loadingFadeTimer = setTimeout(remove, LOADING_FADE_DURATION)
}

export function isBewlyWidescreenEngaged() {
  return !!state || waitingForLoad || !!readyRetryTimer || !!loadingOverlay
}

function findNativePlayerModeButton(event: Event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  for (const node of path) {
    if (node instanceof HTMLElement && node.matches(NATIVE_PLAYER_MODE_BUTTON_SELECTOR))
      return node
  }

  return event.target instanceof Element
    ? event.target.closest<HTMLElement>(NATIVE_PLAYER_MODE_BUTTON_SELECTOR)
    : null
}

function isNativePlayerModeButtonEntered(button: HTMLElement) {
  return button.classList.contains('bpx-state-entered')
    || !!button.closest('[data-screen="web"], [data-screen="wide"]')
    || !!document.fullscreenElement
    || !!(document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement
}

function handleNativePlayerModeInteraction(event: Event) {
  if (!isBewlyWidescreenEngaged())
    return
  if (event instanceof MouseEvent && event.button !== 0)
    return

  const button = findNativePlayerModeButton(event)
  if (!button)
    return

  const alreadyEntered = isNativePlayerModeButtonEntered(button)
  const isBrowserFullscreenButton = button.matches('.bpx-player-ctrl-full, .bilibili-player-video-btn-fullscreen, .squirtle-video-fullscreen')

  // Native web/wide/full modes cannot apply while Bewly widescreen owns the
  // player layout. Exit first so the same gesture takes effect immediately.
  exitBewlyWidescreen({ userInitiated: true })

  if (alreadyEntered || isBrowserFullscreenButton)
    return

  setTimeout(() => {
    if (!button.isConnected || isNativePlayerModeButtonEntered(button))
      return
    button.click()
  }, 0)
}

export function ensureNativePlayerModeGuard() {
  if (nativePlayerModeGuardInstalled)
    return

  nativePlayerModeGuardInstalled = true
  document.addEventListener('click', handleNativePlayerModeInteraction, true)
}

// 宽屏激活期间监听相关设置，改动即时生效（与侧栏位置不同：后者需重新进入宽屏）。
let settingsWatchersInstalled = false
function installSettingsWatchers() {
  if (settingsWatchersInstalled)
    return

  settingsWatchersInstalled = true
  watch(() => settings.value.bewlyWidescreenCenterVerticalVideo, () => {
    if (state)
      updateSidebarLayoutState()
  })
}

export function prepareBewlyWidescreenLoading() {
  ensureNativePlayerModeGuard()
  if (state || loadingSuppressedUntilExit)
    return

  const video = getVideoElement()
  if (video
    && !video.paused
    && !video.ended) {
    loadingSuppressedUntilExit = true
    removeWidescreenLoading(true)
    return
  }

  showWidescreenLoading()

  if (!loadingOverlay)
    return

  if (!loadingPreparationFallbackTimer) {
    loadingPreparationFallbackTimer = setTimeout(() => {
      loadingPreparationFallbackTimer = undefined
      loadingSuppressedUntilExit = true
      removeWidescreenLoading()
    }, PREPARED_LOADING_TIMEOUT)
  }
}

function createRoot(sidebarPosition: 'left' | 'right' = 'right') {
  const root = document.createElement('div')
  root.id = ROOT_ID
  root.dataset.sidebarPosition = sidebarPosition

  const stage = document.createElement('div')
  stage.className = 'bewly-widescreen-stage'

  const playerSlot = document.createElement('main')
  playerSlot.className = 'bewly-widescreen-player-slot'
  const playerFrame = document.createElement('div')
  playerFrame.className = 'bewly-widescreen-player-frame'
  const danmakuDock = document.createElement('div')
  danmakuDock.className = 'bewly-widescreen-danmaku-dock'
  const sidebarToggleButton = createSidebarToggleButton()
  playerSlot.append(playerFrame, danmakuDock, sidebarToggleButton)

  const sidebar = document.createElement('aside')
  sidebar.className = 'bewly-widescreen-sidebar'

  const sidebarTop = document.createElement('div')
  sidebarTop.className = 'bewly-widescreen-sidebar-top'
  const infoSlot = document.createElement('div')
  infoSlot.className = 'bewly-widescreen-info-slot'
  const upSlot = document.createElement('div')
  upSlot.className = 'bewly-widescreen-up-slot'
  const toolbarSlot = document.createElement('div')
  toolbarSlot.className = 'bewly-widescreen-action-slot'
  const descriptionSlot = document.createElement('div')
  descriptionSlot.className = 'bewly-widescreen-description-slot'
  const tagsSlot = document.createElement('div')
  tagsSlot.className = 'bewly-widescreen-tags-slot'
  sidebarTop.append(createSidebarToolbar(), infoSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot)

  const tablist = document.createElement('div')
  tablist.className = 'bewly-widescreen-tabs'
  tablist.setAttribute('role', 'tablist')

  const tabButtons = {
    comment: createTabButton('comment', t('widescreen.comments')),
    danmaku: createTabButton('danmaku', t('widescreen.danmaku')),
    playlist: createTabButton('playlist', t('widescreen.episodes')),
  }
  tablist.append(tabButtons.comment, tabButtons.danmaku, tabButtons.playlist)

  const panelWrap = document.createElement('div')
  panelWrap.className = 'bewly-widescreen-panels'

  const panels = {
    comment: document.createElement('section'),
    danmaku: document.createElement('section'),
    playlist: document.createElement('section'),
  }

  for (const [tab, panel] of Object.entries(panels) as Array<[BewlyWidescreenTab, HTMLElement]>) {
    panel.className = `bewly-widescreen-panel bewly-widescreen-panel-${tab}`
    panel.setAttribute('role', 'tabpanel')
    panelWrap.appendChild(panel)
  }

  sidebar.append(sidebarTop, tablist, panelWrap)
  if (sidebarPosition === 'left')
    stage.append(sidebar, playerSlot)
  else
    stage.append(playerSlot, sidebar)
  root.appendChild(stage)
  document.body.appendChild(root)

  return { root, playerSlot, playerFrame, danmakuDock, sidebarEl: sidebar, sidebarTop, infoSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, sidebarToggleButton }
}

function injectLayoutStyle() {
  return injectCSS(`
    body.${BODY_CLASS} {
      overflow: hidden !important;
      background: #0f1115 !important;
    }

    body.${BODY_CLASS} .bili-header,
    body.${BODY_CLASS} .fixed-sidenav-storage,
    body.${BODY_CLASS} .mini-player-window {
      display: none !important;
    }

    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 1000;
      color: #f4f6fb;
      background: #0f1115;
      font-family: var(--bew-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      --bewly-widescreen-sidebar-bg: #f7f8fa;
      --bewly-widescreen-surface-bg: #fff;
      --bewly-widescreen-text-primary: #18191c;
      --bewly-widescreen-text-secondary: #61666d;
      --bewly-widescreen-text-muted: #9499a0;
      --bewly-widescreen-sidebar-border: rgba(255, 255, 255, 0.08);
      --bewly-widescreen-divider: rgba(0, 0, 0, 0.08);
      --bewly-widescreen-control-bg: #f1f2f3;
      --bewly-widescreen-control-hover-bg: #e3e5e7;
      --bewly-widescreen-sidebar-narrow-width: clamp(
        ${SIDEBAR_NARROW_MIN_WIDTH}px,
        26vw,
        ${SIDEBAR_NARROW_MAX_WIDTH}px
      );
      --bewly-widescreen-sidebar-expanded-width: clamp(480px, 32vw, 600px);
      --bewly-widescreen-sidebar-max: 40vw;
      --bewly-widescreen-layout-aspect: 1.7777778;
      --bewly-widescreen-player-available-height: calc(100dvh - var(--bewly-widescreen-danmaku-height, 0px));
      --bewly-widescreen-player-target-width: calc(var(--bewly-widescreen-player-available-height) * var(--bewly-widescreen-layout-aspect));
      --bewly-widescreen-sidebar-fit-width: clamp(
        0px,
        calc(100vw - var(--bewly-widescreen-player-target-width)),
        var(--bewly-widescreen-sidebar-max)
      );
      --bewly-widescreen-sidebar-column-width: min(var(--bewly-widescreen-sidebar-narrow-width), var(--bewly-widescreen-sidebar-max));
      --bewly-widescreen-sidebar-panel-width: var(--bewly-widescreen-sidebar-column-width);
      --bewly-widescreen-sidebar-offset: 0px;
    }

    html.dark #${ROOT_ID} {
      --bewly-widescreen-sidebar-bg: var(--bew-content-alt-solid, #2f3238);
      --bewly-widescreen-surface-bg: var(--bew-content-solid, #2b2e33);
      --bewly-widescreen-text-primary: var(--bew-text-1, #f1f2f3);
      --bewly-widescreen-text-secondary: var(--bew-text-2, #c9ccd0);
      --bewly-widescreen-text-muted: var(--bew-text-3, #9499a0);
      --bewly-widescreen-sidebar-border: var(--bew-border-color, rgba(255, 255, 255, 0.08));
      --bewly-widescreen-divider: var(--bew-border-color, rgba(255, 255, 255, 0.08));
      --bewly-widescreen-control-bg: var(--bew-fill-1, rgba(255, 255, 255, 0.08));
      --bewly-widescreen-control-hover-bg: var(--bew-fill-2, rgba(255, 255, 255, 0.16));
    }

    #${ROOT_ID}[data-sidebar-mode="narrow"] {
      --bewly-widescreen-player-target-width: calc(100vw - var(--bewly-widescreen-sidebar-column-width));
    }

    #${ROOT_ID}[data-sidebar-mode="fit"] {
      --bewly-widescreen-sidebar-column-width: var(--bewly-widescreen-sidebar-fit-width);
      --bewly-widescreen-sidebar-panel-width: max(
        var(--bewly-widescreen-sidebar-fit-width),
        var(--bewly-widescreen-sidebar-expanded-width)
      );
      --bewly-widescreen-sidebar-offset: calc(
        var(--bewly-widescreen-sidebar-panel-width) - var(--bewly-widescreen-sidebar-column-width)
      );
    }

    #${ROOT_ID} * {
      box-sizing: border-box;
    }

    #${ROOT_ID} .bewly-widescreen-stage {
      display: grid;
      grid-template-columns:
        minmax(0, calc(100vw - var(--bewly-widescreen-sidebar-column-width)))
        minmax(0, var(--bewly-widescreen-sidebar-column-width));
      width: 100%;
      height: 100dvh;
      overflow: hidden;
    }

    #${ROOT_ID} .bewly-widescreen-player-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      min-width: 0;
      min-height: 0;
      padding: 0;
      background: #050609;
      overflow: hidden;
      gap: 0;
    }

    #${ROOT_ID} .bewly-widescreen-player-frame {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: var(--bewly-widescreen-player-available-height);
      flex: 0 1 var(--bewly-widescreen-player-available-height);
      overflow: hidden;
    }

    #${ROOT_ID} .bewly-widescreen-player-frame > * {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      max-height: 100% !important;
      aspect-ratio: auto !important;
      margin: 0 !important;
      flex: 0 1 auto;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-dock {
      width: 100% !important;
      max-width: 100%;
      min-height: 0;
      flex: 0 0 auto;
      background: var(--bewly-widescreen-surface-bg);
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-dock:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-danmaku-dock .bpx-player-sending-bar,
    #${ROOT_ID} .bewly-widescreen-danmaku-dock .bilibili-player-video-sendbar,
    #${ROOT_ID} .bewly-widescreen-danmaku-dock .bilibili-player-video-inputbar {
      position: relative !important;
      left: auto !important;
      right: auto !important;
      top: auto !important;
      bottom: auto !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      transform: none !important;
      box-shadow: none !important;
      z-index: auto !important;
    }

    #${ROOT_ID} #playerWrap,
    #${ROOT_ID} #bilibili-player,
    #${ROOT_ID} #bilibiliPlayer,
    #${ROOT_ID} .bpx-player-container,
    #${ROOT_ID} .player-wrap {
      position: relative !important;
      left: auto !important;
      top: auto !important;
      transform: none !important;
      box-shadow: none !important;
      filter: none !important;
      border: 0 !important;
      border-radius: 0 !important;
      outline: 0 !important;
      background: #000 !important;
      overflow: hidden !important;
    }

    #${ROOT_ID} #playerWrap::before,
    #${ROOT_ID} #playerWrap::after,
    #${ROOT_ID} .bpx-player-container::before,
    #${ROOT_ID} .bpx-player-container::after,
    #${ROOT_ID} .player-wrap::before,
    #${ROOT_ID} .player-wrap::after {
      box-shadow: none !important;
      filter: none !important;
    }

    #${ROOT_ID} .player-wrap *:not(.bili-danmaku-x-guide, .bili-danmaku-x-guide *),
    #${ROOT_ID} .bpx-player-container *:not(.bili-danmaku-x-guide, .bili-danmaku-x-guide *),
    #${ROOT_ID} .bpx-player-primary-area,
    #${ROOT_ID} .bpx-player-video-area,
    #${ROOT_ID} .bpx-player-video-wrap,
    #${ROOT_ID} .bilibili-player-video-wrap,
    #${ROOT_ID} .bilibili-player-video-area {
      border-top-color: transparent !important;
      border-bottom-color: transparent !important;
      box-shadow: none !important;
      filter: none !important;
      outline: 0 !important;
    }

    #${ROOT_ID} .player-wrap {
      clip-path: inset(1px 0 1px 0);
    }

    #${ROOT_ID} .player-wrap .bpx-player-shadow-progress-area,
    #${ROOT_ID} .player-wrap .bpx-player-video-area::before,
    #${ROOT_ID} .player-wrap .bpx-player-video-area::after,
    #${ROOT_ID} .player-wrap .bpx-player-primary-area::before,
    #${ROOT_ID} .player-wrap .bpx-player-primary-area::after {
      content: none !important;
      display: none !important;
      box-shadow: none !important;
      filter: none !important;
      border: 0 !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide:not(.bili-danmaku-x-guide-followed) .bili-danmaku-x-guide-follow,
    #${ROOT_ID} .bili-danmaku-x-guide-electric {
      background: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide:not(.bili-danmaku-x-guide-followed) .bili-danmaku-x-guide-follow:hover,
    #${ROOT_ID} .bili-danmaku-x-guide-electric:hover {
      background: color-mix(in srgb, var(--bew-theme-color, #00aeec) 82%, white) !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide-three {
      display: none !important;
    }

    #${ROOT_ID} .bili-danmaku-x-guide-cyc > span {
      filter: var(--bewly-widescreen-action-canvas-filter, none) !important;
    }

    #${ROOT_ID} .player-wrap > *,
    #${ROOT_ID} .bpx-player-container > * {
      border-radius: 0 !important;
    }

    #${ROOT_ID} #bilibili-player,
    #${ROOT_ID} #bilibiliPlayer,
    #${ROOT_ID} .bpx-player-container {
      width: 100% !important;
      height: 100% !important;
    }

    #${ROOT_ID} .bpx-player-primary-area,
    #${ROOT_ID} .bpx-player-video-area,
    #${ROOT_ID} .bpx-player-video-wrap,
    #${ROOT_ID} .bilibili-player-video-area,
    #${ROOT_ID} .bilibili-player-video-wrap {
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      max-height: 100% !important;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar {
      display: flex;
      flex-direction: column;
      justify-self: end;
      width: var(--bewly-widescreen-sidebar-panel-width);
      min-width: 0;
      min-height: 0;
      background: var(--bewly-widescreen-sidebar-bg);
      color: var(--bewly-widescreen-text-primary);
      border-left: 1px solid var(--bewly-widescreen-sidebar-border);
      box-shadow: -12px 0 28px rgba(0, 0, 0, 0.28);
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      transform: translateX(var(--bewly-widescreen-sidebar-offset));
      transition: transform 180ms ease;
      will-change: transform;
      z-index: 2002;
    }

    #${ROOT_ID}[data-sidebar-mode="narrow"] .bewly-widescreen-sidebar {
      box-shadow: none;
    }

    #${ROOT_ID}[data-sidebar-mode="fit"][data-sidebar-expanded="true"] .bewly-widescreen-sidebar {
      transform: translateX(0);
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-stage {
      grid-template-columns:
        minmax(0, var(--bewly-widescreen-sidebar-column-width))
        minmax(0, calc(100vw - var(--bewly-widescreen-sidebar-column-width)));
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar {
      justify-self: start;
      border-left: none;
      border-right: 1px solid var(--bewly-widescreen-sidebar-border);
      box-shadow: 12px 0 28px rgba(0, 0, 0, 0.28);
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-mode="narrow"] .bewly-widescreen-sidebar {
      box-shadow: none;
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-mode="fit"] {
      --bewly-widescreen-sidebar-offset: calc(
        var(--bewly-widescreen-sidebar-column-width) - var(--bewly-widescreen-sidebar-panel-width)
      );
    }

    @media (min-width: ${MOBILE_BREAKPOINT + 1}px) {
      /* 画面居中（需开启「画面居中」设置，且单侧黑边容得下最小可用侧栏，
         由 data-center-layout 在 JS 中按几何判定）：播放器列占满整行使画面在视口居中，
         侧栏完整占据画面一侧的黑边，无需悬停展开；黑边不足时不启用，避免压瘪侧栏。 */
      #${ROOT_ID}[data-center-layout="true"] {
        --bewly-widescreen-sidebar-panel-width: clamp(
          ${SIDEBAR_NARROW_MIN_WIDTH}px,
          calc((100vw - var(--bewly-widescreen-player-target-width)) / 2),
          var(--bewly-widescreen-sidebar-max)
        );
        --bewly-widescreen-sidebar-column-width: min(
          var(--bewly-widescreen-sidebar-panel-width),
          calc((100vw - var(--bewly-widescreen-player-target-width)) / 2)
        );
      }

      #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-stage {
        grid-template-columns: minmax(0, 100vw) 0px;
      }

      #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bewly-widescreen-stage {
        grid-template-columns: 0px minmax(0, 100vw);
      }

      /* 播放器容器延伸到侧栏边缘：控件贴齐侧栏不被遮挡，同时保住整块区域给
         进度条、点击暂停与「竖屏放大」的方形画面使用。子代 id 选择器用于压过
         下方「width: 100%」的双 id 特异性规则（移动根节点可能没有 #playerWrap）。 */
      #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame {
        justify-content: flex-start;
      }

      #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bewly-widescreen-player-frame {
        justify-content: flex-end;
      }

      #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > *,
      #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > #playerWrap,
      #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > #bilibili-player,
      #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > #bilibiliPlayer,
      #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > .bpx-player-container,
      #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > .player-wrap {
        width: min(calc(100vw - var(--bewly-widescreen-sidebar-panel-width)), 100%) !important;
      }

      /* 未放大时把视频层与弹幕层平移半个侧栏宽，使画面在视口居中；
         「竖屏放大」的方形裁切激活时改为受限位移——在不越出播放器容器
         （不被侧栏遮挡、不额外裁切）的前提下尽量靠拢视口中心。 */
      #${ROOT_ID}[data-center-layout="true"] .bpx-player-video-wrap,
      #${ROOT_ID}[data-center-layout="true"] .bilibili-player-video-wrap,
      #${ROOT_ID}[data-center-layout="true"] .bpx-player-dm-wrap {
        transform: translateX(calc(var(--bewly-widescreen-sidebar-panel-width) / 2)) !important;
      }

      #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bpx-player-video-wrap,
      #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bilibili-player-video-wrap,
      #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bpx-player-dm-wrap {
        transform: translateX(calc(-1 * var(--bewly-widescreen-sidebar-panel-width) / 2)) !important;
      }

      #${ROOT_ID}[data-center-layout="true"] .is-bewly-vertical-video-zoomed .bpx-player-video-wrap,
      #${ROOT_ID}[data-center-layout="true"] .is-bewly-vertical-video-zoomed .bilibili-player-video-wrap,
      #${ROOT_ID}[data-center-layout="true"] .is-bewly-vertical-video-zoomed .bpx-player-dm-wrap {
        transform: translateX(max(0px, min(
          calc(var(--bewly-widescreen-sidebar-panel-width) / 2),
          calc((100vw - var(--bewly-widescreen-sidebar-panel-width) - var(--bewly-widescreen-player-available-height)) / 2)
        ))) !important;
      }

      #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .is-bewly-vertical-video-zoomed .bpx-player-video-wrap,
      #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .is-bewly-vertical-video-zoomed .bilibili-player-video-wrap,
      #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .is-bewly-vertical-video-zoomed .bpx-player-dm-wrap {
        transform: translateX(calc(-1 * max(0px, min(
          calc(var(--bewly-widescreen-sidebar-panel-width) / 2),
          calc((100vw - var(--bewly-widescreen-sidebar-panel-width) - var(--bewly-widescreen-player-available-height)) / 2)
        )))) !important;
      }

      /* 弹幕发送栏与控制条同逻辑：横跨整个播放器容器，右缘贴齐侧栏 */
      #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-danmaku-dock {
        width: min(calc(100vw - var(--bewly-widescreen-sidebar-panel-width)), 100%) !important;
        align-self: flex-start;
      }

      #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bewly-widescreen-danmaku-dock {
        margin-left: auto;
      }
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-toggle {
      position: absolute;
      right: 0;
      top: 50%;
      z-index: 2003;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 42px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px 0 0 8px;
      color: #fff;
      background: rgba(24, 25, 28, 0.72);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(10px);
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      line-height: 1;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-50%);
      transition: opacity 160ms ease, background-color 160ms ease, border-color 160ms ease;
    }

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar-toggle {
      right: auto;
      left: 0;
      border-radius: 0 8px 8px 0;
    }

    #${ROOT_ID}[data-sidebar-toggle-visible="true"][data-pointer-active="true"] .bewly-widescreen-player-slot:hover .bewly-widescreen-sidebar-toggle,
    #${ROOT_ID}[data-sidebar-toggle-visible="true"] .bewly-widescreen-sidebar-toggle:hover,
    #${ROOT_ID}[data-sidebar-toggle-visible="true"] .bewly-widescreen-sidebar-toggle:focus-visible {
      opacity: 1;
      pointer-events: auto;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-toggle:hover {
      background: var(--bew-theme-color, #00aeec);
      border-color: var(--bew-theme-color, #00aeec);
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-top {
      position: relative;
      z-index: 0;
      flex: 0 0 auto;
      padding: 8px 10px 8px;
      border-bottom: 1px solid var(--bewly-widescreen-divider);
      background: var(--bewly-widescreen-surface-bg);
      overflow: visible;
    }

    #${ROOT_ID} .bewly-widescreen-toolbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 4px;
    }

    #${ROOT_ID} .bewly-widescreen-close {
      position: relative;
      display: inline-flex;
      width: 28px;
      height: 28px;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      padding: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: var(--bewly-widescreen-control-bg);
      border: 0;
      border-radius: 50%;
      cursor: pointer;
      font-size: 0;
      line-height: 1;
      transition: color 150ms ease, background-color 150ms ease;
    }

    #${ROOT_ID} .bewly-widescreen-close::before,
    #${ROOT_ID} .bewly-widescreen-close::after {
      position: absolute;
      width: 13px;
      height: 2px;
      border-radius: 2px;
      background: currentColor;
      content: "";
      transform: rotate(45deg);
    }

    #${ROOT_ID} .bewly-widescreen-close::after {
      transform: rotate(-45deg);
    }

    #${ROOT_ID} .bewly-widescreen-close:hover {
      color: var(--bewly-widescreen-text-primary);
      background: var(--bewly-widescreen-control-hover-bg);
    }

    #${ROOT_ID} .bewly-widescreen-close:focus-visible {
      outline: 2px solid var(--bew-theme-color-40, rgba(0, 174, 236, 0.4));
      outline-offset: 2px;
    }

    #${ROOT_ID} .bewly-widescreen-title {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      flex: 1 1 auto;
      overflow: hidden;
      margin: 0;
      color: var(--bewly-widescreen-text-primary);
      font-size: 18px;
      font-weight: 600;
      line-height: 24px;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot {
      width: 100%;
      min-width: 0;
      min-height: 0;
      margin-bottom: 8px;
      overflow: hidden;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot .video-info-meta,
    #${ROOT_ID} .bewly-widescreen-info-slot .video-info-detail-list {
      width: 100% !important;
      min-width: 0 !important;
      height: auto !important;
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot .video-info-detail-list {
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      gap: 4px 12px !important;
      color: var(--bewly-widescreen-text-muted) !important;
      font-size: var(--bew-font-size-caption, 12px) !important;
      line-height: var(--bew-line-height-caption, 16px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot .video-info-detail-list > .item {
      display: inline-flex !important;
      align-items: center !important;
      gap: 4px !important;
      min-width: 0 !important;
      margin: 0 !important;
      white-space: nowrap !important;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot .video-info-detail-list > .item svg {
      width: var(--bew-icon-size-sm, 16px) !important;
      height: var(--bew-icon-size-sm, 16px) !important;
      flex: 0 0 auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot {
      min-height: 0;
      margin-top: 4px;
      container-type: inline-size;
      overflow: visible;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--bewly-widescreen-divider);
      color: var(--bewly-widescreen-text-primary);
    }

    #${ROOT_ID} .bewly-widescreen-description-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot {
      margin-top: 8px;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot .video-tag-container {
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    /* 原生 .tag 靠 float + overflow hidden 换行，窄侧栏改用 flex 换行，避免高度塌陷 */
    #${ROOT_ID} .bewly-widescreen-tags-slot .tag-panel {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-tags-slot .tag-panel .tag {
      float: none !important;
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .video-desc-container {
      width: 100% !important;
      margin: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .basic-desc-info {
      height: auto !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: 13px !important;
      line-height: 20px !important;
      overflow: hidden !important;
      overflow-wrap: anywhere;
      word-break: break-word !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-collapsed .basic-desc-info {
      display: -webkit-box !important;
      height: 40px !important;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded .video-desc-container,
    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded #v_desc {
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded .basic-desc-info {
      display: block !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      -webkit-line-clamp: unset !important;
      -webkit-box-orient: initial !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .video-desc-container > .toggle-btn {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-collapsed .subtitle-maker-list {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot.is-expanded .subtitle-maker-list {
      display: block !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot .subtitle-maker-list {
      padding-top: 6px !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: 13px !important;
      line-height: 20px !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-slot a {
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-description-toggle {
      display: block;
      margin-top: 4px;
      padding: 0;
      border: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      line-height: 20px;
    }

    #${ROOT_ID} .bewly-widescreen-description-toggle:hover {
      color: var(--bew-theme-color, #00aeec);
    }

    #${ROOT_ID} .bewly-widescreen-description-toggle[hidden] {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-container,
    #${ROOT_ID} .bewly-widescreen-action-slot #arc_toolbar_report {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      width: 100% !important;
      min-width: 0 !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot #arc_toolbar_report {
      flex-wrap: nowrap;
      gap: 0;
    }

    /* 左侧四组内容自适应宽度，不再撑满整行，让稍后再看按钮得以紧随分享之后 */
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left {
      display: block !important;
      min-width: 0 !important;
      flex: 0 1 auto !important;
      overflow: visible !important;
    }

    /* 四组操作按 B 站原生排布在左侧聚拢（不再用等分 grid 拉开），项宽内容自适应、
       图标缩至 22px（对中补偿见下方图标块注释）。B 站三连动画锚定在 wrap 左上角、
       依赖「图标位于 wrap 左缘 + 已知图标尺寸」，不要改回等分居中 */
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-main {
      display: flex !important;
      align-items: center !important;
      width: 100% !important;
      min-width: 0 !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap {
      display: flex !important;
      position: relative !important;
      min-width: 0 !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item,
    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      position: relative !important;
      flex: 0 1 auto !important;
      width: auto !important;
      min-width: 0 !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      background: transparent !important;
      font-size: 13px !important;
      line-height: 20px !important;
      min-height: 28px !important;
      white-space: nowrap !important;
      text-align: center !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > .video-toolbar-left-item {
      flex: 0 1 auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"],
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"],
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item > canvas,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"],
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"] {
      position: absolute !important;
      inset: auto !important;
      left: 50% !important;
      top: 50% !important;
      width: 34px !important;
      height: 34px !important;
      min-width: 34px !important;
      min-height: 34px !important;
      margin: 0 !important;
      translate: -50% -50% !important;
      color: var(--bew-theme-color, #00aeec) !important;
      pointer-events: none !important;
      z-index: 2 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item > canvas {
      filter: var(--bewly-widescreen-action-canvas-filter, none) !important;
      opacity: 0.96 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"] svg,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"] svg,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"] svg,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"] svg {
      width: 100% !important;
      height: 100% !important;
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"] [stroke],
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"] [stroke],
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"] [stroke],
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"] [stroke] {
      stroke: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="anim"] [fill]:not([fill="none"]),
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item [class*="Anim"] [fill]:not([fill="none"]),
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="anim"] [fill]:not([fill="none"]),
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > [class*="Anim"] [fill]:not([fill="none"]) {
      fill: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-wrap,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-wrap > span,
    #${ROOT_ID} .bewly-widescreen-action-slot #share-btn-outer {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 4px !important;
      min-width: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-wrap {
      flex: 0 1 auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info {
      display: inline-flex !important;
      align-items: center !important;
      margin-left: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info-text {
      display: inline !important;
      margin-left: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item:hover,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item:hover {
      color: var(--bew-theme-color, #00aeec) !important;
    }

    /* 稍后再看按钮 hover 用中性色加深，避免与「已添加」的主题色语义混淆；
       已添加状态下 hover 保持主题色 */
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item.bewly-watch-later-btn:hover {
      color: var(--bewly-widescreen-text-primary) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item.bewly-watch-later-btn.is-active:hover {
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .on,
    #${ROOT_ID} .bewly-widescreen-action-slot .active,
    #${ROOT_ID} .bewly-widescreen-action-slot .liked,
    #${ROOT_ID} .bewly-widescreen-action-slot .collected,
    #${ROOT_ID} .bewly-widescreen-action-slot .is-active,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.on,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.on *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.liked,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like.liked *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-coin.on,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-coin.on *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.on,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.on *,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.collected,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav.collected * {
      color: var(--bew-theme-color, #00aeec) !important;
      fill: var(--bew-theme-color, #00aeec) !important;
    }

    /* 图标整体缩至 22px（原生 28px），组间距沿用 B 站原生 wrap margin。
       B 站三连动画的固定负偏移按 28px 图标设计，缩小后以图标中心重新对中：
       项内容自适应宽高，图标中心恒为 (11px, 14px)（28px 行高内垂直居中），
       进度环 34/42px、连击特效 92px 等尺寸差异由 translate 抵消 */
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-item-icon {
      width: 22px !important;
      height: 22px !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > canvas,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap > .svga-center {
      position: absolute !important;
      left: 11px !important;
      top: 14px !important;
      translate: -50% -50% !important;
      pointer-events: none !important;
    }

    /* 仅水平对中：UP 三连立绘与点赞特效的垂直偏移沿用 B 站自身取值 */
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item .svga-top,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left > .selfdef-triple-anime {
      position: absolute !important;
      left: 11px !important;
      translate: -50% 0 !important;
      pointer-events: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-item-text,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-coin-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info {
      display: inline-flex !important;
      align-items: center !important;
      margin-left: 0 !important;
    }

    /* 宽屏下右侧只保留插件的稍后再看按钮（随 .video-toolbar-right 一起被搬入 slot），
       用 order 置于四组操作之前（行首），间距镜像 B 站原生组间距（1681px 以上 18px）；
       原生「更多」等其余入口维持隐藏 */
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right {
      display: flex !important;
      align-items: center !important;
      flex: 0 0 auto !important;
      order: -1 !important;
      margin: 0 8px 0 0 !important;
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
    }

    @media (min-width: 1681px) {
      #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right {
        margin-right: 18px !important;
      }
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right > :not(.bewly-watch-later-btn) {
      display: none !important;
    }

    /* 稍后再看按钮与四组操作项统一：内容自适应尺寸 + 22px 图标，
       颜色 / hover / 激活态复用上方共享项规则（含 .is-active 主题色） */
    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn {
      justify-content: center !important;
      min-width: 24px !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn .bewly-watch-later-btn__icon {
      width: 22px !important;
      height: 22px !important;
      font-size: 22px !important;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-top .up-panel-container,
    #${ROOT_ID} .bewly-widescreen-sidebar-top .up-info-container,
    #${ROOT_ID} .bewly-widescreen-sidebar-top .up-info,
    #${ROOT_ID} .bewly-widescreen-sidebar-top .upinfo {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-up-slot .up-panel-container,
    #${ROOT_ID} .bewly-widescreen-up-slot .up-info-container,
    #${ROOT_ID} .bewly-widescreen-up-slot .up-info,
    #${ROOT_ID} .bewly-widescreen-up-slot .upinfo {
      padding-top: 0 !important;
      padding-bottom: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-tabs {
      position: relative;
      z-index: 0;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      flex: 0 0 auto;
      height: 42px;
      background: var(--bewly-widescreen-surface-bg);
      border-bottom: 1px solid var(--bewly-widescreen-divider);
    }

    #${ROOT_ID} .bewly-widescreen-tab {
      position: relative;
      border: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: transparent;
      cursor: pointer;
      font-size: 14px;
      line-height: 42px;
    }

    #${ROOT_ID} .bewly-widescreen-tab.is-active {
      color: var(--bew-theme-color, #00aeec);
      font-weight: 600;
    }

    #${ROOT_ID} .bewly-widescreen-tab.is-active::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: 0;
      width: 24px;
      height: 3px;
      border-radius: 3px 3px 0 0;
      background: var(--bew-theme-color, #00aeec);
      transform: translateX(-50%);
    }

    #${ROOT_ID} .bewly-widescreen-panels {
      position: relative;
      z-index: 1;
      width: 100%;
      flex: 0 0 auto;
      min-height: auto;
      overflow: visible;
      background: var(--bewly-widescreen-sidebar-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel {
      width: 100%;
      height: auto;
      overflow: visible;
      padding: 8px 8px 16px;
    }

    #${ROOT_ID} .bewly-widescreen-panel:not([hidden]) {
      height: auto;
      overflow: visible;
    }

    /* B 站的表情面板会在视口底部空间不足时向上展开。打开期间允许它
       越过评论面板顶边覆盖简介，关闭后恢复由侧栏外层负责滚动。 */
    #${ROOT_ID} .bewly-widescreen-panels[data-bewly-comment-emoji-open],
    #${ROOT_ID} .bewly-widescreen-panel[data-bewly-comment-emoji-open] {
      overflow: visible;
    }

    #${ROOT_ID} .bewly-widescreen-panel[hidden] {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel > * {
      width: 100% !important;
      max-width: 100% !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }

    /* Keep the playlist panel in the sidebar's outer scroll flow. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist {
      overflow: visible;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__body,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-pod__list,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-page,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .multi-page-v1,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .cur-list,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .list-box,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .base-video-sections-v1,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-sections-v1,
    #${ROOT_ID} .bewly-widescreen-panel-playlist .video-sections-content-list,
    #${ROOT_ID} .bewly-widescreen-panel-playlist #eplist_module,
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="eplist_ep_list_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="numberList_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="imageList_wrap"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PaginatedEpList_root"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="SectionPanel_panel"] {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel [class*="eplist_ep_list_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel [class*="PaginatedEpList_root"],
    #${ROOT_ID} .bewly-widescreen-panel [class*="SectionPanel_panel"],
    #${ROOT_ID} .bewly-widescreen-panel [class*="recommend_wrap"],
    #${ROOT_ID} .bewly-widescreen-panel #danmukuBox,
    #${ROOT_ID} .bewly-widescreen-panel [class*="DanmukuBox_wrap"],
    #${ROOT_ID} .bewly-widescreen-panel #comment-module,
    #${ROOT_ID} .bewly-widescreen-panel #comment-body {
      position: relative !important;
      left: auto !important;
      right: auto !important;
      top: auto !important;
      bottom: auto !important;
      transform: none !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 0 12px !important;
      z-index: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel [class*="numberList_wrapper"],
    #${ROOT_ID} .bewly-widescreen-panel [class*="imageList_wrap"] {
      width: 100% !important;
      max-width: 100% !important;
    }

    /* Keep only the marked episode section internally scrollable. The panel
       itself remains the outer scroll fallback for recommendations and other
       sidebar content; nested playlist containers stay overflow-visible. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist.${EPISODE_SECTION_CLASS},
    #${ROOT_ID} .bewly-widescreen-panel-playlist .${EPISODE_SECTION_CLASS} {
      height: auto !important;
      max-height: min(52dvh, 560px) !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    /* New bangumi lists already scroll inside EpisodeVirtualList. Keep the
       outer module in the panel flow so header/tabs stay visible. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PaginatedEpList_root"].${EPISODE_SECTION_CLASS},
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="SectionPanel_panel"].${EPISODE_SECTION_CLASS} {
      max-height: none !important;
      overflow: visible !important;
    }

    /* New bangumi pages keep the episode list in a hidden player popover.
       Once moved into the sidebar, give the original virtualized list a
       stable flex height and let its own scroll container remain in charge. */
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PlayerEpisodePanel_panel"] {
      display: flex !important;
      flex-direction: column !important;
      position: relative !important;
      width: 100% !important;
      height: min(52dvh, 560px) !important;
      min-height: 0 !important;
      max-height: min(52dvh, 560px) !important;
      margin: 0 0 var(--bew-space-3, 12px) !important;
      overflow: hidden !important;
      color: var(--bewly-widescreen-text-primary) !important;
      background: transparent !important;
      visibility: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PlayerEpisodePanel_episodeScrollFrame"] {
      flex: 1 1 auto !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class^="PlayerEpisodePanel_episodeScroll__"] {
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PlayerEpisodePanel_header"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PlayerEpisodePanel_pageTab"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PlayerEpisodePanel_episodeRow"] {
      color: var(--bewly-widescreen-text-primary) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PlayerEpisodePanel_pageTabActive"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PlayerEpisodePanel_episodeRowActive"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PlayerEpisodePanel_rowPlaying"] {
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PlayerEpisodePanel_episodeRow"]:hover {
      background: var(--bewly-widescreen-control-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PaginatedEpList_root"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="SectionPanel_panel"] {
      display: flex !important;
      flex-direction: column !important;
      position: relative !important;
      width: 100% !important;
      margin: 0 0 var(--bew-space-3, 12px) !important;
      color: var(--bewly-widescreen-text-primary) !important;
      background: transparent !important;
      visibility: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_scroll"] {
      width: 100% !important;
      max-height: min(40dvh, 420px) !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="SectionHeader_header"] h3,
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="SectionHeader_titleWrap"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PageTabs_tab"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="SectionTabs_tab"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_numberItem"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_listItem"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_copy"] {
      color: var(--bewly-widescreen-text-primary) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_numberItem"] {
      background: var(--bewly-widescreen-control-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="PageTabs_active"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="SectionTabs_active"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_activeNumber"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_activeItem"] {
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_numberItem"]:hover:not([class*="EpisodeVirtualList_activeNumber"]) {
      background: var(--bewly-widescreen-control-hover-bg) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_activeNumber"],
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="EpisodeVirtualList_activeNumber"]:hover {
      color: #fff !important;
      background: var(--bew-theme-color, #00aeec) !important;
      border-color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel .video-page-card-small {
      width: 100% !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-item,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-item,
    #${ROOT_ID} .bewly-widescreen-panel-comment .root-reply-container,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-container {
      padding-left: 0 !important;
      padding-right: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .content-warp,
    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-content-container,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-content {
      min-width: 0 !important;
      margin-left: 8px !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .user-info,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-user-info {
      min-width: 0 !important;
      max-width: 100% !important;
      flex-wrap: wrap !important;
      gap: 4px 6px !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-time,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-time,
    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-time-location {
      white-space: nowrap !important;
      font-size: 12px !important;
    }

    #${ROOT_ID} .bewly-widescreen-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 160px;
      color: var(--bewly-widescreen-text-muted);
      font-size: 14px;
    }

    @media (max-width: ${MOBILE_BREAKPOINT}px) {
      #${ROOT_ID} {
        --bewly-widescreen-player-available-height: calc(56dvh - var(--bewly-widescreen-danmaku-height, 0px));
        --bewly-widescreen-sidebar-column-width: 100vw;
        --bewly-widescreen-sidebar-panel-width: 100vw;
        --bewly-widescreen-sidebar-offset: 0px;
      }

      #${ROOT_ID} .bewly-widescreen-stage {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(0, 56dvh) minmax(0, 44dvh);
      }

      #${ROOT_ID} .bewly-widescreen-player-slot {
        padding: 0;
      }

      #${ROOT_ID} .bewly-widescreen-sidebar {
        width: 100%;
        transform: none;
        transition: none;
        box-shadow: none;
      }

      #${ROOT_ID} .bewly-widescreen-sidebar-toggle {
        display: none;
      }

      #${ROOT_ID} .bewly-widescreen-player-frame > * {
        width: 100% !important;
        max-height: 100% !important;
      }

      #${ROOT_ID} .bewly-widescreen-danmaku-dock {
        width: 100% !important;
      }
    }
  `)
}

function updateAspectRatio() {
  const video = getVideoElement()
  const aspect = video?.videoWidth && video.videoHeight
    ? video.videoWidth / video.videoHeight
    : 16 / 9
  const layoutAspect = Math.min(aspect, 16 / 9)

  state?.root.style.setProperty('--bewly-widescreen-aspect', String(aspect))
  state?.root.style.setProperty('--bewly-widescreen-layout-aspect', String(layoutAspect))
  updateSidebarLayoutState()
  if (state)
    schedulePlayerResizeSync(state)
}

function updateSidebarLayoutState() {
  if (!state)
    return

  const availableHeight = state.playerFrame.getBoundingClientRect().height
  const layoutAspect = Number.parseFloat(state.root.style.getPropertyValue('--bewly-widescreen-layout-aspect')) || 16 / 9
  const targetWidth = availableHeight * layoutAspect
  const fitWidth = Math.min(
    Math.max(window.innerWidth - targetWidth, 0),
    window.innerWidth * 0.4,
  )
  const narrowWidth = Math.min(
    Math.max(SIDEBAR_NARROW_MIN_WIDTH, window.innerWidth * 0.26),
    SIDEBAR_NARROW_MAX_WIDTH,
    window.innerWidth * 0.4,
  )
  const gapWidth = Math.max((window.innerWidth - targetWidth) / 2, 0)
  // 居中布局与设置、几何和侧栏模式都有关：仅在 fit 模式且单侧黑边容得下最小
  // 可用侧栏时启用，否则维持经典布局（narrow 本身就是完整侧栏），避免压瘪侧栏。
  // 需与 CSS 保持一致。
  const centerLayout = !!settings.value.bewlyWidescreenCenterVerticalVideo
    && state.sidebarMode !== 'narrow'
    && gapWidth >= SIDEBAR_NARROW_MIN_WIDTH
  state.root.dataset.centerLayout = String(centerLayout)

  // 居中布局下保留按钮，提供切回「压缩视频的完整侧栏」的入口；
  // 经典 fit 布局沿用原判定：narrow 更宽时才需要按钮。
  const needsHover = centerLayout || narrowWidth - fitWidth > 1
  state.root.dataset.sidebarToggleVisible = String(needsHover)
}

function updateDanmakuDockHeight() {
  if (!state)
    return

  const height = state.danmakuDock.childElementCount > 0
    ? state.danmakuDock.getBoundingClientRect().height
    : 0

  state.root.style.setProperty('--bewly-widescreen-danmaku-height', `${height}px`)
  updateSidebarLayoutState()
  schedulePlayerResizeSync(state)
}

function parseRgbColor(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match)
    return null

  return {
    r: Number(match[1]) / 255,
    g: Number(match[2]) / 255,
    b: Number(match[3]) / 255,
  }
}

function rgbToHsl({ r, g, b }: { r: number, g: number, b: number }) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2

  if (max === min)
    return { hue: 0, saturation: 0, lightness }

  const delta = max - min
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min)

  let hue = 0
  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0)
      break
    case g:
      hue = (b - r) / delta + 2
      break
    default:
      hue = (r - g) / delta + 4
      break
  }

  return { hue: hue * 60, saturation, lightness }
}

let cssColorProbe: HTMLSpanElement | null = null

function resolveCssColor(value: string) {
  if (!value)
    return null

  if (!cssColorProbe) {
    cssColorProbe = document.createElement('span')
    cssColorProbe.style.position = 'fixed'
    cssColorProbe.style.pointerEvents = 'none'
    cssColorProbe.style.opacity = '0'
    document.body.appendChild(cssColorProbe)
  }
  cssColorProbe.style.color = value
  const resolved = getComputedStyle(cssColorProbe).color

  return parseRgbColor(resolved)
}

function syncActionAnimationTheme(currentState: BewlyWidescreenState) {
  const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--bew-theme-color').trim()
  const rgb = resolveCssColor(themeColor || '#00aeec')
  if (!rgb)
    return

  const { hue, saturation, lightness } = rgbToHsl(rgb)
  const hueRotate = Math.round(hue - BILIBILI_ACTION_ANIMATION_HUE)
  const saturationRatio = Math.max(0.8, Math.min(2.4, saturation / 0.85))
  const brightnessRatio = Math.max(0.75, Math.min(1.35, lightness / 0.46))
  currentState.root.style.setProperty(
    '--bewly-widescreen-action-canvas-filter',
    `hue-rotate(${hueRotate}deg) saturate(${saturationRatio.toFixed(2)}) brightness(${brightnessRatio.toFixed(2)})`,
  )
}

function clearPlayerResizeSync(currentState: BewlyWidescreenState) {
  currentState.resizeSyncTimers?.forEach(timer => clearTimeout(timer))
  currentState.resizeSyncTimers = []
}

function schedulePlayerResizeSync(currentState: BewlyWidescreenState) {
  if (!state || state !== currentState)
    return

  clearPlayerResizeSync(currentState)
  currentState.resizeSyncTimers = [0, 80, 180, 360, 720].map(delay =>
    setTimeout(() => {
      if (!state || state !== currentState)
        return

      window.dispatchEvent(new Event('resize'))
    }, delay),
  )
}

function setupAspectObservers(currentState: BewlyWidescreenState) {
  const video = getVideoElement()
  if (video) {
    const onLoadedMetadata = () => {
      updateAspectRatio()
      scheduleSidebarRefresh()
    }
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    currentState.metadataListener = () => video.removeEventListener('loadedmetadata', onLoadedMetadata)
  }

  currentState.resizeObserver = new ResizeObserver(() => {
    updateAspectRatio()
    updateDanmakuDockHeight()
    syncDescription(currentState)
  })
  currentState.resizeObserver.observe(currentState.root)
  currentState.resizeObserver.observe(currentState.danmakuDock)
  currentState.resizeObserver.observe(currentState.descriptionSlot)
  updateAspectRatio()
  schedulePlayerResizeSync(currentState)
}

function setupSidebarInteractionTracking(currentState: BewlyWidescreenState) {
  const sidebar = currentState.sidebarEl
  const playerFrame = currentState.playerFrame

  function isPointInRect({ clientX, clientY }: PointerEvent, rect: DOMRect) {
    return clientX >= rect.left
      && clientX <= rect.right
      && clientY >= rect.top
      && clientY <= rect.bottom
  }

  function isPointInVisibleVideoArea(e: PointerEvent) {
    if (!isPointInRect(e, playerFrame.getBoundingClientRect()))
      return false

    return !isPointInRect(e, sidebar.getBoundingClientRect())
  }

  function expandSidebar() {
    currentState.root.dataset.sidebarExpanded = 'true'
  }

  function collapseSidebar(e: PointerEvent) {
    if (isPointInVisibleVideoArea(e))
      currentState.root.dataset.sidebarExpanded = 'false'
  }

  sidebar.addEventListener('pointerenter', expandSidebar)
  playerFrame.addEventListener('pointerenter', collapseSidebar)
  playerFrame.addEventListener('pointermove', collapseSidebar)

  currentState.sidebarInteractionCleanup = () => {
    sidebar.removeEventListener('pointerenter', expandSidebar)
    playerFrame.removeEventListener('pointerenter', collapseSidebar)
    playerFrame.removeEventListener('pointermove', collapseSidebar)
    delete currentState.root.dataset.sidebarExpanded
  }
}

function setupSidebarToggleAutoHide(currentState: BewlyWidescreenState) {
  const { playerSlot, sidebarToggleButton, root } = currentState
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let hoveringToggle = false

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
  }

  function hideToggle() {
    root.dataset.pointerActive = 'false'
  }

  function showToggle() {
    root.dataset.pointerActive = 'true'
    clearIdleTimer()
    // 鼠标停在按钮上时保持显示，避免误隐藏
    if (!hoveringToggle)
      idleTimer = setTimeout(hideToggle, SIDEBAR_TOGGLE_IDLE_DELAY)
  }

  function onPointerLeave() {
    clearIdleTimer()
    hideToggle()
  }

  function onToggleEnter() {
    hoveringToggle = true
    root.dataset.pointerActive = 'true'
    clearIdleTimer()
  }

  function onToggleLeave() {
    hoveringToggle = false
    showToggle()
  }

  playerSlot.addEventListener('pointermove', showToggle)
  playerSlot.addEventListener('pointerleave', onPointerLeave)
  sidebarToggleButton.addEventListener('pointerenter', onToggleEnter)
  sidebarToggleButton.addEventListener('pointerleave', onToggleLeave)

  currentState.sidebarToggleAutoHideCleanup = () => {
    clearIdleTimer()
    playerSlot.removeEventListener('pointermove', showToggle)
    playerSlot.removeEventListener('pointerleave', onPointerLeave)
    sidebarToggleButton.removeEventListener('pointerenter', onToggleEnter)
    sidebarToggleButton.removeEventListener('pointerleave', onToggleLeave)
    delete root.dataset.pointerActive
  }
}

function setupDomRefreshObserver(currentState: BewlyWidescreenState) {
  currentState.mutationObserver = new MutationObserver((mutations) => {
    if (!state || state !== currentState)
      return

    if (mutations.every(mutation => currentState.root.contains(mutation.target)))
      return

    scheduleSidebarRefresh()
  })

  currentState.mutationObserver.observe(document.body, { childList: true, subtree: true })
}

function moveDanmakuInput(currentState: BewlyWidescreenState) {
  if (currentState.danmakuDock.querySelector(selectors.danmakuInput.join(',')))
    return true

  const inputBar = findFirst(selectors.danmakuInput, currentState.playerSlot)
    || findMovable(selectors.danmakuInput)

  const moved = moveNode(inputBar, currentState.danmakuDock, currentState.movedNodes, !!inputBar?.closest(`#${ROOT_ID}`))
  updateDanmakuDockHeight()
  return moved
}

function expandDanmakuTab(currentState: BewlyWidescreenState) {
  const focusable = findFirst(selectors.danmakuFocusable, currentState.panels.danmaku)
  if (!focusable)
    return

  currentState.sidebarEl.scrollTo({ top: 0, behavior: 'smooth' })
  setTimeout(() => {
    focusable.click()
    focusable.focus?.({ preventScroll: true })
  }, 120)
}

function syncDescription(currentState: BewlyWidescreenState) {
  const { descriptionSlot } = currentState
  const description = findFirst(selectors.description, descriptionSlot)
  if (!description) {
    descriptionSlot.classList.add('is-empty')
    descriptionSlot.querySelector<HTMLButtonElement>('.bewly-widescreen-description-toggle')?.setAttribute('hidden', '')
    return
  }

  const basicDescription = description.querySelector<HTMLElement>('.basic-desc-info') || description
  let toggleButton = descriptionSlot.querySelector<HTMLButtonElement>('.bewly-widescreen-description-toggle')

  if (!toggleButton) {
    toggleButton = document.createElement('button')
    toggleButton.type = 'button'
    toggleButton.className = 'bewly-widescreen-description-toggle'

    const onToggle = () => {
      currentState.descriptionExpanded = !currentState.descriptionExpanded
      syncDescription(currentState)
    }

    toggleButton.addEventListener('click', onToggle)
    descriptionSlot.appendChild(toggleButton)
    currentState.descriptionCleanup = () => {
      toggleButton?.removeEventListener('click', onToggle)
      toggleButton?.remove()
      descriptionSlot.classList.remove('is-collapsed', 'is-expanded', 'is-empty')
    }
  }

  descriptionSlot.classList.remove('is-collapsed', 'is-expanded')
  const lineHeight = Number.parseFloat(getComputedStyle(basicDescription).lineHeight) || 20
  const subtitleList = description.querySelector<HTMLElement>('.subtitle-maker-list')
  const descriptionText = basicDescription.textContent?.replace(/\s+/g, ' ').trim() || ''
  const hasDescription = !!descriptionText && !/^[-–—]+$/.test(descriptionText) && descriptionText !== '暂无简介'
  const hasSubtitle = !!subtitleList?.childElementCount
  const hasContent = hasDescription || hasSubtitle
  const canExpand = hasContent && (basicDescription.scrollHeight > lineHeight * 2 + 1
    || hasSubtitle)

  if (!hasContent || !canExpand)
    currentState.descriptionExpanded = false

  descriptionSlot.classList.toggle('is-empty', !hasContent)
  toggleButton.hidden = !hasContent || !canExpand
  const toggleLabel = currentState.descriptionExpanded ? t('widescreen.collapse') : t('widescreen.expand_more')
  if (toggleButton.textContent !== toggleLabel)
    toggleButton.textContent = toggleLabel
  toggleButton.setAttribute('aria-expanded', String(canExpand && currentState.descriptionExpanded))
  descriptionSlot.classList.toggle('is-collapsed', canExpand && !currentState.descriptionExpanded)
  descriptionSlot.classList.toggle('is-expanded', canExpand && currentState.descriptionExpanded)
}

function syncSidebarTitle(currentState: BewlyWidescreenState) {
  const titleElement = currentState.sidebarTop.querySelector<HTMLElement>('.bewly-widescreen-title')
  const nextTitle = getTitleText()
  if (titleElement && nextTitle && titleElement.textContent !== nextTitle)
    titleElement.textContent = nextTitle
}

function findManagedPanelNode(panel: HTMLElement, selectorsToMatch: string[], movedNodes: MovedNode[]) {
  const selector = selectorsToMatch.join(',')
  return movedNodes.find(({ node }) => {
    if (node.parentElement !== panel)
      return false

    return node.matches(selector) || !!node.querySelector(selector)
  })?.node ?? null
}

function placeRecommendAfterPlaylist(panel: HTMLElement, movedNodes: MovedNode[]) {
  const playlistNode = findManagedPanelNode(panel, selectors.playlist, movedNodes)
  const recommendNode = findManagedPanelNode(panel, selectors.recommend, movedNodes)
  if (!playlistNode || !recommendNode || playlistNode === recommendNode)
    return

  // Only reorder the top-level nodes that Bewly moved into this panel. This
  // avoids detaching recommendation/episode elements nested inside a shared
  // Bilibili wrapper.
  if (playlistNode.parentElement === panel && recommendNode.parentElement === panel)
    playlistNode.after(recommendNode)
}

function findEpisodeSectionNode(panel: HTMLElement, movedNodes: MovedNode[]) {
  const playlistNode = findManagedPanelNode(panel, selectors.playlist, movedNodes)
  if (!playlistNode)
    return null

  const candidates = [
    playlistNode,
    ...Array.from(playlistNode.querySelectorAll<HTMLElement>(selectors.playlist.join(','))),
  ]
  const episodeCandidates = candidates.filter(candidate => candidate.querySelector(EPISODE_ITEM_SELECTOR))
  return episodeCandidates.at(-1) ?? playlistNode
}

function clearEpisodeSectionMarker(panel: HTMLElement, movedNodes: MovedNode[]) {
  for (const { node } of movedNodes)
    node.classList.remove(EPISODE_SECTION_CLASS)
  panel.querySelectorAll<HTMLElement>(`.${EPISODE_SECTION_CLASS}`).forEach((node) => {
    node.classList.remove(EPISODE_SECTION_CLASS)
  })
}

function syncEpisodeSectionMarker(panel: HTMLElement, movedNodes: MovedNode[]) {
  clearEpisodeSectionMarker(panel, movedNodes)

  const episodeSection = findEpisodeSectionNode(panel, movedNodes)
  if (episodeSection)
    episodeSection.classList.add(EPISODE_SECTION_CLASS)
}

function fillSidebar(currentState: BewlyWidescreenState) {
  syncActionAnimationTheme(currentState)
  syncSidebarTitle(currentState)

  moveOrReplaceNode(selectors.info, currentState.infoSlot, currentState.movedNodes)

  moveOrReplaceNode(selectors.toolbar, currentState.toolbarSlot, currentState.movedNodes)

  moveOrReplaceNode(selectors.upPanel, currentState.upSlot, currentState.movedNodes)

  const descriptionResult = moveOrReplaceNode(selectors.description, currentState.descriptionSlot, currentState.movedNodes)
  if (descriptionResult.changed)
    currentState.descriptionExpanded = false
  syncDescription(currentState)

  moveOrReplaceNode(selectors.tags, currentState.tagsSlot, currentState.movedNodes)

  moveDanmakuInput(currentState)
  const commentResult = moveCommentRoot(currentState.panels.comment, currentState.movedNodes)
  if (!commentResult.found) {
    ensureEmptyPanel(currentState.panels.comment, t('widescreen.comments_loading'))
  }
  else {
    clearEmptyPanel(currentState.panels.comment)
    shortenCommentTimes(currentState.panels.comment)
  }

  const danmakuResult = moveOrReplaceNode(selectors.danmaku, currentState.panels.danmaku, currentState.movedNodes)
  if (!danmakuResult.found)
    ensureEmptyPanel(currentState.panels.danmaku, t('widescreen.danmaku_loading'))
  else
    clearEmptyPanel(currentState.panels.danmaku)

  movePlaylistControls(currentState.panels.playlist, currentState.movedNodes)
  moveMatchingNodes(['[class*="eplist_ep_list_wrapper"]'], currentState.panels.playlist, currentState.movedNodes)
  let existingPlaylist = currentState.panels.playlist.querySelector<HTMLElement>(selectors.playlist.join(','))
    ?? currentState.panels.playlist.querySelector<HTMLElement>(BANGUMI_EPISODE_LIST_ROOT_SELECTOR)
    ?? currentState.panels.playlist.querySelector<HTMLElement>('[class*="SectionPanel_panel"]')
  const existingRecommend = currentState.panels.playlist.querySelector<HTMLElement>(selectors.recommend.join(','))
  if (existingPlaylist && isDetachedBangumiSection(existingPlaylist)) {
    restoreMovedNode(existingPlaylist, currentState.movedNodes)
    existingPlaylist = currentState.panels.playlist.querySelector<HTMLElement>(BANGUMI_EPISODE_LIST_ROOT_SELECTOR)
  }
  const shouldReplacePlaylist = !!existingPlaylist && isBangumiPlaylistSkeleton(existingPlaylist)
  const playlist = (existingPlaylist && !shouldReplacePlaylist) ? null : findMovablePlaylist()
  if (shouldReplacePlaylist && existingPlaylist && playlist && playlist !== existingPlaylist)
    removeMovedNode(existingPlaylist, currentState.movedNodes)
  const playlistMoved = (existingPlaylist && !shouldReplacePlaylist)
    || moveNode(playlist, currentState.panels.playlist, currentState.movedNodes)
  if (playlistMoved && (!existingPlaylist || shouldReplacePlaylist))
    schedulePlayerResizeSync(currentState)
  const liveBangumiPlaylist = currentState.panels.playlist.querySelector<HTMLElement>(BANGUMI_EPISODE_LIST_ROOT_SELECTOR)
  if (liveBangumiPlaylist)
    bindReactEventBridge(liveBangumiPlaylist)
  // 推荐列表与选集是同一侧栏面板中的两个连续区块；即使选集已经存在，
  // 也要继续搬运推荐列表，保证推荐内容显示在选集下方。
  const recommend = existingRecommend ? null : findMovable(selectors.recommend)
  const recommendMoved = existingRecommend || moveNode(recommend, currentState.panels.playlist, currentState.movedNodes)
  placeRecommendAfterPlaylist(currentState.panels.playlist, currentState.movedNodes)
  syncEpisodeSectionMarker(currentState.panels.playlist, currentState.movedNodes)
  const hasPlaylist = !!(playlistMoved || (existingPlaylist && !shouldReplacePlaylist))
  const hasRecommend = !!(existingRecommend || recommendMoved)
  const playlistLabel = hasPlaylist ? t('widescreen.episodes') : t('widescreen.recommendations')
  if (currentState.tabButtons.playlist.textContent !== playlistLabel)
    currentState.tabButtons.playlist.textContent = playlistLabel
  if (!hasPlaylist && !hasRecommend)
    ensureEmptyPanel(currentState.panels.playlist, t('widescreen.list_loading'))
  else
    clearEmptyPanel(currentState.panels.playlist)
}

function clearEmptyPanel(panel: HTMLElement) {
  panel.querySelectorAll(`.${EMPTY_CLASS}`).forEach(element => element.remove())
}

function ensureEmptyPanel(panel: HTMLElement, label: string) {
  if (panel.querySelector(`.${EMPTY_CLASS}`))
    return

  panel.appendChild(createPanelEmpty(label))
}

function shortenCommentTimes(panel: HTMLElement) {
  for (const timeElement of Array.from(panel.querySelectorAll<HTMLElement>(COMMENT_TIME_SELECTOR))) {
    const walker = document.createTreeWalker(timeElement, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const textNode = walker.currentNode
      if (!(textNode instanceof Text))
        continue

      const value = textNode.nodeValue
      if (!value || !/\d{4}-\d{2}-\d{2}/.test(value))
        continue

      textNode.nodeValue = value.replace(/\b\d{4}-(\d{2})-(\d{2})\b/g, '$1-$2')
    }
  }
}

function cleanupState(currentState: BewlyWidescreenState) {
  currentState.escapeKeyCleanup?.()
  currentState.sidebarInteractionCleanup?.()
  currentState.sidebarToggleAutoHideCleanup?.()
  currentState.metadataListener?.()
  currentState.resizeObserver?.disconnect()
  currentState.mutationObserver?.disconnect()
  currentState.descriptionCleanup?.()
  clearPlayerResizeSync(currentState)
  clearSidebarRefreshTimer()

  // If Bilibili created a replacement while its original comment root was in
  // the sidebar, keep the replacement instead of restoring a duplicate editor.
  const movedCommentRoot = findCommentRoot(currentState.panels.comment)
  const replacementCommentRoot = findCommentRoot(document, true)
  if (movedCommentRoot && replacementCommentRoot)
    removeMovedNode(movedCommentRoot, currentState.movedNodes)

  clearEpisodeSectionMarker(currentState.panels.playlist, currentState.movedNodes)
  restoreMovedNodes(currentState.movedNodes)
  currentState.root.remove()
  currentState.styleEl.remove()
  document.body.classList.remove(BODY_CLASS)
  // Force a layout pass so the same click can apply Bilibili's native mode
  // against the restored player instead of the widescreen frame.
  void document.body.offsetHeight
  setTimeout(() => window.dispatchEvent(new Event('resize')), 0)
}

function isReadyForLayout() {
  const player = findMovable(selectors.player)
  if (!player)
    return false

  const video = getVideoElement()
  if (video instanceof HTMLVideoElement) {
    return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && video.videoWidth > 0
      && video.videoHeight > 0
  }

  const customVideo = player.querySelector<HTMLElement & { currentSrc?: string, readyState?: number }>('bwp-video')
  return !!customVideo
    && ((customVideo.readyState ?? 0) >= HTMLMediaElement.HAVE_CURRENT_DATA || !!customVideo.currentSrc)
}

function applyNow(sidebarPosition: 'left' | 'right' = 'right') {
  const player = findMovable(selectors.player)
  if (!player)
    return false

  const { root, playerSlot, playerFrame, danmakuDock, sidebarEl, sidebarTop, infoSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, sidebarToggleButton } = createRoot(sidebarPosition)
  const styleEl = injectLayoutStyle()
  const movedNodes: MovedNode[] = []

  const nextState: BewlyWidescreenState = {
    root,
    playerSlot,
    playerFrame,
    danmakuDock,
    sidebarEl,
    sidebarTop,
    infoSlot,
    upSlot,
    toolbarSlot,
    descriptionSlot,
    tagsSlot,
    panels,
    tabButtons,
    sidebarToggleButton,
    movedNodes,
    styleEl,
    activeTab: 'comment',
    sidebarMode: 'fit',
    sidebarPosition,
    descriptionExpanded: false,
  }

  state = nextState
  document.body.classList.add(BODY_CLASS)

  const handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape')
      return
    if (isPhotoViewerOpen())
      return

    event.preventDefault()
    event.stopPropagation()
    exitBewlyWidescreen({ userInitiated: true })
  }
  document.addEventListener('keydown', handleEscapeKey, true)
  nextState.escapeKeyCleanup = () => document.removeEventListener('keydown', handleEscapeKey, true)

  setSidebarMode(settings.value.bewlyWidescreenSidebarPriority === 'sidebar' ? 'narrow' : 'fit')

  moveNode(player, playerFrame, movedNodes)
  fillSidebar(nextState)
  setActiveTab('comment')
  setupAspectObservers(nextState)
  setupDomRefreshObserver(nextState)
  setupSidebarInteractionTracking(nextState)
  setupSidebarToggleAutoHide(nextState)
  setTimeout(() => window.dispatchEvent(new Event('resize')), 0)
  removeSwitchHint()
  removeWidescreenLoading()

  return true
}

function clearReadyRetryTimer() {
  if (readyRetryTimer) {
    clearTimeout(readyRetryTimer)
    readyRetryTimer = undefined
  }
}

function clearLoadFallbackTimer() {
  if (loadFallbackTimer) {
    clearTimeout(loadFallbackTimer)
    loadFallbackTimer = undefined
  }
}

function clearPageLoadHandler() {
  if (!pageLoadHandler)
    return

  window.removeEventListener('load', pageLoadHandler)
  pageLoadHandler = undefined
}

function clearSidebarRefreshTimer() {
  if (sidebarRefreshTimer) {
    clearTimeout(sidebarRefreshTimer)
    sidebarRefreshTimer = undefined
  }
}

function scheduleReadyRetry(delay = READY_RETRY_INTERVAL) {
  clearReadyRetryTimer()
  readyRetryTimer = setTimeout(() => {
    readyRetryTimer = undefined

    if (state)
      return

    if (isReadyForLayout() && applyNow(pendingSidebarPosition))
      return

    readyRetryCount++
    if (readyRetryCount <= READY_RETRY_MAX)
      scheduleReadyRetry()
    else
      removeWidescreenLoading()
  }, delay)
}

function startAfterPageLoad(sidebarPosition: 'left' | 'right' = 'right') {
  if (state)
    return

  waitingForLoad = false
  clearPageLoadHandler()
  clearLoadFallbackTimer()
  readyRetryCount = 0
  pendingSidebarPosition = sidebarPosition
  scheduleReadyRetry(LOAD_SETTLE_DELAY)
}

function scheduleSidebarRefresh() {
  if (!state || sidebarRefreshTimer)
    return

  sidebarRefreshTimer = setTimeout(() => {
    sidebarRefreshTimer = undefined
    if (!state)
      return

    fillSidebar(state)
  }, SIDEBAR_REFRESH_DELAY)
}

export function applyBewlyWidescreen(
  sidebarPosition: 'left' | 'right' = 'right',
  showLoading = true,
) {
  ensureNativePlayerModeGuard()
  installSettingsWatchers()
  if (state || waitingForLoad || readyRetryTimer)
    return

  pendingSidebarPosition = sidebarPosition
  if (showLoading) {
    const video = getVideoElement()
    if (!video || video.paused || video.ended)
      showWidescreenLoading()
  }

  if (document.readyState === 'complete') {
    startAfterPageLoad(sidebarPosition)
    return
  }

  waitingForLoad = true
  pageLoadHandler = () => startAfterPageLoad(sidebarPosition)
  window.addEventListener('load', pageLoadHandler, { once: true })

  clearLoadFallbackTimer()
  loadFallbackTimer = setTimeout(() => {
    if (waitingForLoad)
      startAfterPageLoad(pendingSidebarPosition)
  }, 6000)
}

export function exitBewlyWidescreen(
  options: { userInitiated?: boolean } = {},
) {
  clearReadyRetryTimer()
  clearLoadFallbackTimer()
  clearPageLoadHandler()
  loadingSuppressedUntilExit = false
  removeSwitchHint(true)
  removeWidescreenLoading(true)
  waitingForLoad = false

  if (options.userInitiated)
    window.dispatchEvent(new Event(BEWLY_WIDESCREEN_USER_EXIT))

  if (!state)
    return

  const currentState = state
  state = null
  cleanupState(currentState)
}

export function isBewlyWidescreenActive() {
  return !!state
}
