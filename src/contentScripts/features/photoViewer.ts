import { runWhenIdle } from '~/utils/lazyLoad'

const EDGE_OFFSET = 24
const BUTTON_HORIZONTAL_OFFSET = 12
const GAP_BELOW_IMAGE = 24
const POSITION_STABLE_DELAY = 100 // Reduced delay for faster initial positioning

let pswpRoot: HTMLElement | null = null
let bodyObserver: MutationObserver | null = null
let slideObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null
let currentObservedSlide: HTMLElement | null = null
let hasResizeListener = false
let rafId = 0
let initScheduled = false
let buttonUpdateTimeout = 0
let lastImageRect: DOMRect | null = null

function adjustImagePosition(
  _imageEl: HTMLImageElement,
  imageRect: DOMRect,
  _slideEl: HTMLElement,
): DOMRect {
  // Let CSS handle centering - only return the current rect
  return imageRect
}

function cleanup() {
  if (rafId)
    cancelAnimationFrame(rafId)
  rafId = 0

  if (buttonUpdateTimeout)
    clearTimeout(buttonUpdateTimeout)
  buttonUpdateTimeout = 0

  slideObserver?.disconnect()
  slideObserver = null

  resizeObserver?.disconnect()
  resizeObserver = null

  currentObservedSlide = null
  lastImageRect = null

  if (hasResizeListener) {
    window.removeEventListener('resize', scheduleUpdate, true)
    hasResizeListener = false
  }

  if (pswpRoot) {
    pswpRoot.classList.remove('bewly-pswp-adapted')
    pswpRoot.style.removeProperty('--bew-pswp-close-left')
    pswpRoot.style.removeProperty('--bew-pswp-close-top')
    pswpRoot.style.removeProperty('--bew-pswp-button-hidden')
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

    // Check if there are multiple images by looking for bullets indicator
    const bulletsIndicator = pswpRoot.querySelector('.pswp__bullets-indicator')
    const hasMultipleImages = !!bulletsIndicator

    // Show/hide navigation arrows based on bullets indicator presence
    if (hasMultipleImages) {
      pswpRoot.removeAttribute('data-bewly-hide-nav')
    }
    else {
      pswpRoot.setAttribute('data-bewly-hide-nav', 'true')
    }

    if (!closeButton || !activeImage) {
      // Hide button when no image
      pswpRoot?.style.setProperty('--bew-pswp-button-hidden', '1')
      return
    }

    // Check if image is still loading
    if (!activeImage.complete || activeImage.naturalWidth === 0) {
      pswpRoot?.style.setProperty('--bew-pswp-button-hidden', '1')
      // Retry after a short delay
      setTimeout(scheduleUpdate, 100)
      return
    }

    let imageRect = activeImage.getBoundingClientRect()
    if (activeSlide)
      imageRect = adjustImagePosition(activeImage, imageRect, activeSlide)

    if (imageRect.width === 0 || imageRect.height === 0) {
      pswpRoot?.style.setProperty('--bew-pswp-button-hidden', '1')
      return
    }

    // Check if image position has stabilized
    const isPositionStable = lastImageRect
      && Math.abs(imageRect.left - lastImageRect.left) < 2
      && Math.abs(imageRect.top - lastImageRect.top) < 2
      && Math.abs(imageRect.width - lastImageRect.width) < 2
      && Math.abs(imageRect.height - lastImageRect.height) < 2

    lastImageRect = imageRect

    // Only use delayed update for the initial load, not for subsequent updates
    if (!isPositionStable && !buttonUpdateTimeout) {
      // Hide button during position changes
      pswpRoot?.style.setProperty('--bew-pswp-button-hidden', '1')

      // Set a delay before showing button (only once)
      buttonUpdateTimeout = window.setTimeout(() => {
        buttonUpdateTimeout = 0
        // Force a final update after delay
        const finalImage = pswpRoot?.querySelector<HTMLImageElement>('.pswp__item[aria-hidden="false"] img.pswp__img')
        const finalButton = pswpRoot?.querySelector<HTMLElement>('.pswp__button--close')
        if (finalImage && finalButton) {
          updateButtonPosition(finalImage.getBoundingClientRect(), finalButton)
        }
      }, POSITION_STABLE_DELAY)
      return
    }

    // Position is stable or already had a delayed update, update immediately
    if (isPositionStable) {
      updateButtonPosition(imageRect, closeButton)
    }
  })
}

function updateButtonPosition(imageRect: DOMRect, closeButton: HTMLElement) {
  if (!pswpRoot)
    return

  // Calculate the actual centered position of the image
  // Since CSS should center it, we calculate where it should be
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // Calculate the centered position
  const centeredLeft = (viewportWidth - imageRect.width) / 2
  const centeredTop = (viewportHeight - imageRect.height) / 2

  // Use the centered position for button calculation
  const centeredImageRect = {
    left: centeredLeft,
    top: centeredTop,
    right: centeredLeft + imageRect.width,
    bottom: centeredTop + imageRect.height,
    width: imageRect.width,
    height: imageRect.height,
  }

  const buttonRect = closeButton.getBoundingClientRect()
  const buttonWidth = buttonRect.width || closeButton.offsetWidth || 40
  const buttonHeight = buttonRect.height || closeButton.offsetHeight || 40

  const desiredLeft = centeredImageRect.right - buttonWidth + BUTTON_HORIZONTAL_OFFSET
  const minLeft = Math.max(centeredImageRect.left, EDGE_OFFSET)
  const maxLeft = viewportWidth - buttonWidth - EDGE_OFFSET
  const left = Math.min(Math.max(desiredLeft, minLeft), maxLeft)

  const desiredTop = centeredImageRect.bottom + GAP_BELOW_IMAGE
  const minTop = centeredImageRect.bottom + 8
  const maxTop = viewportHeight - buttonHeight - EDGE_OFFSET
  const top = Math.min(Math.max(desiredTop, minTop), maxTop)

  pswpRoot.style.setProperty('--bew-pswp-close-left', `${left}px`)
  pswpRoot.style.setProperty('--bew-pswp-close-top', `${top}px`)
  pswpRoot.style.removeProperty('--bew-pswp-button-hidden')
}

function observeActiveSlide() {
  if (!pswpRoot)
    return

  const activeSlide = pswpRoot.querySelector<HTMLElement>('.pswp__item[aria-hidden="false"]')
  if (!activeSlide)
    return

  if (currentObservedSlide === activeSlide)
    return

  // Reset state when switching slides
  lastImageRect = null
  if (buttonUpdateTimeout) {
    clearTimeout(buttonUpdateTimeout)
    buttonUpdateTimeout = 0
  }

  // Hide button immediately when switching
  pswpRoot?.style.setProperty('--bew-pswp-button-hidden', '1')

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
    if (currentImg) {
      resizeObserver.observe(currentImg)

      // Only listen for image load event if image is not complete
      if (!currentImg.complete) {
        const handleImageLoad = () => {
          currentImg.removeEventListener('load', handleImageLoad)
          currentImg.removeEventListener('error', handleImageLoad)
          // Reduced delay for faster positioning
          setTimeout(scheduleUpdate, 50)
        }
        currentImg.addEventListener('load', handleImageLoad)
        currentImg.addEventListener('error', handleImageLoad)
        return // Don't call scheduleUpdate immediately if waiting for load
      }
    }
  }

  // Only call scheduleUpdate once if image is already loaded
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
    // Initially hide the close button until position is calculated
    pswpRoot.style.setProperty('--bew-pswp-button-hidden', '1')
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
