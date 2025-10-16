<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, toRefs } from 'vue'
import { useI18n } from 'vue-i18n'

import BangumiEpisodeList from '~/components/BangumiEpisodeList/BangumiEpisodeList.vue'
import MovieCard from '~/components/MovieCard/MovieCard.vue'
import { settings } from '~/logic'

import {
  convertActivityData,
  convertArticleCardData,
  convertBangumiCardData,
  convertBangumiHighlight,
  convertMediaFtData,
  convertUserCardData,
  convertUserHighlight,
  convertVideoData,
  formatNumber,
  isMediaFtItem,
  removeHighlight,
} from '../searchTransforms'
import type { SearchCategory, SearchCategoryOption } from '../types'

const props = defineProps<{
  categories: ReadonlyArray<SearchCategoryOption>
  currentCategory: SearchCategory
  searchResults: Partial<Record<SearchCategory, any>>
  isLoading: boolean
  error: string
  normalizedKeyword: string
  hasMore: boolean
  currentTotalPages: number
}>()

const {
  categories,
  currentCategory,
  searchResults,
  isLoading,
  error,
  normalizedKeyword,
  hasMore,
  currentTotalPages,
} = toRefs(props)

const baseCardMinWidth = computed(() => Math.max(160, settings.value.homeAdaptiveCardMinWidth || 280))
const searchContentRef = ref<HTMLElement | null>(null)
const searchContentWidth = ref(0)
const videoGridGap = ref(16)

useResizeObserver(searchContentRef, (entries) => {
  const entry = entries[0]
  searchContentWidth.value = entry.contentRect.width
})

function updateVideoGridGap() {
  if (typeof window === 'undefined')
    return
  const gap = Number.parseFloat(getComputedStyle(document.documentElement).fontSize || '16')
  if (Number.isFinite(gap))
    videoGridGap.value = gap
}

const VIDEO_GRID_MAX_COLUMNS = 12

const videoGridStyle = computed(() => {
  const containerWidth = searchContentWidth.value
  const targetWidth = baseCardMinWidth.value
  const gap = videoGridGap.value
  if (!containerWidth || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return {
      gridTemplateColumns: `repeat(1, minmax(${targetWidth}px, ${targetWidth}px))`,
      justifyContent: 'flex-start',
    }
  }

  const rawColumns = Math.floor((containerWidth + gap) / (targetWidth + gap))
  const columns = Math.min(VIDEO_GRID_MAX_COLUMNS, Math.max(rawColumns, 1))
  const totalGap = gap * Math.max(columns - 1, 0)
  const available = containerWidth - totalGap
  const columnWidth = columns > 0 ? Math.max(available / columns, 0) : targetWidth
  return {
    gridTemplateColumns: `repeat(${columns}, minmax(${columnWidth}px, ${columnWidth}px))`,
    justifyContent: 'flex-start',
  }
})

onMounted(() => {
  updateVideoGridGap()
  if (searchContentRef.value)
    searchContentWidth.value = searchContentRef.value.clientWidth
  if (typeof window !== 'undefined')
    window.addEventListener('resize', updateVideoGridGap)
})

onUnmounted(() => {
  if (typeof window !== 'undefined')
    window.removeEventListener('resize', updateVideoGridGap)
})

const bangumiResultGroups = computed(() => {
  const list = Array.isArray(searchResults.value.bangumi?.result) ? searchResults.value.bangumi.result : []
  return {
    bangumi: list.filter(item => !isMediaFtItem(item)),
    movie: list.filter(item => isMediaFtItem(item)),
  }
})

function hasResultsForCategory(category: SearchCategory): boolean {
  const data = searchResults.value[category]
  if (!data)
    return false
  if (category === 'all') {
    return Array.isArray(data.result)
      && data.result.some((section: any) => Array.isArray(section?.data) && section.data.length > 0)
  }
  if (category === 'live')
    return Array.isArray(data?.result?.live_room) && data.result.live_room.length > 0
  return Array.isArray(data?.result) && data.result.length > 0
}

const hasResults = computed(() => hasResultsForCategory(currentCategory.value))

const showNoMore = computed(() =>
  !isLoading.value
  && hasResults.value
  && currentTotalPages.value > 0
  && !hasMore.value,
)

