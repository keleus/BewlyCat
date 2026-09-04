<script lang="ts">
import type { BewlyAppProvider } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import type {
  ImageLoadQueueCancelReason,
  ImageLoadQueueHandle,
  ImageLoadQueueSettleReason,
} from '~/utils/imageLoadQueue'
import { enqueueImageLoad, getImageLoadPriority, subscribeImageLoadRoot } from '~/utils/imageLoadQueue'

// Only strings are retained. Image/DOM/bitmap objects must not be kept alive.
const MAX_REMEMBERED_PICTURES = 240
const loadedPictureSources = new Set<string>()

type SharedIntersectionCallback = (entry: IntersectionObserverEntry) => void

interface SharedObservation {
  callback: SharedIntersectionCallback
  getRootMargin: () => string
}

interface SharedObserverRecord {
  root: Element | null
  rootMargin: string
  observations: Map<Element, Set<SharedObservation>>
  observer: IntersectionObserver
}

const sharedObserverRecords: SharedObserverRecord[] = []
let sharedResizeListenerActive = false
let sharedRootResizeObserver: ResizeObserver | null = null
const observedRootHeights = new Map<Element, number>()

function syncObservedRoots() {
  if (typeof ResizeObserver === 'undefined')
    return
  const roots = new Set(sharedObserverRecords.map(record => record.root || document.documentElement))
  for (const root of observedRootHeights.keys()) {
    if (!roots.has(root)) {
      sharedRootResizeObserver?.unobserve(root)
      observedRootHeights.delete(root)
    }
  }
  if (!roots.size) {
    sharedRootResizeObserver?.disconnect()
    sharedRootResizeObserver = null
    return
  }
  sharedRootResizeObserver ??= new ResizeObserver((entries) => {
    let changed = false
    for (const { target } of entries) {
      if (observedRootHeights.has(target) && observedRootHeights.get(target) !== target.clientHeight) {
        observedRootHeights.set(target, target.clientHeight)
        changed = true
      }
    }
    if (changed)
      refreshSharedObservers()
  })
  for (const root of roots) {
    if (!observedRootHeights.has(root)) {
      observedRootHeights.set(root, root.clientHeight)
      sharedRootResizeObserver.observe(root)
    }
  }
}

function createIntersectionObserver(record: SharedObserverRecord): IntersectionObserver {
  return new IntersectionObserver(
    entries => entries.forEach((entry) => {
      record.observations.get(entry.target)?.forEach(observation => observation.callback(entry))
    }),
    { root: record.root === document.scrollingElement ? null : record.root, rootMargin: record.rootMargin, threshold: 0.01 },
  )
}

function attachSharedResizeListener() {
  if (sharedResizeListenerActive || typeof window === 'undefined')
    return

  window.addEventListener('resize', refreshSharedObservers)
  sharedResizeListenerActive = true
}

function detachSharedResizeListener() {
  if (!sharedResizeListenerActive || typeof window === 'undefined')
    return

  window.removeEventListener('resize', refreshSharedObservers)
  sharedResizeListenerActive = false
}

function refreshSharedObservers() {
  if (sharedObserverRecords.length === 0)
    return

  const observations = sharedObserverRecords.flatMap(record => [...record.observations.entries()].flatMap(
    ([element, callbacks]) => [...callbacks].map(observation => ({ element, observation, root: record.root })),
  ))

  sharedObserverRecords.forEach((record) => {
    record.observer.disconnect()
    record.observations.clear()
  })
  sharedObserverRecords.length = 0

  observations.forEach(({ element, observation, root }) => {
    const rootMargin = observation.getRootMargin()
    let record = sharedObserverRecords.find(item => item.root === root && item.rootMargin === rootMargin)
    if (!record) {
      record = {
        root,
        rootMargin,
        observations: new Map(),
        observer: undefined as unknown as IntersectionObserver,
      }
      record.observer = createIntersectionObserver(record)
      sharedObserverRecords.push(record)
    }

    let callbacks = record.observations.get(element)
    if (!callbacks) {
      callbacks = new Set()
      record.observations.set(element, callbacks)
      record.observer.observe(element)
    }
    callbacks.add(observation)
  })
}

