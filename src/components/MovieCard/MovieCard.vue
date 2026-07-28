<script setup lang="ts">
import { computed } from 'vue'

import { removeHttpFromUrl } from '~/utils/main'

interface MovieCardProps {
  id: number | string
  title: string
  url: string
  cover?: string
  typeName?: string
  area?: string
  year?: string | number
  score?: number
  ratingCount?: number
  desc?: string
  tags?: string[]
}

const props = defineProps<{
  media: MovieCardProps
}>()

const posterUrl = computed(() => {
  const cover = props.media.cover
  if (!cover)
    return ''

  const sanitized = removeHttpFromUrl(cover)
  if (sanitized.includes('@'))
    return sanitized
  return `${sanitized}@320w_452h_1c.webp`
})

const metaText = computed(() => {
  const segments = [props.media.year, props.media.area].filter(Boolean)
  return segments.join(' · ')
})
</script>

<template>
  <ALink
    :href="media.url"
    type="videoCard"
    class="movie-card"
  >
    <div class="poster">
      <img
        v-if="posterUrl"
        :src="posterUrl"
        :alt="media.title"
      >
      <div v-else class="poster-fallback" />

      <div v-if="media.score" class="score-chip">
        {{ typeof media.score === 'number' ? media.score.toFixed(1) : media.score }}
      </div>

      <div v-if="media.typeName" class="type-chip">
        {{ media.typeName }}
      </div>
    </div>

    <div class="info">
      <div class="title">
        {{ media.title }}
      </div>

      <div v-if="metaText" class="meta">
        {{ metaText }}
      </div>

      <p v-if="media.desc" class="description">
        {{ media.desc }}
      </p>

      <div v-if="media.tags?.length" class="tags">
        <span v-for="tag in media.tags.slice(0, 3)" :key="tag">
          {{ tag }}
        </span>
      </div>
    </div>
  </ALink>
</template>

<style scoped lang="scss">
.movie-card {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  padding: var(--bew-space-4);
  background: var(--bew-elevated);
  border-radius: var(--bew-card-radius);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease;
  min-height: 100%;

  &:hover {
    transform: translateY(-2px);
    background: var(--bew-elevated-hover);
  }
}

.poster {
  position: relative;
  width: 100%;
  border-radius: var(--bew-media-radius);
  overflow: hidden;
  background: var(--bew-skeleton);
  aspect-ratio: 2 / 3;

  img,
  .poster-fallback {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.score-chip {
  position: absolute;
  bottom: var(--bew-space-2);
  right: var(--bew-space-2);
  padding: var(--bew-space-0-5) var(--bew-space-2);
  border-radius: var(--bew-badge-radius);
  background: rgba(0, 0, 0, 0.78);
  color: white;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.type-chip {
  position: absolute;
  top: var(--bew-space-2);
  left: var(--bew-space-2);
  padding: var(--bew-space-0-5) var(--bew-space-2);
  border-radius: var(--bew-badge-radius);
  background: rgba(0, 0, 0, 0.65);
  color: white;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.info {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.title {
  font-weight: var(--bew-font-weight-semibold);
  color: var(--bew-text-1);
  line-height: var(--bew-line-height-body);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  color: var(--bew-text-3);
}

.description {
  font-size: var(--bew-font-size-body);
  color: var(--bew-text-2);
  line-height: var(--bew-line-height-body);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);

  span {
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
    color: var(--bew-text-3);
    background: var(--bew-fill-1);
    border-radius: var(--bew-badge-radius);
    padding: var(--bew-space-0-5) var(--bew-space-2);
  }
}
</style>
