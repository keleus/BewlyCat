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
  panels: Record<BewlyWidescreenTab, HTMLElement>
  tabButtons: Record<BewlyWidescreenTab, HTMLButtonElement>
  sidebarToggleButton: HTMLButtonElement
  movedNodes: MovedNode[]
  styleEl: HTMLStyleElement
  activeTab: BewlyWidescreenTab
  sidebarMode: BewlyWidescreenSidebarMode
  resizeObserver?: ResizeObserver
  mutationObserver?: MutationObserver
  metadataListener?: () => void
  resizeSyncTimers?: Array<ReturnType<typeof setTimeout>>
  sidebarInteractionCleanup?: () => void
  sidebarToggleAutoHideCleanup?: () => void
}

const ROOT_ID = 'bewly-widescreen-root'
const BODY_CLASS = 'bewly-widescreen-active'
const EMPTY_CLASS = 'bewly-widescreen-empty'
const SIDEBAR_NARROW_MIN_WIDTH = 360
const SIDEBAR_NARROW_MAX_WIDTH = 460
const MOBILE_BREAKPOINT = 900
const LOAD_SETTLE_DELAY = 1200
const READY_RETRY_INTERVAL = 500
const READY_RETRY_MAX = 30
const SIDEBAR_REFRESH_DELAY = 800
const SIDEBAR_REFRESH_MAX = 8
const SIDEBAR_TOGGLE_IDLE_DELAY = 1000
const BILIBILI_ACTION_ANIMATION_HUE = 196

let state: BewlyWidescreenState | null = null
let readyRetryTimer: ReturnType<typeof setTimeout> | undefined
let loadFallbackTimer: ReturnType<typeof setTimeout> | undefined
let sidebarRefreshTimer: ReturnType<typeof setTimeout> | undefined
let readyRetryCount = 0
let sidebarRefreshCount = 0
let waitingForLoad = false

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
    '.playlist-container',
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
  state.sidebarToggleButton.textContent = isFit ? '‹' : '›'
  state.sidebarToggleButton.title = isFit ? '显示窄右栏' : '收起右栏'
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

function createRoot() {
  const root = document.createElement('div')
  root.id = ROOT_ID

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
  sidebarTop.append(createSidebarToolbar(), upSlot, toolbarSlot)

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
  stage.append(playerSlot, sidebar)
  root.appendChild(stage)
  document.body.appendChild(root)

  return { root, playerSlot, playerFrame, danmakuDock, sidebarEl: sidebar, sidebarTop, upSlot, toolbarSlot, panels, tabButtons, sidebarToggleButton }
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

    #${ROOT_ID} .player-wrap *,
    #${ROOT_ID} .bpx-player-container *,
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
    const onLoadedMetadata = () => updateAspectRatio()
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    currentState.metadataListener = () => video.removeEventListener('loadedmetadata', onLoadedMetadata)
  }

  currentState.resizeObserver = new ResizeObserver(() => {
    updateAspectRatio()
    updateDanmakuDockHeight()
  })
  currentState.resizeObserver.observe(currentState.root)
  currentState.resizeObserver.observe(currentState.danmakuDock)
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

