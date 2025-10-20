<script lang="ts" setup>
import { onMounted, watch } from 'vue'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import api from '~/utils/api'

import VideoGrid from '../components/renderers/VideoGrid.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { convertVideoData } from '../searchTransforms'
import type { VideoSearchFilters } from '../types'
import { applyVideoTimeFilter, buildVideoSearchParams } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  filters: VideoSearchFilters
}>()

const { haveScrollbar } = useBewlyApp()

// 搜索请求管理
const {
  isLoading,
  error,
  results,
  lastResponse,
  search,
  reset: resetSearch,
} = useSearchRequest<any[]>('video')

// 分页管理
const {
  totalResults,
  totalPages,
  context,
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
  setExhausted,
  reset: resetLoadMore,
} = useLoadMore(async () => {
  const success = await performSearch(true)
  const itemsCount = results.value?.length || 0
  return { success, itemsCount }
})

// 监听关键词变化
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

// 监听筛选条件变化
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

  if (loadMore && (isLoading.value || exhausted.value))
    return false

  if (!loadMore)
    setExhausted(false)

  const targetPage = getNextPage(loadMore)
  const previousLength = results.value?.length || 0

  const success = await search(
    keyword,
    params => api.search.searchVideo(params),
    {
      page: targetPage,
      page_size: 30,
      ...buildVideoSearchParams({
        loadMore,
        context: context.value,
        filters: props.filters,
      }),
    },
  )

  if (!success)
    return false

  if (!lastResponse.value?.data)
    return false

  const rawData = lastResponse.value.data
  const incomingList = Array.isArray(rawData?.result) ? rawData.result : []

  // 过滤广告
  const filteredList = applyVideoTimeFilter(incomingList)

  // 转换数据格式
  const convertedList = filteredList.map(item => convertVideoData(item))

  // 合并或替换结果
  if (loadMore && results.value) {
    results.value = [...results.value, ...convertedList]
  }
  else {
    results.value = convertedList
  }

  // 提取分页信息
  extractPagination(rawData, filteredList.length)
  updatePage(targetPage)

  // 检查是否已耗尽
  const finalLength = results.value.length
  const newItems = Math.max(finalLength - previousLength, 0)

  if (incomingList.length === 0) {
    setExhausted(true)
  }
  else if (newItems <= 0 && targetPage >= totalPages.value) {
    setExhausted(true)
  }

  // 处理加载完成
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

// 暴露给父组件
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
  <div class="video-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      {{ $t('common.no_data') }}
    </div>

    <VideoGrid v-else :videos="results || []" :auto-convert="false" />

    <Loading v-if="isLoading && results && results.length > 0" />

    <Empty
      v-else-if="!isLoading && results && results.length > 0 && !hasMore"
      :description="$t('common.no_more_content')"
    />
  </div>
</template>

<style scoped lang="scss">
.video-search-page {
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
