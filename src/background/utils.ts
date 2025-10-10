// 对于fetch的常见后处理
// 1. 直接返回data
// 2. json化后返回data

import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { addWbiSign, needsWbiSign, storeWbiKeys } from './wbiSign'

export class ApiRiskControlError extends Error {
  constructor(message: string = '检测到风控页面，API返回了HTML而不是JSON') {
    super(message)
    this.name = 'ApiRiskControlError'
  }
}

type FetchAfterHandler = ((data: Response) => Promise<any>) | ((data: any) => any)

async function toJsonHandler(data: Response): Promise<any> {
  const contentType = data.headers.get('content-type')

  // 检测是否返回了HTML（风控页面）
  if (contentType && contentType.includes('text/html')) {
    throw new ApiRiskControlError()
  }

  try {
    return await data.json()
  }
  catch (error) {
    // 如果JSON解析失败，可能也是风控页面
    const text = await data.clone().text()
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new ApiRiskControlError()
    }
    throw error
  }
}
function toData(data: Promise<any>): Promise<any> {
  return data
}

// if need sendResponse, use this
// return a FetchAfterHandler function
function sendResponseHandler(sendResponse: (response?: any) => void) {
  return (data: any) => {
    sendResponse(data)
    return data
  }
}

// 定义后处理流
const AHS: {
  J_D: FetchAfterHandler[]
  J_S: FetchAfterHandler[]
  S: FetchAfterHandler[]
} = {
  J_D: [toJsonHandler, toData],
  J_S: [toJsonHandler, sendResponseHandler],
  S: [sendResponseHandler],
}

interface Message {
  contentScriptQuery: string
  [key: string]: any
}

interface _FETCH {
  method: string
  headers?: {
    [key: string]: any
  }
  body?: any
}

interface API {
  url: string
  _fetch: _FETCH
  params?: {
    [key: string]: any
  }
  afterHandle: ((response: Response) => Response | Promise<Response>)[]
}
// 重载API 可以为函数
type APIFunction = (message: Message, sender?: any, sendResponse?: (response?: any) => void) => any
export type APIType = API | APIFunction
interface APIMAP {
  [key: string]: APIType
}
// 工厂函数API_LISTENER_FACTORY
function apiListenerFactory(API_MAP: APIMAP) {
  return async (data: any, sender?: Browser.Runtime.MessageSender) => {
    const typedMessage = data as Message
    const contentScriptQuery = typedMessage.contentScriptQuery
    // 检测是否有contentScriptQuery
    if (!contentScriptQuery || !API_MAP[contentScriptQuery])
      return console.error(`Cannot find this contentScriptQuery: ${contentScriptQuery}`)
    if (typeof API_MAP[contentScriptQuery] === 'function')
      return (API_MAP[contentScriptQuery] as APIFunction)(typedMessage, sender)

    const api = API_MAP[contentScriptQuery] as API

    // eslint-disable-next-line node/prefer-global/process
    if (process.env.FIREFOX && sender && sender.tab?.id) {
      // 获取tab信息以获取正确的cookieStoreId
      const tab = await browser.tabs.get(sender.tab.id)
      const storeId = tab.cookieStoreId || 'default'
      const cookies = await browser.cookies.getAll({ storeId })
      return await doRequest(typedMessage, api, undefined, cookies)
    }

    return await doRequest(typedMessage, api)
  }
}

function doRequest(message: Message, api: API, sendResponse?: (response?: any) => void, cookies?: Browser.Cookies.Cookie[]) {
  try {
    let { contentScriptQuery, ...rest } = message
    // rest above two part body or params
    rest = rest || {}

    let { _fetch, url, params = {}, afterHandle } = api
    const { method, headers = {}, body } = _fetch as _FETCH
    const isGET = method.toLocaleLowerCase() === 'get'
    // merge params and body
    let targetParams = Object.assign({}, params)
    let targetBody = Object.assign({}, body)
    Object.keys(rest).forEach((key) => {
      if (body && body[key] !== undefined)
        targetBody[key] = rest[key]
      else
        targetParams[key] = rest[key]
    })

    // 为需要WBI签名的API添加签名
    if (needsWbiSign(url)) {
      targetParams = addWbiSign(targetParams)
    }

    // generate params
    if (Object.keys(targetParams).length) {
      const urlParams = new URLSearchParams()
      for (const key in targetParams) {
        if (targetParams[key])
          urlParams.append(key, targetParams[key])
      }
      url += `?${urlParams.toString()}`
    }
    // generate body
    if (!isGET) {
      targetBody = (headers && headers['Content-Type'] && headers['Content-Type'].includes('application/x-www-form-urlencoded'))
        ? new URLSearchParams(targetBody)
        : JSON.stringify(targetBody)
    }
    // generate cookies
    if (cookies) {
      const cookieStr = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
      headers['firefox-multi-account-cookie'] = cookieStr
    }
    // get cant take body
    const fetchOpt = { method, headers }
    if (!isGET)
      Object.assign(fetchOpt, { body: targetBody })
    // fetch and after handle
    let baseFunc = fetch(url, {
      ...fetchOpt,
    })

    // 如果是获取用户信息的API，在响应后存储WBI密钥
    if (url.includes('https://api.bilibili.com/x/web-interface/nav')) {
      baseFunc = baseFunc.then(async (response) => {
        const clonedResponse = response.clone()
        try {
          const data = await clonedResponse.json()
          if (data.code === 0 && data.data && data.data.wbi_img) {
            const { img_url, sub_url } = data.data.wbi_img
            if (img_url && sub_url) {
              storeWbiKeys(img_url, sub_url)
            }
          }
        }
        catch (error) {
          console.error('解析用户信息响应失败:', error)
        }
        return response
      })
    }

    afterHandle.forEach((func) => {
      if (func.name === sendResponseHandler.name && sendResponse)
        // sendResponseHandler 是一个特殊的后处理函数，需要传入sendResponse
        baseFunc = baseFunc.then(sendResponseHandler(sendResponse))
      else
        baseFunc = baseFunc.then(func)
    })

    // 统一错误处理
    baseFunc = baseFunc.catch((error) => {
      console.error('API请求失败:', error)
      if (error instanceof ApiRiskControlError) {
        // 返回统一的风控错误格式
        const riskError = new Error(error.message)
        Object.assign(riskError, {
          code: -412,
          isRiskControl: true,
        })
        throw riskError
      }
      // 其他错误也返回统一格式
      const apiError = new Error(error.message || '请求失败')
      Object.assign(apiError, {
        code: -1,
        originalError: error.toString(),
      })
      throw apiError
    })

    return baseFunc
  }
  catch (e) {
    console.error('API请求初始化失败:', e)
    const initError = new Error(e instanceof Error ? e.message : '请求初始化失败')
    Object.assign(initError, {
      code: -1,
      originalError: e instanceof Error ? e.toString() : String(e),
    })
    return Promise.reject(initError)
  }
}

export {
  type _FETCH,
  AHS,
  type API,
  apiListenerFactory,
  type APIMAP,
  type FetchAfterHandler,
  type Message,
  sendResponseHandler,
  toData,
  toJsonHandler,
}
