import type { Tabs } from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import type { SettingsNavigationTarget } from '~/composables/useAppProvider'
import { onMessage } from '~/utils/messaging'
import type { BilibiliTabRequest, SettingsPageTabLocation } from '~/utils/settingsPage'
import {
  BILIBILI_TAB_REQUEST_MESSAGE,
  buildSettingsPageHash,
  NAVIGATE_SETTINGS_PAGE_MESSAGE,
  OPEN_SETTINGS_PAGE_MESSAGE,
  SETTINGS_PAGE_PATH,
} from '~/utils/settingsPage'

// 新标签页加载完成前收不到消息；这段时间内再次点击不能多开一个设置页。
const NEW_TAB_LOADING_GRACE_MS = 5000
let recentlyCreatedTab: { tabId: number, createdAt: number } | undefined

async function focusTab(tabId: number, windowId?: number) {
  await browser.tabs.update(tabId, { active: true })
  if (windowId !== undefined)
    await browser.windows.update(windowId, { focused: true })
}

// 由已打开的设置页自报标签页，无需为查找自身页面申请 tabs 权限。
async function navigateExistingSettingsPage(target?: SettingsNavigationTarget) {
  try {
    const location = await browser.runtime.sendMessage({
      type: NAVIGATE_SETTINGS_PAGE_MESSAGE,
      data: target,
    }) as SettingsPageTabLocation | undefined
    return location?.tabId === undefined ? undefined : location
  }
  catch {
    // 没有打开的设置页时不存在接收方。
    return undefined
  }
}

async function reuseLoadingSettingsTab(url: string, target?: SettingsNavigationTarget) {
  if (!recentlyCreatedTab || Date.now() - recentlyCreatedTab.createdAt > NEW_TAB_LOADING_GRACE_MS)
    return false

  try {
    await browser.tabs.update(recentlyCreatedTab.tabId, target ? { url, active: true } : { active: true })
    return true
  }
  catch {
    // 标签页已被关闭。
    return false
  }
}

async function createSettingsTab(url: string, sourceTab?: Tabs.Tab) {
  try {
    return await browser.tabs.create({
      url,
      active: true,
      windowId: sourceTab?.windowId,
      index: sourceTab?.index === undefined ? undefined : sourceTab.index + 1,
    })
  }
  catch {
    // 无痕窗口等场景不允许打开扩展页，交由浏览器选择普通窗口。
    return browser.tabs.create({ url, active: true })
  }
}

async function openSettingsPage(target?: SettingsNavigationTarget, sourceTab?: Tabs.Tab) {
  const existing = await navigateExistingSettingsPage(target)
  if (existing) {
    await focusTab(existing.tabId!, existing.windowId)
    return
  }

  const url = `${browser.runtime.getURL(SETTINGS_PAGE_PATH)}${buildSettingsPageHash(target)}`
  if (await reuseLoadingSettingsTab(url, target))
    return

  const tab = await createSettingsTab(url, sourceTab)
  if (tab.id !== undefined)
    recentlyCreatedTab = { tabId: tab.id, createdAt: Date.now() }
}

async function forwardToRecentBilibiliTab(request: BilibiliTabRequest) {
  const tabs = await browser.tabs.query({ url: '*://*.bilibili.com/*' })
  tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))

  for (const tab of tabs) {
    if (tab.id === undefined)
      continue
    try {
      const result = await browser.tabs.sendMessage(tab.id, {
        type: BILIBILI_TAB_REQUEST_MESSAGE,
        data: request,
      })
      if (result !== undefined)
        return result
    }
    catch {
      // 标签页已休眠或没有内容脚本，继续尝试下一个。
    }
  }
  return undefined
}

export function setupSettingsPage() {
  // 工具栏图标不依赖页面上的任何功能开关，关闭 Dock 等组件后仍能进入设置。
  browser.action.onClicked.addListener((tab) => {
    void openSettingsPage(undefined, tab)
  })
  onMessage<SettingsNavigationTarget | undefined>(OPEN_SETTINGS_PAGE_MESSAGE, (target, sender) =>
    openSettingsPage(target, sender?.tab))
  onMessage<BilibiliTabRequest>(BILIBILI_TAB_REQUEST_MESSAGE, forwardToRecentBilibiliTab)
}
