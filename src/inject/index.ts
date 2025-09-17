// 由于是浏览器环境，所以引入的ts不能使用webextension-polyfill相关api，包含获取本地Storage，获取的是网页的localStorage
import type { Settings } from '~/logic/storage'

// 存储当前设置状态
let currentSettings: Settings

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

  element.textContent = String(text)
  return element
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
      if (typeof classConstructor !== 'function' || name !== 'bili-comment-action-buttons-renderer') {
        return Reflect.apply(target, thisArg, args)
      }

      const originalUpdate = classConstructor.prototype.update
      classConstructor.prototype.update = function (...updateArgs: any[]) {
        const result = originalUpdate.apply(this, updateArgs)
        const root = this.shadowRoot
        const pubDateEl = root?.querySelector('#pubdate')
        if (!pubDateEl)
          return result

        const locationString = getLocationString(this.data)
        const shouldShowLocation = Boolean(currentSettings?.showIPLocation && locationString)
        const locationEl = updateInfoElement(root, 'location', shouldShowLocation, locationString, pubDateEl)

        const sexString = getSexString(this.data)
        const shouldShowSex = Boolean(currentSettings?.showSex && sexString)
        const sexAnchor = locationEl ?? pubDateEl
        updateInfoElement(root, 'sex', shouldShowSex, sexString, sexAnchor)
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

// 页面加载完成后初始化随机播放（功能已迁移到contentScripts）
