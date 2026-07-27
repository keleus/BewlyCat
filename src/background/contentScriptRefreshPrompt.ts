import type { Scripting, Tabs } from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { CONTENT_SCRIPT_PING, CONTENT_SCRIPT_PONG, isContentScriptTargetUrl } from '~/constants/contentScript'

const CONTENT_SCRIPT_STARTUP_GRACE_PERIOD_MS = 100

interface RefreshPromptCopy {
  currentVersion: string
  refresh: string
  later: string
  missingDescription: string
  missingTitle: string
  updatedDescription: string
  updatedTitle: string
}

export interface ContentScriptRefreshBrowser {
  tabs: Pick<Tabs.Static, 'get' | 'sendMessage'>
  scripting: Pick<Scripting.Static, 'executeScript'>
}

export type ContentScriptRefreshResult = 'ineligible' | 'already-injected' | 'refresh-prompted'

function getRefreshPromptCopy(locale: string, currentVersion: string): RefreshPromptCopy {
  const normalizedLocale = locale.toLowerCase()

  if (normalizedLocale.startsWith('zh-tw') || normalizedLocale.startsWith('zh-hk')) {
    return {
      currentVersion,
      refresh: '立即重新整理',
      later: '稍後',
      missingTitle: 'BewlyCat 需要重新整理頁面',
      missingDescription: '擴充功能已重新載入。重新整理頁面以恢復完整樣式與功能。',
      updatedTitle: 'BewlyCat 已更新',
      updatedDescription: '目前頁面仍在執行舊版本。重新整理後套用 v{version}。',
    }
  }

  if (normalizedLocale.startsWith('zh')) {
    return {
      currentVersion,
      refresh: '立即刷新',
      later: '稍后',
      missingTitle: 'BewlyCat 需要刷新页面',
      missingDescription: '扩展已重新加载。刷新页面以恢复完整样式和功能。',
      updatedTitle: 'BewlyCat 已更新',
      updatedDescription: '当前页面仍在运行旧版本。刷新后应用 v{version}。',
    }
  }

  if (normalizedLocale.startsWith('ja')) {
    return {
      currentVersion,
      refresh: '今すぐ再読み込み',
      later: '後で',
      missingTitle: 'BewlyCat の再読み込みが必要です',
      missingDescription: '拡張機能が再読み込みされました。ページを再読み込みして、スタイルと機能を復元してください。',
      updatedTitle: 'BewlyCat が更新されました',
      updatedDescription: 'このページでは古いバージョンが実行されています。再読み込みして v{version} を適用してください。',
    }
  }

  if (normalizedLocale.startsWith('ko')) {
    return {
      currentVersion,
      refresh: '지금 새로고침',
      later: '나중에',
      missingTitle: 'BewlyCat 페이지 새로고침 필요',
      missingDescription: '확장 프로그램이 다시 로드되었습니다. 전체 스타일과 기능을 복원하려면 페이지를 새로고침하세요.',
      updatedTitle: 'BewlyCat 업데이트됨',
      updatedDescription: '이 페이지는 이전 버전을 실행 중입니다. 새로고침하여 v{version}을 적용하세요.',
    }
  }

  return {
    currentVersion,
    refresh: 'Refresh now',
    later: 'Later',
    missingTitle: 'BewlyCat needs a page refresh',
    missingDescription: 'The extension was reloaded. Refresh this page to restore all styles and features.',
    updatedTitle: 'BewlyCat was updated',
    updatedDescription: 'This page is still running an older version. Refresh to apply v{version}.',
  }
}

