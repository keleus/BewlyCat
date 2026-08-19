<script setup lang="ts">
import { useEventListener, useResizeObserver } from '@vueuse/core'
import type { CSSProperties } from 'vue'

import {
  computeMultiImageGalleryHeight,
  getMomentOriginalImageUrl,
  getMomentThumbnailUrl,
  getMultiImageThumbnailWidth,
  isUsableImageRatio,
  MULTI_IMAGE_GALLERY_MAX_HEIGHT,
} from './utils'

interface Props {
  images: string[]
  imageRatios?: Array<number | undefined>
  altPrefix: string
  containerWidth?: number
}

const {
  images,
  imageRatios,
  altPrefix,
  containerWidth = 0,
} = defineProps<Props>()

const emit = defineEmits<{
  coverLoad: [event: Event]
  preview: [urls: string[], index: number, trigger: HTMLElement | null]
}>()

const rootRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)
const measuredWidth = ref(0)
const loadedRatios = ref<Array<number | undefined>>([])
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const previewUrls = computed(() => images.map(url => getMomentOriginalImageUrl(url)))

const resolvedRatios = computed(() =>
  images.map((_, index) => {
    const fromProp = imageRatios?.[index]
    if (isUsableImageRatio(fromProp))
      return fromProp
    const loaded = loadedRatios.value[index]
    return isUsableImageRatio(loaded) ? loaded : undefined
  }),
)

const galleryWidth = computed(() => measuredWidth.value || containerWidth || 0)
const galleryHeight = computed(() =>
  computeMultiImageGalleryHeight(galleryWidth.value, resolvedRatios.value),
)

const isSingleImage = computed(() => images.length <= 1)

const galleryStyle = computed<CSSProperties>(() => ({
  '--moment-gallery-height': `${galleryHeight.value}px`,
  height: `${galleryHeight.value}px`,
  maxHeight: `${MULTI_IMAGE_GALLERY_MAX_HEIGHT}px`,
}))

const DRAG_THRESHOLD_PX = 8
const pointerDrag = {
  id: -1,
  startX: 0,
  startScroll: 0,
  active: false,
}
let suppressImageClick = false
let scrollStateFrame = 0

function getImageRatio(index: number) {
  return resolvedRatios.value[index]
}

function getImageStyle(index: number): CSSProperties | undefined {
  const ratio = getImageRatio(index)
  if (!ratio)
    return undefined
  return { aspectRatio: String(ratio) }
}

function getImageSrc(url: string, index: number) {
  return getMomentThumbnailUrl(url, getMultiImageThumbnailWidth(getImageRatio(index), galleryHeight.value))
}

function updateScrollState() {
  const track = trackRef.value
  if (!track) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }

  const maxScroll = track.scrollWidth - track.clientWidth
  if (maxScroll <= 1) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }

  canScrollLeft.value = track.scrollLeft > 1
  canScrollRight.value = track.scrollLeft < maxScroll - 1
}

function scheduleScrollState() {
  if (scrollStateFrame)
    return
  scrollStateFrame = window.requestAnimationFrame(() => {
    scrollStateFrame = 0
    updateScrollState()
  })
}

function scrollToImage(direction: -1 | 1) {
  const track = trackRef.value
  if (!track)
    return

  const items = Array.from(track.querySelectorAll<HTMLElement>('[data-gallery-item]'))
  if (!items.length)
    return

  const current = track.scrollLeft
  const target = direction > 0
    ? items.find(item => item.offsetLeft > current + 8)
    : [...items].reverse().find(item => item.offsetLeft < current - 8)

  track.scrollTo({
    left: target ? target.offsetLeft : current + direction * Math.max(track.clientWidth * 0.8, 1),
    behavior: 'smooth',
  })
}

function handleNavClick(event: MouseEvent, direction: -1 | 1) {
  event.preventDefault()
  event.stopPropagation()
  if ((direction < 0 && !canScrollLeft.value) || (direction > 0 && !canScrollRight.value))
    return
  scrollToImage(direction)
}

function handlePreview(event: MouseEvent | KeyboardEvent, index: number) {
  event.preventDefault()
  event.stopPropagation()
  const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  emit('preview', previewUrls.value, index, trigger)
}

