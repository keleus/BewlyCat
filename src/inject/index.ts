// 由于是浏览器环境，所以引入的ts不能使用webextension-polyfill相关api，包含获取本地Storage，获取的是网页的localStorage
import type { Settings } from '~/logic/storage'

// 存储当前设置状态
let currentSettings: Settings

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
    }
  }
})

// 请求初始设置
window.postMessage({
  type: 'BEWLY_REQUEST_SETTINGS',
}, '*')
