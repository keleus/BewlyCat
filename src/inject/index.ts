// 由于是浏览器环境，所以引入的ts不能使用webextension-polyfill相关api，包含获取本地Storage，获取的是网页的localStorage
import { PAGE_NO_COOKIE_SEARCH_REQUEST, PAGE_NO_COOKIE_SEARCH_RESPONSE } from '~/constants/api'
import type { Settings } from '~/logic/storage'
import { BILIBILI_DESKTOP_USER_AGENT, isBilibiliWwwUrl } from '~/utils/bilibiliDesktopNavigation'
import { isElectron } from '~/utils/main'

// 存储当前设置状态
let currentSettings: Settings | null = null
let settingsReady = false
let preventMobileRedirectEnabled = false
let resolveSettingsReady: (() => void) | null = null
const settingsReadyPromise = new Promise<void>((resolve) => {
  resolveSettingsReady = resolve
})

const pageScriptGlobal = globalThis as typeof globalThis & {
  __BEWLYCAT_PAGE_SCRIPT_INITIALIZED__?: boolean
}
const shouldInitializePageScript = !pageScriptGlobal.__BEWLYCAT_PAGE_SCRIPT_INITIALIZED__

if (shouldInitializePageScript)
  pageScriptGlobal.__BEWLYCAT_PAGE_SCRIPT_INITIALIZED__ = true

