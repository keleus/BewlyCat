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
  const header = getDocumentTopBar(doc) || cachedOriginalTopBar
  if (!header)
    return false

  // 1. 隐藏多余段落（如 banner 等），只保留顶栏条
  const innerUselessContents = header.querySelectorAll<HTMLElement>(':scope > *:not(.bili-header__bar)')
  innerUselessContents.forEach(item => (item.style.display = 'none'))

  // 2. 确保顶栏是 body 的直接子元素且位于最前
  // 即使 header 已存在，如果它在某个被隐藏的父容器里，这里也会将其移动到 body 下
  if (header.parentElement !== doc.body || header !== doc.body.firstElementChild) {
    doc.body.prepend(header)
  }

  // 更新缓存引用
  cachedOriginalTopBar = header
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