function handleImageClick(event: MouseEvent, index: number) {
  if (suppressImageClick) {
    event.preventDefault()
    event.stopPropagation()
    suppressImageClick = false
    return
  }
  handlePreview(event, index)
}

function handleImageKeydown(event: KeyboardEvent, index: number) {
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  handlePreview(event, index)
}

function handleCoverLoad(event: Event, index: number) {
  const img = event.target instanceof HTMLImageElement ? event.target : null
  if (img?.naturalWidth && img.naturalHeight) {
    const ratio = img.naturalWidth / img.naturalHeight
    if (Number.isFinite(ratio) && ratio > 0 && loadedRatios.value[index] !== ratio) {
      const next = loadedRatios.value.slice()
      next[index] = ratio
      loadedRatios.value = next
    }
  }
  if (index === 0)
    emit('coverLoad', event)
  scheduleScrollState()
}

function handlePointerDown(event: PointerEvent) {
  if (isSingleImage.value || event.pointerType !== 'mouse' || event.button !== 0)
    return
  const track = trackRef.value
  if (!track)
    return

  pointerDrag.id = event.pointerId
  pointerDrag.startX = event.clientX
  pointerDrag.startScroll = track.scrollLeft
  pointerDrag.active = false
  suppressImageClick = false
}

function handlePointerMove(event: PointerEvent) {
  if (event.pointerId !== pointerDrag.id)
    return
  const track = trackRef.value
  if (!track)
    return

  const dx = event.clientX - pointerDrag.startX
  if (!pointerDrag.active) {
    if (Math.abs(dx) < DRAG_THRESHOLD_PX)
      return
    pointerDrag.active = true
    suppressImageClick = true
    rootRef.value?.classList.add('moment-image-gallery--dragging')
    track.setPointerCapture(event.pointerId)
  }

  track.scrollLeft = pointerDrag.startScroll - dx
}

function endPointerDrag(event: PointerEvent) {
  if (event.pointerId !== pointerDrag.id)
    return
  const track = trackRef.value
  if (pointerDrag.active && track?.hasPointerCapture(event.pointerId))
    track.releasePointerCapture(event.pointerId)

  pointerDrag.id = -1
  pointerDrag.active = false
  rootRef.value?.classList.remove('moment-image-gallery--dragging')
  if (suppressImageClick) {
    window.setTimeout(() => {
      suppressImageClick = false
    }, 0)
  }
}

function handleTrackKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight' && canScrollRight.value) {
    event.preventDefault()
    event.stopPropagation()
    scrollToImage(1)
  }
  else if (event.key === 'ArrowLeft' && canScrollLeft.value) {
    event.preventDefault()
    event.stopPropagation()
    scrollToImage(-1)
  }
}

useResizeObserver(rootRef, (entries) => {
  const width = entries[0]?.contentRect.width || 0
  if (width > 0 && Math.abs(width - measuredWidth.value) > 0.5)
    measuredWidth.value = width
  scheduleScrollState()
})

useEventListener(trackRef, 'scroll', scheduleScrollState, { passive: true })
useEventListener(trackRef, 'pointerdown', handlePointerDown, { passive: true })
useEventListener(trackRef, 'pointermove', handlePointerMove, { passive: true })
useEventListener(trackRef, 'pointerup', endPointerDrag, { passive: true })
useEventListener(trackRef, 'pointercancel', endPointerDrag, { passive: true })

watch(
  () => [images, galleryHeight.value] as const,
  () => {
    nextTick(updateScrollState)
  },
)

onMounted(updateScrollState)
onBeforeUnmount(() => {
  if (scrollStateFrame)
    window.cancelAnimationFrame(scrollStateFrame)
})
</script>