function observeIntersection(
  element: Element,
  root: Element | null,
  getRootMargin: () => string,
  callback: SharedIntersectionCallback,
) {
  const observation: SharedObservation = { callback, getRootMargin }
  const rootMargin = getRootMargin()
  let record = sharedObserverRecords.find(item => item.root === root && item.rootMargin === rootMargin)

  if (!record) {
    record = {
      root,
      rootMargin,
      observations: new Map(),
      observer: undefined as unknown as IntersectionObserver,
    }
    record.observer = createIntersectionObserver(record)
    sharedObserverRecords.push(record)
  }

  let callbacks = record.observations.get(element)
  if (!callbacks) {
    callbacks = new Set()
    record.observations.set(element, callbacks)
    record.observer.observe(element)
  }
  callbacks.add(observation)
  attachSharedResizeListener()
  syncObservedRoots()

  let active = true
  return () => {
    if (!active)
      return
    active = false

    const currentRecord = sharedObserverRecords.find((item) => {
      const currentCallbacks = item.observations.get(element)
      return currentCallbacks?.has(observation) === true
    })
    if (!currentRecord)
      return

    const currentCallbacks = currentRecord.observations.get(element)
    currentCallbacks?.delete(observation)
    if (currentCallbacks?.size === 0) {
      currentRecord.observations.delete(element)
      currentRecord.observer.unobserve(element)
    }

    if (currentRecord.observations.size > 0)
      return

    currentRecord.observer.disconnect()
    const recordIndex = sharedObserverRecords.indexOf(currentRecord)
    if (recordIndex >= 0)
      sharedObserverRecords.splice(recordIndex, 1)
    syncObservedRoots()
    if (sharedObserverRecords.length === 0)
      detachSharedResizeListener()
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
    deadline: Date.now() + Math.max(0, Number.isFinite(delay) ? delay : 2000),
    release,
  })

  if (releaseSweepTimer !== null)
    clearTimeout(releaseSweepTimer)
  runReleaseSweep()
}

function cancelImageRelease(element: Element | undefined) {
  if (!element)
    return

  pendingImageReleases.delete(element)
  if (pendingImageReleases.size === 0 && releaseSweepTimer !== null) {
    clearTimeout(releaseSweepTimer)
    releaseSweepTimer = null
  }
}

function hasLoadedPicture(src: string): boolean {
  if (!src || !loadedPictureSources.has(src))
    return false

  // Refresh insertion order so recently reused covers are evicted later.
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
  if (src)
    loadedPictureSources.delete(src)
}
</script>

<script setup lang="ts">
/**
 * Lazy picture with two shared visibility bands:
 * - preloadScreens controls when a queued task may mount an image;
 * - retainScreens controls the delayed off-screen release boundary.
 */

interface Props {
  src: string
  alt?: string
  loading?: 'lazy' | 'eager'
  // Fallback margin used when the scroll viewport height is unavailable.
  rootMargin?: string
  retainScreens?: number
  preloadScreens?: number
  releaseDelay?: number
  showSkeleton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  loading: 'lazy',
  rootMargin: '150px',
  retainScreens: 3,
  preloadScreens: 2,
  releaseDelay: 2000,
  showSkeleton: true,
})

const emit = defineEmits<{
  loaded: []
}>()

const bewlyApp = inject<BewlyAppProvider | undefined>('BEWLY_APP', undefined)
const imgRef = ref<HTMLElement>()
const imageElRef = ref<HTMLImageElement | null>(null)
const isImageMounted = ref(props.loading === 'eager')
const isLoaded = ref(false)
const actualSrc = ref(props.loading === 'eager' ? props.src : '')
const skipRevealTransition = ref(false)

type ImageLoadState = 'idle' | 'queued' | 'loading' | 'loaded' | 'failed'

interface ImageLoadWaiter {
  generation: number
  image: HTMLImageElement
  settled: boolean
  resolve: () => void
}

let stopPreloadObserving: (() => void) | null = null
let stopRetainObserving: (() => void) | null = null
let stopRootDirectionSubscription: (() => void) | null = null
let observedRoot: Element | null = null
let queueHandle: ImageLoadQueueHandle | null = null
let imageLoadWaiter: ImageLoadWaiter | null = null
let imageProcessingGeneration: number | null = null
let imageCompletedGeneration: number | null = null
let loadGeneration = 0
let activeImageGeneration = 0
let loadState: ImageLoadState = props.loading === 'eager' ? 'loading' : 'idle'
let isWithinPreloadRange = props.loading === 'eager'
let isWithinRetainedRange = props.loading === 'eager'
let isComponentActive = true

function cleanupObservers() {
  stopPreloadObserving?.()
  stopPreloadObserving = null
  stopRetainObserving?.()
  stopRetainObserving = null
  stopRootDirectionSubscription?.()
  stopRootDirectionSubscription = null
  observedRoot = null
}