const isElectronEnv = isElectron()
if (isElectronEnv) {
  console.warn('[BewlyCat] Detected Electron environment, extension disabled.')
}
else if (shouldInitializePageScript) {
  // 根据兼容性设置动态返回桌面 UA，默认保持浏览器原始值。
  if (isBilibiliWwwUrl(location.href)) {
    const originalNavigatorValues = {
      appVersion: navigator.appVersion,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    }
    const defineNavigatorValue = (property: 'appVersion' | 'platform' | 'userAgent', value: string) => {
      try {
        Object.defineProperty(navigator, property, {
          configurable: true,
          get: () => preventMobileRedirectEnabled ? value : originalNavigatorValues[property],
        })
      }
      catch {
        // 个别浏览器不允许覆盖 Navigator 实例属性，网络层规则仍会提供桌面 UA。
      }
    }

    defineNavigatorValue('userAgent', BILIBILI_DESKTOP_USER_AGENT)
    defineNavigatorValue('appVersion', BILIBILI_DESKTOP_USER_AGENT.replace(/^Mozilla\//, ''))
    defineNavigatorValue('platform', 'Win32')

    const userAgentData = (navigator as Navigator & {
      userAgentData?: {
        mobile?: boolean
        platform?: string
      }
    }).userAgentData

    if (userAgentData) {
      const originalMobile = userAgentData.mobile
      const originalUserAgentDataPlatform = userAgentData.platform
      try {
        Object.defineProperties(userAgentData, {
          mobile: {
            configurable: true,
            get: () => preventMobileRedirectEnabled ? false : originalMobile,
          },
          platform: {
            configurable: true,
            get: () => preventMobileRedirectEnabled ? 'Windows' : originalUserAgentDataPlatform,
          },
        })
      }
      catch {
        // UA Client Hints 不可配置时交由网络层请求头规则处理。
      }
    }
  }

  // 之前inject.js的内容
  const isArray = (val: any): boolean => Array.isArray(val)
  function injectFunction(
    origin: any,
    keys: string | string[],
    cb: (...args: any[]) => void,
  ) {
    let keysArray: string[]
    if (!isArray(keys)) {
      keysArray = [keys as string]
    }
    else {
      keysArray = keys as string[]
    }

    const originKeysValue = keysArray.reduce((obj: any, key: string) => {
      obj[key] = origin[key]
      return obj
    }, {})

    keysArray.map((k: string) => origin[k])

    keysArray.forEach((key: string) => {
      const fn = (...args: any[]) => {
        cb(...args)
        return (originKeysValue[key]).apply(origin, args)
      }
      fn.toString = (origin)[key].toString
      ;(origin)[key] = fn
    })

    return {
      originKeysValue,
      restore: () => {
        for (const key in originKeysValue) {
          origin[key] = (originKeysValue[key]).bind(origin)
        }
      },
    }
  }

  const COMMENT_COMPONENT_PATCHED = Symbol('bewly-comment-component-patched')
  const pendingCommentEnhancements = new WeakSet<object>()
  const commentRepliesRenderers = new Set<any>()
  const commentReplyTreeStates = new WeakMap<object, CommentReplyTreeState>()
  const MAX_COMMENT_REPLY_TREE_DEPTH = 10
  const MIN_COMMENT_REPLY_TREE_CONTENT_WIDTH = 150
  const COMPACT_COMMENT_REPLY_TREE_CONTAINER_WIDTH = 640
  const DEFAULT_COMMENT_REPLY_TREE_INDENT_STEP = 32
  const COMPACT_COMMENT_REPLY_TREE_INDENT_STEP = 24
  const COMMENT_REPLY_TREE_INDENT_STEP = 'var(--bew-comment-reply-indent-step, var(--bew-space-8, 32px))'
  const COMMENT_REPLY_TREE_GUIDES_ID = 'bewly-comment-reply-tree-guides'
  const COMMENT_REPLY_TREE_ROOT_KEY = 'thread-root'
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

  interface CommentReplyTreeState {
    collapsedNodeKeys: Set<string>
    enabled: boolean
    nextOriginalOrder: number
    originalOrderByRenderer: WeakMap<HTMLElement, number>
    observedContainer?: HTMLElement
    resizeObserver?: ResizeObserver
  }

  interface CommentReplyTreeNode {
    authorName: string | null
    renderer: HTMLElement
    rpid: string | null
    parentRpid: string | null
    ctime: number | null
    originalOrder: number
    children: CommentReplyTreeNode[]
  }

  const COMMENT_REPLY_TREE_GUIDES_CSS = `
    #${COMMENT_REPLY_TREE_GUIDES_ID} {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch {
      cursor: pointer;
      pointer-events: auto;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__line,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__symbol {
      fill: none;
      stroke: var(--bew-comment-tree-line-color, var(--line_regular, rgba(148, 153, 160, 0.28)));
      stroke-width: var(--bew-space-0-5, 2px);
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__line,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__symbol,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__node {
      pointer-events: none;
      transition: stroke var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__hit {
      fill: none;
      stroke: transparent;
      stroke-width: var(--bew-space-6, 24px);
      pointer-events: stroke;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__node-hit {
      fill: transparent;
      stroke: none;
      pointer-events: all;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__node {
      fill: var(--bew-bg, var(--bg1, #fff));
      stroke: var(--bew-comment-tree-line-color, var(--line_regular, rgba(148, 153, 160, 0.28)));
      stroke-width: var(--bew-space-0-5, 2px);
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__focus {
      fill: none;
      stroke: transparent;
      stroke-width: var(--bew-space-0-5, 2px);
      pointer-events: none;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__author {
      fill: var(--bew-text-2, var(--text2, #61666d));
      font-size: var(--bew-font-size-caption, 12px);
      font-weight: var(--bew-font-weight-medium, 500);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__node-hit:hover ~ .bewly-comment-reply-branch__author,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch:focus-visible .bewly-comment-reply-branch__author {
      opacity: 1;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch:hover :is(.bewly-comment-reply-branch__line, .bewly-comment-reply-branch__node, .bewly-comment-reply-branch__symbol) {
      stroke: var(--bew-theme-color, #00aeec);
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch:focus,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch:focus-visible .bewly-comment-reply-branch__focus {
      stroke: var(--bew-theme-color, #00aeec);
    }
  `

  const COMMENT_SHADOW_STYLE_PATCHES: Record<string, { id: string, css: string }> = {
    'bili-comment-thread-renderer': {
      id: 'bewly-comment-thread-style',
      css: `
        :host {
          position: relative;
        }

        :is(#comment, bili-comment-renderer)[data-bewly-comment-reply-collapsed] {
          box-sizing: border-box;
          height: var(--bew-space-6, 24px) !important;
          min-height: var(--bew-space-6, 24px) !important;
          overflow: hidden !important;
          visibility: hidden !important;
        }

        ${COMMENT_REPLY_TREE_GUIDES_CSS}
      `,
    },
    'bili-comment-replies-renderer': {
      id: 'bewly-comment-replies-style',
      css: `
        #spinner {
          background: var(--bew-comment-replies-mask-bg, rgba(var(--bg1_rgb), 0.85)) !important;
        }

        :host([data-bewly-comment-reply-tree]) {
          --bew-comment-reply-branch-radius: var(--bew-radius-lg, 12px);
          --bew-comment-reply-indent-step: var(--bew-space-8, 32px);
        }

        :host([data-bewly-comment-reply-tree]) #expander-contents {
          position: relative;
        }

        :host([data-bewly-comment-reply-tree]) #expander-contents > :is(bili-comment-reply-renderer, bili-comment-renderer)[data-bewly-comment-reply-depth] {
          box-sizing: border-box;
          display: block;
          padding-inline-start: var(--bew-comment-reply-indent, 0px);
          width: 100%;
        }

        :host([data-bewly-comment-reply-tree]) #expander-contents > :is(bili-comment-reply-renderer, bili-comment-renderer)[data-bewly-comment-reply-hidden] {
          display: none !important;
        }

        :host([data-bewly-comment-reply-tree]) #expander-contents > :is(bili-comment-reply-renderer, bili-comment-renderer)[data-bewly-comment-reply-collapsed] {
          box-sizing: border-box;
          height: var(--bew-space-6, 24px) !important;
          min-height: var(--bew-space-6, 24px) !important;
          overflow: hidden !important;
          visibility: hidden !important;
        }

        ${COMMENT_REPLY_TREE_GUIDES_CSS}
      `,
    },
    'bili-comment-renderer': {
      id: 'bewly-comment-renderer-style',
      css: `
        #body.dark .tag {
          --bili-comment-tag-color: var(--bew-comment-tag-color, var(--bili-comment-tag-color-dark)) !important;
          --bili-comment-tag-bg: var(--bew-comment-tag-bg, var(--bili-comment-tag-bg-dark)) !important;
        }
      `,
    },
    'bili-comment-box': {
      id: 'bewly-comment-box-style',
      css: `
        #editor:not(:hover):not(.active) {
          border-color: var(--bew-comment-editor-border, var(--Ga1)) !important;
        }
      `,
    },
    'bili-comments-vote-card': {
      id: 'bewly-vote-card-style',
      css: `
        :host {
          --option-color: var(--bew-text-1, #18191c) !important;
        }
      `,
    },
  }

  function ensureCommentShadowStyle(root: ShadowRoot, id: string, css: string) {
    if (root.querySelector(`#${id}`))
      return

    const style = document.createElement('style')
    style.id = id
    style.textContent = css
    root.appendChild(style)
  }

  function patchCommentComponentUpdate(
    name: string,
    classConstructor: any,
    enhance: (component: any) => void,
  ) {
    const prototype = classConstructor?.prototype
    const originalUpdate = prototype?.update
    if (!prototype || typeof originalUpdate !== 'function') {
      console.warn(`[BewlyCat] Skip patching ${name}: update() is unavailable.`)
      return
    }

    if (prototype[COMMENT_COMPONENT_PATCHED])
      return

    const patchedUpdate = function (this: any, ...updateArgs: any[]) {
      const result = Reflect.apply(originalUpdate, this, updateArgs)

      // Do not run BewlyCat DOM work inside Bilibili's render lifecycle. An
      // enhancement failure must never reject or abort the component update.
      if (!pendingCommentEnhancements.has(this)) {
        pendingCommentEnhancements.add(this)
        queueMicrotask(() => {
          pendingCommentEnhancements.delete(this)
          try {
            enhance(this)
          }
          catch (error) {
            console.warn(`[BewlyCat] Failed to enhance ${name}.`, error)
          }
        })
      }

      return result
    }

    Object.defineProperty(prototype, 'update', {
      configurable: true,
      writable: true,
      value: patchedUpdate,
    })
    Object.defineProperty(prototype, COMMENT_COMPONENT_PATCHED, {
      configurable: true,
      value: true,
    })
  }

  injectFunction(
    window.history,
    ['pushState'],
    (...args: any[]) => {
      window.dispatchEvent(new CustomEvent('pushstate', { detail: args }))
    },
  )

  // 获取IP地理位置字符串
  function getLocationString(replyItem: any) {
    const location = replyItem?.reply_control?.location
    if (typeof location !== 'string')
      return location

    return location.replace(/^IP属地[：: ]*/u, '')
  }

  function getSexString(replyItem: any) {
    return replyItem?.member?.sex
  }

  const HOST_TAG_TEXTS: Record<string, string> = {
    en: 'OP',
    'cmn-TW': '樓主',
    jyut: '樓主',
    'cmn-CN': '楼主',
  }

  const COMMENT_REPLY_BRANCH_LABELS: Record<string, { collapse: string, expand: string }> = {
    en: { collapse: 'Collapse comment and replies', expand: 'Expand comment and replies' },
    'cmn-TW': { collapse: '收合此評論及回覆', expand: '展開此評論及回覆' },
    jyut: { collapse: '收起呢條評論同回覆', expand: '展開呢條評論同回覆' },
    'cmn-CN': { collapse: '收起此评论及回复', expand: '展开此评论及回复' },
  }

  function getHostTagText() {
    const language = currentSettings?.language || 'cmn-CN'
    return HOST_TAG_TEXTS[language] ?? '楼主'
  }

  function getCommentReplyBranchLabel(collapsed: boolean): string {
    const language = currentSettings?.language || 'cmn-CN'
    const labels = COMMENT_REPLY_BRANCH_LABELS[language] ?? COMMENT_REPLY_BRANCH_LABELS['cmn-CN']
    return collapsed ? labels.expand : labels.collapse
  }

  const rootReplyAuthorByThread = new Map<string, string>()

  function toIdString(id: unknown): string | null {
    if (id === null || id === undefined || id === '')
      return null
    return String(id)
  }

  function getReplyOid(replyItem: any): string | null {
    return toIdString(replyItem?.oid_str ?? replyItem?.oid)
  }

  function getReplyRpid(replyItem: any): string | null {
    return toIdString(replyItem?.rpid_str ?? replyItem?.rpid)
  }

  function getReplyRootRpid(replyItem: any): string | null {
    return toIdString(replyItem?.root_str ?? replyItem?.root)
  }

  function getReplyParentRpid(replyItem: any): string | null {
    return toIdString(replyItem?.parent_str ?? replyItem?.parent)
  }

  function getReplyMemberMid(replyItem: any): string | null {
    return toIdString(replyItem?.member?.mid)
  }

  function getReplyAuthorName(replyItem: any): string | null {
    const authorName = replyItem?.member?.uname
    return typeof authorName === 'string' && authorName.trim()
      ? authorName.trim()
      : null
  }

  function getThreadRootKey(replyItem: any, rootRpid: string): string {
    const oid = getReplyOid(replyItem)
    return oid ? `${oid}:${rootRpid}` : rootRpid
  }

  function getCommentReplyData(component: any): any | null {
    const userInfoData = component?.shadowRoot
      ?.querySelector('bili-comment-user-info')
      ?.data
    const candidates = [component?.data, component?.reply, component?.replyItem, userInfoData]
    return candidates.find(candidate => candidate && typeof candidate === 'object') ?? null
  }

  function getCommentReplyTreeState(component: object): CommentReplyTreeState {
    let state = commentReplyTreeStates.get(component)
    if (!state) {
      state = {
        collapsedNodeKeys: new Set(),
        enabled: false,
        nextOriginalOrder: 0,
        originalOrderByRenderer: new WeakMap(),
      }
      commentReplyTreeStates.set(component, state)
    }
    return state
  }

  function disconnectCommentReplyTreeResizeObserver(state: CommentReplyTreeState) {
    state.resizeObserver?.disconnect()
    state.resizeObserver = undefined
    state.observedContainer = undefined
  }

  function observeCommentReplyTreeWidth(
    component: any,
    state: CommentReplyTreeState,
    replyContainer: HTMLElement,
  ) {
    if (state.observedContainer === replyContainer)
      return

    disconnectCommentReplyTreeResizeObserver(state)
    state.observedContainer = replyContainer
    state.resizeObserver = new ResizeObserver(() => {
      if (!component?.isConnected) {
        disconnectCommentReplyTreeResizeObserver(state)
        return
      }

      updateCommentReplyTree(component)
    })
    state.resizeObserver.observe(replyContainer)
  }

  function getCommentReplyOriginalOrder(state: CommentReplyTreeState, renderer: HTMLElement): number {
    let originalOrder = state.originalOrderByRenderer.get(renderer)
    if (originalOrder === undefined) {
      originalOrder = state.nextOriginalOrder
      state.nextOriginalOrder += 1
      state.originalOrderByRenderer.set(renderer, originalOrder)
    }
    return originalOrder
  }

  function getCommentReplyCtime(replyItem: any): number | null {
    const ctime = replyItem?.ctime
    if (ctime === null || ctime === undefined || ctime === '')
      return null

    const numericCtime = Number(ctime)
    return Number.isFinite(numericCtime) ? numericCtime : null
  }

  function compareCommentReplyTreeNodes(a: CommentReplyTreeNode, b: CommentReplyTreeNode): number {
    if (a.ctime !== null && b.ctime !== null && a.ctime !== b.ctime)
      return a.ctime - b.ctime
    if (a.ctime !== null && b.ctime === null)
      return -1
    if (a.ctime === null && b.ctime !== null)
      return 1
    return a.originalOrder - b.originalOrder
  }

  function getCommentReplyIndent(depth: number): string {
    if (depth <= 0)
      return '0px'
    if (depth === 1)
      return COMMENT_REPLY_TREE_INDENT_STEP

    return `calc(${Array.from({ length: depth }, () => COMMENT_REPLY_TREE_INDENT_STEP).join(' + ')})`
  }

  function getCommentReplyTreeIndentStep(replyContainer: HTMLElement): number {
    return replyContainer.clientWidth <= COMPACT_COMMENT_REPLY_TREE_CONTAINER_WIDTH
      ? COMPACT_COMMENT_REPLY_TREE_INDENT_STEP
      : DEFAULT_COMMENT_REPLY_TREE_INDENT_STEP
  }

  function getCommentReplyTreeDepthLimit(replyContainer: HTMLElement, indentStep: number): number {
    const availableIndentWidth = Math.max(
      0,
      replyContainer.clientWidth - MIN_COMMENT_REPLY_TREE_CONTENT_WIDTH,
    )

    return Math.min(MAX_COMMENT_REPLY_TREE_DEPTH, Math.floor(availableIndentWidth / indentStep))
  }

  interface CommentReplyAvatarAnchor {
    bottom: number
    centerX: number
    centerY: number
    left: number
    toggleY: number
  }

  interface CommentReplyTreeBranch {
    childAnchors: CommentReplyAvatarAnchor[]
    collapsed: boolean
    key: string
    parentAnchor: CommentReplyAvatarAnchor
    parentAuthorName: string | null
  }

  function getCommentReplyAvatarAnchor(
    renderer: HTMLElement,
    containerRect: DOMRect,
  ): CommentReplyAvatarAnchor | null {
    const avatar = renderer.shadowRoot?.querySelector<HTMLElement>('#user-avatar')
      ?? renderer.shadowRoot?.querySelector<HTMLElement>('bili-avatar')
    if (!avatar)
      return null

    const avatarRect = avatar.getBoundingClientRect()
    if (avatarRect.width <= 0 || avatarRect.height <= 0)
      return null

    if (renderer.hasAttribute('data-bewly-comment-reply-collapsed')) {
      const rendererRect = renderer.getBoundingClientRect()
      const centerY = rendererRect.top + rendererRect.height / 2 - containerRect.top
      return {
        bottom: centerY,
        centerX: avatarRect.left + avatarRect.width / 2 - containerRect.left,
        centerY,
        left: avatarRect.left - containerRect.left,
        toggleY: centerY,
      }
    }

    const footer = renderer.shadowRoot?.querySelector<HTMLElement>('#footer')
    const footerRect = footer?.getBoundingClientRect()
    const avatarBottom = avatarRect.bottom - containerRect.top
    const footerCenterY = footerRect && footerRect.height > 0
      ? footerRect.top + footerRect.height / 2 - containerRect.top
      : avatarBottom

    return {
      bottom: avatarBottom,
      centerX: avatarRect.left + avatarRect.width / 2 - containerRect.left,
      centerY: avatarRect.top + avatarRect.height / 2 - containerRect.top,
      left: avatarRect.left - containerRect.left,
      toggleY: Math.max(avatarBottom, footerCenterY),
    }
  }

  function getCommentReplyTreeThreadRoot(component: HTMLElement): ShadowRoot | null {
    const rootNode = component.getRootNode()
    if (!(rootNode instanceof ShadowRoot) || rootNode.host.localName !== 'bili-comment-thread-renderer')
      return null

    return rootNode
  }

  function getCommentReplyTreeRootRenderer(component: HTMLElement): HTMLElement | null {
    const threadRoot = getCommentReplyTreeThreadRoot(component)
    if (!threadRoot)
      return null

    return threadRoot.querySelector<HTMLElement>('#comment')
      ?? threadRoot.querySelector<HTMLElement>('bili-comment-renderer')
  }

  function getCommentReplyTreeNodeKey(node: CommentReplyTreeNode): string {
    return node.rpid ? `reply:${node.rpid}` : `order:${node.originalOrder}`
  }

  function formatCommentReplyGuideCoordinate(value: number): string {
    return String(Math.round(value * 100) / 100)
  }

  function removeCommentReplyTreeGuides(
    component: HTMLElement,
    replyContainer: HTMLElement,
  ) {
    replyContainer.querySelector(`#${COMMENT_REPLY_TREE_GUIDES_ID}`)?.remove()
    getCommentReplyTreeThreadRoot(component)
      ?.querySelector(`#${COMMENT_REPLY_TREE_GUIDES_ID}`)
      ?.remove()
  }

  function updateCommentReplyTreeVisibility(
    component: HTMLElement,
    state: CommentReplyTreeState,
    orderedNodes: Array<{ depth: number, node: CommentReplyTreeNode }>,
  ) {
    const hideDescendantsAtDepth: boolean[] = []
    const rootCollapsed = state.collapsedNodeKeys.has(COMMENT_REPLY_TREE_ROOT_KEY)
    getCommentReplyTreeRootRenderer(component)
      ?.toggleAttribute('data-bewly-comment-reply-collapsed', rootCollapsed)

    orderedNodes.forEach(({ depth, node }) => {
      const hidden = depth === 0 ? rootCollapsed : hideDescendantsAtDepth[depth - 1] === true
      const collapsed = state.collapsedNodeKeys.has(getCommentReplyTreeNodeKey(node))
      node.renderer.toggleAttribute('data-bewly-comment-reply-hidden', hidden)
      node.renderer.toggleAttribute('data-bewly-comment-reply-collapsed', collapsed)
      hideDescendantsAtDepth[depth] = hidden || collapsed
      hideDescendantsAtDepth.length = depth + 1
    })
  }

  function getCommentReplyBranchPath(
    branch: CommentReplyTreeBranch,
    branchRadius: number,
  ): string | null {
    const coordinate = formatCommentReplyGuideCoordinate
    const { childAnchors, collapsed, parentAnchor } = branch

    if (collapsed)
      return `M ${coordinate(parentAnchor.centerX)} ${coordinate(parentAnchor.centerY)}`

    if (childAnchors.length === 0)
      return null

    const pathCommands: string[] = []
    const appendBranch = (childAnchor: CommentReplyAvatarAnchor, includeTrunk: boolean) => {
      const horizontalGap = childAnchor.left - parentAnchor.centerX
      const verticalGap = childAnchor.centerY - parentAnchor.bottom
      if (horizontalGap <= 0 || verticalGap <= 0)
        return

      const radius = Math.min(branchRadius, horizontalGap, verticalGap)
      const branchStartY = childAnchor.centerY - radius
      const startY = includeTrunk ? parentAnchor.bottom : branchStartY
      pathCommands.push(
        `M ${coordinate(parentAnchor.centerX)} ${coordinate(startY)}`,
        `V ${coordinate(branchStartY)}`,
        `Q ${coordinate(parentAnchor.centerX)} ${coordinate(childAnchor.centerY)} ${coordinate(parentAnchor.centerX + radius)} ${coordinate(childAnchor.centerY)}`,
        `H ${coordinate(childAnchor.left)}`,
      )
    }

    childAnchors.slice(0, -1).forEach(anchor => appendBranch(anchor, false))
    appendBranch(childAnchors[childAnchors.length - 1], true)
    return pathCommands.length > 0 ? pathCommands.join(' ') : null
  }

  function getCommentReplyBranchToggleY(
    branch: CommentReplyTreeBranch,
    toggleHitRadius: number,
  ): number {
    const { childAnchors, collapsed, parentAnchor } = branch
    if (collapsed)
      return parentAnchor.centerY
    if (childAnchors.length === 0)
      return Math.max(parentAnchor.bottom + toggleHitRadius, parentAnchor.toggleY)

    const branchEndY = childAnchors[childAnchors.length - 1].centerY
    const minimumY = parentAnchor.bottom + toggleHitRadius
    const maximumY = branchEndY - toggleHitRadius
    if (maximumY <= minimumY)
      return parentAnchor.bottom + (branchEndY - parentAnchor.bottom) / 2

    return Math.min(Math.max(parentAnchor.toggleY, minimumY), maximumY)
  }

  function toggleCommentReplyTreeBranch(
    component: HTMLElement,
    state: CommentReplyTreeState,
    branchKey: string,
  ) {
    if (state.collapsedNodeKeys.has(branchKey))
      state.collapsedNodeKeys.delete(branchKey)
    else
      state.collapsedNodeKeys.add(branchKey)
    updateCommentReplyTree(component)
  }

  function createCommentReplyTreeBranchElement(
    component: HTMLElement,
    state: CommentReplyTreeState,
    branch: CommentReplyTreeBranch,
    pathData: string,
    toggleHitRadius: number,
    toggleNodeRadius: number,
  ): SVGGElement {
    const coordinate = formatCommentReplyGuideCoordinate
    const toggleY = getCommentReplyBranchToggleY(branch, toggleHitRadius)
    const symbolHalfSize = toggleNodeRadius / 2
    const branchGroup = document.createElementNS(SVG_NAMESPACE, 'g')
    branchGroup.classList.add('bewly-comment-reply-branch')
    branchGroup.setAttribute('role', 'button')
    branchGroup.setAttribute('tabindex', '0')
    branchGroup.setAttribute('aria-expanded', String(!branch.collapsed))
    branchGroup.setAttribute('aria-label', getCommentReplyBranchLabel(branch.collapsed))

    const visiblePath = document.createElementNS(SVG_NAMESPACE, 'path')
    visiblePath.classList.add('bewly-comment-reply-branch__line')
    visiblePath.setAttribute('d', pathData)
    branchGroup.appendChild(visiblePath)

    const hitPath = document.createElementNS(SVG_NAMESPACE, 'path')
    hitPath.classList.add('bewly-comment-reply-branch__hit')
    hitPath.setAttribute('d', pathData)
    branchGroup.appendChild(hitPath)

    const nodeHitArea = document.createElementNS(SVG_NAMESPACE, 'circle')
    nodeHitArea.classList.add('bewly-comment-reply-branch__node-hit')
    nodeHitArea.setAttribute('cx', coordinate(branch.parentAnchor.centerX))
    nodeHitArea.setAttribute('cy', coordinate(toggleY))
    nodeHitArea.setAttribute('r', coordinate(toggleHitRadius))
    branchGroup.appendChild(nodeHitArea)

    const focusRing = document.createElementNS(SVG_NAMESPACE, 'circle')
    focusRing.classList.add('bewly-comment-reply-branch__focus')
    focusRing.setAttribute('cx', coordinate(branch.parentAnchor.centerX))
    focusRing.setAttribute('cy', coordinate(toggleY))
    focusRing.setAttribute('r', coordinate(toggleHitRadius - 2))
    branchGroup.appendChild(focusRing)

    const toggleNode = document.createElementNS(SVG_NAMESPACE, 'circle')
    toggleNode.classList.add('bewly-comment-reply-branch__node')
    toggleNode.setAttribute('cx', coordinate(branch.parentAnchor.centerX))
    toggleNode.setAttribute('cy', coordinate(toggleY))
    toggleNode.setAttribute('r', coordinate(toggleNodeRadius))
    branchGroup.appendChild(toggleNode)

    const toggleSymbol = document.createElementNS(SVG_NAMESPACE, 'path')
    toggleSymbol.classList.add('bewly-comment-reply-branch__symbol')
    const horizontalSymbol = `M ${coordinate(branch.parentAnchor.centerX - symbolHalfSize)} ${coordinate(toggleY)} H ${coordinate(branch.parentAnchor.centerX + symbolHalfSize)}`
    const verticalSymbol = `M ${coordinate(branch.parentAnchor.centerX)} ${coordinate(toggleY - symbolHalfSize)} V ${coordinate(toggleY + symbolHalfSize)}`
    toggleSymbol.setAttribute('d', branch.collapsed ? `${horizontalSymbol} ${verticalSymbol}` : horizontalSymbol)
    branchGroup.appendChild(toggleSymbol)

    if (branch.collapsed && branch.parentAuthorName) {
      const authorLabel = document.createElementNS(SVG_NAMESPACE, 'text')
      authorLabel.classList.add('bewly-comment-reply-branch__author')
      authorLabel.setAttribute('x', coordinate(branch.parentAnchor.centerX + toggleHitRadius + 4))
      authorLabel.setAttribute('y', coordinate(toggleY))
      authorLabel.setAttribute('dominant-baseline', 'middle')
      authorLabel.textContent = branch.parentAuthorName
      branchGroup.appendChild(authorLabel)
    }

    const toggleBranch = () => toggleCommentReplyTreeBranch(component, state, branch.key)
    branchGroup.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      toggleBranch()
    })
    branchGroup.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ')
        return
      event.preventDefault()
      event.stopPropagation()
      toggleBranch()
    })

    return branchGroup
  }

  function renderCommentReplyTreeGuides(
    component: HTMLElement,
    state: CommentReplyTreeState,
    replyContainer: HTMLElement,
    orderedNodes: Array<{ depth: number, node: CommentReplyTreeNode }>,
  ) {
    removeCommentReplyTreeGuides(component, replyContainer)

    const threadRoot = getCommentReplyTreeThreadRoot(component)
    const guideContainer: HTMLElement | ShadowRoot = threadRoot ?? replyContainer
    const coordinateRect = threadRoot
      ? threadRoot.host.getBoundingClientRect()
      : replyContainer.getBoundingClientRect()
    if (coordinateRect.width <= 0)
      return

    if (threadRoot) {
      const threadStylePatch = COMMENT_SHADOW_STYLE_PATCHES['bili-comment-thread-renderer']
      ensureCommentShadowStyle(threadRoot, threadStylePatch.id, threadStylePatch.css)
    }

    const nodes = orderedNodes.map(({ node }) => node)
    const avatarAnchorByNode = new Map<CommentReplyTreeNode, CommentReplyAvatarAnchor>()
    nodes.forEach((node) => {
      const anchor = getCommentReplyAvatarAnchor(node.renderer, coordinateRect)
      if (anchor)
        avatarAnchorByNode.set(node, anchor)
    })

    const componentStyle = getComputedStyle(component)
    const branchRadius = Number.parseFloat(
      componentStyle.getPropertyValue('--bew-comment-reply-branch-radius'),
    ) || 12
    const toggleHitRadius = Number.parseFloat(componentStyle.getPropertyValue('--bew-space-3')) || 12
    const toggleNodeRadius = Number.parseFloat(componentStyle.getPropertyValue('--bew-radius-half')) || 6
    const branches: CommentReplyTreeBranch[] = []

    const rootNodes = orderedNodes
      .filter(({ depth }) => depth === 0)
      .map(({ node }) => node)
    const threadRootRenderer = getCommentReplyTreeRootRenderer(component)
    const threadRootAnchor = threadRootRenderer
      ? getCommentReplyAvatarAnchor(threadRootRenderer, coordinateRect)
      : null
    if (threadRootAnchor && rootNodes.length > 0) {
      branches.push({
        childAnchors: rootNodes
          .map(node => avatarAnchorByNode.get(node))
          .filter((anchor): anchor is CommentReplyAvatarAnchor => Boolean(anchor))
          .filter(anchor => anchor.left > threadRootAnchor.centerX),
        collapsed: state.collapsedNodeKeys.has(COMMENT_REPLY_TREE_ROOT_KEY),
        key: COMMENT_REPLY_TREE_ROOT_KEY,
        parentAnchor: threadRootAnchor,
        parentAuthorName: getReplyAuthorName(getCommentReplyData(threadRootRenderer)),
      })
    }

    nodes.forEach((node) => {
      const parentAnchor = avatarAnchorByNode.get(node)
      if (!parentAnchor || node.children.length === 0)
        return

      branches.push({
        childAnchors: node.children
          .map(child => avatarAnchorByNode.get(child))
          .filter((anchor): anchor is CommentReplyAvatarAnchor => Boolean(anchor))
          .filter(anchor => anchor.left > parentAnchor.centerX),
        collapsed: state.collapsedNodeKeys.has(getCommentReplyTreeNodeKey(node)),
        key: getCommentReplyTreeNodeKey(node),
        parentAnchor,
        parentAuthorName: node.authorName,
      })
    })

    const renderedBranches = branches
      .map(branch => ({ branch, pathData: getCommentReplyBranchPath(branch, branchRadius) }))
      .filter((entry): entry is { branch: CommentReplyTreeBranch, pathData: string } => Boolean(entry.pathData))
    if (renderedBranches.length === 0)
      return

    const minimumX = Math.min(
      0,
      ...renderedBranches.map(({ branch }) => branch.parentAnchor.centerX - toggleHitRadius),
    )
    const minimumY = Math.min(
      0,
      ...renderedBranches.map(({ branch }) => Math.min(
        branch.parentAnchor.bottom,
        getCommentReplyBranchToggleY(branch, toggleHitRadius) - toggleHitRadius,
      )),
    )
    const layerWidth = Math.max(1, coordinateRect.width - minimumX)
    const layerHeight = Math.max(1, coordinateRect.height - minimumY)
    const guideLayer = document.createElementNS(SVG_NAMESPACE, 'svg')
    guideLayer.id = COMMENT_REPLY_TREE_GUIDES_ID
    guideLayer.setAttribute('focusable', 'false')
    guideLayer.setAttribute('viewBox', `${minimumX} ${minimumY} ${layerWidth} ${layerHeight}`)
    guideLayer.setAttribute('preserveAspectRatio', 'none')
    guideLayer.style.left = `${minimumX}px`
    guideLayer.style.top = `${minimumY}px`
    guideLayer.style.right = 'auto'
    guideLayer.style.bottom = 'auto'
    guideLayer.style.width = `${layerWidth}px`
    guideLayer.style.height = `${layerHeight}px`

    renderedBranches.forEach(({ branch, pathData }) => {
      guideLayer.appendChild(createCommentReplyTreeBranchElement(
        component,
        state,
        branch,
        pathData,
        toggleHitRadius,
        toggleNodeRadius,
      ))
    })
    guideContainer.appendChild(guideLayer)
  }

  function isCommentReplyRenderer(element: Element): element is HTMLElement {
    return element.localName === 'bili-comment-reply-renderer'
      || element.localName === 'bili-comment-renderer'
  }

  function reorderCommentReplyRenderers(
    container: HTMLElement,
    currentRenderers: HTMLElement[],
    orderedRenderers: HTMLElement[],
  ) {
    if (orderedRenderers.every((renderer, index) => renderer === currentRenderers[index]))
      return

    const replyRendererSet = new Set(currentRenderers)
    const findNextReplyRenderer = (renderer: HTMLElement): ChildNode | null => {
      let sibling = renderer.nextSibling
      while (sibling && !(sibling instanceof HTMLElement && replyRendererSet.has(sibling)))
        sibling = sibling.nextSibling
      return sibling
    }

    let insertionPoint: ChildNode | null = currentRenderers[0] ?? null
    orderedRenderers.forEach((renderer) => {
      if (renderer === insertionPoint)
        insertionPoint = findNextReplyRenderer(renderer)
      else
        container.insertBefore(renderer, insertionPoint)
    })
  }

  function buildCommentReplyTreeOrder(nodes: CommentReplyTreeNode[]): Array<{
    depth: number
    node: CommentReplyTreeNode
  }> {
    const nodeByRpid = new Map<string, CommentReplyTreeNode>()
    nodes.forEach((node) => {
      if (node.rpid && !nodeByRpid.has(node.rpid))
        nodeByRpid.set(node.rpid, node)
    })

    const rootNodes: CommentReplyTreeNode[] = []
    nodes.forEach((node) => {
      const parentNode = node.parentRpid ? nodeByRpid.get(node.parentRpid) : undefined
      if (parentNode && parentNode !== node)
        parentNode.children.push(node)
      else
        rootNodes.push(node)
    })

    rootNodes.sort(compareCommentReplyTreeNodes)
    nodes.forEach(node => node.children.sort(compareCommentReplyTreeNodes))

    // Keep every branch contiguous: parent first, then its time-ordered children.
    const orderedNodes: Array<{ depth: number, node: CommentReplyTreeNode }> = []
    const visitedRenderers = new Set<HTMLElement>()
    const visitNode = (node: CommentReplyTreeNode, depth: number) => {
      if (visitedRenderers.has(node.renderer))
        return

      visitedRenderers.add(node.renderer)
      orderedNodes.push({ node, depth: Math.min(depth, MAX_COMMENT_REPLY_TREE_DEPTH) })
      node.children.forEach(child => visitNode(child, depth + 1))
    }

    rootNodes.forEach(node => visitNode(node, 0))
    nodes
      .filter(node => !visitedRenderers.has(node.renderer))
      .sort(compareCommentReplyTreeNodes)
      .forEach(node => visitNode(node, 0))

    return orderedNodes
  }

  function updateCommentReplyTree(component: any) {
    const root = component?.shadowRoot as ShadowRoot | null | undefined
    if (!root)
      return

    commentRepliesRenderers.add(component)

    const replyContainer = root.querySelector<HTMLElement>('#expander-contents')
    if (!replyContainer)
      return

    const replyRenderers = Array.from(replyContainer.children)
      .filter(isCommentReplyRenderer)
    const state = getCommentReplyTreeState(component)
    replyRenderers.forEach(renderer => getCommentReplyOriginalOrder(state, renderer))

    const enabled = currentSettings?.enableCommentReplyTree === true
    component.toggleAttribute('data-bewly-comment-reply-tree', enabled)

    if (!enabled) {
      disconnectCommentReplyTreeResizeObserver(state)
      component.style.removeProperty('--bew-comment-reply-indent-step')
      removeCommentReplyTreeGuides(component, replyContainer)
      state.collapsedNodeKeys.clear()
      if (state.enabled) {
        const originalOrder = [...replyRenderers].sort((a, b) => (
          getCommentReplyOriginalOrder(state, a) - getCommentReplyOriginalOrder(state, b)
        ))
        reorderCommentReplyRenderers(replyContainer, replyRenderers, originalOrder)
      }

      replyRenderers.forEach((replyRenderer) => {
        delete replyRenderer.dataset.bewlyCommentReplyDepth
        delete replyRenderer.dataset.bewlyCommentReplyHidden
        delete replyRenderer.dataset.bewlyCommentReplyCollapsed
        replyRenderer.style.removeProperty('--bew-comment-reply-indent')
      })
      delete getCommentReplyTreeRootRenderer(component)?.dataset.bewlyCommentReplyCollapsed
      state.enabled = false
      return
    }

    observeCommentReplyTreeWidth(component, state, replyContainer)

    const nodes: CommentReplyTreeNode[] = replyRenderers.map((replyRenderer) => {
      const replyItem = getCommentReplyData(replyRenderer)
      return {
        authorName: getReplyAuthorName(replyItem),
        renderer: replyRenderer,
        rpid: getReplyRpid(replyItem),
        parentRpid: getReplyParentRpid(replyItem),
        ctime: getCommentReplyCtime(replyItem),
        originalOrder: getCommentReplyOriginalOrder(state, replyRenderer),
        children: [],
      }
    })

    const orderedNodes = buildCommentReplyTreeOrder(nodes)
    const indentStep = getCommentReplyTreeIndentStep(replyContainer)
    const depthLimit = getCommentReplyTreeDepthLimit(replyContainer, indentStep)
    component.style.setProperty('--bew-comment-reply-indent-step', `${indentStep}px`)
    orderedNodes.forEach(({ depth, node }) => {
      const visualDepth = Math.min(depth, depthLimit)
      node.renderer.dataset.bewlyCommentReplyDepth = String(visualDepth)
      node.renderer.style.setProperty('--bew-comment-reply-indent', getCommentReplyIndent(visualDepth))
    })
    updateCommentReplyTreeVisibility(component, state, orderedNodes)
    reorderCommentReplyRenderers(
      replyContainer,
      replyRenderers,
      orderedNodes.map(({ node }) => node.renderer),
    )
    renderCommentReplyTreeGuides(
      component,
      state,
      replyContainer,
      orderedNodes,
    )
    state.enabled = true
  }

  function refreshCommentReplyTrees() {
    commentRepliesRenderers.forEach((component) => {
      if (!component?.isConnected) {
        const state = commentReplyTreeStates.get(component)
        if (state)
          disconnectCommentReplyTreeResizeObserver(state)
        commentRepliesRenderers.delete(component)
        return
      }

      updateCommentReplyTree(component)
    })
  }

  function cacheRootReplyAuthor(replyItem: any) {
    const replyRpid = getReplyRpid(replyItem)
    const rootRpid = getReplyRootRpid(replyItem)
    const authorMid = getReplyMemberMid(replyItem)
    if (!replyRpid || !authorMid)
      return

    const isRootReply = !rootRpid || rootRpid === '0' || rootRpid === replyRpid
    if (!isRootReply)
      return

    const threadRootKey = getThreadRootKey(replyItem, replyRpid)
    rootReplyAuthorByThread.set(threadRootKey, authorMid)
  }

  function tryResolveRootAuthorFromDom(replyItem: any, rootRpid: string): string | null {
    const rootReplyElements = document.querySelectorAll('bili-comment-user-info')
    for (let i = 0; i < rootReplyElements.length; i += 1) {
      const component = rootReplyElements[i] as any
      const data = component?.data
      if (!data)
        continue

      const dataRpid = getReplyRpid(data)
      if (dataRpid !== rootRpid)
        continue

      const rootAuthorMid = getReplyMemberMid(data)
      if (rootAuthorMid)
        return rootAuthorMid
    }

    return null
  }

  function isSubReplyByRootAuthor(replyItem: any): boolean {
    const rootRpid = getReplyRootRpid(replyItem)
    if (!rootRpid || rootRpid === '0')
      return false

    const authorMid = getReplyMemberMid(replyItem)
    if (!authorMid)
      return false

    const threadRootKey = getThreadRootKey(replyItem, rootRpid)
    let rootAuthorMid = rootReplyAuthorByThread.get(threadRootKey)
    if (!rootAuthorMid) {
      rootAuthorMid = tryResolveRootAuthorFromDom(replyItem, rootRpid) ?? undefined
      if (rootAuthorMid)
        rootReplyAuthorByThread.set(threadRootKey, rootAuthorMid)
    }

    return rootAuthorMid === authorMid
  }

  function updateInfoElement(
    root: ShadowRoot | null | undefined,
    id: string,
    shouldShow: boolean,
    text: any,
    anchor: Element | null | undefined,
  ): HTMLElement | null {
    if (!root)
      return null

    let element = root.querySelector<HTMLElement>(`#${id}`)

    if (!shouldShow || !anchor) {
      if (element)
        element.remove()
      return null
    }

    if (!element) {
      element = document.createElement('div')
      element.id = id
      anchor.insertAdjacentElement('afterend', element)
    }

    // 如果是性别元素，使用纯色图标显示
    if (id === 'sex') {
      element.style.cssText = 'display: inline-flex; align-items: center; margin-left: 4px; vertical-align: middle;'
      element.innerHTML = ''

      // 根据性别显示不同的图标
      if (text === '男') {
        element.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="#00a1d6" style="display: block;"><path d="M20 4v6h-2V7.425l-3.975 3.95q.475.7.725 1.488T15 14.5q0 2.3-1.6 3.9T9.5 20q-2.3 0-3.9-1.6T4 14.5q0-2.3 1.6-3.9T9.5 9q.825 0 1.625.237t1.475.738L16.575 6H14V4zM9.5 11q-1.45 0-2.475 1.025T6 14.5q0 1.45 1.025 2.475T9.5 18q1.45 0 2.475-1.025T13 14.5q0-1.45-1.025-2.475T9.5 11"/></svg>'
      }
      else if (text === '女') {
        element.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="#fb7299" style="display: block;"><path d="M11 21v-2H9v-2h2v-2.1q-1.975-.35-3.238-1.888T6.5 9.45q0-2.275 1.613-3.862T12 4t3.888 1.588T17.5 9.45q0 2.025-1.263 3.563T13 14.9V17h2v2h-2v2zm1-8q1.45 0 2.475-1.025T15.5 9.5q0-1.45-1.025-2.475T12 6q-1.45 0-2.475 1.025T8.5 9.5q0 1.45 1.025 2.475T12 13"/></svg>'
      }
      else {
      // 保密不显示
        element.remove()
        return null
      }
    }
    // 如果是IP地理位置元素，使用Tag样式显示
    else if (id === 'location') {
      element.style.cssText = `display: inline-block; margin-left: 4px; padding: 1px 4px; font-size: 11px; color: var(--bew-ip-tag-text); background-color: var(--bew-ip-tag-bg); border-radius: 3px; vertical-align: middle; line-height: 1.4;`
      element.textContent = String(text)
    }
    // 楼主标签使用主题色，明暗模式由主题变量自动适配
    else if (id === 'host-tag') {
      element.style.cssText = `display: inline-block; margin-left: 4px; padding: 1px 4px; font-size: 11px; font-weight: 500; color: var(--bew-theme-color); background-color: var(--bew-theme-color-10); border-radius: 3px; vertical-align: middle; line-height: 1.4;`
      element.textContent = String(text)
    }
    else {
      element.textContent = String(text)
    }

    return element
  }

  // 判断当前页面URL是否支持IP显示
  function isSupportedPage(): boolean {
    const currentUrl = window.location.href
    return (
    // 视频页面
      /https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/.*/.test(currentUrl)
      // 视频分享页短链路径
      || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/s\/video\/.*/.test(currentUrl)
      // 番剧页面
      || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/bangumi\/play\/.*/.test(currentUrl)
      // 动态页面
      || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share).*/.test(currentUrl)
      // 动态详情页
      || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/.*/.test(currentUrl)
      // 用户空间页面
      || /https?:\/\/space\.bilibili\.com\/.*/.test(currentUrl)
      // 专栏页面
      || /https?:\/\/(?:www\.)?bilibili\.com\/read\/.*/.test(currentUrl)
      // 话题页面
      || /https?:\/\/(?:www\.)?bilibili\.com\/v\/topic\/detail.*/.test(currentUrl)
      // 课程页面
      || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/cheese\/play\/.*/.test(currentUrl)
      // 稍后再看列表页（两种路径）
      || /https?:\/\/(?:www\.)?bilibili\.com\/watchlater\/(?:#\/)?list.*/.test(currentUrl)
      || /https?:\/\/(?:www\.)?bilibili\.com\/list\/watchlater(?:\?.*|\/.*)?$/.test(currentUrl)
      // 收藏夹与媒体列表
      || /https?:\/\/(?:www\.)?bilibili\.com\/list\/ml.*/.test(currentUrl)
      || /https?:\/\/(?:www\.)?bilibili\.com\/medialist\/(?:play|detail)\/.*/.test(currentUrl)
      // 活动页面
      || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/blackboard\/.*/.test(currentUrl)
      // 拜年祭页面
      || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/festival\/.*/.test(currentUrl)
      // 漫画页面
      || /https?:\/\/manga\.bilibili\.com\/detail\/.*/.test(currentUrl)
    )
  }

  if (window.customElements && isSupportedPage()) {
    const { define: originalDefine } = window.customElements
    window.customElements.define = new Proxy(originalDefine, {
      apply: (target, thisArg, args) => {
        const [name, classConstructor] = args
        if (typeof classConstructor !== 'function') {
          return Reflect.apply(target, thisArg, args)
        }

        const shadowStylePatch = COMMENT_SHADOW_STYLE_PATCHES[name]
        if (shadowStylePatch) {
          try {
            patchCommentComponentUpdate(name, classConstructor, (component) => {
              const root = component.shadowRoot
              if (!root)
                return

              ensureCommentShadowStyle(root, shadowStylePatch.id, shadowStylePatch.css)
              if (name === 'bili-comment-replies-renderer')
                updateCommentReplyTree(component)
            })
          }
          catch (error) {
            console.warn(`[BewlyCat] Failed to patch ${name}.`, error)
          }
          return Reflect.apply(target, thisArg, args)
        }

        if (name === 'bili-comment-reply-renderer') {
          try {
            patchCommentComponentUpdate(name, classConstructor, (component) => {
              const rootNode = component.getRootNode?.()
              const repliesRenderer = rootNode instanceof ShadowRoot ? rootNode.host : null
              if (repliesRenderer?.localName === 'bili-comment-replies-renderer')
                updateCommentReplyTree(repliesRenderer)
            })
          }
          catch (error) {
            console.warn(`[BewlyCat] Failed to patch ${name}.`, error)
          }
          return Reflect.apply(target, thisArg, args)
        }

        // 处理评论区图片组件
        if (name === 'bili-comment-pictures-renderer') {
          try {
            patchCommentComponentUpdate(name, classConstructor, (component) => {
              const root = component.shadowRoot
              if (!root)
                return

              // 根据设置决定是否修复图片长宽比问题
              if (currentSettings?.adjustCommentImageHeight) {
              // 非1:1图片（非flex布局）保持宽度，高度按实际比例自适应
                const content = root.querySelector('#content')
                if (content && !content.classList.contains('flex')) {
                  const images = content.querySelectorAll('img')
                  images.forEach((img: HTMLImageElement) => {
                  // 移除固定的 height 属性，让图片按实际比例显示
                    img.removeAttribute('height')
                    img.style.height = 'auto'
                  })
                }
              }
            })
          }
          catch (error) {
            console.warn(`[BewlyCat] Failed to patch ${name}.`, error)
          }
          return Reflect.apply(target, thisArg, args)
        }

        // 处理评论用户信息组件
        if (name === 'bili-comment-user-info') {
          try {
            patchCommentComponentUpdate(name, classConstructor, (component) => {
              const root = component.shadowRoot
              if (!root)
                return

              // 找到用户名元素
              const userNameEl = root.querySelector('#user-name')
              if (!userNameEl)
                return

              cacheRootReplyAuthor(component.data)

              // 显示性别
              const sexString = getSexString(component.data)
              const shouldShowSex = Boolean(currentSettings?.showSex && sexString)
              const sexEl = updateInfoElement(root, 'sex', shouldShowSex, sexString, userNameEl)

              // 在楼中楼里给最外层楼主的回复添加标识
              const shouldShowHostTag = Boolean(
                currentSettings?.showCommentHostTag
                && isSubReplyByRootAuthor(component.data),
              )
              const hostAnchor = sexEl ?? userNameEl
              const hostEl = updateInfoElement(root, 'host-tag', shouldShowHostTag, getHostTagText(), hostAnchor)

              // 显示IP地理位置
              const locationString = getLocationString(component.data)
              const shouldShowLocation = Boolean(currentSettings?.showIPLocation && locationString)
              const locationAnchor = hostEl ?? sexEl ?? userNameEl
              updateInfoElement(root, 'location', shouldShowLocation, locationString, locationAnchor)
            })
          }
          catch (error) {
            console.warn(`[BewlyCat] Failed to patch ${name}.`, error)
          }
          return Reflect.apply(target, thisArg, args)
        }

        return Reflect.apply(target, thisArg, args)
      },
    })
  }

  // 添加消息监听器
  window.addEventListener('message', (event) => {
  // 确保消息来源是插件环境
    if (event.source !== window)
      return

    const { type, data } = event.data

    // 处理来自插件环境的消息
    if (type === 'BEWLY_SETTINGS_UPDATE') {
    // 更新设置
      if (data) {
        const isFirstTime = !settingsReady
        currentSettings = data
        preventMobileRedirectEnabled = data.preventMobileRedirect === true
        settingsReady = true
        refreshCommentReplyTrees()
        resolveSettingsReady?.()
        resolveSettingsReady = null

        // 只在首次启用时输出日志
        if (isFirstTime && data.enableVolumeNormalization) {
          console.log('[AudioInterceptor] 音量均衡已启用')
        }
      }
    }
  })

  // 请求初始设置
  window.postMessage({
    type: 'BEWLY_REQUEST_SETTINGS',
  }, '*')

  const SEARCH_RESULT_API_PATHS = [
    '/x/web-interface/wbi/search/all',
    '/x/web-interface/wbi/search/type',
    '/x/web-interface/search/type',
  ]

  function getFetchInputUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string')
      return input
    if (input instanceof URL)
      return input.href
    return input.url
  }

  function isSearchResultFetch(input: RequestInfo | URL): boolean {
    if (window.location.hostname !== 'search.bilibili.com')
      return false

    try {
      const requestUrl = new URL(getFetchInputUrl(input), window.location.href)
      return requestUrl.hostname === 'api.bilibili.com'
        && SEARCH_RESULT_API_PATHS.some(path => requestUrl.pathname.startsWith(path))
    }
    catch {
      return false
    }
  }

  const originalFetch = window.fetch

  function isAllowedPageNoCookieSearchUrl(url: string): boolean {
    try {
      const requestUrl = new URL(url, window.location.href)
      return requestUrl.hostname === 'api.bilibili.com'
        && SEARCH_RESULT_API_PATHS.some(path => requestUrl.pathname.startsWith(path))
    }
    catch {
      return false
    }
  }

  async function handlePageNoCookieSearchRequest(data: any) {
    const id = data?.id
    const url = data?.url
    if (typeof id !== 'string' || typeof url !== 'string')
      return

    try {
      if (!isAllowedPageNoCookieSearchUrl(url))
        throw new Error('Unsupported no-cookie search request')

      const response = await originalFetch.call(window, url, {
        method: 'GET',
        credentials: 'omit',
      })
      const text = await response.text()
      let parsedResponse: unknown

      try {
        parsedResponse = text ? JSON.parse(text) : null
      }
      catch {
        throw new Error('Invalid no-cookie search response')
      }

      window.postMessage({
        type: PAGE_NO_COOKIE_SEARCH_RESPONSE,
        data: {
          id,
          ok: response.ok,
          status: response.status,
          response: parsedResponse,
        },
      }, '*')
    }
    catch (error) {
      window.postMessage({
        type: PAGE_NO_COOKIE_SEARCH_RESPONSE,
        data: {
          id,
          error: error instanceof Error ? error.message : String(error),
        },
      }, '*')
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window)
      return

    const { type, data } = event.data || {}
    if (type === PAGE_NO_COOKIE_SEARCH_REQUEST)
      void handlePageNoCookieSearchRequest(data)
  })

  function fetchWithSearchSettings(thisArg: unknown, input: RequestInfo | URL, init?: RequestInit) {
    if (!currentSettings?.depersonalizeSearchResults)
      return originalFetch.call(thisArg, input, init)

    const newInit: RequestInit = {
      ...init,
      credentials: 'omit',
    }

    if (input instanceof Request)
      return originalFetch.call(thisArg, new Request(input, newInit))

    return originalFetch.call(thisArg, input, newInit)
  }

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    if (isSearchResultFetch(input) && !settingsReady) {
      return settingsReadyPromise.then(() => {
        return fetchWithSearchSettings(this, input, init)
      })
    }
    if (isSearchResultFetch(input))
      return fetchWithSearchSettings(this, input, init)
    return originalFetch.call(this, input, init)
  }

  // 页面加载完成后初始化随机播放（功能已迁移到contentScripts）

  // Bilibili tracking parameters to be removed from URLs
  const BILIBILI_TRACKING_PARAMS = [
    'spm_id_from',
    'vd_source',
    'share_source',
    'share_medium',
    'share_plat',
    'share_session_id',
    'share_tag',
    'share_times',
    'unique_k',
    'bbid',
    'ts',
    'from_source',
    'from_spmid',
    'from',
    'buvid',
    'is_story_h5',
    'mid',
    'p',
    'plat_id',
    'share_from',
    'timestamp',
    'csource',
    'launch_id',
    '-Arouter',
  ]

  function cleanUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      if (!urlObj.hostname.includes('bilibili.com') && !urlObj.hostname.includes('b23.tv'))
        return url
      for (const param of BILIBILI_TRACKING_PARAMS)
        urlObj.searchParams.delete(param)
      let cleaned = urlObj.toString()
      if (urlObj.searchParams.toString() === '')
        cleaned = cleaned.replace(/\?$/, '')
      return cleaned
    }
    catch { return url }
  }

  // 提取文本中第一个成对的「【...】」内容，支持嵌套
  function extractFirstBracketContent(text: string): string | null {
    const start = text.indexOf('【')
    if (start === -1)
      return null
    let depth = 0
    for (let i = start; i < text.length; i++) {
      if (text[i] === '【')
        depth++
      else if (text[i] === '】')
        depth--
      if (depth === 0 && i > start)
        return text.slice(start + 1, i)
    }
    return null
  }

  function cleanShareText(text: string, includeTitle: boolean, removeTracking: boolean): string {
    // 分别解析标题与链接，标题内部可能存在嵌套的「【...】」
    const title = extractFirstBracketContent(text)
    const urlMatch = text.match(/(https?:\/\/\S+)/)
    const url = urlMatch?.[1]

    if (url) {
      const cleanedUrl = removeTracking ? cleanUrl(url) : url
      if (title)
        return includeTitle ? `${title} ${cleanedUrl}` : cleanedUrl
      return cleanedUrl
    }

    if (removeTracking)
      return text.replace(/(https?:\/\/\S+)/g, u => cleanUrl(u))
    return text
  }

  // 拦截 navigator.clipboard.writeText，启用净化分享链接功能
  const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard)
  navigator.clipboard.writeText = function (text: string) {
    if (!currentSettings?.enableCleanShareLink)
      return originalWriteText(text)

    const isBilibiliShare = /【.+?】\s*https?:\/\//.test(text)
    const hasBilibiliUrl = /https?:\/\/(?:www\.)?bilibili\.com\//.test(text) || /https?:\/\/b23\.tv\//.test(text)

    if (isBilibiliShare || hasBilibiliUrl) {
      const includeTitle = currentSettings?.cleanShareLinkIncludeTitle ?? false
      const removeTracking = currentSettings?.cleanShareLinkRemoveTrackingParams !== false
      const cleanedText = cleanShareText(text, includeTitle, removeTracking)
      return originalWriteText(cleanedText)
    }

    return originalWriteText(text)
  }
}
