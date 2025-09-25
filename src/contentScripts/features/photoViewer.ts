import { runWhenIdle } from '~/utils/lazyLoad'

const EDGE_OFFSET = 24
const BUTTON_HORIZONTAL_OFFSET = 12
const GAP_BELOW_IMAGE = 24
const CENTER_THRESHOLD = 0.5

let pswpRoot: HTMLElement | null = null
let bodyObserver: MutationObserver | null = null
let slideObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null
let currentObservedSlide: HTMLElement | null = null
let hasResizeListener = false
let rafId = 0
let initScheduled = false

function normalizeNumber(value: number): number {
  return Math.abs(value) < 1e-4 ? 0 : value
}

function formatWithUnit(value: number, template: string): string {
  const unit = template.trim().replace(/[-\d.]/g, '') || 'px'
  const normalized = normalizeNumber(value)
  const valueStr = Number.isInteger(normalized) ? normalized.toString() : normalized.toFixed(3).replace(/\.0+$/, '').replace(/\.$/, '')
  return `${valueStr}${unit}`
}

function adjustImagePosition(
  imageEl: HTMLImageElement,
  imageRect: DOMRect,
  slideEl: HTMLElement,
): DOMRect {
  if (pswpRoot?.classList.contains('pswp--zoomed-in') || pswpRoot?.classList.contains('pswp--dragging'))
    return imageRect

  const zoomWrap = slideEl.querySelector<HTMLElement>('.pswp__zoom-wrap')
  if (!zoomWrap)
    return imageRect

  const transform = zoomWrap.style.transform || window.getComputedStyle(zoomWrap).transform
  if (!transform || transform === 'none')
    return imageRect

  const translateIndex = transform.indexOf('translate3d(')
  if (translateIndex === -1)
    return imageRect

  const start = translateIndex + 'translate3d('.length
  const end = transform.indexOf(')', start)
  if (end === -1)
    return imageRect

  const translateContent = transform.slice(start, end)
  const components = translateContent.split(',')
  if (components.length < 3)
    return imageRect

  const [translateXRaw, translateYRaw, translateZRaw] = components
  const translateX = translateXRaw.trim()
  const translateY = translateYRaw.trim()
  const translateZ = translateZRaw.trim()
  const currentX = Number.parseFloat(translateX)
  const currentY = Number.parseFloat(translateY)
  if (Number.isNaN(currentX) || Number.isNaN(currentY))
    return imageRect

  const availableSpace = window.innerHeight - imageRect.height
  const centeredTop = availableSpace / 2
  const minTop = EDGE_OFFSET
  const maxTop = Math.max(minTop, window.innerHeight - imageRect.height - EDGE_OFFSET)
  const desiredTop = Math.min(Math.max(centeredTop, minTop), maxTop)

  const currentTop = imageRect.top
  const deltaY = desiredTop - currentTop

  let deltaX = 0
  const availableWidth = window.innerWidth - imageRect.width
  if (availableWidth > EDGE_OFFSET * 2) {
    const centeredLeft = availableWidth / 2
    const minLeft = EDGE_OFFSET
    const maxLeft = Math.max(minLeft, window.innerWidth - imageRect.width - EDGE_OFFSET)
    const desiredLeft = Math.min(Math.max(centeredLeft, minLeft), maxLeft)
    const currentLeft = imageRect.left
    deltaX = desiredLeft - currentLeft
  }

  if (Math.abs(deltaY) < CENTER_THRESHOLD && Math.abs(deltaX) < CENTER_THRESHOLD)
    return imageRect

  const newX = Math.abs(deltaX) < CENTER_THRESHOLD ? currentX : currentX + deltaX
  const newY = Math.abs(deltaY) < CENTER_THRESHOLD ? currentY : currentY + deltaY

  const originalTranslate = `translate3d(${translateContent})`
  const replacement = `translate3d(${formatWithUnit(newX, translateX)}, ${formatWithUnit(newY, translateY)}, ${translateZ})`
  zoomWrap.style.transform = transform.replace(originalTranslate, replacement)

  return imageEl.getBoundingClientRect()
}

function cleanup() {
  if (rafId)
    cancelAnimationFrame(rafId)
  rafId = 0

  slideObserver?.disconnect()
  slideObserver = null

  resizeObserver?.disconnect()
  resizeObserver = null

  currentObservedSlide = null

  if (hasResizeListener) {
    window.removeEventListener('resize', scheduleUpdate, true)
    hasResizeListener = false
  }

  if (pswpRoot) {
    pswpRoot.classList.remove('bewly-pswp-adapted')
    pswpRoot.style.removeProperty('--bew-pswp-close-left')
    pswpRoot.style.removeProperty('--bew-pswp-close-top')
    pswpRoot = null
  }
}

