import { settings } from '~/logic'

// 随机播放状态管理
let isRandomPlayEnabled = false
let isRandomPlayInitialized = false
const visitedEpisodes: Set<number> = new Set()
let originalEndedListener: (() => void) | null = null
let userManuallySetRandomPlay = false // 用户手动设置的随机播放状态标志

// 获取随机播放文本
export function getRandomPlayText(): string {
  // 尝试获取扩展设置的语言
  const htmlLang = document.querySelector('html')?.getAttribute('lang')
  const i18nLang = document.querySelector('html')?.getAttribute('data-i18n')

  // 判断语言类型
  if (i18nLang === 'en' || htmlLang === 'en') {
    return 'Random Play'
  }
  else if (htmlLang === 'zh-TW' || htmlLang === 'zh-Hant') {
    return '隨機播放'
  }
  else {
    return '随机播放' // 默认简体中文
  }
}

// 获取视频选集
export function getVideoEpisodes(): HTMLElement[] {
  // 多P视频选集（B站标准选集列表）
  const episodes = Array.from(document.querySelectorAll('.video-pod__item, .multi-page__item, .page-item')) as HTMLElement[]

  if (episodes.length > 0) {
    return episodes
  }

  // 合集视频选集（稍后再看、收藏夹等）
  const collectionEpisodes = Array.from(document.querySelectorAll('.list-item, .episode-item, .section-item, .collect-item')) as HTMLElement[]
  const validCollectionEpisodes = collectionEpisodes.filter((item) => {
    const link = item.querySelector('a[href*="/video/"]')
    return link !== null
  })

  if (validCollectionEpisodes.length > 0) {
    return validCollectionEpisodes
  }

  // 尝试更通用的选择器
  const genericEpisodes = Array.from(document.querySelectorAll('[class*="episode"], [class*="item"], [class*="video"]')) as HTMLElement[]
  const validGenericEpisodes = genericEpisodes.filter((item) => {
    const link = item.querySelector('a[href*="/video/"]')
    return link !== null && !item.classList.contains('active') && !item.classList.contains('current')
  })

  return validGenericEpisodes
}

// 获取当前选集索引
export function getCurrentEpisodeIndex(episodes: HTMLElement[]): number {
  const currentIndex = episodes.findIndex((episode) => {
    return episode.classList.contains('active')
      || episode.classList.contains('current')
      || episode.classList.contains('on')
  })
  return currentIndex >= 0 ? currentIndex : 0
}

// 获取随机下一集
export function getRandomNextEpisode(episodes: HTMLElement[], currentIndex: number): number {
  console.log('[BewlyCat Random Play] getRandomNextEpisode called, currentIndex:', currentIndex, 'visitedEpisodes:', Array.from(visitedEpisodes))

  if (episodes.length <= 1)
    return currentIndex

  // 如果所有视频都已访问，重置访问记录
  if (visitedEpisodes.size >= episodes.length) {
    console.log('[BewlyCat Random Play] All episodes visited, resetting')
    visitedEpisodes.clear()
    visitedEpisodes.add(currentIndex)
  }

  // 获取未访问的视频索引
  const unvisitedIndices = episodes
    .map((_, index) => index)
    .filter(index => !visitedEpisodes.has(index))

  console.log('[BewlyCat Random Play] Unvisited indices:', unvisitedIndices)

  if (unvisitedIndices.length === 0) {
    console.log('[BewlyCat Random Play] No unvisited indices, selecting random excluding current')
    // 如果没有未访问的视频，随机选择一个不是当前视频的
    const availableIndices = episodes
      .map((_, index) => index)
      .filter(index => index !== currentIndex)

    if (availableIndices.length === 0) {
      console.log('[BewlyCat Random Play] No available indices')
      return currentIndex
    }
    const selected = availableIndices[Math.floor(Math.random() * availableIndices.length)]
    console.log('[BewlyCat Random Play] Selected from available:', selected)
    return selected
  }

  const selected = unvisitedIndices[Math.floor(Math.random() * unvisitedIndices.length)]
  console.log('[BewlyCat Random Play] Selected from unvisited:', selected)
  return selected
}

