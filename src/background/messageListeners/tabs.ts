import type { Tabs } from 'webextension-polyfill'
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

async function handleMessage(data: Message, sender?: browser.Runtime.MessageSender) {
  if (data.contentScriptQuery === TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND) {
    // 处理以 // 开头的 URL
    const url = data.url?.startsWith('//') ? `https:${data.url}` : data.url
    let windowId = sender?.tab?.windowId
    let index = sender?.tab?.index

    if (windowId === undefined || index === undefined) {
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
      windowId ??= activeTab?.windowId
      index ??= activeTab?.index
    }

    const createProps: Tabs.CreateCreatePropertiesType = {
      url,
      active: false,
    }

    if (windowId !== undefined) {
      createProps.windowId = windowId
    }

    if (index !== undefined) {
      createProps.index = index + 1
    }

    return browser.tabs.create(createProps)
  }
}

export function setupTabMsgListeners() {
  onMessage(TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND, handleMessage)
}
