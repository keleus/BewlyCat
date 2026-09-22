import browser from 'webextension-polyfill'

import type { ApiPortResponse } from '~/constants/apiRequest'
import { API_REQUEST_PORT } from '~/constants/apiRequest'
import { onMessage } from '~/utils/messaging'

import { apiListenerFactory } from '../../utils'
import API_ANIME from './anime'
import API_AUTH from './auth'
import API_FAVORITE from './favorite'
import API_HISTORY from './history'
import API_LIVE from './live'
import API_MOMENT from './moment'
import API_NOTIFICATION from './notification'
import API_RANKING from './ranking'
import API_SEARCH from './search'
import API_USER from './user'
import API_VIDEO from './video'
import API_WATCHLATER from './watchLater'

export const API_COLLECTION = {
  AUTH: API_AUTH,
  ANIME: API_ANIME,
  HISTORY: API_HISTORY,
  FAVORITE: API_FAVORITE,
  MOMENT: API_MOMENT,
  NOTIFICATION: API_NOTIFICATION,
  RANKING: API_RANKING,
  SEARCH: API_SEARCH,
  USER: API_USER,
  VIDEO: API_VIDEO,
  WATCHLATER: API_WATCHLATER,
  LIVE: API_LIVE,

  [Symbol.iterator]() {
    return Object.values(this).values()
  },
}

// Merge all API objects into one
const FullAPI = Object.assign({}, ...API_COLLECTION)
// Create a message listener for each API
const handleMessage = apiListenerFactory(FullAPI)

export function setupApiMsgListeners() {
  // 为每个API设置webext-bridge消息监听器
  Object.keys(FullAPI).forEach((apiName) => {
    onMessage(apiName, handleMessage)
  })

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== API_REQUEST_PORT)
      return

    const controller = new AbortController()
    let connected = true
    const onDisconnect = () => {
      connected = false
      controller.abort()
      port.onMessage.removeListener(onRequest)
      port.onDisconnect.removeListener(onDisconnect)
    }
    const respond = (response: ApiPortResponse) => {
      if (!connected)
        return
      try {
        port.postMessage(response)
      }
      catch {
        onDisconnect()
      }
    }
    function onRequest(message: any) {
      port.onMessage.removeListener(onRequest)
      const definition = Object.hasOwn(FullAPI, message?.type ?? '') ? FullAPI[message.type] : undefined
      // Port 取消只开放给读取，写操作继续走原有消息通道。
      if (!definition || typeof definition === 'function' || definition._fetch.method.toLowerCase() !== 'get'
        || message.data?.contentScriptQuery !== message.type) {
        respond({ ok: false, error: { name: 'TypeError', message: 'Invalid cancellable API request' } })
        return
      }

      void handleMessage(message.data, port.sender, controller.signal).then(
        data => respond({ ok: true, data }),
        error => respond({
          ok: false,
          error: {
            name: error?.name || 'Error',
            message: error?.message || String(error),
            code: error?.code,
            isRiskControl: error?.isRiskControl,
          },
        }),
      ).catch(() => {
        // 页面可能在结果发送时关闭。
        onDisconnect()
      })
    }
    port.onDisconnect.addListener(onDisconnect)
    port.onMessage.addListener(onRequest)
  })
}