function ensureResizeObserver() {
  if (resizeObserver || typeof ResizeObserver === 'undefined')
    return

  resizeObserver = new ResizeObserver(() => {
    scheduleUpdate()
  })
}

function scheduleUpdate() {
  if (!pswpRoot || !pswpRoot.classList.contains('pswp--open'))
    return

  if (rafId)
    cancelAnimationFrame(rafId)

  rafId = requestAnimationFrame(() => {
    rafId = 0

    if (!pswpRoot || !pswpRoot.classList.contains('pswp--open'))
      return

    const closeButton = pswpRoot.querySelector<HTMLElement>('.pswp__button--close')
    const activeSlide = pswpRoot.querySelector<HTMLElement>('.pswp__item[aria-hidden="false"]')
    const activeImage = activeSlide?.querySelector<HTMLImageElement>('img.pswp__img')

    if (!closeButton || !activeImage) {
      pswpRoot?.style.removeProperty('--bew-pswp-close-left')
      pswpRoot?.style.removeProperty('--bew-pswp-close-top')
      return
    }

    let imageRect = activeImage.getBoundingClientRect()
    if (activeSlide)
      imageRect = adjustImagePosition(activeImage, imageRect, activeSlide)
    if (imageRect.width === 0 || imageRect.height === 0)
      return

    const buttonRect = closeButton.getBoundingClientRect()
    const buttonWidth = buttonRect.width || closeButton.offsetWidth || 40
    const buttonHeight = buttonRect.height || closeButton.offsetHeight || 40

    const desiredLeft = imageRect.right - buttonWidth + BUTTON_HORIZONTAL_OFFSET
    const minLeft = Math.max(imageRect.left, EDGE_OFFSET)
    const maxLeft = window.innerWidth - buttonWidth - EDGE_OFFSET
    const left = Math.min(Math.max(desiredLeft, minLeft), maxLeft)

    const desiredTop = imageRect.bottom + GAP_BELOW_IMAGE
    const minTop = imageRect.bottom + 8
    const maxTop = window.innerHeight - buttonHeight - EDGE_OFFSET
    const top = Math.min(Math.max(desiredTop, minTop), maxTop)

    pswpRoot.style.setProperty('--bew-pswp-close-left', `${left}px`)
    pswpRoot.style.setProperty('--bew-pswp-close-top', `${top}px`)
  })
}

function observeActiveSlide() {
  if (!pswpRoot)
    return

  const activeSlide = pswpRoot.querySelector<HTMLElement>('.pswp__item[aria-hidden="false"]')
  if (!activeSlide)
    return

  if (currentObservedSlide === activeSlide)
    return

  currentObservedSlide = activeSlide

  if (!slideObserver) {
    slideObserver = new MutationObserver(() => {
      ensureResizeObserver()
      if (resizeObserver && currentObservedSlide) {
        resizeObserver.disconnect()
        const currentImg = currentObservedSlide.querySelector<HTMLImageElement>('.pswp__img')
        if (currentImg)
          resizeObserver.observe(currentImg)
      }
      scheduleUpdate()
    })
  }

  slideObserver.disconnect()
  slideObserver.observe(activeSlide, { attributes: true, attributeFilter: ['style', 'class'] })

  ensureResizeObserver()
  if (resizeObserver) {
    resizeObserver.disconnect()
    const currentImg = activeSlide.querySelector<HTMLImageElement>('.pswp__img')
    if (currentImg)
      resizeObserver.observe(currentImg)
  }

  scheduleUpdate()
}

function handleMutations() {
  if (!document.documentElement.classList.contains('bewly-design')) {
    cleanup()
    return
  }

  const candidate = document.querySelector<HTMLElement>('.pswp')

  if (!candidate || !candidate.classList.contains('pswp--open')) {
    cleanup()
    return
  }

  if (pswpRoot !== candidate) {
    cleanup()
    pswpRoot = candidate
    pswpRoot.classList.add('bewly-pswp-adapted')
  }

  if (!hasResizeListener) {
    window.addEventListener('resize', scheduleUpdate, true)
    hasResizeListener = true
  }

  observeActiveSlide()
  scheduleUpdate()
}

export function setupPhotoViewerAdapter() {
  if (bodyObserver || initScheduled)
    return

  initScheduled = true
  runWhenIdle(() => {
    initScheduled = false
    if (bodyObserver)
      return
    bodyObserver = new MutationObserver(handleMutations)
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    handleMutations()
  })
}

window.addEventListener('beforeunload', () => {
  bodyObserver?.disconnect()
  bodyObserver = null
  initScheduled = false
  cleanup()
})
