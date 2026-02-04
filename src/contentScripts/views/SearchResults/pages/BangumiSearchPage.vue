<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BangumiEpisodeList from '~/components/BangumiEpisodeList/BangumiEpisodeList.vue'
import Empty from '~/components/Empty.vue'
import MediaEpisodeSelect from '~/components/MediaEpisodeSelect/MediaEpisodeSelect.vue'
import SmoothLoading from '~/components/SmoothLoading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import api from '~/utils/api'

import Pagination from '../components/Pagination.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { convertBangumiHighlight, convertMediaFtHighlight, isMediaFtItem } from '../searchTransforms'
import { dedupeByKey } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

const { t } = useI18n()

const { haveScrollbar, handleBackToTop } = useBewlyApp()

// 分页模式：scroll 滚动加载，pagination 翻页
const paginationMode = computed(() => settings.value.searchResultsPaginationMode)

// 翻页加载状态
const isPageChanging = ref(false)

const {
  isLoading,
  error,
  results,
  lastResponse,
  search,
  reset: resetSearch,
} = useSearchRequest<any[]>('bangumi')

const {
  currentPage,
  totalResults,
  totalPages,
  hasMore: paginationHasMore,
  extractPagination,
  updatePage,
  getNextPage,
  reset: resetPagination,
} = usePagination()

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
  const itemsCount = results.value?.length || 0
  return { success, itemsCount }
})

// 将番剧分组为番剧和影视
const bangumiGroups = computed(() => {
  const list = results.value || []
  return {
    bangumi: list.filter(item => !isMediaFtItem(item)),
    movie: list.filter(item => isMediaFtItem(item)),
  }
})

watch(() => props.keyword, async (newKeyword, oldKeyword) => {
  const normalizedNew = (newKeyword || '').trim()
  const normalizedOld = (oldKeyword || '').trim()

  if (!normalizedNew) {
    resetAll()
    return
  }

  // 关键词变化时才执行
  if (normalizedNew !== normalizedOld) {
    resetAll()
    await performSearch(false)
  }
})

// 组件挂载时立即执行搜索
onMounted(() => {
  const keyword = props.keyword.trim()
  if (keyword) {
    // 如果有初始页码，先设置页码
    if (props.initialPage && props.initialPage > 1) {
      updatePage(props.initialPage)
    }
    performSearch(false)
  }
})

async function performSearch(loadMore: boolean): Promise<boolean> {
  const keyword = props.keyword.trim()
  if (!keyword)
    return false

  // 分页模式下不支持 loadMore
  const isLoadMore = paginationMode.value === 'scroll' && loadMore

  if (isLoadMore && (isLoading.value || exhausted.value))
    return false

  if (!isLoadMore)
    setExhausted(false)

  // 滚动模式下：loadMore 使用 getNextPage，否则从第1页开始
  // 翻页模式下：使用 currentPage（如果有设置）或从第1页开始
  const targetPage = isLoadMore ? getNextPage(true) : (currentPage.value > 0 ? currentPage.value : getNextPage(false))
  const previousLength = results.value?.length || 0

  const success = await search(
    keyword,
    params => api.search.searchBangumi(params),
    {
      page: targetPage,
      pagesize: 30,
    },
  )

  if (!success || !lastResponse.value?.data)
    return false

  const rawData = lastResponse.value.data
  const incomingList = Array.isArray(rawData?.result) ? rawData.result : []

  if (isLoadMore && results.value) {
    const merged = [...results.value, ...incomingList]
    results.value = dedupeByKey(merged, item =>
      String(item?.season_id ?? item?.media_id ?? item?.id ?? JSON.stringify(item)))
  }
  else {
    results.value = incomingList
  }

  extractPagination(rawData, incomingList.length)
  updatePage(targetPage)
  setHasMore(paginationHasMore.value)

  // 检查是否已耗尽（仅在滚动模式下）
  if (paginationMode.value === 'scroll') {
    const finalLength = results.value!.length
    const newItems = Math.max(finalLength - previousLength, 0)

    if (incomingList.length === 0) {
      setExhausted(true)
    }
    else if (newItems <= 0 && targetPage >= totalPages.value) {
      setExhausted(true)
    }

    // 处理加载完成
    if (isLoadMore)
      await handleLoadMoreCompletion(haveScrollbar)
  }

  return true
}

// 翻页模式的页码切换
async function handlePageChange(page: number) {
  if (paginationMode.value !== 'pagination')
    return

  const keyword = props.keyword.trim()
  if (!keyword)
    return

  // 先滚动到顶部
  handleBackToTop()
  await nextTick()

  isPageChanging.value = true

  const success = await search(
    keyword,
    params => api.search.searchBangumi(params),
    {
      page,
      pagesize: 30,
    },
  )

  if (!success || !lastResponse.value?.data)
    return

  const rawData = lastResponse.value.data
  const incomingList = Array.isArray(rawData?.result) ? rawData.result : []

  // 替换结果
  results.value = incomingList

  // 提取分页信息
  extractPagination(rawData, incomingList.length)
  updatePage(page)
  setHasMore(paginationHasMore.value)

  isPageChanging.value = false

  // 更新 URL 中的页码参数
  emit('updatePage', page)
}

function resetAll() {
  resetSearch()
  resetPagination()
  resetLoadMore()
  results.value = []
}

defineExpose({
  isLoading,
  error,
  results,
  totalResults,
  hasMore,
  requestLoadMore,
  currentPage,
  totalPages,
})
</script>

<template>
  <div class="bangumi-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      <Empty :description="t('common.no_data')" />
    </div>

    <div v-else class="bangumi-results" space-y-6>
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

    <!-- 滚动加载模式 -->
    <template v-if="paginationMode === 'scroll'">
      <SmoothLoading
        :show="isLoading && results && results.length > 0"
        :keep-space="true"
      />

      <Empty
        v-if="!isLoading && results && results.length > 0 && !hasMore"
        :description="t('common.no_more_content')"
      />
    </template>

    <!-- 翻页模式 -->
    <template v-else>
      <Pagination
        :current-page="currentPage"
        :total-pages="totalPages"
        :loading="isPageChanging"
        :disabled="isLoading"
        @change="handlePageChange"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.bangumi-search-page {
  width: 100%;
  padding-bottom: 2rem;
}

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

.error-message {
  padding: 2rem;
  text-align: center;
  color: var(--bew-error-color);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--bew-text-2);
}
</style>
