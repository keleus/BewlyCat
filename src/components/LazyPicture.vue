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
  // rootMargin: 距离视口多少像素时开始加载，默认 100px
  rootMargin?: string
  // 是否显示骨架屏动画
  showSkeleton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  loading: 'lazy',
  rootMargin: '300px', // 增加到 300px，提前加载以分散加载时机
  showSkeleton: true,
})

const emit = defineEmits<{
  loaded: []
}>()

const imgRef = ref<HTMLElement>()
const isVisible = ref(false)
const isLoaded = ref(false)
const actualSrc = ref('')
const pendingLoad = ref(false) // 标记是否有待加载的图片

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
    isVisible.value = true
    actualSrc.value = props.src
    pendingLoad.value = false
  }
})

onMounted(() => {
  // 如果已经是 eager 模式，不需要 observer
  if (props.loading === 'eager')
    return

  // 创建 Intersection Observer
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isVisible.value) {
          // 如果正在快速滚动，标记为待加载
          if (isScrolling.value) {
            pendingLoad.value = true
          }
          else {
            // 图片即将进入视口，开始加载
            isVisible.value = true
            actualSrc.value = props.src
          }

          // 加载完成后断开 observer
          observer.disconnect()
        }
      })
    },
    {
      rootMargin: props.rootMargin, // 提前加载距离
      threshold: 0.01, // 只要有1%可见就触发
    },
  )

  if (imgRef.value) {
    observer.observe(imgRef.value)
  }

  onBeforeUnmount(() => {
    observer.disconnect()
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
    w-full max-w-full align-middle object-cover
    rounded="$bew-radius"
    bg="$bew-skeleton"
    style="aspect-ratio: 16 / 9; display: block;"
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
        block w-full h-full object-cover
        rounded-inherit
        style="aspect-ratio: 16 / 9;"
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