function getObserverRoot(): Element | null {
  if (typeof window === 'undefined')
    return null
  if (settings.value.useOriginalBilibiliHomepage)
    return document.scrollingElement
  const viewport = bewlyApp?.scrollViewportRef?.value
  return viewport?.isConnected ? viewport : null
}

function getViewportHeight(root = getObserverRoot()): number {
  if (root instanceof HTMLElement && root.clientHeight > 0)
    return root.clientHeight
  return typeof window !== 'undefined' ? window.innerHeight : 0
}

function getScreenCount(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback
}

function getRetainScreens(): number {
  return Math.max(getPreloadScreens(), getScreenCount(props.retainScreens, 3))
}

function getPreloadScreens(): number {
  return getScreenCount(props.preloadScreens, 2)
}

function getObserverRootMargin(screens: number): string {
  const viewportHeight = getViewportHeight(observedRoot)
  if (viewportHeight <= 0)
    return props.rootMargin || '150px'

  const margin = Math.max(1, Math.round(viewportHeight * screens))
  return `${margin}px 0px`
}

function getPreloadRootMargin() {
  return getObserverRootMargin(getPreloadScreens())
}

function getRetainRootMargin() {
  return getObserverRootMargin(getRetainScreens())
}

function bindImageEl(el: Element | { $el?: unknown } | null) {
  const raw = el && typeof el === 'object' && '$el' in el ? el.$el : el
  imageElRef.value = raw instanceof HTMLImageElement ? raw : null
}

function settleImageWaiter(generation: number) {
  const waiter = imageLoadWaiter
  if (!waiter || waiter.generation !== generation || waiter.settled)
    return

  waiter.settled = true
  imageLoadWaiter = null
  waiter.resolve()
}

function clearImageWaiter() {
  const waiter = imageLoadWaiter
  if (!waiter)
    return

  waiter.settled = true
  imageLoadWaiter = null
  waiter.resolve()
}

function detachImageElement() {
  imgRef.value?.querySelectorAll('source').forEach(source => source.removeAttribute('srcset'))
  const imageEl = imageElRef.value
  if (imageEl) {
    // Clearing the real element releases its decoded resource promptly. The
    // queue deliberately does not use AbortController or a second Image.
    imageEl.removeAttribute('src')
    imageEl.removeAttribute('srcset')
  }
}

function clearImageResources() {
  loadGeneration++
  activeImageGeneration = 0
  imageProcessingGeneration = null
  imageCompletedGeneration = null
  clearImageWaiter()
  detachImageElement()
  actualSrc.value = ''
  isImageMounted.value = false
  isLoaded.value = false
  loadState = 'idle'
}

function cancelCurrentLoad(reason: ImageLoadQueueCancelReason = 'cancelled') {
  const generationBeforeCancel = loadGeneration
  const handle = queueHandle
  queueHandle = null

  if (handle)
    handle.cancel(reason)

  // A task may have settled between the component callback and this call.
  // Clear in that case as well, while avoiding a second generation bump when
  // the queue's cancellation callback already did it.
  if (loadGeneration === generationBeforeCancel)
    clearImageResources()
}

function startEagerImage() {
  if (!isComponentActive || props.loading !== 'eager')
    return

  cancelScheduledRelease()
  cleanupObservers()
  clearImageResources()
  isWithinPreloadRange = true
  isWithinRetainedRange = true
  const generation = ++loadGeneration
  activeImageGeneration = generation
  loadState = 'loading'
  isImageMounted.value = true
  actualSrc.value = props.src
  skipRevealTransition.value = hasLoadedPicture(props.src)
  void checkForCompletedImage(generation)
}

function handleQueueSettled(generation: number, reason: ImageLoadQueueSettleReason) {
  if (generation !== loadGeneration)
    return

  queueHandle = null
  if (loadState === 'loading' && (reason === 'failed' || reason === 'completed')) {
    loadState = 'failed'
  }
}

function handleQueueCancelled(generation: number) {
  if (generation === loadGeneration)
    clearImageResources()
}

function waitForImage(image: HTMLImageElement, generation: number, isCurrent: () => boolean) {
  if (!isCurrent() || generation !== loadGeneration)
    return Promise.resolve()

  return new Promise<void>((resolve) => {
    imageLoadWaiter = { generation, image, settled: false, resolve }

    if (loadState === 'loaded' || loadState === 'failed') {
      settleImageWaiter(generation)
      return
    }

    // Cached images may have completed before the event listener was reached.
    if (!image.complete)
      return
    if (image.naturalWidth > 0)
      void processImageLoad(image, generation)
    else
      handleImageError({ currentTarget: image } as unknown as Event)
  })
}