// 跳转到指定选集
export function jumpToEpisode(episodes: HTMLElement[], targetIndex: number): void {
  if (targetIndex < 0 || targetIndex >= episodes.length) {
    return
  }

  const targetEpisode = episodes[targetIndex]
  console.log('[BewlyCat Random Play] Target episode element:', targetEpisode)

  // 尝试多种方式找到可点击的元素
  let clickableElement: HTMLElement | null = null

  // 1. 优先查找链接
  const link = targetEpisode.querySelector('a') as HTMLAnchorElement
  console.log('[BewlyCat Random Play] Found link:', link, 'href:', link?.href)

  if (link && link.href) {
    clickableElement = link
  }
  else {
    // 2. 查找 .simple-base-item 元素（B站新版播放列表项）
    const simpleBaseItem = targetEpisode.querySelector('.simple-base-item') as HTMLElement
    console.log('[BewlyCat Random Play] Found .simple-base-item:', simpleBaseItem)

    if (simpleBaseItem) {
      clickableElement = simpleBaseItem
    }
    else {
      // 3. 查找其他可能的可点击元素
      const baseItem = targetEpisode.querySelector('.base-item, .item, .video-item') as HTMLElement
      if (baseItem) {
        clickableElement = baseItem
      }
      else {
        // 4. 回退到父元素
        clickableElement = targetEpisode
      }
    }
  }

  if (!clickableElement) {
    console.log('[BewlyCat Random Play] No clickable element found')
    return
  }

  console.log('[BewlyCat Random Play] Clickable element:', clickableElement)

  // 使用更智能的点击策略
  const performClick = () => {
    try {
      console.log('[BewlyCat Random Play] Attempting to click element:', targetIndex, clickableElement)

      // 标记为已访问（在点击前标记，防止点击失败后重复尝试）
      visitedEpisodes.add(targetIndex)

      // 如果是链接，尝试点击
      if (clickableElement instanceof HTMLAnchorElement && clickableElement.href) {
        console.log('[BewlyCat Random Play] Clicking anchor element, href:', clickableElement.href)
        clickableElement.click()
        return
      }

      // 对于没有链接的元素（如 video-pod__item），模拟真实点击
      console.log('[BewlyCat Random Play] Simulating click on element')

      // 方法1: 直接点击
      clickableElement!.click()

      // 方法2: 触发 mousedown -> mouseup -> click 事件序列（模拟真实点击）
      setTimeout(() => {
        const mouseDownEvent = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: 1,
        })
        clickableElement!.dispatchEvent(mouseDownEvent)

        setTimeout(() => {
          const mouseUpEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
            buttons: 0,
          })
          clickableElement!.dispatchEvent(mouseUpEvent)

          setTimeout(() => {
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              detail: 1,
            })
            clickableElement!.dispatchEvent(clickEvent)
            console.log('[BewlyCat Random Play] Click sequence completed')
          }, 10)
        }, 10)
      }, 10)
    }
    catch (error) {
      console.error('[BewlyCat Random Play] Click failed:', error)
    }
  }

  // 直接执行点击，不需要滚动
  // B站点击后会自动处理页面滚动和视频加载
  performClick()
}

