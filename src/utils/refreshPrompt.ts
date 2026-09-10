import browser from 'webextension-polyfill'

import type { ContentScriptIdentity } from '~/constants/contentScript'
import { LanguageType } from '~/enums/appEnums'

import { version as extensionVersion } from '../../package.json'

export type RefreshPromptReason = 'version-mismatch' | 'identity-mismatch' | 'legacy-content-script'
  | 'content-script-unreachable' | 'content-script-check-failed' | 'context-invalidated' | 'background-unreachable'

export interface RefreshPromptDiagnostic {
  reason: RefreshPromptReason
  source: 'background' | 'content-script'
  expected?: ContentScriptIdentity
  received?: ContentScriptIdentity
  attempts?: number
  failure?: 'timeout' | 'receiver-missing' | 'invalid-response' | 'message-error'
}

export interface RefreshPromptCopy {
  diagnostic?: RefreshPromptDiagnostic
  reasonTitle?: string
  reasonDescription?: string
  detailsLabel?: string
  recurringDescription?: string
  currentVersion: string
  refresh: string
  later: string
  missingDescription: string
  missingTitle: string
  updatedDescription: string
  updatedTitle: string
}

function getBaseRefreshPromptCopy(locale: string, currentVersion: string): RefreshPromptCopy {
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

interface RefreshReasonCopy {
  title: string
  details: string
  recurring: string
  reasons: Record<RefreshPromptReason, string>
}

const refreshReasonCopies: Record<string, RefreshReasonCopy> = {
  'zh-CN': {
    title: 'BewlyCat 连接需要恢复',
    details: '诊断详情（反馈时请附上）',
    recurring: '刷新后仍有异常：请检查扩展的站点访问权限；若装有正式版和开发版，请只启用一份；也可在扩展管理页重新启用扩展后重试。',
    reasons: {
      'version-mismatch': '页面脚本与已安装扩展的版本不一致。刷新以加载当前版本；若刷新后仍提示，请重新安装完整的扩展包。',
      'identity-mismatch': '页面脚本与当前扩展的安装身份不一致。刷新后仍出现时，请检查是否同时启用了开发版或另一份安装。',
      'legacy-content-script': '页面使用旧的通信协议，无法确认脚本版本。请刷新页面加载当前脚本。',
      'content-script-unreachable': '多次检测仍找不到页面脚本的通信接收端。脚本可能尚未启动、启动失败或因扩展重载失效；请刷新，并检查扩展的站点访问权限。',
      'content-script-check-failed': '多次检测仍未收到有效的页面脚本响应。可能是页面忙碌、通信中断或脚本异常，暂不能确认是版本问题。请稍后重试或刷新。',
      'context-invalidated': '浏览器报告此页面的扩展连接已失效，常见于扩展更新、重载或停用后重新启用。请刷新页面建立新连接。',
      'background-unreachable': '多次重试后仍无法连接扩展后台，暂不能确认后台为何不可用。请稍后重试；若持续出现，请检查扩展状态后刷新页面。',
    },
  },
  'zh-TW': {
    title: 'BewlyCat 連線需要恢復',
    details: '診斷詳情（回報時請附上）',
    recurring: '重新整理後仍有異常：請檢查擴充功能的網站存取權限；若安裝了正式版和開發版，請只啟用一份；也可在擴充功能管理頁重新啟用後重試。',
    reasons: {
      'version-mismatch': '頁面腳本與已安裝擴充功能的版本不一致。請重新整理；若仍提示，請重新安裝完整的擴充功能套件。',
      'identity-mismatch': '頁面腳本與目前擴充功能的安裝身分不一致。重新整理後仍出現時，請檢查是否同時啟用了開發版或另一份安裝。',
      'legacy-content-script': '頁面使用舊的通訊協定，無法確認腳本版本。請重新整理以載入目前腳本。',
      'content-script-unreachable': '多次偵測仍找不到頁面腳本的通訊接收端。腳本可能尚未啟動、啟動失敗或因擴充功能重載失效；請重新整理並檢查網站存取權限。',
      'content-script-check-failed': '多次偵測仍未收到有效的頁面腳本回應。可能是頁面忙碌、通訊中斷或腳本異常，暫時無法確認是版本問題。請稍後重試或重新整理。',
      'context-invalidated': '瀏覽器回報此頁面的擴充功能連線已失效，常見於更新、重載或停用後重新啟用。請重新整理以建立新連線。',
      'background-unreachable': '多次重試後仍無法連接擴充功能背景程式，暫時無法確認原因。請稍後重試；若持續出現，請檢查擴充功能狀態後重新整理。',
    },
  },
  en: {
    title: 'BewlyCat connection needs recovery',
    details: 'Diagnostic details (include when reporting)',
    recurring: 'Still failing after a refresh: check extension site access, enable only one copy if both release and development editions are installed, or re-enable the extension and try again.',
    reasons: {
      'version-mismatch': 'The page script and installed extension have different versions. Refresh to load the current version. If this persists, reinstall the complete extension package.',
      'identity-mismatch': 'The page script and extension have different installation identities. If refreshing does not help, check for another enabled copy or development edition.',
      'legacy-content-script': 'The page uses an older communication protocol, so its script version cannot be verified. Refresh to load the current script.',
      'content-script-unreachable': 'Repeated checks found no page-script message receiver. The script may not have started, may have failed, or may have been invalidated by a reload. Refresh and check extension site access.',
      'content-script-check-failed': 'Repeated checks received no valid page-script response. The page may be busy, communication may have stopped, or the script may have failed. A version issue is not confirmed. Try later or refresh.',
      'context-invalidated': 'The browser reports that this page’s extension connection is invalid. This can follow an extension update, reload, or disable/re-enable. Refresh to establish a new connection.',
      'background-unreachable': 'The extension background could not be reached after several attempts; the cause is not yet known. Try later. If this persists, check the extension status and refresh.',
    },
  },
  ja: {
    title: 'BewlyCat の接続を復旧してください',
    details: '診断情報（報告時に添付）',
    recurring: '再読み込み後も発生する場合は、サイトへのアクセス権限を確認し、正式版と開発版を同時に有効にせず、拡張機能を有効にし直してください。',
    reasons: {
      'version-mismatch': 'ページのスクリプトと拡張機能のバージョンが異なります。再読み込み後も続く場合は、完全なパッケージを再インストールしてください。',
      'identity-mismatch': 'ページのスクリプトと拡張機能のインストール識別情報が異なります。再読み込み後も続く場合は、開発版など別のコピーが有効になっていないか確認してください。',
      'legacy-content-script': 'ページが古い通信方式を使用しているため、バージョンを確認できません。ページを再読み込みしてください。',
      'content-script-unreachable': '複数回確認しましたが、ページスクリプトの受信先が見つかりません。起動待ち、起動失敗、接続失効の可能性があります。再読み込みとサイトへのアクセス権限の確認をお願いします。',
      'content-script-check-failed': '複数回確認しても有効な応答がありません。ページの高負荷、通信中断、スクリプトの異常が考えられます。バージョンの問題とは断定できません。後で再試行するか再読み込みしてください。',
      'context-invalidated': 'ブラウザーが拡張機能の接続失効を報告しました。更新、再読み込み、再有効化後などに発生します。ページを再読み込みしてください。',
      'background-unreachable': '再試行後も拡張機能のバックグラウンドに接続できません。原因は未確認です。後で再試行し、続く場合は拡張機能の状態を確認して再読み込みしてください。',
    },
  },
  ko: {
    title: 'BewlyCat 연결 복구 필요',
    details: '진단 정보 (신고 시 첨부)',
    recurring: '새로고침 후에도 계속되면 사이트 접근 권한을 확인하고, 정식 버전과 개발 버전 중 하나만 활성화하거나 확장 기능을 다시 활성화해 보세요.',
    reasons: {
      'version-mismatch': '페이지 스크립트와 설치된 확장 기능의 버전이 다릅니다. 새로고침 후에도 계속되면 전체 패키지를 다시 설치하세요.',
      'identity-mismatch': '페이지 스크립트와 확장 기능의 설치 정보가 다릅니다. 새로고침 후에도 계속되면 다른 사본이나 개발 버전이 함께 활성화되어 있는지 확인하세요.',
      'legacy-content-script': '페이지가 이전 통신 방식을 사용하여 스크립트 버전을 확인할 수 없습니다. 페이지를 새로고침하세요.',
      'content-script-unreachable': '여러 번 확인해도 페이지 스크립트의 메시지 수신처를 찾지 못했습니다. 시작 지연, 시작 실패 또는 연결 무효화일 수 있습니다. 새로고침하고 사이트 접근 권한을 확인하세요.',
      'content-script-check-failed': '여러 번 확인해도 유효한 응답이 없습니다. 페이지 과부하, 통신 중단 또는 스크립트 오류일 수 있으며 버전 문제로 단정할 수 없습니다. 나중에 다시 시도하거나 새로고침하세요.',
      'context-invalidated': '브라우저가 이 페이지의 확장 기능 연결이 무효화되었다고 알렸습니다. 업데이트, 다시 로드 또는 재활성화 후 발생할 수 있습니다. 페이지를 새로고침하세요.',
      'background-unreachable': '여러 번 재시도해도 확장 기능 백그라운드에 연결할 수 없습니다. 원인은 아직 확인되지 않았습니다. 나중에 다시 시도하고, 계속되면 확장 기능 상태를 확인한 뒤 새로고침하세요.',
    },
  },
}

export function getRefreshPromptCopy(locale: string, currentVersion: string, diagnostic?: RefreshPromptDiagnostic): RefreshPromptCopy {
  const copy = getBaseRefreshPromptCopy(locale, currentVersion)
  if (!diagnostic)
    return copy

  const normalized = locale.toLowerCase()
  const language = normalized === LanguageType.Mandarin_TW.toLowerCase()
    || normalized === LanguageType.Cantonese || normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk')
    ? 'zh-TW'
    : normalized === LanguageType.Mandarin_CN.toLowerCase() || normalized.startsWith('zh')
      ? 'zh-CN'
      : normalized.startsWith('ja') ? 'ja' : normalized.startsWith('ko') ? 'ko' : 'en'
  const reasonCopy = refreshReasonCopies[language]
  return {
    ...copy,
    diagnostic,
    reasonTitle: diagnostic.reason === 'version-mismatch' ? copy.missingTitle : reasonCopy.title,
    reasonDescription: reasonCopy.reasons[diagnostic.reason],
    detailsLabel: reasonCopy.details,
    recurringDescription: reasonCopy.recurring,
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
  const [copy, expectedUrl] = args as [RefreshPromptCopy, string?]
  if (expectedUrl && location.href !== expectedUrl)
    return

  const health = (globalThis as typeof globalThis & {
    __BEWLYCAT_REFRESH_HEALTH__?: ContentScriptIdentity & { checkedAt: number }
  }).__BEWLYCAT_REFRESH_HEALTH__
  if (copy.diagnostic?.source === 'background' && health
    && Date.now() - health.checkedAt < 10_000
    && health.runtimeUrl === copy.diagnostic.expected?.runtimeUrl
    && health.name === copy.diagnostic.expected?.name
    && health.version === copy.diagnostic.expected?.version) {
    return
  }
  const promptId = 'bewlycat-refresh-required'
  const existingPrompt = document.getElementById(promptId)

  if (existingPrompt) {
    if (existingPrompt.dataset.dismissedVersion === copy.currentVersion)
      return
    // 用已确认的连接失效替换之前的暂时断连提示，不反复叠加弹窗。
    const hasMoreSpecificReason = copy.diagnostic?.reason === 'context-invalidated'
      && existingPrompt.dataset.reason === 'background-unreachable'
    if (!existingPrompt.hidden && !hasMoreSpecificReason)
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
  host.dataset.reason = copy.diagnostic?.reason ?? 'unknown'
  host.dataset.source = copy.diagnostic?.source ?? 'unknown'
  host.dataset.runtimeUrl = copy.diagnostic?.expected?.runtimeUrl ?? ''
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
      width: min(360px, calc(100vw - ${edgeOffset} - ${edgeOffset}));
      max-height: calc(100dvh - ${edgeOffset} - ${edgeOffset});
      overflow-y: auto;
      overscroll-behavior: contain;
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
      overflow-x: hidden;
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
    details {
      margin-top: var(--bew-space-2, 8px);
      font-size: var(--bew-font-size-control, 13px);
      line-height: var(--bew-line-height-control, 18px);
    }
    summary {
      min-height: 24px;
      cursor: pointer;
    }
    summary:focus-visible {
      outline: 2px solid var(--bew-theme-color, #00aeec);
    }
    pre {
      max-height: 160px;
      overflow: auto;
      overscroll-behavior: contain;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: var(--bew-font-size-caption, 12px);
      line-height: var(--bew-line-height-caption, 16px);
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
  title.textContent = copy.reasonTitle ?? (versionChanged ? copy.updatedTitle : copy.missingTitle)

  const description = document.createElement('p')
  description.className = 'description'
  description.textContent = (copy.reasonDescription ?? (versionChanged ? copy.updatedDescription : copy.missingDescription))
    .replace('{version}', copy.currentVersion)

  const refreshAttemptKey = 'bewlycat-refresh-attempt'
  let recurring = false
  try {
    const previous = JSON.parse(sessionStorage.getItem(refreshAttemptKey) || 'null')
    recurring = previous?.version === copy.currentVersion
      && previous?.runtimeUrl === host.dataset.runtimeUrl
      && typeof previous.at === 'number'
      && Date.now() - previous.at < 10 * 60 * 1000
  }
  catch {
    // Storage can be blocked by browser privacy settings.
  }
  if (recurring && copy.recurringDescription) {
    description.textContent += ` ${copy.recurringDescription}`
  }

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
  refreshButton.addEventListener('click', () => {
    try {
      sessionStorage.setItem(refreshAttemptKey, JSON.stringify({
        version: copy.currentVersion,
        runtimeUrl: host.dataset.runtimeUrl,
        at: Date.now(),
      }))
    }
    catch {
      // Refresh must still work when storage is unavailable.
    }
    location.reload()
  })

  content.append(title, description)
  if (copy.diagnostic) {
    const details = document.createElement('details')
    const summary = document.createElement('summary')
    summary.textContent = copy.detailsLabel ?? 'Diagnostic details'
    const diagnosticText = document.createElement('pre')
    diagnosticText.textContent = JSON.stringify({
      reason: copy.diagnostic.reason,
      source: copy.diagnostic.source,
      attempts: copy.diagnostic.attempts,
      failure: copy.diagnostic.failure,
      expected: copy.diagnostic.expected,
      received: copy.diagnostic.received,
      runningVersion,
      promptVersion: copy.currentVersion,
      repeatedAfterRefresh: recurring,
    }, null, 2)
    details.append(summary, diagnosticText)
    content.append(details)
  }
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

type ContentScriptRefreshReason = 'context-invalidated' | 'background-unreachable'

let pendingRefreshPrompt: { reason: ContentScriptRefreshReason, attempts: number } | null = null
let backgroundRecoveryRevision = 0

export function markContentScriptHealthy(identity: ContentScriptIdentity) {
  if (!canShowRefreshPrompt())
    return
  const healthGlobal = globalThis as typeof globalThis & {
    __BEWLYCAT_REFRESH_HEALTH__?: ContentScriptIdentity & { checkedAt: number }
  }
  healthGlobal.__BEWLYCAT_REFRESH_HEALTH__ = { ...identity, checkedAt: Date.now() }
  const prompt = document.getElementById('bewlycat-refresh-required')
  if (prompt?.dataset.source === 'background' && prompt.dataset.runtimeUrl === identity.runtimeUrl && !prompt.hidden)
    prompt.remove()
}

export function markBackgroundConnectionHealthy() {
  if (!canShowRefreshPrompt())
    return
  backgroundRecoveryRevision++
  const prompt = document.getElementById('bewlycat-refresh-required')
  if (prompt?.dataset.reason === 'background-unreachable'
    && prompt.dataset.runtimeUrl === browser.runtime.getURL('') && !prompt.hidden) {
    prompt.remove()
  }
}

export function promptPageRefreshFromContentScript(reason: ContentScriptRefreshReason, attempts: number): void {
  if (!canShowRefreshPrompt())
    return
  if (pendingRefreshPrompt) {
    // 等待语言设置期间也保留已确认的失效原因，后续暂时断连不能将其降级。
    if (reason === 'context-invalidated' && pendingRefreshPrompt.reason !== reason) {
      pendingRefreshPrompt.reason = reason
      pendingRefreshPrompt.attempts = attempts
    }
    return
  }
  const existingPrompt = document.getElementById('bewlycat-refresh-required')
  if (existingPrompt && (reason !== 'context-invalidated' || existingPrompt.dataset.reason !== 'background-unreachable'))
    return

  const revision = backgroundRecoveryRevision
  const request = { reason, attempts }
  pendingRefreshPrompt = request
  void (async () => {
    try {
      const locale = await getRefreshPromptLocale()
      if (request.reason === 'background-unreachable' && revision !== backgroundRecoveryRevision)
        return
      let expected: ContentScriptIdentity | undefined
      try {
        expected = {
          name: browser.runtime.getManifest().name,
          version: extensionVersion,
          runtimeUrl: browser.runtime.getURL(''),
        }
      }
      catch {
        // Identity APIs may already be unavailable for an invalidated context.
      }
      const copy = getRefreshPromptCopy(locale, extensionVersion, {
        reason: request.reason,
        source: 'content-script',
        attempts: request.attempts,
        expected,
      })
      showRefreshPrompt(copy)
    }
    catch (error) {
      console.warn('[BewlyCat] Failed to show the refresh prompt.', error)
    }
    finally {
      pendingRefreshPrompt = null
    }
  })()
}
