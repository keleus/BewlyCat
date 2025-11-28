<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import DOMPurify from 'dompurify'
import { computed, onMounted, onUnmounted, ref, toRefs } from 'vue'
import { useI18n } from 'vue-i18n'

import BangumiEpisodeList from '~/components/BangumiEpisodeList/BangumiEpisodeList.vue'
import MediaEpisodeSelect from '~/components/MediaEpisodeSelect/MediaEpisodeSelect.vue'
import { settings } from '~/logic'
import api from '~/utils/api'
import { LV0_ICON, LV1_ICON, LV2_ICON, LV3_ICON, LV4_ICON, LV5_ICON, LV6_ICON } from '~/utils/lvIcons'
import { getCSRF } from '~/utils/main'

import {
  convertActivityData,
  convertArticleCardData,
  convertBangumiHighlight,
  convertLiveRoomData,
  convertMediaFtHighlight,
  convertUserCardData,
  convertUserHighlight,
  convertVideoData,
  convertWebGameData,
  formatNumber,
  isAdVideo,
  isMediaFtItem,
  removeHighlight,
  removeUnusedActivityCard,
} from '../searchTransforms'
import type { SearchCategory, SearchCategoryOption } from '../types'
import EsportsMatchCard from './renderers/EsportsMatchCard.vue'

const props = defineProps<{
  categories: ReadonlyArray<SearchCategoryOption>
  currentCategory: SearchCategory
  searchResults: Partial<Record<SearchCategory, any>>
  isLoading: boolean
  error: string
  normalizedKeyword: string
  hasMore: boolean
  currentTotalPages: number
  currentTotalResults: number
  liveUserTotalResults?: number
  liveRoomTotalResults?: number
  userRelations: Record<number, { isFollowing: boolean, isLoading: boolean }>
  currentLiveSubCategory?: string
  liveRoomOrder?: string
  liveRoomOrderOptions?: Array<{ value: string, label: string }>
  liveUserOrder?: string
  liveUserOrderOptions?: Array<{ value: string, label: string }>
  currentPage?: number
}>()

const emit = defineEmits<{
  updateUserRelation: [mid: number, isFollowing: boolean]
  switchToLiveUser: []
  updateLiveRoomOrder: [value: string]
  updateLiveUserOrder: [value: string]
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
  currentPage,
} = toRefs(props)

// 翻页模式
const paginationMode = computed(() => settings.value.searchResultsPaginationMode)

// 是否在翻页模式的非首页
const isInPaginationNonFirstPage = computed(() => {
  return paginationMode.value === 'pagination' && (currentPage?.value || 1) > 1
})

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

// 赛事卡片样式计算（基于250px卡片宽度，最多5个）
const esportsCardStyle = computed(() => {
  const containerWidth = searchContentWidth.value
  const cardMinWidth = 250
  const gap = videoGridGap.value
  const maxCards = 5

  if (!containerWidth || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return {
      cardWidth: `${cardMinWidth}px`,
    }
  }

  // 计算可以显示的卡片数量（最多5个）
  const rawColumns = Math.floor((containerWidth + gap) / (cardMinWidth + gap))
  const columns = Math.min(Math.max(rawColumns, 1), maxCards)

  // 计算每张卡片的实际宽度（填满容器）
  const totalGap = gap * Math.max(columns - 1, 0)
  const available = containerWidth - totalGap
  const cardWidth = columns > 0 ? Math.max(available / columns, cardMinWidth) : cardMinWidth

  return {
    cardWidth: `${cardWidth}px`,
  }
})

// 合并活动和游戏数据
const activityAndGameItems = computed(() => {
  if (currentCategory.value !== 'all' || !searchResults.value.all?.result)
    return []

  const items: any[] = []
  const sections = searchResults.value.all.result

  sections.forEach((section: any) => {
    if (section?.result_type === 'activity' && Array.isArray(section.data)) {
      const filtered = section.data.filter(removeUnusedActivityCard)
      items.push(...filtered.map((item: any) => ({
        ...convertActivityData(item),
        _type: 'activity',
      })))
    }
    else if (section?.result_type === 'web_game' && Array.isArray(section.data)) {
      items.push(...section.data.map((item: any) => ({
        ...convertWebGameData(item),
        _type: 'web_game',
      })))
    }
  })

  return items
})

