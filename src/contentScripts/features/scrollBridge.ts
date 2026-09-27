/**
 * Mirror the custom homepage viewport onto the document so scroll commands
 * targeting document.scrollingElement can reach content inside its shadow root.
 */
export function installScrollBridge(viewport: HTMLElement): () => void {
  const previousScrollbarWidth = document.documentElement.style.scrollbarWidth
  document.documentElement.style.scrollbarWidth = 'none'

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
  document.body.appendChild(spacer)

  let mirroredDocumentTop: number | null = null
  let scrollDriver: 'document' | 'viewport' | null = null
  let releaseDriverTimer: ReturnType<typeof setTimeout> | undefined

  function keepScrollDriver(driver: 'document' | 'viewport') {
    scrollDriver = driver
    clearTimeout(releaseDriverTimer)
    releaseDriverTimer = setTimeout(() => {
      if (scrollDriver === 'document')
        viewport.scrollTo({ top: window.scrollY, behavior: 'instant' })
      else
        window.scrollTo({ top: viewport.scrollTop, behavior: 'instant' })
      scrollDriver = null
      mirroredDocumentTop = null
    }, 150)
  }

  function updateDocumentHeight() {
    spacer.style.height = `${viewport.scrollHeight}px`
  }

  function handleDocumentScroll() {
    const top = window.scrollY
    if (Math.abs(viewport.scrollTop - top) < 1)
      return

    if (mirroredDocumentTop !== null && Math.abs(mirroredDocumentTop - top) < 1) {
      mirroredDocumentTop = null
      return
    }

    mirroredDocumentTop = null
    keepScrollDriver('document')
    viewport.scrollTo({ top, behavior: 'instant' })
  }

  function handleViewportScroll() {
    const top = viewport.scrollTop
    if (Math.abs(window.scrollY - top) < 1)
      return
    if (scrollDriver === 'document')
      return

    keepScrollDriver('viewport')
    mirroredDocumentTop = top
    window.scrollTo({ top, behavior: 'instant' })
  }

  const resizeObserver = new ResizeObserver(updateDocumentHeight)
  resizeObserver.observe(viewport)
  const content = viewport.querySelector('main')
  if (content)
    resizeObserver.observe(content)

  updateDocumentHeight()
  window.addEventListener('scroll', handleDocumentScroll, { passive: true })
  viewport.addEventListener('scroll', handleViewportScroll, { passive: true })

  return () => {
    resizeObserver.disconnect()
    window.removeEventListener('scroll', handleDocumentScroll)
    viewport.removeEventListener('scroll', handleViewportScroll)
    clearTimeout(releaseDriverTimer)
    spacer.remove()
    document.documentElement.style.scrollbarWidth = previousScrollbarWidth
    if (window.scrollY)
      window.scrollTo({ top: 0, behavior: 'instant' })
  }
}
