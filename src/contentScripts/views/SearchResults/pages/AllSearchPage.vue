<script lang="ts" setup>
import { useResizeObserver } from '@vueuse/core'
import DOMPurify from 'dompurify'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ArticleCard from '~/components/ArticleCard/ArticleCard.vue'
import BangumiEpisodeList from '~/components/BangumiEpisodeList/BangumiEpisodeList.vue'
import Loading from '~/components/Loading.vue'
import MediaEpisodeSelect from '~/components/MediaEpisodeSelect/MediaEpisodeSelect.vue'
import VideoCard from '~/components/VideoCard/VideoCard.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import api from '~/utils/api'
import { LV0_ICON, LV1_ICON, LV2_ICON, LV3_ICON, LV4_ICON, LV5_ICON, LV6_ICON } from '~/utils/lvIcons'
import { getCSRF } from '~/utils/main'

import Pagination from '../components/Pagination.vue'
import EsportsMatchCard from '../components/renderers/EsportsMatchCard.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { useUserRelations } from '../composables/useUserRelations'
import {
  convertActivityData,
  convertArticleCardData,
  convertBangumiHighlight,
  convertLiveRoomData,
  convertUserHighlight,
  convertVideoData,
  convertWebGameData,
  formatNumber,
  isAdVideo,
  removeHighlight,
  removeUnusedActivityCard,
} from '../searchTransforms'
import type { VideoSearchFilters } from '../types'
import { applyVideoTimeFilter, buildVideoSearchParams } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  filters: VideoSearchFilters
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

const { t } = useI18n()

const { haveScrollbar, handleBackToTop } = useBewlyApp()

// 分页模式
const paginationMode = computed(() => settings.value.searchResultsPaginationMode)
const isPageChanging = ref(false)

// 用户关系管理
const {
  userRelations,
  batchQueryUserRelations,
  updateUserRelation,
} = useUserRelations()

// 搜索请求管理
const {
  isLoading,
  error,
  results,
  lastResponse,
  search,
  reset: resetSearch,
} = useSearchRequest<any>('all')

// 分页管理
const {
  currentPage,
  totalResults,
  totalPages,
  context,
  hasMore: paginationHasMore,
  extractPagination,
  updatePage,
  getNextPage,
  reset: resetPagination,
} = usePagination()

// 无限加载管理
const {
  hasMore,
  exhausted,
  requestLoadMore,
  handleLoadMoreCompletion,
  setHasMore,
  setExhausted,
  reset: resetLoadMore,
} = useLoadMore(async () => {
  const success = await performSearch(true)
  const itemsCount = getCurrentResultLength()
  return { success, itemsCount }
})

// 是否激活视频筛选
const isVideoFilterActive = computed(() => {
  if (props.filters.order !== '' || props.filters.duration !== 0)
    return true
  if (props.filters.timeRange !== 'all')
    return true
  if (props.filters.customStartDate !== '' || props.filters.customEndDate !== '')
    return true
  return false
})

// 是否在翻页模式的非首页
const isInPaginationNonFirstPage = computed(() => {
  return paginationMode.value === 'pagination' && currentPage.value > 1
})

// 容器宽度和间距
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

// 赛事卡片样式计算
const esportsCardStyle = computed(() => {
  const containerWidth = searchContentWidth.value
  const cardMinWidth = 250
  const gap = videoGridGap.value
  const maxCards = 5

  if (!containerWidth || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return { cardWidth: `${cardMinWidth}px` }
  }

  const rawColumns = Math.floor((containerWidth + gap) / (cardMinWidth + gap))
  const columns = Math.min(Math.max(rawColumns, 1), maxCards)
  const totalGap = gap * Math.max(columns - 1, 0)
  const available = containerWidth - totalGap
  const cardWidth = columns > 0 ? Math.max(available / columns, cardMinWidth) : cardMinWidth

  return { cardWidth: `${cardWidth}px` }
})

// 用户代表作列数
const userSamplesColumns = computed(() => {
  const containerWidth = searchContentWidth.value
  const cardMinWidth = 180
  const gap = videoGridGap.value

  if (!containerWidth || !Number.isFinite(containerWidth) || containerWidth <= 0)
    return 6

  const columns = Math.floor((containerWidth + gap) / (cardMinWidth + gap))
  return Math.max(1, Math.min(columns, 7))
})

function getUserSamplesWithPlaceholders(samples: any[]) {
  const columns = userSamplesColumns.value
  const actualSamples = samples.slice(0, columns)
  const placeholdersCount = Math.max(0, columns - actualSamples.length)
  const placeholders = Array.from({ length: placeholdersCount }, () => null)
  return [...actualSamples, ...placeholders]
}