// 计算用户代表作视频的列数（基于180px的卡片宽度）
const userSamplesColumns = computed(() => {
  const containerWidth = searchContentWidth.value
  const cardMinWidth = 180
  const gap = videoGridGap.value

  if (!containerWidth || !Number.isFinite(containerWidth) || containerWidth <= 0)
    return 6 // 默认6列

  const columns = Math.floor((containerWidth + gap) / (cardMinWidth + gap))
  return Math.max(1, Math.min(columns, 7)) // 最少1列，最多7列
})

// 为用户代表作添加占位符
function getUserSamplesWithPlaceholders(samples: any[]) {
  const columns = userSamplesColumns.value
  const actualSamples = samples.slice(0, columns)
  const placeholdersCount = Math.max(0, columns - actualSamples.length)
  const placeholders = Array.from({ length: placeholdersCount }, () => null)
  return [...actualSamples, ...placeholders]
}

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

// 获取直播搜索的主播列表
const liveUserList = computed(() => {
  const liveData = searchResults.value.live
  if (!liveData)
    return []
  // live_user模式：result直接是主播数组
  if (props.currentLiveSubCategory === 'live_user') {
    return Array.isArray(liveData.result) ? liveData.result : []
  }
  // all或live_room模式：result.live_user是主播数组
  return Array.isArray(liveData.result?.live_user) ? liveData.result.live_user : []
})

// 获取直播搜索的直播间列表
const liveRoomList = computed(() => {
  const liveData = searchResults.value.live
  if (!liveData)
    return []
  // live_room模式：result直接是直播间数组
  if (props.currentLiveSubCategory === 'live_room') {
    return Array.isArray(liveData.result) ? liveData.result : []
  }
  // all模式：result.live_room是直播间数组
  return Array.isArray(liveData.result?.live_room) ? liveData.result.live_room : []
})

