<script setup lang="ts">
import MediaEpisodeSelect from '~/components/MediaEpisodeSelect/MediaEpisodeSelect.vue'

import { convertMediaFtHighlight } from '../../searchTransforms'

defineProps<{
  mediaItems: any[]
}>()
</script>

<template>
  <div class="media-ft-results">
    <div class="media-ft-highlight-grid">
      <div
        v-for="item in mediaItems.map(convertMediaFtHighlight)"
        :key="item.id || item.title"
        class="media-ft-highlight-card"
      >
        <a
          class="media-ft-highlight-cover"
          :href="item.url"
          target="_blank"
          @click.stop
        >
          <img
            :src="item.cover"
            :alt="item.title"
          >
          <div v-if="item.badge" class="media-ft-highlight-badge">
            {{ item.badge }}
          </div>
        </a>
        <div class="media-ft-highlight-info">
          <div class="media-ft-highlight-title" text="lg $bew-text-1" font-medium>
            {{ item.title }}
          </div>
          <div class="media-ft-highlight-meta" text="sm $bew-text-3" flex items-center gap-2>
            <span v-if="item.score" text="$bew-theme-color" font-bold>
              {{ item.score?.toFixed(1) }} 分
            </span>
            <span v-if="item.areas">
              {{ item.areas }}
            </span>
            <span v-if="item.styles">
              {{ item.styles }}
            </span>
            <span v-if="item.indexShow">
              {{ item.indexShow }}
            </span>
          </div>
          <div v-if="item.desc" class="media-ft-highlight-desc">
            {{ item.desc }}
          </div>
          <MediaEpisodeSelect
            v-if="item.episodes && item.episodes.length"
            :episodes="item.episodes"
            :fallback-url="item.url"
          />
          <div class="media-ft-highlight-actions" flex items-center gap-3>
            <a
              class="media-ft-highlight-button"
              :href="item.url"
              target="_blank"
              @click.stop
            >
              立即观看
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.media-ft-results {
  width: 100%;
}

.media-ft-highlight-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 1024px) {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
}

.media-ft-highlight-card {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--bew-elevated);
  border-radius: var(--bew-radius);
}

.media-ft-highlight-cover {
  display: block;
  width: 160px;
  min-width: 160px;
  aspect-ratio: 3 / 4;
  border-radius: calc(var(--bew-radius) - 4px);
  overflow: hidden;
  position: relative;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.media-ft-highlight-badge {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 0.75rem;
}

.media-ft-highlight-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.media-ft-highlight-desc {
  font-size: 0.875rem;
  color: var(--bew-text-2);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.media-ft-highlight-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.media-ft-highlight-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1.25rem;
  border-radius: var(--bew-radius-half);
  background: var(--bew-theme-color);
  color: #fff;
  font-size: 0.875rem;
  text-decoration: none;
  transition: background-color 0.2s ease;

  &:hover {
    filter: brightness(0.9);
  }
}
</style>
