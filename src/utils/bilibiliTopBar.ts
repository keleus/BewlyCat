import { SVG_ICONS } from '~/utils/svgIcons'

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
let cachedOriginalTopBarParent: HTMLElement | null = null
const initializedHoverHeaders = new WeakSet<HTMLElement>()
const initializedScrollStateHeaders = new WeakSet<HTMLElement>()
const initializedTopBarDocuments = new WeakSet<Document>()
const loginButtonSetupCleanups = new WeakMap<Document, () => void>()
const channelPanelColumns = [
  [
    ['番剧', '//www.bilibili.com/anime/', '#channel-anime'],
    ['电影', '//www.bilibili.com/movie/', '#channel-movie'],
    ['国创', '//www.bilibili.com/guochuang/', '#channel-guochuang'],
    ['电视剧', '//www.bilibili.com/tv/', '#channel-teleplay'],
    ['综艺', '//www.bilibili.com/variety/', '#channel-zongyi'],
    ['纪录片', '//www.bilibili.com/documentary/', '#channel-documentary'],
    ['动画', '//www.bilibili.com/v/douga/', '#channel-douga'],
    ['游戏', '//www.bilibili.com/v/game/', '#channel-game'],
    ['鬼畜', '//www.bilibili.com/v/kichiku/', '#channel-kichiku'],
    ['音乐', '//www.bilibili.com/v/music', '#channel-music'],
  ],
  [
    ['舞蹈', '//www.bilibili.com/v/dance/', '#channel-dance'],
    ['影视', '//www.bilibili.com/v/cinephile', '#channel-cinephile'],
    ['娱乐', '//www.bilibili.com/v/ent/', '#channel-ent'],
    ['知识', '//www.bilibili.com/v/knowledge/', '#channel-knowledge'],
    ['科技', '//www.bilibili.com/v/tech/', '#channel-tech'],
    ['资讯', '//www.bilibili.com/v/information/', '#channel-information'],
    ['美食', '//www.bilibili.com/v/food', '#channel-food'],
    ['生活', '//www.bilibili.com/v/life', '#channel-life-experience'],
    ['汽车', '//www.bilibili.com/v/car', '#channel-car'],
    ['时尚', '//www.bilibili.com/v/fashion', '#channel-fashion'],
  ],
  [
    ['体育运动', '//www.bilibili.com/v/sports', '#channel-sports'],
    ['动物', '//www.bilibili.com/v/animal', '#channel-animal'],
    ['vlog', '//www.bilibili.com/v/life/daily/?tag=530003', '#channel-vlog'],
    ['绘画', '//www.bilibili.com/v/douga/other', '#channel-painting'],
    ['人工智能', '//www.bilibili.com/v/tech/ai', '#channel-ai'],
    ['家装房产', '//www.bilibili.com/v/life/home', '#channel-home'],
    ['户外潮流', '//www.bilibili.com/v/life/travel', '#channel-outdoors'],
    ['健身', '//www.bilibili.com/v/sports/aerobics', '#channel-gym'],
    ['手工', '//www.bilibili.com/v/life/handmake', '#channel-handmake'],
    ['旅游出行', '//www.bilibili.com/v/life/travel', '#channel-travel'],
  ],
  [
    ['三农', '//www.bilibili.com/v/knowledge/agriculture', '#channel-rural'],
    ['亲子', '//www.bilibili.com/v/life/parenting', '#channel-parenting'],
    ['健康', '//www.bilibili.com/v/knowledge/health', '#channel-health'],
    ['情感', '//www.bilibili.com/v/life/emotion', '#channel-emotion'],
    ['生活兴趣', '//www.bilibili.com/v/life', '#channel-life'],
    ['生活经验', '//www.bilibili.com/v/life/experience', '#channel-life-experience'],
    ['公益', '//love.bilibili.com', '#channel-love'],
    ['超高清', '//www.bilibili.com/v/tech/digital', '#channel-digital'],
    ['视频播客', '//www.bilibili.com/v/life', '#channel-yinpin'],
  ],
  [
    ['专栏', '//www.bilibili.com/read/home', '#channel-read'],
    ['直播', '//live.bilibili.com', '#channel-live'],
    ['活动', '//www.bilibili.com/blackboard/activity-list.html', '#channel-activity'],
    ['课堂', '//www.bilibili.com/cheese/', '#channel-zhishi'],
    ['社区中心', '//www.bilibili.com/blackboard/activity-5zJxM3spoS.html', '#channel-blackroom'],
    ['新歌热榜', '//music.bilibili.com/pc/music-center/', '#channel-musicplus'],
  ],
] satisfies ReadonlyArray<ReadonlyArray<readonly [string, string, string]>>