function hasResultsForCategory(category: SearchCategory): boolean {
  const data = searchResults.value[category]
  if (!data)
    return false
  if (category === 'all') {
    return Array.isArray(data.result)
      && data.result.some((section: any) => Array.isArray(section?.data) && section.data.length > 0)
  }
  if (category === 'live') {
    return liveUserList.value.length > 0 || liveRoomList.value.length > 0
  }
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

function formatResultCount(count: number): string {
  if (count >= 1000)
    return '1000+'
  return String(count)
}

const levelIcons: string[] = [
  LV0_ICON,
  LV1_ICON,
  LV2_ICON,
  LV3_ICON,
  LV4_ICON,
  LV5_ICON,
  LV6_ICON,
]

function getLvIcon(level: number): string {
  return levelIcons[level] || LV0_ICON
}

// 关注操作处理函数
async function handleUserFollow(mid: number) {
  // 确保 userRelations 中存在该用户的状态
  if (!props.userRelations[mid]) {
    emit('updateUserRelation', mid, false)
    return
  }

  const state = props.userRelations[mid]

  if (state.isLoading)
    return

  try {
    state.isLoading = true
    const csrf = getCSRF()

    // act: 1=关注, 2=取关
    const act = state.isFollowing ? 2 : 1

    const response = await api.user.relationModify({
      fid: String(mid),
      act,
      re_src: 11, // 11=搜索结果页
      csrf,
    })

    if (response.code === 0) {
      emit('updateUserRelation', mid, !state.isFollowing)
    }
    else {
      console.error('关注操作失败:', response.message)
    }
  }
  catch (error) {
    console.error('关注操作出错:', error)
  }
  finally {
    state.isLoading = false
  }
}

// 处理 UserCard 的关注状态变化事件
function handleFollowStateChanged(mid: number, isFollowing: boolean) {
  emit('updateUserRelation', mid, isFollowing)
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
        <!-- 优先显示活动和游戏 (仅首页) -->
        <div v-if="!isInPaginationNonFirstPage && activityAndGameItems.length > 0">
          <h3 text="lg $bew-text-1" font-medium mb-3 mt-6>
            活动
          </h3>
          <div class="activity-results" grid="~ cols-1 md:cols-2 lg:cols-3 gap-4">
            <a
              v-for="item in activityAndGameItems"
              :key="item.id"
              :href="item.url"
              target="_blank"
              class="activity-card"
            >
              <div class="activity-cover">
                <img
                  v-if="item.cover"
                  :src="item.cover"
                  :alt="item.title"
                >
              </div>
              <div class="activity-info">
                <div class="activity-title">
                  {{ item.title }}
                </div>
                <div v-if="item.desc" class="activity-desc">
                  {{ item.desc }}
                </div>
                <div v-if="item.badge" class="activity-badge">
                  {{ item.badge }}
                </div>
                <div v-if="item.tags || item.platform" class="game-meta" text="xs $bew-text-3" mt-2>
                  <span v-if="item.tags">{{ item.tags }}</span>
                  <span v-if="item.platform"> · {{ item.platform }}</span>
                </div>
              </div>
            </a>
          </div>
        </div>

        <template v-for="(section, index) in searchResults.all?.result" :key="`${section?.result_type ?? 'unknown'}-${index}`">
          <div v-if="section?.result_type === 'video' && Array.isArray(section.data) && section.data.filter(v => !isAdVideo(v)).length">
            <h3 text="lg $bew-text-1" font-medium mb-3 mt-6>
              视频
            </h3>
            <div class="video-grid" :style="videoGridStyle">
              <VideoCard
                v-for="video in section.data.filter(v => !isAdVideo(v))"
                :key="video.aid || video.id || video.roomid"
                :video="video.type === 'live_room' ? convertLiveRoomData(video) : convertVideoData(video)"
                :horizontal="false"
                :show-preview="true"
                :show-watcher-later="video.type !== 'live_room'"
              />
            </div>
          </div>

          <div
            v-else-if="!isInPaginationNonFirstPage && (section?.result_type === 'media_bangumi' || section?.result_type === 'media_ft')
              && Array.isArray(section.data)
              && section.data.length"
          >
            <h3 text="lg $bew-text-1" font-medium mb-3 mt-6>
              {{ section.result_type === 'media_ft' ? '影视' : '番剧' }}
            </h3>
            <div v-if="section.result_type === 'media_ft'" class="media-ft-highlight-grid">
              <div
                v-for="item in section.data.slice(0, 2)"
                :key="item.season_id || item.media_id || item.id"
                class="media-ft-highlight-card"
              >
                <a
                  class="media-ft-highlight-cover"
                  :href="item.goto_url || item.url || `https://www.bilibili.com/bangumi/media/md${item.media_id}`"
                  target="_blank"
                  @click.stop
                >
                  <img
                    :src="item.cover"
                    :alt="removeHighlight(item.title)"
                  >
                  <div v-if="item.badges && item.badges.length" class="media-ft-highlight-badge">
                    {{ item.badges[0].text }}
                  </div>
                </a>
                <div class="media-ft-highlight-info">
                  <div class="media-ft-highlight-title" text="lg $bew-text-1" font-medium v-html="item.title" />
                  <div class="media-ft-highlight-meta" text="sm $bew-text-3" flex items-center gap-2>
                    <span v-if="item.media_score?.score" text="$bew-theme-color" font-bold>
                      {{ item.media_score.score.toFixed(1) }} 分
                    </span>
                    <span v-if="item.areas">
                      {{ item.areas }}
                    </span>
                    <span v-if="item.styles">
                      {{ item.styles }}
                    </span>
                    <span v-if="item.index_show">
                      {{ item.index_show }}
                    </span>
                  </div>
                  <div v-if="item.desc" class="media-ft-highlight-desc">
                    {{ removeHighlight(item.desc) }}
                  </div>
                  <MediaEpisodeSelect
                    v-if="item.eps && item.eps.length"
                    :episodes="item.eps.map((ep: any) => ({
                      id: ep.id,
                      title: ep.title || ep.index,
                      url: ep.url,
                      cover: ep.cover,
                      badge: ep.badges?.[0]?.text,
                    }))"
                    :fallback-url="item.goto_url || item.url"
                  />
                  <div class="media-ft-highlight-actions" flex items-center gap-3>
                    <a
                      class="media-ft-highlight-button"
                      :href="item.goto_url || item.url || `https://www.bilibili.com/bangumi/media/md${item.media_id}`"
                      target="_blank"
                      @click.stop
                    >
                      立即观看
                    </a>
                  </div>
                </div>
              </div>
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

          <!-- 跳过活动和游戏的单独渲染，它们会在后面统一渲染 -->
          <template v-else-if="section?.result_type === 'activity' || section?.result_type === 'web_game'" />

          <!-- 赛事比分 -->
          <div v-else-if="!isInPaginationNonFirstPage && section?.result_type === 'esports' && Array.isArray(section.data) && section.data.length">
            <h3 text="lg $bew-text-1" font-medium mb-3 mt-6>
              赛程日历
            </h3>
            <div
              class="esports-grid"
              flex="~ wrap gap-4"
              mb-4
            >
              <template v-for="contestData in section.data" :key="`esports-data-${contestData.contest?.[0]?.ID}`">
                <EsportsMatchCard
                  v-for="contest in contestData.contest?.slice(0, 5)"
                  :key="`contest-${contest.ID}`"
                  :contest="contest"
                  :card-width="esportsCardStyle.cardWidth"
                />
              </template>
            </div>
            <!-- 更多赛事按钮 -->
            <a
              :href="`https://www.bilibili.com/v/game/match/schedule?mid=${section.data[0]?.contest?.[0]?.mid || 0}&time=${Date.now()}`"
              target="_blank"
              class="more-esports-button"
              @click.stop=""
            >
              {{ $t('search_page.view_all_esports') }}
            </a>
          </div>

          <div v-else-if="!isInPaginationNonFirstPage && section?.result_type === 'bili_user' && Array.isArray(section.data) && section.data.length">
            <h3 text="lg $bew-text-1" font-medium mb-3 mt-6>
              用户
            </h3>
            <div class="user-highlight-grid">
              <div
                v-for="user in section.data.map(convertUserHighlight)"
                :key="user.mid"
                class="user-highlight-card"
              >
                <div class="user-highlight-header" flex items-center gap-3>
                  <img
                    :src="user.face"
                    :alt="user.name"
                    class="user-highlight-avatar"
                    @click="openExternalLink(user.url)"
                  >
                  <div class="user-highlight-info" flex="~ col" gap-1 flex-1>
                    <div
                      class="user-highlight-name"
                      text="base $bew-text-1"
                      font-medium
                      flex
                      items-center
                      gap-2
                    >
                      <a
                        :href="user.url"
                        target="_blank"
                        @click.stop
                      >
                        {{ user.name }}
                      </a>
                      <div
                        v-if="user.level !== undefined"
                        class="user-level-badge-icon"
                        v-html="DOMPurify.sanitize(getLvIcon(user.level))"
                      />
                      <div v-if="user.gender === 1" class="gender-icon-badge gender-male">
                        <div i-tabler:gender-male />
                      </div>
                      <div v-else-if="user.gender === 2" class="gender-icon-badge gender-female">
                        <div i-tabler:gender-female />
                      </div>
                      <span v-if="user.officialVerify" class="user-highlight-verify">
                        {{ user.officialVerify }}
                      </span>
                    </div>
                    <div text="xs $bew-text-3" flex items-center gap-3>
                      <span>粉丝：{{ formatNumber(user.fans || 0) }}</span>
                      <span>视频：{{ user.videos || 0 }}</span>
                    </div>
                    <div v-if="user.desc" class="user-highlight-desc" mt-1>
                      {{ user.desc }}
                    </div>
                  </div>
                  <button
                    class="user-highlight-follow"
                    :class="{ followed: props.userRelations[user.mid]?.isFollowing }"
                    :disabled="props.userRelations[user.mid]?.isLoading"
                    @click.stop="handleUserFollow(user.mid)"
                  >
                    {{ props.userRelations[user.mid]?.isLoading ? '...' : props.userRelations[user.mid]?.isFollowing ? '已关注' : '+ 关注' }}
                  </button>
                </div>
                <div
                  v-if="user.samples && user.samples.length"
                  class="user-highlight-samples"
                  :style="{ gridTemplateColumns: `repeat(${userSamplesColumns}, minmax(0, 1fr))` }"
                  mt-3
                >
                  <template v-for="(sample, idx) in getUserSamplesWithPlaceholders(user.samples)" :key="sample?.id || `placeholder-${idx}`">
                    <VideoCard
                      v-if="sample"
                      :video="{
                        id: sample.aid || 0,
                        title: sample.title,
                        cover: sample.cover,
                        author: {
                          name: user.name,
                          mid: user.mid,
                          authorFace: user.face,
                        },
                        duration: sample.duration,
                        durationStr: sample.durationStr,
                        view: sample.play,
                        danmaku: 0,
                        publishedTimestamp: 0,
                        aid: sample.aid,
                        bvid: sample.bvid,
                        url: sample.url,
                        capsuleText: sample.badge,
                      }"
                      :horizontal="false"
                      :show-preview="true"
                      :hide-author="true"
                    />
                    <div v-else class="user-highlight-sample-placeholder" />
                  </template>
                </div>
              </div>
            </div>
          </div>

          <div
            v-else-if="!isInPaginationNonFirstPage && section?.result_type === 'article' && Array.isArray(section.data) && section.data.length"
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
        grid="~ cols-3 gap-4"
      >
        <UserCard
          v-for="user in searchResults.user?.result"
          :key="user.mid"
          v-bind="{
            ...convertUserCardData(user),
            isFollowed: props.userRelations[user.mid]?.isFollowing ? 1 : 0,
          }"
          :compact="true"
          @follow-state-changed="handleFollowStateChanged"
        />
      </div>

      <div
        v-else-if="currentCategory === 'bangumi'"
        class="bangumi-results"
        space-y-6
      >
        <div v-if="bangumiResultGroups.bangumi.length" class="bangumi-highlight-grid">
          <div
            v-for="bangumi in bangumiResultGroups.bangumi.map(convertBangumiHighlight)"
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
        <div v-if="bangumiResultGroups.movie.length" space-y-3>
          <h3 text="lg $bew-text-1" font-medium>
            其它
          </h3>
          <div class="bangumi-highlight-grid">
            <div
              v-for="item in bangumiResultGroups.movie.map(convertMediaFtHighlight)"
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

      <div
        v-else-if="currentCategory === 'media_ft'"
        class="media-ft-results"
        space-y-6
      >
        <div class="media-ft-highlight-grid">
          <div
            v-for="item in searchResults.media_ft?.result.map(convertMediaFtHighlight)"
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

      <div
        v-else-if="currentCategory === 'live'"
        class="live-results"
        space-y-6
      >
        <!-- 主播 (上面) -->
        <div
          v-if="liveUserList.length > 0
            && (props.currentLiveSubCategory === 'all' || props.currentLiveSubCategory === 'live_user')"
        >
          <div flex items-center gap-3 mb-3>
            <h3 text="lg $bew-text-1" font-medium>
              主播
            </h3>
            <span text="sm $bew-text-3">
              共找到{{ formatResultCount(props.currentLiveSubCategory === 'live_user' ? props.currentTotalResults : (props.liveUserTotalResults || liveUserList.length)) }}个结果
            </span>
            <!-- 排序按钮（仅在主播模式下显示） -->
            <div v-if="props.currentLiveSubCategory === 'live_user' && props.liveUserOrderOptions" flex items-center gap-2 ml-auto>
              <button
                v-for="option in props.liveUserOrderOptions"
                :key="option.value"
                class="live-user-order-btn"
                :class="{ active: props.liveUserOrder === option.value }"
                @click="emit('updateLiveUserOrder', option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <div grid="~ cols-3 gap-4">
            <UserCard
              v-for="user in (props.currentLiveSubCategory === 'all'
                ? liveUserList.slice(0, 6)
                : liveUserList)"
              :key="user.mid || user.uid"
              v-bind="{
                ...convertUserCardData(user),
                isFollowed: props.userRelations[user.mid || user.uid]?.isFollowing ? 1 : 0,
              }"
              :compact="true"
              @follow-state-changed="handleFollowStateChanged"
            />
          </div>
          <!-- 查看更多按钮 (仅在全部模式下且主播总数>6时显示) -->
          <div
            v-if="props.currentLiveSubCategory === 'all' && (props.liveUserTotalResults || 0) > 6"
            mt-4 flex justify-center
          >
            <button
              class="view-more-btn"
              px-6 py-2 rounded="$bew-radius-half"
              bg="$bew-fill-1 hover:$bew-fill-2"
              text="sm $bew-text-1"
              transition-all
              @click="emit('switchToLiveUser')"
            >
              查看更多主播 ({{ Math.max((props.liveUserTotalResults || 0) - 6, 0) }}+)
            </button>
          </div>
        </div>

        <!-- 直播间 (下面) -->
        <div
          v-if="liveRoomList.length > 0
            && (props.currentLiveSubCategory === 'all' || props.currentLiveSubCategory === 'live_room')"
        >
          <div flex items-center gap-3 mb-3>
            <h3 text="lg $bew-text-1" font-medium>
              直播间
            </h3>
            <span text="sm $bew-text-3">
              共找到{{ formatResultCount(props.currentLiveSubCategory === 'live_room' ? props.currentTotalResults : (props.liveRoomTotalResults || liveRoomList.length)) }}个结果
            </span>
            <!-- 排序按钮（仅在直播间或全部模式下显示） -->
            <div v-if="props.liveRoomOrderOptions && (props.currentLiveSubCategory === 'live_room' || props.currentLiveSubCategory === 'all')" flex items-center gap-2 ml-auto>
              <button
                v-for="option in props.liveRoomOrderOptions"
                :key="option.value"
                class="live-room-order-btn"
                :class="{ active: props.liveRoomOrder === option.value }"
                @click="emit('updateLiveRoomOrder', option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <div class="video-grid" :style="videoGridStyle">
            <VideoCard
              v-for="live in liveRoomList"
              :key="live.roomid"
              :video="convertLiveRoomData(live)"
              :show-watcher-later="false"
            />
          </div>
        </div>
      </div>

      <div
        v-else-if="currentCategory === 'article'"
        class="article-grid"
      >
        <ArticleCard
          v-for="article in searchResults.article?.result"
          :key="article.id"
          v-bind="convertArticleCardData(article)"
        />
      </div>
    </div>

    <!-- 滚动模式下的 Loading 由各个 Page 组件自己处理，这里只处理翻页模式 -->
    <Loading v-if="paginationMode === 'pagination' && isLoading && searchResults[currentCategory]" />

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
  text-decoration: none;
  color: inherit;
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
  line-clamp: 3;
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

