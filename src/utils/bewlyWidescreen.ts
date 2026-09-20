import { watch } from 'vue'
import browser from 'webextension-polyfill'

import { localSettings, settings } from '~/logic'
import { i18n } from '~/utils/i18n'

import { injectCSS } from './main'
import { isPhotoViewerOpen } from './photoViewer'
import type { PlayerModeApplication } from './player'
import { getVideoElement, isPlayerShowingEndingRecommendation } from './player'

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
  sidebarResizeHandle: HTMLElement
  sidebarTop: HTMLElement
  sidebarDetails: HTMLElement
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
  customSidebarWidth: number
  resizeObserver?: ResizeObserver
  mutationObserver?: MutationObserver
  metadataListener?: () => void
  resizeSyncFrame?: number
  lastPlayerWidth?: number
  lastPlayerHeight?: number
  sidebarInteractionCleanup?: () => void
  sidebarToggleAutoHideCleanup?: () => void
  sidebarResizeCleanup?: () => void
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
const SIDEBAR_VIDEO_PRIORITY_COLLAPSED_WIDTH = 96
const SIDEBAR_RESIZE_MIN_WIDTH = 320
const SIDEBAR_RESIZE_MAX_WIDTH = 800
const PLAYER_RESIZE_MIN_WIDTH = 480
const SIDEBAR_RESIZE_KEYBOARD_STEP = 16
const LOADING_FADE_DURATION = 240
const SWITCH_HINT_FADE_DURATION = 180
const SWITCH_HINT_TIMEOUT = 6000
const PREPARED_LOADING_TIMEOUT = 15_000
const READY_RETRY_INTERVAL = 200
const READY_RETRY_MAX = 50
const PAGE_LOAD_FALLBACK_TIMEOUT = 3000
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
let loadingIndicator: HTMLElement | null = null
let loadingStyleEl: HTMLStyleElement | null = null
let loadingLocaleWatchStop: (() => void) | undefined
let loadingFadeTimer: ReturnType<typeof setTimeout> | undefined
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
let pendingApplication: PlayerModeApplication | undefined
let nativePlayerModeGuardInstalled = false

