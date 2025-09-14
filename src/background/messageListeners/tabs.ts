import { onMessage } from 'webext-bridge/background'
import browser from 'webextension-polyfill'

interface Message {
  contentScriptQuery: string
  [key: string]: any
}

export enum TABS_MESSAGE {
  OPEN_LINK_IN_BACKGROUND = 'openLinkInBackground',
}

function handleMessage(message: { data: any }) {
  const typedMessage = message.data as Message
  if (typedMessage.contentScriptQuery === TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND) {
    // 处理以 // 开头的 URL
    const url = typedMessage.url.startsWith('//') ? `https:${typedMessage.url}` : typedMessage.url
    return browser.tabs.create({ url, active: false })
  }
}

export function setupTabMsgListeners() {
  onMessage(TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND, handleMessage)
}