// 创建随机播放UI
export function createRandomPlayUI(): HTMLElement | null {
  // 查找自动连播按钮的容器
  const autoPlayContainer = document.querySelector('.auto-play')
  if (!autoPlayContainer)
    return null

  // 检查是否已存在随机播放按钮
  if (document.querySelector('.random-play-btn'))
    return null

  // 创建随机播放按钮容器
  const randomPlayContainer = document.createElement('div')
  randomPlayContainer.className = 'random-play'
  randomPlayContainer.style.cssText = `
    margin-left: 12px;
  `

  // 创建随机播放按钮
  const randomPlayBtn = document.createElement('div')
  randomPlayBtn.className = 'random-play-btn'

  randomPlayBtn.style.cssText = `
    display: flex;
    align-items: center;
    cursor: pointer;
    font-size: 14px;
    color: var(--text3);
    user-select: none;
  `

  // 创建文本
  const txtEl = document.createElement('div')
  txtEl.className = 'txt'
  txtEl.textContent = getRandomPlayText()
  txtEl.style.cssText = `
    margin-right: 4px;
  `

  // 创建开关
  const switchBtn = document.createElement('div')
  switchBtn.className = 'switch-btn'

  switchBtn.style.cssText = `
    position: relative;
    width: 30px;
    height: 20px;
    background: var(--bew-switch-bg);
    border-radius: 10px;
    transition: background-color 0.3s;
    cursor: pointer;
  `

  const switchBlock = document.createElement('div')
  switchBlock.className = 'switch-block'
  switchBlock.style.cssText = `
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    transition: transform 0.3s;
  `

  switchBtn.appendChild(switchBlock)
  randomPlayBtn.appendChild(txtEl)
  randomPlayBtn.appendChild(switchBtn)
  randomPlayContainer.appendChild(randomPlayBtn)

  // 更新开关状态的函数
  function updateSwitchState(enabled: boolean) {
    const activeColor = '#00aeec'

    if (enabled) {
      switchBtn.style.backgroundColor = activeColor
      // 30px宽度 - 2px左边距 - 2px右边距 - 16px滑块宽度 = 10px移动距离
      switchBlock.style.transform = 'translateX(10px)'
      randomPlayBtn.style.color = activeColor
    }
    else {
      switchBtn.style.backgroundColor = 'var(--bew-switch-bg)'
      switchBlock.style.transform = 'translateX(0)'
      randomPlayBtn.style.color = 'var(--text3)'
    }
  }

  // 点击事件
  randomPlayBtn.addEventListener('click', () => {
    const newEnabled = !isRandomPlayEnabled
    setRandomPlayEnabled(newEnabled)
    updateSwitchState(newEnabled)
    // 标记为用户手动设置
    userManuallySetRandomPlay = true
  })

  // 初始状态 - 使用当前状态
  updateSwitchState(isRandomPlayEnabled)

  // 插入到自动连播按钮旁边
  const rightContainer = autoPlayContainer.parentElement
  if (rightContainer) {
    rightContainer.appendChild(randomPlayContainer)
  }

  return randomPlayContainer
}

