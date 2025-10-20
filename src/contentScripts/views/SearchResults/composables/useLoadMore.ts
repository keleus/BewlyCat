import { nextTick, ref } from 'vue'

export interface LoadMoreOptions {
  cooldownMs?: number
  retryDelayMs?: number
  maxAutoFillAttempts?: number
}

export interface LoadMoreState {
  pending: boolean
  lastTriggered: number
  lastAppended: number
  autoFillAttempts: number
}

/**
 * 无限加载的通用 composable
 * 管理分页、加载状态、防抖和自动填充
 */
export function useLoadMore(
  loadFn: () => Promise<{ success: boolean, itemsCount: number }>,
  options: LoadMoreOptions = {},
) {
  const {
    cooldownMs = 800,
    retryDelayMs = 120,
    maxAutoFillAttempts = 2,
  } = options

  const page = ref(0)
  const hasMore = ref(true)
  const exhausted = ref(false)

  const state = ref<LoadMoreState>({
    pending: false,
    lastTriggered: 0,
    lastAppended: 0,
    autoFillAttempts: 0,
  })

  let loadMoreTimer: number | undefined

  /**
   * 清除定时器
   */
  function clearTimer() {
    if (loadMoreTimer !== undefined) {
      clearTimeout(loadMoreTimer)
      loadMoreTimer = undefined
    }
  }

  /**
   * 调度加载更多尝试
   */
  function scheduleAttempt(delay: number) {
    clearTimer()
    const effectiveDelay = Math.max(delay, 0)
    state.value.pending = true

    loadMoreTimer = window.setTimeout(() => {
      loadMoreTimer = undefined
      void attemptLoadMore()
    }, effectiveDelay)
  }

  /**
   * 尝试加载更多
   */
  async function attemptLoadMore() {
    if (!hasMore.value || exhausted.value) {
      state.value.pending = false
      state.value.autoFillAttempts = 0
      return
    }

    state.value.pending = false
    state.value.lastTriggered = Date.now()
    state.value.autoFillAttempts = 0

    const result = await loadFn()

    if (result.success) {
      page.value += 1
      state.value.lastAppended = result.itemsCount

      if (result.itemsCount === 0)
        exhausted.value = true
    }
  }

  /**
   * 请求加载更多（带防抖）
   */
  function requestLoadMore() {
    if (!hasMore.value || exhausted.value)
      return

    const now = Date.now()
    const elapsed = now - state.value.lastTriggered

    // 如果在冷却期内，标记为pending并调度延迟加载
    if (elapsed < cooldownMs) {
      if (!state.value.pending) {
        const remainingCooldown = cooldownMs - elapsed
        scheduleAttempt(remainingCooldown)
      }
      return
    }

    void attemptLoadMore()
  }

  /**
   * 处理加载完成后的自动填充逻辑
   * @param haveScrollbar 检查是否有滚动条的函数
   */
  async function handleLoadMoreCompletion(haveScrollbar: () => Promise<boolean>) {
    await waitForRender()

    const now = Date.now()
    const elapsed = now - state.value.lastTriggered
    const remainingCooldown = Math.max(cooldownMs - elapsed, 0)

    // 如果有挂起的请求，继续调度
    if (state.value.pending && hasMore.value) {
      scheduleAttempt(Math.max(remainingCooldown, retryDelayMs))
      return
    }

    if (!hasMore.value) {
      state.value.autoFillAttempts = 0
      return
    }

    // 检查是否需要自动填充
    const appendedItems = state.value.lastAppended
    if (appendedItems <= 0) {
      state.value.autoFillAttempts = 0
      return
    }

    if (state.value.autoFillAttempts >= maxAutoFillAttempts) {
      state.value.autoFillAttempts = 0
      return
    }

    const hasScrollBar = await haveScrollbar()
    if (hasScrollBar) {
      state.value.autoFillAttempts = 0
      return
    }

    state.value.autoFillAttempts += 1
    scheduleAttempt(Math.max(remainingCooldown, retryDelayMs))
  }

  /**
   * 重置状态
   */
  function reset() {
    page.value = 0
    hasMore.value = true
    exhausted.value = false
    state.value = {
      pending: false,
      lastTriggered: 0,
      lastAppended: 0,
      autoFillAttempts: 0,
    }
    clearTimer()
  }

  /**
   * 设置是否还有更多数据
   */
  function setHasMore(value: boolean) {
    hasMore.value = value
  }

  /**
   * 设置已耗尽状态
   */
  function setExhausted(value: boolean) {
    exhausted.value = value
  }

  return {
    page,
    hasMore,
    exhausted,
    requestLoadMore,
    handleLoadMoreCompletion,
    reset,
    setHasMore,
    setExhausted,
  }
}

/**
 * 等待渲染完成
 */
async function waitForRender() {
  await nextTick()
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  }
}
