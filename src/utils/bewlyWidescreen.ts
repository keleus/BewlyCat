import browser from 'webextension-polyfill'

import { injectCSS } from './main'
import { getVideoElement } from './player'

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
  upSlot: HTMLElement
  toolbarSlot: HTMLElement
  descriptionSlot: HTMLElement
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
const BODY_CLASS = 'bewly-widescreen-active'
const EMPTY_CLASS = 'bewly-widescreen-empty'
const EPISODE_SECTION_CLASS = 'bewly-widescreen-episode-section'
const EPISODE_ITEM_SELECTOR = '.video-pod__item, .multi-page__item, .page-item, .list-item, .episode-item, .section-item, .collect-item'
const SIDEBAR_NARROW_MIN_WIDTH = 360
const SIDEBAR_NARROW_MAX_WIDTH = 460
const MOBILE_BREAKPOINT = 900
const LOAD_SETTLE_DELAY = 1200
const LOADING_FADE_DURATION = 240
const PREPARED_LOADING_TIMEOUT = 30_000
const READY_RETRY_INTERVAL = 500
const READY_RETRY_MAX = 30
const SIDEBAR_REFRESH_DELAY = 800
const SIDEBAR_TOGGLE_IDLE_DELAY = 1000
const BILIBILI_ACTION_ANIMATION_HUE = 196
const COMMENT_ROOT_ID_SELECTOR = '#comment-module, #comment-body, #commentapp'
const COMMENT_NESTED_UI_SELECTOR = '.reply-item, .sub-reply-item, bili-comment-renderer'
// Light-DOM markers only. Modern bili-comments mounts most UI in shadow roots,
// so readiness must not require these descendants to exist.
const COMMENT_CONTENT_MARKER_SELECTOR = 'bili-comments, bili-comment-box, bili-comment-renderer, .reply-list, .comment-list, .reply-box, .comment-header'

let state: BewlyWidescreenState | null = null
let loadingOverlay: HTMLElement | null = null
let loadingStyleEl: HTMLStyleElement | null = null
let loadingFadeTimer: ReturnType<typeof setTimeout> | undefined
let loadingPlaybackCleanup: (() => void) | undefined
let loadingPreparationFallbackTimer: ReturnType<typeof setTimeout> | undefined
let loadingMayDismissOnPlaying = false
let loadingSuppressedUntilExit = false
let readyRetryTimer: ReturnType<typeof setTimeout> | undefined
let loadFallbackTimer: ReturnType<typeof setTimeout> | undefined
let sidebarRefreshTimer: ReturnType<typeof setTimeout> | undefined
let pageLoadHandler: (() => void) | undefined
let readyRetryCount = 0
let waitingForLoad = false
let pendingSidebarPosition: 'left' | 'right' = 'right'

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
    '.video-pod',
    '.video-pod__body',
    '.multi-page',
    '.multi-page-v1',
    '.base-video-sections-v1',
    '.video-sections-v1',
    '.video-sections-content-list',
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

