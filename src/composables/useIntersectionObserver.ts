import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 通用的 Intersection Observer Composable
 * 用于检测元素是否进入视口
 */

interface UseIntersectionObserverOptions {
  // 距离视口多少像素时触发
  rootMargin?: string
  // 可见比例阈值 (0-1)
  threshold?: number | number[]
  // 根元素，默认为视口
  root?: Element | null
  // 是否只触发一次
  once?: boolean
}

export function useIntersectionObserver(
  target: Ref<Element | undefined>,
  callback: (isIntersecting: boolean, entry: IntersectionObserverEntry) => void,
  options: UseIntersectionObserverOptions = {},
) {
  const {
    rootMargin = '0px',
    threshold = 0,
    root = null,
    once = false,
  } = options

  const isIntersecting = ref(false)
  let observer: IntersectionObserver | null = null

  const cleanup = () => {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  }

  onMounted(() => {
    if (!target.value)
      return

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isIntersecting.value = entry.isIntersecting
          callback(entry.isIntersecting, entry)

          // 如果只触发一次且已经交叉，则断开 observer
          if (once && entry.isIntersecting) {
            cleanup()
          }
        })
      },
      {
        root,
        rootMargin,
        threshold,
      },
    )

    observer.observe(target.value)
  })

  onBeforeUnmount(() => {
    cleanup()
  })

  return {
    isIntersecting,
    cleanup,
  }
}

/**
 * 用于无限滚动加载的 Intersection Observer
 * 监听一个"哨兵"元素，当它进入视口时触发加载更多
 */
export function useInfiniteScroll(
  sentinelRef: Ref<Element | undefined>,
  onLoadMore: () => void | Promise<void>,
  options: UseIntersectionObserverOptions = {},
) {
  const isLoading = ref(false)

  const { isIntersecting, cleanup } = useIntersectionObserver(
    sentinelRef,
    async (intersecting) => {
      if (intersecting && !isLoading.value) {
        isLoading.value = true
        try {
          await onLoadMore()
        }
        finally {
          isLoading.value = false
        }
      }
    },
    {
      rootMargin: '200px', // 提前 200px 触发
      threshold: 0.01,
      ...options,
    },
  )

  return {
    isIntersecting,
    isLoading,
    cleanup,
  }
}