function getDocumentTopBar(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('.bili-header')
}

function getNativeDocumentTopBar(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('body > #app > .bili-feed4 > .bili-header')
}

function rememberOriginalTopBarParent(doc: Document, header: HTMLElement) {
  if (header.parentElement && header.parentElement !== doc.body)
    cachedOriginalTopBarParent = header.parentElement
}

/**
 * 对齐 1.6.8：原版顶栏始终 slide-down，走 B 站「白底 + 默认图标色」实心主题。
 * 只 add、不在滚动回顶时 remove，避免透明顶栏白图标；也不在 MutationObserver 里死磕争抢。
 */
function applyOriginalTopBarSlideDown(header: HTMLElement | null | undefined) {
  header?.querySelector('.bili-header__bar')?.classList.add('slide-down')
}

function prepareOriginalTopBar(header: HTMLElement) {
  const innerUselessContents = header.querySelectorAll<HTMLElement>(
    ':scope > *:not(.bili-header__bar):not(.bili-header__channel)',
  )
  innerUselessContents.forEach(item => (item.style.display = 'none'))
  header.querySelector<HTMLElement>(':scope > .bili-header__channel')?.style.removeProperty('display')
  applyOriginalTopBarSlideDown(header)
  setupOriginalTopBarChannelHover(header)
  ensureOriginalTopBarScrolledLayout(header)
}

export function captureOriginalBilibiliTopBar(doc: Document) {
  if (cachedOriginalTopBar?.isConnected && cachedOriginalTopBar.ownerDocument === doc)
    return cachedOriginalTopBar

  const header = getDocumentTopBar(doc)
  if (!header)
    return null

  cachedOriginalTopBar = header
  rememberOriginalTopBarParent(doc, header)
  keepOriginalTopBarAvailable(doc)
  // 1.6.8：先进入 slide-down 实心主题，再同步滚动布局 class
  prepareOriginalTopBar(header)
  setOriginalBilibiliTopBarScrolled(doc, false)
  return cachedOriginalTopBar
}

/**
 * 同步 BewlyCat 独立滚动容器与 B 站原版顶栏的下拉状态。
 * B 站脚本只监听页面滚动，无法感知 Shadow DOM 内部容器的 scrollTop。
 *
 * slide-down 始终保留（1.6.8 观感）；频道 Logo 等仅依赖 bewly-original-top-bar-scrolled。
 */
export function setOriginalBilibiliTopBarScrolled(doc: Document, scrolled: boolean) {
  const header = getDocumentTopBar(doc) || cachedOriginalTopBar
  if (header && header !== cachedOriginalTopBar)
    cachedOriginalTopBar = header
  header?.classList.toggle('bewly-original-top-bar-scrolled', scrolled)
  applyOriginalTopBarSlideDown(header)
  if (header) {
    if (scrolled)
      restoreOriginalTopBarVisibility(header)
    keepOriginalTopBarScrolled(header)
  }
  if (!scrolled) {
    header?.classList.remove('bewly-original-channel-open')
    header?.classList.remove('bewly-original-channel-closing')
    getOriginalTopBarNativeChannelPopover(header)?.classList.remove(
      'bewly-original-native-channel-open',
      'bewly-original-native-channel-closing',
    )
    setOriginalTopBarHomeArrowExpanded(header, false)
  }
}

