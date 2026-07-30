import browser from 'webextension-polyfill'

import { BILIBILI_DESKTOP_USER_AGENT, isBilibiliWwwUrl, isPreventMobileRedirectEnabled } from '~/utils/bilibiliDesktopNavigation'

import { setupAppAuthScheduler } from './appAuthScheduler'
import { setupContentScriptRefreshPrompt } from './contentScriptRefreshPrompt'
import { setupApiMsgListeners } from './messageListeners/api'
import { setupTabMsgListeners } from './messageListeners/tabs'
import { setupTopBarStateBroker } from './topBarStateBroker'
import { initWbiKeys } from './wbiSign'

// Initialize extension and set up message handlers
browser.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed')
})

const PREVENT_MOBILE_REDIRECT_RULE_ID = 1001
const BILIBILI_HD_USER_AGENT = 'Mozilla/5.0 BiliDroid/2.0.1 (bbcallen@gmail.com) os/android model/android_hd mobi_app/android_hd build/2001100 channel/master innerVer/2001100 osVer/15 network/2'
const APP_AUTH_REQUEST_HEADERS = {
  'user-agent': BILIBILI_HD_USER_AGENT,
  'app-key': 'android_hd',
  'env': 'prod',
  'x-bili-trace-id': '11111111111111111111111111111111:1111111111111111:0:0',
  'bili-http-engine': 'cronet',
} as const

function isAppAuthRequest(url: string) {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.origin === 'https://passport.bilibili.com'
      && (parsedUrl.pathname === '/x/passport-tv-login/qrcode/auth_code'
        || parsedUrl.pathname === '/x/passport-tv-login/qrcode/poll')
  }
  catch {
    return false
  }
}

const preventMobileRedirectRule: browser.DeclarativeNetRequest.Rule = {
  id: PREVENT_MOBILE_REDIRECT_RULE_ID,
  priority: 2,
  action: {
    type: 'modifyHeaders',
    requestHeaders: [
      {
        header: 'user-agent',
        operation: 'set',
        value: BILIBILI_DESKTOP_USER_AGENT,
      },
      {
        header: 'sec-ch-ua-mobile',
        operation: 'set',
        value: '?0',
      },
      {
        header: 'sec-ch-ua-platform',
        operation: 'set',
        value: '"Windows"',
      },
    ],
  },
  condition: {
    regexFilter: '^https?://www\\.bilibili\\.com/',
    resourceTypes: ['main_frame'],
  },
}

// eslint-disable-next-line node/prefer-global/process
const isFirefoxBuild = Boolean(process.env.FIREFOX)
let preventMobileRedirectEnabled = false

async function syncPreventMobileRedirectRule(enabled: boolean) {
  if (isFirefoxBuild)
    return

  try {
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [PREVENT_MOBILE_REDIRECT_RULE_ID],
      addRules: enabled ? [preventMobileRedirectRule] : [],
    })
  }
  catch (error) {
    console.error('[BewlyCat] Failed to update the mobile redirect compatibility rule:', error)
  }
}

const preventMobileRedirectReady = browser.storage.local.get('settings').then((result) => {
  preventMobileRedirectEnabled = isPreventMobileRedirectEnabled(result.settings)
  return syncPreventMobileRedirectRule(preventMobileRedirectEnabled)
})

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.settings)
    return

  preventMobileRedirectEnabled = isPreventMobileRedirectEnabled(changes.settings.newValue)
  void syncPreventMobileRedirectRule(preventMobileRedirectEnabled)
})

// 扩展启动时初始化 WBI 密钥
initWbiKeys().catch((error) => {
  console.error('[BewlyCat] WBI keys initialization error:', error)
})

function isExtensionUri(url: string) {
  return new URL(url).origin === new URL(browser.runtime.getURL('')).origin
}

// Firefox specific header handling
if (isFirefoxBuild) {
  browser.webRequest.onBeforeSendHeaders.addListener(
    async (details: any) => {
      const requestHeaders: browser.WebRequest.HttpHeaders = []
      await preventMobileRedirectReady
      const appAuthRequest = isAppAuthRequest(details.url)

      if (appAuthRequest) {
        const overriddenHeaderNames = new Set([
          ...Object.keys(APP_AUTH_REQUEST_HEADERS),
          'sec-ch-ua',
          'sec-ch-ua-mobile',
          'sec-ch-ua-platform',
        ])
        details.requestHeaders = (details.requestHeaders || []).filter((header: browser.WebRequest.HttpHeaders[number]) =>
          !overriddenHeaderNames.has(header.name.toLowerCase()),
        )
        details.requestHeaders.push(
          ...Object.entries(APP_AUTH_REQUEST_HEADERS).map(([name, value]) => ({ name, value })),
        )
      }

      if (preventMobileRedirectEnabled && details.type === 'main_frame' && isBilibiliWwwUrl(details.url)) {
        let hasUserAgent = false
        for (const header of details.requestHeaders || []) {
          const headerName = header.name.toLowerCase()
          if (headerName === 'user-agent') {
            requestHeaders.push({ name: header.name, value: BILIBILI_DESKTOP_USER_AGENT })
            hasUserAgent = true
          }
          else if (headerName === 'sec-ch-ua-mobile') {
            requestHeaders.push({ name: header.name, value: '?0' })
          }
          else if (headerName === 'sec-ch-ua-platform') {
            requestHeaders.push({ name: header.name, value: '"Windows"' })
          }
          else {
            requestHeaders.push(header)
          }
        }

        if (!hasUserAgent)
          requestHeaders.push({ name: 'User-Agent', value: BILIBILI_DESKTOP_USER_AGENT })

        return { ...details, requestHeaders }
      }

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

      if (appAuthRequest)
        return { ...details, requestHeaders: details.requestHeaders }
    },
    { urls: ['<all_urls>'] },
    ['blocking', 'requestHeaders'],
  )
}

// Setup all message listeners
setupApiMsgListeners()
setupTabMsgListeners()
setupTopBarStateBroker()
setupAppAuthScheduler()
setupContentScriptRefreshPrompt()
