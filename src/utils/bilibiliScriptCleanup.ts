/**
 * B站脚本资源清理工具（温和版本）
 * 用于在替换首页时减少B站原生脚本的性能影响，避免内存泄漏
 */

/**
 * 清理 B 站的全局变量和对象
 */
function cleanupGlobalObjects() {
  try {
    // 清理一些已知的B站全局对象（更谨慎的列表）
    const bilibiliGlobals = [
      '__INITIAL_STATE__',
      '__playinfo__',
    ]

    bilibiliGlobals.forEach((key) => {
      if ((window as any)[key]) {
        try {
          // 不删除，而是设置为 null，避免脚本报错
          (window as any)[key] = null
        }
        catch {
          // 忽略错误
        }
      }
    })

    console.log('[BewlyBewly] Cleaned up Bilibili global objects')
  }
  catch (e) {
    console.warn('[BewlyBewly] Failed to cleanup global objects:', e)
  }
}

/**
 * 主清理函数（温和版本）
 * 在清空 DOM 之前调用，减少 B 站脚本的性能影响
 */
export function cleanupBilibiliScripts() {
  console.log('[BewlyBewly] Starting gentle Bilibili script cleanup...')

  try {
    // 清理全局对象
    cleanupGlobalObjects()

    console.log('[BewlyBewly] Gentle cleanup completed')
  }
  catch (e) {
    console.error('[BewlyBewly] Error during script cleanup:', e)
  }
}

/**
 * 使用 CSS 隐藏原始页面（推荐方式）
 * 比直接删除 DOM 更温和，减少脚本错误
 */
export function hideOriginalBilibiliPage() {
  try {
    // 使用 CSS 隐藏而不是删除 DOM
    const style = document.createElement('style')
    style.id = 'bewly-hide-original'
    style.textContent = `
      body > *:not(#bewly):not(script):not(style) {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        position: absolute !important;
        left: -9999px !important;
      }
    `
    document.head.appendChild(style)

    console.log('[BewlyBewly] Hidden original Bilibili page using CSS')
  }
  catch (e) {
    console.error('[BewlyBewly] Error hiding original page:', e)
  }
}
