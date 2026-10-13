<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import MomentImageGallery from './MomentImageGallery.vue'
import MomentImageGrid from './MomentImageGrid.vue'
import {
  getMomentOriginalImageUrl,
  getMomentThumbnailUrl,
  isPortraitImageRatio,
  LANDSCAPE_SINGLE_IMAGE_MAX_WIDTH,
  shouldUseMomentImageGallery,
  shouldUseMomentImageGrid,
} from './utils'

// 动态配图：完整行九宫格、横向画廊或单张大图三选一。默认插槽用于叠加角标（如充电专属）。
const {
  images,
  imageRatios,
  isNineGrid = false,
  imageRatio,
  containerWidth = 0,
  authorName,
  forward = false,
} = defineProps<{
  images: string[]
  /** 接口给出的各图宽高比（宽/高） */
  imageRatios?: Array<number | undefined>
  isNineGrid?: boolean
  /** 首图实测宽高比，接口未给出比例时兜底 */
  imageRatio?: number
  /** 画廊可用宽度 */
  containerWidth?: number
  authorName: string
  /** 转发引用内的配图，使用引用层的内边距 */
  forward?: boolean
}>()

const emit = defineEmits<{
  coverLoad: [event: Event]
  preview: [urls: string[], index: number, trigger: HTMLElement | null]
}>()

const { t } = useI18n()

const classPrefix = computed(() => forward ? 'moment-card__forward-' : 'moment-card__')
const useGrid = computed(() => shouldUseMomentImageGrid(images, isNineGrid))
const useGallery = computed(() =>
  !useGrid.value && shouldUseMomentImageGallery(images, { imageRatio, imageRatios }),
)
const altText = computed(() => t('moment_card.author_images', { name: authorName }))

// 竖图沿用正方形容器裁切；横图按原始比例展示，限制最大宽度。
const singleImageStyle = computed<CSSProperties | undefined>(() => {
  const ratio = imageRatios?.[0] ?? imageRatio
  if (
    ratio === undefined
    || !Number.isFinite(ratio)
    || ratio <= 0
    || isPortraitImageRatio(ratio)
  ) {
    return undefined
  }

  return {
    aspectRatio: String(Math.max(1, ratio)),
    maxWidth: `${LANDSCAPE_SINGLE_IMAGE_MAX_WIDTH}px`,
  }
})

function emitSinglePreview(event: Event) {
  event.preventDefault()
  event.stopPropagation()
  const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  emit('preview', images.map(url => getMomentOriginalImageUrl(url)), 0, trigger)
}

function handleSingleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ')
    emitSinglePreview(event)
}
</script>

<template>
  <div v-if="useGrid" :class="`${classPrefix}grid-host`">
    <MomentImageGrid
      :images="images"
      :alt-prefix="altText"
      @cover-load="emit('coverLoad', $event)"
      @preview="(urls, index, trigger) => emit('preview', urls, index, trigger)"
    >
      <slot />
    </MomentImageGrid>
  </div>
  <div v-else-if="useGallery" :class="`${classPrefix}gallery-host`">
    <MomentImageGallery
      :images="images"
      :image-ratios="imageRatios"
      :alt-prefix="altText"
      :container-width="containerWidth"
      @cover-load="emit('coverLoad', $event)"
      @preview="(urls, index, trigger) => emit('preview', urls, index, trigger)"
    >
      <slot />
    </MomentImageGallery>
  </div>
  <div
    v-else-if="images.length"
    :class="[`${classPrefix}gallery`, `${classPrefix}gallery--1`]"
    :style="singleImageStyle"
    tabindex="0"
    role="button"
    @click="emitSinglePreview"
    @keydown="handleSingleKeydown"
  >
    <img
      :src="getMomentThumbnailUrl(images[0], LANDSCAPE_SINGLE_IMAGE_MAX_WIDTH * 2)"
      :alt="altText"
      :aria-label="t('moment_card.view_author_images', { name: authorName })"
      loading="lazy"
      decoding="async"
      @load="emit('coverLoad', $event)"
    >
    <slot />
  </div>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card__grid-host,
.moment-card__gallery-host,
.moment-card__gallery,
.moment-card__forward-grid-host,
.moment-card__forward-gallery-host,
.moment-card__forward-gallery {
  @include mixins.interactive-layer;
}

.moment-card__gallery-host,
.moment-card__grid-host {
  margin-top: var(--bew-space-4);
}

.moment-card__forward-gallery-host,
.moment-card__forward-grid-host {
  margin: 0 var(--bew-space-3) var(--bew-space-3);
}

.moment-card__gallery,
.moment-card__forward-gallery {
  display: grid;
  grid-template-columns: 1fr;
  overflow: hidden;
  border-radius: var(--bew-media-radius);
  aspect-ratio: 1;
  background: var(--bew-fill-1);
}

.moment-card__gallery {
  margin-top: var(--bew-space-4);
}

.moment-card__forward-gallery {
  margin: 0 var(--bew-space-3) var(--bew-space-3);
}

.moment-card__gallery > img,
.moment-card__forward-gallery > img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  /* Portrait originals are shown in a square container and cropped; landscape
   * originals use their natural ratio and therefore remain uncropped. */
  object-fit: cover;
  object-position: center top;
  background: var(--bew-fill-1);
}

.moment-card__gallery--1,
.moment-card__forward-gallery--1 {
  width: 100%;
  max-width: 560px;
}

.moment-card__gallery > img:focus-visible,
.moment-card__forward-gallery > img:focus-visible {
  @include mixins.focus-ring(-2px);
}
</style>