const currentCategoryLabel = computed(() =>
  categories.value.find(category => category.value === currentCategory.value)?.label ?? '',
)

function openExternalLink(url?: string) {
  if (!url)
    return
  window.open(url, '_blank', 'noopener')
}

const { t } = useI18n()
</script>

<template>
  <div ref="searchContentRef" class="search-content">
    <Loading v-if="isLoading && !searchResults[currentCategory]" />

    <Empty v-else-if="error" :description="error" />

    <Empty
      v-else-if="searchResults[currentCategory] && !hasResults"
      :description="`没有找到关于「${normalizedKeyword}」的${currentCategoryLabel}内容`"
    />

    <div v-else-if="searchResults[currentCategory]">
      <div v-if="currentCategory === 'all'" class="all-results" space-y-6>
        <template v-for="(section, index) in searchResults.all?.result" :key="`${section?.result_type ?? 'unknown'}-${index}`">
          <div v-if="section?.result_type === 'video' && Array.isArray(section.data) && section.data.length">
            <h3 text="lg $bew-text-1" font-medium mb-3>
              视频
            </h3>
            <div class="video-grid" :style="videoGridStyle">
              <VideoCard
                v-for="video in section.data"
                :key="video.aid || video.id"
                :video="convertVideoData(video)"
                :horizontal="false"
                :show-preview="true"
              />
            </div>
          </div>

          <div
            v-else-if="(section?.result_type === 'media_bangumi' || section?.result_type === 'media_ft')
              && Array.isArray(section.data)
              && section.data.length"
          >
            <h3 text="lg $bew-text-1" font-medium mb-3>
              {{ section.result_type === 'media_ft' ? '影视' : '番剧' }}
            </h3>
            <div v-if="section.result_type === 'media_ft'" grid="~ cols-2 md:cols-3 lg:cols-4 xl:cols-5 gap-4">
              <MovieCard
                v-for="item in section.data"
                :key="item.season_id || item.media_id || item.id"
                :media="convertMediaFtData(item)"
              />
            </div>
            <div v-else class="bangumi-highlight-grid">
              <div
                v-for="bangumi in section.data.slice(0, 2).map(convertBangumiHighlight)"
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
          </div>

          <div v-else-if="section?.result_type === 'activity' && Array.isArray(section.data) && section.data.length">
            <h3 text="lg $bew-text-1" font-medium mb-3>
              活动
            </h3>
            <div class="activity-results" grid="~ cols-1 md:cols-2 lg:cols-3 gap-4">
              <a
                v-for="activity in section.data.map(convertActivityData)"
                :key="activity.id"
                :href="activity.url"
                target="_blank"
                class="activity-card"
              >
                <div class="activity-cover">
                  <img
                    v-if="activity.cover"
                    :src="activity.cover"
                    :alt="activity.title"
                  >
                </div>
                <div class="activity-info">
                  <div class="activity-title">
                    {{ activity.title }}
                  </div>
                  <div v-if="activity.desc" class="activity-desc">
                    {{ activity.desc }}
                  </div>
                  <div v-if="activity.badge" class="activity-badge">
                    {{ activity.badge }}
                  </div>
                </div>
              </a>
            </div>
          </div>

          <div v-else-if="section?.result_type === 'bili_user' && Array.isArray(section.data) && section.data.length">
            <h3 text="lg $bew-text-1" font-medium mb-3>
              用户
            </h3>
            <div class="user-highlight-grid">
              <div
                v-for="user in section.data.map(convertUserHighlight)"
                :key="user.mid"
                class="user-highlight-card"
                role="link"
                tabindex="0"
                @click="openExternalLink(user.url)"
                @keydown.enter.prevent="openExternalLink(user.url)"
              >
                <div class="user-highlight-header" flex items-center gap-3>
                  <img :src="user.face" :alt="user.name" class="user-highlight-avatar">
                  <div class="user-highlight-info" flex="~ col" gap-1>
                    <div class="user-highlight-name" text="base $bew-text-1" font-medium>
                      {{ user.name }}
                      <span v-if="user.officialVerify" class="user-highlight-verify">
                        {{ user.officialVerify }}
                      </span>
                    </div>
                    <div text="xs $bew-text-3" flex items-center gap-3>
                      <span>粉丝：{{ formatNumber(user.fans || 0) }}</span>
                      <span>视频：{{ user.videos || 0 }}</span>
                    </div>
                  </div>
                  <a :href="user.url" target="_blank" class="user-highlight-follow" @click.stop>+ 关注</a>
                </div>
                <div v-if="user.desc" class="user-highlight-desc">
                  {{ user.desc }}
                </div>
                <div
                  v-if="user.samples && user.samples.length"
                  class="user-highlight-samples"
                >
                  <a
                    v-for="sample in user.samples.slice(0, 6)"
                    :key="sample.id"
                    :href="sample.url"
                    target="_blank"
                    class="user-highlight-sample"
                    @click.stop
                  >
                    <div class="user-highlight-sample-cover">
                      <img v-if="sample.cover" :src="sample.cover" :alt="sample.title">
                      <div v-if="sample.duration" class="user-highlight-sample-duration">
                        {{ sample.duration }}
                      </div>
                      <div v-if="sample.play !== undefined" class="user-highlight-sample-play">
                        <div i-tabler:player-play />
                        <span>{{ formatNumber(sample.play) }}</span>
                      </div>
                    </div>
                    <div class="user-highlight-sample-title">
                      {{ sample.title }}
                    </div>
                  </a>
                </div>
                <div class="user-highlight-actions">
                  <a :href="user.url" target="_blank" @click.stop>查看TA的所有稿件 &gt;</a>
                </div>
              </div>
            </div>
          </div>

          <div
            v-else-if="section?.result_type === 'article' && Array.isArray(section.data) && section.data.length"
            class="article-results"
            grid="~ cols-1 md:cols-2 gap-4"
          >
            <ArticleCard
              v-for="article in section.data.map(convertArticleCardData)"
              :key="article.id"
              v-bind="article"
            />
          </div>
        </template>
      </div>

      <div
        v-else-if="currentCategory === 'video'"
        class="video-grid"
        :style="videoGridStyle"
      >
        <VideoCard
          v-for="video in searchResults.video?.result"
          :key="video.aid || video.id"
          :video="convertVideoData(video)"
          :horizontal="false"
          :show-preview="true"
        />
      </div>

      <div
        v-else-if="currentCategory === 'user'"
        grid="~ cols-1 md:cols-2 lg:cols-3 gap-4"
      >
        <UserCard
          v-for="user in searchResults.user?.result"
          :key="user.mid"
          v-bind="convertUserCardData(user)"
        />
      </div>

      <div
        v-else-if="currentCategory === 'bangumi'"
        class="bangumi-results"
        space-y-6
      >
        <div
          v-if="bangumiResultGroups.bangumi.length"
          grid="~ cols-2 md:cols-3 lg:cols-4 xl:cols-5 gap-4"
        >
          <BangumiCard
            v-for="bangumi in bangumiResultGroups.bangumi"
            :key="bangumi.season_id || bangumi.media_id || bangumi.id"
            :bangumi="convertBangumiCardData(bangumi)"
          />
        </div>
        <div v-if="bangumiResultGroups.movie.length" space-y-3>
          <h3 text="lg $bew-text-1" font-medium>
            影视
          </h3>
          <div grid="~ cols-2 md:cols-3 lg:cols-4 xl:cols-5 gap-4">
            <MovieCard
              v-for="item in bangumiResultGroups.movie"
              :key="item.season_id || item.media_id || item.id"
              :media="convertMediaFtData(item)"
            />
          </div>
        </div>
      </div>

      <div
        v-else-if="currentCategory === 'live'"
        grid="~ cols-1 md:cols-2 lg:cols-3 xl:cols-4 gap-4"
      >
        <a
          v-for="live in searchResults.live?.result?.live_room"
          :key="live.roomid"
          :href="`https://live.bilibili.com/${live.roomid}`"
          target="_blank"
          block bg="$bew-elevated" rounded="$bew-radius" overflow-hidden
          hover:bg="$bew-elevated-hover" transition-colors text-decoration-none
        >
          <div relative aspect-video bg="$bew-fill-1">
            <img
              :src="live.cover || live.pic"
              :alt="removeHighlight(live.title)"
              w-full h-full object-cover
            >
            <div
              v-if="live.live_status === 1"
              absolute top-2 left-2 px-2 py-0.5
              bg="red-500" text="xs white" rounded
              flex items-center gap-1
            >
              <div i-tabler:broadcast />
              <span>直播中</span>
            </div>
            <div
              absolute bottom-2 left-2 px-2 py-0.5
              bg="black/60" text="xs white" rounded
            >
              {{ formatNumber(live.online) }} 观看
            </div>
          </div>
          <div p-3>
            <div text="sm $bew-text-1" font-medium line-clamp-2>
              {{ removeHighlight(live.title) }}
            </div>
            <div text="xs $bew-text-2" mt-1 flex items-center gap-2>
              <span>{{ live.uname }}</span>
              <span text="$bew-text-3">{{ live.area_name }}</span>
            </div>
          </div>
        </a>
      </div>

      <div v-else-if="currentCategory === 'article'" space-y-4>
        <ArticleCard
          v-for="article in searchResults.article?.result"
          :key="article.id"
          v-bind="convertArticleCardData(article)"
        />
      </div>
    </div>

    <Loading v-if="isLoading && searchResults[currentCategory]" />

    <Empty
      v-else-if="showNoMore"
      :description="t('common.no_more_content')"
    />
  </div>
