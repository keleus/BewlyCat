import type {
  CommentAiFilterDisplayMode,
  CommentAiFilterInputItem,
  CommentAiFilterVerdict,
} from '~/utils/commentAiFilter'
import {
  COMMENT_AI_FILTER_PAGE_CACHE_CLEAR,
  COMMENT_AI_FILTER_PAGE_REQUEST,
  COMMENT_AI_FILTER_PAGE_RESPONSE,
  normalizeCommentTextForAiFilter,
} from '~/utils/commentAiFilter'

export interface NativeCommentAiFilterSettings {
  enabled: boolean
  autoScan: boolean
  displayMode: CommentAiFilterDisplayMode
  includeReplies: boolean
  batchSize: number
}

export interface NativeCommentMeta {
  rpid: string
  text: string
  author?: string
  isReply: boolean
  isUp?: boolean
  isTop?: boolean
  upLiked?: boolean
  likeCount?: number
  hasPictures?: boolean
}

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

const TOOLBAR_CLASS = 'bewly-ai-comment-toolbar'
const BANNER_CLASS = 'bewly-ai-comment-banner'
const STATUS_CLASS = 'bewly-ai-comment-status'
const ATTR_FILTERED = 'data-bewly-ai-filtered'
const ATTR_EXPANDED = 'data-bewly-ai-expanded'
const ATTR_HIDDEN = 'data-bewly-ai-hidden'

const DEBOUNCE_MS = 280
const SCROLL_THROTTLE_MS = 180
const VIEWPORT_MARGIN_PX = 160
const VIEWPORT_ROOT_MARGIN = `${VIEWPORT_MARGIN_PX}px 0px`

const SPARKLES_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/></svg>'
const SPARKLES_SM_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/></svg>'
const FILTER_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/></svg>'
const REFRESH_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/></svg>'

export const COMMENT_AI_FILTER_HEADER_CSS = `
  .${TOOLBAR_CLASS} {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--bew-space-1, 4px);
    margin-inline-start: var(--bew-space-3, 12px);
    vertical-align: middle;
    font-size: var(--bew-font-size-caption, 12px);
    line-height: var(--bew-line-height-caption, 16px);
  }

  .${TOOLBAR_CLASS}__btn {
    display: inline-flex;
    align-items: center;
    gap: var(--bew-space-1, 4px);
    min-height: 24px;
    padding: 0 var(--bew-space-2, 8px);
    border: 1px solid var(--bew-border-color, rgba(131, 131, 145, 0.24));
    border-radius: var(--bew-radius-full, 9999px);
    background: var(--bew-fill-1, rgba(131, 131, 145, 0.12));
    color: var(--bew-text-2, var(--text2, #61666d));
    font-size: var(--bew-font-size-caption, 12px);
    font-weight: var(--bew-font-weight-medium, 500);
    line-height: var(--bew-line-height-caption, 16px);
    cursor: pointer;
    white-space: nowrap;
    transition:
      background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
      border-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
      color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
      opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
  }

  .${TOOLBAR_CLASS}__btn:hover:not(:disabled) {
    background: var(--bew-fill-2, rgba(131, 131, 145, 0.22));
    color: var(--bew-text-1, var(--text1, #18191c));
  }

  .${TOOLBAR_CLASS}__btn:focus-visible {
    outline: var(--bew-space-0-5, 2px) solid var(--bew-theme-color, #00aeec);
    outline-offset: var(--bew-space-0-5, 2px);
  }

  .${TOOLBAR_CLASS}__btn:disabled {
    opacity: 0.65;
    cursor: default;
  }

  .${TOOLBAR_CLASS}__btn.is-active {
    color: var(--bew-theme-color, #00aeec);
    background: var(--bew-theme-color-10, rgba(0, 174, 236, 0.12));
    border-color: var(--bew-theme-color-30, rgba(0, 174, 236, 0.32));
  }

  .${TOOLBAR_CLASS}__btn.is-warning {
    color: var(--bew-text-2, var(--text2, #61666d));
    background: var(--bew-fill-1, rgba(131, 131, 145, 0.12));
    border-color: var(--bew-border-color, rgba(131, 131, 145, 0.24));
  }

  .${TOOLBAR_CLASS}__btn.is-error {
    color: var(--bew-error-color, #e5484d);
    background: var(--bew-error-color-10, rgba(229, 72, 77, 0.12));
    border-color: var(--bew-error-color-30, rgba(229, 72, 77, 0.32));
  }

  .${TOOLBAR_CLASS}__pill {
    display: inline-flex;
    align-items: center;
    gap: var(--bew-space-1, 4px);
    min-height: 24px;
    padding: 0 var(--bew-space-2, 8px);
    border-radius: var(--bew-radius-full, 9999px);
    background: var(--bew-fill-1, rgba(131, 131, 145, 0.12));
    color: var(--bew-text-3, var(--text3, #9499a0));
    font-size: var(--bew-font-size-caption, 12px);
    font-weight: var(--bew-font-weight-regular, 400);
    line-height: var(--bew-line-height-caption, 16px);
    white-space: nowrap;
  }

  .${TOOLBAR_CLASS}__spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: bewly-ai-spin 0.75s linear infinite;
  }

  @keyframes bewly-ai-spin {
    to {
      transform: rotate(360deg);
    }
  }
`