function isCurrentImage(image: HTMLImageElement, generation: number): boolean {
  return isComponentActive
    && generation === loadGeneration
    && generation === activeImageGeneration
    && image === imageElRef.value
    && image.getAttribute('src') === actualSrc.value
}

async function processImageLoad(image: HTMLImageElement, generation: number) {
  if (!isCurrentImage(image, generation) || imageCompletedGeneration === generation)
    return
  if (imageProcessingGeneration === generation)
    return

  imageProcessingGeneration = generation
  try {
    try {
      await image.decode()
    }
    catch {
      // A successful load is still usable when decode() is unavailable or
      // rejects, so reveal it after the best effort decode.
    }

    if (!isCurrentImage(image, generation))
      return

    imageCompletedGeneration = generation
    loadState = 'loaded'
    rememberLoadedPicture(actualSrc.value)
    isLoaded.value = true
    settleImageWaiter(generation)
    emit('loaded')
  }
  finally {
    if (imageProcessingGeneration === generation)
      imageProcessingGeneration = null
  }
}

function handleImageLoad(event: Event) {
  const image = event.currentTarget
  if (!(image instanceof HTMLImageElement))
    return
  void processImageLoad(image, activeImageGeneration)
}

function handleImageError(event: Event) {
  const image = event.currentTarget
  if (!(image instanceof HTMLImageElement))
    return

  const generation = activeImageGeneration
  if (!isCurrentImage(image, generation))
    return

  loadState = 'failed'
  isLoaded.value = false
  settleImageWaiter(generation)

  if (props.loading !== 'eager') {
    detachImageElement()
    actualSrc.value = ''
    isImageMounted.value = false
  }
}

async function checkForCompletedImage(generation: number) {
  await nextTick()
  const image = imageElRef.value
  if (!image || !isCurrentImage(image, generation) || !image.complete)
    return

  if (image.naturalWidth > 0)
    await processImageLoad(image, generation)
  else
    handleImageError({ currentTarget: image } as unknown as Event)
}

function requestImageLoad() {
  if (!isComponentActive || props.loading === 'eager' || !isWithinPreloadRange)
    return
  if (isImageMounted.value || queueHandle || loadState === 'failed' || !props.src)
    return

  const element = imgRef.value
  const root = observedRoot
  if (!element)
    return

  const source = props.src
  const generation = ++loadGeneration
  loadState = 'queued'
  skipRevealTransition.value = hasLoadedPicture(source)
  isLoaded.value = false

  queueHandle = enqueueImageLoad({
    priority: () => getImageLoadPriority(element, root),
    start: async ({ isCurrent }) => {
      if (!isCurrent() || generation !== loadGeneration || source !== props.src || !isComponentActive)
        return

      // Let a source/root change flush the previous Vue render before the new
      // image element receives a src.
      await nextTick()
      if (!isCurrent() || generation !== loadGeneration || source !== props.src || !isComponentActive)
        return

      const imageGeneration = generation
      activeImageGeneration = imageGeneration
      imageProcessingGeneration = null
      imageCompletedGeneration = null
      isImageMounted.value = true
      actualSrc.value = source
      isLoaded.value = false
      loadState = 'loading'

      await nextTick()
      const image = imageElRef.value
      if (!image || !isCurrent() || generation !== loadGeneration)
        return

      await waitForImage(image, imageGeneration, isCurrent)
    },
    onCancel: () => handleQueueCancelled(generation),
    onSettled: reason => handleQueueSettled(generation, reason),
  })
}

function releaseImage() {
  if (props.loading === 'eager' || !isImageMounted.value)
    return

  cancelCurrentLoad('cancelled')
  skipRevealTransition.value = hasLoadedPicture(props.src)
}

function cancelScheduledRelease() {
  cancelImageRelease(imgRef.value)
}

function scheduleRelease() {
  const element = imgRef.value
  if (!element || !isImageMounted.value || props.loading === 'eager')
    return

  scheduleImageRelease(element, props.releaseDelay, () => {
    if (!isWithinRetainedRange)
      releaseImage()
  })
}

function cancelQueuedImageLoad() {
  if (loadState === 'queued') {
    cancelCurrentLoad('cancelled')
  }
  else if (loadState === 'failed') {
    loadState = 'idle'
  }
}

