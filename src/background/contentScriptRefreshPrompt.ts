import type { Scripting, Tabs } from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { CONTENT_SCRIPT_PING, CONTENT_SCRIPT_PONG, isContentScriptPong, isContentScriptTargetUrl } from '~/constants/contentScript'
import { getRefreshPromptCopy, getRefreshPromptLocale, showRefreshPrompt } from '~/utils/refreshPrompt'

const CONTENT_SCRIPT_STARTUP_GRACE_PERIOD_MS = 100
const CONTENT_SCRIPT_RESTORE_RETRY_MS = 1000

export interface ContentScriptRefreshBrowser {
  tabs: Pick<Tabs.Static, 'get' | 'sendMessage'>
  scripting: Pick<Scripting.Static, 'executeScript'>
}

export type ContentScriptRefreshResult = 'ineligible' | 'already-injected' | 'refresh-prompted'

type ContentScriptPingResult = 'current' | 'outdated' | 'missing'

async function isEligibleActiveTab(tabId: number, extensionApi: ContentScriptRefreshBrowser): Promise<boolean> {
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

async function pingContentScript(
  tabId: number,
  currentVersion: string,
  extensionApi: ContentScriptRefreshBrowser,
): Promise<ContentScriptPingResult> {
  try {
    const response = await extensionApi.tabs.sendMessage(
      tabId,
      { type: CONTENT_SCRIPT_PING },
      { frameId: 0 },
    )
    if (response === CONTENT_SCRIPT_PONG)
      return 'outdated'
    if (isContentScriptPong(response))
      return response.version === currentVersion ? 'current' : 'outdated'
    return 'missing'
  }
  catch {
    // A missing receiver is expected after the extension or browser is reloaded.
    return 'missing'
  }
}

async function injectRefreshPrompt(tabId: number, currentVersion: string, extensionApi: ContentScriptRefreshBrowser): Promise<void> {
  const copy = getRefreshPromptCopy(await getRefreshPromptLocale(), currentVersion)
  await extensionApi.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: showRefreshPrompt,
    args: [copy],
    world: 'ISOLATED',
    injectImmediately: true,
  })
}

export async function promptContentScriptRefresh(
  tabId: number,
  extensionApi: ContentScriptRefreshBrowser = browser,
): Promise<ContentScriptRefreshResult> {
  if (!await isEligibleActiveTab(tabId, extensionApi))
    return 'ineligible'

  const currentVersion = browser.runtime.getManifest().version
  const firstPing = await pingContentScript(tabId, currentVersion, extensionApi)
  if (firstPing === 'current')
    return 'already-injected'

  if (firstPing === 'missing') {
    await new Promise(resolve => setTimeout(resolve, CONTENT_SCRIPT_STARTUP_GRACE_PERIOD_MS))

    // A normal manifest injection may still be starting, or the tab may have
    // navigated while the first ping and grace period were in flight.
    if (!await isEligibleActiveTab(tabId, extensionApi))
      return 'ineligible'

    const secondPing = await pingContentScript(tabId, currentVersion, extensionApi)
    if (secondPing === 'current')
      return 'already-injected'
  }

  await injectRefreshPrompt(tabId, currentVersion, extensionApi)
  return 'refresh-prompted'
}

const pendingPrompts = new Map<number, Promise<void>>()

function queueContentScriptRefreshPrompt(tabId: number): void {
  if (pendingPrompts.has(tabId))
    return

  const prompt = promptContentScriptRefresh(tabId)
    .then((result) => {
      if (result === 'refresh-prompted')
        console.log(`[BewlyCat] Asked tab ${tabId} to refresh its content script.`)
    })
    .catch((error) => {
      console.warn(`[BewlyCat] Failed to show the refresh prompt in tab ${tabId}.`, error)
    })
    .finally(() => {
      if (pendingPrompts.get(tabId) === prompt)
        pendingPrompts.delete(tabId)
    })

  pendingPrompts.set(tabId, prompt)
}

async function queueActiveTabs(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true })
  tabs.forEach((tab) => {
    if (tab.id !== undefined)
      queueContentScriptRefreshPrompt(tab.id)
  })
}

function queueActiveTabsWithRestoreRetry(): void {
  void queueActiveTabs().catch((error) => {
    console.warn('[BewlyCat] Failed to inspect active tabs.', error)
  })

  globalThis.setTimeout(() => {
    void queueActiveTabs().catch((error) => {
      console.warn('[BewlyCat] Failed to inspect restored tabs.', error)
    })
  }, CONTENT_SCRIPT_RESTORE_RETRY_MS)
}

let refreshPromptListenersInitialized = false

export function setupContentScriptRefreshPrompt(): void {
  // eslint-disable-next-line node/prefer-global/process
  if (refreshPromptListenersInitialized || process.env.FIREFOX || process.env.SAFARI)
    return

  refreshPromptListenersInitialized = true

  browser.tabs.onActivated.addListener(({ tabId }) => {
    queueContentScriptRefreshPrompt(tabId)
  })

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active)
      queueContentScriptRefreshPrompt(tabId)
  })

  browser.runtime.onStartup.addListener(() => {
    queueActiveTabsWithRestoreRetry()
  })

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install')
      return

    queueActiveTabsWithRestoreRetry()
  })

  void queueActiveTabs().catch((error) => {
    console.warn('[BewlyCat] Failed to inspect active tabs.', error)
  })
}
