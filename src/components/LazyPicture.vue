<script lang="ts">
import type { BewlyAppProvider } from '~/composables/useAppProvider'
import { settings } from '~/logic'

// 仅记录“曾经加载过”的 URL，避免重复淡入；不持有 ImageBitmap。
const MAX_REMEMBERED_PICTURES = 240
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

  while (loadedPictureSources.size > MAX_REMEMBERED_PICTURES) {
    const oldestSource = loadedPictureSources.values().next().value
    if (!oldestSource)
      break
    loadedPictureSources.delete(oldestSource)
  }
}

function forgetLoadedPicture(src: string) {
  if (!src)
    return
  loadedPictureSources.delete(src)
}
</script>

<script setup lang="ts">
/**
 * 优化的懒加载图片组件
 * 使用 Intersection Observer API 实现精确的懒加载控制
 * 只在图片即将进入视口时才开始加载，离开保留区后释放 img，降低滚动内存占用
 */

interface Props {
  src: string
  alt?: string
  loading?: 'lazy' | 'eager'
  // 预加载边距（仅控制开始加载），默认 120px
  rootMargin?: string
  // 是否在图片离开保留范围后释放 img/src
  releaseOffscreen?: boolean
  // 保留可视区域上下多少屏内的图片（释放阈值）
  retainScreens?: number
  // 是否显示骨架屏动画
  showSkeleton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  loading: 'lazy',
  rootMargin: '120px',
  releaseOffscreen: true,
  retainScreens: 1,
  showSkeleton: true,
})

const emit = defineEmits<{
  loaded: []
}>()

const bewlyApp = inject<BewlyAppProvider | undefined>('BEWLY_APP', undefined)
const imgRef = ref<HTMLElement>()
const imageElRef = ref<HTMLImageElement | null>(null)
// 不再因为“曾经加载过”就立刻挂 src，避免离屏卡片重新吃内存。
const isVisible = ref(props.loading === 'eager')
const isLoaded = ref(false)
const actualSrc = ref(props.loading === 'eager' ? props.src : '')
const skipRevealTransition = ref(false)

let observer: IntersectionObserver | null = null

function cleanupObserver() {
  observer?.disconnect()
  observer = null
}

function getObserverRoot(): Element | null {
  if (typeof window === 'undefined')
    return null
  if (settings.value.useOriginalBilibiliHomepage)
    return null
  const viewport = bewlyApp?.scrollViewportRef?.value
  return viewport?.isConnected ? viewport : null
}

function getViewportHeight(): number {
  const root = getObserverRoot()
  if (root instanceof HTMLElement && root.clientHeight > 0)
    return root.clientHeight
  return typeof window !== 'undefined' ? window.innerHeight : 0
}

function getRetainScreens(): number {
  return Number.isFinite(props.retainScreens) && props.retainScreens! > 0
    ? props.retainScreens!
    : 1
}

function getObserverRootMargin(): string {
  // release 模式下 rootMargin 同时决定“开始加载/允许释放”的边界。
  // 必须用保留屏数，否则离开较小 rootMargin 后不会再收到回调，图片无法释放。
  if (!props.releaseOffscreen)
    return props.rootMargin || '120px'

  const screens = getRetainScreens()
  return `${screens * 100}% 0px`
}

function isElementInRetainedRange(element: HTMLElement): boolean {
  if (!props.releaseOffscreen)
    return true

  const screens = getRetainScreens()
  const margin = getViewportHeight() * screens
  const root = getObserverRoot()

  if (root instanceof HTMLElement) {
    const rootRect = root.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    return rect.bottom >= rootRect.top - margin && rect.top <= rootRect.bottom + margin
  }

  const rect = element.getBoundingClientRect()
  return rect.bottom >= -margin && rect.top <= getViewportHeight() + margin
}

function startLoad() {
  const loadedBefore = hasLoadedPicture(props.src)
  skipRevealTransition.value = loadedBefore
  // 重新挂载解码资源时仍走短暂占位，避免空白闪断过长
  isLoaded.value = false
  isVisible.value = true
  actualSrc.value = props.src
}

function detachImageElement() {
  const imageEl = imageElRef.value
  if (imageEl) {
    // 主动断开 src，帮助浏览器更快释放解码缓存。
    imageEl.removeAttribute('src')
    imageEl.removeAttribute('srcset')
  }
  imageElRef.value = null
}

function releaseImage() {
  if (!props.releaseOffscreen || props.loading === 'eager')
    return

  detachImageElement()
  actualSrc.value = ''
  isVisible.value = false
  isLoaded.value = false
  skipRevealTransition.value = hasLoadedPicture(props.src)
}

function createObserver() {
  cleanupObserver()

  if (props.loading === 'eager')
    return

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (!isVisible.value)
            startLoad()
          return
        }

        if (!isVisible.value || !props.releaseOffscreen)
          return

        // 离开保留区（rootMargin=retainScreens）后立即卸载图片解码资源。
        releaseImage()
      })
    },
    {
      root: getObserverRoot(),
      rootMargin: getObserverRootMargin(),
      threshold: 0.01,
    },
  )

  if (imgRef.value)
    observer.observe(imgRef.value)
}

function bindImageEl(el: Element | { $el?: unknown } | null) {
  const raw = el && typeof el === 'object' && '$el' in el ? el.$el : el
  imageElRef.value = raw instanceof HTMLImageElement ? raw : null
}

onMounted(() => {
  if (props.loading === 'eager')
    return

  createObserver()

  watch(
    () => imgRef.value,
    (newEl) => {
      if (newEl)
        createObserver()
    },
  )

  // 滚动容器可能晚于图片挂载，延迟一次重建 root。
  nextTick(() => {
    createObserver()
    if (imgRef.value && !isVisible.value && isElementInRetainedRange(imgRef.value))
      startLoad()
  })
})

onBeforeUnmount(() => {
  cleanupObserver()
  detachImageElement()
  actualSrc.value = ''
  isVisible.value = false
  isLoaded.value = false
})

function handleImageLoad() {
  rememberLoadedPicture(actualSrc.value)
  isLoaded.value = true
  emit('loaded')
}

watch(() => props.src, (newSrc, oldSrc) => {
  if (oldSrc && oldSrc !== newSrc)
    forgetLoadedPicture(oldSrc)

  skipRevealTransition.value = hasLoadedPicture(newSrc)
  isLoaded.value = false

  if (isVisible.value) {
    actualSrc.value = newSrc
    return
  }

  actualSrc.value = ''
})

// 滚动容器引用变化时重建 observer，保证 root 正确。
watch(
  () => bewlyApp?.scrollViewportRef?.value,
  () => {
    if (props.loading === 'eager')
      return
    createObserver()
  },
)
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

    <!-- 实际图片 - 仅在进入加载区后挂载，离开保留区后卸载 -->
    <template v-if="isVisible && actualSrc">
      <source :srcset="`${actualSrc}.avif`" type="image/avif">
      <source :srcset="`${actualSrc}.webp`" type="image/webp">
      <img
        :ref="bindImageEl"
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
  transition: opacity 0.28s ease-out;
}

.image-transition--instant {
  transition: none;
}

.skeleton-fade-leave-active {
  transition: opacity 0.28s ease-out;
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