</template>

<style scoped lang="scss">
.search-content {
  width: 100%;
}

.activity-results {
  display: grid;
}

.activity-card {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--bew-elevated);
  border-radius: var(--bew-radius);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease;
  text-decoration: none;
  color: inherit;

  &:hover {
    transform: translateY(-2px);
    background: var(--bew-elevated-hover);
  }
}

.activity-cover {
  width: 120px;
  min-width: 120px;
  aspect-ratio: 4 / 3;
  border-radius: calc(var(--bew-radius) - 8px);
  overflow: hidden;
  background: var(--bew-skeleton);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.activity-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.activity-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--bew-text-1);
  line-height: 1.4;
}

.activity-desc {
  font-size: 0.875rem;
  color: var(--bew-text-2);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.activity-badge {
  align-self: flex-start;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: var(--bew-theme-color-20);
  color: var(--bew-theme-color);
  font-size: 0.75rem;
}

.video-grid {
  display: grid;
  gap: 1rem;
}

.user-highlight-grid {
  display: grid;
  gap: 1rem;
}

.user-highlight-card {
  background: var(--bew-elevated);
  border-radius: var(--bew-radius);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease;
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    background: var(--bew-elevated-hover);
  }
}

.user-highlight-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
}

.user-highlight-verify {
  margin-left: 0.5rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--bew-theme-color-20);
  color: var(--bew-theme-color);
  font-size: 0.75rem;
}

