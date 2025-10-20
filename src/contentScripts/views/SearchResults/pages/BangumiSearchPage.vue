<script lang="ts" setup>
import { onMounted, watch } from 'vue'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import api from '~/utils/api'

import BangumiResultsView from '../components/renderers/BangumiResultsView.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { dedupeByKey } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
}>()

const { haveScrollbar } = useBewlyApp()

const {
  isLoading,
  error,
  results,
  lastResponse,
  search,
  reset: resetSearch,
} = useSearchRequest<any[]>('bangumi')

const {
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
    performSearch(false)
  }
})

async function performSearch(loadMore: boolean): Promise<boolean> {
  const keyword = props.keyword.trim()
  if (!keyword)
    return false

  if (loadMore && (isLoading.value || exhausted.value))
    return false

  if (!loadMore)
    setExhausted(false)

  const targetPage = getNextPage(loadMore)
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

  if (loadMore && results.value) {
    const merged = [...results.value, ...incomingList]
    results.value = dedupeByKey(merged, item =>
      String(item?.season_id ?? item?.media_id ?? item?.id ?? JSON.stringify(item)))
  }
  else {
    results.value = incomingList
  }

  extractPagination(rawData, incomingList.length)
  updatePage(targetPage)

  const finalLength = results.value!.length
  const newItems = Math.max(finalLength - previousLength, 0)

  if (incomingList.length === 0) {
    setExhausted(true)
  }
  else if (newItems <= 0 && targetPage >= totalPages.value) {
    setExhausted(true)
  }

  if (loadMore)
    await handleLoadMoreCompletion(haveScrollbar)

  return true
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
})
</script>

<template>
  <div class="bangumi-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      {{ $t('common.no_data') }}
    </div>

    <BangumiResultsView v-else :bangumi-items="results || []" />

    <Loading v-if="isLoading && results && results.length > 0" />

    <Empty
      v-else-if="!isLoading && results && results.length > 0 && !hasMore"
      :description="$t('common.no_more_content')"
    />
  </div>
</template>

<style scoped lang="scss">
.bangumi-search-page {
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
