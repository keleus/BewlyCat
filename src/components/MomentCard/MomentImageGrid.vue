<script setup lang="ts">
import { computed } from 'vue'

import {
  getMomentOriginalImageUrl,
  getMomentThumbnailUrl,
} from './utils'

interface Props {
  images: string[]
  altPrefix: string
}

const { images, altPrefix } = defineProps<Props>()

const emit = defineEmits<{
  coverLoad: [event: Event]
  preview: [urls: string[], index: number, trigger: HTMLElement | null]
}>()

const previewUrls = computed(() => images.map(url => getMomentOriginalImageUrl(url)))

function handlePreview(event: MouseEvent, index: number) {
  event.preventDefault()
  event.stopPropagation()
  const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  emit('preview', previewUrls.value, index, trigger)
}

function handleCoverLoad(event: Event, index: number) {
  if (index === 0)
    emit('coverLoad', event)
}
</script>

<template>
  <div
    class="moment-image-grid"
    role="region"
    :aria-label="altPrefix"
  >
    <button
      v-for="(image, imageIndex) in images"
      :key="`${image}-${imageIndex}`"
      type="button"
      class="moment-image-grid__item"
      :aria-label="`查看 ${altPrefix} ${imageIndex + 1}`"
      @click="handlePreview($event, imageIndex)"
    >
      <img
        class="moment-image-grid__image"
        :src="getMomentThumbnailUrl(image, 480)"
        :alt="`${altPrefix} ${imageIndex + 1}`"
        loading="eager"
        :fetchpriority="imageIndex < 3 ? 'auto' : 'low'"
        decoding="async"
        @load="handleCoverLoad($event, imageIndex)"
      >
    </button>

    <slot />
  </div>
</template>

<style lang="scss" scoped>
.moment-image-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bew-space-2);
  min-width: 0;
}

.moment-image-grid__item {
  display: block;
  min-width: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: var(--bew-media-radius);
  aspect-ratio: 1;
  color: inherit;
  background: var(--bew-fill-1);
  cursor: zoom-in;
}

.moment-image-grid__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  user-select: none;
  -webkit-user-drag: none;
}

.moment-image-grid__item:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: -2px;
}
</style>
