<script setup lang="ts">
import { computed } from 'vue'

import BangumiEpisodeList from '~/components/BangumiEpisodeList/BangumiEpisodeList.vue'
import MediaEpisodeSelect from '~/components/MediaEpisodeSelect/MediaEpisodeSelect.vue'

import { convertBangumiHighlight, convertMediaFtHighlight, isMediaFtItem } from '../../searchTransforms'

const props = defineProps<{
  bangumiItems: any[]
}>()

const bangumiGroups = computed(() => {
  const list = props.bangumiItems || []
  return {
    bangumi: list.filter(item => !isMediaFtItem(item)),
    movie: list.filter(item => isMediaFtItem(item)),
  }
})
</script>

<template>
  <div class="bangumi-results" space-y-6>
    <div v-if="bangumiGroups.bangumi.length" class="bangumi-highlight-grid">
      <div
        v-for="bangumi in bangumiGroups.bangumi.map(convertBangumiHighlight)"
        :key="bangumi.id || bangumi.title"
        class="bangumi-highlight-card"
      >
        <a
          class="bangumi-highlight-cover"
          :href="bangumi.url"
          target="_blank"
          @click.stop
        >
          <img
            :src="bangumi.cover"
            :alt="bangumi.title"
          >
          <div v-if="bangumi.badge?.text || bangumi.capsuleText" class="bangumi-highlight-badge">
            {{ bangumi.badge?.text || bangumi.capsuleText }}
          </div>
        </a>
        <div class="bangumi-highlight-info">
          <div class="bangumi-highlight-title" text="lg $bew-text-1" font-medium>
            {{ bangumi.title }}
          </div>
          <div class="bangumi-highlight-meta" text="sm $bew-text-3" flex items-center gap-2>
            <span v-if="bangumi.score" text="$bew-theme-color" font-bold>
              {{ bangumi.score?.toFixed(1) }} 分
            </span>
            <span v-if="bangumi.areas">
              {{ bangumi.areas }}
            </span>
            <span v-if="bangumi.episodeCount">
              共 {{ bangumi.episodeCount }} 话
            </span>
            <span v-if="bangumi.publishDateFormatted">
              首播：{{ bangumi.publishDateFormatted }}
            </span>
          </div>
          <div v-if="bangumi.desc" class="bangumi-highlight-desc">
            {{ bangumi.desc }}
          </div>
          <div v-if="bangumi.tags?.length" class="bangumi-highlight-tags">
            <span v-for="tag in bangumi.tags" :key="tag">
              {{ tag }}
            </span>
          </div>
          <BangumiEpisodeList
            v-if="(bangumi.episodes && bangumi.episodes.length) || bangumi.episodeCount"
            :episodes="bangumi.episodes ?? []"
            :total-episodes="bangumi.episodeCount"
            :fallback-url="bangumi.url"
          />
          <div class="bangumi-highlight-actions" flex items-center gap-3>
            <a
              class="bangumi-highlight-button"
              :href="bangumi.url"
              target="_blank"
              @click.stop
            >
              {{ bangumi.buttonText || '立即观看' }}
            </a>
          </div>
        </div>
      </div>
    </div>
    <div v-if="bangumiGroups.movie.length" space-y-3>
      <h3 text="lg $bew-text-1" font-medium>
        其它
      </h3>
      <div class="bangumi-highlight-grid">
        <div
          v-for="item in bangumiGroups.movie.map(convertMediaFtHighlight)"
          :key="item.id || item.title"
          class="bangumi-highlight-card"
        >
          <a
            class="bangumi-highlight-cover"
            :href="item.url"
            target="_blank"
            @click.stop
          >
            <img
              :src="item.cover"
              :alt="item.title"
            >
            <div v-if="item.badge" class="bangumi-highlight-badge">
              {{ item.badge }}
            </div>
          </a>
          <div class="bangumi-highlight-info">
            <div class="bangumi-highlight-title" text="lg $bew-text-1" font-medium>
              {{ item.title }}
            </div>
            <div class="bangumi-highlight-meta" text="sm $bew-text-3" flex items-center gap-2>
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
            <div v-if="item.desc" class="bangumi-highlight-desc">
              {{ item.desc }}
            </div>
            <MediaEpisodeSelect
              v-if="item.episodes && item.episodes.length"
              :episodes="item.episodes"
              :fallback-url="item.url"
            />
            <div class="bangumi-highlight-actions" flex items-center gap-3>
              <a
                class="bangumi-highlight-button"
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
  </div>
</template>

<style scoped lang="scss">
.bangumi-results {
  width: 100%;
}

/* 优化性能：使用固定列数替代 auto-fit */
.bangumi-highlight-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 1024px) {
    grid-template-columns: repeat(1, 1fr);
  }

  @media (min-width: 640px) and (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.bangumi-highlight-card {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--bew-elevated);
  border-radius: var(--bew-radius);
}

.bangumi-highlight-cover {
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

.bangumi-highlight-badge {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 0.75rem;
}

.bangumi-highlight-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.bangumi-highlight-desc {
  font-size: 0.875rem;
  color: var(--bew-text-2);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.bangumi-highlight-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;

  span {
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    background: var(--bew-fill-1);
    color: var(--bew-text-3);
    font-size: 0.75rem;
  }
}

.bangumi-highlight-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.bangumi-highlight-button {
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