const selectors = {
  player: [
    // 新版番剧页把 NanoPlayer 挂在这个带宽高比的外层容器里。搬运
    // 内层 #bilibili-player 会把外层留在原页面，导致播放器继续受原布局裁切。
    '#bilibili-player-wrap',
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
    // PGC 播放页的标题、简介、评分和「追番」入口都收在 mediaInfoWrap 中。
    // 将整个 React 节点搬入侧栏，避免只匹配旧版视频信息而丢失订阅入口。
    '[class*="mediainfo_mediaInfoWrap"]',
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
    '.toolbar',
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
    '[class*="NanoPlayer_nonoPlayerSendingBar"]',
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

  // 手动调宽始终保持完整侧栏，尚未拖动或双击重置宽度时也不能恢复悬停收起。
  if (settings.value.enableBewlyWidescreenSidebarResize)
    nextMode = 'narrow'
  delete state.root.dataset.sidebarExpanded
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
  let wasActiveOnFirstClick = false
  button.addEventListener('click', (event) => {
    // dblclick 前会触发两次 click，保留首次点击前的状态，避免切换时误回顶。
    if (event.detail < 2)
      wasActiveOnFirstClick = state?.activeTab === tab
    if (state?.activeTab !== tab)
      setActiveTab(tab)
  })
  button.addEventListener('dblclick', () => {
    if (!state || state.activeTab !== tab || !wasActiveOnFirstClick)
      return

    scrollSidebarToTop(state.sidebarEl)
  })
  return button
}

function scrollSidebarToTop(sidebar: HTMLElement) {
  sidebar.scrollTo({
    top: 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}

function createSidebarBackToTop(sidebar: HTMLElement) {
  const actions = document.createElement('div')
  actions.className = 'bewly-widescreen-sidebar-actions'

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bewly-widescreen-back-to-top'
  button.title = t('layout_editor.back_to_top')
  button.setAttribute('aria-label', button.title)
  button.hidden = true
  const icon = document.createElement('span')
  icon.className = 'bewly-widescreen-back-to-top-icon i-line-md:arrow-small-up'
  icon.setAttribute('aria-hidden', 'true')
  button.appendChild(icon)
  button.addEventListener('click', () => scrollSidebarToTop(sidebar))
  sidebar.addEventListener('scroll', () => {
    const hidden = sidebar.scrollTop <= 1
    if (button.hidden !== hidden)
      button.hidden = hidden
  }, { passive: true })

  actions.appendChild(button)
  return actions
}

function createSidebarToggleButton() {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bewly-widescreen-sidebar-toggle'
  button.addEventListener('click', () => {
    resetCustomSidebarWidth()
    setSidebarMode(state?.sidebarMode === 'fit' ? 'narrow' : 'fit')
  })
  return button
}

function createSidebarResizeHandle() {
  const handle = document.createElement('div')
  handle.className = 'bewly-widescreen-sidebar-resize-handle'
  handle.tabIndex = 0
  handle.setAttribute('role', 'separator')
  handle.setAttribute('aria-orientation', 'vertical')
  handle.setAttribute('aria-label', t('widescreen.resize_sidebar'))
  handle.title = t('widescreen.resize_sidebar_title')
  return handle
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
  if (loadingIndicator)
    return

  loadingStyleEl = injectCSS(`
    #${LOADING_ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--bew-space-2, 8px);
      overflow: hidden;
      color: #18191c;
      background: #fff;
      font-family: var(--bew-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      opacity: 1;
      transition: opacity ${LOADING_FADE_DURATION}ms ease;
    }

    #${LOADING_ROOT_ID}.is-leaving {
      opacity: 0;
      pointer-events: none;
    }

    html.dark #${LOADING_ROOT_ID} {
      color: #f1f2f3;
      background: #17181a;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-icon {
      width: 36px;
      height: 36px;
      flex: 0 0 auto;
      object-fit: contain;
    }

    #${LOADING_ROOT_ID} .bewly-widescreen-loading-label {
      min-width: 0;
      font-size: var(--bew-font-size-control, 13px);
      font-weight: var(--bew-font-weight-medium, 500);
      line-height: var(--bew-line-height-control, 18px);
      overflow-wrap: anywhere;
    }
  `)

  const loadingGifUrl = getLoadingGifUrl()
  if (!loadingGifUrl)
    return

  const indicator = document.createElement('div')
  indicator.id = LOADING_ROOT_ID
  indicator.setAttribute('role', 'status')
  indicator.setAttribute('aria-live', 'polite')

  const icon = document.createElement('img')
  icon.className = 'bewly-widescreen-loading-icon'
  icon.src = loadingGifUrl
  icon.alt = ''
  icon.setAttribute('aria-hidden', 'true')

  const label = document.createElement('span')
  label.className = 'bewly-widescreen-loading-label'
  const syncLoadingText = () => {
    label.textContent = t('widescreen.loading')
  }
  syncLoadingText()
  loadingLocaleWatchStop?.()
  loadingLocaleWatchStop = watch(i18n.global.locale, syncLoadingText)

  indicator.append(icon, label)

  const mountTarget = document.body ?? document.documentElement
  mountTarget.appendChild(indicator)
  loadingIndicator = indicator

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

  if (loadingPreparationFallbackTimer) {
    clearTimeout(loadingPreparationFallbackTimer)
    loadingPreparationFallbackTimer = undefined
  }

  if (loadingFadeTimer) {
    clearTimeout(loadingFadeTimer)
    loadingFadeTimer = undefined
  }

  const indicator = loadingIndicator
  const styleEl = loadingStyleEl
  if (!indicator && !styleEl)
    return

  const remove = () => {
    indicator?.remove()
    styleEl?.remove()
    if (loadingIndicator === indicator)
      loadingIndicator = null
    if (loadingStyleEl === styleEl)
      loadingStyleEl = null
    loadingFadeTimer = undefined
  }

  if (immediate || !indicator) {
    remove()
    return
  }

  requestAnimationFrame(() => indicator.classList.add('is-leaving'))
  loadingFadeTimer = setTimeout(remove, LOADING_FADE_DURATION)
}

export function isBewlyWidescreenEngaged() {
  return !!state || waitingForLoad || !!readyRetryTimer || !!loadingIndicator
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
    if (!state)
      return

    updateSidebarLayoutState()
    schedulePlayerResizeSync(state)
  })
  watch(
    () => [settings.value.bewlyWidescreenSidebarPriority, settings.value.enableBewlyWidescreenSidebarResize] as const,
    ([priority, enabled]) => {
      if (!state)
        return

      state.root.dataset.sidebarResizable = String(enabled)
      setSidebarMode(priority === 'sidebar' ? 'narrow' : 'fit')
      applyCustomSidebarWidth(enabled ? localSettings.value.bewlyWidescreenSidebarWidth : 0)
    },
  )
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

  if (!loadingIndicator)
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
  const sidebarResizeHandle = createSidebarResizeHandle()

  const sidebarTop = document.createElement('div')
  sidebarTop.className = 'bewly-widescreen-sidebar-top'
  const sidebarDetails = document.createElement('div')
  sidebarDetails.className = 'bewly-widescreen-sidebar-details'
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
  sidebarTop.append(createSidebarToolbar(), infoSlot, upSlot, toolbarSlot)
  sidebarDetails.append(descriptionSlot, tagsSlot)

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

  sidebar.append(sidebarTop, sidebarDetails, tablist, panelWrap, createSidebarBackToTop(sidebar))
  if (sidebarPosition === 'left')
    stage.append(sidebar, playerSlot)
  else
    stage.append(playerSlot, sidebar)
  // 分隔线独立于侧栏滚动区，避免滚动条占位和内容滚动改变交界位置。
  stage.appendChild(sidebarResizeHandle)
  root.appendChild(stage)
  document.body.appendChild(root)

  return { root, playerSlot, playerFrame, danmakuDock, sidebarEl: sidebar, sidebarResizeHandle, sidebarTop, sidebarDetails, infoSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, sidebarToggleButton }
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
      --bewly-widescreen-sidebar-expanded-width: min(100vw, clamp(480px, 32vw, 600px));
      --bewly-widescreen-sidebar-collapsed-width: ${SIDEBAR_VIDEO_PRIORITY_COLLAPSED_WIDTH}px;
      --bewly-widescreen-sidebar-max: 40vw;
      --bewly-widescreen-layout-aspect: 1.7777778;
      --bewly-widescreen-player-available-height: calc(100dvh - var(--bewly-widescreen-danmaku-height, 0px));
      --bewly-widescreen-player-target-width: calc(var(--bewly-widescreen-player-available-height) * var(--bewly-widescreen-layout-aspect));
      --bewly-widescreen-sidebar-fit-width: clamp(
        0px,
        calc(100vw - var(--bewly-widescreen-player-target-width)),
        min(var(--bewly-widescreen-sidebar-narrow-width), var(--bewly-widescreen-sidebar-max))
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

    #${ROOT_ID}[data-sidebar-custom-width="true"] {
      --bewly-widescreen-sidebar-column-width: var(--bewly-widescreen-sidebar-custom-width);
      --bewly-widescreen-sidebar-panel-width: var(--bewly-widescreen-sidebar-custom-width);
      --bewly-widescreen-sidebar-offset: 0px;
    }

    /* 超宽窗口最多保留 96px 侧栏入口，但不能挤占全高视频所需的宽度。
       视频占满窗口时入口收至零宽，通过窗口边缘触发展开。 */
    #${ROOT_ID}[data-wide-video-priority="true"] {
      --bewly-widescreen-sidebar-column-width: min(var(--bewly-widescreen-sidebar-collapsed-width), var(--bewly-widescreen-sidebar-fit-width));
      --bewly-widescreen-sidebar-panel-width: min(
        var(--bewly-widescreen-sidebar-expanded-width),
        var(--bewly-widescreen-sidebar-max)
      );
      --bewly-widescreen-sidebar-offset: calc(
        var(--bewly-widescreen-sidebar-panel-width) - var(--bewly-widescreen-sidebar-column-width)
      );
    }

    #${ROOT_ID}[data-wide-video-priority="true"][data-sidebar-expanded="true"] {
      --bewly-widescreen-sidebar-column-width: var(--bewly-widescreen-sidebar-panel-width);
      --bewly-widescreen-sidebar-offset: 0px;
    }

    #${ROOT_ID} * {
      box-sizing: border-box;
    }

    #${ROOT_ID} .bewly-widescreen-stage {
      position: relative;
      display: grid;
      grid-template-columns:
        minmax(0, calc(100vw - var(--bewly-widescreen-sidebar-column-width)))
        minmax(0, var(--bewly-widescreen-sidebar-column-width));
      /* 小窗口也保持左右布局，空间不足时由侧栏收起或调宽逻辑处理。 */
      grid-template-rows: minmax(0, 1fr);
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

    /* 收起侧栏后播放器列会宽于全高视频。仅限制播放器本体的宽度，由现有
       flex 居中规则将其放在侧栏外区域正中；发送栏始终铺满当前播放器列。 */
    #${ROOT_ID}[data-wide-video-priority="true"] .bewly-widescreen-player-frame > *,
    #${ROOT_ID}[data-wide-video-priority="true"] .bewly-widescreen-player-frame > #bilibili-player-wrap,
    #${ROOT_ID}[data-wide-video-priority="true"] .bewly-widescreen-player-frame > #playerWrap,
    #${ROOT_ID}[data-wide-video-priority="true"] .bewly-widescreen-player-frame > #bilibili-player,
    #${ROOT_ID}[data-wide-video-priority="true"] .bewly-widescreen-player-frame > #bilibiliPlayer,
    #${ROOT_ID}[data-wide-video-priority="true"] .bewly-widescreen-player-frame > .bpx-player-container,
    #${ROOT_ID}[data-wide-video-priority="true"] .bewly-widescreen-player-frame > .player-wrap {
      width: min(var(--bewly-widescreen-player-target-width), 100%) !important;
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

    #${ROOT_ID} #bilibili-player-wrap,
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
      padding: 0 !important;
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
    #${ROOT_ID} #bilibili-player-wrap *:not(.bili-danmaku-x-guide, .bili-danmaku-x-guide *),
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

    #${ROOT_ID} #bilibili-player-wrap > *,
    #${ROOT_ID} .player-wrap > *,
    #${ROOT_ID} .bpx-player-container > * {
      border-radius: 0 !important;
    }

    #${ROOT_ID} #bilibili-player-wrap,
    #${ROOT_ID} #bilibili-player,
    #${ROOT_ID} #bilibiliPlayer,
    #${ROOT_ID} .bpx-player-container {
      width: 100% !important;
      height: 100% !important;
    }

    #${ROOT_ID} #bilibili-player-wrap .video_playerInner,
    #${ROOT_ID} #bilibili-player-wrap [class*="video_playerInner"] {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    #${ROOT_ID} #bilibili-player-wrap [class*="NanoPlayer_nonoPlayerContainer"],
    #${ROOT_ID} #bilibili-player-wrap [class*="NanoPlayer_nonoPlayerPrimaryArea"],
    #${ROOT_ID} #bilibili-player-wrap [class*="NanoPlayer_nanoDocker"] {
      width: 100% !important;
      height: 100% !important;
      min-width: 0 !important;
      min-height: 0 !important;
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
      position: relative;
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
      --bewly-widescreen-back-to-top-inset: max(
        var(--bew-space-4, 16px),
        env(safe-area-inset-bottom),
        var(--bewly-widescreen-sidebar-right-inset, 0px)
      );
      scroll-padding-top: var(--bewly-widescreen-sticky-height, 0px);
      transform: translateX(var(--bewly-widescreen-sidebar-offset));
      transition: transform 180ms ease;
      will-change: transform;
      z-index: 2002;
      container: bewly-widescreen-sidebar / inline-size;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-resize-handle {
      position: absolute;
      top: 0;
      bottom: 0;
      left: calc(100% - var(--bewly-widescreen-sidebar-column-width));
      z-index: 2004;
      width: var(--bew-space-6, 24px);
      transform: translateX(-50%);
      cursor: col-resize;
      touch-action: none;
      user-select: none;
    }

    /* 零高度的吸底操作层跟随侧栏平移和调宽，不占用正文布局空间。 */
    #${ROOT_ID} .bewly-widescreen-sidebar-actions {
      position: sticky;
      bottom: var(--bewly-widescreen-back-to-top-inset);
      z-index: 4;
      display: flex;
      justify-content: flex-end;
      align-items: flex-end;
      flex: 0 0 0;
      height: 0;
      padding-left: var(--bewly-widescreen-back-to-top-inset);
      /* 扣除右侧滚动条和边框占位，让按钮到侧栏右边界、底边界等距。 */
      padding-right: calc(
        var(--bewly-widescreen-back-to-top-inset)
        - var(--bewly-widescreen-sidebar-right-inset, 0px)
      );
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-back-to-top {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: var(--bew-space-10, 40px);
      height: var(--bew-space-10, 40px);
      padding: 0;
      border: 1px solid var(--bewly-widescreen-divider);
      border-radius: 50%;
      background: var(--bewly-widescreen-surface-bg);
      color: var(--bewly-widescreen-text-primary);
      cursor: pointer;
      pointer-events: auto;
    }

    #${ROOT_ID} .bewly-widescreen-back-to-top-icon {
      width: var(--bew-icon-size-lg, 24px);
      height: var(--bew-icon-size-lg, 24px);
    }

    #${ROOT_ID} .bewly-widescreen-back-to-top:hover {
      background: var(--bewly-widescreen-control-hover-bg);
    }

    #${ROOT_ID} .bewly-widescreen-back-to-top:focus-visible {
      outline: 2px solid var(--bew-theme-color, #00aeec);
      outline-offset: 2px;
    }

    #${ROOT_ID} .bewly-widescreen-back-to-top:active {
      background: var(--bewly-widescreen-control-bg);
      color: var(--bew-theme-color, #00aeec);
    }

    #${ROOT_ID} .bewly-widescreen-back-to-top:disabled {
      opacity: 0.5;
      cursor: default;
      pointer-events: none;
    }

    #${ROOT_ID} .bewly-widescreen-back-to-top[hidden] {
      display: none;
    }

    #${ROOT_ID}:not([data-sidebar-resizable="true"]) .bewly-widescreen-sidebar-resize-handle {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-resize-handle::after {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      width: var(--bew-space-0-5, 2px);
      transform: translateX(-50%);
      background: var(--bew-theme-color, #00aeec);
      content: "";
      opacity: 0;
      transition: opacity 150ms ease;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-resize-handle:hover::after,
    #${ROOT_ID} .bewly-widescreen-sidebar-resize-handle:focus-visible::after,
    #${ROOT_ID}[data-sidebar-resizing="true"] .bewly-widescreen-sidebar-resize-handle::after {
      opacity: 1;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-resize-handle:focus-visible {
      outline: 2px solid var(--bew-theme-color-40, rgba(0, 174, 236, 0.4));
      outline-offset: -4px;
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

    #${ROOT_ID}[data-sidebar-position="left"] .bewly-widescreen-sidebar-resize-handle {
      left: var(--bewly-widescreen-sidebar-column-width);
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-mode="narrow"] .bewly-widescreen-sidebar {
      box-shadow: none;
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-mode="fit"] {
      --bewly-widescreen-sidebar-offset: calc(
        var(--bewly-widescreen-sidebar-column-width) - var(--bewly-widescreen-sidebar-panel-width)
      );
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-custom-width="true"] {
      --bewly-widescreen-sidebar-offset: 0px;
    }

    /* 选择「整个浏览器窗口」且当前可见侧栏能放入单侧空白时，播放器列占满
       整行并将视频平移到视口中心。这里不改变侧栏宽度或展开状态。 */
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
    #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > #bilibili-player-wrap,
    #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > #playerWrap,
    #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > #bilibili-player,
    #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > #bilibiliPlayer,
    #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > .bpx-player-container,
    #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-player-frame > .player-wrap {
      width: min(calc(100vw - var(--bewly-widescreen-sidebar-column-width)), 100%) !important;
    }

    /* 未放大时把视频层与弹幕层平移半个侧栏宽，使画面在视口居中；
       「竖屏放大」的方形裁切激活时改为受限位移——在不越出播放器容器
       （不被侧栏遮挡、不额外裁切）的前提下尽量靠拢视口中心。 */
    #${ROOT_ID}[data-center-layout="true"] .bpx-player-video-wrap,
    #${ROOT_ID}[data-center-layout="true"] .bilibili-player-video-wrap,
    #${ROOT_ID}[data-center-layout="true"] .bpx-player-dm-wrap {
      transform: translateX(calc(var(--bewly-widescreen-sidebar-column-width) / 2)) !important;
    }

    #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bpx-player-video-wrap,
    #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bilibili-player-video-wrap,
    #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bpx-player-dm-wrap {
      transform: translateX(calc(-1 * var(--bewly-widescreen-sidebar-column-width) / 2)) !important;
    }

    #${ROOT_ID}[data-center-layout="true"] .is-bewly-vertical-video-zoomed .bpx-player-video-wrap,
    #${ROOT_ID}[data-center-layout="true"] .is-bewly-vertical-video-zoomed .bilibili-player-video-wrap,
    #${ROOT_ID}[data-center-layout="true"] .is-bewly-vertical-video-zoomed .bpx-player-dm-wrap {
      transform: translateX(max(0px, min(
        calc(var(--bewly-widescreen-sidebar-column-width) / 2),
        calc((100vw - var(--bewly-widescreen-sidebar-column-width) - var(--bewly-widescreen-player-available-height)) / 2)
      ))) !important;
    }

    #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .is-bewly-vertical-video-zoomed .bpx-player-video-wrap,
    #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .is-bewly-vertical-video-zoomed .bilibili-player-video-wrap,
    #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .is-bewly-vertical-video-zoomed .bpx-player-dm-wrap {
      transform: translateX(calc(-1 * max(0px, min(
        calc(var(--bewly-widescreen-sidebar-column-width) / 2),
        calc((100vw - var(--bewly-widescreen-sidebar-column-width) - var(--bewly-widescreen-player-available-height)) / 2)
      )))) !important;
    }

    /* 竖屏放大后画面可能贴近侧栏，将按钮与预览图放在另一侧的黑边。 */
    #${ROOT_ID}[data-center-layout="true"] .bewly-vertical-video-zoom-host > .bewly-vertical-video-zoom-button,
    #${ROOT_ID}[data-center-layout="true"] .bewly-vertical-video-zoom-host > .bewly-vertical-video-zoom-control {
      --bewly-vertical-video-controls-side: left;
      left: var(--bew-space-3, 12px) !important;
      right: auto !important;
    }

    #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bewly-vertical-video-zoom-host > .bewly-vertical-video-zoom-button,
    #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bewly-vertical-video-zoom-host > .bewly-vertical-video-zoom-control {
      --bewly-vertical-video-controls-side: right;
      left: auto !important;
      right: var(--bew-space-3, 12px) !important;
    }

    /* 居中布局的播放器列横跨视口，因此发送栏需显式扣除当前可见侧栏列。
       使用 column-width 而非完整面板宽度，使收起、展开和手动宽度保持同步。 */
    #${ROOT_ID}[data-center-layout="true"] .bewly-widescreen-danmaku-dock {
      width: min(calc(100vw - var(--bewly-widescreen-sidebar-column-width)), 100%) !important;
      align-self: flex-start;
    }

    #${ROOT_ID}[data-center-layout="true"][data-sidebar-position="left"] .bewly-widescreen-danmaku-dock {
      margin-left: auto;
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

    #${ROOT_ID} .bewly-widescreen-sidebar-top,
    #${ROOT_ID} .bewly-widescreen-sidebar-details {
      position: relative;
      z-index: 0;
      flex: 0 0 auto;
      padding: var(--bew-space-2, 8px) var(--bew-space-3, 12px);
      border-bottom: 1px solid var(--bewly-widescreen-divider);
      background: var(--bewly-widescreen-surface-bg);
      overflow: visible;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-top {
      position: sticky;
      top: 0;
      z-index: 3;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-details {
      display: flex;
      flex-direction: column;
      gap: var(--bew-space-2, 8px);
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-details:not(:has(
      .bewly-widescreen-info-slot:not(:empty),
      .bewly-widescreen-description-slot:not(:empty):not(.is-empty),
      .bewly-widescreen-tags-slot:not(:empty)
    )) {
      display: none;
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

    #${ROOT_ID} .bewly-widescreen-info-slot:has([class*="mediainfo_mediaInfoWrap"]) {
      overflow: visible;
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

    /* PGC 播放页的 mediaInfo 原本按整栏宽度排版，搬入窄侧栏后收紧封面和
       标题间距，保留评分、简介与「追番」入口的可见性。 */
    #${ROOT_ID} .bewly-widescreen-info-slot [class*="mediainfo_mediaInfoWrap"] {
      display: flex !important;
      width: 100% !important;
      min-width: 0 !important;
      padding: 8px 0 !important;
      border-top: 0 !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot [class*="mediainfo_mediaCover"] {
      width: 72px !important;
      height: 96px !important;
      flex: 0 0 72px !important;
      margin-right: 8px !important;
      border-radius: var(--bew-radius-md, 8px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot [class*="mediainfo_mediaRight"] {
      min-width: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot [class*="mediainfo_mediaTitle"] {
      height: auto !important;
      max-height: 40px !important;
      padding-right: 0 !important;
      margin-bottom: 4px !important;
      color: var(--bewly-widescreen-text-primary) !important;
      font-size: var(--bew-font-size-title, 15px) !important;
      line-height: var(--bew-line-height-title, 22px) !important;
      -webkit-line-clamp: 2 !important;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot [class*="mediainfo_mediaDesc"] {
      height: auto !important;
      max-height: 32px !important;
      margin-bottom: 4px !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: var(--bew-font-size-caption, 12px) !important;
      line-height: var(--bew-line-height-caption, 16px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot [class*="mediainfo_media_desc_section"] {
      height: 36px !important;
      margin-bottom: 4px !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: var(--bew-font-size-caption, 12px) !important;
      line-height: var(--bew-line-height-caption, 18px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot [class*="mediainfo_bottomBar"],
    #${ROOT_ID} .bewly-widescreen-info-slot [class*="mediainfo_mediaToolbar"] {
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      min-width: 0 !important;
      margin-top: 4px !important;
    }

    /* 原站把追番工具栏绝对定位在标题右侧；窄侧栏改为独立一行。 */
    #${ROOT_ID} .bewly-widescreen-info-slot [class*="mediainfo_mediaToolbar"] {
      position: static !important;
      inset: auto !important;
      width: 100% !important;
    }

    /* 订阅状态菜单展开时越过下方选集/评论面板，关闭后恢复原层级。 */
    #${ROOT_ID} .bewly-widescreen-sidebar-details:has([class*="follow_followOptions"][class*="follow_shown"]) {
      z-index: 4;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot [class*="mediainfo_mediaToolbar"] > * {
      min-width: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-info-slot [class*="follow_btnFollow"] {
      padding: 4px 12px !important;
      font-size: var(--bew-font-size-caption, 12px) !important;
      line-height: var(--bew-line-height-caption, 16px) !important;
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
      color: var(--bewly-widescreen-text-primary);
    }

    #${ROOT_ID} .bewly-widescreen-description-slot:empty {
      display: none;
    }

    #${ROOT_ID} .bewly-widescreen-sidebar-details > .bewly-widescreen-info-slot {
      margin-bottom: 0;
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
    #${ROOT_ID} .bewly-widescreen-action-slot #arc_toolbar_report,
    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar {
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

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left {
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      min-width: 0 !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left > * {
      display: inline-flex !important;
      align-items: center !important;
      min-width: 24px !important;
      min-height: 28px !important;
      color: var(--bewly-widescreen-text-secondary) !important;
      font-size: var(--bew-font-size-caption, 12px) !important;
      line-height: var(--bew-line-height-caption, 16px) !important;
      white-space: nowrap !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left > *:hover {
      color: var(--bew-theme-color, #00aeec) !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-right {
      display: none !important;
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
      position: sticky;
      top: var(--bewly-widescreen-header-height, 0px);
      z-index: 2;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      flex: 0 0 auto;
      height: 42px;
      background: var(--bewly-widescreen-surface-bg);
      border-bottom: 1px solid var(--bewly-widescreen-divider);
    }

    /* 自动侧栏收起后仅部分面板留在视口内，Tab 应按可见列宽排列，
       避免稍后再看的「选集」入口被完整面板宽度挤出屏幕。 */
    #${ROOT_ID}[data-sidebar-mode="fit"]:not([data-sidebar-expanded="true"]) .bewly-widescreen-tabs {
      width: min(100%, max(0px, calc(var(--bewly-widescreen-sidebar-column-width) - var(--bew-space-2, 8px))));
      align-self: flex-start;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    #${ROOT_ID}[data-sidebar-position="left"][data-sidebar-mode="fit"]:not([data-sidebar-expanded="true"]) .bewly-widescreen-tabs {
      align-self: flex-end;
    }

    #${ROOT_ID} .bewly-widescreen-tab {
      position: relative;
      min-width: 0;
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
      /* 三个 Tab 共用按钮高度、底部偏移和安全间距，末条内容可滚到按钮上方。 */
      padding-bottom: calc(
        var(--bew-space-10, 40px)
        + var(--bewly-widescreen-back-to-top-inset)
        + var(--bew-space-2, 8px)
      );
    }

    #${ROOT_ID} .bewly-widescreen-panel {
      width: 100%;
      height: auto;
      overflow: visible;
      padding: 8px 8px 16px;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment {
      /* 评论移入侧栏后，加载遮罩需跟随侧栏背景。 */
      --bew-comment-replies-mask-bg: color-mix(in oklab, var(--bewly-widescreen-sidebar-bg), transparent 15%);
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment :is(
      bili-comments,
      bili-comment-box,
      bili-comment-renderer,
      .reply-list,
      .comment-list,
      .reply-box,
      .comment-header
    ) {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
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

    #${ROOT_ID} .bewly-widescreen-panel-comment :is(
      .reply-content,
      .reply-content-container,
      .sub-reply-content,
      .text,
      .message
    ) {
      max-width: 100% !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
      white-space: normal !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment img {
      max-width: 100% !important;
      height: auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment .user-info,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-user-info {
      min-width: 0 !important;
      max-width: 100% !important;
      flex-wrap: wrap !important;
      gap: 4px 6px !important;
    }

    /* 窄侧栏允许评论元信息按完整项目换行，但 IP、回复等短标签自身不拆字。 */
    #${ROOT_ID} .bewly-widescreen-panel-comment .reply-info,
    #${ROOT_ID} .bewly-widescreen-panel-comment .sub-reply-info {
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      min-width: 0 !important;
      max-width: 100% !important;
      column-gap: var(--bew-space-3, 12px) !important;
      row-gap: var(--bew-space-1, 4px) !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel-comment :is(
      .reply-info,
      .sub-reply-info
    ) > *,
    #${ROOT_ID} .bewly-widescreen-panel-comment :is(
      .reply-time,
      .sub-reply-time,
      .reply-time-location,
      .reply-like,
      .sub-reply-like,
      .reply-dislike,
      .sub-reply-dislike,
      .reply-btn,
      .sub-reply-btn,
      .reply-operation
    ) {
      flex: 0 0 auto !important;
      width: max-content !important;
      min-width: max-content !important;
      white-space: nowrap !important;
      word-break: keep-all !important;
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

    @container bewly-widescreen-sidebar (max-width: 400px) {
      #${ROOT_ID} .bewly-widescreen-title {
        font-size: var(--bew-font-size-title, 15px);
        line-height: var(--bew-line-height-title, 22px);
      }

      #${ROOT_ID} .bewly-widescreen-sidebar-top,
      #${ROOT_ID} .bewly-widescreen-sidebar-details {
        padding-inline: var(--bew-space-2, 8px);
      }

      #${ROOT_ID} .bewly-widescreen-panel {
        padding-inline: var(--bew-space-1, 4px);
      }

      #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-main,
      #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left {
        flex-wrap: wrap !important;
        row-gap: var(--bew-space-1, 4px) !important;
      }
    }
  `)
}

function updateAspectRatio() {
  const video = getVideoElement()
  const aspect = video?.videoWidth && video.videoHeight
    ? video.videoWidth / video.videoHeight
    : 16 / 9
  const layoutAspect = aspect

  state?.root.style.setProperty('--bewly-widescreen-aspect', String(aspect))
  state?.root.style.setProperty('--bewly-widescreen-layout-aspect', String(layoutAspect))
  updateSidebarLayoutState()
  if (state)
    schedulePlayerResizeSync(state)
}

function getSidebarResizeBounds() {
  // 放不下播放器和常规侧栏时，将侧栏宽度下限缩至窗口的 40%。
  const minWidth = Math.min(SIDEBAR_RESIZE_MIN_WIDTH, Math.floor(window.innerWidth * 0.4))
  const maxWidth = Math.max(
    minWidth,
    Math.min(
      SIDEBAR_RESIZE_MAX_WIDTH,
      window.innerWidth * 0.6,
      window.innerWidth - PLAYER_RESIZE_MIN_WIDTH,
    ),
  )
  return { minWidth, maxWidth }
}

function applyCustomSidebarWidth(width: number, persist = false) {
  if (!state)
    return

  const { minWidth, maxWidth } = getSidebarResizeBounds()
  const requestedWidth = settings.value.enableBewlyWidescreenSidebarResize
    && Number.isFinite(width)
    && width > 0
    ? Math.round(width)
    : 0
  // 恢复设置时保留原宽度，窗口放大后仍能恢复；用户调宽时才记住边界内的值。
  const normalizedWidth = persist && requestedWidth
    ? Math.round(Math.min(Math.max(requestedWidth, minWidth), maxWidth))
    : requestedWidth
  state.customSidebarWidth = normalizedWidth

  if (!normalizedWidth) {
    delete state.root.dataset.sidebarCustomWidth
    state.root.style.removeProperty('--bewly-widescreen-sidebar-custom-width')
    state.sidebarResizeHandle.removeAttribute('aria-valuenow')
  }
  if (persist)
    localSettings.value.bewlyWidescreenSidebarWidth = normalizedWidth

  updateSidebarLayoutState()
  schedulePlayerResizeSync(state)
}

function resetCustomSidebarWidth() {
  applyCustomSidebarWidth(0, true)
}

function updateSidebarLayoutState() {
  if (!state)
    return

  if (state.customSidebarWidth > 0)
    applyCustomSidebarWidthStyle(state)

  const availableHeight = state.playerFrame.getBoundingClientRect().height
  const layoutAspect = Number.parseFloat(state.root.style.getPropertyValue('--bewly-widescreen-layout-aspect')) || 16 / 9
  const targetWidth = availableHeight * layoutAspect
  const narrowWidth = Math.min(
    Math.max(SIDEBAR_NARROW_MIN_WIDTH, window.innerWidth * 0.26),
    SIDEBAR_NARROW_MAX_WIDTH,
    window.innerWidth * 0.4,
  )
  const fitWidth = Math.min(
    Math.max(window.innerWidth - targetWidth, 0),
    narrowWidth,
  )
  const gapWidth = Math.max((window.innerWidth - targetWidth) / 2, 0)
  const hasCustomWidth = state.customSidebarWidth > 0
  // 只根据窗口能否同时容纳 16:9 全高视频与正常侧栏判断超宽余量，避免把
  // 普通 16:9 窗口播放 4:3 或竖屏视频时产生的空白误判成超宽屏。
  const ultrawideSpareWidth = Math.max(window.innerWidth - availableHeight * (16 / 9), 0)
  const wideVideoPriority = !hasCustomWidth
    && state.sidebarMode === 'fit'
    && ultrawideSpareWidth >= SIDEBAR_NARROW_MIN_WIDTH
  state.root.dataset.wideVideoPriority = String(wideVideoPriority)
  state.root.dataset.sidebarEdgeReveal = String(
    !settings.value.enableBewlyWidescreenSidebarResize
    && !hasCustomWidth
    && state.sidebarMode === 'fit'
    && fitWidth <= 1,
  )

  const { minWidth, maxWidth } = getSidebarResizeBounds()
  const customWidth = Math.min(Math.max(state.customSidebarWidth, minWidth), maxWidth)
  const expandedWidth = Math.min(Math.max(480, window.innerWidth * 0.32), 600, window.innerWidth * 0.4)
  const visibleSidebarWidth = hasCustomWidth
    ? customWidth
    : state.sidebarMode === 'narrow'
      ? narrowWidth
      : wideVideoPriority
        ? state.root.dataset.sidebarExpanded === 'true' ? expandedWidth : Math.min(SIDEBAR_VIDEO_PRIORITY_COLLAPSED_WIDTH, fitWidth)
        : fitWidth

  // 视频居中基准与侧栏策略相互独立：只有当前可见侧栏确实能放入单侧空白时
  // 才使用视口居中，否则安全回退到侧栏外区域居中。
  const centerLayout = !!settings.value.bewlyWidescreenCenterVerticalVideo
    && visibleSidebarWidth > 1
    && gapWidth >= visibleSidebarWidth
  state.root.dataset.centerLayout = String(centerLayout)

  // 展开入口只由自动侧栏布局决定，视频居中方式不再改变侧栏状态。
  const showToggle = !settings.value.enableBewlyWidescreenSidebarResize && !hasCustomWidth
    && (state.sidebarMode === 'narrow' || wideVideoPriority || narrowWidth - fitWidth > 1)
  state.root.dataset.sidebarToggleVisible = String(showToggle)

  // 自动布局也要提供可访问的当前值，双击恢复后仍可继续用键盘调宽。
  state.sidebarResizeHandle.setAttribute('aria-valuemin', String(Math.round(minWidth)))
  state.sidebarResizeHandle.setAttribute('aria-valuemax', String(Math.round(maxWidth)))
  state.sidebarResizeHandle.setAttribute('aria-valuenow', String(Math.round(state.sidebarEl.getBoundingClientRect().width)))
}

function applyCustomSidebarWidthStyle(currentState: BewlyWidescreenState) {
  const { minWidth, maxWidth } = getSidebarResizeBounds()
  const clampedWidth = Math.round(Math.min(Math.max(currentState.customSidebarWidth, minWidth), maxWidth))
  currentState.root.dataset.sidebarCustomWidth = 'true'
  currentState.root.style.setProperty('--bewly-widescreen-sidebar-custom-width', `${clampedWidth}px`)
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
  if (currentState.resizeSyncFrame !== undefined)
    cancelAnimationFrame(currentState.resizeSyncFrame)
  currentState.resizeSyncFrame = undefined
}

function schedulePlayerResizeSync(currentState: BewlyWidescreenState) {
  if (state !== currentState || currentState.resizeSyncFrame !== undefined)
    return

  // 多个布局来源合并为一帧，且只有播放器尺寸真正变化时才通知原站。
  // 避免每次 ResizeObserver 回调都向整页广播五轮 resize。
  currentState.resizeSyncFrame = requestAnimationFrame(() => {
    currentState.resizeSyncFrame = undefined
    if (state !== currentState || isPlayerShowingEndingRecommendation())
      return

    const { width, height } = currentState.playerSlot.getBoundingClientRect()
    if (width === currentState.lastPlayerWidth && height === currentState.lastPlayerHeight)
      return

    currentState.lastPlayerWidth = width
    currentState.lastPlayerHeight = height
    window.dispatchEvent(new Event('resize'))
  })
}

function syncSidebarLayoutMetrics(currentState: BewlyWidescreenState) {
  const { sidebarEl, sidebarTop, tabButtons } = currentState
  const headerHeight = sidebarTop.getBoundingClientRect().height
  const tabsHeight = tabButtons.comment.parentElement?.getBoundingClientRect().height ?? 0
  // clientLeft 已包含左边框；侧栏位于左侧时，右边框也需纳入按钮定位。
  const rightInset = sidebarEl.offsetWidth - sidebarEl.clientWidth - sidebarEl.clientLeft
  // 标题换行、UP 信息异步加载和侧栏调宽后，Tab 始终贴在信息栏下方。
  const metrics = {
    '--bewly-widescreen-header-height': `${headerHeight}px`,
    '--bewly-widescreen-sticky-height': `${headerHeight + tabsHeight}px`,
    '--bewly-widescreen-sidebar-right-inset': `${rightInset}px`,
  }
  for (const [property, value] of Object.entries(metrics)) {
    if (sidebarEl.style.getPropertyValue(property) !== value)
      sidebarEl.style.setProperty(property, value)
  }
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
    syncSidebarLayoutMetrics(currentState)
  })
  currentState.resizeObserver.observe(currentState.root)
  currentState.resizeObserver.observe(currentState.playerSlot)
  currentState.resizeObserver.observe(currentState.danmakuDock)
  currentState.resizeObserver.observe(currentState.descriptionSlot)
  currentState.resizeObserver.observe(currentState.sidebarEl)
  currentState.resizeObserver.observe(currentState.sidebarTop, { box: 'border-box' })
  const tablist = currentState.tabButtons.comment.parentElement
  if (tablist)
    currentState.resizeObserver.observe(tablist, { box: 'border-box' })
  syncSidebarLayoutMetrics(currentState)
  updateAspectRatio()
  schedulePlayerResizeSync(currentState)
}

function setupSidebarInteractionTracking(currentState: BewlyWidescreenState) {
  const sidebar = currentState.sidebarEl
  const playerFrame = currentState.playerFrame
  const tablist = currentState.tabButtons.comment.parentElement

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

  function isAtHiddenSidebarEdge(event: PointerEvent) {
    if (currentState.root.dataset.sidebarEdgeReveal !== 'true')
      return false

    const rect = currentState.root.getBoundingClientRect()
    if (!isPointInRect(event, rect))
      return false

    // 给窗口边缘保留 2px 的命中容差，不额外占用视频或侧栏空间。
    return currentState.sidebarPosition === 'left'
      ? event.clientX <= rect.left + 2
      : event.clientX >= rect.right - 2
  }

  function expandAtWindowEdge(event: PointerEvent) {
    if (isAtHiddenSidebarEdge(event))
      expandSidebar()
  }

  function expandSidebar(event?: PointerEvent) {
    if (settings.value.enableBewlyWidescreenSidebarResize || currentState.sidebarMode !== 'fit')
      return
    if (currentState.root.dataset.sidebarExpanded === 'true')
      return
    // 点击前不搬动收起状态的 Tab，避免展开动画把指针下的目标换成相邻项。
    // 移入内容区仍可展开；点击 Tab 则先完成选中，再展开面板。
    if (event && tablist && isPointInRect(event, tablist.getBoundingClientRect()))
      return
    currentState.root.dataset.sidebarExpanded = 'true'
    updateSidebarLayoutState()
    schedulePlayerResizeSync(currentState)
  }

  function collapseSidebar(e: PointerEvent) {
    if (settings.value.enableBewlyWidescreenSidebarResize || currentState.sidebarMode !== 'fit')
      return
    // 展开动画期间侧栏尚未移入视口，边缘事件仍可能落在播放器上。
    if (isAtHiddenSidebarEdge(e))
      return
    if (isPointInVisibleVideoArea(e) && currentState.root.dataset.sidebarExpanded === 'true') {
      currentState.root.dataset.sidebarExpanded = 'false'
      updateSidebarLayoutState()
      schedulePlayerResizeSync(currentState)
    }
  }

  const expandAfterTabClick = () => expandSidebar()
  sidebar.addEventListener('pointerenter', expandSidebar)
  sidebar.addEventListener('pointermove', expandSidebar)
  tablist?.addEventListener('click', expandAfterTabClick)
  playerFrame.addEventListener('pointerenter', collapseSidebar)
  playerFrame.addEventListener('pointermove', collapseSidebar)
  currentState.root.addEventListener('pointerenter', expandAtWindowEdge)
  currentState.root.addEventListener('pointermove', expandAtWindowEdge)

  currentState.sidebarInteractionCleanup = () => {
    sidebar.removeEventListener('pointerenter', expandSidebar)
    sidebar.removeEventListener('pointermove', expandSidebar)
    tablist?.removeEventListener('click', expandAfterTabClick)
    playerFrame.removeEventListener('pointerenter', collapseSidebar)
    playerFrame.removeEventListener('pointermove', collapseSidebar)
    currentState.root.removeEventListener('pointerenter', expandAtWindowEdge)
    currentState.root.removeEventListener('pointermove', expandAtWindowEdge)
    delete currentState.root.dataset.sidebarExpanded
  }
}

function setupSidebarResize(currentState: BewlyWidescreenState) {
  const { root, sidebarEl, sidebarResizeHandle } = currentState
  let resizeStart: { clientX: number, width: number } | undefined
  let hasResized = false

  function widthFromPointer(clientX: number) {
    const start = resizeStart!
    const delta = clientX - start.clientX
    const width = start.width + (currentState.sidebarPosition === 'left' ? delta : -delta)
    const { minWidth, maxWidth } = getSidebarResizeBounds()
    return Math.min(Math.max(width, minWidth), maxWidth)
  }

  function onPointerMove(event: PointerEvent) {
    if (!resizeStart || !sidebarResizeHandle.hasPointerCapture(event.pointerId))
      return

    if (!hasResized && event.clientX === resizeStart.clientX)
      return
    event.preventDefault()
    hasResized = true
    applyCustomSidebarWidth(widthFromPointer(event.clientX))
  }

  function finishPointerResize(event: PointerEvent) {
    if (!resizeStart || !sidebarResizeHandle.hasPointerCapture(event.pointerId))
      return

    sidebarResizeHandle.releasePointerCapture(event.pointerId)
    delete root.dataset.sidebarResizing
    if (hasResized) {
      delete root.dataset.sidebarExpanded
      applyCustomSidebarWidth(widthFromPointer(event.clientX), true)
    }
    resizeStart = undefined
  }

  function cancelPointerResize(event: PointerEvent) {
    if (sidebarResizeHandle.hasPointerCapture(event.pointerId))
      sidebarResizeHandle.releasePointerCapture(event.pointerId)
    delete root.dataset.sidebarResizing
    if (hasResized) {
      delete root.dataset.sidebarExpanded
      applyCustomSidebarWidth(currentState.customSidebarWidth, true)
    }
    resizeStart = undefined
  }

  function onPointerDown(event: PointerEvent) {
    if (!settings.value.enableBewlyWidescreenSidebarResize
      || event.button !== 0 || !event.isPrimary) {
      return
    }

    event.preventDefault()
    // 保留指针在分隔线内的落点；单击不改宽，避免第二次点击落到移动后的分隔线外。
    resizeStart = { clientX: event.clientX, width: sidebarEl.getBoundingClientRect().width }
    hasResized = false
    root.dataset.sidebarResizing = 'true'
    sidebarResizeHandle.setPointerCapture(event.pointerId)
    updateSidebarLayoutState()
    schedulePlayerResizeSync(currentState)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!settings.value.enableBewlyWidescreenSidebarResize)
      return

    const currentWidth = sidebarEl.getBoundingClientRect().width
    const { minWidth, maxWidth } = getSidebarResizeBounds()
    let nextWidth: number | undefined

    if (event.key === 'Home')
      nextWidth = minWidth
    else if (event.key === 'End')
      nextWidth = maxWidth
    else if (event.key === 'ArrowLeft')
      nextWidth = currentWidth + (currentState.sidebarPosition === 'right' ? SIDEBAR_RESIZE_KEYBOARD_STEP : -SIDEBAR_RESIZE_KEYBOARD_STEP)
    else if (event.key === 'ArrowRight')
      nextWidth = currentWidth + (currentState.sidebarPosition === 'left' ? SIDEBAR_RESIZE_KEYBOARD_STEP : -SIDEBAR_RESIZE_KEYBOARD_STEP)

    if (nextWidth === undefined)
      return

    event.preventDefault()
    event.stopPropagation()
    applyCustomSidebarWidth(nextWidth, true)
  }

  function onDoubleClick(event: MouseEvent) {
    event.preventDefault()
    resetCustomSidebarWidth()
  }

  sidebarResizeHandle.addEventListener('pointerdown', onPointerDown)
  sidebarResizeHandle.addEventListener('pointermove', onPointerMove)
  sidebarResizeHandle.addEventListener('pointerup', finishPointerResize)
  sidebarResizeHandle.addEventListener('pointercancel', cancelPointerResize)
  sidebarResizeHandle.addEventListener('keydown', onKeyDown)
  sidebarResizeHandle.addEventListener('dblclick', onDoubleClick)

  currentState.sidebarResizeCleanup = () => {
    sidebarResizeHandle.removeEventListener('pointerdown', onPointerDown)
    sidebarResizeHandle.removeEventListener('pointermove', onPointerMove)
    sidebarResizeHandle.removeEventListener('pointerup', finishPointerResize)
    sidebarResizeHandle.removeEventListener('pointercancel', cancelPointerResize)
    sidebarResizeHandle.removeEventListener('keydown', onKeyDown)
    sidebarResizeHandle.removeEventListener('dblclick', onDoubleClick)
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
  const movedMediaInfo = currentState.infoSlot.querySelector<HTMLElement>('[class*="mediainfo_mediaInfoWrap"]')
  // 番剧信息包含简介和评分，整块留在滚动区；保留原生 React 节点与事件。
  const infoParent = movedMediaInfo ? currentState.sidebarDetails : currentState.sidebarTop
  if (currentState.infoSlot.parentElement !== infoParent)
    infoParent.insertBefore(currentState.infoSlot, movedMediaInfo ? currentState.descriptionSlot : currentState.upSlot)
  if (movedMediaInfo)
    bindReactEventBridge(movedMediaInfo)

  moveOrReplaceNode(selectors.toolbar, currentState.toolbarSlot, currentState.movedNodes)
  const movedToolbar = currentState.toolbarSlot.querySelector<HTMLElement>('.toolbar')
  if (movedToolbar)
    bindReactEventBridge(movedToolbar)

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
  currentState.sidebarResizeCleanup?.()
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
  // DOM 已恢复；由原生模式切换按需读取布局，避免在捕获阶段强制整页回流。
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

  const { root, playerSlot, playerFrame, danmakuDock, sidebarEl, sidebarResizeHandle, sidebarTop, sidebarDetails, infoSlot, upSlot, toolbarSlot, descriptionSlot, tagsSlot, panels, tabButtons, sidebarToggleButton } = createRoot(sidebarPosition)
  const styleEl = injectLayoutStyle()
  const movedNodes: MovedNode[] = []

  const nextState: BewlyWidescreenState = {
    root,
    playerSlot,
    playerFrame,
    danmakuDock,
    sidebarEl,
    sidebarResizeHandle,
    sidebarTop,
    sidebarDetails,
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
    customSidebarWidth: 0,
    descriptionExpanded: false,
  }

  state = nextState
  document.body.classList.add(BODY_CLASS)
  root.dataset.sidebarResizable = String(settings.value.enableBewlyWidescreenSidebarResize)

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

  applyCustomSidebarWidth(settings.value.enableBewlyWidescreenSidebarResize
    ? localSettings.value.bewlyWidescreenSidebarWidth
    : 0)
  setSidebarMode(settings.value.bewlyWidescreenSidebarPriority === 'sidebar' ? 'narrow' : 'fit')

  moveNode(player, playerFrame, movedNodes)
  fillSidebar(nextState)
  setActiveTab('comment')
  setupAspectObservers(nextState)
  setupDomRefreshObserver(nextState)
  setupSidebarInteractionTracking(nextState)
  setupSidebarResize(nextState)
  setupSidebarToggleAutoHide(nextState)
  removeSwitchHint()
  removeWidescreenLoading()

  const application = pendingApplication
  pendingApplication = undefined
  application?.onApplied()

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

    if (!canApplyPendingLayout())
      return

    if (isReadyForLayout() && applyNow(pendingSidebarPosition))
      return

    readyRetryCount++
    if (readyRetryCount <= READY_RETRY_MAX)
      scheduleReadyRetry()
    else
      exitBewlyWidescreen()
  }, delay)
}

function canApplyPendingLayout() {
  if (!pendingApplication || pendingApplication.shouldApply())
    return true

  // 自动进页任务可能跨越视频结束、后台恢复或 SPA 切集；在搬 DOM 前取消。
  exitBewlyWidescreen()
  return false
}

function startAfterPageLoad(sidebarPosition: 'left' | 'right' = 'right') {
  if (state)
    return

  if (!canApplyPendingLayout())
    return

  waitingForLoad = false
  clearPageLoadHandler()
  clearLoadFallbackTimer()
  readyRetryCount = 0
  pendingSidebarPosition = sidebarPosition
  if (isReadyForLayout() && applyNow(sidebarPosition))
    return

  scheduleReadyRetry()
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
  application?: PlayerModeApplication,
) {
  ensureNativePlayerModeGuard()
  installSettingsWatchers()
  if (state || waitingForLoad || readyRetryTimer)
    return

  pendingApplication = application
  if (!canApplyPendingLayout())
    return

  pendingSidebarPosition = sidebarPosition
  if (showLoading) {
    const video = getVideoElement()
    if (!video || video.paused || video.ended)
      showWidescreenLoading()
  }

  // 慢图片等非关键资源不应阻塞宽屏；播放器数据就绪即可开始布局。
  if (document.readyState === 'complete' || isReadyForLayout()) {
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
  }, PAGE_LOAD_FALLBACK_TIMEOUT)
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
  pendingApplication = undefined

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