export const COMMENT_AI_FILTER_THREAD_CSS = `
  :host([${ATTR_HIDDEN}]) {
    display: none !important;
  }
`

export const COMMENT_AI_FILTER_RENDERER_CSS = `
  :host([${ATTR_HIDDEN}]) {
    display: none !important;
  }

  /* 低质量折叠态整体弱化，避免比正常评论更显眼；悬停时轻微恢复方便操作 */
  :host([${ATTR_FILTERED}="collapse"]:not([${ATTR_EXPANDED}])) :is(#header, bili-comment-user-info, #user-avatar, bili-avatar) {
    opacity: 0.45;
    transition: opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
  }

  :host([${ATTR_FILTERED}="collapse"]:not([${ATTR_EXPANDED}]):hover) :is(#header, bili-comment-user-info, #user-avatar, bili-avatar) {
    opacity: 0.72;
  }

  :host([${ATTR_FILTERED}="collapse"]:not([${ATTR_EXPANDED}])) :is(#content, bili-rich-text, #pictures, bili-comment-pictures-renderer, #vote, bili-comments-vote-card, #ornament, #footer, #note, #jump) {
    display: none !important;
  }

  /* 仅标记态与已展开态也保持克制：内容适度淡化，悬停恢复清晰 */
  :host([${ATTR_FILTERED}="mark"]) #body {
    opacity: 0.68;
    transition: opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
  }

  :host([${ATTR_FILTERED}="mark"]:hover) #body {
    opacity: 1;
  }

  .${BANNER_CLASS} {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: var(--bew-space-2, 8px);
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    margin: var(--bew-space-1, 4px) 0;
    padding: var(--bew-space-0-5, 2px) var(--bew-space-2, 8px);
    border-radius: var(--bew-radius-sm, 4px);
    background: var(--bew-fill-1, rgba(131, 131, 145, 0.08));
    color: var(--bew-text-3, var(--text3, #9499a0));
    font-size: var(--bew-font-size-caption, 12px);
    line-height: var(--bew-line-height-caption, 16px);
    opacity: 0.78;
    transition: opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
  }

  .${BANNER_CLASS}:hover {
    opacity: 1;
  }

  .${BANNER_CLASS}__icon {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--bew-text-3, var(--text3, #9499a0));
  }

  .${BANNER_CLASS}__summary {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--bew-text-3, var(--text3, #9499a0));
  }

  .${BANNER_CLASS}__tag {
    font-weight: var(--bew-font-weight-medium, 500);
  }

  .${BANNER_CLASS}__reason {
    margin-inline-start: var(--bew-space-1, 4px);
  }

  .${BANNER_CLASS}__actions {
    display: inline-flex;
    align-items: center;
    gap: var(--bew-space-1, 4px);
    margin-inline-start: auto;
    flex-shrink: 0;
  }

  .${BANNER_CLASS}__btn {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 var(--bew-space-1, 4px);
    border: none;
    border-radius: var(--bew-radius-sm, 4px);
    background: transparent;
    color: var(--bew-text-3, var(--text3, #9499a0));
    font-size: var(--bew-font-size-caption, 12px);
    font-weight: var(--bew-font-weight-regular, 400);
    line-height: var(--bew-line-height-caption, 16px);
    cursor: pointer;
    white-space: nowrap;
    transition:
      color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
      background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
  }

  .${BANNER_CLASS}__btn:hover {
    color: var(--bew-text-2, var(--text2, #61666d));
    background: var(--bew-fill-1, rgba(131, 131, 145, 0.14));
  }

  .${BANNER_CLASS}__btn:focus-visible {
    outline: var(--bew-space-0-5, 2px) solid var(--bew-theme-color, #00aeec);
    outline-offset: var(--bew-space-0-5, 2px);
  }

  .${BANNER_CLASS}__btn--muted {
    color: var(--bew-text-4, var(--text4, #aeb3b9));
  }

  .${STATUS_CLASS} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    margin-inline-start: var(--bew-space-1, 4px);
    padding: 0 3px;
    min-height: 18px;
    border: none;
    border-radius: var(--bew-radius-sm, 4px);
    background: transparent;
    color: var(--bew-text-3, var(--text3, #9499a0));
    font-size: 11px;
    line-height: 1;
    vertical-align: middle;
    flex-shrink: 0;
    transition:
      opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
      color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
  }

  .${STATUS_CLASS}--analyzing {
    color: var(--bew-theme-color, #00aeec);
    opacity: 0.72;
    animation: bewly-ai-pulse 1.2s ease-in-out infinite;
  }

  .${STATUS_CLASS}--passed {
    opacity: 0.28;
  }

  .${STATUS_CLASS}--passed:hover {
    opacity: 0.72;
  }

  .${STATUS_CLASS}--flagged {
    opacity: 0.55;
  }

  .${STATUS_CLASS}--error {
    color: var(--bew-error-color, #e5484d);
    opacity: 0.72;
    cursor: pointer;
  }

  .${STATUS_CLASS}--error:hover {
    opacity: 1;
    background: var(--bew-error-color-10, rgba(229, 72, 77, 0.1));
  }

  .${STATUS_CLASS}--error:focus-visible {
    outline: var(--bew-space-0-5, 2px) solid var(--bew-theme-color, #00aeec);
    outline-offset: 1px;
  }

  @keyframes bewly-ai-pulse {
    0%, 100% {
      opacity: 0.35;
      transform: scale(0.92);
    }
    50% {
      opacity: 0.92;
      transform: scale(1.06);
    }
  }
`

