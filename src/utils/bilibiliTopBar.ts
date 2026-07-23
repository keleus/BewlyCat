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
const originalTopBarSearchCleanups = new WeakMap<Document, () => void>()

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

/**
 * Add click event listeners to login buttons in the original Bilibili top bar
 * to redirect users to the login page.
 */
export function setupLoginButtonClickHandlers(doc: Document) {
  const LOGIN_URL = 'https://passport.bilibili.com/login'

  // Function to handle login button binding
  function bindLoginButton(button: HTMLElement) {
    if (button.hasAttribute('data-bewly-login-handler'))
      return

    button.setAttribute('data-bewly-login-handler', 'true')
    button.style.cursor = 'pointer'
    button.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      window.location.href = LOGIN_URL
    })
  }

  // Bind existing login buttons
  const existingButtons = doc.querySelectorAll<HTMLElement>('.login-btn')
  existingButtons.forEach(bindLoginButton)

  // Use MutationObserver to handle dynamically added popup elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        // Check if the added node is an element
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement

          // Check if the added node itself is a login button
          if (element.classList.contains('login-btn')) {
            bindLoginButton(element)
          }

          // Check if the added node contains login buttons
          const loginButtons = element.querySelectorAll<HTMLElement>('.login-btn')
          loginButtons.forEach(bindLoginButton)
        }
      })
    })
  })

  // Observe the entire document for popup elements
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
  })

  // Return cleanup function
  return () => {
    observer.disconnect()
  }
}

/**
 * 在启用插件搜索结果页时，接管原版 B 站顶栏的搜索提交。
 * 捕获阶段拦截可以避免 B 站自身的点击处理器先跳到 search.bilibili.com。
 */
export function setupOriginalBilibiliTopBarSearchHandlers(
  doc: Document,
  shouldUsePluginSearchResultsPage: () => boolean,
) {
  originalTopBarSearchCleanups.get(doc)?.()

  const SEARCH_FORM_SELECTOR = [
    '#nav-searchform',
    '.nav-search-form',
    '.nav-search-content',
  ].join(', ')
  const SEARCH_INPUT_SELECTOR = [
    '.nav-search-input',
    'input[name="keyword"]',
    'input[type="search"]',
  ].join(', ')
  const SEARCH_SUBMIT_SELECTOR = [
    '.nav-search-btn',
    '.nav-search-submit',
    'button[type="submit"]',
  ].join(', ')

  function getOriginalTopBarSearchContext(target: EventTarget | null) {
    if (!(target instanceof Element))
      return null

    const header = target.closest('.bili-header, #biliMainHeader, #internationalHeader')
    if (!header)
      return null

    const form = target.closest(SEARCH_FORM_SELECTOR) || header.querySelector(SEARCH_FORM_SELECTOR)
    const input = (form || header).querySelector<HTMLInputElement>(SEARCH_INPUT_SELECTOR)
    return { form, input }
  }

  function navigateToPluginSearch(event: Event, input: HTMLInputElement | null | undefined) {
    if (!shouldUsePluginSearchResultsPage())
      return false

    const keyword = input?.value.trim()
    if (!keyword)
      return false

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    const params = new URLSearchParams()
    params.set('page', 'SearchResults')
    params.set('keyword', keyword)
    window.location.assign(`https://www.bilibili.com/?${params.toString()}`)
    return true
  }

  function handleSubmit(event: SubmitEvent) {
    const context = getOriginalTopBarSearchContext(event.target)
    if (context)
      navigateToPluginSearch(event, context.input)
  }

  function handleClick(event: MouseEvent) {
    if (!(event.target instanceof Element) || !event.target.closest(SEARCH_SUBMIT_SELECTOR))
      return

    const context = getOriginalTopBarSearchContext(event.target)
    if (context)
      navigateToPluginSearch(event, context.input)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing)
      return

    const context = getOriginalTopBarSearchContext(event.target)
    if (context?.input === event.target)
      navigateToPluginSearch(event, context.input)
  }

  doc.addEventListener('submit', handleSubmit, true)
  doc.addEventListener('click', handleClick, true)
  doc.addEventListener('keydown', handleKeydown, true)

  const cleanup = () => {
    doc.removeEventListener('submit', handleSubmit, true)
    doc.removeEventListener('click', handleClick, true)
    doc.removeEventListener('keydown', handleKeydown, true)
    originalTopBarSearchCleanups.delete(doc)
  }
  originalTopBarSearchCleanups.set(doc, cleanup)
  return cleanup
}