function fillSidebar(currentState: BewlyWidescreenState) {
  syncActionAnimationTheme(currentState)

  if (!currentState.toolbarSlot.querySelector(selectors.toolbar.join(',')))
    moveNode(findMovable(selectors.toolbar), currentState.toolbarSlot, currentState.movedNodes)

  if (!currentState.upSlot.querySelector(selectors.upPanel.join(',')))
    moveNode(findMovable(selectors.upPanel), currentState.upSlot, currentState.movedNodes)

  moveDanmakuInput(currentState)
  const commentMoved = currentState.panels.comment.querySelector(selectors.comment.join(','))
    || moveNode(findMovable(selectors.comment), currentState.panels.comment, currentState.movedNodes)
  if (!commentMoved) {
    ensureEmptyPanel(currentState.panels.comment, '评论区加载中')
  }
  else {
    clearEmptyPanel(currentState.panels.comment)
    shortenCommentTimes(currentState.panels.comment)
  }

  const danmakuMoved = currentState.panels.danmaku.querySelector(selectors.danmaku.join(','))
    || moveNode(findMovable(selectors.danmaku), currentState.panels.danmaku, currentState.movedNodes)
  if (!danmakuMoved)
    ensureEmptyPanel(currentState.panels.danmaku, '弹幕列表加载中')
  else
    clearEmptyPanel(currentState.panels.danmaku)

  moveMatchingNodes(['[class*="eplist_ep_list_wrapper"]'], currentState.panels.playlist, currentState.movedNodes)
  const existingPlaylist = currentState.panels.playlist.querySelector(selectors.playlist.join(','))
  const existingRecommend = currentState.panels.playlist.querySelector(selectors.recommend.join(','))
  const playlist = existingPlaylist ? null : findMovable(selectors.playlist)
  const recommend = existingPlaylist || playlist || existingRecommend ? null : findMovable(selectors.recommend)
  const playlistMoved = existingPlaylist || existingRecommend || moveNode(playlist || recommend, currentState.panels.playlist, currentState.movedNodes)
  currentState.tabButtons.playlist.textContent = existingPlaylist || playlist ? '选集' : '推荐'
  if (!playlistMoved)
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
  currentState.sidebarInteractionCleanup?.()
  currentState.sidebarToggleAutoHideCleanup?.()
  currentState.metadataListener?.()
  currentState.resizeObserver?.disconnect()
  currentState.mutationObserver?.disconnect()
  clearPlayerResizeSync(currentState)
  clearSidebarRefreshTimer()
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
  if (video && (video.readyState >= HTMLMediaElement.HAVE_METADATA || video.currentSrc))
    return true

  return !!player.querySelector('video, bwp-video, .bpx-player-video-area, .bilibili-player-video-wrap')
}

function applyNow() {
  exitBewlyWidescreen()

  const player = findMovable(selectors.player)
  if (!player)
    return false

  const { root, playerSlot, playerFrame, danmakuDock, sidebarEl, sidebarTop, upSlot, toolbarSlot, panels, tabButtons, sidebarToggleButton } = createRoot()
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
    panels,
    tabButtons,
    sidebarToggleButton,
    movedNodes,
    styleEl,
    activeTab: 'comment',
    sidebarMode: 'fit',
  }

  state = nextState
  document.body.classList.add(BODY_CLASS)
  setSidebarMode('fit')

  moveNode(player, playerFrame, movedNodes)
  fillSidebar(nextState)
  setActiveTab('comment')
  setupAspectObservers(nextState)
  setupDomRefreshObserver(nextState)
  setupSidebarInteractionTracking(nextState)
  setupSidebarToggleAutoHide(nextState)
  setTimeout(() => window.dispatchEvent(new Event('resize')), 0)

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

    if (isReadyForLayout()) {
      applyNow()
      return
    }

    readyRetryCount++
    if (readyRetryCount <= READY_RETRY_MAX)
      scheduleReadyRetry()
  }, delay)
}

function startAfterPageLoad() {
  if (state)
    return

  waitingForLoad = false
  clearLoadFallbackTimer()
  readyRetryCount = 0
  scheduleReadyRetry(LOAD_SETTLE_DELAY)
}

function scheduleSidebarRefresh() {
  if (!state || sidebarRefreshTimer || sidebarRefreshCount >= SIDEBAR_REFRESH_MAX)
    return

  sidebarRefreshTimer = setTimeout(() => {
    sidebarRefreshTimer = undefined
    if (!state)
      return

    sidebarRefreshCount++
    fillSidebar(state)
  }, SIDEBAR_REFRESH_DELAY)
}

export function applyBewlyWidescreen() {
  if (state || waitingForLoad || readyRetryTimer)
    return

  sidebarRefreshCount = 0

  if (document.readyState === 'complete') {
    startAfterPageLoad()
    return
  }

  waitingForLoad = true
  window.addEventListener('load', startAfterPageLoad, { once: true })

  clearLoadFallbackTimer()
  loadFallbackTimer = setTimeout(() => {
    if (waitingForLoad)
      startAfterPageLoad()
  }, 6000)
}

export function exitBewlyWidescreen() {
  clearReadyRetryTimer()
  clearLoadFallbackTimer()
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
