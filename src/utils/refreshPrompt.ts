import browser from 'webextension-polyfill'

import { LanguageType } from '~/enums/appEnums'

import { version as extensionVersion } from '../../package.json'

export interface RefreshPromptCopy {
  currentVersion: string
  refresh: string
  later: string
  missingDescription: string
  missingTitle: string
  updatedDescription: string
  updatedTitle: string
}

export function getRefreshPromptCopy(locale: string, currentVersion: string): RefreshPromptCopy {
  const normalizedLocale = locale.toLowerCase()

  if (
    normalizedLocale === LanguageType.Mandarin_TW.toLowerCase()
    || normalizedLocale === LanguageType.Cantonese
    || normalizedLocale.startsWith('zh-tw')
    || normalizedLocale.startsWith('zh-hk')
  ) {
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

  if (normalizedLocale === LanguageType.Mandarin_CN.toLowerCase() || normalizedLocale.startsWith('zh')) {
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

function getStoredLanguage(value: unknown): string | undefined {
  let storedSettings = value

  if (typeof storedSettings === 'string') {
    try {
      storedSettings = JSON.parse(storedSettings)
    }
    catch {
      return undefined
    }
  }

  if (typeof storedSettings !== 'object' || storedSettings === null || Array.isArray(storedSettings))
    return undefined

  const language = (storedSettings as Record<string, unknown>).language
  return typeof language === 'string' && language ? language : undefined
}

export async function getRefreshPromptLocale(): Promise<string> {
  try {
    const stored = await browser.storage.local.get('settings')
    const storedLanguage = getStoredLanguage(stored.settings)
    if (storedLanguage)
      return storedLanguage
  }
  catch {
    // storage may be unavailable after the extension context is invalidated
  }

  try {
    return browser.i18n.getUILanguage()
  }
  catch {
    return globalThis.navigator?.language || 'en'
  }
}

/**
 * Must stay self-contained: Chrome serializes this function for executeScript.
 * Do not close over module-level bindings.
 */
export function showRefreshPrompt(...args: unknown[]): void {
  const [copy] = args as [RefreshPromptCopy]
  const promptId = 'bewlycat-refresh-required'
  const existingPrompt = document.getElementById(promptId)

  if (existingPrompt) {
    if (!existingPrompt.hidden)
      return
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
  host.dataset.promptVersion = copy.currentVersion
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
    '--bew-theme-color-80',
    '--bew-theme-color-40',
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
    '--bew-panel-radius',
    '--bew-interactive-radius',
    '--bew-font-size-control',
    '--bew-font-size-body',
    '--bew-line-height-control',
    '--bew-line-height-body',
    '--bew-font-weight-regular',
    '--bew-font-weight-semibold',
    '--bew-space-2',
    '--bew-space-3',
    '--bew-control-height',
    '--bew-control-item-padding-x',
    '--bew-duration-fast',
    '--bew-duration-moderate',
    '--bew-ease-emphasized',
    '--bew-ease-standard',
    '--bew-shadow-3',
    '--bew-shadow-edge-glow-1',
  ]
  themeProperties.forEach((property) => {
    const value = themeStyles.getPropertyValue(property).trim()
    if (value)
      host.style.setProperty(property, value)
  })
  if (themeStyles.fontFamily)
    host.style.setProperty('font-family', themeStyles.fontFamily, 'important')

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    /*
     * This prompt runs in an isolated Shadow DOM after the previous content script
     * becomes unavailable. Mirror the shared tokens when present and keep fallbacks
     * so pages from older extension versions still render consistently.
     */
    :host {
      font-family: inherit;
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
      width: min(360px, calc(100vw - 24px));
      min-height: 0;
      padding: var(--bew-space-3, 12px);
      color: var(--bew-text-1, #18191c);
      background: var(--bew-elevated-solid, rgb(255 255 255 / 96%));
      background: color-mix(in oklab, var(--bew-elevated-solid, white) 90%, transparent);
      border: 1px solid var(--bew-border-color, rgb(0 0 0 / 10%));
      border-radius: var(--bew-panel-radius, var(--bew-radius, 12px));
      box-shadow: var(--bew-shadow-edge-glow-1, 0 0 0 transparent), var(--bew-shadow-3, 0 8px 30px rgb(0 0 0 / 18%));
      backdrop-filter: var(--bew-filter-glass-1, blur(12px));
      animation: prompt-in var(--bew-duration-moderate, 300ms) var(--bew-ease-emphasized, ease) both;
      overflow: hidden;
    }
    .content {
      min-width: 0;
    }
    .title {
      margin: 0;
      font-size: var(--bew-font-size-body, 14px);
      font-weight: var(--bew-font-weight-semibold, 600);
      line-height: var(--bew-line-height-body, 20px);
      overflow-wrap: anywhere;
    }
    .description {
      margin: 2px 0 0;
      color: var(--bew-text-2, #61666d);
      font-size: var(--bew-font-size-control, 12px);
      font-weight: var(--bew-font-weight-regular, 400);
      line-height: var(--bew-line-height-control, 16px);
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--bew-space-2, 8px);
      margin-top: var(--bew-space-3, 12px);
    }
    button {
      appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      height: var(--bew-control-height, 36px);
      padding: 0 var(--bew-control-item-padding-x, 12px);
      color: var(--bew-text-1, #18191c);
      font: inherit;
      font-size: var(--bew-font-size-control, 12px);
      font-weight: var(--bew-font-weight-semibold, 600);
      line-height: var(--bew-line-height-control, 16px);
      background: transparent;
      border: 0;
      border-radius: var(--bew-interactive-radius, 8px);
      cursor: pointer;
      transition:
        background-color var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
        transform var(--bew-duration-moderate, 300ms) var(--bew-ease-emphasized, ease);
    }
    button:hover {
      color: var(--bew-text-1, #18191c);
      background: var(--bew-fill-2, rgb(0 0 0 / 8%));
    }
    button:active {
      transform: scale(0.95);
    }
    button:focus-visible {
      outline: 2px solid var(--bew-theme-color-40, rgb(0 174 236 / 40%));
      outline-offset: 2px;
    }
    .primary {
      color: white;
      background: var(--bew-theme-color, #00aeec);
    }
    .primary:hover {
      color: white;
      background: var(--bew-theme-color-80, var(--bew-theme-color, #00aeec));
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
    :host([data-theme="dark"]) .primary,
    :host([data-theme="dark"]) .primary:hover {
      color: white;
    }
    :host([data-theme="dark"]) .primary {
      background: var(--bew-theme-color, #00aeec);
    }
    :host([data-theme="dark"]) .primary:hover {
      background: var(--bew-theme-color-80, var(--bew-theme-color, #00aeec));
    }
    @supports not (background: color-mix(in oklab, black, white)) {
      :host([data-theme="dark"]) .prompt {
        background: #2b2d31;
      }
    }
    @keyframes prompt-in {
      from {
        opacity: 0;
        filter: blur(3px);
        transform: translate3d(-18px, 4px, 0) scale(0.98);
      }
      to {
        opacity: 1;
        filter: blur(0);
        transform: translate3d(0, 0, 0) scale(1);
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

function canShowRefreshPrompt(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined')
    return false

  try {
    return window.top === window
  }
  catch {
    return false
  }
}

let refreshPromptInFlight: Promise<void> | null = null

export function promptPageRefreshFromContentScript(): void {
  if (!canShowRefreshPrompt() || refreshPromptInFlight)
    return
  if (document.getElementById('bewlycat-refresh-required'))
    return

  refreshPromptInFlight = (async () => {
    try {
      const copy = getRefreshPromptCopy(await getRefreshPromptLocale(), extensionVersion)
      showRefreshPrompt(copy)
    }
    catch (error) {
      console.warn('[BewlyCat] Failed to show the refresh prompt.', error)
    }
    finally {
      refreshPromptInFlight = null
    }
  })()
}
