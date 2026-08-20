import browser from 'webextension-polyfill'

import { promptPageRefreshFromContentScript } from '~/utils/refreshPrompt'

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
      return await browser.runtime.sendMessage(message)
    }
    catch (error) {
      lastError = error
      if (isExtensionContextInvalidatedError(error)) {
        promptPageRefreshFromContentScript()
        throw error
      }
      if (!isBackgroundDisconnectedError(error) || attempt === TRANSIENT_BACKGROUND_MESSAGE_ATTEMPTS - 1)
        break
      await waitForRetry(100 * 2 ** attempt)
    }
  }

  if (isBackgroundDisconnectedError(lastError))
    promptPageRefreshFromContentScript()

  throw lastError
}

/**
 * 在 background 中监听来自 content script 的消息
 */
export function onMessage<T = any, R = any>(
  type: string,
  handler: MessageHandler<T, R>,
): void {
  browser.runtime.onMessage.addListener((message: any, sender) => {
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
