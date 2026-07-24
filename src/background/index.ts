import browser from 'webextension-polyfill'

import { setupAppAuthScheduler } from './appAuthScheduler'
import { setupContentScriptRecovery } from './contentScriptRecovery'
import { initializeLiquidGlassUpgrade } from './liquidGlassUpgrade'
import { setupApiMsgListeners } from './messageListeners/api'
import { setupTabMsgListeners } from './messageListeners/tabs'
import { initWbiKeys } from './wbiSign'

browser.runtime.onInstalled.addListener((details) => {
  const trigger = details.reason === 'install' ? 'install' : 'update'

  void initializeLiquidGlassUpgrade(browser.storage.local, trigger).catch((error) => {
    console.error('[BewlyCat] Liquid Glass 升级迁移失败:', error)
  })
})

// 兼容已经加载过开发版本、但尚未写入独立提示状态的用户。
void initializeLiquidGlassUpgrade(browser.storage.local, 'startup').catch((error) => {
  console.error('[BewlyCat] Liquid Glass 升级提示初始化失败:', error)
})

// 扩展启动时初始化 WBI 密钥
initWbiKeys().catch((error) => {
  console.error('[BewlyCat] WBI keys initialization error:', error)
})

function isExtensionUri(url: string) {
  return new URL(url).origin === new URL(browser.runtime.getURL('')).origin
}

// Firefox specific header handling
// eslint-disable-next-line node/prefer-global/process
if (process.env.FIREFOX) {
  browser.webRequest.onBeforeSendHeaders.addListener(
    async (details: any) => {
      const requestHeaders: browser.WebRequest.HttpHeaders = []
      if (details.documentUrl) {
        const url = new URL(details.documentUrl)
        const extensionUri = isExtensionUri(details.documentUrl)
        details.requestHeaders = details.requestHeaders || []
        for (let i = 0; i < details.requestHeaders.length; i++) {
          if (details.requestHeaders[i].name.toLowerCase() === 'origin' || details.requestHeaders[i].name.toLowerCase() === 'referer')
            requestHeaders.push({ name: details.requestHeaders[i].name, value: extensionUri ? 'https://www.bilibili.com' : url.origin })
          else
            requestHeaders.push(details.requestHeaders[i])

          if (details.requestHeaders[i].name === 'firefox-multi-account-cookie') {
            requestHeaders.push({ name: 'cookie', value: details.requestHeaders[i].value })
          }
        }

        return { ...details, requestHeaders }
      }
    },
    { urls: ['<all_urls>'] },
    ['blocking', 'requestHeaders'],
  )
}

// Setup all message listeners
setupApiMsgListeners()
setupTabMsgListeners()
setupAppAuthScheduler()
setupContentScriptRecovery()
