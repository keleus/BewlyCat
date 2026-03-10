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
