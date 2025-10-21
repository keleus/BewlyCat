<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import api from '~/utils/api'

import Pagination from '../components/Pagination.vue'
import MediaFtResultsView from '../components/renderers/MediaFtResultsView.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { dedupeByKey } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  initialPage?: number
}>()

const emit = defineEmits<{
  updatePage: [page: number]
}>()

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
} = useSearchRequest<any[]>('media_ft')

const {
  currentPage,
  totalResults,
  totalPages,
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
  setExhausted,
  reset: resetLoadMore,
} = useLoadMore(async () => {
  const success = await performSearch(true)
  const itemsCount = results.value?.length || 0
  return { success, itemsCount }
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
    params => api.search.searchMediaFt(params),
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
    params => api.search.searchMediaFt(params),
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
  <div class="media-ft-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      {{ $t('common.no_data') }}
    </div>

    <MediaFtResultsView v-else :media-items="results || []" />

    <!-- 滚动加载模式 -->
    <template v-if="paginationMode === 'scroll'">
      <Loading v-if="isLoading && results && results.length > 0" />

      <Empty
        v-else-if="!isLoading && results && results.length > 0 && !hasMore"
        :description="$t('common.no_more_content')"
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
.media-ft-search-page {
  width: 100%;
  padding-bottom: 2rem;
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
