const SCROLL_BRIDGE_CLASS = 'bewly-scroll-bridge-active'
const SCROLL_BRIDGE_STYLE_ATTR = 'data-bewly-scroll-bridge'

const SCROLL_BRIDGE_CSS = `
html.${SCROLL_BRIDGE_CLASS},
html.${SCROLL_BRIDGE_CLASS} > body {
  scrollbar-width: none !important;
  scrollbar-gutter: auto !important;
  -ms-overflow-style: none !important;
}
html.${SCROLL_BRIDGE_CLASS}::-webkit-scrollbar,
html.${SCROLL_BRIDGE_CLASS} > body::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
`

/**
 * Mirror the custom homepage viewport onto the document so scroll commands
 * targeting document.scrollingElement can reach content inside its shadow root.
 */
export function installScrollBridge(viewport: HTMLElement): () => void {
  const root = document.documentElement
  const body = document.body
  const previousScrollbarWidth = root.style.getPropertyValue('scrollbar-width')
  const previousScrollbarWidthPriority = root.style.getPropertyPriority('scrollbar-width')

  const styleEl = document.createElement('style')
  styleEl.setAttribute(SCROLL_BRIDGE_STYLE_ATTR, '')
  styleEl.textContent = SCROLL_BRIDGE_CSS
  ;(document.head || root).appendChild(styleEl)
  root.classList.add(SCROLL_BRIDGE_CLASS)
  root.style.setProperty('scrollbar-width', 'none', 'important')

  function restoreDocumentScrollbarStyle() {
    styleEl.remove()
    root.classList.remove(SCROLL_BRIDGE_CLASS)
    if (previousScrollbarWidth) {
      root.style.setProperty(
        'scrollbar-width',
        previousScrollbarWidth,
        previousScrollbarWidthPriority,
      )
    } else {
      root.style.removeProperty('scrollbar-width')
    }
  }

  function getDocumentScrollbarGutter(): number {
    return Math.max(0, window.innerWidth - root.clientWidth)
  }

  function hasDocumentVerticalOverflow(): boolean {
    return root.scrollHeight > root.clientHeight + 1
  }

  function isDocumentScrollbarStyleOverridden(): boolean {
    const rootValue = window.getComputedStyle(root).scrollbarWidth
    if (typeof rootValue === 'string' && rootValue !== '' && rootValue !== 'none') return true
    const bodyValue = window.getComputedStyle(body).scrollbarWidth
    return typeof bodyValue === 'string' && bodyValue !== '' && bodyValue !== 'none'
  }

  if (isDocumentScrollbarStyleOverridden()) {
    return restoreDocumentScrollbarStyle
  }

  const baselineGutter = hasDocumentVerticalOverflow() ? 0 : getDocumentScrollbarGutter()

  const spacer = document.createElement('div')
  spacer.setAttribute('aria-hidden', 'true')
  Object.assign(spacer.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '1px',
    pointerEvents: 'none',
    visibility: 'hidden',
  })
  body.appendChild(spacer)

  let mirroredDocumentTop: number | null = null
  let scrollDriver: 'document' | 'viewport' | null = null
  let releaseDriverTimer: ReturnType<typeof setTimeout> | undefined
  let scrollbarCheckFrame = 0
  let bridgeSuppressed = false

  function keepScrollDriver(driver: 'document' | 'viewport') {
    scrollDriver = driver
    clearTimeout(releaseDriverTimer)
    releaseDriverTimer = setTimeout(() => {
      if (bridgeSuppressed) return
      if (scrollDriver === 'document')
        viewport.scrollTo({ top: window.scrollY, behavior: 'instant' })
      else window.scrollTo({ top: viewport.scrollTop, behavior: 'instant' })
      scrollDriver = null
      mirroredDocumentTop = null
    }, 150)
  }

  function handleDocumentScroll() {
    if (bridgeSuppressed) return
    const top = window.scrollY
    if (Math.abs(viewport.scrollTop - top) < 1) return

    if (mirroredDocumentTop !== null && Math.abs(mirroredDocumentTop - top) < 1) {
      mirroredDocumentTop = null
      return
    }

    mirroredDocumentTop = null
    keepScrollDriver('document')
    viewport.scrollTo({ top, behavior: 'instant' })
  }

  function handleViewportScroll() {
    if (bridgeSuppressed) return
    const top = viewport.scrollTop
    if (Math.abs(window.scrollY - top) < 1) return
    if (scrollDriver === 'document') return

    keepScrollDriver('viewport')
    mirroredDocumentTop = top
    window.scrollTo({ top, behavior: 'instant' })
  }

  function suppressBridge() {
    if (bridgeSuppressed) return
    bridgeSuppressed = true
    if (scrollbarCheckFrame) {
      cancelAnimationFrame(scrollbarCheckFrame)
      scrollbarCheckFrame = 0
    }
    clearTimeout(releaseDriverTimer)
    scrollDriver = null
    mirroredDocumentTop = null
    resizeObserver.disconnect()
    documentResizeObserver.disconnect()
    window.removeEventListener('scroll', handleDocumentScroll)
    window.removeEventListener('resize', scheduleDocumentScrollbarCheck)
    viewport.removeEventListener('scroll', handleViewportScroll)
    spacer.style.display = 'none'
    spacer.style.height = '0px'
    if (window.scrollY) window.scrollTo({ top: 0, behavior: 'instant' })
  }

  function checkDocumentScrollbar() {
    scrollbarCheckFrame = 0
    if (bridgeSuppressed) return

    // 部分浏览器（如 Edge 关闭自定义滚动条等策略）会忽略隐藏文档滚动条的样式。
    // 若文档滚动条仍无法隐藏，撤回占位高度，避免页面右侧同时出现两条竖向滚动条。
    if (
      isDocumentScrollbarStyleOverridden() ||
      (hasDocumentVerticalOverflow() && getDocumentScrollbarGutter() > baselineGutter + 1)
    ) {
      suppressBridge()
    }
  }

  function scheduleDocumentScrollbarCheck() {
    if (bridgeSuppressed || scrollbarCheckFrame) return
    scrollbarCheckFrame = requestAnimationFrame(checkDocumentScrollbar)
  }

  function updateDocumentHeight() {
    if (bridgeSuppressed) return
    const scrollable = viewport.scrollHeight > viewport.clientHeight + 1
    spacer.style.height = scrollable ? `${viewport.scrollHeight}px` : '0px'
    scheduleDocumentScrollbarCheck()
  }

  const resizeObserver = new ResizeObserver(updateDocumentHeight)
  resizeObserver.observe(viewport)
  const content = viewport.querySelector('main')
  if (content) resizeObserver.observe(content)

  const documentResizeObserver = new ResizeObserver(scheduleDocumentScrollbarCheck)
  documentResizeObserver.observe(root)

  updateDocumentHeight()
  window.addEventListener('scroll', handleDocumentScroll, { passive: true })
  window.addEventListener('resize', scheduleDocumentScrollbarCheck, { passive: true })
  viewport.addEventListener('scroll', handleViewportScroll, { passive: true })

  return () => {
    if (scrollbarCheckFrame) {
      cancelAnimationFrame(scrollbarCheckFrame)
      scrollbarCheckFrame = 0
    }
    resizeObserver.disconnect()
    documentResizeObserver.disconnect()
    window.removeEventListener('scroll', handleDocumentScroll)
    window.removeEventListener('resize', scheduleDocumentScrollbarCheck)
    viewport.removeEventListener('scroll', handleViewportScroll)
    clearTimeout(releaseDriverTimer)
    spacer.remove()
    restoreDocumentScrollbarStyle()
    if (window.scrollY) window.scrollTo({ top: 0, behavior: 'instant' })
  }
}
