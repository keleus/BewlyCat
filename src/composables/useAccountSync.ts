import { useTopBarStore } from '~/stores/topBarStore'
import { isInIframe } from '~/utils/main'

/**
 * 启动账号信息和角标同步。Bewly 页面、大会员自动领取都依赖这些数据，
 * 不能跟随顶栏组件卸载；是否需要同步由 store 的 needsAccountSync 决定。
 */
export function useAccountSync() {
  // iframe 内的页面共用外层已同步的状态。
  if (isInIframe())
    return

  const topBarStore = useTopBarStore()
  let disposed = false
  // 后台恢复的标签页推迟到首次可见时再初始化，避免多个标签页同时挤占后台请求。
  let initDataDeferred = false

  async function initData() {
    try {
      await topBarStore.initData()
    }
    catch (error) {
      console.error('初始化账号数据失败:', error)
    }
  }

  // 页面重新可见时按本地 Cookie 校正登录态：覆盖「他处登录/登出后
  // 本标签处于后台」的场景，无需轮询（见 issue #921）
  function handleVisibilityChange() {
    if (document.hidden) {
      topBarStore.stopUpdateTimer()
      return
    }

    if (initDataDeferred) {
      initDataDeferred = false
      void initData().then(() => {
        if (!disposed && !document.hidden)
          topBarStore.startUpdateTimer()
      })
      return
    }

    topBarStore.reconcileLocalLoginState()
    topBarStore.startUpdateTimer()
    void topBarStore.syncSharedData().catch((error) => {
      console.error('同步账号共享状态失败:', error)
    })
  }

  // 在设置页开启相关模块后，已打开的页面无需刷新即可拿到账号数据。
  watch(() => topBarStore.needsAccountSync, (needed) => {
    if (!needed || document.hidden)
      return

    void initData().then(() => {
      if (!disposed)
        topBarStore.startUpdateTimer()
    })
  })

  onMounted(() => {
    nextTick(async () => {
      if (document.hidden)
        initDataDeferred = true
      else
        await initData()
      if (disposed)
        return

      // 启动定时器：已登录时同步角标/补填 userInfo；未登录时不启动轮询，
      // 登录态由本地 Cookie 事实与事件驱动维护（见 issue #921）
      topBarStore.startUpdateTimer()
      document.addEventListener('visibilitychange', handleVisibilityChange)
    })
  })

  onUnmounted(() => {
    disposed = true
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    topBarStore.cleanup()
  })
}
