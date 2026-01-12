// 由于是浏览器环境，所以引入的ts不能使用webextension-polyfill相关api，包含获取本地Storage，获取的是网页的localStorage
import type { Settings } from '~/logic/storage'

// 存储当前设置状态
let currentSettings: Settings | null = null
let settingsReady = false

// 投票卡片暗色模式样式
const VOTE_CARD_DARK_STYLES = `
  /* 投票卡片暗色模式样式 - BewlyCat */
  #card {
    background-color: rgba(255, 255, 255, 0.06) !important;
    border-color: rgba(255, 255, 255, 0.1) !important;
  }
  #title {
    color: rgba(255, 255, 255, 0.9) !important;
  }
  #title span {
    color: rgba(255, 255, 255, 0.9) !important;
  }
  #desc, #count {
    color: rgba(255, 255, 255, 0.6) !important;
  }
  .option-desc {
    color: rgba(255, 255, 255, 0.9) !important;
  }
  .option-info {
    color: rgba(255, 255, 255, 0.9) !important;
  }
  .option {
    color: rgba(255, 255, 255, 0.9) !important;
  }
  .option-skew {
    background-color: rgba(255, 255, 255, 0.1) !important;
  }
  bili-icon {
    color: rgba(255, 255, 255, 0.7) !important;
  }
`

