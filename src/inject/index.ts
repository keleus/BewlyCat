// 由于是浏览器环境，所以引入的ts不能使用webextension-polyfill相关api，包含获取本地Storage，获取的是网页的localStorage
import type { Settings } from '~/logic/storage'

// 存储当前设置状态
let currentSettings: Settings

// 随机播放相关状态
let isRandomPlayEnabled = false
let isRandomPlayInitialized = false
const visitedEpisodes: Set<number> = new Set()
let originalEndedListener: (() => void) | null = null

// 之前inject.js的内容
const isArray = val => Array.isArray(val)
function injectFunction(
  origin,
  keys,
  cb,
) {
  if (!isArray(keys))
    keys = [keys]

  const originKeysValue = keys.reduce((obj, key) => {
    obj[key] = origin[key]
    return obj
  }, {})

  keys.map(k => origin[k])

  keys.forEach((key) => {
    const fn = (...args) => {
      cb(...args)
      return (originKeysValue[key]).apply(origin, args)
    }
    fn.toString = (origin)[key].toString
    ;(origin)[key] = fn
  })

  return {
    originKeysValue,
    restore: () => {
      for (const key in originKeysValue) {
        origin[key] = (originKeysValue[key]).bind(origin)
      }
    },
  }
}

injectFunction(
  window.history,
  ['pushState'],
  (...args) => {
    window.dispatchEvent(new CustomEvent('pushstate', { detail: args }))
  },
)

// 获取IP地理位置字符串
function getLocationString(replyItem: any) {
  return replyItem?.reply_control?.location
}

// 判断当前页面URL是否支持IP显示
function isSupportedPage(): boolean {
  const currentUrl = window.location.href
  return (
    // 视频页面
    /https?:\/\/(?:www\.)?bilibili\.com\/video\/.*/.test(currentUrl)
    // 番剧页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/.*/.test(currentUrl)
    // 动态页面
    || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share).*/.test(currentUrl)
    // 动态详情页
    || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/.*/.test(currentUrl)
    // 用户空间页面
    || /https?:\/\/space\.bilibili\.com\/.*/.test(currentUrl)
    // 专栏页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/read\/.*/.test(currentUrl)
    // 话题页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/v\/topic\/detail.*/.test(currentUrl)
    // 课程页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/cheese\/play\/.*/.test(currentUrl)
    // 活动页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/blackboard\/.*/.test(currentUrl)
    // 拜年祭页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(currentUrl)
    // 漫画页面
    || /https?:\/\/manga\.bilibili\.com\/detail\/.*/.test(currentUrl)
  )
}

// 随机播放功能相关函数
function isVideoPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/video\/.*/.test(window.location.href)
}

function getRandomPlayText(): string {
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

function getVideoEpisodes(): HTMLElement[] {
  // 多P视频选集
  const episodes = Array.from(document.querySelectorAll('.video-pod__item')) as HTMLElement[]

  if (episodes.length > 0) {
    return episodes
  }

  // 其他可能的选集容器
  const otherEpisodes = Array.from(document.querySelectorAll('.list-item, .episode-item, .section-item')) as HTMLElement[]
  return otherEpisodes.filter((item) => {
    const link = item.querySelector('a[href*="/video/"]')
    return link !== null
  })
}

function getCurrentEpisodeIndex(episodes: HTMLElement[]): number {
  const currentIndex = episodes.findIndex((episode) => {
    return episode.classList.contains('active')
      || episode.classList.contains('current')
      || episode.classList.contains('on')
  })
  return currentIndex >= 0 ? currentIndex : 0
}

function getRandomNextEpisode(episodes: HTMLElement[], currentIndex: number): number {
  if (episodes.length <= 1)
    return currentIndex

  // 如果所有视频都已访问，重置访问记录
  if (visitedEpisodes.size >= episodes.length) {
    visitedEpisodes.clear()
    visitedEpisodes.add(currentIndex)
  }

  // 获取未访问的视频索引
  const unvisitedIndices = episodes
    .map((_, index) => index)
    .filter(index => !visitedEpisodes.has(index))

  if (unvisitedIndices.length === 0) {
    // 如果没有未访问的视频，随机选择一个不是当前视频的
    const availableIndices = episodes
      .map((_, index) => index)
      .filter(index => index !== currentIndex)

    if (availableIndices.length === 0)
      return currentIndex
    return availableIndices[Math.floor(Math.random() * availableIndices.length)]
  }

  return unvisitedIndices[Math.floor(Math.random() * unvisitedIndices.length)]
}

function jumpToEpisode(episodes: HTMLElement[], targetIndex: number): void {
  if (targetIndex < 0 || targetIndex >= episodes.length)
    return

  const targetEpisode = episodes[targetIndex]
  const link = targetEpisode.querySelector('a') || targetEpisode

  if (link) {
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    })
    link.dispatchEvent(clickEvent)

    // 标记为已访问
    visitedEpisodes.add(targetIndex)
  }
}

