<script setup lang="ts">
/**
 * 优化的懒加载图片组件
 * 使用 Intersection Observer API 实现精确的懒加载控制
 * 只在图片即将进入视口时才开始加载，减少不必要的网络请求
 */

import { useGlobalScrollState } from '~/composables/useGlobalScrollState'

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

// IntersectionObserver 实例
let observer: IntersectionObserver | null = null

// 开始加载图片
function startLoad() {
  isVisible.value = true
  actualSrc.value = props.src
}

// 如果是 eager 模式，立即加载
if (props.loading === 'eager') {
  isVisible.value = true
  actualSrc.value = props.src
}

// 使用全局共享的滚动状态
const { isScrolling } = useGlobalScrollState()

// 监听滚动停止，加载待加载的图片
watch(isScrolling, (scrolling) => {
  if (!scrolling && pendingLoad.value && !isVisible.value) {
    pendingLoad.value = false
    startLoad()
  }
})

onMounted(() => {
  // eager 模式直接加载
  if (props.loading === 'eager') {
    return
  }

  // 创建并绑定 IntersectionObserver 的函数
  const createObserver = () => {
    // 先断开之前的 observer，避免重复
    observer?.disconnect()

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible.value) {
            if (isScrolling.value) {
              // 用户正在滚动，先延迟加载
              pendingLoad.value = true
            }
            else {
              // 可见且未滚动，立即加载
              startLoad()
            }
            // 一旦加载，断开 observer，避免重复触发
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
  }

  // 初次创建 observer
  createObserver()

  // 监听 imgRef.value，如果 DOM 刷新或替换，重新绑定 observer
  watch(
    () => imgRef.value,
    (newEl) => {
      if (newEl && !isVisible.value) {
        createObserver()
      }
    },
  )

  // 可选：强制检查可视区立即加载图片（解决刷新后顶部不显示问题）
  nextTick(() => {
    if (imgRef.value && !isVisible.value) {
      const rect = imgRef.value.getBoundingClientRect()
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        startLoad()
      }
    }
  })

  // 页面滚动停止时加载 pending 图片
  watch(isScrolling, (scrolling) => {
    if (!scrolling && pendingLoad.value && !isVisible.value) {
      pendingLoad.value = false
      startLoad()
    }
  })

  // 页面卸载时断开 observer
  onBeforeUnmount(() => {
    observer?.disconnect()
  })
})

// 监听图片加载完成
function handleImageLoad() {
  isLoaded.value = true
  emit('loaded')
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
