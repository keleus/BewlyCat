import browser from 'webextension-polyfill'

import { onMessage } from '~/utils/messaging'

interface Message {
  contentScriptQuery: string
  url?: string
  [key: string]: any
}

export enum TABS_MESSAGE {
  OPEN_LINK_IN_BACKGROUND = 'openLinkInBackground',
}

function handleMessage(data: Message) {
  if (data.contentScriptQuery === TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND) {
    // 处理以 // 开头的 URL
    const url = data.url?.startsWith('//') ? `https:${data.url}` : data.url
    return browser.tabs.create({ url, active: false })
  }
}

export function setupTabMsgListeners() {
  onMessage(TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND, handleMessage)
}
