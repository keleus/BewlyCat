// 对于fetch的常见后处理
// 1. 直接返回data
// 2. json化后返回data

import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { addWbiSign, getWbiKeys, initWbiKeys, needsWbiSign, storeWbiKeys } from './wbiSign'

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

async function doRequest(message: Message, api: API, sendResponse?: (response?: any) => void, cookies?: Browser.Cookies.Cookie[]) {
  try {
    let { contentScriptQuery, ...rest } = message
    // rest above two part body or params
    rest = rest || {}

    let { _fetch, url, params = {}, afterHandle } = api
    const { method, headers = {}, body } = _fetch as _FETCH
    const isGET = method.toLocaleLowerCase() === 'get'
    // merge params and body
    const targetParams = Object.assign({}, params)
    const targetBody = Object.assign({}, body)
    Object.keys(rest).forEach((key) => {
      if (body && body[key] !== undefined)
        targetBody[key] = rest[key]
      else
        targetParams[key] = rest[key]
    })

    const baseUrl = url
    const needsWbi = needsWbiSign(url)

    // 如果需要WBI签名但没有密钥，主动获取密钥
    if (needsWbi && !getWbiKeys()) {
      try {
        await initWbiKeys()
      }
      catch (error) {
        // 获取密钥失败，继续执行（降级到无签名请求）
        console.error('[doRequest] Failed to fetch WBI keys:', error)
      }
    }

    // 内部函数：执行实际请求
    const performRequest = (useWbi: boolean) => {
      let requestUrl = baseUrl
      let requestParams = Object.assign({}, targetParams)

      // 为需要WBI签名的API添加签名
      if (needsWbi && useWbi) {
        requestParams = addWbiSign(requestParams)
      }
      // generate params
      if (Object.keys(requestParams).length) {
        const urlParams = new URLSearchParams()
        for (const key in requestParams) {
          const value = requestParams[key]
          // 过滤空值参数：undefined、null、空字符串
          // 保留数字 0 和布尔值 false
          if (value !== undefined && value !== null && value !== '') {
            urlParams.append(key, value)
          }
        }
        requestUrl += `?${urlParams.toString()}`
      }

      // generate body
      let requestBody = targetBody
      if (!isGET) {
        requestBody = (headers && headers['Content-Type'] && headers['Content-Type'].includes('application/x-www-form-urlencoded'))
          ? new URLSearchParams(targetBody)
          : JSON.stringify(targetBody)
      }

      // generate cookies
      const requestHeaders = { ...headers }
      if (cookies) {
        const cookieStr = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
        requestHeaders['firefox-multi-account-cookie'] = cookieStr
      }

      // get cant take body
      const fetchOpt: any = { method, headers: requestHeaders }
      if (!isGET)
        fetchOpt.body = requestBody

      return fetch(requestUrl, fetchOpt)
    }

    // 标记是否已经尝试过无 WBI 重试
    let hasTriedWithoutWbi = false

    // 执行完整请求流程的函数（包括响应处理）
    const executeFullRequest = async (useWbi: boolean) => {
      let response = await performRequest(useWbi)

      // 如果是获取用户信息的API，在响应后存储WBI密钥
      if (baseUrl.includes('https://api.bilibili.com/x/web-interface/nav')) {
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
        catch {
          // 忽略错误
        }
      }

      // 执行 afterHandle 处理
      for (const func of afterHandle) {
        if (func.name === sendResponseHandler.name && sendResponse) {
          response = await sendResponseHandler(sendResponse)(response as any)
        }
        else {
          response = await func(response as any)
        }
      }

      return response
    }

    // 执行请求的包装函数，支持 WBI 降级重试
    const executeRequestWithRetry = async () => {
      try {
        // 首次请求（使用 WBI 签名，如果需要）
        return await executeFullRequest(true)
      }
      catch (error) {
        // 如果使用了 WBI 签名且失败，尝试不带 WBI 签名重试
        if (needsWbi && !hasTriedWithoutWbi) {
          hasTriedWithoutWbi = true
          return await executeFullRequest(false)
        }
        throw error
      }
    }

    url = baseUrl + (Object.keys(targetParams).length ? '?...' : '')

    // 执行请求并进行统一错误处理
    return executeRequestWithRetry().catch((error) => {
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
  }
  catch (e) {
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