function restoreMovedNodes(movedNodes: MovedNode[]) {
  for (const { node, placeholder } of [...movedNodes].reverse()) {
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
    ? (isRight ? '显示窄右栏' : '显示窄左栏')
    : (isRight ? '收起右栏' : '收起左栏')
  state.sidebarToggleButton.setAttribute('aria-label', state.sidebarToggleButton.title)
  updateSidebarToggleState()
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
  closeButton.textContent = '退出'
  closeButton.addEventListener('click', () => exitBewlyWidescreen())

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
  label.textContent = '正在加载宽屏模式…'
  content.appendChild(label)

  overlay.appendChild(content)
  const mountTarget = document.body ?? document.documentElement
  mountTarget.appendChild(overlay)
  loadingOverlay = overlay

  const handlePlaying = (event: Event) => {
    const video = event.target
    if (video instanceof HTMLVideoElement
      && video === getVideoElement()
      && shouldDismissLoadingForPlaying(video)) {
      dismissWidescreenLoadingForPlaying()
    }
  }
  document.addEventListener('playing', handlePlaying, true)
  loadingPlaybackCleanup = () => {
    document.removeEventListener('playing', handlePlaying, true)
    loadingPlaybackCleanup = undefined
  }
}

function shouldDismissLoadingForPlaying(video: HTMLVideoElement) {
  return loadingMayDismissOnPlaying
    || video.autoplay
    || video.hasAttribute('autoplay')
    || navigator.userActivation?.hasBeenActive !== true
}

function dismissWidescreenLoadingForPlaying() {
  loadingSuppressedUntilExit = true
  removeWidescreenLoading()
}

function removeWidescreenLoading(immediate = false) {
  loadingPlaybackCleanup?.()
  loadingMayDismissOnPlaying = false

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

export function prepareBewlyWidescreenLoading(allowPlayingDismiss = false) {
  if (state || loadingSuppressedUntilExit)
    return

  loadingMayDismissOnPlaying ||= allowPlayingDismiss
  showWidescreenLoading()
  const video = getVideoElement()
  if (loadingOverlay
    && video
    && !video.paused
    && !video.ended
    && shouldDismissLoadingForPlaying(video)) {
    dismissWidescreenLoadingForPlaying()
    return
  }

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
  const upSlot = document.createElement('div')
  upSlot.className = 'bewly-widescreen-up-slot'
  const toolbarSlot = document.createElement('div')
  toolbarSlot.className = 'bewly-widescreen-action-slot'
  const descriptionSlot = document.createElement('div')
  descriptionSlot.className = 'bewly-widescreen-description-slot'
  sidebarTop.append(createSidebarToolbar(), upSlot, toolbarSlot, descriptionSlot)

  const tablist = document.createElement('div')
  tablist.className = 'bewly-widescreen-tabs'
  tablist.setAttribute('role', 'tablist')

  const tabButtons = {
    comment: createTabButton('comment', '评论'),
    danmaku: createTabButton('danmaku', '弹幕'),
    playlist: createTabButton('playlist', '选集'),
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

  return { root, playerSlot, playerFrame, danmakuDock, sidebarEl: sidebar, sidebarTop, upSlot, toolbarSlot, descriptionSlot, panels, tabButtons, sidebarToggleButton }
}

function injectLayoutStyle() {
  return injectCSS(`
    body.${BODY_CLASS} {
      overflow: hidden !important;
      background: #0f1115 !important;
    }

    body.${BODY_CLASS} .bili-header,
    body.${BODY_CLASS} #biliMainHeader,
    body.${BODY_CLASS} #bili-header-container,
    body.${BODY_CLASS} .fixed-sidenav-storage,
    body.${BODY_CLASS} .mini-player-window,
    body.${BODY_CLASS} .bewly-watch-later-btn {
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
      overflow: hidden;
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
    }

    #${ROOT_ID} .bewly-widescreen-toolbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
    }

    #${ROOT_ID} .bewly-widescreen-close {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      padding: 0;
      color: var(--bewly-widescreen-text-secondary);
      background: var(--bewly-widescreen-control-bg);
      cursor: pointer;
      font-size: 0;
      line-height: 1;
      flex: 0 0 auto;
    }

    #${ROOT_ID} .bewly-widescreen-close::before,
    #${ROOT_ID} .bewly-widescreen-close::after {
      content: "";
      position: absolute;
      width: 13px;
      height: 2px;
      border-radius: 2px;
      background: currentColor;
      transform: rotate(45deg);
    }

    #${ROOT_ID} .bewly-widescreen-close::after {
      transform: rotate(-45deg);
    }

    #${ROOT_ID} .bewly-widescreen-close:hover {
      color: var(--bewly-widescreen-text-primary);
      background: var(--bewly-widescreen-control-hover-bg);
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

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      flex: 1 1 auto !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-main {
      display: grid !important;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      align-items: center !important;
      justify-items: center !important;
      gap: 0;
      width: 100% !important;
      min-width: 0 !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .toolbar-left-item-wrap {
      display: flex !important;
      justify-content: center !important;
      position: relative !important;
      min-width: 0 !important;
      width: 100% !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-left-item,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right-item,
    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 4px !important;
      position: relative !important;
      flex: 0 1 auto !important;
      min-width: 0 !important;
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

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-item-icon {
      width: 18px !important;
      height: 18px !important;
      margin-right: 0 !important;
      flex: 0 0 auto !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-like-icon {
      width: 19px !important;
      height: 19px !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-item-text,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-like-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-coin-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-fav-info,
    #${ROOT_ID} .bewly-widescreen-action-slot .video-share-info {
      display: inline-flex !important;
      align-items: center !important;
      margin-left: 0 !important;
      max-width: 52px !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .video-toolbar-right {
      display: none !important;
    }

    #${ROOT_ID} .bewly-widescreen-action-slot .bewly-watch-later-btn {
      display: none !important;
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
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      background: var(--bewly-widescreen-sidebar-bg);
    }

    #${ROOT_ID} .bewly-widescreen-panel {
      width: 100%;
      height: 100%;
      overflow: auto;
      overscroll-behavior: contain;
      padding: 8px 8px 16px;
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

    /* B 站的选集组件会继承普通视频页的固定高度。宽屏模式下由整个
       选集面板负责滚动，列表便可以使用直到视口底部的全部剩余空间。 */
    #${ROOT_ID} .bewly-widescreen-panel-playlist {
      overflow-y: auto;
      scrollbar-gutter: stable;
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
    #${ROOT_ID} .bewly-widescreen-panel-playlist [class*="imageList_wrap"] {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
    }

    #${ROOT_ID} .bewly-widescreen-panel [class*="eplist_ep_list_wrapper"],
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
  updateSidebarToggleState()
  if (state)
    schedulePlayerResizeSync(state)
}

function updateSidebarToggleState() {
  if (!state)
    return

  const availableHeight = state.playerFrame.getBoundingClientRect().height
  const layoutAspect = Number.parseFloat(state.root.style.getPropertyValue('--bewly-widescreen-layout-aspect')) || 16 / 9
  const fitWidth = Math.min(
    Math.max(window.innerWidth - availableHeight * layoutAspect, 0),
    window.innerWidth * 0.4,
  )
  const narrowWidth = Math.min(
    Math.max(SIDEBAR_NARROW_MIN_WIDTH, window.innerWidth * 0.26),
    SIDEBAR_NARROW_MAX_WIDTH,
    window.innerWidth * 0.4,
  )
  const needsHover = narrowWidth - fitWidth > 1
  state.root.dataset.sidebarToggleVisible = String(needsHover)
}

function updateDanmakuDockHeight() {
  if (!state)
    return

  const height = state.danmakuDock.childElementCount > 0
    ? state.danmakuDock.getBoundingClientRect().height
    : 0

  state.root.style.setProperty('--bewly-widescreen-danmaku-height', `${height}px`)
  updateSidebarToggleState()
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

function resolveCssColor(value: string) {
  if (!value)
    return null

  const probe = document.createElement('span')
  probe.style.position = 'fixed'
  probe.style.pointerEvents = 'none'
  probe.style.opacity = '0'
  probe.style.color = value
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()

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
  currentState.mutationObserver = new MutationObserver(() => {
    if (!state || state !== currentState)
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

  currentState.panels.danmaku.scrollTo({ top: 0, behavior: 'smooth' })
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
  toggleButton.textContent = currentState.descriptionExpanded ? '收起' : '展开更多'
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

  moveOrReplaceNode(selectors.toolbar, currentState.toolbarSlot, currentState.movedNodes)

  moveOrReplaceNode(selectors.upPanel, currentState.upSlot, currentState.movedNodes)

  const descriptionResult = moveOrReplaceNode(selectors.description, currentState.descriptionSlot, currentState.movedNodes)
  if (descriptionResult.changed)
    currentState.descriptionExpanded = false
  syncDescription(currentState)

  moveDanmakuInput(currentState)
  const commentResult = moveCommentRoot(currentState.panels.comment, currentState.movedNodes)
  if (!commentResult.found) {
    ensureEmptyPanel(currentState.panels.comment, '评论区加载中')
  }
  else {
    clearEmptyPanel(currentState.panels.comment)
    shortenCommentTimes(currentState.panels.comment)
  }

  const danmakuResult = moveOrReplaceNode(selectors.danmaku, currentState.panels.danmaku, currentState.movedNodes)
  if (!danmakuResult.found)
    ensureEmptyPanel(currentState.panels.danmaku, '弹幕列表加载中')
  else
    clearEmptyPanel(currentState.panels.danmaku)

  movePlaylistControls(currentState.panels.playlist, currentState.movedNodes)
  moveMatchingNodes(['[class*="eplist_ep_list_wrapper"]'], currentState.panels.playlist, currentState.movedNodes)
  const existingPlaylist = currentState.panels.playlist.querySelector(selectors.playlist.join(','))
  const existingRecommend = currentState.panels.playlist.querySelector(selectors.recommend.join(','))
  const playlist = existingPlaylist ? null : findMovable(selectors.playlist)
  const playlistMoved = existingPlaylist || moveNode(playlist, currentState.panels.playlist, currentState.movedNodes)
  // 推荐列表与选集是同一侧栏面板中的两个连续区块；即使选集已经存在，
  // 也要继续搬运推荐列表，保证推荐内容显示在选集下方。
  const recommend = existingRecommend ? null : findMovable(selectors.recommend)
  const recommendMoved = existingRecommend || moveNode(recommend, currentState.panels.playlist, currentState.movedNodes)
  placeRecommendAfterPlaylist(currentState.panels.playlist, currentState.movedNodes)
  syncEpisodeSectionMarker(currentState.panels.playlist, currentState.movedNodes)
  const hasPlaylist = !!(existingPlaylist || playlistMoved)
  const hasRecommend = !!(existingRecommend || recommendMoved)
  currentState.tabButtons.playlist.textContent = hasPlaylist ? '选集' : '推荐'
  if (!hasPlaylist && !hasRecommend)
    ensureEmptyPanel(currentState.panels.playlist, '列表加载中')
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
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []

  while (walker.nextNode()) {
    if (walker.currentNode instanceof Text)
      textNodes.push(walker.currentNode)
  }

  for (const textNode of textNodes) {
    const value = textNode.nodeValue
    if (!value || !/\d{4}-\d{2}-\d{2}/.test(value))
      continue

    textNode.nodeValue = value.replace(/\b\d{4}-(\d{2})-(\d{2})\b/g, '$1-$2')
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

  const { root, playerSlot, playerFrame, danmakuDock, sidebarEl, sidebarTop, upSlot, toolbarSlot, descriptionSlot, panels, tabButtons, sidebarToggleButton } = createRoot(sidebarPosition)
  const styleEl = injectLayoutStyle()
  const movedNodes: MovedNode[] = []

  const nextState: BewlyWidescreenState = {
    root,
    playerSlot,
    playerFrame,
    danmakuDock,
    sidebarEl,
    sidebarTop,
    upSlot,
    toolbarSlot,
    descriptionSlot,
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

    event.preventDefault()
    event.stopPropagation()
    exitBewlyWidescreen()
  }
  document.addEventListener('keydown', handleEscapeKey, true)
  nextState.escapeKeyCleanup = () => document.removeEventListener('keydown', handleEscapeKey, true)

  setSidebarMode('fit')

  moveNode(player, playerFrame, movedNodes)
  fillSidebar(nextState)
  setActiveTab('comment')
  setupAspectObservers(nextState)
  setupDomRefreshObserver(nextState)
  setupSidebarInteractionTracking(nextState)
  setupSidebarToggleAutoHide(nextState)
  setTimeout(() => window.dispatchEvent(new Event('resize')), 0)
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
  if (state || waitingForLoad || readyRetryTimer)
    return

  pendingSidebarPosition = sidebarPosition
  if (showLoading)
    showWidescreenLoading()

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

export function exitBewlyWidescreen() {
  clearReadyRetryTimer()
  clearLoadFallbackTimer()
  clearPageLoadHandler()
  loadingSuppressedUntilExit = false
  removeWidescreenLoading(true)
  waitingForLoad = false

  if (!state)
    return

  const currentState = state
  state = null
  cleanupState(currentState)
}

export function isBewlyWidescreenActive() {
  return !!state
}