function keepOriginalTopBarAvailable(doc: Document) {
  if (initializedTopBarDocuments.has(doc))
    return

  initializedTopBarDocuments.add(doc)
  let reparenting = false
  const observer = new MutationObserver(() => {
    if (reparenting)
      return

    // 已有挂在 body 上的稳定 portal：绝不要再 adopt #app 内再生的顶栏。
    // 否则会「删 body 顶栏 → portal 新节点 → Vue 再造 → 再删」无限循环，
    // 主线程卡死，页面白屏转圈且 Network 看不到后续请求。
    if (cachedOriginalTopBar?.isConnected && cachedOriginalTopBar.parentElement === doc.body) {
      if (cachedOriginalTopBar !== doc.body.firstElementChild) {
        reparenting = true
        try {
          doc.body.prepend(cachedOriginalTopBar)
        }
        finally {
          reparenting = false
        }
      }
      return
    }

    // 缓存已掉线时再找新顶栏；优先 body 上的，避免去抢隐藏 #app 树
    const header = doc.querySelector<HTMLElement>('body > .bili-header')
      || getNativeDocumentTopBar(doc)
      || getDocumentTopBar(doc)
    if (!header || header === cachedOriginalTopBar)
      return

    const scrolled = cachedOriginalTopBar?.classList.contains('bewly-original-top-bar-scrolled') ?? false
    reparenting = true
    try {
      cachedOriginalTopBar = header
      rememberOriginalTopBarParent(doc, header)
      prepareOriginalTopBar(header)
      // 自定义首页会隐藏 #app：新生成的原生顶栏 portal 到 body
      if (header.parentElement !== doc.body)
        doc.body.prepend(header)
      setOriginalBilibiliTopBarScrolled(doc, scrolled)
    }
    finally {
      reparenting = false
    }
  })
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
  })
}

function restoreOriginalTopBarVisibility(header: HTMLElement) {
  const bar = header.querySelector<HTMLElement>('.bili-header__bar')
  for (const element of [header, bar]) {
    element?.style.removeProperty('display')
    element?.style.removeProperty('visibility')
    element?.style.removeProperty('opacity')
  }
}

function keepOriginalTopBarScrolled(header: HTMLElement) {
  if (initializedScrollStateHeaders.has(header))
    return

  initializedScrollStateHeaders.add(header)
  let syncing = false
  const observer = new MutationObserver(() => {
    // 仅维护「已滚离顶部」布局；并防 re-entry，避免与 B 站 class 争抢卡死
    if (syncing || !header.classList.contains('bewly-original-top-bar-scrolled'))
      return

    syncing = true
    try {
      const bar = header.querySelector('.bili-header__bar')
      if (bar && !bar.classList.contains('slide-down'))
        bar.classList.add('slide-down')
      restoreOriginalTopBarVisibility(header)
      ensureOriginalTopBarScrolledLayout(header)
    }
    finally {
      queueMicrotask(() => {
        syncing = false
      })
    }
  })
  observer.observe(header, {
    attributes: true,
    attributeFilter: ['class', 'style'],
    childList: true,
    subtree: true,
  })
}

/**
 * 原版顶栏宽 Logo：只用 B 站自身资源（banner / 顶栏内已有 logo），
 * 与插件设置 topBarLogoStyle 无关（该项仅作用于 Bewly 顶栏）。
 */
function resolveOriginalTopBarLogoSrc(header: HTMLElement): string | null {
  const candidates = [
    header.querySelector<HTMLImageElement>('.bili-header__banner .inner-logo img'),
    header.querySelector<HTMLImageElement>('.bili-header__banner img'),
    header.querySelector<HTMLImageElement>('.bewly-bili-logo-entry img'),
    // 部分版本 slide-down 后自带宽 Logo
    header.querySelector<HTMLImageElement>('.bili-header__bar .left-entry .logo img'),
    header.querySelector<HTMLImageElement>('.bili-header__bar .mini-header__logo img'),
  ]
  for (const img of candidates) {
    const src = img?.getAttribute('src') || img?.src || ''
    if (src)
      return src
  }
  return null
}

function ensureOriginalTopBarLogoEntry(header: HTMLElement) {
  const leftEntry = header.querySelector<HTMLElement>('.bili-header__bar .left-entry')
  if (!leftEntry)
    return

  const logoSrc = resolveOriginalTopBarLogoSrc(header)
  if (!logoSrc)
    return

  const existing = leftEntry.querySelector<HTMLElement>('.bewly-bili-logo-entry')
  if (existing) {
    const image = existing.querySelector<HTMLImageElement>('img')
    if (image && image.getAttribute('src') !== logoSrc)
      image.src = logoSrc
    return
  }

  const doc = header.ownerDocument
  const item = doc.createElement('li')
  item.className = 'bewly-bili-logo-entry'

  const link = doc.createElement('a')
  link.href = '//www.bilibili.com'
  link.setAttribute('aria-label', 'Bilibili')

  const image = doc.createElement('img')
  image.src = logoSrc
  image.alt = 'Bilibili'

  link.appendChild(image)
  item.appendChild(link)
  leftEntry.prepend(item)
}