// 合并活动和游戏数据
const activityAndGameItems = computed(() => {
  if (!results.value?.result)
    return []

  const items: any[] = []
  const sections = results.value.result

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

// 等级图标
const levelIcons: string[] = [LV0_ICON, LV1_ICON, LV2_ICON, LV3_ICON, LV4_ICON, LV5_ICON, LV6_ICON]
function getLvIcon(level: number): string {
  return levelIcons[level] || LV0_ICON
}

// 关注操作
async function handleUserFollow(mid: number) {
  // 如果用户关系状态不存在，先初始化一个默认状态
  if (!userRelations.value[mid]) {
    userRelations.value[mid] = {
      isFollowing: false,
      isLoading: false,
    }
  }

  const state = userRelations.value[mid]
  if (state.isLoading)
    return

  try {
    state.isLoading = true
    const csrf = getCSRF()
    const act = state.isFollowing ? 2 : 1

    const response = await api.user.relationModify({
      fid: String(mid),
      act,
      re_src: 11,
      csrf,
    })

    if (response.code === 0)
      updateUserRelation(mid, !state.isFollowing)
  }
  catch (error) {
    console.error('关注操作出错:', error)
  }
  finally {
    state.isLoading = false
  }
}

function openExternalLink(url?: string) {
  if (!url)
    return
  window.open(url, '_blank', 'noopener')
}

// 获取当前结果长度
function getCurrentResultLength(): number {
  if (!results.value)
    return 0
  const sections = Array.isArray(results.value?.result) ? results.value.result : []
  return sections.reduce((sum: number, section: any) => {
    if (Array.isArray(section?.data))
      return sum + section.data.length
    return sum
  }, 0)
}

// 提取视频列表（过滤广告）
const videoList = computed(() => {
  if (!results.value?.result)
    return []
  const videoSection = results.value.result.find((s: any) => s?.result_type === 'video')
  if (!videoSection || !Array.isArray(videoSection.data))
    return []
  return videoSection.data.filter((v: any) => !isAdVideo(v))
})

onMounted(() => {
  updateVideoGridGap()
  if (searchContentRef.value)
    searchContentWidth.value = searchContentRef.value.clientWidth
  if (typeof window !== 'undefined')
    window.addEventListener('resize', updateVideoGridGap)

  const keyword = props.keyword.trim()
  if (keyword) {
    if (props.initialPage && props.initialPage > 1)
      updatePage(props.initialPage)
    performSearch(false)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined')
    window.removeEventListener('resize', updateVideoGridGap)
})

watch(() => props.keyword, async (newKeyword, oldKeyword) => {
  const normalizedNew = (newKeyword || '').trim()
  const normalizedOld = (oldKeyword || '').trim()

  if (!normalizedNew) {
    resetAll()
    return
  }

  if (normalizedNew !== normalizedOld) {
    resetAll()
    await performSearch(false)
  }
})

watch(() => props.filters, () => {
  if (!props.keyword.trim())
    return
  resetAll()
  void performSearch(false)
}, { deep: true })

async function performSearch(loadMore: boolean): Promise<boolean> {
  const keyword = props.keyword.trim()
  if (!keyword)
    return false

  const isLoadMore = paginationMode.value === 'scroll' && loadMore

  if (isLoadMore && (isLoading.value || exhausted.value))
    return false

  if (!isLoadMore)
    setExhausted(false)

  const targetPage = isLoadMore ? getNextPage(true) : (currentPage.value > 0 ? currentPage.value : getNextPage(false))
  const previousLength = getCurrentResultLength()

  let success = false
  const useVideoFilters = isVideoFilterActive.value

  if (useVideoFilters) {
    success = await search(
      keyword,
      params => api.search.searchVideo(params),
      {
        page: targetPage,
        page_size: 30,
        ...buildVideoSearchParams({
          loadMore: isLoadMore,
          context: context.value,
          filters: props.filters,
        }),
      },
    )
  }
  else {
    success = await search(
      keyword,
      params => api.search.searchAll(params),
      {
        page: targetPage,
        page_size: 30,
        context: targetPage > 1 ? context.value : '',
        web_roll_page: targetPage,
      },
    )
  }

  if (!success || !lastResponse.value?.data)
    return false

  const rawData = lastResponse.value.data

  let normalizedData = rawData
  if (useVideoFilters) {
    const list = Array.isArray(rawData?.result) ? rawData.result : []
    normalizedData = {
      ...rawData,
      result: [{ result_type: 'video', data: list }],
    }
  }

  const incomingSections = Array.isArray(normalizedData?.result) ? normalizedData.result : []

  if (isLoadMore && results.value) {
    results.value = mergeSections(results.value, normalizedData)
  }
  else {
    results.value = normalizedData
  }

  if (Array.isArray(results.value?.result)) {
    const userSection = results.value.result.find((s: any) => s?.result_type === 'bili_user')
    if (userSection && Array.isArray(userSection.data)) {
      const mids = userSection.data.map((u: any) => u.mid).filter(Boolean)
      await batchQueryUserRelations(mids)
    }
  }

  const fallbackLength = incomingSections.reduce((sum: number, section: any) => {
    if (Array.isArray(section?.data))
      return sum + section.data.length
    return sum
  }, 0)
  extractPagination(rawData, fallbackLength)
  updatePage(targetPage)
  setHasMore(paginationHasMore.value)

  if (paginationMode.value === 'scroll') {
    const finalLength = getCurrentResultLength()
    const newItems = Math.max(finalLength - previousLength, 0)
    const incomingLength = incomingSections.reduce((sum: number, section: any) => {
      if (Array.isArray(section?.data))
        return sum + section.data.length
      return sum
    }, 0)

    if (incomingLength === 0)
      setExhausted(true)
    else if (newItems <= 0 && targetPage >= totalPages.value)
      setExhausted(true)

    if (isLoadMore)
      await handleLoadMoreCompletion(haveScrollbar)
  }

  return true
}

function mergeSections(previous: any, incoming: any) {
  const prevSections = Array.isArray(previous?.result) ? previous.result : []
  const incomingSections = Array.isArray(incoming?.result) ? incoming.result : []
  const sectionMap = new Map<string, any>()

  prevSections.forEach((section: any) => {
    const data = Array.isArray(section?.data)
      ? dedupeSectionItems(section.result_type, [...section.data])
      : section.data
    sectionMap.set(section.result_type, { ...section, data })
  })

  incomingSections.forEach((section: any) => {
    const data = Array.isArray(section?.data) ? [...section.data] : []
    if (sectionMap.has(section.result_type)) {
      const existing = sectionMap.get(section.result_type)
      const merged = Array.isArray(existing?.data) ? [...existing.data, ...data] : data
      sectionMap.set(section.result_type, {
        ...existing,
        ...section,
        data: dedupeSectionItems(section.result_type, merged),
      })
    }
    else {
      sectionMap.set(section.result_type, {
        ...section,
        data: dedupeSectionItems(section.result_type, data),
      })
    }
  })

  const resultSections = Array.from(sectionMap.values()).map((section: any) => {
    if (section?.result_type === 'video' && Array.isArray(section.data)) {
      return { ...section, data: applyVideoTimeFilter(section.data) }
    }
    return section
  })

  return { ...previous, ...incoming, result: resultSections }
}

function dedupeSectionItems(type: string, items: any[]): any[] {
  const seen = new Set<string>()
  const result: any[] = []
  items.forEach((item) => {
    const key = getSectionItemKey(type, item)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  })
  return result
}

function getSectionItemKey(type: string, item: any): string {
  switch (type) {
    case 'video':
      return String(item?.aid ?? item?.id ?? item?.bvid ?? JSON.stringify(item))
    case 'media_bangumi':
    case 'media_ft':
      return String(item?.season_id ?? item?.media_id ?? item?.id ?? JSON.stringify(item))
    case 'bili_user':
      return String(item?.mid ?? JSON.stringify(item))
    case 'article':
      return String(item?.id ?? JSON.stringify(item))
    case 'live_room':
      return String(item?.roomid ?? item?.id ?? JSON.stringify(item))
    default:
      return String(item?.id ?? item?.aid ?? item?.bvid ?? item?.mid ?? JSON.stringify(item))
  }
}

async function handlePageChange(page: number) {
  if (paginationMode.value !== 'pagination')
    return

  const keyword = props.keyword.trim()
  if (!keyword)
    return

  handleBackToTop()
  await nextTick()

  isPageChanging.value = true

  let success = false
  const useVideoFilters = isVideoFilterActive.value

  if (useVideoFilters) {
    success = await search(
      keyword,
      params => api.search.searchVideo(params),
      {
        page,
        page_size: 30,
        ...buildVideoSearchParams({
          loadMore: false,
          context: context.value,
          filters: props.filters,
        }),
      },
    )
  }
  else {
    success = await search(
      keyword,
      params => api.search.searchAll(params),
      {
        page,
        page_size: 30,
        context: page > 1 ? context.value : '',
        web_roll_page: page,
      },
    )
  }

  if (!success || !lastResponse.value?.data)
    return

  const rawData = lastResponse.value.data

  let normalizedData = rawData
  if (useVideoFilters) {
    const list = Array.isArray(rawData?.result) ? rawData.result : []
    normalizedData = {
      ...rawData,
      result: [{ result_type: 'video', data: list }],
    }
  }

  const incomingSections = Array.isArray(normalizedData?.result) ? normalizedData.result : []

  results.value = normalizedData

  if (Array.isArray(results.value?.result)) {
    const userSection = results.value.result.find((s: any) => s?.result_type === 'bili_user')
    if (userSection && Array.isArray(userSection.data)) {
      const mids = userSection.data.map((u: any) => u.mid).filter(Boolean)
      await batchQueryUserRelations(mids)
    }
  }

  const fallbackLength = incomingSections.reduce((sum: number, section: any) => {
    if (Array.isArray(section?.data))
      return sum + section.data.length
    return sum
  }, 0)
  extractPagination(rawData, fallbackLength)
  updatePage(page)
  setHasMore(paginationHasMore.value)

  isPageChanging.value = false
  emit('updatePage', page)
}

function resetAll() {
  resetSearch()
  resetPagination()
  resetLoadMore()
  results.value = null
}

async function handleLoadMore() {
  if (paginationMode.value !== 'scroll')
    return
  if (isLoading.value || exhausted.value)
    return

  await performSearch(true)
}

defineExpose({
  isLoading,
  error,
  results,
  totalResults,
  hasMore,
  requestLoadMore,
  userRelations,
  updateUserRelation,
  currentPage,
  totalPages,
})
</script>

<template>
  <div ref="searchContentRef" class="all-search-page">
    <!-- Loading -->
    <Loading v-if="isLoading && !results" />

    <!-- Results -->
    <div v-else class="all-results" space-y-6>
      <!-- 活动和游戏 -->
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
              <img v-if="item.cover" :src="item.cover" :alt="item.title">
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

      <!-- 各类 section -->
      <template v-for="(section, index) in results?.result" :key="`${section?.result_type ?? 'unknown'}-${index}`">
        <!-- 跳过视频（将在最后渲染） -->
        <template v-if="section?.result_type === 'video'" />

        <!-- 番剧/影视 -->
        <div
          v-else-if="!isInPaginationNonFirstPage && (section?.result_type === 'media_bangumi' || section?.result_type === 'media_ft')
            && Array.isArray(section.data) && section.data.length"
        >
          <h3 text="lg $bew-text-1" font-medium mb-3 mt-6>
            {{ section.result_type === 'media_ft' ? '影视' : '番剧' }}
          </h3>
          <!-- 影视 -->
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
              >
                <img :src="item.cover" :alt="removeHighlight(item.title)">
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
                  <span v-if="item.areas">{{ item.areas }}</span>
                  <span v-if="item.styles">{{ item.styles }}</span>
                  <span v-if="item.index_show">{{ item.index_show }}</span>
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
                  >
                    立即观看
                  </a>
                </div>
              </div>
            </div>
          </div>
          <!-- 番剧 -->
          <div v-else class="bangumi-highlight-grid">
            <div
              v-for="bangumi in section.data.slice(0, 2).map(convertBangumiHighlight)"
              :key="bangumi.id || bangumi.title"
              class="bangumi-highlight-card"
            >
              <a class="bangumi-highlight-cover" :href="bangumi.url" target="_blank">
                <img :src="bangumi.cover" :alt="bangumi.title">
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
                  <span v-if="bangumi.areas">{{ bangumi.areas }}</span>
                  <span v-if="bangumi.episodeCount">共 {{ bangumi.episodeCount }} 话</span>
                  <span v-if="bangumi.publishDateFormatted">首播：{{ bangumi.publishDateFormatted }}</span>
                </div>
                <div v-if="bangumi.desc" class="bangumi-highlight-desc">
                  {{ bangumi.desc }}
                </div>
                <div v-if="bangumi.tags?.length" class="bangumi-highlight-tags">
                  <span v-for="tag in bangumi.tags" :key="tag">{{ tag }}</span>
                </div>
                <BangumiEpisodeList
                  v-if="(bangumi.episodes && bangumi.episodes.length) || bangumi.episodeCount"
                  :episodes="bangumi.episodes ?? []"
                  :total-episodes="bangumi.episodeCount"
                  :fallback-url="bangumi.url"
                />
                <div class="bangumi-highlight-actions" flex items-center gap-3>
                  <a class="bangumi-highlight-button" :href="bangumi.url" target="_blank">
                    {{ bangumi.buttonText || '立即观看' }}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 跳过活动和游戏 -->
        <template v-else-if="section?.result_type === 'activity' || section?.result_type === 'web_game'" />

        <!-- 赛事 -->
        <div v-else-if="!isInPaginationNonFirstPage && section?.result_type === 'esports' && Array.isArray(section.data) && section.data.length">
          <h3 text="lg $bew-text-1" font-medium mb-3 mt-6>
            赛程日历
          </h3>
          <div class="esports-grid" flex="~ wrap gap-4" mb-4>
            <template v-for="contestData in section.data" :key="`esports-data-${contestData.contest?.[0]?.ID}`">
              <EsportsMatchCard
                v-for="contest in contestData.contest?.slice(0, 5)"
                :key="`contest-${contest.ID}`"
                :contest="contest"
                :card-width="esportsCardStyle.cardWidth"
              />
            </template>
          </div>
          <a
            :href="`https://www.bilibili.com/v/game/match/schedule?mid=${section.data[0]?.contest?.[0]?.mid || 0}&time=${Date.now()}`"
            target="_blank"
            class="more-esports-button"
          >
            {{ t('search_page.view_all_esports') }}
          </a>
        </div>

        <!-- 用户 -->
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
                    class="user-highlight-name" text="base $bew-text-1" font-medium flex items-center
                    gap-2
                  >
                    <a :href="user.url" target="_blank">{{ user.name }}</a>
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
                  :class="{ followed: userRelations[user.mid]?.isFollowing }"
                  :disabled="userRelations[user.mid]?.isLoading"
                  @click.stop="handleUserFollow(user.mid)"
                >
                  {{ userRelations[user.mid]?.isLoading ? '...' : userRelations[user.mid]?.isFollowing ? '已关注' : '+ 关注' }}
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
                      author: { name: user.name, mid: user.mid, authorFace: user.face },
                      duration: sample.duration,
                      durationStr: sample.durationStr,
                      view: sample.play,
                      danmaku: 0,
                      publishedTimestamp: 0,
                      aid: sample.aid,
                      bvid: sample.bvid,
                      url: sample.url,
                      capsuleText: sample.badge,
                      threePointV2: [],
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

        <!-- 专栏 -->
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

      <!-- 视频（放在最后，因为有滚动加载） -->
      <div>
        <h3 v-if="videoList.length > 0" text="lg $bew-text-1" font-medium mb-3 mt-6>
          视频
        </h3>
        <VideoCardGrid
          :items="videoList"
          :transform-item="(item: any) => item.type === 'live_room' ? convertLiveRoomData(item) : convertVideoData(item)"
          :get-item-key="(item: any) => item.aid || item.id || item.roomid"
          grid-layout="adaptive"
          :loading="isLoading"
          :no-more-content="!hasMore"
          :show-preview="true"
          :show-watcher-later="true"
          :empty-description="t('common.no_data')"
          enable-row-padding
          @load-more="handleLoadMore"
        />
      </div>
    </div>

    <!-- Pagination -->
    <Pagination
      v-if="paginationMode === 'pagination'"
      :current-page="currentPage"
      :total-pages="totalPages"
      :loading="isPageChanging"
      :disabled="isLoading"
      @change="handlePageChange"
    />
  </div>
</template>

<style scoped lang="scss">
.all-search-page {
  width: 100%;
  padding-bottom: 2rem;
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

.bangumi-highlight-grid,
.media-ft-highlight-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 1024px) {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
}

.bangumi-highlight-card,
.media-ft-highlight-card {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--bew-elevated);
  border-radius: var(--bew-radius);
}

.bangumi-highlight-cover,
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

.bangumi-highlight-badge,
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

.bangumi-highlight-info,
.media-ft-highlight-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.bangumi-highlight-desc,
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

.bangumi-highlight-actions,
.media-ft-highlight-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.bangumi-highlight-button,
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
  cursor: pointer;
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
    color: rgb(93, 193, 255);
  }

  &.gender-female {
    color: rgb(255, 135, 182);
  }
}

.user-highlight-samples {
  display: grid;
  gap: 1rem;
}

.user-highlight-sample-placeholder {
  min-height: 1px;
  visibility: hidden;
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

.article-results {
  display: grid;
}
</style>
