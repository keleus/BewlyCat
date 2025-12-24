/**
 * 全局滚动状态管理（单例模式）
 * 所有组件共享同一个滚动检测，避免重复监听
 * 支持 window scroll 和 OverlayScrollbars
 */

import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

import { OVERLAY_SCROLL_STATE_CHANGE } from '~/constants/globalEvents'
import emitter from '~/utils/mitt'

// 全局状态（单例）
const isScrolling = ref(false)
let scrollTimeout: ReturnType<typeof setTimeout> | null = null
let listenerCount = 0
let isWindowListenerAttached = false
let isOverlayListenerAttached = false

// Window滚动处理函数（单例）
function handleWindowScroll() {
  isScrolling.value = true

  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
  }

  scrollTimeout = setTimeout(() => {
    isScrolling.value = false
  }, 150)
}

// OverlayScrollbars滚动状态处理函数（单例）
function handleOverlayScrollState(scrolling: boolean) {
  isScrolling.value = scrolling

  // 如果滚动结束，清理可能存在的 timeout
  if (!scrolling && scrollTimeout) {
    clearTimeout(scrollTimeout)
    scrollTimeout = null
  }
}

// 添加监听器（引用计数）
function addScrollListener() {
  listenerCount++

  // 只在第一次添加时绑定事件
  if (!isWindowListenerAttached) {
    window.addEventListener('scroll', handleWindowScroll, { passive: true })
    isWindowListenerAttached = true
  }

  if (!isOverlayListenerAttached) {
    emitter.on(OVERLAY_SCROLL_STATE_CHANGE, handleOverlayScrollState)
    isOverlayListenerAttached = true
  }
}

// 移除监听器（引用计数）
function removeScrollListener() {
  listenerCount--

  // 当所有组件都卸载时，移除事件监听
  if (listenerCount <= 0) {
    if (isWindowListenerAttached) {
      window.removeEventListener('scroll', handleWindowScroll)
      isWindowListenerAttached = false
    }

    if (isOverlayListenerAttached) {
      emitter.off(OVERLAY_SCROLL_STATE_CHANGE, handleOverlayScrollState)
      isOverlayListenerAttached = false
    }

    listenerCount = 0

    if (scrollTimeout) {
      clearTimeout(scrollTimeout)
      scrollTimeout = null
    }
  }
}

/**
 * 使用全局滚动状态
 * 返回是否正在快速滚动
 */
export function useGlobalScrollState() {
  // 组件挂载时添加监听
  onMounted(() => {
    addScrollListener()
  })

  // 组件卸载时移除监听
  onBeforeUnmount(() => {
    removeScrollListener()
  })

  return {
    isScrolling: readonly(isScrolling),
  }
}