function createObservers() {
  const nextRoot = getObserverRoot()
  const rootChanged = stopRootDirectionSubscription !== null && observedRoot !== nextRoot
  if (rootChanged && (queueHandle || loadState === 'queued' || loadState === 'loading'))
    cancelCurrentLoad('cancelled')

  cancelScheduledRelease()
  cleanupObservers()

  if (!isComponentActive || props.loading === 'eager')
    return

  const element = imgRef.value
  if (!element)
    return

  observedRoot = nextRoot
  stopRootDirectionSubscription = subscribeImageLoadRoot(observedRoot)
  isWithinPreloadRange = false
  isWithinRetainedRange = false

  if (typeof IntersectionObserver === 'undefined') {
    isWithinPreloadRange = true
    isWithinRetainedRange = true
    requestImageLoad()
    return
  }

  const root = observedRoot
  stopPreloadObserving = observeIntersection(
    element,
    root,
    getPreloadRootMargin,
    (entry) => {
      if (!isComponentActive || observedRoot !== root)
        return

      isWithinPreloadRange = entry.isIntersecting
      if (entry.isIntersecting) {
        cancelScheduledRelease()
        requestImageLoad()
      }
      else {
        // Only queued work is cancelled immediately. An active request gets
        // the retain boundary's grace period before it is physically cleared.
        cancelQueuedImageLoad()
      }
    },
  )
  stopRetainObserving = observeIntersection(
    element,
    root,
    getRetainRootMargin,
    (entry) => {
      if (!isComponentActive || observedRoot !== root)
        return

      isWithinRetainedRange = entry.isIntersecting
      if (entry.isIntersecting)
        cancelScheduledRelease()
      else
        scheduleRelease()
    },
  )
}

function resetForSourceChange() {
  cancelCurrentLoad('cancelled')
  if (!queueHandle && loadState !== 'idle')
    clearImageResources()
  else if (queueHandle)
    queueHandle = null

  // A loaded task normally cleared queueHandle in onSettled. Always clear the
  // actual element on a prop change, including the eager path.
  if (isImageMounted.value || actualSrc.value)
    clearImageResources()
}

onMounted(() => {
  if (props.loading === 'eager') {
    void checkForCompletedImage(activeImageGeneration)
    return
  }
  createObservers()
})

onActivated(() => {
  isComponentActive = true
  if (props.loading === 'eager') {
    startEagerImage()
    return
  }
  createObservers()
})

onDeactivated(() => {
  isComponentActive = false
  cancelScheduledRelease()
  cleanupObservers()
  cancelCurrentLoad('cancelled')
  if (isImageMounted.value || actualSrc.value)
    clearImageResources()
  isWithinPreloadRange = false
  isWithinRetainedRange = false
})

onBeforeUnmount(() => {
  isComponentActive = false
  cleanupObservers()
  cancelScheduledRelease()
  cancelCurrentLoad('cancelled')
  if (isImageMounted.value || actualSrc.value)
    clearImageResources()
})

watch(() => props.src, (newSrc, oldSrc) => {
  if (oldSrc && oldSrc !== newSrc)
    forgetLoadedPicture(oldSrc)

  resetForSourceChange()
  skipRevealTransition.value = hasLoadedPicture(newSrc)
  isLoaded.value = false

  if (!isComponentActive)
    return
  if (props.loading === 'eager') {
    startEagerImage()
    return
  }
  if (isWithinPreloadRange)
    requestImageLoad()
})

watch(() => props.loading, (loading) => {
  resetForSourceChange()
  if (!isComponentActive)
    return

  if (loading === 'eager')
    startEagerImage()
  else
    createObservers()
})

watch(
  () => [
    bewlyApp?.scrollViewportRef?.value,
    settings.value.useOriginalBilibiliHomepage,
    props.retainScreens,
    props.preloadScreens,
    props.rootMargin,
  ] as const,
  () => {
    if (props.loading !== 'eager' && isComponentActive)
      createObservers()
  },
)
</script>

<template>
  <picture
    ref="imgRef"
    w-full max-w-full align-middle
    rounded="$bew-radius"
    style="aspect-ratio: 16 / 9; display: block; position: relative; overflow: hidden; contain: layout style;"
    :style="{ backgroundColor: showSkeleton ? 'var(--bew-skeleton)' : undefined }"
  >
    <!-- Keep the backdrop stable while the decoded image fades in. Removing
         a translucent skeleton at load time changes the backdrop before the
         image becomes opaque, producing a separate brightness flash. -->
    <!-- Queue entries do not mount this branch, so they do not own a src. -->
    <template v-if="isImageMounted && actualSrc">
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
        @error="handleImageError"
      >
    </template>
  </picture>
</template>

<style scoped>
.image-transition {
  position: relative;
  z-index: 1;
  transition: opacity 0.28s ease-out;
}

.image-transition--instant {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .image-transition {
    transition: none;
  }
}
</style>
