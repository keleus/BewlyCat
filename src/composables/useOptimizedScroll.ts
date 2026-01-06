import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 优化的滚动处理 Composable
 * 使用 requestAnimationFrame 批量处理 DOM 读取，避免 Forced Reflow
 */

interface UseOptimizedScrollOptions {
  // 滚动到底部的阈值（距离底部多少像素时触发）
  bottomThreshold?: number
  // 滚动到顶部的阈值
  topThreshold?: number
  // 节流延迟（毫秒）
  throttleDelay?: number
}

export function useOptimizedScroll(
  scrollElement: Ref<HTMLElement | undefined>,
  callbacks: {
    onReachBottom?: () => void | Promise<void>
    onReachTop?: () => void
    onScroll?: (scrollInfo: {
      scrollTop: number
      scrollHeight: number
      clientHeight: number
      percentage: number
    }) => void
  },
  options: UseOptimizedScrollOptions = {},
) {
  const {
    bottomThreshold = 300,
    topThreshold = 100,
    throttleDelay = 150, // 增加到 150ms，减少快速滚动时的触发频率
  } = options

  const isScrolling = ref(false)
  const isAtBottom = ref(false)
  const isAtTop = ref(true)
  const scrollPercentage = ref(0)

  // 使用 RAF 批量处理标志
  let ticking = false
  let lastScrollTime = 0
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null

  // 批量读取 DOM 属性，避免 Forced Reflow
  function batchReadScrollInfo() {
    const element = scrollElement.value
    if (!element)
      return null

    // 一次性读取所有需要的布局属性
    const scrollTop = element.scrollTop
    const scrollHeight = element.scrollHeight
    const clientHeight = element.clientHeight

    return {
      scrollTop,
      scrollHeight,
      clientHeight,
      percentage: (scrollTop / (scrollHeight - clientHeight)) * 100,
    }
  }

  // 处理滚动逻辑
  function handleScrollLogic() {
    const scrollInfo = batchReadScrollInfo()
    if (!scrollInfo)
      return

    const { scrollTop, scrollHeight, clientHeight, percentage } = scrollInfo

    // 更新状态
    scrollPercentage.value = percentage
    isAtTop.value = scrollTop <= topThreshold
    isAtBottom.value = scrollHeight - scrollTop - clientHeight <= bottomThreshold

    // 触发回调
    callbacks.onScroll?.(scrollInfo)

    if (isAtBottom.value && callbacks.onReachBottom) {
      callbacks.onReachBottom()
    }

    if (isAtTop.value && callbacks.onReachTop) {
      callbacks.onReachTop()
    }
  }

  // 优化的滚动处理函数
  function onScroll() {
    const now = Date.now()

    // 节流检查
    if (now - lastScrollTime < throttleDelay) {
      return
    }
    lastScrollTime = now

    // 设置滚动状态
    isScrolling.value = true

    // 清除之前的超时
    if (scrollTimeout) {
      clearTimeout(scrollTimeout)
    }

    // 使用 RAF 批量处理
    if (!ticking) {
      requestAnimationFrame(() => {
        handleScrollLogic()
        ticking = false
      })
      ticking = true
    }

    // 滚动结束检测
    scrollTimeout = setTimeout(() => {
      isScrolling.value = false
      // 在滚动停止时强制检查一次位置，防止快速滚动时因节流错过触发点
      handleScrollLogic()
    }, 150)
  }

  // 挂载和卸载
  onMounted(() => {
    const element = scrollElement.value
    if (!element)
      return

    element.addEventListener('scroll', onScroll, { passive: true })

    // 初始检查
    handleScrollLogic()
  })

  onBeforeUnmount(() => {
    const element = scrollElement.value
    if (element) {
      element.removeEventListener('scroll', onScroll)
    }

    if (scrollTimeout) {
      clearTimeout(scrollTimeout)
    }
  })

  // 手动触发滚动检查（用于数据加载后）
  function checkScroll() {
    handleScrollLogic()
  }

  return {
    isScrolling,
    isAtBottom,
    isAtTop,
    scrollPercentage,
    checkScroll,
  }
}

/**
 * 简化版：仅用于检测是否到达底部（用于无限滚动）
 */
export function useScrollToBottom(
  scrollElement: Ref<HTMLElement | undefined>,
  onReachBottom: () => void | Promise<void>,
  options: { threshold?: number } = {},
) {
  return useOptimizedScroll(
    scrollElement,
    { onReachBottom },
    { bottomThreshold: options.threshold ?? 300 },
  )
}
