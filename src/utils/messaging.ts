import browser from 'webextension-polyfill'

import type { ApiPortResponse } from '~/constants/apiRequest'
import { API_REQUEST_PORT } from '~/constants/apiRequest'
import { waitWithSignal } from '~/utils/abort'
import { markBackgroundConnectionHealthy, promptPageRefreshFromContentScript } from '~/utils/refreshPrompt'

export interface Message<T = any> {
  type: string
  data: T
}

export type MessageHandler<T = any, R = any> = (
  data: T,
  sender?: browser.Runtime.MessageSender,
) => R | Promise<R>

const TRANSIENT_BACKGROUND_MESSAGE_ATTEMPTS = 3

function getErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).toLowerCase()
}

export function isExtensionContextInvalidatedError(error: unknown): boolean {
  return getErrorMessage(error).includes('extension context invalidated')
}

export function isBackgroundDisconnectedError(error: unknown): boolean {
  const message = getErrorMessage(error)
  return message.includes('could not establish connection')
    || message.includes('receiving end does not exist')
}

export function isBackgroundUnavailableError(error: unknown): boolean {
  return isExtensionContextInvalidatedError(error) || isBackgroundDisconnectedError(error)
}

function waitForRetry(delay: number) {
  return new Promise<void>(resolve => setTimeout(resolve, delay))
}

/**
 * 从 content script 发送消息到 background
 */
export async function sendMessage<T = any, R = any>(type: string, data?: T): Promise<R> {
  const message: Message<T> = { type, data: data as T }
  let lastError: unknown

  for (let attempt = 0; attempt < TRANSIENT_BACKGROUND_MESSAGE_ATTEMPTS; attempt++) {
    try {
      const response = await browser.runtime.sendMessage(message) as R
      markBackgroundConnectionHealthy()
      return response
    }
    catch (error) {
      lastError = error
      if (isExtensionContextInvalidatedError(error)) {
        promptPageRefreshFromContentScript('context-invalidated', attempt + 1)
        throw error
      }
      if (!isBackgroundDisconnectedError(error) || attempt === TRANSIENT_BACKGROUND_MESSAGE_ATTEMPTS - 1)
        break
      await waitForRetry(100 * 2 ** attempt)
    }
  }

  if (isBackgroundDisconnectedError(lastError))
    promptPageRefreshFromContentScript('background-unreachable', TRANSIENT_BACKGROUND_MESSAGE_ATTEMPTS)

  throw lastError
}

/** 每个可取消的读取独占一个 Port；关闭 Port 会取消后台请求，也覆盖页面卸载。 */
export async function sendAbortableApiMessage(type: string, data: unknown, signal: AbortSignal): Promise<any> {
  for (let attempt = 0; attempt < TRANSIENT_BACKGROUND_MESSAGE_ATTEMPTS; attempt++) {
    signal.throwIfAborted()
    try {
      return await sendApiPortMessage(type, data, signal)
    }
    catch (error) {
      signal.throwIfAborted()
      if (isExtensionContextInvalidatedError(error)) {
        promptPageRefreshFromContentScript('context-invalidated', attempt + 1)
        throw error
      }
      if (!isBackgroundDisconnectedError(error))
        throw error
      if (attempt === TRANSIENT_BACKGROUND_MESSAGE_ATTEMPTS - 1) {
        promptPageRefreshFromContentScript('background-unreachable', TRANSIENT_BACKGROUND_MESSAGE_ATTEMPTS)
        throw error
      }
      await waitWithSignal(waitForRetry(100 * 2 ** attempt), signal)
    }
  }
}

function sendApiPortMessage(type: string, data: unknown, signal: AbortSignal): Promise<any> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const port = browser.runtime.connect({ name: API_REQUEST_PORT })
    let settled = false

    function finish(error: unknown, value?: unknown) {
      if (settled)
        return
      settled = true
      signal.removeEventListener('abort', onAbort)
      port.onMessage.removeListener(onResponse)
      port.onDisconnect.removeListener(onDisconnect)
      try {
        port.disconnect()
      }
      catch {
        // 扩展重载时 Port 可能已经失效，仍需结算当前调用。
      }
      if (error)
        reject(error)
      else
        resolve(value)
    }

    function onAbort() {
      finish(signal.reason ?? new DOMException('Request aborted', 'AbortError'))
    }

    function onResponse(message: unknown) {
      const response = message as ApiPortResponse
      if (!response || typeof response.ok !== 'boolean'
        || (!response.ok && typeof response.error?.message !== 'string')) {
        finish(new TypeError('Invalid API response'))
        return
      }
      markBackgroundConnectionHealthy()
      if (response.ok)
        finish(undefined, response.data)
      else
        finish(Object.assign(new Error(response.error.message), response.error))
    }

    function onDisconnect() {
      finish(new Error(port.error?.message || browser.runtime.lastError?.message || 'Could not establish connection to the API request handler'))
    }

    port.onMessage.addListener(onResponse)
    port.onDisconnect.addListener(onDisconnect)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
    }
    else {
      try {
        port.postMessage({ type, data })
      }
      catch (error) {
        finish(error)
      }
    }
  })
}

/**
 * 在 background 中监听来自 content script 的消息
 */
export function onMessage<T = any, R = any>(
  type: string,
  handler: MessageHandler<T, R>,
): void {
  browser.runtime.onMessage.addListener((message: any, sender: browser.Runtime.MessageSender) => {
    if (message?.type === type) {
      const result = handler(message.data, sender)
      // 如果返回 Promise，需要返回 true 表示异步响应
      if (result instanceof Promise) {
        return result
      }
      return Promise.resolve(result)
    }
    // 返回 false 或 undefined 表示不处理此消息
    return false
  })
}
