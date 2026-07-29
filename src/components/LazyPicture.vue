<script lang="ts">
import type { BewlyAppProvider } from '~/composables/useAppProvider'
import { settings } from '~/logic'

// 仅记录“曾经加载过”的 URL，避免重复淡入；不持有 ImageBitmap。
const MAX_REMEMBERED_PICTURES = 240
const loadedPictureSources = new Set<string>()

type SharedIntersectionCallback = (entry: IntersectionObserverEntry) => void

interface SharedObserverRecord {
  root: Element | null
  rootMargin: string
  callbacks: Map<Element, SharedIntersectionCallback>
  observer: IntersectionObserver
}

const sharedObserverRecords: SharedObserverRecord[] = []

function observeIntersection(
  element: Element,
  root: Element | null,
  rootMargin: string,
  callback: SharedIntersectionCallback,
) {
  let record = sharedObserverRecords.find(item => item.root === root && item.rootMargin === rootMargin)

  if (!record) {
    const callbacks = new Map<Element, SharedIntersectionCallback>()
    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => callbacks.get(entry.target)?.(entry)),
      { root, rootMargin, threshold: 0.01 },
    )
    record = { root, rootMargin, callbacks, observer }
    sharedObserverRecords.push(record)
  }

  record.callbacks.set(element, callback)
  record.observer.observe(element)

  return () => {
    if (!record)
      return

    record.observer.unobserve(element)
    record.callbacks.delete(element)

    if (record.callbacks.size > 0)
      return

    record.observer.disconnect()
    const recordIndex = sharedObserverRecords.indexOf(record)
    if (recordIndex >= 0)
      sharedObserverRecords.splice(recordIndex, 1)
  }
}

interface PendingImageRelease {
  deadline: number
  release: () => void
}

const pendingImageReleases = new Map<Element, PendingImageRelease>()
let releaseSweepTimer: ReturnType<typeof setTimeout> | null = null

function runReleaseSweep() {
  releaseSweepTimer = null
  const now = Date.now()
  let nextDeadline = Number.POSITIVE_INFINITY

  for (const [element, pendingRelease] of pendingImageReleases) {
    if (pendingRelease.deadline <= now) {
      pendingImageReleases.delete(element)
      pendingRelease.release()
    }
    else {
      nextDeadline = Math.min(nextDeadline, pendingRelease.deadline)
    }
  }

  if (Number.isFinite(nextDeadline)) {
    releaseSweepTimer = setTimeout(
      runReleaseSweep,
      Math.max(0, nextDeadline - Date.now()),
    )
  }
}

function scheduleImageRelease(element: Element, delay: number, release: () => void) {
  pendingImageReleases.set(element, {
    deadline: Date.now() + Math.max(0, delay),
    release,
  })

  if (releaseSweepTimer !== null)
    clearTimeout(releaseSweepTimer)
  runReleaseSweep()
}

function cancelImageRelease(element: Element | undefined) {
  if (element)
    pendingImageReleases.delete(element)
}

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
  // 离开保留范围后延迟释放，避免快速往返滚动时反复解码
  releaseDelay?: number
  // 是否显示骨架屏动画
  showSkeleton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  loading: 'lazy',
  rootMargin: '120px',
  releaseOffscreen: true,
  retainScreens: 1,
  releaseDelay: 2000,
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

let stopObserving: (() => void) | null = null
let isWithinRetainedRange = props.loading === 'eager'

function cleanupObserver() {
  stopObserving?.()
  stopObserving = null
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
  if (!props.releaseOffscreen)
    return props.rootMargin || '120px'

  // IntersectionObserver 的百分比 rootMargin 按宽度计算，改用视口高度换算的 px。
  const margin = Math.max(1, Math.round(getViewportHeight() * getRetainScreens()))
  return `${margin}px 0px`
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

function cancelScheduledRelease() {
  cancelImageRelease(imgRef.value)
}

function scheduleRelease() {
  const element = imgRef.value
  if (!element || !isVisible.value || !props.releaseOffscreen || props.loading === 'eager')
    return

  scheduleImageRelease(element, props.releaseDelay, () => {
    if (!isWithinRetainedRange)
      releaseImage()
  })
}

function createObserver() {
  cancelScheduledRelease()
  cleanupObserver()

  if (props.loading === 'eager')
    return

  const element = imgRef.value
  if (!element)
    return

  stopObserving = observeIntersection(
    element,
    getObserverRoot(),
    getObserverRootMargin(),
    (entry) => {
      isWithinRetainedRange = entry.isIntersecting

      if (entry.isIntersecting) {
        cancelScheduledRelease()
        if (!isVisible.value)
          startLoad()
        return
      }

      scheduleRelease()
    },
  )
}

function bindImageEl(el: Element | { $el?: unknown } | null) {
  const raw = el && typeof el === 'object' && '$el' in el ? el.$el : el
  imageElRef.value = raw instanceof HTMLImageElement ? raw : null
}

onMounted(() => {
  if (props.loading === 'eager')
    return

  createObserver()
})

onBeforeUnmount(() => {
  cleanupObserver()
  cancelScheduledRelease()
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
        loading="eager"
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
