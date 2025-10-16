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
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bew-elevated);
  border-radius: var(--bew-radius);
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
  border-radius: calc(var(--bew-radius) - 4px);
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
  bottom: 0.5rem;
  right: 0.5rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.78);
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
}

.type-chip {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.65);
  color: white;
  font-size: 0.75rem;
}

.info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.title {
  font-weight: 600;
  color: var(--bew-text-1);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  font-size: 0.8125rem;
  color: var(--bew-text-3);
}

.description {
  font-size: 0.875rem;
  color: var(--bew-text-2);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;

  span {
    font-size: 0.75rem;
    color: var(--bew-text-3);
    background: var(--bew-fill-1);
    border-radius: 999px;
    padding: 0.125rem 0.5rem;
  }
}
</style>
