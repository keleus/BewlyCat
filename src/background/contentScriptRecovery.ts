import type { Scripting, Tabs } from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { CONTENT_SCRIPT_PING, CONTENT_SCRIPT_PONG, isContentScriptTargetUrl } from '~/constants/contentScript'

const CONTENT_SCRIPT_CSS = 'dist/contentScripts/style.css'
const CONTENT_SCRIPT_JS = 'dist/contentScripts/index.global.js'
const PAGE_SCRIPT_JS = 'dist/contentScripts/inject.global.js'
const CONTENT_SCRIPT_STARTUP_GRACE_PERIOD_MS = 100

export interface ContentScriptRecoveryBrowser {
  tabs: Pick<Tabs.Static, 'get' | 'sendMessage'>
  scripting: Pick<Scripting.Static, 'executeScript' | 'insertCSS'>
}

export type ContentScriptRecoveryResult = 'ineligible' | 'already-injected' | 'injected'

async function isEligibleActiveTab(tabId: number, extensionApi: ContentScriptRecoveryBrowser): Promise<boolean> {
  try {
    const tab = await extensionApi.tabs.get(tabId)
    return tab.active === true
      && tab.status === 'complete'
      && tab.discarded !== true
      && isContentScriptTargetUrl(tab.url)
  }
  catch {
    return false
  }
}

async function pingContentScript(tabId: number, extensionApi: ContentScriptRecoveryBrowser): Promise<boolean> {
  try {
    const response = await extensionApi.tabs.sendMessage(
      tabId,
      { type: CONTENT_SCRIPT_PING },
      { frameId: 0 },
    )
    return response === CONTENT_SCRIPT_PONG
  }
  catch {
    // A missing receiver is expected for the session-restoration case handled here.
    return false
  }
}

export async function recoverContentScript(
  tabId: number,
  extensionApi: ContentScriptRecoveryBrowser = browser,
): Promise<ContentScriptRecoveryResult> {
  if (!await isEligibleActiveTab(tabId, extensionApi))
    return 'ineligible'

  if (await pingContentScript(tabId, extensionApi))
    return 'already-injected'

  await new Promise(resolve => setTimeout(resolve, CONTENT_SCRIPT_STARTUP_GRACE_PERIOD_MS))

  // Re-check after the failed message. The tab may have navigated while the
  // ping and grace period were in flight, and a normal manifest injection may
  // also have finished starting in the meantime.
  if (!await isEligibleActiveTab(tabId, extensionApi))
    return 'ineligible'

  if (await pingContentScript(tabId, extensionApi))
    return 'already-injected'

  const target: Scripting.InjectionTarget = { tabId, frameIds: [0] }

  await extensionApi.scripting.insertCSS({
    target,
    files: [CONTENT_SCRIPT_CSS],
  })
  await extensionApi.scripting.executeScript({
    target,
    files: [CONTENT_SCRIPT_JS],
    world: 'ISOLATED',
    injectImmediately: true,
  })
  await extensionApi.scripting.executeScript({
    target,
    files: [PAGE_SCRIPT_JS],
    world: 'MAIN',
    injectImmediately: true,
  })

  return 'injected'
}

const pendingRecoveries = new Map<number, Promise<void>>()

function queueContentScriptRecovery(tabId: number): void {
  if (pendingRecoveries.has(tabId))
    return

  const recovery = recoverContentScript(tabId)
    .then((result) => {
      if (result === 'injected')
        console.log(`[BewlyCat] Recovered missing content script in tab ${tabId}.`)
    })
    .catch((error) => {
      console.warn(`[BewlyCat] Failed to recover content script in tab ${tabId}.`, error)
    })
    .finally(() => {
      if (pendingRecoveries.get(tabId) === recovery)
        pendingRecoveries.delete(tabId)
    })

  pendingRecoveries.set(tabId, recovery)
}

async function queueActiveTabs(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true })
  tabs.forEach((tab) => {
    if (tab.id !== undefined)
      queueContentScriptRecovery(tab.id)
  })
}

let recoveryListenersInitialized = false

export function setupContentScriptRecovery(): void {
  // eslint-disable-next-line node/prefer-global/process
  if (recoveryListenersInitialized || process.env.FIREFOX || process.env.SAFARI)
    return

  recoveryListenersInitialized = true

  browser.tabs.onActivated.addListener(({ tabId }) => {
    queueContentScriptRecovery(tabId)
  })

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active)
      queueContentScriptRecovery(tabId)
  })

  browser.runtime.onStartup.addListener(() => {
    void queueActiveTabs().catch((error) => {
      console.warn('[BewlyCat] Failed to inspect active tabs on startup.', error)
    })
  })

  void queueActiveTabs().catch((error) => {
    console.warn('[BewlyCat] Failed to inspect active tabs.', error)
  })
}
