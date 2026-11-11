import { PAGE_SCRIPT_PING, readPageScriptIdentityMessage } from '~/utils/pageScriptIdentity'
import { promptPageRefreshFromContentScript } from '~/utils/refreshPrompt'

// 页面脚本在 document_start 运行，正常情况下会在 content script 询问前后很快回应。
const PAGE_SCRIPT_RESPONSE_TIMEOUT_MS = 5000

/**
 * 确认页面中正在运行的 MAIN world 页面脚本与当前 content script 属于同一版本。
 * 没有回应时不提示：Electron、旧版 Firefox 等环境本来就不运行页面脚本。
 */
export function verifyPageScriptVersion(expectedVersion: string): void {
  try {
    if (window.top !== window)
      return
  }
  catch {
    return
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    clearTimeout(timer)
    window.removeEventListener('message', onMessage)
  }
  function onMessage(event: MessageEvent) {
    if (event.source !== window)
      return
    const identity = readPageScriptIdentityMessage(event.data)
    if (!identity)
      return
    stop()
    if (identity === 'legacy')
      promptPageRefreshFromContentScript('legacy-content-script', 1, identity)
    // 开发模式各脚本独立编译，提交号不同不代表协议不兼容，只比较版本。
    else if (identity.version !== expectedVersion)
      promptPageRefreshFromContentScript('version-mismatch', 1, identity)
  }

  window.addEventListener('message', onMessage)
  timer = setTimeout(stop, PAGE_SCRIPT_RESPONSE_TIMEOUT_MS)
  try {
    window.postMessage({ type: PAGE_SCRIPT_PING }, window.location.origin)
  }
  catch {
    stop()
  }
}