<template>
  <div
    ref="rootRef"
    class="moment-image-gallery"
    :class="{ 'moment-image-gallery--single': isSingleImage }"
    :style="galleryStyle"
    @keydown="handleTrackKeydown"
  >
    <div
      ref="trackRef"
      class="moment-image-gallery__track"
      role="region"
      :aria-label="`${altPrefix}，可横向滑动查看`"
      @click.stop
    >
      <img
        v-for="(image, imageIndex) in images"
        :key="`${image}-${imageIndex}`"
        data-gallery-item
        class="moment-image-gallery__image"
        :class="{ 'moment-image-gallery__image--unknown-ratio': !getImageRatio(imageIndex) }"
        :src="getImageSrc(image, imageIndex)"
        :alt="`${altPrefix} ${imageIndex + 1}`"
        :aria-label="`查看 ${altPrefix} ${imageIndex + 1}`"
        :style="getImageStyle(imageIndex)"
        tabindex="0"
        role="button"
        draggable="false"
        :loading="imageIndex < 3 ? 'eager' : 'lazy'"
        decoding="async"
        @load="handleCoverLoad($event, imageIndex)"
        @click="handleImageClick($event, imageIndex)"
        @keydown="handleImageKeydown($event, imageIndex)"
      >
    </div>

    <button
      type="button"
      class="moment-image-gallery__nav moment-image-gallery__nav--prev"
      :class="{ 'is-enabled': canScrollLeft }"
      :tabindex="canScrollLeft ? 0 : -1"
      :aria-hidden="!canScrollLeft"
      aria-label="上一张图片"
      @click="handleNavClick($event, -1)"
    >
      <span i-mingcute:left-line aria-hidden="true" />
    </button>
    <button
      type="button"
      class="moment-image-gallery__nav moment-image-gallery__nav--next"
      :class="{ 'is-enabled': canScrollRight }"
      :tabindex="canScrollRight ? 0 : -1"
      :aria-hidden="!canScrollRight"
      aria-label="下一张图片"
      @click="handleNavClick($event, 1)"
    >
      <span i-mingcute:right-line aria-hidden="true" />
    </button>

    <slot />
  </div>
</template>

<style lang="scss" scoped>
.moment-image-gallery {
  position: relative;
  min-width: 0;
  overflow: hidden;
  background: transparent;
  max-height: var(--moment-gallery-height, 350px);
  contain: layout style;
}

.moment-image-gallery--single .moment-image-gallery__track {
  overflow: hidden;
}

.moment-image-gallery--dragging,
.moment-image-gallery--dragging .moment-image-gallery__image {
  cursor: grabbing;
}

.moment-image-gallery__track {
  display: flex;
  align-items: stretch;
  height: 100%;
  gap: var(--bew-space-2);
  overflow-x: auto;
  overflow-y: hidden;
  overflow-anchor: none;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  outline: none;
  touch-action: pan-x;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

.moment-image-gallery__image {
  display: block;
  flex: 0 0 auto;
  height: var(--moment-gallery-height, 350px);
  width: auto;
  max-width: none;
  overflow: hidden;
  border-radius: var(--bew-media-radius);
  object-fit: cover;
  object-position: center;
  background: var(--bew-fill-1);
  cursor: zoom-in;
  user-select: none;
  -webkit-user-drag: none;
}

.moment-image-gallery__image--unknown-ratio {
  min-width: calc(var(--moment-gallery-height, 350px) * 0.5);
}

.moment-image-gallery__image:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: -2px;
}

.moment-image-gallery__nav {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: grid;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--bew-radius-full);
  place-items: center;
  color: #fff;
  background: rgb(15 20 25 / 72%);
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 12%),
    0 4px 12px rgb(0 0 0 / 28%);
  cursor: pointer;
  font-size: var(--bew-icon-size-sm);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition:
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);
}

.moment-image-gallery:hover .moment-image-gallery__nav.is-enabled,
.moment-image-gallery:focus-within .moment-image-gallery__nav.is-enabled,
.moment-image-gallery__nav.is-enabled:focus-visible {
  opacity: 1;
  pointer-events: auto;
}

@media (hover: none) {
  .moment-image-gallery__nav.is-enabled {
    opacity: 1;
    pointer-events: auto;
  }
}

.moment-image-gallery__nav--prev {
  left: var(--bew-space-2);
}

.moment-image-gallery__nav--next {
  right: var(--bew-space-2);
}

.moment-image-gallery__nav:hover {
  background: rgb(15 20 25 / 88%);
}

.moment-image-gallery__nav:active {
  transform: translateY(-50%) scale(0.96);
}

.moment-image-gallery__nav:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
</style>
