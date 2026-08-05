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

  /** 楼中楼已见过的回复关系（跨分页保留，用于父节点不在当前页时回溯挂载） */
  interface CommentReplyTreeCachedMeta {
    authorName: string | null
    ctime: number | null
    /** 纯文本正文（已去掉「回复 @」前缀），用于离页父评引用 */
    messageText: string | null
    parentRpid: string | null
    rootRpid: string | null
  }

  interface CommentReplyTreeState {
    collapsedNodeKeys: Set<string>
    /** 收起某条评论之后的全部同级评论（及子树） */
    collapsedTailKeys: Set<string>
    /** 展开时缓存的分支收起按钮 Y，用于「不收起主评论」收起后留在原位 */
    branchToggleYByKey: Map<string, number>
    /** 展开时缓存的平级收起按钮 Y，收起后保持原位避免上缩断线 */
    tailToggleYByKey: Map<string, number>
    /**
     * 按 rpid 缓存回复的 parent/root 等关系。
     * 楼中楼翻页后父评论可能不在当前 DOM，仍需靠此结构挂到最近可见祖先。
     */
    replyMetaByRpid: Map<string, CommentReplyTreeCachedMeta>
    enabled: boolean
    nextOriginalOrder: number
    originalOrderByRenderer: WeakMap<HTMLElement, number>
    observedTargetsKey?: string
    resizeObserver?: ResizeObserver
    observedReplyContainer?: HTMLElement
    replyContainerMutationObserver?: MutationObserver
    imageLoadAbort?: AbortController
    imageLoadListeners?: WeakSet<HTMLImageElement>
    layoutUpdateRaf?: number
    /** 锚点未就绪时的重试次数，防止无限 rAF */
    layoutRetryCount?: number
  }

  const pendingCommentReplyTreeLayoutUpdates = new WeakSet<object>()

  interface CommentReplyTreeNode {
    authorName: string | null
    renderer: HTMLElement
    rpid: string | null
    parentRpid: string | null
    rootRpid: string | null
    ctime: number | null
    originalOrder: number
    children: CommentReplyTreeNode[]
    /**
     * 直接 parent 是否在当前页 DOM。
     * 为 false 时视觉上挂在最近可见祖先下，需保留「回复 @真实父作者」提示。
     */
    directParentVisible: boolean
    /** 直接父回复作者（当前页或跨页缓存） */
    directParentAuthorName: string | null
    /** 直接父回复正文摘要（跨页缓存） */
    directParentMessageText: string | null
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

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail {
      cursor: pointer;
      pointer-events: auto;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__line {
      fill: none;
      stroke: var(--bew-comment-tree-line-color, var(--line_regular, rgba(148, 153, 160, 0.28)));
      stroke-width: var(--bew-space-0-5, 2px);
      /* butt 避免圆角线帽在竖线外侧鼓出一截 */
      stroke-linecap: butt;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__symbol,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail__symbol {
      fill: none;
      stroke: var(--bew-comment-tree-line-color, var(--line_regular, rgba(148, 153, 160, 0.28)));
      stroke-width: var(--bew-space-0-5, 2px);
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__line,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__symbol,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__node,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail__symbol,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail__node {
      pointer-events: none;
      transition: stroke var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__hit {
      fill: none;
      stroke: transparent;
      stroke-width: var(--bew-space-6, 24px);
      pointer-events: stroke;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__node-hit,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail__node-hit {
      fill: transparent;
      stroke: none;
      pointer-events: all;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__node,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail__node {
      fill: var(--bew-bg, var(--bg1, #fff));
      stroke: var(--bew-comment-tree-line-color, var(--line_regular, rgba(148, 153, 160, 0.28)));
      stroke-width: var(--bew-space-0-5, 2px);
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__focus,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail__focus {
      fill: none;
      stroke: transparent;
      stroke-width: var(--bew-space-0-5, 2px);
      pointer-events: none;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch__author,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail__label {
      fill: var(--bew-text-2, var(--text2, #61666d));
      font-size: var(--bew-font-size-caption, 12px);
      font-weight: var(--bew-font-weight-medium, 500);
      pointer-events: none;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch:hover :is(.bewly-comment-reply-branch__line, .bewly-comment-reply-branch__node, .bewly-comment-reply-branch__symbol),
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail:hover :is(.bewly-comment-reply-tail__node, .bewly-comment-reply-tail__symbol) {
      stroke: var(--bew-theme-color, #00aeec);
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch:focus,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch:focus-visible,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail:focus,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }

    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-branch:focus-visible .bewly-comment-reply-branch__focus,
    #${COMMENT_REPLY_TREE_GUIDES_ID} .bewly-comment-reply-tail:focus-visible .bewly-comment-reply-tail__focus {
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

        #body .tag:empty {
          display: none !important;
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

  function findCommentComponentLifecycleMethod(
    prototype: object,
    methodName: string,
  ): ((...args: any[]) => any) | null {
    let current: object | null = prototype
    while (current && current !== Object.prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(current, methodName)
      if (descriptor) {
        if (typeof descriptor.value === 'function')
          return descriptor.value
        return null
      }
      current = Object.getPrototypeOf(current)
    }
    return null
  }

  /**
   * 在评论相关自定义元素的生命周期后执行增强逻辑。
   * 优先 patch update（Lit）；若无 update 则回退 connectedCallback / updated。
   */
  function patchCommentComponentUpdate(
    name: string,
    classConstructor: any,
    enhance: (component: any) => void,
    options?: { silent?: boolean },
  ) {
    const prototype = classConstructor?.prototype as object | undefined
    if (!prototype) {
      if (!options?.silent)
        console.warn(`[BewlyCat] Skip patching ${name}: prototype is unavailable.`)
      return false
    }

    if ((prototype as any)[COMMENT_COMPONENT_PATCHED])
      return true

    const scheduleEnhance = (instance: any) => {
      // Do not run BewlyCat DOM work inside Bilibili's render lifecycle.
      if (pendingCommentEnhancements.has(instance))
        return
      pendingCommentEnhancements.add(instance)
      const runAfterBilibiliRender = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            pendingCommentEnhancements.delete(instance)
            if (instance instanceof Node && !instance.isConnected)
              return

            try {
              enhance(instance)
            }
            catch (error) {
              console.warn(`[BewlyCat] Failed to enhance ${name}.`, error)
            }
          })
        })
      }

      // 设置读取和两个渲染帧都完成后再增强，避免与 B 站首次水合争抢 DOM。
      if (settingsReady)
        runAfterBilibiliRender()
      else
        void settingsReadyPromise.then(runAfterBilibiliRender)
    }

    const lifecycleMethods = ['update', 'updated', 'connectedCallback'] as const
    let patchedMethod: typeof lifecycleMethods[number] | null = null
    let originalMethod: ((...args: any[]) => any) | null = null

    for (const methodName of lifecycleMethods) {
      const method = findCommentComponentLifecycleMethod(prototype, methodName)
      if (typeof method === 'function') {
        patchedMethod = methodName
        originalMethod = method
        break
      }
    }

    if (!patchedMethod || !originalMethod) {
      if (!options?.silent)
        console.warn(`[BewlyCat] Skip patching ${name}: no suitable lifecycle method.`)
      return false
    }

    const boundOriginal = originalMethod
    const patched = function (this: any, ...updateArgs: any[]) {
      const result = Reflect.apply(boundOriginal, this, updateArgs)
      scheduleEnhance(this)
      return result
    }

    Object.defineProperty(prototype, patchedMethod, {
      configurable: true,
      writable: true,
      value: patched,
    })
    Object.defineProperty(prototype, COMMENT_COMPONENT_PATCHED, {
      configurable: true,
      value: true,
    })
    return true
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

  const COMMENT_REPLY_TAIL_LABELS: Record<string, { collapse: string, expand: string }> = {
    en: { collapse: 'Collapse following sibling comments', expand: 'Expand following sibling comments' },
    'cmn-TW': { collapse: '收合後續同層評論', expand: '展開後續同層評論' },
    jyut: { collapse: '收起後面嘅同層留言', expand: '展開後面嘅同層留言' },
    'cmn-CN': { collapse: '收起后续同级评论', expand: '展开后续同级评论' },
  }

  /** 父回复不在本页时的标题文案 */
  const COMMENT_REPLY_OFFPAGE_PARENT_LABELS: Record<string, (name: string) => string> = {
    en: name => `Reply to @${name} · not on this page`,
    'cmn-TW': name => `回覆 @${name} · 不在本頁`,
    jyut: name => `回覆 @${name} · 唔喺呢一頁`,
    'cmn-CN': name => `回复 @${name} · 不在本页`,
  }

  /** 离页父评引用块最大展示字数 */
  const COMMENT_REPLY_OFFPAGE_PARENT_SNIPPET_MAX = 96

  function getCommentReplyOffpageParentLabel(authorName: string): string {
    const language = currentSettings?.language || 'cmn-CN'
    const formatter = COMMENT_REPLY_OFFPAGE_PARENT_LABELS[language]
      ?? COMMENT_REPLY_OFFPAGE_PARENT_LABELS['cmn-CN']
    return formatter(authorName)
  }

  /** 从子回复正文「回复 @xxx」前缀解析被回复者昵称（父评未缓存时的回退） */
  function getReplyAtAuthorFromMessage(replyItem: any): string | null {
    const raw = typeof replyItem?.content?.message === 'string'
      ? replyItem.content.message
      : typeof replyItem?.message === 'string'
        ? replyItem.message
        : null
    if (!raw)
      return null
    // 用单一 \s+ 避免 \s*@?\s* 回溯；@ 可选，捕获昵称
    const match = raw.match(/^(?:回复|回覆|Reply(?:\s+to)?)\s+@?([^\s:：]+)/iu)
    const name = match?.[1]?.trim()
    return name || null
  }

  /** 去掉「回复 @xxx :」前缀并压空白，供缓存与引用展示 */
  function normalizeReplyMessageText(text: string | null | undefined): string | null {
    if (typeof text !== 'string')
      return null
    // @ 已可由 [^\s:：]+ 吞掉，无需再写 @?
    const stripped = text
      .replace(/^(?:回复|回覆|Reply(?:\s+to)?)\s+[^\s:：]+(?:\s*[:：]\s*|\s+)/iu, '')
      .replace(/\s+/gu, ' ')
      .trim()
    return stripped || null
  }

  function getReplyMessageText(replyItem: any): string | null {
    if (!replyItem || typeof replyItem !== 'object')
      return null

    const candidates = [
      replyItem?.content?.message,
      replyItem?.content?.text,
      replyItem?.message,
      replyItem?.text,
    ]
    for (const candidate of candidates) {
      const normalized = normalizeReplyMessageText(typeof candidate === 'string' ? candidate : null)
      if (normalized)
        return normalized
    }
    return null
  }

  function pickRicherReplyMessageText(a: string | null | undefined, b: string | null | undefined): string | null {
    if (!a)
      return b ?? null
    if (!b)
      return a
    return b.length > a.length ? b : a
  }

  function truncateReplyMessageSnippet(
    text: string,
    maxLen = COMMENT_REPLY_OFFPAGE_PARENT_SNIPPET_MAX,
  ): string {
    if (text.length <= maxLen)
      return text
    return `${text.slice(0, maxLen).trimEnd()}…`
  }

  function getCommentRendererMessageText(renderer: HTMLElement): string | null {
    const contentsList = findCommentRichTextContents(renderer)
    if (contentsList.length === 0)
      return null

    const raw = contentsList
      .map((contents) => {
        // 忽略我们隐藏的「回复 @」前缀节点，避免污染正文缓存
        const clone = contents.cloneNode(true) as HTMLElement
        clone.querySelectorAll('[data-bewly-hide-reply-at]').forEach(el => el.remove())
        return clone.textContent || ''
      })
      .join(' ')
    return normalizeReplyMessageText(raw)
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

  function getCommentReplyTailLabel(collapsed: boolean): string {
    const language = currentSettings?.language || 'cmn-CN'
    const labels = COMMENT_REPLY_TAIL_LABELS[language] ?? COMMENT_REPLY_TAIL_LABELS['cmn-CN']
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
      ?? replyItem?.member?.name
      ?? replyItem?.uname
      ?? replyItem?.name
    return typeof authorName === 'string' && authorName.trim()
      ? authorName.trim()
      : null
  }

  /** 从评论组件解析作者昵称（含 DOM 回退，折叠后 data 偶发缺失） */
  function getCommentRendererAuthorName(renderer: HTMLElement | null | undefined): string | null {
    if (!renderer)
      return null

    const fromData = getReplyAuthorName(getCommentReplyData(renderer))
    if (fromData)
      return fromData

    const shadow = renderer.shadowRoot
    if (!shadow)
      return null

    const nameCandidates = [
      shadow.querySelector('#user-name'),
      shadow.querySelector('.user-name'),
      shadow.querySelector('bili-comment-user-info'),
    ]
    for (const el of nameCandidates) {
      const text = el?.textContent?.trim()
      if (text)
        return text
    }
    return null
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

  /** 从评论子组件向上找到所属的 bili-comment-replies-renderer */
  function findCommentRepliesRendererHost(component: HTMLElement | null | undefined): HTMLElement | null {
    let node: Node | null = component ?? null
    for (let depth = 0; depth < 10 && node; depth++) {
      if (node instanceof ShadowRoot) {
        node = node.host
        continue
      }
      if (node instanceof HTMLElement && node.localName === 'bili-comment-replies-renderer')
        return node
      node = node.parentNode
    }
    return null
  }

  /** 从主评论内的图片等子组件向上找到同一楼层的回复容器 */
  function findCommentThreadRepliesRenderer(component: HTMLElement | null | undefined): HTMLElement | null {
    let node: Node | null = component ?? null
    for (let depth = 0; depth < 12 && node; depth++) {
      if (node instanceof ShadowRoot) {
        if (node.host.localName === 'bili-comment-thread-renderer')
          return node.querySelector<HTMLElement>('bili-comment-replies-renderer')
        node = node.host
        continue
      }
      if (node instanceof HTMLElement && node.localName === 'bili-comment-thread-renderer')
        return node.shadowRoot?.querySelector<HTMLElement>('bili-comment-replies-renderer') ?? null
      node = node.parentNode
    }
    return null
  }

  function getCommentReplyTreeState(component: object): CommentReplyTreeState {
    let state = commentReplyTreeStates.get(component)
    if (!state) {
      state = {
        collapsedNodeKeys: new Set(),
        collapsedTailKeys: new Set(),
        branchToggleYByKey: new Map(),
        tailToggleYByKey: new Map(),
        replyMetaByRpid: new Map(),
        enabled: false,
        nextOriginalOrder: 0,
        originalOrderByRenderer: new WeakMap(),
      }
      commentReplyTreeStates.set(component, state)
    }
    else {
      if (!state.collapsedTailKeys)
        state.collapsedTailKeys = new Set()
      if (!state.branchToggleYByKey)
        state.branchToggleYByKey = new Map()
      if (!state.tailToggleYByKey)
        state.tailToggleYByKey = new Map()
      if (!state.replyMetaByRpid)
        state.replyMetaByRpid = new Map()
    }
    return state
  }

  function isCommentReplyTreeRootParent(parentRpid: string | null, rootRpid: string | null, selfRpid: string | null): boolean {
    if (!parentRpid || parentRpid === '0')
      return true
    if (selfRpid && parentRpid === selfRpid)
      return true
    if (rootRpid && parentRpid === rootRpid)
      return true
    return false
  }

  /** 写入/合并当前页见到的回复关系，供跨页挂载回溯 */
  function cacheCommentReplyTreeMeta(
    state: CommentReplyTreeState,
    replyItem: any,
    extras?: { messageText?: string | null },
  ): CommentReplyTreeCachedMeta | null {
    const rpid = getReplyRpid(replyItem)
    if (!rpid)
      return null

    const previous = state.replyMetaByRpid.get(rpid)
    const fromData = getReplyMessageText(replyItem)
    const messageText = pickRicherReplyMessageText(
      pickRicherReplyMessageText(previous?.messageText, fromData),
      extras?.messageText ?? null,
    )
    const next: CommentReplyTreeCachedMeta = {
      authorName: getReplyAuthorName(replyItem) ?? previous?.authorName ?? null,
      ctime: getCommentReplyCtime(replyItem) ?? previous?.ctime ?? null,
      messageText,
      parentRpid: getReplyParentRpid(replyItem) ?? previous?.parentRpid ?? null,
      rootRpid: getReplyRootRpid(replyItem) ?? previous?.rootRpid ?? null,
    }
    state.replyMetaByRpid.set(rpid, next)
    return next
  }

  interface CommentReplyTreeParentResolve {
    /** 用于缩进/引导线的最近可见祖先；undefined 表示挂在楼中楼根下 */
    visualParent: CommentReplyTreeNode | undefined
    /** 直接 parent 是否在当前页 */
    directParentVisible: boolean
    /** 直接父回复作者（用于跨页时展示「回复了谁」） */
    directParentAuthorName: string | null
    /** 直接父回复正文（跨页缓存摘要） */
    directParentMessageText: string | null
  }

  /**
   * 在当前可见节点中解析父节点：直接 parent 不在页内时，
   * 沿 replyMetaByRpid 向上找最近仍在 DOM 的祖先。
   * 同时记录真实直接父是否在本页，供 UI 保留「回复 @xxx」。
   */
  function resolveCommentReplyTreeParentNode(
    node: CommentReplyTreeNode,
    nodeByRpid: Map<string, CommentReplyTreeNode>,
    metaByRpid: Map<string, CommentReplyTreeCachedMeta>,
  ): CommentReplyTreeParentResolve {
    const directParentRpid = node.parentRpid
    if (!directParentRpid || isCommentReplyTreeRootParent(directParentRpid, node.rootRpid, node.rpid)) {
      return {
        visualParent: undefined,
        directParentVisible: true,
        directParentAuthorName: null,
        directParentMessageText: null,
      }
    }

    const directInDom = nodeByRpid.get(directParentRpid)
    const directMeta = metaByRpid.get(directParentRpid)
    const directParentAuthorName = (
      directInDom?.authorName
      ?? directMeta?.authorName
      ?? null
    )
    const directParentMessageText = (
      directMeta?.messageText
      ?? null
    )

    if (directInDom && directInDom !== node) {
      return {
        visualParent: directInDom,
        directParentVisible: true,
        directParentAuthorName,
        directParentMessageText,
      }
    }

    // 直接父不在本页：沿缓存向上找最近可见祖先
    let parentRpid: string | null = directMeta?.parentRpid ?? null
    if (!node.rootRpid && directMeta?.rootRpid)
      node.rootRpid = directMeta.rootRpid

    const seen = new Set<string>([directParentRpid])
    if (node.rpid)
      seen.add(node.rpid)

    while (parentRpid) {
      if (seen.has(parentRpid))
        break
      seen.add(parentRpid)

      if (isCommentReplyTreeRootParent(parentRpid, node.rootRpid, node.rpid)) {
        return {
          visualParent: undefined,
          directParentVisible: false,
          directParentAuthorName,
          directParentMessageText,
        }
      }

      const parentNode = nodeByRpid.get(parentRpid)
      if (parentNode && parentNode !== node) {
        return {
          visualParent: parentNode,
          directParentVisible: false,
          directParentAuthorName,
          directParentMessageText,
        }
      }

      const cachedParent = metaByRpid.get(parentRpid)
      if (!cachedParent) {
        return {
          visualParent: undefined,
          directParentVisible: false,
          directParentAuthorName,
          directParentMessageText,
        }
      }

      if (!node.rootRpid && cachedParent.rootRpid)
        node.rootRpid = cachedParent.rootRpid

      parentRpid = cachedParent.parentRpid
    }

    return {
      visualParent: undefined,
      directParentVisible: false,
      directParentAuthorName,
      directParentMessageText,
    }
  }

  function disconnectCommentReplyTreeResizeObserver(state: CommentReplyTreeState) {
    state.resizeObserver?.disconnect()
    state.resizeObserver = undefined
    state.observedTargetsKey = undefined
    state.replyContainerMutationObserver?.disconnect()
    state.replyContainerMutationObserver = undefined
    state.observedReplyContainer = undefined
    state.imageLoadAbort?.abort()
    state.imageLoadAbort = undefined
    state.imageLoadListeners = undefined
    if (state.layoutUpdateRaf !== undefined) {
      cancelAnimationFrame(state.layoutUpdateRaf)
      state.layoutUpdateRaf = undefined
    }
  }

  /**
   * 主评论图文加载/展开会把楼中楼整体下推；仅 observe 回复容器时
   * ResizeObserver 不会因「上方变高导致位移」触发，线条会错位。
   * 同时监听楼层 host、主评论与回复容器，并在图片 load 后重算。
   */
  function scheduleCommentReplyTreeLayoutUpdate(component: any) {
    if (!component || pendingCommentReplyTreeLayoutUpdates.has(component))
      return

    pendingCommentReplyTreeLayoutUpdates.add(component)
    requestAnimationFrame(() => {
      pendingCommentReplyTreeLayoutUpdates.delete(component)
      if (!component?.isConnected)
        return
      updateCommentReplyTree(component)
    })
  }

  function observeCommentReplyTreeLayout(
    component: any,
    state: CommentReplyTreeState,
    replyContainer: HTMLElement,
  ) {
    const threadRoot = getCommentReplyTreeThreadRoot(component)
    const threadHost = threadRoot?.host instanceof HTMLElement ? threadRoot.host : null
    const mainRenderer = getCommentReplyTreeRootRenderer(component)
    const targets = new Set<HTMLElement>()
    const addTarget = (target: Element | null | undefined) => {
      if (target instanceof HTMLElement)
        targets.add(target)
    }
    addTarget(replyContainer)
    addTarget(threadHost)
    addTarget(mainRenderer)
    addTarget(component)

    // 主评论图片和正文可能分别位于多层 shadow root；只观察外层 renderer
    // 在某些布局下无法捕获内部图片高度变化，导致回复坐标仍停留在旧位置。
    const layoutTargetSelector = '#body, #main, #header, #content, #pictures, #footer, #user-avatar, bili-comment-pictures-renderer, bili-rich-text, img'
    const collectNestedLayoutTargets = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>(layoutTargetSelector).forEach(addTarget)
      root.querySelectorAll<HTMLElement>('*').forEach((element) => {
        if (element.shadowRoot)
          collectNestedLayoutTargets(element.shadowRoot)
      })
    }
    if (threadRoot)
      collectNestedLayoutTargets(threadRoot)
    else if (component instanceof HTMLElement && component.shadowRoot)
      collectNestedLayoutTargets(component.shadowRoot)

    const targetList = [...targets]
    const targetsKey = targetList.map(el => `${el.localName}#${el.id || ''}`).join('|')

    if (state.observedTargetsKey !== targetsKey || !state.resizeObserver) {
      disconnectCommentReplyTreeResizeObserver(state)
      state.observedTargetsKey = targetsKey
      state.resizeObserver = new ResizeObserver(() => {
        if (!component?.isConnected) {
          disconnectCommentReplyTreeResizeObserver(state)
          return
        }
        scheduleCommentReplyTreeLayoutUpdate(component)
      })
      targetList.forEach(target => state.resizeObserver?.observe(target))
    }

    // 删除/屏蔽回复时，B 站有时直接从列表移除 renderer，不触发回复组件自身的
    // update；仅依赖 ResizeObserver 可能错过这一帧，导致楼层 shadow root 内的线条
    // 没有按剩余回复重新绘制。
    if (state.observedReplyContainer !== replyContainer || !state.replyContainerMutationObserver) {
      state.replyContainerMutationObserver?.disconnect()
      const observer = new MutationObserver((mutations) => {
        if (!component?.isConnected) {
          observer.disconnect()
          return
        }

        const isTreeGuideNode = (node: Node) => (
          node instanceof Element
          && (node.id === COMMENT_REPLY_TREE_GUIDES_ID
            || Boolean(node.closest(`#${COMMENT_REPLY_TREE_GUIDES_ID}`)))
        )
        const hasExternalChildListMutation = mutations.some(({ target, addedNodes, removedNodes }) => {
          if (target instanceof Element && (target.id === COMMENT_REPLY_TREE_GUIDES_ID
            || target.closest(`#${COMMENT_REPLY_TREE_GUIDES_ID}`))) {
            return false
          }

          return [...Array.from(addedNodes), ...Array.from(removedNodes)]
            .some(node => !isTreeGuideNode(node))
        })
        if (hasExternalChildListMutation)
          scheduleCommentReplyTreeLayoutUpdate(component)
      })
      observer.observe(replyContainer, { childList: true })
      state.observedReplyContainer = replyContainer
      state.replyContainerMutationObserver = observer
    }

    // 每次更新都补一次图片监听，避免图片/嵌套 shadow 在首次更新后才挂载时漏监听。
    // 主评论/回复内图片异步解码完成也会改变高度。
    const imageRoot = threadHost ?? component
    if (imageRoot instanceof HTMLElement) {
      const abort = state.imageLoadAbort ?? new AbortController()
      state.imageLoadAbort = abort
      const imageLoadListeners = state.imageLoadListeners ?? new WeakSet<HTMLImageElement>()
      state.imageLoadListeners = imageLoadListeners
      const onImageLayout = () => scheduleCommentReplyTreeLayoutUpdate(component)
      const listenImages = (root: ParentNode) => {
        root.querySelectorAll('img').forEach((img) => {
          if (img.complete || imageLoadListeners.has(img))
            return
          imageLoadListeners.add(img)
          img.addEventListener('load', onImageLayout, { once: true, signal: abort.signal })
          img.addEventListener('error', onImageLayout, { once: true, signal: abort.signal })
        })
        root.querySelectorAll<HTMLElement>('*').forEach((element) => {
          if (element.shadowRoot)
            listenImages(element.shadowRoot)
        })
      }
      listenImages(imageRoot)
      if (imageRoot.shadowRoot)
        listenImages(imageRoot.shadowRoot)
    }
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
    /**
     * true（线条-收起主评论）：收起时折叠父节点本体，显示 + 与昵称
     * false（线条-不收起主评论）：收起时父节点保持完整显示，仅隐藏子回复
     */
    collapseParentBody: boolean
    key: string
    parentAnchor: CommentReplyAvatarAnchor
    parentAuthorName: string | null
    /** 平级收起后的 + 纵坐标；主干延伸至此，避免与上方连线断开 */
    trunkExtendY?: number
  }

  /** 平级评论之间的「收起后续」控件 */
  interface CommentReplyTreeTailCollapse {
    collapsed: boolean
    hiddenCount: number
    key: string
    x: number
    y: number
  }

  type CommentReplyTreeMode = 'lineCollapseMain' | 'lineKeepMain' | 'indentOnly'

  function getCommentReplyTreeMode(): CommentReplyTreeMode | null {
    if (!currentSettings)
      return null

    if (currentSettings.enableCommentReplyTreeDisplay === false)
      return null

    const mode = currentSettings.commentReplyTreeMode
    if (mode === 'lineCollapseMain' || mode === 'lineKeepMain' || mode === 'indentOnly')
      return mode

    // 兼容尚未迁移的旧设置载荷
    if ((currentSettings as { enableCommentReplyTree?: boolean }).enableCommentReplyTree === true)
      return 'lineCollapseMain'

    return 'lineKeepMain'
  }

  function getCommentReplyAvatarAnchor(
    renderer: HTMLElement,
    containerRect: DOMRect,
  ): CommentReplyAvatarAnchor | null {
    const avatar = renderer.shadowRoot?.querySelector<HTMLElement>('#user-avatar')
      ?? renderer.shadowRoot?.querySelector<HTMLElement>('bili-avatar')
    const avatarRect = avatar?.getBoundingClientRect()
    const hasValidAvatar = Boolean(avatarRect && avatarRect.width > 0 && avatarRect.height > 0)

    // 折叠后主体 visibility:hidden + overflow:hidden，头像尺寸可能不可用，回退到渲染器自身矩形
    if (renderer.hasAttribute('data-bewly-comment-reply-collapsed')) {
      const rendererRect = renderer.getBoundingClientRect()
      const fallbackHeight = Number.parseFloat(
        getComputedStyle(renderer).getPropertyValue('--bew-space-6'),
      ) || 24
      const height = rendererRect.height > 0 ? rendererRect.height : fallbackHeight
      if (rendererRect.width <= 0 && height <= 0)
        return null

      const centerY = rendererRect.top + height / 2 - containerRect.top
      const centerX = hasValidAvatar
        ? avatarRect!.left + avatarRect!.width / 2 - containerRect.left
        : rendererRect.left + 20 - containerRect.left
      const left = hasValidAvatar
        ? avatarRect!.left - containerRect.left
        : centerX - 12

      return {
        bottom: centerY,
        centerX,
        centerY,
        left,
        toggleY: centerY,
      }
    }

    if (!hasValidAvatar || !avatarRect)
      return null

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

  /** 收起 parent 下 afterSibling 之后的全部同级评论 */
  function getCommentReplyTailCollapseKey(parentKey: string, afterSiblingKey: string): string {
    return `tail:${parentKey}:after:${afterSiblingKey}`
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

  function collectCommentReplyTailHiddenRenderers(
    state: CommentReplyTreeState,
    parentKey: string,
    siblings: CommentReplyTreeNode[],
    hiddenRenderers: Set<HTMLElement>,
  ) {
    let hideRemaining = false
    siblings.forEach((sibling, index) => {
      if (hideRemaining) {
        const markSubtree = (node: CommentReplyTreeNode) => {
          hiddenRenderers.add(node.renderer)
          node.children.forEach(markSubtree)
        }
        markSubtree(sibling)
        return
      }

      if (index >= siblings.length - 1)
        return

      const tailKey = getCommentReplyTailCollapseKey(parentKey, getCommentReplyTreeNodeKey(sibling))
      if (state.collapsedTailKeys.has(tailKey))
        hideRemaining = true
    })
  }

  function updateCommentReplyTreeVisibility(
    component: HTMLElement,
    state: CommentReplyTreeState,
    orderedNodes: Array<{ depth: number, node: CommentReplyTreeNode }>,
    rootNodes: CommentReplyTreeNode[],
    collapseParentBody: boolean,
  ) {
    const hideDescendantsAtDepth: boolean[] = []
    const rootBranchCollapsed = state.collapsedNodeKeys.has(COMMENT_REPLY_TREE_ROOT_KEY)
    // 仅「收起主评论」模式才折叠父节点本体；「不收起主评论」只隐藏子回复
    getCommentReplyTreeRootRenderer(component)
      ?.toggleAttribute('data-bewly-comment-reply-collapsed', collapseParentBody && rootBranchCollapsed)

    const hiddenByTail = new Set<HTMLElement>()
    collectCommentReplyTailHiddenRenderers(state, COMMENT_REPLY_TREE_ROOT_KEY, rootNodes, hiddenByTail)
    orderedNodes.forEach(({ node }) => {
      if (node.children.length > 1)
        collectCommentReplyTailHiddenRenderers(state, getCommentReplyTreeNodeKey(node), node.children, hiddenByTail)
    })

    orderedNodes.forEach(({ depth, node }) => {
      const hiddenByAncestor = depth === 0
        ? rootBranchCollapsed
        : hideDescendantsAtDepth[depth - 1] === true
      const hidden = hiddenByAncestor || hiddenByTail.has(node.renderer)
      const branchCollapsed = state.collapsedNodeKeys.has(getCommentReplyTreeNodeKey(node))
      const collapsedBody = !hidden && collapseParentBody && branchCollapsed
      node.renderer.toggleAttribute('data-bewly-comment-reply-hidden', hidden)
      node.renderer.toggleAttribute('data-bewly-comment-reply-collapsed', collapsedBody)
      // 任一模式下父分支收起都隐藏子树；父本体是否折叠由 collapseParentBody 决定
      hideDescendantsAtDepth[depth] = hidden || branchCollapsed
      hideDescendantsAtDepth.length = depth + 1
    })
  }

  function getCommentReplyBranchExpandedToggleY(
    parentAnchor: CommentReplyAvatarAnchor,
    childAnchors: CommentReplyAvatarAnchor[],
    toggleHitRadius: number,
  ): number {
    if (childAnchors.length === 0)
      return Math.max(parentAnchor.bottom + toggleHitRadius, parentAnchor.toggleY)

    const branchEndY = childAnchors[childAnchors.length - 1].centerY
    const minimumY = parentAnchor.bottom + toggleHitRadius
    const maximumY = branchEndY - toggleHitRadius
    if (maximumY <= minimumY)
      return parentAnchor.bottom + (branchEndY - parentAnchor.bottom) / 2

    return Math.min(Math.max(parentAnchor.toggleY, minimumY), maximumY)
  }

  function getCommentReplyBranchPath(
    branch: CommentReplyTreeBranch,
    branchRadius: number,
    toggleHitRadius: number,
    cachedToggleY?: number,
  ): string | null {
    const coordinate = formatCommentReplyGuideCoordinate
    const { childAnchors, collapsed, collapseParentBody, parentAnchor, trunkExtendY } = branch
    const x = parentAnchor.centerX

    if (collapsed) {
      if (collapseParentBody)
        return `M ${coordinate(x)} ${coordinate(parentAnchor.centerY)}`

      // 保留父节点正文：引导线与 + 留在收起前的位置，不缩短到父评论脚部
      const toggleY = cachedToggleY !== undefined
        ? Math.max(parentAnchor.bottom + toggleHitRadius, cachedToggleY)
        : Math.max(parentAnchor.bottom + toggleHitRadius, parentAnchor.toggleY)
      const startY = parentAnchor.bottom
      const endY = Math.max(toggleY + toggleHitRadius, parentAnchor.bottom + toggleHitRadius * 2)
      return [
        `M ${coordinate(x)} ${coordinate(startY)}`,
        `V ${coordinate(endY)}`,
      ].join(' ')
    }

    if (childAnchors.length === 0 && typeof trunkExtendY !== 'number')
      return null

    const pathCommands: string[] = []
    const childRadii = childAnchors.map((childAnchor) => {
      const horizontalGap = childAnchor.left - x
      if (horizontalGap <= 0)
        return 0
      const verticalRoom = Math.max(0, childAnchor.centerY - parentAnchor.bottom)
      if (verticalRoom <= 0)
        return 0
      return Math.min(branchRadius, horizontalGap, verticalRoom)
    })

    // 主干止于最后一条分支圆弧起点，避免竖线在拐角处多出一截；
    // 若有平级 +，再延伸到其位置
    let trunkEndY = parentAnchor.bottom
    if (childAnchors.length > 0) {
      const lastIndex = childAnchors.length - 1
      const lastChild = childAnchors[lastIndex]
      const lastRadius = childRadii[lastIndex]
      trunkEndY = lastChild.centerY - lastRadius
    }
    if (typeof trunkExtendY === 'number' && Number.isFinite(trunkExtendY))
      trunkEndY = Math.max(trunkEndY, trunkExtendY)

    if (trunkEndY > parentAnchor.bottom + 0.5) {
      pathCommands.push(
        `M ${coordinate(x)} ${coordinate(parentAnchor.bottom)}`,
        `V ${coordinate(trunkEndY)}`,
      )
    }

    // 从主干向每个可见子评论画水平分支（正圆弧，不超出竖线）
    childAnchors.forEach((childAnchor, index) => {
      const horizontalGap = childAnchor.left - x
      if (horizontalGap <= 0)
        return

      const radius = childRadii[index]
      if (radius <= 0) {
        pathCommands.push(
          `M ${coordinate(x)} ${coordinate(childAnchor.centerY)}`,
          `H ${coordinate(childAnchor.left)}`,
        )
        return
      }

      // 1/4 圆：从竖线 (x, cy-r) 转到水平 (x+r, cy)
      // SVG y 向下时，从左侧点到下侧点的短弧为 sweep=0（逆时针）
      pathCommands.push(
        `M ${coordinate(x)} ${coordinate(childAnchor.centerY - radius)}`,
        `A ${coordinate(radius)} ${coordinate(radius)} 0 0 0 ${coordinate(x + radius)} ${coordinate(childAnchor.centerY)}`,
        `H ${coordinate(childAnchor.left)}`,
      )
    })

    return pathCommands.length > 0 ? pathCommands.join(' ') : null
  }

  function getCommentReplyBranchToggleY(
    branch: CommentReplyTreeBranch,
    toggleHitRadius: number,
    cachedToggleY?: number,
  ): number {
    const { childAnchors, collapsed, collapseParentBody, parentAnchor, trunkExtendY } = branch
    if (collapsed) {
      if (collapseParentBody)
        return parentAnchor.centerY

      // 「不收起主评论」：使用展开时缓存的位置，避免 + 缩到父评论下方
      if (cachedToggleY !== undefined)
        return Math.max(parentAnchor.bottom + toggleHitRadius, cachedToggleY)

      return Math.max(parentAnchor.bottom + toggleHitRadius, parentAnchor.toggleY)
    }

    // 平级收起后子锚点变少，父级 − 仍用展开时缓存，避免一起上缩
    if (trunkExtendY !== undefined && cachedToggleY !== undefined)
      return Math.max(parentAnchor.bottom + toggleHitRadius, cachedToggleY)

    return getCommentReplyBranchExpandedToggleY(parentAnchor, childAnchors, toggleHitRadius)
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

  function toggleCommentReplyTreeTail(
    component: HTMLElement,
    state: CommentReplyTreeState,
    tailKey: string,
  ) {
    if (state.collapsedTailKeys.has(tailKey))
      state.collapsedTailKeys.delete(tailKey)
    else
      state.collapsedTailKeys.add(tailKey)
    updateCommentReplyTree(component)
  }

  function createCommentReplyTreeTailElement(
    component: HTMLElement,
    state: CommentReplyTreeState,
    tail: CommentReplyTreeTailCollapse,
    toggleHitRadius: number,
    toggleNodeRadius: number,
  ): SVGGElement {
    const coordinate = formatCommentReplyGuideCoordinate
    const symbolHalfSize = toggleNodeRadius / 2
    const tailGroup = document.createElementNS(SVG_NAMESPACE, 'g')
    tailGroup.classList.add('bewly-comment-reply-tail')
    tailGroup.setAttribute('role', 'button')
    tailGroup.setAttribute('tabindex', '0')
    tailGroup.setAttribute('aria-expanded', String(!tail.collapsed))
    tailGroup.setAttribute('aria-label', getCommentReplyTailLabel(tail.collapsed))

    const nodeHitArea = document.createElementNS(SVG_NAMESPACE, 'circle')
    nodeHitArea.classList.add('bewly-comment-reply-tail__node-hit')
    nodeHitArea.setAttribute('cx', coordinate(tail.x))
    nodeHitArea.setAttribute('cy', coordinate(tail.y))
    nodeHitArea.setAttribute('r', coordinate(toggleHitRadius))
    tailGroup.appendChild(nodeHitArea)

    const focusRing = document.createElementNS(SVG_NAMESPACE, 'circle')
    focusRing.classList.add('bewly-comment-reply-tail__focus')
    focusRing.setAttribute('cx', coordinate(tail.x))
    focusRing.setAttribute('cy', coordinate(tail.y))
    focusRing.setAttribute('r', coordinate(toggleHitRadius - 2))
    tailGroup.appendChild(focusRing)

    const toggleNode = document.createElementNS(SVG_NAMESPACE, 'circle')
    toggleNode.classList.add('bewly-comment-reply-tail__node')
    toggleNode.setAttribute('cx', coordinate(tail.x))
    toggleNode.setAttribute('cy', coordinate(tail.y))
    toggleNode.setAttribute('r', coordinate(toggleNodeRadius))
    tailGroup.appendChild(toggleNode)

    const toggleSymbol = document.createElementNS(SVG_NAMESPACE, 'path')
    toggleSymbol.classList.add('bewly-comment-reply-tail__symbol')
    const horizontalSymbol = `M ${coordinate(tail.x - symbolHalfSize)} ${coordinate(tail.y)} H ${coordinate(tail.x + symbolHalfSize)}`
    const verticalSymbol = `M ${coordinate(tail.x)} ${coordinate(tail.y - symbolHalfSize)} V ${coordinate(tail.y + symbolHalfSize)}`
    toggleSymbol.setAttribute('d', tail.collapsed ? `${horizontalSymbol} ${verticalSymbol}` : horizontalSymbol)
    tailGroup.appendChild(toggleSymbol)

    const toggleTail = () => toggleCommentReplyTreeTail(component, state, tail.key)
    tailGroup.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      toggleTail()
    })
    tailGroup.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ')
        return
      event.preventDefault()
      event.stopPropagation()
      toggleTail()
    })

    return tailGroup
  }

  function buildCommentReplyTreeTailCollapses(
    state: CommentReplyTreeState,
    parentKey: string,
    parentAnchor: CommentReplyAvatarAnchor,
    siblings: CommentReplyTreeNode[],
    avatarAnchorByNode: Map<CommentReplyTreeNode, CommentReplyAvatarAnchor>,
    toggleHitRadius: number,
  ): CommentReplyTreeTailCollapse[] {
    if (siblings.length < 2)
      return []

    let firstHiddenIndex = siblings.length
    for (let index = 0; index < siblings.length - 1; index += 1) {
      const tailKey = getCommentReplyTailCollapseKey(parentKey, getCommentReplyTreeNodeKey(siblings[index]))
      if (state.collapsedTailKeys.has(tailKey)) {
        firstHiddenIndex = index + 1
        break
      }
    }

    const tails: CommentReplyTreeTailCollapse[] = []

    // 已收起后续：+ 使用展开时缓存的位置，避免随布局上缩后断线
    if (firstHiddenIndex < siblings.length) {
      const afterSibling = siblings[firstHiddenIndex - 1]
      const afterAnchor = avatarAnchorByNode.get(afterSibling)
      if (afterAnchor) {
        const key = getCommentReplyTailCollapseKey(parentKey, getCommentReplyTreeNodeKey(afterSibling))
        const cachedY = state.tailToggleYByKey.get(key)
        const fallbackY = afterAnchor.bottom + toggleHitRadius + 4
        // 缓存优先；至少略低于最后可见评论中心，保证仍落在主干上
        const y = cachedY !== undefined
          ? Math.max(afterAnchor.centerY + toggleHitRadius, cachedY)
          : fallbackY
        tails.push({
          collapsed: true,
          hiddenCount: siblings.length - firstHiddenIndex,
          key,
          x: parentAnchor.centerX,
          y,
        })
      }
      return tails
    }

    // 未收起：在相邻平级评论之间放置收起后续控件，并缓存位置
    for (let index = 0; index < siblings.length - 1; index += 1) {
      const current = siblings[index]
      const next = siblings[index + 1]
      const currentAnchor = avatarAnchorByNode.get(current)
      const nextAnchor = avatarAnchorByNode.get(next)
      if (!currentAnchor || !nextAnchor)
        continue

      const gap = nextAnchor.centerY - currentAnchor.centerY
      if (gap < toggleHitRadius * 2)
        continue

      const key = getCommentReplyTailCollapseKey(parentKey, getCommentReplyTreeNodeKey(current))
      const y = currentAnchor.centerY + gap / 2
      state.tailToggleYByKey.set(key, y)
      tails.push({
        collapsed: false,
        hiddenCount: siblings.length - index - 1,
        key,
        x: parentAnchor.centerX,
        y,
      })
    }

    return tails
  }

  function createCommentReplyTreeBranchElement(
    component: HTMLElement,
    state: CommentReplyTreeState,
    branch: CommentReplyTreeBranch,
    pathData: string,
    toggleHitRadius: number,
    toggleNodeRadius: number,
    toggleY: number,
  ): SVGGElement {
    const coordinate = formatCommentReplyGuideCoordinate
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

    // 仅「收起主评论」且父节点本体被折叠时显示昵称；「不收起主评论」父正文仍在，无需昵称
    if (branch.collapsed && branch.collapseParentBody) {
      const authorLabel = document.createElementNS(SVG_NAMESPACE, 'text')
      authorLabel.classList.add('bewly-comment-reply-branch__author')
      authorLabel.setAttribute('x', coordinate(branch.parentAnchor.centerX + toggleHitRadius + 4))
      authorLabel.setAttribute('y', coordinate(toggleY))
      authorLabel.setAttribute('dominant-baseline', 'middle')
      authorLabel.textContent = branch.parentAuthorName || '…'
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

  function isCommentReplyTreeNodeVisible(node: CommentReplyTreeNode): boolean {
    return !node.renderer.hasAttribute('data-bewly-comment-reply-hidden')
  }

  function renderCommentReplyTreeGuides(
    component: HTMLElement,
    state: CommentReplyTreeState,
    replyContainer: HTMLElement,
    orderedNodes: Array<{ depth: number, node: CommentReplyTreeNode }>,
    rootNodes: CommentReplyTreeNode[],
    collapseParentBody: boolean,
  ) {
    const threadRoot = getCommentReplyTreeThreadRoot(component)
    const guideContainer: HTMLElement | ShadowRoot = threadRoot ?? replyContainer
    const coordinateRect = threadRoot
      ? threadRoot.host.getBoundingClientRect()
      : replyContainer.getBoundingClientRect()
    // 布局未就绪（宽度为 0 或高度异常小）时不画线，避免未展开/图片未加载时的错位
    if (coordinateRect.width <= 0 || coordinateRect.height <= 0)
      return

    if (threadRoot) {
      const threadStylePatch = COMMENT_SHADOW_STYLE_PATCHES['bili-comment-thread-renderer']
      ensureCommentShadowStyle(threadRoot, threadStylePatch.id, threadStylePatch.css)
    }

    const nodes = orderedNodes.map(({ node }) => node)
    const avatarAnchorByNode = new Map<CommentReplyTreeNode, CommentReplyAvatarAnchor>()
    let missingVisibleAvatar = false
    nodes.forEach((node) => {
      if (!isCommentReplyTreeNodeVisible(node))
        return
      const anchor = getCommentReplyAvatarAnchor(node.renderer, coordinateRect)
      if (anchor) {
        avatarAnchorByNode.set(node, anchor)
        return
      }
      // 可见节点却拿不到锚点：多半是删除/屏蔽后的过渡节点或尚未完成布局。
      // 跳过该节点继续绘制其余分支，避免单个异常节点清空整棵树。
      missingVisibleAvatar = true
    })
    const retryLayout = () => {
      const retries = state.layoutRetryCount ?? 0
      if (retries >= 12)
        return
      state.layoutRetryCount = retries + 1
      scheduleCommentReplyTreeLayoutUpdate(component)
    }

    // 主评论锚点同样需要有效，否则根分支线会整体错位
    if (threadRoot) {
      const mainRenderer = getCommentReplyTreeRootRenderer(component)
      if (mainRenderer && !getCommentReplyAvatarAnchor(mainRenderer, coordinateRect)) {
        retryLayout()
        return
      }
    }

    if (!missingVisibleAvatar)
      state.layoutRetryCount = 0

    const componentStyle = getComputedStyle(component)
    const branchRadius = Number.parseFloat(
      componentStyle.getPropertyValue('--bew-comment-reply-branch-radius'),
    ) || 12
    const toggleHitRadius = Number.parseFloat(componentStyle.getPropertyValue('--bew-space-3')) || 12
    const toggleNodeRadius = Number.parseFloat(componentStyle.getPropertyValue('--bew-radius-half')) || 6
    const branches: CommentReplyTreeBranch[] = []
    const tails: CommentReplyTreeTailCollapse[] = []

    const visibleRootNodes = rootNodes.filter(isCommentReplyTreeNodeVisible)
    const threadRootRenderer = getCommentReplyTreeRootRenderer(component)
    const rootBranchCollapsed = state.collapsedNodeKeys.has(COMMENT_REPLY_TREE_ROOT_KEY)
    const threadRootAnchor = threadRootRenderer
      ? getCommentReplyAvatarAnchor(threadRootRenderer, coordinateRect)
      : null
    // 分支收起后即使子回复全隐藏，也保留控件以便展开
    if (threadRootAnchor && (rootNodes.length > 0 || rootBranchCollapsed)) {
      let rootTrunkExtendY: number | undefined
      // 父分支未收起时，才在同级回复间提供「收起后续」
      if (!rootBranchCollapsed) {
        const rootTails = buildCommentReplyTreeTailCollapses(
          state,
          COMMENT_REPLY_TREE_ROOT_KEY,
          threadRootAnchor,
          rootNodes,
          avatarAnchorByNode,
          toggleHitRadius,
        )
        tails.push(...rootTails)
        rootTrunkExtendY = rootTails.find(tail => tail.collapsed)?.y
      }

      branches.push({
        childAnchors: visibleRootNodes
          .map(node => avatarAnchorByNode.get(node))
          .filter((anchor): anchor is CommentReplyAvatarAnchor => Boolean(anchor))
          .filter(anchor => anchor.left > threadRootAnchor.centerX),
        collapsed: rootBranchCollapsed,
        collapseParentBody,
        key: COMMENT_REPLY_TREE_ROOT_KEY,
        parentAnchor: threadRootAnchor,
        parentAuthorName: getCommentRendererAuthorName(threadRootRenderer),
        trunkExtendY: rootTrunkExtendY,
      })
    }

    nodes.forEach((node) => {
      if (!isCommentReplyTreeNodeVisible(node))
        return

      let parentAnchor = avatarAnchorByNode.get(node)
      if (!parentAnchor) {
        // 折叠后可能首次未写入 map，再解析一次锚点
        const resolvedAnchor = getCommentReplyAvatarAnchor(node.renderer, coordinateRect)
        if (resolvedAnchor) {
          parentAnchor = resolvedAnchor
          avatarAnchorByNode.set(node, resolvedAnchor)
        }
      }
      if (!parentAnchor || node.children.length === 0)
        return

      const nodeBranchCollapsed = state.collapsedNodeKeys.has(getCommentReplyTreeNodeKey(node))
      const visibleChildren = node.children.filter(isCommentReplyTreeNodeVisible)

      let nodeTrunkExtendY: number | undefined
      if (!nodeBranchCollapsed && node.children.length > 1) {
        const nodeTails = buildCommentReplyTreeTailCollapses(
          state,
          getCommentReplyTreeNodeKey(node),
          parentAnchor,
          node.children,
          avatarAnchorByNode,
          toggleHitRadius,
        )
        tails.push(...nodeTails)
        nodeTrunkExtendY = nodeTails.find(tail => tail.collapsed)?.y
      }

      branches.push({
        childAnchors: visibleChildren
          .map(child => avatarAnchorByNode.get(child))
          .filter((anchor): anchor is CommentReplyAvatarAnchor => Boolean(anchor))
          .filter(anchor => anchor.left > parentAnchor.centerX),
        collapsed: nodeBranchCollapsed,
        collapseParentBody,
        key: getCommentReplyTreeNodeKey(node),
        parentAnchor,
        parentAuthorName: node.authorName ?? getCommentRendererAuthorName(node.renderer),
        trunkExtendY: nodeTrunkExtendY,
      })
    })

    const renderedBranches = branches
      .map((branch) => {
        // 展开且无平级收起时刷新父分支 + 缓存；
        // 平级收起后子节点变少，勿覆盖缓存，否则父级 − 也会上缩
        if (!branch.collapsed && branch.trunkExtendY === undefined) {
          const expandedToggleY = getCommentReplyBranchExpandedToggleY(
            branch.parentAnchor,
            branch.childAnchors,
            toggleHitRadius,
          )
          state.branchToggleYByKey.set(branch.key, expandedToggleY)
        }

        const cachedToggleY = state.branchToggleYByKey.get(branch.key)
        const pathData = getCommentReplyBranchPath(
          branch,
          branchRadius,
          toggleHitRadius,
          cachedToggleY,
        )
        if (!pathData)
          return null

        const toggleY = getCommentReplyBranchToggleY(branch, toggleHitRadius, cachedToggleY)
        return { branch, pathData, toggleY }
      })
      .filter((entry): entry is {
        branch: CommentReplyTreeBranch
        pathData: string
        toggleY: number
      } => Boolean(entry))
    if (renderedBranches.length === 0 && tails.length === 0) {
      if (missingVisibleAvatar) {
        // 新布局尚未具备足够锚点时保留上一帧，避免先清空线条再等待重试。
        retryLayout()
        return
      }
      // 布局有效但已经没有可绘制分支（例如最后一条回复被删除），清理旧线条。
      removeCommentReplyTreeGuides(component, replyContainer)
      return
    }

    const minimumX = Math.min(
      0,
      ...renderedBranches.map(({ branch }) => branch.parentAnchor.centerX - toggleHitRadius),
      ...tails.map(tail => tail.x - toggleHitRadius),
    )
    const minimumY = Math.min(
      0,
      ...renderedBranches.map(({ branch, toggleY }) => Math.min(
        branch.parentAnchor.bottom,
        toggleY - toggleHitRadius,
      )),
      ...tails.map(tail => tail.y - toggleHitRadius),
    )
    const maximumY = Math.max(
      coordinateRect.height,
      ...renderedBranches.flatMap(({ branch, toggleY }) => [
        branch.parentAnchor.centerY,
        branch.parentAnchor.bottom + toggleHitRadius * 2,
        toggleY + toggleHitRadius,
        ...branch.childAnchors.map(anchor => anchor.centerY),
      ]),
      ...tails.map(tail => tail.y + toggleHitRadius),
    )
    const layerWidth = Math.max(1, coordinateRect.width - minimumX)
    const layerHeight = Math.max(1, maximumY - minimumY)
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

    renderedBranches.forEach(({ branch, pathData, toggleY }) => {
      guideLayer.appendChild(createCommentReplyTreeBranchElement(
        component,
        state,
        branch,
        pathData,
        toggleHitRadius,
        toggleNodeRadius,
        toggleY,
      ))
    })
    tails.forEach((tail) => {
      guideLayer.appendChild(createCommentReplyTreeTailElement(
        component,
        state,
        tail,
        toggleHitRadius,
        toggleNodeRadius,
      ))
    })
    // 只有新图层已完整创建后才替换旧图层；中途布局失败时旧线条仍可保留。
    removeCommentReplyTreeGuides(component, replyContainer)
    guideContainer.appendChild(guideLayer)
    if (missingVisibleAvatar)
      retryLayout()
  }

  function isCommentReplyRenderer(element: Element): element is HTMLElement {
    return element.localName === 'bili-comment-reply-renderer'
      || element.localName === 'bili-comment-renderer'
  }

  /**
   * 线条模式下，有父级引导线的回复会隐藏正文前的「回复 @xxx :」
   * 实际 DOM：
   * <p id="contents">
   *   <span>回复 </span>
   *   <a data-type="mention">@用户</a>
   *   <span> : 正文...</span>
   * </p>
   */
  const REPLY_AT_PREFIX_WORD = /^(?:回复|回覆|Reply(?:\s+to)?)\s*$/i
  const REPLY_AT_PREFIX_SINGLE = /^(?:回复|回覆|Reply(?:\s+to)?)\s*[^\s:：]+\s*[:：]\s*/i
  const REPLY_AT_COLON_PREFIX = /^\s*[:：]\s*/

  function unwrapBewlyHiddenReplyAtPrefix(contents: HTMLElement) {
    // 还原被改写的正文 span（: 前缀拆分）
    contents.querySelectorAll<HTMLElement>('[data-bewly-reply-at-rest]').forEach((el) => {
      const original = el.dataset.bewlyReplyAtOriginal
      if (original !== undefined)
        el.textContent = original
      delete el.dataset.bewlyReplyAtRest
      delete el.dataset.bewlyReplyAtOriginal
    })

    contents.querySelectorAll('[data-bewly-hide-reply-at]').forEach((el) => {
      const parent = el.parentNode
      if (!parent)
        return
      while (el.firstChild)
        parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
    })
  }

  function wrapNodesAndHideReplyAtPrefix(nodes: Node[]) {
    if (nodes.length === 0)
      return

    const first = nodes[0]
    const parent = first.parentNode
    if (!parent)
      return

    const wrapper = document.createElement('span')
    wrapper.dataset.bewlyHideReplyAt = 'true'
    wrapper.style.display = 'none'
    parent.insertBefore(wrapper, first)
    nodes.forEach(node => wrapper.appendChild(node))
  }

  function findFirstReplyAtTextNode(root: Node): Text | null {
    for (const node of Array.from(root.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.textContent || '').trim())
          return node as Text
        continue
      }
      if (node.nodeType !== Node.ELEMENT_NODE)
        continue
      const textNode = findFirstReplyAtTextNode(node)
      if (textNode)
        return textNode
    }
    return null
  }

  function hideSingleTextReplyAtPrefix(textNode: Text): boolean {
    const match = textNode.data.match(REPLY_AT_PREFIX_SINGLE)
    if (!match)
      return false

    const parent = textNode.parentNode
    if (!parent)
      return false

    const prefix = match[0]
    const rest = textNode.data.slice(prefix.length)
    const wrapper = document.createElement('span')
    wrapper.dataset.bewlyHideReplyAt = 'true'
    wrapper.style.display = 'none'
    wrapper.textContent = prefix

    if (rest) {
      const restNode = document.createTextNode(rest)
      parent.replaceChild(restNode, textNode)
      parent.insertBefore(wrapper, restNode)
    }
    else {
      parent.replaceChild(wrapper, textNode)
    }
    return true
  }

  function isReplyAtMentionElement(node: Node): node is HTMLElement {
    if (!(node instanceof HTMLElement))
      return false
    if (node.getAttribute('data-type') === 'mention')
      return true
    if (node.localName === 'a' && (node.textContent || '').trim().startsWith('@'))
      return true
    return Boolean(node.querySelector?.('a[data-type="mention"], a[href*="space.bilibili.com"]'))
  }

  function hideLeadingReplyAtPrefixInContents(contents: HTMLElement) {
    if (contents.querySelector('[data-bewly-hide-reply-at], [data-bewly-reply-at-rest]')) {
      contents.querySelectorAll<HTMLElement>('[data-bewly-hide-reply-at]').forEach((el) => {
        el.style.display = 'none'
      })
      return
    }

    const nodes = Array.from(contents.childNodes).filter((node) => {
      if (node.nodeType === Node.TEXT_NODE)
        return Boolean((node.textContent || '').trim())
      return node.nodeType === Node.ELEMENT_NODE
    })
    if (nodes.length === 1) {
      const [onlyNode] = nodes
      if (onlyNode?.nodeType === Node.TEXT_NODE) {
        hideSingleTextReplyAtPrefix(onlyNode as Text)
      }
      else if (onlyNode instanceof HTMLElement) {
        const firstTextNode = findFirstReplyAtTextNode(onlyNode)
        if (firstTextNode)
          hideSingleTextReplyAtPrefix(firstTextNode)
      }
      return
    }
    if (nodes.length < 2)
      return

    const first = nodes[0]
    const second = nodes[1]
    const third = nodes[2] as Node | undefined

    // 主路径：<span>回复 </span><a data-type="mention">@xxx</a><span> : 正文</span>
    const firstText = (first.textContent || '').trimEnd()
    const isReplyWord = REPLY_AT_PREFIX_WORD.test(firstText)

    if (isReplyWord && isReplyAtMentionElement(second)) {
      const toHide: Node[] = [first, second]

      if (third && (third.nodeType === Node.ELEMENT_NODE || third.nodeType === Node.TEXT_NODE)) {
        const colonHost = third
        const colonText = colonHost.textContent || ''
        const colonMatch = colonText.match(REPLY_AT_COLON_PREFIX)
        if (colonMatch) {
          const prefix = colonMatch[0]
          const rest = colonText.slice(prefix.length)
          if (colonHost instanceof HTMLElement) {
            // 第三段常为 <span> : 正文</span>，只去掉冒号前缀
            colonHost.dataset.bewlyReplyAtRest = 'true'
            colonHost.dataset.bewlyReplyAtOriginal = colonText
            colonHost.textContent = rest
          }
          else if (colonHost.nodeType === Node.TEXT_NODE) {
            if (rest) {
              const hideColon = document.createTextNode(prefix)
              const restAfterColon = document.createTextNode(rest)
              const parent = colonHost.parentNode
              if (parent) {
                parent.replaceChild(restAfterColon, colonHost)
                parent.insertBefore(hideColon, restAfterColon)
                toHide.push(hideColon)
              }
            }
            else {
              toHide.push(colonHost)
            }
          }
        }
      }

      wrapNodesAndHideReplyAtPrefix(toHide)
      return
    }

    // 兼容单文本节点：回复 @name : 内容
    if (first.nodeType === Node.TEXT_NODE) {
      hideSingleTextReplyAtPrefix(first as Text)
    }
  }

  function findCommentRichTextContents(renderer: HTMLElement): HTMLElement[] {
    const root = renderer.shadowRoot
    if (!root)
      return []

    const richTexts = Array.from(root.querySelectorAll('bili-rich-text'))
    const contentsList: HTMLElement[] = []
    richTexts.forEach((richText) => {
      const contents = richText.shadowRoot?.querySelector<HTMLElement>('#contents')
      if (contents)
        contentsList.push(contents)
    })

    // 兼容未再套一层 shadow 的正文容器
    const directContents = root.querySelector<HTMLElement>('#content #contents, #contents')
    if (directContents && !contentsList.includes(directContents))
      contentsList.push(directContents)

    return contentsList
  }

  const commentReplyAtPrefixObservers = new WeakMap<HTMLElement, MutationObserver>()

  function disconnectCommentReplyAtPrefixObserver(renderer: HTMLElement) {
    const observer = commentReplyAtPrefixObservers.get(renderer)
    if (!observer)
      return
    observer.disconnect()
    commentReplyAtPrefixObservers.delete(renderer)
  }

  function ensureCommentReplyAtPrefixObserver(renderer: HTMLElement) {
    // 每次重建，确保新挂载的 bili-rich-text shadow 也被监听到
    disconnectCommentReplyAtPrefixObserver(renderer)

    const observer = new MutationObserver(() => {
      if (!renderer.isConnected || !renderer.hasAttribute('data-bewly-hide-reply-at')) {
        disconnectCommentReplyAtPrefixObserver(renderer)
        return
      }
      // 富文本重绘后重新隐藏前缀（自身改 DOM 时若已处理会直接 return）
      applyCommentReplyAtPrefixHidden(renderer, true)
    })

    const observeTargets = new Set<Node>()
    if (renderer.shadowRoot)
      observeTargets.add(renderer.shadowRoot)
    findCommentRichTextContents(renderer).forEach((contents) => {
      observeTargets.add(contents)
      const root = contents.getRootNode()
      if (root instanceof ShadowRoot)
        observeTargets.add(root)
    })
    renderer.shadowRoot?.querySelectorAll('bili-rich-text').forEach((richText) => {
      if (richText.shadowRoot)
        observeTargets.add(richText.shadowRoot)
    })

    observeTargets.forEach((target) => {
      observer.observe(target, { childList: true, subtree: true, characterData: true })
    })
    commentReplyAtPrefixObservers.set(renderer, observer)
  }

  function applyCommentReplyAtPrefixHidden(renderer: HTMLElement, hidden: boolean) {
    findCommentRichTextContents(renderer).forEach((contents) => {
      if (!hidden) {
        unwrapBewlyHiddenReplyAtPrefix(contents)
        return
      }
      hideLeadingReplyAtPrefixInContents(contents)
    })
  }

  function setCommentReplyAtPrefixHidden(renderer: HTMLElement, hidden: boolean) {
    renderer.toggleAttribute('data-bewly-hide-reply-at', hidden)
    applyCommentReplyAtPrefixHidden(renderer, hidden)

    if (hidden)
      ensureCommentReplyAtPrefixObserver(renderer)
    else
      disconnectCommentReplyAtPrefixObserver(renderer)
  }

  const COMMENT_REPLY_OFFPAGE_PARENT_ID = 'bewly-reply-offpage-parent'
  const COMMENT_REPLY_OFFPAGE_PARENT_STYLE_ID = 'bewly-reply-offpage-parent-style'
  const COMMENT_REPLY_OFFPAGE_PARENT_CSS = `
    #${COMMENT_REPLY_OFFPAGE_PARENT_ID} {
      display: block;
      box-sizing: border-box;
      margin: 0 0 var(--bew-space-2, 8px);
      padding: 0;
      border: none;
      background: transparent;
      font-size: var(--bew-font-size-caption, 12px);
      line-height: var(--bew-line-height-caption, 16px);
      color: var(--bew-text-3, var(--text3, #9499a0));
    }

    #${COMMENT_REPLY_OFFPAGE_PARENT_ID} .bewly-reply-offpage-parent__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--bew-space-1, 4px) var(--bew-space-2, 8px);
      margin: 0;
      font-weight: var(--bew-font-weight-regular, 400);
      color: var(--bew-text-3, var(--text3, #9499a0));
    }

    #${COMMENT_REPLY_OFFPAGE_PARENT_ID} .bewly-reply-offpage-parent__reply-word {
      flex: 0 0 auto;
    }

    #${COMMENT_REPLY_OFFPAGE_PARENT_ID} .bewly-reply-offpage-parent__at {
      flex: 0 1 auto;
      color: var(--bew-theme-color, #00a1d6);
      font-weight: var(--bew-font-weight-medium, 500);
      word-break: break-all;
    }

    #${COMMENT_REPLY_OFFPAGE_PARENT_ID} .bewly-reply-offpage-parent__badge {
      flex: 0 0 auto;
      padding: 0 var(--bew-space-1, 4px);
      border-radius: var(--bew-badge-radius, 9999px);
      border: 1px solid var(--bew-text-3, var(--text3, #9499a0));
      background: transparent;
      font-size: 11px;
      line-height: 16px;
      font-weight: var(--bew-font-weight-regular, 400);
      color: var(--bew-text-3, var(--text3, #9499a0));
    }

    /* 有正文缓存：仅文字下方浅色虚线，不拉满整行 */
    #${COMMENT_REPLY_OFFPAGE_PARENT_ID} .bewly-reply-offpage-parent__quote {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      margin: var(--bew-space-1, 4px) 0 0;
      padding: 0;
      border: none;
      background: transparent;
      overflow: hidden;
      font-weight: var(--bew-font-weight-regular, 400);
      color: var(--bew-text-3, var(--text3, #9499a0));
      word-break: break-word;
      text-decoration: underline;
      text-decoration-style: dashed;
      text-decoration-thickness: 1px;
      text-underline-offset: 3px;
      text-decoration-color: color-mix(in srgb, var(--bew-text-3, #9499a0) 45%, transparent);
    }

    #${COMMENT_REPLY_OFFPAGE_PARENT_ID}[data-mode="compact"] .bewly-reply-offpage-parent__quote {
      display: none;
    }
  `

  type CommentReplyOffpageParentMode = 'quote' | 'compact'

  /**
   * 直接父回复不在本页时的标注：
   * - 有正文缓存 → quote：带样式引用原正文
   * - 无正文但有父 rpid → compact：回复 + @昵称 + 不在本页
   * 父在本页时移除标注。
   */
  function updateCommentReplyOffpageParentLabel(
    renderer: HTMLElement,
    options: {
      authorName: string | null
      messageText: string | null
      parentRpid: string | null
      show: boolean
    },
  ) {
    const { authorName, messageText, parentRpid, show } = options
    const root = renderer.shadowRoot
    const fullQuote = messageText?.trim() || ''
    const mode: CommentReplyOffpageParentMode | null = !show
      ? null
      : fullQuote
        ? 'quote'
        : parentRpid
          ? 'compact'
          : null

    if (!root) {
      if (!mode) {
        delete renderer.dataset.bewlyParentOffpage
        delete renderer.dataset.bewlyParentAuthor
        delete renderer.dataset.bewlyParentRpid
      }
      return
    }

    let label = root.querySelector<HTMLElement>(`#${COMMENT_REPLY_OFFPAGE_PARENT_ID}`)

    if (!mode) {
      label?.remove()
      delete renderer.dataset.bewlyParentOffpage
      delete renderer.dataset.bewlyParentAuthor
      delete renderer.dataset.bewlyParentRpid
      return
    }

    renderer.dataset.bewlyParentOffpage = mode
    if (authorName)
      renderer.dataset.bewlyParentAuthor = authorName
    else
      delete renderer.dataset.bewlyParentAuthor
    if (parentRpid)
      renderer.dataset.bewlyParentRpid = parentRpid
    else
      delete renderer.dataset.bewlyParentRpid

    ensureCommentShadowStyle(root, COMMENT_REPLY_OFFPAGE_PARENT_STYLE_ID, COMMENT_REPLY_OFFPAGE_PARENT_CSS)

    if (!label) {
      label = document.createElement('div')
      label.id = COMMENT_REPLY_OFFPAGE_PARENT_ID
      label.innerHTML = [
        '<div class="bewly-reply-offpage-parent__head">',
        '<span class="bewly-reply-offpage-parent__reply-word"></span>',
        '<span class="bewly-reply-offpage-parent__at"></span>',
        '<span class="bewly-reply-offpage-parent__badge"></span>',
        '</div>',
        '<div class="bewly-reply-offpage-parent__quote"></div>',
      ].join('')
      const richText = root.querySelector('bili-rich-text')
      const body = root.querySelector('#body') ?? root.querySelector('#main')
      if (richText?.parentElement)
        richText.parentElement.insertBefore(label, richText)
      else if (body)
        body.insertAdjacentElement('afterbegin', label)
      else
        root.appendChild(label)
    }

    label.dataset.mode = mode

    const language = currentSettings?.language || 'cmn-CN'
    const replyWord = language === 'en'
      ? 'Reply to'
      : (language === 'cmn-TW' || language === 'jyut')
          ? '回覆'
          : '回复'
    const badgeText = language === 'en'
      ? 'off-page'
      : language === 'cmn-TW'
        ? '不在本頁'
        : language === 'jyut'
          ? '唔喺呢頁'
          : '不在本页'
    // compact 无昵称时仍展示 @ 占位，避免只剩「回复 / 不在本页」语义不清
    const atText = authorName ? `@${authorName}` : '@…'

    const replyWordEl = label.querySelector<HTMLElement>('.bewly-reply-offpage-parent__reply-word')
    const atEl = label.querySelector<HTMLElement>('.bewly-reply-offpage-parent__at')
    const badgeEl = label.querySelector<HTMLElement>('.bewly-reply-offpage-parent__badge')
    const quoteEl = label.querySelector<HTMLElement>('.bewly-reply-offpage-parent__quote')

    if (replyWordEl)
      replyWordEl.textContent = replyWord
    if (atEl)
      atEl.textContent = atText
    if (badgeEl)
      badgeEl.textContent = badgeText

    if (quoteEl) {
      if (mode === 'quote') {
        quoteEl.textContent = truncateReplyMessageSnippet(fullQuote)
        quoteEl.hidden = false
      }
      else {
        quoteEl.textContent = ''
        quoteEl.hidden = true
      }
    }

    const tooltipHead = authorName
      ? getCommentReplyOffpageParentLabel(authorName)
      : `${replyWord} ${atText} · ${badgeText}`
    label.setAttribute(
      'title',
      mode === 'quote' && fullQuote ? `${tooltipHead}\n${fullQuote}` : tooltipHead,
    )
  }

  function clearCommentReplyOffpageParentLabel(renderer: HTMLElement) {
    updateCommentReplyOffpageParentLabel(renderer, {
      authorName: null,
      messageText: null,
      parentRpid: null,
      show: false,
    })
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

  function buildCommentReplyTreeOrder(
    nodes: CommentReplyTreeNode[],
    metaByRpid: Map<string, CommentReplyTreeCachedMeta> = new Map(),
  ): Array<{
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
      // 当前页没有直接父节点时，沿缓存的 parent 链挂到最近可见祖先
      const resolved = resolveCommentReplyTreeParentNode(node, nodeByRpid, metaByRpid)
      node.directParentVisible = resolved.directParentVisible
      node.directParentAuthorName = resolved.directParentAuthorName
      node.directParentMessageText = resolved.directParentMessageText
      // 父评昵称未缓存时，从子评正文「回复 @xxx」回退
      if (!node.directParentAuthorName && node.parentRpid && !node.directParentVisible) {
        const replyItem = getCommentReplyData(node.renderer)
        node.directParentAuthorName = getReplyAtAuthorFromMessage(replyItem)
      }
      if (resolved.visualParent)
        resolved.visualParent.children.push(node)
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
    const treeMode = getCommentReplyTreeMode()
    const existingState = commentReplyTreeStates.get(component)
    if (treeMode === null && !existingState?.enabled) {
      component.removeAttribute('data-bewly-comment-reply-tree')
      return
    }

    const replyContainer = root.querySelector<HTMLElement>('#expander-contents')
    if (!replyContainer)
      return

    const replyRenderers = Array.from(replyContainer.children)
      .filter(isCommentReplyRenderer)
    const state = existingState ?? getCommentReplyTreeState(component)
    replyRenderers.forEach(renderer => getCommentReplyOriginalOrder(state, renderer))

    const enabled = treeMode !== null
    const showGuides = treeMode === 'lineCollapseMain' || treeMode === 'lineKeepMain'
    // true：收起时折叠所有父节点本体；false：收起时父节点保持显示，仅隐藏子回复
    const collapseParentBody = treeMode === 'lineCollapseMain'
    component.toggleAttribute('data-bewly-comment-reply-tree', enabled)

    if (!enabled) {
      disconnectCommentReplyTreeResizeObserver(state)
      component.style.removeProperty('--bew-comment-reply-indent-step')
      removeCommentReplyTreeGuides(component, replyContainer)
      state.collapsedNodeKeys.clear()
      state.collapsedTailKeys.clear()
      state.branchToggleYByKey.clear()
      state.tailToggleYByKey.clear()
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
        setCommentReplyAtPrefixHidden(replyRenderer, false)
        clearCommentReplyOffpageParentLabel(replyRenderer)
      })
      delete getCommentReplyTreeRootRenderer(component)?.dataset.bewlyCommentReplyCollapsed
      state.enabled = false
      return
    }

    // 仅缩进模式关闭全部折叠
    if (!showGuides) {
      state.collapsedNodeKeys.clear()
      state.collapsedTailKeys.clear()
      state.branchToggleYByKey.clear()
      state.tailToggleYByKey.clear()
    }

    observeCommentReplyTreeLayout(component, state, replyContainer)

    const nodes: CommentReplyTreeNode[] = replyRenderers.map((replyRenderer) => {
      const replyItem = getCommentReplyData(replyRenderer)
      // 同步 data + DOM 正文进缓存，翻页后仍可引用父评摘要
      const fromDomMessage = getCommentRendererMessageText(replyRenderer)
      const cachedMeta = cacheCommentReplyTreeMeta(state, replyItem, { messageText: fromDomMessage })
      const rpid = getReplyRpid(replyItem) ?? null
      // 当前页 data 偶发缺字段时回退到跨页缓存
      const parentRpid = getReplyParentRpid(replyItem) ?? cachedMeta?.parentRpid ?? null
      const rootRpid = getReplyRootRpid(replyItem) ?? cachedMeta?.rootRpid ?? null
      return {
        authorName: getReplyAuthorName(replyItem) ?? cachedMeta?.authorName ?? null,
        renderer: replyRenderer,
        rpid,
        parentRpid: isCommentReplyTreeRootParent(parentRpid, rootRpid, rpid) ? null : parentRpid,
        rootRpid,
        ctime: getCommentReplyCtime(replyItem) ?? cachedMeta?.ctime ?? null,
        originalOrder: getCommentReplyOriginalOrder(state, replyRenderer),
        children: [],
        directParentVisible: true,
        directParentAuthorName: null,
        directParentMessageText: null,
      }
    })

    const orderedNodes = buildCommentReplyTreeOrder(nodes, state.replyMetaByRpid)
    const rootNodes = orderedNodes
      .filter(({ depth }) => depth === 0)
      .map(({ node }) => node)
    const indentStep = getCommentReplyTreeIndentStep(replyContainer)
    const depthLimit = getCommentReplyTreeDepthLimit(replyContainer, indentStep)
    component.style.setProperty('--bew-comment-reply-indent-step', `${indentStep}px`)
    orderedNodes.forEach(({ depth, node }) => {
      const visualDepth = Math.min(depth, depthLimit)
      node.renderer.dataset.bewlyCommentReplyDepth = String(visualDepth)
      node.renderer.style.setProperty('--bew-comment-reply-indent', getCommentReplyIndent(visualDepth))
    })
    updateCommentReplyTreeVisibility(component, state, orderedNodes, rootNodes, collapseParentBody)
    reorderCommentReplyRenderers(
      replyContainer,
      replyRenderers,
      orderedNodes.map(({ node }) => node.renderer),
    )
    // 父节点展示：
    // - 直接父在本页：引导线/缩进表达层级；线条模式隐藏正文「回复 @xxx」
    // - 直接父不在本页且有正文缓存：引用卡展示原正文
    // - 直接父不在本页无正文但有 parent rpid：紧凑「回复 @… + 不在本页」
    orderedNodes.forEach(({ node }) => {
      const parentOffpage = Boolean(node.parentRpid && !node.directParentVisible)
      const hasCachedBody = Boolean(node.directParentMessageText?.trim())
      // 有正文缓存 或 仅有离页父 ID 都展示我们的标注
      const showOffpageLabel = Boolean(parentOffpage && (hasCachedBody || node.parentRpid))
      // 展示自有标注时隐藏原生前缀，避免「回复 @」重复
      const hideNativePrefix = showOffpageLabel
        ? true
        : (showGuides && !parentOffpage)
      setCommentReplyAtPrefixHidden(node.renderer, hideNativePrefix)
      updateCommentReplyOffpageParentLabel(node.renderer, {
        authorName: node.directParentAuthorName,
        messageText: node.directParentMessageText,
        parentRpid: node.parentRpid,
        show: showOffpageLabel,
      })
    })
    // 未进入树序的节点恢复显示
    replyRenderers.forEach((replyRenderer) => {
      if (!orderedNodes.some(({ node }) => node.renderer === replyRenderer)) {
        setCommentReplyAtPrefixHidden(replyRenderer, false)
        clearCommentReplyOffpageParentLabel(replyRenderer)
      }
    })
    if (showGuides) {
      renderCommentReplyTreeGuides(
        component,
        state,
        replyContainer,
        orderedNodes,
        rootNodes,
        collapseParentBody,
      )
    }
    else {
      removeCommentReplyTreeGuides(component, replyContainer)
    }
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

  /**
   * 带 #reply{rpid} 的深链会触发 B 站：滚动定位、展开楼中楼、高亮目标评论。
   * 这些步骤常在我们首次画线之后才完成，导致线条错位。在结算窗口内多次重算。
   */
  const COMMENT_REPLY_DEEP_LINK_RE = /#reply(\d+)/i
  const commentReplyDeepLinkSettleTimers: number[] = []
  let commentReplyDeepLinkScrollUntil = 0
  let commentReplyDeepLinkScrollScheduled = false

  function getCommentReplyDeepLinkId(): string | null {
    const match = location.hash.match(COMMENT_REPLY_DEEP_LINK_RE)
    return match?.[1] ?? null
  }

  function clearCommentReplyDeepLinkSettlement() {
    while (commentReplyDeepLinkSettleTimers.length > 0) {
      const timer = commentReplyDeepLinkSettleTimers.pop()
      if (timer !== undefined)
        window.clearTimeout(timer)
    }
    commentReplyDeepLinkScrollUntil = 0
  }

  function scheduleCommentReplyDeepLinkSettlement(reason: 'immediate' | 'hash' = 'hash') {
    if (!getCommentReplyDeepLinkId() || getCommentReplyTreeMode() === null)
      return

    // 已在结算窗口：只做轻量刷新，避免每条回复 update 重置长定时器
    if (commentReplyDeepLinkSettleTimers.length > 0 && reason !== 'immediate') {
      onCommentReplyDeepLinkScrollOrResize()
      return
    }

    clearCommentReplyDeepLinkSettlement()
    // 覆盖：首屏渲染、展开楼中楼、滚动动画、高亮样式、图片解码
    const delays = reason === 'immediate'
      ? [0, 50, 120, 280, 500, 900, 1500, 2500, 4000]
      : [0, 100, 300, 600, 1000, 1800, 3000, 5000]
    commentReplyDeepLinkScrollUntil = Date.now() + Math.max(...delays) + 500

    delays.forEach((delay) => {
      const timer = window.setTimeout(() => {
        // 深链结算时允许更多锚点重试
        commentRepliesRenderers.forEach((component) => {
          const state = commentReplyTreeStates.get(component)
          if (state)
            state.layoutRetryCount = 0
        })
        refreshCommentReplyTrees()
      }, delay)
      commentReplyDeepLinkSettleTimers.push(timer)
    })
  }

  function onCommentReplyDeepLinkScrollOrResize() {
    if (
      Date.now() > commentReplyDeepLinkScrollUntil
      || !getCommentReplyDeepLinkId()
      || getCommentReplyTreeMode() === null
    ) {
      return
    }
    if (commentReplyDeepLinkScrollScheduled)
      return
    commentReplyDeepLinkScrollScheduled = true
    requestAnimationFrame(() => {
      commentReplyDeepLinkScrollScheduled = false
      refreshCommentReplyTrees()
    })
  }

  window.addEventListener('hashchange', () => {
    if (getCommentReplyDeepLinkId())
      scheduleCommentReplyDeepLinkSettlement('hash')
    else
      clearCommentReplyDeepLinkSettlement()
  })
  window.addEventListener('scroll', onCommentReplyDeepLinkScrollOrResize, { passive: true, capture: true })
  window.addEventListener('resize', onCommentReplyDeepLinkScrollOrResize, { passive: true })
  // 部分浏览器滚动结束事件
  window.addEventListener('scrollend', onCommentReplyDeepLinkScrollOrResize, { passive: true, capture: true } as AddEventListenerOptions)

  if (getCommentReplyDeepLinkId())
    scheduleCommentReplyDeepLinkSettlement('immediate')

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

  if (window.customElements) {
    const patchCommentCustomElement = (name: string, classConstructor: unknown) => {
      if (typeof classConstructor !== 'function')
        return

      const shadowStylePatch = COMMENT_SHADOW_STYLE_PATCHES[name]
      if (shadowStylePatch) {
        try {
          patchCommentComponentUpdate(name, classConstructor, (component) => {
            const root = component.shadowRoot
            if (!root)
              return

            ensureCommentShadowStyle(root, shadowStylePatch.id, shadowStylePatch.css)
            if (name === 'bili-comment-thread-renderer') {
              // 删除/屏蔽回复可能让楼层组件整体重绘，之前挂在其 shadow root
              // 内的 SVG 线条会随渲染结果一并被移除；重绘完成后从当前回复容器恢复。
              const repliesRenderer = root.querySelector('bili-comment-replies-renderer') as HTMLElement | null
              if (repliesRenderer) {
                updateCommentReplyTree(repliesRenderer)
                if (getCommentReplyDeepLinkId())
                  scheduleCommentReplyDeepLinkSettlement('hash')
              }
            }
            else if (name === 'bili-comment-replies-renderer') {
              updateCommentReplyTree(component)
              // 深链目标楼中楼刚挂载/更新时再结算一次
              if (getCommentReplyDeepLinkId())
                scheduleCommentReplyDeepLinkSettlement('hash')
            }
          })
        }
        catch (error) {
          console.warn(`[BewlyCat] Failed to patch ${name}.`, error)
        }
        return
      }

      if (name === 'bili-comment-reply-renderer') {
        try {
          patchCommentComponentUpdate(name, classConstructor, (component) => {
            const rootNode = component.getRootNode?.()
            const repliesRenderer = rootNode instanceof ShadowRoot ? rootNode.host : null
            if (repliesRenderer?.localName === 'bili-comment-replies-renderer') {
              updateCommentReplyTree(repliesRenderer)
              if (getCommentReplyDeepLinkId())
                scheduleCommentReplyDeepLinkSettlement('hash')
            }
          })
        }
        catch (error) {
          console.warn(`[BewlyCat] Failed to patch ${name}.`, error)
        }
        return
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

            // 图片组件位于主评论的嵌套 shadow DOM 中，图片尺寸变化不一定能
            // 通过回复容器的 ResizeObserver 传递出来；样式调整后主动重算树线。
            const repliesRenderer = findCommentThreadRepliesRenderer(component)
            if (repliesRenderer)
              scheduleCommentReplyTreeLayoutUpdate(repliesRenderer)
          })
        }
        catch (error) {
          console.warn(`[BewlyCat] Failed to patch ${name}.`, error)
        }
        return
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

            // 楼中楼 user-info 先于/并行于 replies 树更新时也写入关系缓存，避免跨页丢 parent
            const repliesRenderer = findCommentRepliesRendererHost(component)
            if (repliesRenderer && component.data && getCommentReplyTreeMode() !== null)
              cacheCommentReplyTreeMeta(getCommentReplyTreeState(repliesRenderer), component.data)

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
      }
    }

    const { define: originalDefine } = window.customElements
    window.customElements.define = new Proxy(originalDefine, {
      apply: (target, thisArg, args) => {
        const [name, classConstructor] = args
        if (typeof name === 'string')
          patchCommentCustomElement(name, classConstructor)
        return Reflect.apply(target, thisArg, args)
      },
    })

    // document_start 仍可能晚于页面内联脚本；回补已经注册的评论组件。
    const commentElementNames = new Set([
      ...Object.keys(COMMENT_SHADOW_STYLE_PATCHES),
      'bili-comment-reply-renderer',
      'bili-comment-pictures-renderer',
      'bili-comment-user-info',
    ])
    for (const name of commentElementNames)
      patchCommentCustomElement(name, window.customElements.get(name))
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
        if (getCommentReplyTreeMode() === null)
          clearCommentReplyDeepLinkSettlement()
        // 设置就绪后 B 站可能才开始 #reply 定位/展开
        if (getCommentReplyDeepLinkId())
          scheduleCommentReplyDeepLinkSettlement(isFirstTime ? 'immediate' : 'hash')
        resolveSettingsReady?.()
        resolveSettingsReady = null
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
      const hostname = urlObj.hostname.toLowerCase()
      const isBilibiliHost = hostname === 'bilibili.com'
        || hostname === 'b23.tv'
        || hostname.endsWith('.bilibili.com')
        || hostname.endsWith('.b23.tv')
      if (!isBilibiliHost)
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