function findEnclosingThreadRenderer(renderer: HTMLElement): HTMLElement | null {
  const rootNode = renderer.getRootNode?.()
  if (
    rootNode instanceof ShadowRoot &&
    rootNode.host instanceof HTMLElement &&
    rootNode.host.localName === 'bili-comment-thread-renderer'
  ) {
    return rootNode.host
  }
  return null
}

export function createNativeCommentAiFilterController(options: {
  pageT: TranslateFn
  onLayoutChanged?: (renderer: HTMLElement) => void
}) {
  const { pageT, onLayoutChanged } = options

  let config: NativeCommentAiFilterSettings = {
    enabled: false,
    autoScan: true,
    displayMode: 'collapse',
    includeReplies: true,
    batchSize: 3,
  }

  const headers = new Set<HTMLElement>()
  const renderers = new Set<HTMLElement>()
  const observedTargetByRenderer = new WeakMap<HTMLElement, Element>()
  const rendererByObservedTarget = new WeakMap<Element, HTMLElement>()
  const visibleRenderers = new Set<HTMLElement>()
  const metaByRenderer = new WeakMap<HTMLElement, NativeCommentMeta>()
  const verdicts = new Map<string, CommentAiFilterVerdict>()
  const failedErrors = new Map<string, string>()
  const expandedIds = new Set<string>()
  const dismissedIds = new Set<string>()
  const inFlightIds = new Set<string>()
  const pendingQueue = new Map<string, CommentAiFilterInputItem>()
  const pendingRequests = new Map<
    string,
    {
      ids: string[]
      generation: number
    }
  >()

  let paused = false
  let lastError = ''
  let generation = 0
  let requestCounter = 0
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let scrollCheckTimer: ReturnType<typeof setTimeout> | undefined
  let viewportObserver: IntersectionObserver | null = null

  function getRendererMeasureTarget(renderer: HTMLElement): Element {
    return renderer.shadowRoot?.querySelector('#body') ?? renderer
  }

  function ensureObserved(renderer: HTMLElement) {
    if (!viewportObserver) return
    const nextTarget = getRendererMeasureTarget(renderer)
    const prevTarget = observedTargetByRenderer.get(renderer)
    if (prevTarget === nextTarget) return
    if (prevTarget) {
      viewportObserver.unobserve(prevTarget)
      rendererByObservedTarget.delete(prevTarget)
    }
    observedTargetByRenderer.set(renderer, nextTarget)
    rendererByObservedTarget.set(nextTarget, renderer)
    viewportObserver.observe(nextTarget)
  }

  function unobserveRenderer(renderer: HTMLElement) {
    const prevTarget = observedTargetByRenderer.get(renderer)
    if (prevTarget) {
      viewportObserver?.unobserve(prevTarget)
      rendererByObservedTarget.delete(prevTarget)
      observedTargetByRenderer.delete(renderer)
    }
    visibleRenderers.delete(renderer)
  }

  if (typeof IntersectionObserver !== 'undefined') {
    viewportObserver = new IntersectionObserver(
      (entries) => {
        let visibilityChanged = false
        for (const entry of entries) {
          const renderer =
            rendererByObservedTarget.get(entry.target) ?? (entry.target as HTMLElement)
          if (!renderer.isConnected) {
            unobserveRenderer(renderer)
            continue
          }

          if (entry.isIntersecting) {
            if (!visibleRenderers.has(renderer)) {
              visibleRenderers.add(renderer)
              visibilityChanged = true
            }
            const meta = metaByRenderer.get(renderer)
            if (meta && config.enabled && !paused && config.autoScan) queueCommentForScan(meta)
          } else if (visibleRenderers.delete(renderer)) {
            visibilityChanged = true
          }
        }
        if (visibilityChanged && config.enabled) refreshToolbars()
      },
      {
        rootMargin: VIEWPORT_ROOT_MARGIN,
        threshold: 0.01,
      },
    )
  }

  function isRendererInViewport(renderer: HTMLElement): boolean {
    if (visibleRenderers.has(renderer)) return true
    const target = getRendererMeasureTarget(renderer)
    const rect = target.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return false
    return (
      rect.bottom >= -VIEWPORT_MARGIN_PX &&
      rect.top <= window.innerHeight + VIEWPORT_MARGIN_PX &&
      rect.right >= 0 &&
      rect.left <= window.innerWidth
    )
  }

  // 兜底监听页面及任意嵌套滚动容器（如宽屏侧栏、固定高度楼中楼），避免滚动加载后漏检。
  function scanVisibleRenderersOnScroll() {
    scrollCheckTimer = undefined
    if (!config.enabled || paused) return
    pruneDisconnected()
    let queued = false
    for (const renderer of renderers) {
      ensureObserved(renderer)
      if (!isRendererInViewport(renderer)) continue
      visibleRenderers.add(renderer)
      const meta = metaByRenderer.get(renderer)
      if (meta && config.autoScan) {
        queueCommentForScan(meta)
        queued = true
      }
    }
    if (!queued) refreshToolbars()
  }

  function scheduleScrollViewportCheck() {
    if (!config.enabled || paused || scrollCheckTimer) return
    scrollCheckTimer = setTimeout(scanVisibleRenderersOnScroll, SCROLL_THROTTLE_MS)
  }

  window.addEventListener('scroll', scheduleScrollViewportCheck, { capture: true, passive: true })
  window.addEventListener('resize', scheduleScrollViewportCheck, { passive: true })

  function pruneDisconnected() {
    for (const header of headers) {
      if (!header.isConnected) headers.delete(header)
    }
    for (const renderer of renderers) {
      if (!renderer.isConnected) {
        renderers.delete(renderer)
        unobserveRenderer(renderer)
      }
    }
  }

  function isEligibleMeta(meta: NativeCommentMeta): boolean {
    if (meta.isReply && !config.includeReplies) return false
    return Boolean(normalizeCommentTextForAiFilter(meta.text))
  }

  function toFilterInputItem(meta: NativeCommentMeta): CommentAiFilterInputItem {
    return {
      id: meta.rpid,
      author: meta.author,
      text: meta.text,
      isReply: meta.isReply,
      isUp: meta.isUp === true,
      isTop: meta.isTop === true,
      upLiked: meta.upLiked === true,
      likeCount: meta.likeCount,
      hasPictures: meta.hasPictures === true,
    }
  }

  function getStats() {
    pruneDisconnected()
    let eligibleCount = 0
    let visibleUnscannedCount = 0
    let flaggedCount = 0
    const seen = new Set<string>()

    for (const renderer of renderers) {
      const meta = metaByRenderer.get(renderer)
      if (!meta || !isEligibleMeta(meta) || seen.has(meta.rpid)) continue
      seen.add(meta.rpid)
      eligibleCount += 1

      const verdict = verdicts.get(meta.rpid)
      if (!verdict) {
        if (!inFlightIds.has(meta.rpid) && isRendererInViewport(renderer))
          visibleUnscannedCount += 1
      } else if (verdict.lowQuality && !dismissedIds.has(meta.rpid)) {
        flaggedCount += 1
      }
    }

    return {
      eligibleCount,
      unscannedCount: visibleUnscannedCount,
      flaggedCount,
      scanning: pendingRequests.size > 0 || pendingQueue.size > 0,
    }
  }

  function removeStatusIndicator(renderer: HTMLElement) {
    renderer.shadowRoot?.querySelector<HTMLElement>(`.${STATUS_CLASS}`)?.remove()
  }

  type CommentAiIndicatorState = 'analyzing' | 'passed' | 'flagged' | 'error' | null

  function updateStatusIndicator(
    renderer: HTMLElement,
    meta: NativeCommentMeta,
    state: CommentAiIndicatorState,
    errorMessage?: string,
  ) {
    const root = renderer.shadowRoot
    if (!root) return

    const existing = root.querySelector<HTMLElement>(`.${STATUS_CLASS}`)
    if (!state) {
      existing?.remove()
      return
    }

    const needButton = state === 'error'
    let el = existing
    if (el && (el.tagName === 'BUTTON') !== needButton) {
      el.remove()
      el = null
    }

    if (!el) {
      el = document.createElement(needButton ? 'button' : 'span')
      if (el instanceof HTMLButtonElement) el.type = 'button'
      const userInfo = root.querySelector('bili-comment-user-info')
      const header = root.querySelector('#header')
      if (userInfo) userInfo.insertAdjacentElement('afterend', el)
      else if (header) header.appendChild(el)
      else return
    }

    const sig = `${meta.rpid}|${state}|${errorMessage ?? ''}`
    if (el.dataset.bewlyAiStatusSig === sig) return
    el.dataset.bewlyAiStatusSig = sig

    el.className = `${STATUS_CLASS} ${STATUS_CLASS}--${state}`
    if (state === 'analyzing') {
      el.innerHTML = SPARKLES_SM_SVG
      el.title = pageT('inject.ai_filter_item_analyzing')
      el.setAttribute('aria-label', el.title)
    } else if (state === 'passed') {
      el.innerHTML = SPARKLES_SM_SVG
      el.title = pageT('inject.ai_filter_item_passed')
      el.setAttribute('aria-label', el.title)
    } else if (state === 'flagged') {
      el.innerHTML = FILTER_SVG
      el.title = pageT('inject.ai_filter_item_flagged')
      el.setAttribute('aria-label', el.title)
    } else if (state === 'error') {
      el.innerHTML = REFRESH_SVG
      el.title = errorMessage
        ? `${pageT('inject.ai_filter_item_error')} (${errorMessage})`
        : pageT('inject.ai_filter_item_error')
      el.setAttribute('aria-label', el.title)
      el.onclick = (event) => {
        event.preventDefault()
        event.stopPropagation()
        failedErrors.delete(meta.rpid)
        sendClassifyRequest([toFilterInputItem(meta)], true)
      }
    }
  }

  function clearRendererDecorations(renderer: HTMLElement, keepStatus = false) {
    const hadState =
      renderer.hasAttribute(ATTR_FILTERED) ||
      renderer.hasAttribute(ATTR_EXPANDED) ||
      renderer.hasAttribute(ATTR_HIDDEN)

    renderer.removeAttribute(ATTR_FILTERED)
    renderer.removeAttribute(ATTR_EXPANDED)
    renderer.removeAttribute(ATTR_HIDDEN)

    const thread = findEnclosingThreadRenderer(renderer)
    if (thread?.hasAttribute(ATTR_HIDDEN)) thread.removeAttribute(ATTR_HIDDEN)

    const banner = renderer.shadowRoot?.querySelector<HTMLElement>(`.${BANNER_CLASS}`)
    if (banner) banner.remove()

    if (!keepStatus) removeStatusIndicator(renderer)

    if (hadState || banner) onLayoutChanged?.(renderer)
  }

  function ensureBanner(
    renderer: HTMLElement,
    verdict: CommentAiFilterVerdict,
    mode: CommentAiFilterDisplayMode,
  ) {
    const root = renderer.shadowRoot
    if (!root) return

    const main =
      root.querySelector<HTMLElement>('#main') ?? root.querySelector<HTMLElement>('#body')
    if (!main) return

    let banner = root.querySelector<HTMLElement>(`.${BANNER_CLASS}`)
    if (!banner) {
      banner = document.createElement('div')
      banner.className = BANNER_CLASS
      const contentEl = main.querySelector('#content') ?? main.querySelector('bili-rich-text')
      if (contentEl) contentEl.before(banner)
      else main.appendChild(banner)
    }

    const rpid = verdict.id
    const isExpanded = expandedIds.has(rpid)
    const showExpandBtn = mode === 'collapse'
    const tagLabel = verdict.category
      ? pageT('inject.ai_filter_badge_with_category', { category: verdict.category })
      : pageT('inject.ai_filter_badge')
    const reasonText = verdict.reason || pageT('inject.ai_filter_default_reason')

    const signature = `${rpid}|${mode}|${isExpanded ? '1' : '0'}|${tagLabel}|${reasonText}`
    if (banner.dataset.bewlyAiSig === signature) return
    banner.dataset.bewlyAiSig = signature

    banner.textContent = ''

    const iconSpan = document.createElement('span')
    iconSpan.className = `${BANNER_CLASS}__icon`
    iconSpan.innerHTML = FILTER_SVG
    banner.appendChild(iconSpan)

    const summarySpan = document.createElement('span')
    summarySpan.className = `${BANNER_CLASS}__summary`
    summarySpan.title = `${tagLabel} · ${reasonText}`

    const tagSpan = document.createElement('span')
    tagSpan.className = `${BANNER_CLASS}__tag`
    tagSpan.textContent = tagLabel
    summarySpan.appendChild(tagSpan)

    const reasonSpan = document.createElement('span')
    reasonSpan.className = `${BANNER_CLASS}__reason`
    reasonSpan.textContent = reasonText
    summarySpan.appendChild(reasonSpan)

    banner.appendChild(summarySpan)

    const actions = document.createElement('span')
    actions.className = `${BANNER_CLASS}__actions`

    if (showExpandBtn) {
      const toggleBtn = document.createElement('button')
      toggleBtn.type = 'button'
      toggleBtn.className = `${BANNER_CLASS}__btn`
      toggleBtn.textContent = isExpanded
        ? pageT('inject.ai_filter_collapse')
        : pageT('inject.ai_filter_expand')
      toggleBtn.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (expandedIds.has(rpid)) expandedIds.delete(rpid)
        else expandedIds.add(rpid)
        applyVerdictToRenderer(renderer)
      })
      actions.appendChild(toggleBtn)
    }

    const dismissBtn = document.createElement('button')
    dismissBtn.type = 'button'
    dismissBtn.className = `${BANNER_CLASS}__btn ${BANNER_CLASS}__btn--muted`
    dismissBtn.textContent = pageT('inject.ai_filter_dismiss')
    dismissBtn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      dismissedIds.add(rpid)
      applyVerdictToRenderer(renderer)
      refreshToolbars()
    })
    actions.appendChild(dismissBtn)

    banner.appendChild(actions)
  }

  function applyVerdictToRenderer(renderer: HTMLElement) {
    if (!renderer.isConnected) return

    if (!config.enabled || paused) {
      clearRendererDecorations(renderer)
      return
    }

    const meta = metaByRenderer.get(renderer)
    if (!meta || !isEligibleMeta(meta)) {
      clearRendererDecorations(renderer)
      return
    }

    if (dismissedIds.has(meta.rpid)) {
      clearRendererDecorations(renderer, true)
      updateStatusIndicator(renderer, meta, 'passed')
      return
    }

    if (inFlightIds.has(meta.rpid) || pendingQueue.has(meta.rpid)) {
      clearRendererDecorations(renderer, true)
      updateStatusIndicator(renderer, meta, 'analyzing')
      return
    }

    const verdict = verdicts.get(meta.rpid)
    if (!verdict) {
      const errMsg = failedErrors.get(meta.rpid)
      clearRendererDecorations(renderer, Boolean(errMsg))
      updateStatusIndicator(renderer, meta, errMsg ? 'error' : null, errMsg)
      return
    }

    if (!verdict.lowQuality) {
      clearRendererDecorations(renderer, true)
      updateStatusIndicator(renderer, meta, 'passed')
      return
    }

    updateStatusIndicator(renderer, meta, 'flagged')

    const mode = config.displayMode
    const thread = findEnclosingThreadRenderer(renderer)

    if (mode === 'hide') {
      renderer.removeAttribute(ATTR_FILTERED)
      renderer.removeAttribute(ATTR_EXPANDED)
      if (thread && !meta.isReply) {
        thread.setAttribute(ATTR_HIDDEN, 'true')
        renderer.removeAttribute(ATTR_HIDDEN)
      } else {
        renderer.setAttribute(ATTR_HIDDEN, 'true')
      }
      onLayoutChanged?.(renderer)
      return
    }

    const effectiveMode: CommentAiFilterDisplayMode = mode
    thread?.removeAttribute(ATTR_HIDDEN)
    renderer.removeAttribute(ATTR_HIDDEN)
    renderer.setAttribute(ATTR_FILTERED, effectiveMode)
    if (effectiveMode === 'collapse' && expandedIds.has(meta.rpid))
      renderer.setAttribute(ATTR_EXPANDED, 'true')
    else renderer.removeAttribute(ATTR_EXPANDED)

    ensureBanner(renderer, verdict, effectiveMode)
    onLayoutChanged?.(renderer)
  }

  function refreshAllRenderers() {
    pruneDisconnected()
    for (const renderer of renderers) applyVerdictToRenderer(renderer)
  }

  function sendClassifyRequest(items: CommentAiFilterInputItem[], bypassCache = false) {
    if (!items.length || !config.enabled || paused) return

    const currentGen = generation
    const requestId = `bewly-ai-${++requestCounter}-${Date.now()}`
    const ids = items.map((item) => item.id)
    for (const id of ids) {
      inFlightIds.add(id)
      failedErrors.delete(id)
    }

    pendingRequests.set(requestId, { ids, generation: currentGen })
    lastError = ''
    refreshAllRenderers()
    refreshToolbars()

    try {
      window.postMessage(
        {
          type: COMMENT_AI_FILTER_PAGE_REQUEST,
          requestId,
          comments: items,
          bypassCache,
          context: {
            title: document.title,
            source: 'native',
          },
        },
        window.location.origin,
      )
    } catch {
      pendingRequests.delete(requestId)
      for (const id of ids) inFlightIds.delete(id)
      lastError = pageT('inject.ai_filter_error')
      refreshToolbars()
    }
  }

  function flushPendingQueue() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = undefined
    }

    if (!config.enabled || paused || pendingQueue.size === 0) {
      pendingQueue.clear()
      refreshToolbars()
      return
    }

    const batch = Array.from(pendingQueue.values())
    pendingQueue.clear()
    sendClassifyRequest(batch, false)
  }

  function scheduleQueueFlush() {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flushPendingQueue, DEBOUNCE_MS)
  }

  function queueCommentForScan(meta: NativeCommentMeta) {
    if (!config.enabled || paused || !isEligibleMeta(meta)) return
    if (verdicts.has(meta.rpid) || inFlightIds.has(meta.rpid)) return

    const existingQueued = pendingQueue.get(meta.rpid)
    if (existingQueued) {
      // user-info / pictures 晚于 comment-renderer 完成渲染时，刷新待发送队列里的上下文元数据。
      pendingQueue.set(meta.rpid, {
        ...existingQueued,
        author: meta.author || existingQueued.author,
        isUp: Boolean(existingQueued.isUp || meta.isUp),
        isTop: Boolean(existingQueued.isTop || meta.isTop),
        upLiked: Boolean(existingQueued.upLiked || meta.upLiked),
        hasPictures: Boolean(existingQueued.hasPictures || meta.hasPictures),
      })
      return
    }

    pendingQueue.set(meta.rpid, toFilterInputItem(meta))
    refreshAllRenderers()
    scheduleQueueFlush()
    refreshToolbars()
  }

  function triggerScanAll(forceRescan: boolean) {
    if (!config.enabled) return
    paused = false
    lastError = ''

    if (forceRescan) {
      generation += 1
      pendingQueue.clear()
      inFlightIds.clear()
      pendingRequests.clear()
      verdicts.clear()
      failedErrors.clear()
      dismissedIds.clear()
      try {
        window.postMessage({ type: COMMENT_AI_FILTER_PAGE_CACHE_CLEAR }, window.location.origin)
      } catch {
        // ignore
      }
      refreshAllRenderers()
    }

    pruneDisconnected()
    const toScan: CommentAiFilterInputItem[] = []
    const seen = new Set<string>()
    for (const renderer of renderers) {
      if (!isRendererInViewport(renderer)) continue
      const meta = metaByRenderer.get(renderer)
      if (!meta || !isEligibleMeta(meta) || seen.has(meta.rpid)) continue
      if (!forceRescan && (verdicts.has(meta.rpid) || inFlightIds.has(meta.rpid))) continue
      seen.add(meta.rpid)
      toScan.push(toFilterInputItem(meta))
    }

    if (toScan.length > 0) sendClassifyRequest(toScan, forceRescan)
    else refreshToolbars()
  }

  function renderToolbarIntoHeader(header: HTMLElement) {
    const root = header.shadowRoot
    if (!root) return

    const existing = root.querySelector<HTMLElement>(`.${TOOLBAR_CLASS}`)
    if (!config.enabled) {
      existing?.remove()
      return
    }

    let container = existing
    if (!container) {
      container = document.createElement('div')
      container.className = TOOLBAR_CLASS
      const navbar =
        root.querySelector('#navbar') ??
        root.querySelector('#sort-actions')?.parentElement ??
        root.querySelector('#top') ??
        root.firstElementChild
      if (navbar) navbar.appendChild(container)
      else root.appendChild(container)
    }

    const stats = getStats()
    const sig = [
      paused ? '1' : '0',
      config.autoScan ? '1' : '0',
      stats.scanning ? '1' : '0',
      stats.unscannedCount,
      lastError,
      pageT('inject.ai_filter_label'),
    ].join('|')

    if (container.dataset.bewlyAiSig === sig) return
    container.dataset.bewlyAiSig = sig

    container.textContent = ''

    // 顶部仅保留单个紧凑 AI 过滤开关按钮（不额外展示重扫与计数徽章）
    const toggleBtn = document.createElement('button')
    toggleBtn.type = 'button'
    const isError = !paused && !stats.scanning && Boolean(lastError)
    toggleBtn.className = `${TOOLBAR_CLASS}__btn${isError ? ' is-error' : !paused ? ' is-active' : ''}`
    toggleBtn.setAttribute('aria-pressed', String(!paused))
    if (lastError) toggleBtn.title = lastError

    if (!paused && stats.scanning) {
      const spinner = document.createElement('span')
      spinner.className = `${TOOLBAR_CLASS}__spinner`
      spinner.setAttribute('aria-hidden', 'true')
      toggleBtn.appendChild(spinner)
    } else {
      toggleBtn.innerHTML = SPARKLES_SVG
    }

    const toggleLabel = document.createElement('span')
    toggleLabel.textContent = paused
      ? pageT('inject.ai_filter_paused')
      : isError
        ? pageT('inject.ai_filter_retry')
        : pageT('inject.ai_filter_label')
    toggleBtn.appendChild(toggleLabel)

    toggleBtn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (!paused && isError) {
        triggerScanAll(false)
        return
      }
      if (!paused && !config.autoScan && stats.unscannedCount > 0) {
        triggerScanAll(false)
        return
      }
      paused = !paused
      if (!paused && config.autoScan) triggerScanAll(false)
      refreshAllRenderers()
      refreshToolbars()
    })
    container.appendChild(toggleBtn)
  }

  function refreshToolbars() {
    pruneDisconnected()
    for (const header of headers) renderToolbarIntoHeader(header)
  }

  window.addEventListener('message', (event) => {
    if (
      event.source !== window ||
      !event.data ||
      typeof event.data !== 'object' ||
      Array.isArray(event.data)
    )
      return

    const data = event.data as {
      type?: unknown
      requestId?: unknown
      partial?: unknown
      ok?: unknown
      results?: unknown
      error?: unknown
    }
    if (data.type !== COMMENT_AI_FILTER_PAGE_RESPONSE || typeof data.requestId !== 'string') return

    const pending = pendingRequests.get(data.requestId)
    if (!pending) return

    const isPartial = data.partial === true
    if (!isPartial) {
      pendingRequests.delete(data.requestId)
      for (const id of pending.ids) inFlightIds.delete(id)
    }

    if (pending.generation !== generation) {
      if (!isPartial) refreshToolbars()
      return
    }

    if (Array.isArray(data.results)) {
      for (const item of data.results as CommentAiFilterVerdict[]) {
        if (item && typeof item.id === 'string') {
          verdicts.set(item.id, item)
          failedErrors.delete(item.id)
          inFlightIds.delete(item.id)
        }
      }
    }

    if (!isPartial) {
      if (data.ok === false && typeof data.error === 'string' && data.error) {
        lastError = data.error
        for (const id of pending.ids) {
          if (!verdicts.has(id)) failedErrors.set(id, data.error)
        }
      } else if (data.ok === true) {
        lastError = ''
      }
    }

    refreshAllRenderers()
    refreshToolbars()
  })

  return {
    updateSettings(next: NativeCommentAiFilterSettings) {
      const wasEnabled = config.enabled
      const prevIncludeReplies = config.includeReplies
      const prevAutoScan = config.autoScan
      const prevDisplayMode = config.displayMode
      config = { ...next }

      if (!config.enabled) {
        generation += 1
        pendingQueue.clear()
        inFlightIds.clear()
        pendingRequests.clear()
        lastError = ''
        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = undefined
        }
        refreshAllRenderers()
        refreshToolbars()
        return
      }

      if (
        !wasEnabled ||
        prevDisplayMode !== config.displayMode ||
        prevIncludeReplies !== config.includeReplies
      ) {
        refreshAllRenderers()
      }

      if (
        config.autoScan &&
        (!wasEnabled || !prevAutoScan || (config.includeReplies && !prevIncludeReplies))
      ) {
        triggerScanAll(false)
      } else {
        refreshToolbars()
      }
    },

    observeHeader(header: HTMLElement) {
      headers.add(header)
      renderToolbarIntoHeader(header)
    },

    observeRenderer(renderer: HTMLElement, meta: NativeCommentMeta | null) {
      renderers.add(renderer)
      ensureObserved(renderer)
      if (!meta || !meta.rpid) {
        clearRendererDecorations(renderer)
        return
      }

      const prevMeta = metaByRenderer.get(renderer)
      metaByRenderer.set(renderer, meta)

      if (prevMeta && prevMeta.rpid !== meta.rpid) clearRendererDecorations(renderer)

      applyVerdictToRenderer(renderer)

      // 仅对当前处于可视范围内的评论自动入队，滚动进入视口时再由 IntersectionObserver / 滚动兜底触发。
      if (config.enabled && !paused && config.autoScan && isRendererInViewport(renderer))
        queueCommentForScan(meta)
      else if (config.enabled) refreshToolbars()
    },

    onNavigation() {
      generation += 1
      pendingQueue.clear()
      inFlightIds.clear()
      pendingRequests.clear()
      failedErrors.clear()
      visibleRenderers.clear()
      lastError = ''
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = undefined
      }
      if (scrollCheckTimer) {
        clearTimeout(scrollCheckTimer)
        scrollCheckTimer = undefined
      }
      refreshToolbars()
    },
  }
}
