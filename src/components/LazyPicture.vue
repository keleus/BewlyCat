<script setup lang="ts">
/**
 * 优化的懒加载图片组件
 * 使用 Intersection Observer API 实现精确的懒加载控制
 * 只在图片即将进入视口时才开始加载，减少不必要的网络请求
 * 通过全局队列限制并发加载数量（可在设置中开关）
 */

import { useGlobalScrollState } from '~/composables/useGlobalScrollState'
import { enqueueImageLoad } from '~/composables/useImageLoadQueue'
import { settings } from '~/logic'

interface Props {
  src: string
  alt?: string
  loading?: 'lazy' | 'eager'
  // rootMargin: 距离视口多少像素时开始加载，默认 150px
  rootMargin?: string
  // 是否显示骨架屏动画
  showSkeleton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  loading: 'lazy',
  rootMargin: '150px', // 平衡预加载和性能
  showSkeleton: true,
})

const emit = defineEmits<{
  loaded: []
}>()

const imgRef = ref<HTMLElement>()
const isVisible = ref(false)
const isLoaded = ref(false)
const actualSrc = ref('')
const pendingLoad = ref(false)

// 队列控制句柄
let queueHandle: { cancel: () => void, done: () => void } | null = null

// IntersectionObserver 实例（需要在 startLoad 中可能重新观察）
let observer: IntersectionObserver | null = null

// 检查元素是否在视口内（不含 rootMargin）
function isInViewport(): boolean {
  if (!imgRef.value)
    return false
  const rect = imgRef.value.getBoundingClientRect()
  return rect.top < window.innerHeight && rect.bottom > 0
}

// 直接加载图片（不经过队列）
function loadDirectly() {
  isVisible.value = true
  actualSrc.value = props.src
}

// 开始加载图片（由队列调度）
function startLoad() {
  // 再次检查是否在视口附近，不在则跳过
  if (!imgRef.value) {
    queueHandle?.done()
    queueHandle = null
    return
  }
  const rect = imgRef.value.getBoundingClientRect()
  const buffer = window.innerHeight // 一个视口高度的缓冲区
  if (rect.bottom < -buffer || rect.top > window.innerHeight + buffer) {
    // 图片已经离开视口太远，跳过加载，重新观察
    queueHandle?.done()
    queueHandle = null
    if (observer && imgRef.value) {
      observer.observe(imgRef.value)
    }
    return
  }

  isVisible.value = true
  actualSrc.value = props.src
}

// 如果是 eager 模式，立即加载（不经过队列）
if (props.loading === 'eager') {
  isVisible.value = true
  actualSrc.value = props.src
}

// 使用全局共享的滚动状态
const { isScrolling } = useGlobalScrollState()

// 监听滚动停止，将待加载的图片加入队列或直接加载
watch(isScrolling, (scrolling) => {
  if (!scrolling && pendingLoad.value && !isVisible.value && !queueHandle) {
    pendingLoad.value = false
    if (settings.value.enableImageLoadConcurrencyLimit) {
      // 视口内的图片优先加载
      queueHandle = enqueueImageLoad(startLoad, isInViewport())
    }
    else {
      loadDirectly()
    }
  }
})

onMounted(() => {
  if (props.loading === 'eager')
    return

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isVisible.value && !queueHandle) {
          if (isScrolling.value) {
            pendingLoad.value = true
          }
          else if (settings.value.enableImageLoadConcurrencyLimit) {
            // 视口内的图片优先加载
            queueHandle = enqueueImageLoad(startLoad, isInViewport())
          }
          else {
            loadDirectly()
          }
          observer?.disconnect()
        }
      })
    },
    {
      rootMargin: props.rootMargin,
      threshold: 0.01,
    },
  )

  if (imgRef.value) {
    observer.observe(imgRef.value)
  }

  onBeforeUnmount(() => {
    observer?.disconnect()
    queueHandle?.cancel()
  })
})

// 监听图片加载完成
function handleImageLoad() {
  isLoaded.value = true
  queueHandle?.done()
  emit('loaded')
}

// 监听图片加载失败（释放队列槽位）
function handleImageError() {
  queueHandle?.done()
}

// 监听 src 变化（用于图片切换场景）
watch(() => props.src, (newSrc) => {
  if (isVisible.value) {
    actualSrc.value = newSrc
    isLoaded.value = false
  }
})
</script>

<template>
  <picture
    ref="imgRef"
    w-full max-w-full align-middle
    rounded="$bew-radius"
    bg="$bew-skeleton"
    style="aspect-ratio: 16 / 9; display: block; overflow: hidden; contain: layout style;"
  >
    <!-- 骨架屏 - 图片未可见时显示（仅当 showSkeleton 为 true 时） -->
    <div
      v-if="!isVisible && showSkeleton"
      w-full h-full
      bg="$bew-skeleton"
      rounded="$bew-radius"
      class="animate-pulse"
      style="aspect-ratio: 16 / 9;"
    />

    <!-- 实际图片 - 图片可见后加载 -->
    <template v-if="isVisible">
      <source :srcset="`${actualSrc}.avif`" type="image/avif">
      <source :srcset="`${actualSrc}.webp`" type="image/webp">
      <img
        :src="actualSrc"
        :alt="alt"
        loading="lazy"
        decoding="async"
        block w-full h-full
        rounded-inherit
        style="aspect-ratio: 16 / 9; object-fit: cover; object-position: center;"
        :style="{ opacity: isLoaded ? 1 : 0 }"
        class="image-transition"
        @load="handleImageLoad"
        @error="handleImageError"
      >
    </template>
  </picture>
</template>

<style scoped>
.image-transition {
  transition: opacity 0.5s ease-out;
  will-change: opacity;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