.user-highlight-follow {
  margin-left: auto;
  padding: 0.35rem 0.75rem;
  border-radius: var(--bew-radius-half);
  background: var(--bew-theme-color);
  color: #fff;
  font-size: 0.8125rem;
  text-decoration: none;
}

.user-highlight-desc {
  font-size: 0.875rem;
  color: var(--bew-text-2);
  line-height: 1.5;
}

.user-highlight-samples {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
}

.user-highlight-sample {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  text-decoration: none;
  color: inherit;

  &:hover .user-highlight-sample-title {
    color: var(--bew-theme-color);
  }
}

.user-highlight-sample-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: calc(var(--bew-radius-half) - 2px);
  overflow: hidden;
  background: var(--bew-skeleton);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.user-highlight-sample-duration {
  position: absolute;
  bottom: 0.5rem;
  right: 0.5rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
}

.user-highlight-sample-play {
  position: absolute;
  left: 0.5rem;
  bottom: 0.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);

  i {
    font-size: 0.9em;
  }
}

.user-highlight-sample-title {
  font-size: 0.8125rem;
  color: var(--bew-text-1);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.user-highlight-actions {
  font-size: 0.8125rem;
  color: var(--bew-theme-color);

  a {
    text-decoration: none;
  }
}

.bangumi-highlight-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 1024px) {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
}

.bangumi-highlight-card {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--bew-elevated);
  border-radius: var(--bew-radius);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease;
  cursor: default;

  &:hover {
    transform: translateY(-2px);
    background: var(--bew-elevated-hover);
  }
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
  transition: background-color 0.2s ease;

  &:hover {
    filter: brightness(0.9);
  }
}
</style>