// 之前inject.js的内容
const isArray = (val: any): boolean => Array.isArray(val)
function injectFunction(
  origin: any,
  keys: string | string[],
  cb: (...args: any[]) => void,
) {
  let keysArray: string[]
  if (!isArray(keys)) {
    keysArray = [keys as string]
  }
  else {
    keysArray = keys as string[]
  }

  const originKeysValue = keysArray.reduce((obj: any, key: string) => {
    obj[key] = origin[key]
    return obj
  }, {})

  keysArray.map((k: string) => origin[k])

  keysArray.forEach((key: string) => {
    const fn = (...args: any[]) => {
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
  (...args: any[]) => {
    window.dispatchEvent(new CustomEvent('pushstate', { detail: args }))
  },
)

// 获取IP地理位置字符串
function getLocationString(replyItem: any) {
  const location = replyItem?.reply_control?.location
  if (typeof location !== 'string')
    return location

  return location.replace(/^IP属地[：: ]*/u, '')
}

function getSexString(replyItem: any) {
  return replyItem?.member?.sex
}

function updateInfoElement(
  root: ShadowRoot | null | undefined,
  id: string,
  shouldShow: boolean,
  text: any,
  anchor: Element | null | undefined,
): HTMLElement | null {
  if (!root)
    return null

  let element = root.querySelector<HTMLElement>(`#${id}`)

  if (!shouldShow || !anchor) {
    if (element)
      element.remove()
    return null
  }

  if (!element) {
    element = document.createElement('div')
    element.id = id
    anchor.insertAdjacentElement('afterend', element)
  }

  // 如果是性别元素，使用纯色图标显示
  if (id === 'sex') {
    element.style.cssText = 'display: inline-flex; align-items: center; margin-left: 4px; vertical-align: middle;'
    element.innerHTML = ''

    // 根据性别显示不同的图标
    if (text === '男') {
      element.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="#00a1d6" style="display: block;"><path d="M20 4v6h-2V7.425l-3.975 3.95q.475.7.725 1.488T15 14.5q0 2.3-1.6 3.9T9.5 20q-2.3 0-3.9-1.6T4 14.5q0-2.3 1.6-3.9T9.5 9q.825 0 1.625.237t1.475.738L16.575 6H14V4zM9.5 11q-1.45 0-2.475 1.025T6 14.5q0 1.45 1.025 2.475T9.5 18q1.45 0 2.475-1.025T13 14.5q0-1.45-1.025-2.475T9.5 11"/></svg>'
    }
    else if (text === '女') {
      element.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="#fb7299" style="display: block;"><path d="M11 21v-2H9v-2h2v-2.1q-1.975-.35-3.238-1.888T6.5 9.45q0-2.275 1.613-3.862T12 4t3.888 1.588T17.5 9.45q0 2.025-1.263 3.563T13 14.9V17h2v2h-2v2zm1-8q1.45 0 2.475-1.025T15.5 9.5q0-1.45-1.025-2.475T12 6q-1.45 0-2.475 1.025T8.5 9.5q0 1.45 1.025 2.475T12 13"/></svg>'
    }
    else {
      // 保密不显示
      element.remove()
      return null
    }
  }
  // 如果是IP地理位置元素，使用Tag样式显示
  else if (id === 'location') {
    element.style.cssText = `display: inline-block; margin-left: 4px; padding: 1px 4px; font-size: 11px; color: var(--bew-ip-tag-text); background-color: var(--bew-ip-tag-bg); border-radius: 3px; vertical-align: middle; line-height: 1.4;`
    element.textContent = String(text)
  }
  else {
    element.textContent = String(text)
  }

  return element
}

// 投票卡片样式同步辅助函数
function syncVoteCardStyle(root: ShadowRoot | null | undefined, isDark: boolean) {
  if (!root)
    return

  const darkStyleEl = root.querySelector('#bewly-vote-card-dark-style') as HTMLStyleElement
  if (isDark) {
    if (!darkStyleEl) {
      const style = document.createElement('style')
      style.id = 'bewly-vote-card-dark-style'
      style.textContent = VOTE_CARD_DARK_STYLES
      root.appendChild(style)
    }
  }
  else if (darkStyleEl) {
    darkStyleEl.remove()
  }
}

// 判断当前页面URL是否支持IP显示
function isSupportedPage(): boolean {
  const currentUrl = window.location.href
  return (
    // 视频页面
    /https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/.*/.test(currentUrl)
    // 视频分享页短链路径
    || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/s\/video\/.*/.test(currentUrl)
    // 番剧页面
    || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/bangumi\/play\/.*/.test(currentUrl)
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
    || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/cheese\/play\/.*/.test(currentUrl)
    // 稍后再看列表页（两种路径）
    || /https?:\/\/(?:www\.)?bilibili\.com\/watchlater\/(?:#\/)?list.*/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/watchlater(?:\?.*|\/.*)?$/.test(currentUrl)
    // 收藏夹与媒体列表
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/ml.*/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/medialist\/(?:play|detail)\/.*/.test(currentUrl)
    // 活动页面
    || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/blackboard\/.*/.test(currentUrl)
    // 拜年祭页面
    || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/festival\/.*/.test(currentUrl)
    // 漫画页面
    || /https?:\/\/manga\.bilibili\.com\/detail\/.*/.test(currentUrl)
  )
}

if (window.customElements && isSupportedPage()) {
  const { define: originalDefine } = window.customElements
  window.customElements.define = new Proxy(originalDefine, {
    apply: (target, thisArg, args) => {
      const [name, classConstructor] = args
      if (typeof classConstructor !== 'function') {
        return Reflect.apply(target, thisArg, args)
      }

      // 处理评论区图片组件
      if (name === 'bili-comment-pictures-renderer') {
        const originalUpdate = classConstructor.prototype.update
        classConstructor.prototype.update = function (...updateArgs: any[]) {
          const result = originalUpdate.apply(this, updateArgs)
          const root = this.shadowRoot
          if (!root)
            return result

          // 根据设置决定是否修复图片长宽比问题
          if (currentSettings?.adjustCommentImageHeight) {
            // 非1:1图片（非flex布局）保持宽度，高度按实际比例自适应
            const content = root.querySelector('#content')
            if (content && !content.classList.contains('flex')) {
              const images = content.querySelectorAll('img')
              images.forEach((img: HTMLImageElement) => {
                // 移除固定的 height 属性，让图片按实际比例显示
                img.removeAttribute('height')
                img.style.height = 'auto'
              })
            }
          }

          return result
        }
        return Reflect.apply(target, thisArg, args)
      }

      // 处理评论用户信息组件
      if (name === 'bili-comment-user-info') {
        const originalUpdate = classConstructor.prototype.update
        classConstructor.prototype.update = function (...updateArgs: any[]) {
          const result = originalUpdate.apply(this, updateArgs)
          const root = this.shadowRoot
          if (!root)
            return result

          // 找到用户名元素
          const userNameEl = root.querySelector('#user-name')
          if (userNameEl) {
            // 显示性别
            const sexString = getSexString(this.data)
            const shouldShowSex = Boolean(currentSettings?.showSex && sexString)
            const sexEl = updateInfoElement(root, 'sex', shouldShowSex, sexString, userNameEl)

            // 显示IP地理位置
            const locationString = getLocationString(this.data)
            const shouldShowLocation = Boolean(currentSettings?.showIPLocation && locationString)
            const locationAnchor = sexEl ?? userNameEl
            updateInfoElement(root, 'location', shouldShowLocation, locationString, locationAnchor)
          }

          return result
        }
        return Reflect.apply(target, thisArg, args)
      }

      // 处理评论操作按钮组件
      if (name === 'bili-comment-action-buttons-renderer') {
        const originalUpdate = classConstructor.prototype.update
        classConstructor.prototype.update = function (...updateArgs: any[]) {
          const result = originalUpdate.apply(this, updateArgs)
          return result
        }
        return Reflect.apply(target, thisArg, args)
      }

      // 处理投票卡片组件 - 暗色模式适配
      // https://github.com/BewlyBewly/BewlyBewly/issues/998
      if (name === 'bili-comments-vote-card') {
        const originalUpdate = classConstructor.prototype.update
        classConstructor.prototype.update = function (...updateArgs: any[]) {
          const result = originalUpdate.apply(this, updateArgs)
          const root = this.shadowRoot
          if (!root)
            return result

          // 同步投票卡片暗色模式样式
          const isDark = document.documentElement.classList.contains('dark')
          syncVoteCardStyle(root, isDark)

          return result
        }
        return Reflect.apply(target, thisArg, args)
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
      const isFirstTime = !settingsReady
      currentSettings = data
      settingsReady = true

      // 只在首次启用时输出日志
      if (isFirstTime && data.enableVolumeNormalization) {
        console.log('[AudioInterceptor] 音量均衡已启用')
      }
    }
  }
})

// 请求初始设置
window.postMessage({
  type: 'BEWLY_REQUEST_SETTINGS',
}, '*')

// 投票卡片暗色模式样式更新函数
function updateVoteCardDarkStyles(isDark: boolean) {
  // 查找所有投票卡片元素并同步样式
  const voteCards = document.querySelectorAll('bili-comments-vote-card')
  voteCards.forEach((card) => {
    syncVoteCardStyle((card as any).shadowRoot, isDark)
  })
}

// 监听主题变化事件
window.addEventListener('global.themeChange', ((event: CustomEvent) => {
  const isDark = event.detail === 'dark'
  updateVoteCardDarkStyles(isDark)
}) as EventListener)

// 页面加载完成后初始化投票卡片样式
document.addEventListener('DOMContentLoaded', () => {
  const isDark = document.documentElement.classList.contains('dark')
  if (isDark) {
    // 延迟执行，确保投票卡片已渲染
    setTimeout(() => {
      updateVoteCardDarkStyles(true)
    }, 1000)
  }
})

// 页面加载完成后初始化随机播放（功能已迁移到contentScripts）
