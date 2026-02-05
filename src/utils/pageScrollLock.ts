let lockCount = 0
let htmlOverflow = ''
let bodyOverflow = ''
let paddingApplied = false
let scrollContainer: HTMLElement | null = null
let scrollContainerPaddingRight = ''

function getDocumentElements() {
  if (typeof document === 'undefined')
    return null

  const { documentElement, body } = document
  if (!documentElement || !body)
    return null

  return { documentElement, body }
}

function getScrollbarWidth(documentElement: HTMLElement) {
  const viewportWidth = window.innerWidth
  const documentWidth = documentElement.clientWidth
  return Math.max(0, viewportWidth - documentWidth)
}

function isScrollable(element: HTMLElement, overflowY: string) {
  if (overflowY === 'hidden')
    return false
  return element.scrollHeight > element.clientHeight
}

function getScrollContainer(documentElement: HTMLElement, body: HTMLElement) {
  const documentStyle = window.getComputedStyle(documentElement)
  const bodyStyle = window.getComputedStyle(body)
  const documentScrollable = isScrollable(documentElement, documentStyle.overflowY)
  const bodyScrollable = isScrollable(body, bodyStyle.overflowY)

  if (bodyScrollable && !documentScrollable)
    return body

  return documentElement
}

export function lockPageScroll() {
  const elements = getDocumentElements()
  if (!elements)
    return

  lockCount += 1
  if (lockCount > 1)
    return

  const { documentElement, body } = elements
  htmlOverflow = documentElement.style.overflow
  bodyOverflow = body.style.overflow

  const scrollbarWidth = getScrollbarWidth(documentElement)
  if (scrollbarWidth > 0) {
    const paddingValue = `${scrollbarWidth}px`
    scrollContainer = getScrollContainer(documentElement, body)
    scrollContainerPaddingRight = scrollContainer.style.paddingRight
    scrollContainer.style.paddingRight = paddingValue
    paddingApplied = true
  }

  documentElement.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
}

export function unlockPageScroll() {
  const elements = getDocumentElements()
  if (!elements)
    return

  if (lockCount === 0)
    return

  lockCount -= 1
  if (lockCount > 0)
    return

  const { documentElement, body } = elements
  documentElement.style.overflow = htmlOverflow
  body.style.overflow = bodyOverflow

  if (paddingApplied && scrollContainer) {
    scrollContainer.style.paddingRight = scrollContainerPaddingRight
    scrollContainer = null
    paddingApplied = false
  }
}