// 启用随机播放
export function enableRandomPlay(): void {
  // 使用更可靠的方式监听视频结束
  const setupVideoListener = () => {
    const video = document.querySelector('video')
    if (!video) {
      // 如果找不到视频，稍后重试
      setTimeout(setupVideoListener, 1000)
      return
    }

    // 移除之前的监听器
    if (originalEndedListener) {
      video.removeEventListener('ended', originalEndedListener)
      video.removeEventListener('pause', originalEndedListener)
    }

    // 标记视频元素，防止重复添加监听器
    video.setAttribute('data-bewly-random-play-listener', 'true')

    // 用于防止重复触发
    let isProcessing = false

    // 创建新的随机播放监听器
    const randomPlayListener = () => {
      console.log('[BewlyCat Random Play] Video ended, random play listener triggered')

      // 防止重复触发（ended 和 pause 事件可能都会触发）
      if (isProcessing) {
        console.log('[BewlyCat Random Play] Already processing, skipping')
        return
      }

      // 关键：检查随机播放是否仍然启用
      if (!isRandomPlayEnabled) {
        console.log('[BewlyCat Random Play] Random play disabled, skipping')
        return
      }

      isProcessing = true

      // 延迟执行，确保播放状态完全结束
      setTimeout(() => {
        // 重置处理标志
        isProcessing = false
        // 再次检查状态，防止在延迟期间被禁用
        if (!isRandomPlayEnabled) {
          console.log('[BewlyCat Random Play] Random play disabled during delay, skipping')
          return
        }

        const episodes = getVideoEpisodes()
        console.log('[BewlyCat Random Play] Found episodes:', episodes.length)

        if (episodes.length <= 1) {
          console.log('[BewlyCat Random Play] Not enough episodes')
          return
        }

        const currentIndex = getCurrentEpisodeIndex(episodes)
        console.log('[BewlyCat Random Play] Current episode index:', currentIndex)

        const nextIndex = getRandomNextEpisode(episodes, currentIndex)
        console.log('[BewlyCat Random Play] Next episode index:', nextIndex)

        if (nextIndex !== currentIndex) {
          jumpToEpisode(episodes, nextIndex)
        }
        else {
          console.log('[BewlyCat Random Play] Next index same as current, not jumping')
        }
      }, 1500) // 增加到1.5秒延迟，确保播放完全结束
    }

    // 监听多个事件以确保兼容性
    video.addEventListener('ended', randomPlayListener)
    // 有些情况下pause事件可能更可靠
    video.addEventListener('pause', () => {
      // 检查是否是播放结束（当前时间和总时间相近）
      if (video.currentTime > 0 && video.duration > 0 && (video.duration - video.currentTime) < 1) {
        randomPlayListener()
      }
    })

    originalEndedListener = randomPlayListener
  }

  // 立即尝试设置监听器
  setupVideoListener()

  // 监听DOM变化，如果视频元素被替换，重新设置监听器
  const videoObserver = new MutationObserver(() => {
    const video = document.querySelector('video')
    if (video && !video.hasAttribute('data-bewly-random-play-listener')) {
      setupVideoListener()
    }
  })

  videoObserver.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

// 禁用随机播放
export function disableRandomPlay(): void {
  const video = document.querySelector('video')
  if (!video || !originalEndedListener) {
    return
  }

  video.removeEventListener('ended', originalEndedListener)
  video.removeEventListener('pause', originalEndedListener)
  originalEndedListener = null

  // 移除标记，以便下次可以重新添加
  video.removeAttribute('data-bewly-random-play-listener')

  // 清空访问记录
  visitedEpisodes.clear()
}

// 设置随机播放状态
export function setRandomPlayEnabled(enabled: boolean): void {
  isRandomPlayEnabled = enabled
  if (enabled) {
    enableRandomPlay()
  }
  else {
    disableRandomPlay()
  }
}

// 获取随机播放状态
export function isRandomPlayActive(): boolean {
  return isRandomPlayEnabled
}

// 重置初始化状态
export function resetRandomPlayInitialization(): void {
  isRandomPlayInitialized = false
  // 注意：这里不清除isRandomPlayEnabled，保持用户的选择
  // 也不清除userManuallySetRandomPlay标志，保持用户手动设置的状态
  visitedEpisodes.clear()
}

// 同步UI状态（当UI重新创建时调用）
export function syncRandomPlayUI(): void {
  const existingBtn = document.querySelector('.random-play-btn .switch-btn') as HTMLElement
  const existingBlock = document.querySelector('.random-play-btn .switch-block') as HTMLElement
  const existingPlayBtn = document.querySelector('.random-play-btn') as HTMLElement

  if (existingBtn && existingBlock && existingPlayBtn) {
    if (isRandomPlayEnabled) {
      existingBtn.style.backgroundColor = '#00aeec'
      existingBlock.style.transform = 'translateX(16px)'
      existingPlayBtn.style.color = '#00aeec'
    }
    else {
      existingBtn.style.backgroundColor = '#e3e5e7'
      existingBlock.style.transform = 'translateX(0)'
      existingPlayBtn.style.color = '#61666d'
    }
  }
}

// 在视频页面初始化随机播放
export function initRandomPlayOnVideoPage(): void {
  if (!isVideoPage() || isRandomPlayInitialized)
    return

  // 等待页面元素加载
  const checkAndInit = () => {
    const autoPlayContainer = document.querySelector('.auto-play')
    if (autoPlayContainer) {
      // 只要启用了随机播放功能就创建UI（基于扩展设置）
      if (settings.value.enableRandomPlay) {
        createRandomPlayUI()

        // 如果用户手动设置过随机播放状态，直接应用该状态
        if (userManuallySetRandomPlay) {
          // 保持用户手动设置的状态，无需重新设置
          syncRandomPlayUI()
        }
        else {
          // 用户没有手动设置过，应用自动模式逻辑
          // 检查视频数量是否足够，只影响自动启用
          const episodes = getVideoEpisodes()
          const minVideos = settings.value.minVideosForRandom || 5
          const hasEnoughVideos = episodes.length >= minVideos

          // 只有在视频数量足够且设置为自动模式时才自动启用，且当前未启用
          if (hasEnoughVideos && settings.value.randomPlayMode === 'auto' && !isRandomPlayEnabled) {
            setRandomPlayEnabled(true)
          }

          // 如果已经启用了，确保UI状态正确
          if (isRandomPlayEnabled) {
            syncRandomPlayUI()
          }
        }

        isRandomPlayInitialized = true
      }
    }
    else {
      // 如果元素还没有加载，继续等待
      setTimeout(checkAndInit, 100)
    }
  }

  // 延迟初始化，确保页面完全加载
  setTimeout(checkAndInit, 500)
}

// 监听页面变化
export function observeRandomPlayPageChanges(): void {
  let lastUrl = window.location.href
  let urlChangeTimeout: number | null = null

  // 监听URL变化 - 使用防抖和延迟处理
  const checkUrlChange = () => {
    // 清除之前的定时器
    if (urlChangeTimeout) {
      clearTimeout(urlChangeTimeout)
    }

    // 延迟处理，让B站的路由系统先完成处理
    urlChangeTimeout = window.setTimeout(() => {
      const currentUrl = window.location.href
      if (currentUrl !== lastUrl) {
        // 检查是否只是hash变化或查询参数变化
        const currentPath = currentUrl.split('?')[0].split('#')[0]
        const lastPath = lastUrl.split('?')[0].split('#')[0]

        // 只有路径真正变化时才重新初始化
        if (currentPath !== lastPath) {
          lastUrl = currentUrl
          resetRandomPlayInitialization()

          // 进一步延迟初始化，确保B站页面完全加载
          setTimeout(() => {
            if (isVideoPage()) {
              initRandomPlayOnVideoPage()
            }
          }, 1500) // 增加到1.5秒
        }
        else {
          // 只是参数或hash变化，更新URL记录但不重新初始化
          lastUrl = currentUrl
        }
      }
    }, 500) // 500ms防抖延迟
  }

  // 监听pushstate事件 - 使用捕获阶段避免冲突
  window.addEventListener('pushstate', checkUrlChange, true)

  // 监听popstate事件 - 使用捕获阶段避免冲突
  window.addEventListener('popstate', checkUrlChange, true)

  // 使用MutationObserver监听DOM变化
  let domChangeTimeout: number | null = null
  const observer = new MutationObserver((mutations) => {
    if (!isVideoPage())
      return

    // 使用防抖避免频繁触发
    if (domChangeTimeout) {
      clearTimeout(domChangeTimeout)
    }

    domChangeTimeout = window.setTimeout(() => {
      // 检查是否需要重新初始化
      if (!isRandomPlayInitialized) {
        initRandomPlayOnVideoPage()
        return
      }

      // 检查随机播放按钮是否还存在
      const existingBtn = document.querySelector('.random-play-btn')
      const autoPlayContainer = document.querySelector('.auto-play')

      // 如果按钮不存在但应该存在（有自动播放容器且启用了功能），则重新创建
      if (!existingBtn && autoPlayContainer && settings.value.enableRandomPlay) {
        // 检查是否是因为DOM重新渲染导致的
        let shouldRecreate = false

        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            // 只检查特定的DOM变化，减少误判
            const removedNodes = Array.from(mutation.removedNodes)
            const addedNodes = Array.from(mutation.addedNodes)

            // 更精确的检查：只关注直接相关的DOM变化
            const hasAutoPlayRemoved = removedNodes.some(node =>
              node.nodeType === Node.ELEMENT_NODE
              && ((node as Element).classList?.contains('auto-play')
                || (node as Element).classList?.contains('random-play-btn')
                || (node as Element).querySelector?.('.auto-play') !== null),
            )

            const hasAutoPlayAdded = addedNodes.some(node =>
              node.nodeType === Node.ELEMENT_NODE
              && (node as Element).classList?.contains('auto-play'),
            )

            if (hasAutoPlayRemoved || hasAutoPlayAdded) {
              shouldRecreate = true
              break
            }
          }
        }

        if (shouldRecreate) {
          // 增加延迟，避免与Bilibili的DOM更新冲突
          setTimeout(() => {
            createRandomPlayUI()

            // UI创建函数内部会自动同步状态，这里不需要额外处理
          }, 500) // 增加延迟到500ms
        }
      }
    }, 300) // 300ms防抖延迟
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

// 初始化随机播放功能
export function initRandomPlay(): void {
  if (isVideoPage()) {
    initRandomPlayOnVideoPage()
  }

  observeRandomPlayPageChanges()
}

// 判断是否是视频页面
export function isVideoPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/video\/.*/.test(window.location.href)
}
