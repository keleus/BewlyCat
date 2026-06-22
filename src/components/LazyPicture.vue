<script lang="ts">
const MAX_REMEMBERED_PICTURES = 1000
const loadedPictureSources = new Set<string>()

function hasLoadedPicture(src: string): boolean {
  if (!src || !loadedPictureSources.has(src))
    return false

  // 刷新插入顺序，使最近重新使用的封面更晚被淘汰。
  loadedPictureSources.delete(src)
  loadedPictureSources.add(src)
  return true
}

function rememberLoadedPicture(src: string) {
  if (!src)
    return

  loadedPictureSources.delete(src)
  loadedPictureSources.add(src)

  if (loadedPictureSources.size > MAX_REMEMBERED_PICTURES) {
    const oldestSource = loadedPictureSources.values().next().value
    if (oldestSource)
      loadedPictureSources.delete(oldestSource)
  }
}
</script>

<script setup lang="ts">
/**
 * 优化的懒加载图片组件
 * 使用 Intersection Observer API 实现精确的懒加载控制
 * 只在图片即将进入视口时才开始加载，减少不必要的网络请求
 */

interface Props {
  src: string
  alt?: string
  loading?: 'lazy' | 'eager'
  // rootMargin: 距离视口多少像素时开始加载，默认 150px
  rootMargin?: string
  // 是否在图片离开保留范围后释放 img/src
  releaseOffscreen?: boolean
  // 保留可视区域上下多少屏内的图片
  retainScreens?: number
  // 是否显示骨架屏动画
  showSkeleton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  loading: 'lazy',
  rootMargin: '150px', // 平衡预加载和性能
  releaseOffscreen: true,
  retainScreens: 3,
  showSkeleton: true,
})

const emit = defineEmits<{
  loaded: []
}>()

const initiallyLoaded = hasLoadedPicture(props.src)
const imgRef = ref<HTMLElement>()
const isVisible = ref(props.loading === 'eager' || initiallyLoaded)
const isLoaded = ref(initiallyLoaded)
const actualSrc = ref(isVisible.value ? props.src : '')
const skipRevealTransition = ref(initiallyLoaded)

// IntersectionObserver 实例
let observer: IntersectionObserver | null = null

function cleanupObserver() {
  observer?.disconnect()
  observer = null
}

// 开始加载图片
function startLoad() {
  const loadedBefore = hasLoadedPicture(props.src)
  isLoaded.value = loadedBefore
  skipRevealTransition.value = loadedBefore
  isVisible.value = true
  actualSrc.value = props.src
}

function releaseImage() {
  if (!props.releaseOffscreen || props.loading === 'eager')
    return

  actualSrc.value = ''
  isVisible.value = false
  const loadedBefore = hasLoadedPicture(props.src)
  isLoaded.value = loadedBefore
  skipRevealTransition.value = loadedBefore
}

function getObserverRootMargin() {
  if (!props.releaseOffscreen)
    return props.rootMargin

  const screens = Number.isFinite(props.retainScreens) && props.retainScreens > 0
    ? props.retainScreens
    : 3

  return `${screens * 100}% 0px`
}

function isElementInRetainedRange(element: HTMLElement): boolean {
  const screens = Number.isFinite(props.retainScreens) && props.retainScreens > 0
    ? props.retainScreens
    : 3
  const margin = window.innerHeight * screens
  const rect = element.getBoundingClientRect()

  return rect.bottom >= -margin && rect.top <= window.innerHeight + margin
}

onMounted(() => {
  // eager 模式直接加载
  if (props.loading === 'eager') {
    return
  }

  // 创建并绑定 IntersectionObserver 的函数
  const createObserver = () => {
    // 先断开之前的 observer，避免重复
    cleanupObserver()

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible.value) {
            startLoad()
          }
          else if (!entry.isIntersecting) {
            if (isVisible.value)
              releaseImage()
          }
        })
      },
      {
        rootMargin: getObserverRootMargin(),
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
      if (newEl) {
        createObserver()
      }
    },
  )

  // 可选：强制检查保留范围内立即加载图片（解决刷新后顶部不显示问题）
  nextTick(() => {
    if (imgRef.value && !isVisible.value) {
      if (isElementInRetainedRange(imgRef.value)) {
        startLoad()
      }
    }
  })
})

onBeforeUnmount(() => {
  cleanupObserver()
  actualSrc.value = ''
  isVisible.value = false
  isLoaded.value = false
})

// 监听图片加载完成
function handleImageLoad() {
  rememberLoadedPicture(actualSrc.value)
  isLoaded.value = true
  emit('loaded')
}

// 监听 src 变化（用于图片切换场景）
watch(() => props.src, (newSrc) => {
  const loadedBefore = hasLoadedPicture(newSrc)
  isLoaded.value = loadedBefore
  skipRevealTransition.value = loadedBefore

  if (isVisible.value) {
    actualSrc.value = newSrc
  }
})
</script>

<template>
  <picture
    ref="imgRef"
    w-full max-w-full align-middle
    rounded="$bew-radius"
    style="aspect-ratio: 16 / 9; display: block; position: relative; overflow: hidden; contain: layout style;"
  >
    <!-- 图片完成加载前持续显示骨架层，与真实图片交叉淡出。 -->
    <Transition name="skeleton-fade">
      <div
        v-if="showSkeleton && !isLoaded"
        aria-hidden="true"
        w-full h-full
        bg="$bew-skeleton"
        rounded="$bew-radius"
        class="lazy-picture-skeleton animate-pulse"
      />
    </Transition>

    <!-- 实际图片 - 图片可见后加载 -->
    <template v-if="isVisible && actualSrc">
      <source :srcset="`${actualSrc}.avif`" type="image/avif">
      <source :srcset="`${actualSrc}.webp`" type="image/webp">
      <img
        :src="actualSrc"
        :alt="alt"
        :loading="skipRevealTransition ? 'eager' : loading"
        decoding="async"
        block w-full h-full
        rounded-inherit
        style="aspect-ratio: 16 / 9; object-fit: cover; object-position: center;"
        :style="{ opacity: isLoaded ? 1 : 0 }"
        class="image-transition"
        :class="{ 'image-transition--instant': skipRevealTransition }"
        @load="handleImageLoad"
      >
    </template>
  </picture>
</template>

<style scoped>
.lazy-picture-skeleton {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.image-transition {
  position: relative;
  z-index: 1;
  transition: opacity 0.35s ease-out;
  will-change: opacity;
}

.image-transition--instant {
  transition: none;
}

.skeleton-fade-leave-active {
  transition: opacity 0.35s ease-out;
}

.skeleton-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .image-transition,
  .skeleton-fade-leave-active {
    transition: none;
  }
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