.article-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
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
  padding: 0.5rem 1.25rem;
  border-radius: var(--bew-radius-half);
  background: var(--bew-theme-color);
  color: white;
  font-size: 0.875rem;
  border: 1px solid var(--bew-theme-color);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  min-width: 80px;
  user-select: none;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &.followed {
    background: var(--bew-fill-1);
    color: var(--bew-text-2);
    border: 1px solid transparent;

    &:hover:not(:disabled) {
      background: var(--bew-fill-2);
    }
  }
}

.user-highlight-desc {
  font-size: 0.875rem;
  color: var(--bew-text-2);
  line-height: 1.5;
}

.user-level-badge-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  :deep(svg) {
    width: 25px;
    height: 16px;
  }
}

.gender-icon-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;

  &.gender-male {
    color: rgb(93, 193, 255); // 淡蓝色
  }

  &.gender-female {
    color: rgb(255, 135, 182); // 淡粉色
  }
}

.user-highlight-samples {
  display: grid;
  gap: 1rem;
  // grid-template-columns 由内联样式动态设置
}

.user-highlight-sample-placeholder {
  // 占位符，保持网格布局完整
  min-height: 1px;
  visibility: hidden;
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
  line-clamp: 2;
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
  line-clamp: 3;
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
  line-clamp: 3;
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

.view-more-btn {
  cursor: pointer;
  border: none;
  user-select: none;

  &:active {
    transform: scale(0.98);
  }
}

.live-room-order-btn,
.live-user-order-btn {
  padding: 0.25rem 0.75rem;
  border-radius: var(--bew-radius-half);
  background: var(--bew-fill-1);
  color: var(--bew-text-2);
  font-size: 0.8125rem; // 更小的字体
  font-weight: 300; // 更细的字体
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  white-space: nowrap;

  &:hover {
    background: var(--bew-fill-2);
  }

  &.active {
    background: var(--bew-theme-color-20);
    color: var(--bew-theme-color);
  }

  &:active {
    transform: scale(0.98);
  }
}

.more-esports-button {
  display: block;
  text-align: center;
  padding: 0.5rem;
  font-size: 0.875rem;
  color: var(--bew-theme-color);
  text-decoration: none;
  border-radius: var(--bew-radius);
  transition: all 0.3s ease;

  &:hover {
    background: var(--bew-theme-color-10);
  }
}
</style>