function ensureOriginalTopBarScrolledLayout(header: HTMLElement) {
  const leftEntry = header.querySelector<HTMLElement>('.bili-header__bar .left-entry')
  const homeEntry = leftEntry?.querySelector<HTMLElement>('.entry-title, .left-entry__title')
  if (!leftEntry || !homeEntry)
    return
  const doc = header.ownerDocument

  // 首屏与滚动后都挂 B 站自己的宽 Logo（不读插件 topBarLogoStyle）
  ensureOriginalTopBarLogoEntry(header)

  if (!homeEntry.querySelector('.mini-header__arrow, .bewly-home-entry-arrow')) {
    const arrow = doc.createElement('span')
    arrow.className = 'bewly-home-entry-arrow'
    arrow.setAttribute('aria-hidden', 'true')
    homeEntry.appendChild(arrow)
  }

  if (!header.querySelector('.bewly-bili-channel-panel')) {
    const nativePanel = header.querySelector<HTMLElement>(
      '.bili-header-channel-panel:not(.bewly-bili-channel-panel)',
    )

    if (nativePanel) {
      return
    }

    if (!doc.querySelector('[data-bewly-channel-icons]')) {
      const icons = doc.createElement('div')
      icons.dataset.bewlyChannelIcons = ''
      icons.innerHTML = SVG_ICONS
      doc.body.appendChild(icons)
    }

    const panel = doc.createElement('div')
    panel.className = 'bili-header-channel-panel bewly-bili-channel-panel'

    channelPanelColumns.forEach((columnItems) => {
      const column = doc.createElement('div')
      column.className = 'channel-panel__column'

      columnItems.forEach(([name, href, iconHref]) => {
        const link = doc.createElement('a')
        link.className = 'channel-panel__item'
        link.href = href
        link.target = '_blank'

        const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
        icon.classList.add('channel-panel__icon')
        icon.setAttribute('aria-hidden', 'true')
        const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use')
        use.setAttribute('href', iconHref)
        icon.appendChild(use)

        const label = doc.createElement('span')
        label.className = 'name'
        label.textContent = name

        link.append(icon, label)
        column.appendChild(link)
      })

      panel.appendChild(column)
    })

    header.appendChild(panel)
  }
}

function setOriginalTopBarHomeArrowExpanded(header: HTMLElement | null, expanded: boolean) {
  header
    ?.querySelector('.mini-header__arrow')
    ?.classList
    .toggle('arrow-up', expanded)
  header
    ?.querySelector('.bewly-home-entry-arrow')
    ?.classList
    .toggle('arrow-up', expanded)
}

function getOriginalTopBarNativeChannelPopover(header: HTMLElement | null) {
  return header
    ?.querySelector('.bili-header-channel-panel:not(.bewly-bili-channel-panel)')
    ?.closest<HTMLElement>('.v-popover') ?? null
}

function setupOriginalTopBarChannelHover(header: HTMLElement) {
  if (initializedHoverHeaders.has(header))
    return

  initializedHoverHeaders.add(header)

  let closeTimer: ReturnType<typeof setTimeout> | null = null
  let closeAnimationTimer: ReturnType<typeof setTimeout> | null = null

  const clearCloseTimer = () => {
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    if (closeAnimationTimer) {
      clearTimeout(closeAnimationTimer)
      closeAnimationTimer = null
    }
  }

  header.addEventListener('pointerover', (event) => {
    const target = event.target as Element | null
    if (!target?.closest('.entry-title, .left-entry__title, .bewly-bili-channel-panel, .bili-header-channel-panel'))
      return

    clearCloseTimer()
    if (header.classList.contains('bewly-original-top-bar-scrolled')) {
      const nativePopover = getOriginalTopBarNativeChannelPopover(header)
      header.classList.remove('bewly-original-channel-closing')
      header.classList.add('bewly-original-channel-open')
      nativePopover?.classList.remove('bewly-original-native-channel-closing')
      nativePopover?.classList.add('bewly-original-native-channel-open')
      setOriginalTopBarHomeArrowExpanded(header, true)
    }
  })

  header.addEventListener('pointerout', (event) => {
    const target = event.target as Element | null
    if (!target?.closest('.entry-title, .left-entry__title, .bewly-bili-channel-panel, .bili-header-channel-panel'))
      return

    clearCloseTimer()
    closeTimer = setTimeout(() => {
      const nativePopover = getOriginalTopBarNativeChannelPopover(header)
      closeTimer = null
      header.classList.remove('bewly-original-channel-open')
      header.classList.add('bewly-original-channel-closing')
      nativePopover?.classList.remove('bewly-original-native-channel-open')
      nativePopover?.classList.add('bewly-original-native-channel-closing')
      setOriginalTopBarHomeArrowExpanded(header, false)
      closeAnimationTimer = setTimeout(() => {
        header.classList.remove('bewly-original-channel-closing')
        nativePopover?.classList.remove('bewly-original-native-channel-closing')
        closeAnimationTimer = null
      }, 300)
    }, 120)
  })
}

