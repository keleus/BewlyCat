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
const initializedHoverHeaders = new WeakSet<HTMLElement>()
const initializedScrollStateHeaders = new WeakSet<HTMLElement>()
const initializedFixedChannelSources = new WeakSet<HTMLElement>()
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

export function captureOriginalBilibiliTopBar(doc: Document) {
  if (cachedOriginalTopBar?.isConnected && cachedOriginalTopBar.ownerDocument === doc)
    return cachedOriginalTopBar

  const header = getDocumentTopBar(doc)
  if (!header)
    return null

  cachedOriginalTopBar = header
  setOriginalBilibiliTopBarScrolled(doc, false)
  ensureOriginalTopBarScrolledLayout(header)
  return cachedOriginalTopBar
}

/**
 * 同步 BewlyCat 独立滚动容器与 B 站原版顶栏的下拉状态。
 * B 站脚本只监听页面滚动，无法感知 Shadow DOM 内部容器的 scrollTop。
 */
export function setOriginalBilibiliTopBarScrolled(doc: Document, scrolled: boolean) {
  const header = getDocumentTopBar(doc) || cachedOriginalTopBar
  header?.classList.toggle('bewly-original-top-bar-scrolled', scrolled)
  header?.querySelector('.bili-header__bar')?.classList.toggle('slide-down', scrolled)
  if (header)
    keepOriginalTopBarScrolled(header)
  if (!scrolled)
    header?.classList.remove('bewly-original-channel-open')
}

function keepOriginalTopBarScrolled(header: HTMLElement) {
  if (initializedScrollStateHeaders.has(header))
    return

  initializedScrollStateHeaders.add(header)
  const observer = new MutationObserver(() => {
    if (!header.classList.contains('bewly-original-top-bar-scrolled'))
      return

    const bar = header.querySelector('.bili-header__bar')
    if (bar && !bar.classList.contains('slide-down'))
      bar.classList.add('slide-down')
    ensureOriginalTopBarScrolledLayout(header)
  })
  observer.observe(header, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true,
  })
}

function ensureOriginalTopBarScrolledLayout(header: HTMLElement) {
  const leftEntry = header.querySelector<HTMLElement>('.bili-header__bar .left-entry')
  const homeEntry = leftEntry?.querySelector<HTMLElement>('.entry-title')
  if (!leftEntry || !homeEntry)
    return
  const doc = header.ownerDocument

  if (!leftEntry.querySelector('.bewly-bili-logo-entry')) {
    const sourceLogo = header.querySelector<HTMLImageElement>('.bili-header__banner .inner-logo img')
    if (sourceLogo?.getAttribute('src')) {
      const item = doc.createElement('li')
      item.className = 'bewly-bili-logo-entry'

      const link = doc.createElement('a')
      link.href = '//www.bilibili.com'
      link.setAttribute('aria-label', 'Bilibili')

      const image = doc.createElement('img')
      image.src = sourceLogo.getAttribute('src')!
      image.alt = 'Bilibili'

      link.appendChild(image)
      item.appendChild(link)
      leftEntry.prepend(item)
    }
  }

  if (!homeEntry.querySelector('.bewly-home-entry-arrow')) {
    const arrow = doc.createElement('span')
    arrow.className = 'bewly-home-entry-arrow'
    arrow.setAttribute('aria-hidden', 'true')
    homeEntry.appendChild(arrow)
  }

  if (!header.querySelector(':scope > .bewly-bili-fixed-channel')) {
    const nativeFixedChannel = doc.querySelector<HTMLElement>(
      '.header-channel:not(.bewly-bili-fixed-channel)',
    )
    if (nativeFixedChannel) {
      if (nativeFixedChannel.querySelector('.header-channel-fixed-right-item')) {
        const fixedChannel = nativeFixedChannel.cloneNode(true) as HTMLElement
        fixedChannel.classList.add('bewly-bili-fixed-channel')
        fixedChannel.style.removeProperty('display')

        fixedChannel.addEventListener('pointerenter', () => {
          fixedChannel
            .querySelector('.header-channel-fixed')
            ?.classList
            .add('header-channel-fixed-down')
        })
        fixedChannel.addEventListener('pointerleave', () => {
          fixedChannel
            .querySelector('.header-channel-fixed')
            ?.classList
            .remove('header-channel-fixed-down')
        })
        fixedChannel.querySelector('.header-channel-fixed-arrow')?.addEventListener('click', () => {
          fixedChannel
            .querySelector('.header-channel-fixed')
            ?.classList
            .toggle('header-channel-fixed-down')
        })

        header.appendChild(fixedChannel)
      }
      else if (!initializedFixedChannelSources.has(nativeFixedChannel)) {
        initializedFixedChannelSources.add(nativeFixedChannel)
        const observer = new MutationObserver(() => {
          if (!header.isConnected) {
            observer.disconnect()
            return
          }
          if (!nativeFixedChannel.querySelector('.header-channel-fixed-right-item'))
            return

          observer.disconnect()
          ensureOriginalTopBarScrolledLayout(header)
        })
        observer.observe(nativeFixedChannel, {
          childList: true,
          subtree: true,
        })
      }
    }
  }

  if (!header.querySelector('.bewly-bili-channel-panel')) {
    const nativePanel = header.querySelector<HTMLElement>(
      '.bili-header-channel-panel:not(.bewly-bili-channel-panel)',
    )

    if (nativePanel) {
      const panel = nativePanel.cloneNode(true) as HTMLElement
      panel.classList.add('bewly-bili-channel-panel')
      header.appendChild(panel)
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

function setupOriginalTopBarChannelHover(header: HTMLElement) {
  if (initializedHoverHeaders.has(header))
    return

  initializedHoverHeaders.add(header)
  let closeTimer: ReturnType<typeof setTimeout> | null = null

  const clearCloseTimer = () => {
    if (!closeTimer)
      return

    clearTimeout(closeTimer)
    closeTimer = null
  }

  header.addEventListener('pointerover', (event) => {
    const target = event.target as Element | null
    if (!target?.closest('.entry-title, .bewly-bili-channel-panel'))
      return

    clearCloseTimer()
    if (header.classList.contains('bewly-original-top-bar-scrolled'))
      header.classList.add('bewly-original-channel-open')
  })

  header.addEventListener('pointerout', (event) => {
    const target = event.target as Element | null
    if (!target?.closest('.entry-title, .bewly-bili-channel-panel'))
      return

    clearCloseTimer()
    closeTimer = setTimeout(() => {
      header.classList.remove('bewly-original-channel-open')
      closeTimer = null
    }, 120)
  })
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

  // 1. 隐藏 banner 等首页内容，分区面板由样式在下拉后悬浮“首页”时显示
  const innerUselessContents = header.querySelectorAll<HTMLElement>(
    ':scope > *:not(.bili-header__bar):not(.bili-header__channel)',
  )
  innerUselessContents.forEach(item => (item.style.display = 'none'))
  header.querySelector<HTMLElement>(':scope > .bili-header__channel')?.style.removeProperty('display')
  setupOriginalTopBarChannelHover(header)
  ensureOriginalTopBarScrolledLayout(header)

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
