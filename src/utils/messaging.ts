import browser from 'webextension-polyfill'

export interface Message<T = any> {
  type: string
  data: T
}

export type MessageHandler<T = any, R = any> = (
  data: T,
  sender?: browser.Runtime.MessageSender,
) => R | Promise<R>

/**
 * 从 content script 发送消息到 background
 */
export async function sendMessage<T = any, R = any>(type: string, data?: T): Promise<R> {
  const message: Message<T> = { type, data: data as T }
  return browser.runtime.sendMessage(message)
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