function createRandomPlayUI(): HTMLElement | null {
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
    font-size: 13px;
    color: #61666d;
    user-select: none;
  `

  // 创建文本
  const txtEl = document.createElement('div')
  txtEl.className = 'txt'
  txtEl.textContent = getRandomPlayText()
  txtEl.style.cssText = `
    margin-right: 6px;
  `

  // 创建开关
  const switchBtn = document.createElement('div')
  switchBtn.className = 'switch-btn'
  switchBtn.style.cssText = `
    position: relative;
    width: 34px;
    height: 18px;
    background: #e3e5e7;
    border-radius: 9px;
    transition: background-color 0.3s;
    cursor: pointer;
  `

  const switchBlock = document.createElement('div')
  switchBlock.className = 'switch-block'
  switchBlock.style.cssText = `
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: white;
    border-radius: 50%;
    transition: transform 0.3s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  `

  switchBtn.appendChild(switchBlock)
  randomPlayBtn.appendChild(txtEl)
  randomPlayBtn.appendChild(switchBtn)
  randomPlayContainer.appendChild(randomPlayBtn)

  // 更新开关状态的函数
  function updateSwitchState(enabled: boolean) {
    if (enabled) {
      switchBtn.style.backgroundColor = '#00aeec'
      switchBlock.style.transform = 'translateX(16px)'
      randomPlayBtn.style.color = '#00aeec'
    }
    else {
      switchBtn.style.backgroundColor = '#e3e5e7'
      switchBlock.style.transform = 'translateX(0)'
      randomPlayBtn.style.color = '#61666d'
    }
  }

  // 点击事件
  randomPlayBtn.addEventListener('click', () => {
    isRandomPlayEnabled = !isRandomPlayEnabled
    updateSwitchState(isRandomPlayEnabled)

    if (isRandomPlayEnabled) {
      enableRandomPlay()
    }
    else {
      disableRandomPlay()
    }
  })

  // 初始状态
  updateSwitchState(isRandomPlayEnabled)

  // 插入到自动连播按钮旁边
  const rightContainer = autoPlayContainer.parentElement
  if (rightContainer) {
    rightContainer.appendChild(randomPlayContainer)
  }

  return randomPlayContainer
}

function enableRandomPlay(): void {
  const video = document.querySelector('video')
  if (!video)
    return

  // 移除之前的监听器
  if (originalEndedListener) {
    video.removeEventListener('ended', originalEndedListener)
  }

  // 创建新的随机播放监听器
  const randomPlayListener = () => {
    setTimeout(() => {
      const episodes = getVideoEpisodes()
      if (episodes.length <= 1)
        return

      const currentIndex = getCurrentEpisodeIndex(episodes)
      const nextIndex = getRandomNextEpisode(episodes, currentIndex)

      if (nextIndex !== currentIndex) {
        jumpToEpisode(episodes, nextIndex)
      }
    }, 1000) // 延迟1秒执行
  }

  video.addEventListener('ended', randomPlayListener)
  originalEndedListener = randomPlayListener
}

function disableRandomPlay(): void {
  const video = document.querySelector('video')
  if (!video || !originalEndedListener)
    return

  video.removeEventListener('ended', originalEndedListener)
  originalEndedListener = null

  // 清空访问记录
  visitedEpisodes.clear()
}

function initRandomPlayOnVideoPage(): void {
  if (!isVideoPage() || isRandomPlayInitialized)
    return

  // 等待页面元素加载
  const checkAndInit = () => {
    const autoPlayContainer = document.querySelector('.auto-play')
    if (autoPlayContainer) {
      // 只要启用了随机播放功能就创建UI
      if (currentSettings?.enableRandomPlay) {
        createRandomPlayUI()

        // 检查视频数量是否足够，只影响自动启用
        const episodes = getVideoEpisodes()
        const minVideos = currentSettings?.minVideosForRandom || 5
        const hasEnoughVideos = episodes.length >= minVideos

        // 只有在视频数量足够且设置为自动模式时才自动启用
        if (hasEnoughVideos && currentSettings?.randomPlayMode === 'auto') {
          isRandomPlayEnabled = true
          const switchBtn = document.querySelector('.random-play-btn .switch-btn') as HTMLElement
          const switchBlock = document.querySelector('.random-play-btn .switch-block') as HTMLElement
          const randomPlayBtn = document.querySelector('.random-play-btn') as HTMLElement

          if (switchBtn && switchBlock && randomPlayBtn) {
            switchBtn.style.backgroundColor = '#00aeec'
            switchBlock.style.transform = 'translateX(16px)'
            randomPlayBtn.style.color = '#00aeec'
            enableRandomPlay()
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
function observePageChanges(): void {
  let lastUrl = window.location.href

  // 监听URL变化
  const checkUrlChange = () => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      isRandomPlayInitialized = false
      isRandomPlayEnabled = false
      visitedEpisodes.clear()

      // 重新初始化
      setTimeout(() => {
        if (isVideoPage()) {
          initRandomPlayOnVideoPage()
        }
      }, 1000)
    }
  }

  // 监听pushstate事件
  window.addEventListener('pushstate', checkUrlChange)

  // 监听popstate事件
  window.addEventListener('popstate', checkUrlChange)

  // 使用MutationObserver监听DOM变化
  const observer = new MutationObserver((mutations) => {
    if (!isVideoPage()) return
    
    // 检查是否需要重新初始化
    if (!isRandomPlayInitialized) {
      initRandomPlayOnVideoPage()
      return
    }
    
    // 检查随机播放按钮是否还存在
    const existingBtn = document.querySelector('.random-play-btn')
    const autoPlayContainer = document.querySelector('.auto-play')
    
    // 如果按钮不存在但应该存在（有自动播放容器且启用了功能），则重新创建
    if (!existingBtn && autoPlayContainer && currentSettings?.enableRandomPlay) {
      // 检查是否是因为DOM重新渲染导致的
      let shouldRecreate = false
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // 检查是否有节点被移除或添加，可能影响到我们的按钮
          const removedNodes = Array.from(mutation.removedNodes)
          const addedNodes = Array.from(mutation.addedNodes)
          
          // 如果自动播放相关的DOM发生了变化，重新创建按钮
          if (removedNodes.some(node => 
              node.nodeType === Node.ELEMENT_NODE && 
              (node as Element).querySelector?.('.auto-play, .random-play-btn')
            ) || 
            addedNodes.some(node => 
              node.nodeType === Node.ELEMENT_NODE && 
              (node as Element).querySelector?.('.auto-play')
            )) {
            shouldRecreate = true
            break
          }
        }
      }
      
      if (shouldRecreate) {
        setTimeout(() => {
          createRandomPlayUI()
          
          // 恢复之前的状态
          if (isRandomPlayEnabled) {
            const switchBtn = document.querySelector('.random-play-btn .switch-btn') as HTMLElement
            const switchBlock = document.querySelector('.random-play-btn .switch-block') as HTMLElement
            const randomPlayBtn = document.querySelector('.random-play-btn') as HTMLElement
            
            if (switchBtn && switchBlock && randomPlayBtn) {
              switchBtn.style.backgroundColor = '#00aeec'
              switchBlock.style.transform = 'translateX(16px)'
              randomPlayBtn.style.color = '#00aeec'
            }
          }
        }, 100)
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

// 初始化随机播放功能
function initRandomPlay(): void {
  if (isVideoPage()) {
    initRandomPlayOnVideoPage()
  }

  observePageChanges()
}

if (window.customElements && isSupportedPage()) {
  const { define: originalDefine } = window.customElements
  window.customElements.define = new Proxy(originalDefine, {
    apply: (target, thisArg, args) => {
      const [name, classConstructor] = args
      if (typeof classConstructor !== 'function' || name !== 'bili-comment-action-buttons-renderer') {
        return Reflect.apply(target, thisArg, args)
      }

      const originalUpdate = classConstructor.prototype.update
      classConstructor.prototype.update = function (...updateArgs) {
        const result = originalUpdate.apply(this, updateArgs)
        const pubDateEl = this.shadowRoot?.querySelector('#pubdate')
        if (!pubDateEl)
          return result

        let locationEl = this.shadowRoot?.querySelector('#location')
        const locationString = getLocationString(this.data)

        // 根据设置决定是否显示IP
        if (!currentSettings?.showIPLocation || !locationString) {
          if (locationEl)
            locationEl.remove()
          return result
        }

        if (locationEl) {
          locationEl.textContent = locationString
          return result
        }

        locationEl = document.createElement('div')
        locationEl.id = 'location'
        locationEl.textContent = locationString
        pubDateEl.insertAdjacentElement('afterend', locationEl)
        return result
      }
      return Reflect.apply(target, thisArg, args)
    },
  })
}

// 添加消息监听器
window.addEventListener('message', (event) => {
  // 确保消息来源是插件环境
  if (event.source !== window)
    return

  const { type, data } = event.data

  // 处理来自插件环境的消息
  if (type === 'BEWLY_SETTINGS_UPDATE') {
    // 更新设置
    if (data) {
      currentSettings = data

      // 如果设置更新了，重新检查随机播放状态
      if (isVideoPage() && currentSettings.enableRandomPlay !== undefined) {
        // 延迟一点时间，确保设置已经更新
        setTimeout(() => {
          if (!isRandomPlayInitialized) {
            initRandomPlayOnVideoPage()
          }
        }, 100)
      }
    }
  }
})

// 请求初始设置
window.postMessage({
  type: 'BEWLY_REQUEST_SETTINGS',
}, '*')

// 页面加载完成后初始化随机播放
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initRandomPlay, 1000)
  })
}
else {
  setTimeout(initRandomPlay, 1000)
}
