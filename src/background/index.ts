import browser from 'webextension-polyfill'

import { setupAppAuthScheduler } from './appAuthScheduler'
import { setupApiMsgListeners } from './messageListeners/api'
import { setupTabMsgListeners } from './messageListeners/tabs'
import { initWbiKeys } from './wbiSign'

// Initialize extension and set up message handlers
browser.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed')
})

// 扩展启动时初始化 WBI 密钥
initWbiKeys().catch((error) => {
  console.error('[BewlyCat] WBI keys initialization error:', error)
})

function isExtensionUri(url: string) {
  return new URL(url).origin === new URL(browser.runtime.getURL('')).origin
}

function isHomePageUrl(url: string) {
  return (
    /https?:\/\/(?:www\.)?bilibili.com\/?(?:#\/?)?$/.test(url)
    || /https?:\/\/(?:www\.)?bilibili.com\/index\.html$/.test(url)
    || /https?:\/\/(?:www\.)?bilibili.com\/\?spm_id_from=.*/.test(url)
    || /https?:\/\/www\.bilibili\.com\/\?.*$/.test(url)
  )
}

function isVideoPreviewRequestUrl(url: string) {
  return /^https?:\/\/(?:[^/]+\.)?(?:bilivideo\.com|bilivideo\.cn|hdslb\.com|acgvideo\.com)\//.test(url)
}

function isVideoPreviewResourceType(type?: string) {
  return type === 'media' || type === 'xmlhttprequest'
}

// Firefox specific header handling
// eslint-disable-next-line node/prefer-global/process
if (process.env.FIREFOX) {
  browser.webRequest.onBeforeSendHeaders.addListener(
    async (details: any) => {
      const requestHeaders: browser.WebRequest.HttpHeaders = []
      if (details.documentUrl) {
        const url = new URL(details.documentUrl)
        const shouldRewritePreviewReferer = (
          isHomePageUrl(details.documentUrl)
          && isVideoPreviewRequestUrl(details.url)
          && isVideoPreviewResourceType(details.type)
          && !isExtensionUri(details.documentUrl)
        )
        details.requestHeaders = details.requestHeaders || []
        for (let i = 0; i < details.requestHeaders.length; i++) {
          if (shouldRewritePreviewReferer && (details.requestHeaders[i].name.toLowerCase() === 'origin' || details.requestHeaders[i].name.toLowerCase() === 'referer'))
            requestHeaders.push({ name: details.requestHeaders[i].name, value: url.origin })
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