function showRefreshPrompt(...args: unknown[]): void {
  const [copy] = args as [RefreshPromptCopy]
  const promptId = 'bewlycat-refresh-required'
  const existingPrompt = document.getElementById(promptId)

  if (existingPrompt) {
    if (existingPrompt.dataset.dismissedVersion === copy.currentVersion)
      return
    existingPrompt.remove()
  }

  const bewlyContainer = document.querySelector<HTMLElement>('#bewly')
  const runningVersion = bewlyContainer?.dataset.version
  const versionChanged = Boolean(runningVersion && runningVersion !== copy.currentVersion)
  const pageUsesDarkTheme = document.documentElement.classList.contains('dark')
    || document.documentElement.classList.contains('bili_dark')
    || document.body?.classList.contains('dark') === true
  const theme = bewlyContainer
    ? (bewlyContainer.classList.contains('dark') ? 'dark' : 'light')
    : (pageUsesDarkTheme || matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const edgeOffset = matchMedia('(max-width: 560px)').matches ? '16px' : '24px'
  const host = document.createElement('div')
  host.id = promptId
  host.dataset.theme = theme
  host.style.setProperty('all', 'initial', 'important')
  host.style.setProperty('position', 'fixed', 'important')
  host.style.setProperty('left', edgeOffset, 'important')
  host.style.setProperty('bottom', edgeOffset, 'important')
  host.style.setProperty('z-index', '2147483647', 'important')
  host.style.setProperty('display', 'block', 'important')

  const themeSource = bewlyContainer ?? document.documentElement
  const themeStyles = getComputedStyle(themeSource)
  const themeProperties = [
    '--bew-theme-color',
    '--bew-dark-base-color',
    '--bew-text-1',
    '--bew-text-2',
    '--bew-border-color',
    '--bew-elevated',
    '--bew-elevated-solid',
    '--bew-elevated-solid-hover',
    '--bew-fill-1',
    '--bew-fill-2',
    '--bew-filter-glass-1',
    '--bew-radius',
    '--bew-shadow-3',
    '--bew-shadow-edge-glow-1',
  ]
  themeProperties.forEach((property) => {
    const value = themeStyles.getPropertyValue(property).trim()
    if (value)
      host.style.setProperty(property, value)
  })

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    :host {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    :host([data-theme="light"]) {
      color-scheme: light;
    }
    :host([data-theme="dark"]) {
      color-scheme: dark;
    }
    .prompt {
      position: relative;
      box-sizing: border-box;
      width: min(360px, calc(100vw - 32px));
      padding: 12px 14px;
      color: var(--bew-text-1, #18191c);
      background: var(--bew-elevated-solid, rgb(255 255 255 / 96%));
      background: color-mix(in oklab, var(--bew-elevated-solid, white) 90%, transparent);
      border: 1px solid var(--bew-border-color, rgb(0 0 0 / 10%));
      border-radius: var(--bew-radius, 12px);
      box-shadow: var(--bew-shadow-edge-glow-1, 0 0 0 transparent), var(--bew-shadow-3, 0 8px 30px rgb(0 0 0 / 18%));
      backdrop-filter: var(--bew-filter-glass-1, blur(12px));
      overflow: hidden;
    }
    .content {
      min-width: 0;
    }
    .title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.45;
    }
    .description {
      margin: 3px 0 0;
      color: var(--bew-text-2, #61666d);
      font-size: 12px;
      line-height: 1.55;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }
    button {
      min-height: 32px;
      padding: 0 13px;
      color: var(--bew-text-2, #61666d);
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      background: transparent;
      border: 0;
      border-radius: var(--bew-radius, 8px);
      cursor: pointer;
      transition: background-color 160ms ease, transform 160ms ease;
    }
    button:hover {
      color: var(--bew-text-1, #18191c);
      background: var(--bew-fill-2, rgb(0 0 0 / 8%));
    }
    button:active {
      transform: scale(0.95);
    }
    .primary {
      color: white;
      background: var(--bew-theme-color, #00aeec);
      border-color: transparent;
    }
    .primary:hover {
      filter: brightness(1.06);
      background: var(--bew-theme-color, #00aeec);
    }
    :host([data-theme="dark"]) .prompt {
      color: var(--bew-text-1, #f1f2f3);
      background: var(--bew-elevated-solid, #2b2d31);
      background: color-mix(in oklab, var(--bew-elevated-solid, #2b2d31) 90%, transparent);
      border-color: var(--bew-border-color, rgb(255 255 255 / 12%));
      box-shadow: var(--bew-shadow-edge-glow-1, 0 0 0 transparent), var(--bew-shadow-3, 0 8px 30px rgb(0 0 0 / 38%));
    }
    :host([data-theme="dark"]) .description {
      color: var(--bew-text-2, #c9ccd0);
    }
    :host([data-theme="dark"]) button {
      color: var(--bew-text-2, #c9ccd0);
      border-color: var(--bew-border-color, rgb(255 255 255 / 14%));
    }
    :host([data-theme="dark"]) button:hover {
      background: var(--bew-fill-1, rgb(255 255 255 / 8%));
    }
    :host([data-theme="dark"]) .primary,
    :host([data-theme="dark"]) .primary:hover {
      color: white;
      background: var(--bew-theme-color, #00aeec);
    }
    @supports not (background: color-mix(in oklab, black, white)) {
      :host([data-theme="dark"]) .prompt {
        background: #2b2d31;
      }
    }
  `

  const prompt = document.createElement('aside')
  prompt.className = 'prompt'
  prompt.setAttribute('role', 'alert')

  const header = document.createElement('div')
  header.className = 'header'

  const content = document.createElement('div')
  content.className = 'content'

  const title = document.createElement('p')
  title.className = 'title'
  title.textContent = versionChanged ? copy.updatedTitle : copy.missingTitle

  const description = document.createElement('p')
  description.className = 'description'
  description.textContent = (versionChanged ? copy.updatedDescription : copy.missingDescription)
    .replace('{version}', copy.currentVersion)

  const actions = document.createElement('div')
  actions.className = 'actions'

  const laterButton = document.createElement('button')
  laterButton.type = 'button'
  laterButton.textContent = copy.later
  laterButton.addEventListener('click', () => {
    host.dataset.dismissedVersion = copy.currentVersion
    host.hidden = true
    host.style.setProperty('display', 'none', 'important')
  })

  const refreshButton = document.createElement('button')
  refreshButton.type = 'button'
  refreshButton.className = 'primary'
  refreshButton.textContent = copy.refresh
  refreshButton.addEventListener('click', () => location.reload())

  content.append(title, description)
  header.append(content)
  actions.append(laterButton, refreshButton)
  prompt.append(header, actions)
  shadow.append(style, prompt)
  document.documentElement.appendChild(host)
}

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

async function pingContentScript(tabId: number, extensionApi: ContentScriptRefreshBrowser): Promise<boolean> {
  try {
    const response = await extensionApi.tabs.sendMessage(
      tabId,
      { type: CONTENT_SCRIPT_PING },
      { frameId: 0 },
    )
    return response === CONTENT_SCRIPT_PONG
  }
  catch {
    // A missing receiver is expected after the extension or browser is reloaded.
    return false
  }
}

export async function promptContentScriptRefresh(
  tabId: number,
  extensionApi: ContentScriptRefreshBrowser = browser,
): Promise<ContentScriptRefreshResult> {
  if (!await isEligibleActiveTab(tabId, extensionApi))
    return 'ineligible'

  if (await pingContentScript(tabId, extensionApi))
    return 'already-injected'

  await new Promise(resolve => setTimeout(resolve, CONTENT_SCRIPT_STARTUP_GRACE_PERIOD_MS))

  // A normal manifest injection may still be starting, or the tab may have
  // navigated while the first ping and grace period were in flight.
  if (!await isEligibleActiveTab(tabId, extensionApi))
    return 'ineligible'

  if (await pingContentScript(tabId, extensionApi))
    return 'already-injected'

  const copy = getRefreshPromptCopy(browser.i18n.getUILanguage(), browser.runtime.getManifest().version)
  await extensionApi.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: showRefreshPrompt,
    args: [copy],
    world: 'ISOLATED',
    injectImmediately: true,
  })

  return 'refresh-prompted'
}

const pendingPrompts = new Map<number, Promise<void>>()

function queueContentScriptRefreshPrompt(tabId: number): void {
  if (pendingPrompts.has(tabId))
    return

  const prompt = promptContentScriptRefresh(tabId)
    .then((result) => {
      if (result === 'refresh-prompted')
        console.log(`[BewlyCat] Asked tab ${tabId} to refresh after its content script became unavailable.`)
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
    void queueActiveTabs().catch((error) => {
      console.warn('[BewlyCat] Failed to inspect active tabs on startup.', error)
    })
  })

  void queueActiveTabs().catch((error) => {
    console.warn('[BewlyCat] Failed to inspect active tabs.', error)
  })
}