export function detachOriginalBilibiliTopBar(doc: Document) {
  const header = getDocumentTopBar(doc)
  if (!header)
    return

  cachedOriginalTopBar = header
  header.classList.remove(
    'bewly-original-top-bar-scrolled',
    'bewly-original-channel-open',
    'bewly-original-channel-closing',
  )
  getOriginalTopBarNativeChannelPopover(header)?.classList.remove(
    'bewly-original-native-channel-open',
    'bewly-original-native-channel-closing',
  )
  header.querySelector('.bili-header__bar')?.classList.remove('slide-down')
}

export function ensureOriginalBilibiliTopBarAppended(doc: Document): boolean {
  // 已有 body portal 则复用，切勿用 #app 内新生顶栏替换（会死循环）
  if (cachedOriginalTopBar?.isConnected && cachedOriginalTopBar.parentElement === doc.body) {
    prepareOriginalTopBar(cachedOriginalTopBar)
    if (cachedOriginalTopBar !== doc.body.firstElementChild)
      doc.body.prepend(cachedOriginalTopBar)
    return true
  }

  const bodyHeader = doc.querySelector<HTMLElement>('body > .bili-header')
  const nativeHeader = getNativeDocumentTopBar(doc)
  const header = bodyHeader || cachedOriginalTopBar || nativeHeader || getDocumentTopBar(doc)
  if (!header)
    return false

  cachedOriginalTopBar = header
  rememberOriginalTopBarParent(doc, header)
  prepareOriginalTopBar(header)

  // 自定义首页会整树隐藏 #app，必须把顶栏 portal 到 body，不能依赖 #app 保活露出。
  if (header.parentElement !== doc.body || header !== doc.body.firstElementChild)
    doc.body.prepend(header)

  return true
}

/**
 * 将 body 上的原版顶栏尝试放回 B 站原生父节点。
 * 自定义首页路径不再调用此函数（避免回填保活）；保留给少数需要归还所有权的场景。
 */
export function restoreOriginalBilibiliTopBarParent(doc: Document): boolean {
  const mountedHeader = cachedOriginalTopBar?.parentElement === doc.body
    ? cachedOriginalTopBar
    : doc.querySelector<HTMLElement>('body > .bili-header')

  const header = mountedHeader || cachedOriginalTopBar
  if (!header)
    return false

  const parent = cachedOriginalTopBarParent?.isConnected
    ? cachedOriginalTopBarParent
    : doc.querySelector<HTMLElement>('body > #app > .bili-feed4')
  if (!parent)
    return false

  if (header.parentElement !== parent)
    parent.prepend(header)

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
  // 切换回原版顶栏时点一次 slide-down（1.6.8），恢复默认图标色
  applyOriginalTopBarSlideDown(getDocumentTopBar(doc) || cachedOriginalTopBar)
}

/**
 * Add click event listeners to login buttons in the original Bilibili top bar
 * to redirect users to the login page.
 */
export function setupLoginButtonClickHandlers(doc: Document) {
  const existingCleanup = loginButtonSetupCleanups.get(doc)
  if (existingCleanup)
    return existingCleanup

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

  // Observe the entire document for popup elements.
  // 内容脚本在 document_start 注入，iframe 刚创建时 doc.body 仍为 null；
  // 回落到 documentElement 既能避免抛错，又能靠 subtree 覆盖随后插入的 body。
  const observeTarget = doc.body ?? doc.documentElement
  let observer: MutationObserver | null = null
  if (observeTarget) {
    // Use MutationObserver to handle dynamically added popup elements
    observer = new MutationObserver((mutations) => {
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

    observer.observe(observeTarget, {
      childList: true,
      subtree: true,
    })
  }

  const cleanup = () => {
    observer?.disconnect()
    if (loginButtonSetupCleanups.get(doc) === cleanup)
      loginButtonSetupCleanups.delete(doc)
  }

  loginButtonSetupCleanups.set(doc, cleanup)
  return cleanup
}
