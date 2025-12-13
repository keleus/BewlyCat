const BILIBILI_TOP_BAR_SELECTORS = [
  '.bili-header',
  '.bili-header .bili-header__bar',
  '#internationalHeader',
  '.link-navbar',
  '#home_nav',
  '#biliMainHeader',
  '#bili-header-container',
  // Bilibili Evolved
  '.custom-navbar',
]

let cachedOriginalTopBar: HTMLElement | null = null

function getDocumentTopBar(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('.bili-header')
}

export function captureOriginalBilibiliTopBar(doc: Document) {
  if (cachedOriginalTopBar && cachedOriginalTopBar.ownerDocument === doc)
    return cachedOriginalTopBar

  const header = getDocumentTopBar(doc)
  if (!header)
    return null

  cachedOriginalTopBar = header
  cachedOriginalTopBar.querySelector('.bili-header__bar')?.classList.add('slide-down')
  return cachedOriginalTopBar
}

export function detachOriginalBilibiliTopBar(doc: Document) {
  const header = getDocumentTopBar(doc)
  if (!header)
    return

  cachedOriginalTopBar = header
  header.remove()
}

export function ensureOriginalBilibiliTopBarAppended(doc: Document): boolean {
  if (getDocumentTopBar(doc))
    return true

  if (!cachedOriginalTopBar)
    return false

  // Keep behavior consistent with the previous implementation: hide extra header contents.
  const innerUselessContents = cachedOriginalTopBar.querySelectorAll<HTMLElement>(':scope > *:not(.bili-header__bar)')
  innerUselessContents.forEach(item => (item.style.display = 'none'))

  doc.body.prepend(cachedOriginalTopBar)
  return true
}

/**
 * When toggling between Bewly and Bili top bars, Bilibili scripts may leave inline styles behind.
 * Clear a small set of inline properties so the original top bar can be shown immediately.
 */
export function resetBilibiliTopBarInlineStyles(doc: Document) {
  for (const selector of BILIBILI_TOP_BAR_SELECTORS) {
    doc.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      el.style.removeProperty('visibility')
      el.style.removeProperty('display')
    })
  }
}
