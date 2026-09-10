import type { Scripting, Tabs } from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import type { ContentScriptIdentity } from '~/constants/contentScript'
import { CONTENT_SCRIPT_PING, CONTENT_SCRIPT_PONG, isContentScriptPong, isContentScriptTargetUrl } from '~/constants/contentScript'
import type { RefreshPromptDiagnostic } from '~/utils/refreshPrompt'
import { getRefreshPromptCopy, getRefreshPromptLocale, showRefreshPrompt } from '~/utils/refreshPrompt'

const CONTENT_SCRIPT_STARTUP_RETRY_DELAYS = [500, 1500]
const CONTENT_SCRIPT_PING_TIMEOUT_MS = 2000
const CONTENT_SCRIPT_RESTORE_RETRY_MS = 1000

export interface ContentScriptRefreshBrowser {
  tabs: Pick<Tabs.Static, 'get' | 'sendMessage'>
  scripting: Pick<Scripting.Static, 'executeScript'>
}

export type ContentScriptRefreshResult = 'ineligible' | 'already-injected' | 'refresh-prompted'

type ContentScriptPingResult = { status: 'current' } | {
  status: 'unavailable' | 'outdated'
  diagnostic: RefreshPromptDiagnostic
}

async function getEligibleActiveTab(tabId: number, extensionApi: ContentScriptRefreshBrowser): Promise<Tabs.Tab | undefined> {
  try {
    const tab = await extensionApi.tabs.get(tabId)
    if (tab.active === true
      && tab.status === 'complete'
      && tab.discarded !== true
      && isContentScriptTargetUrl(tab.url)) {
      return tab
    }
  }
  catch {
    // Closed or inaccessible tab.
  }
}

async function pingContentScript(
  tabId: number,
  currentIdentity: ContentScriptIdentity,
  extensionApi: ContentScriptRefreshBrowser,
): Promise<ContentScriptPingResult> {
  const diagnostic: RefreshPromptDiagnostic = {
    reason: 'content-script-unreachable',
    source: 'background',
    expected: currentIdentity,
  }
  let timeout: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  try {
    const response = await Promise.race([
      extensionApi.tabs.sendMessage(
        tabId,
        { type: CONTENT_SCRIPT_PING, expectedIdentity: currentIdentity },
        { frameId: 0 },
      ),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true
          reject(new Error('Content script ping timed out'))
        }, CONTENT_SCRIPT_PING_TIMEOUT_MS)
      }),
    ])
    if (response === CONTENT_SCRIPT_PONG) {
      return { status: 'outdated', diagnostic: { ...diagnostic, reason: 'legacy-content-script' } }
    }
    if (isContentScriptPong(response)) {
      const received: ContentScriptIdentity = {
        name: response.name,
        runtimeUrl: response.runtimeUrl,
        version: response.version,
      }
      if (received.runtimeUrl !== currentIdentity.runtimeUrl || received.name !== currentIdentity.name) {
        return { status: 'outdated', diagnostic: { ...diagnostic, reason: 'identity-mismatch', received } }
      }
      if (received.version !== currentIdentity.version) {
        return { status: 'outdated', diagnostic: { ...diagnostic, reason: 'version-mismatch', received } }
      }
      return { status: 'current' }
    }
    return { status: 'unavailable', diagnostic: { ...diagnostic, reason: 'content-script-check-failed', failure: 'invalid-response' } }
  }
  catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
    const missingReceiver = message.includes('receiving end does not exist') || message.includes('could not establish connection')
    return {
      status: 'unavailable',
      diagnostic: {
        ...diagnostic,
        reason: missingReceiver ? 'content-script-unreachable' : 'content-script-check-failed',
        failure: timedOut ? 'timeout' : missingReceiver ? 'receiver-missing' : 'message-error',
      },
    }
  }
  finally {
    clearTimeout(timeout)
  }
}

export async function promptContentScriptRefresh(
  tabId: number,
  extensionApi: ContentScriptRefreshBrowser = browser,
  isCurrentCheck: () => boolean = () => true,
): Promise<ContentScriptRefreshResult> {
  const initialTab = await getEligibleActiveTab(tabId, extensionApi)
  if (!initialTab || !isCurrentCheck())
    return 'ineligible'

  const manifest = browser.runtime.getManifest()
  const currentIdentity: ContentScriptIdentity = {
    name: manifest.name,
    runtimeUrl: browser.runtime.getURL(''),
    version: manifest.version,
  }
  const stillEligible = async () => {
    if (!isCurrentCheck())
      return false
    const tab = await getEligibleActiveTab(tabId, extensionApi)
    return isCurrentCheck() && !!tab && tab.url === initialTab.url
  }

  let result = await pingContentScript(tabId, currentIdentity, extensionApi)
  let attempts = 1
  for (const delay of CONTENT_SCRIPT_STARTUP_RETRY_DELAYS) {
    if (result.status !== 'unavailable' || !isCurrentCheck())
      break
    await new Promise(resolve => setTimeout(resolve, delay))
    if (!await stillEligible())
      return 'ineligible'
    result = await pingContentScript(tabId, currentIdentity, extensionApi)
    attempts++
  }
  if (!await stillEligible())
    return 'ineligible'
  if (result.status === 'current')
    return 'already-injected'

  const diagnostic = { ...result.diagnostic, attempts }
  const copy = getRefreshPromptCopy(await getRefreshPromptLocale(), currentIdentity.version, diagnostic)
  if (!await stillEligible())
    return 'ineligible'

  await extensionApi.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: showRefreshPrompt,
    args: [copy, initialTab.url],
    world: 'ISOLATED',
    injectImmediately: true,
  })
  return 'refresh-prompted'
}

const pendingPrompts = new Map<number, { cancelled: boolean }>()

function queueContentScriptRefreshPrompt(tabId: number): void {
  if (pendingPrompts.has(tabId))
    return

  const check = { cancelled: false }
  pendingPrompts.set(tabId, check)
  void promptContentScriptRefresh(tabId, browser, () => !check.cancelled)
    .then((result) => {
      if (result === 'refresh-prompted')
        console.log(`[BewlyCat] Asked tab ${tabId} to refresh its content script.`)
    })
    .catch((error) => {
      console.warn(`[BewlyCat] Failed to show the refresh prompt in tab ${tabId}.`, error)
    })
    .finally(() => {
      if (pendingPrompts.get(tabId) === check)
        pendingPrompts.delete(tabId)
    })
}

function cancelContentScriptRefreshPrompt(tabId: number) {
  const check = pendingPrompts.get(tabId)
  if (check)
    check.cancelled = true
  pendingPrompts.delete(tabId)
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
  if (refreshPromptListenersInitialized || process.env.SAFARI)
    return

  refreshPromptListenersInitialized = true

  browser.tabs.onActivated.addListener(({ tabId }) => {
    queueContentScriptRefreshPrompt(tabId)
  })

  browser.tabs.onRemoved.addListener(cancelContentScriptRefreshPrompt)
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // 即使刷新到相同 URL，也不能把上一份文档的检测结果注入新文档。
    if (changeInfo.status === 'loading' || changeInfo.url)
      cancelContentScriptRefreshPrompt(tabId)
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
