<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import api from '~/utils/api'

import Pagination from '../components/Pagination.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { convertLiveRoomData, convertVideoData, isAdVideo } from '../searchTransforms'
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

const { haveScrollbar, handleBackToTop } = useBewlyApp()

// 分页模式：scroll 滚动加载，pagination 翻页
const paginationMode = computed(() => settings.value.searchResultsPaginationMode)

// 翻页加载状态
const isPageChanging = ref(false)

// Grid 布局：搜索结果使用 adaptive 布局
const gridLayout = computed<GridLayoutType>(() => 'adaptive')

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
  currentPage,
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
    // 如果有初始页码，先设置页码
    if (props.initialPage && props.initialPage > 1) {
      updatePage(props.initialPage)
    }
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

  if (!success)
    return false

  if (!lastResponse.value?.data)
    return false

  const rawData = lastResponse.value.data
  const incomingList = Array.isArray(rawData?.result) ? rawData.result : []

  // 过滤广告和应用时间过滤
  const filteredList = applyVideoTimeFilter(incomingList.filter(item => !isAdVideo(item)))

  // 转换数据格式 - 根据类型选择正确的转换函数
  const convertedList = filteredList.map((item) => {
    // 如果是直播间类型，使用直播间转换函数
    if (item.type === 'live_room') {
      return convertLiveRoomData(item)
    }
    // 否则使用视频转换函数
    return convertVideoData(item)
  })

  // 合并或替换结果
  if (isLoadMore && results.value) {
    results.value = [...results.value, ...convertedList]
  }
  else {
    results.value = convertedList
  }

  // 提取分页信息
  extractPagination(rawData, filteredList.length)
  updatePage(targetPage)

  // 检查是否已耗尽（仅在滚动模式下）
  if (paginationMode.value === 'scroll') {
    const finalLength = results.value.length
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

  if (!success || !lastResponse.value?.data) {
    isPageChanging.value = false
    return
  }

  const rawData = lastResponse.value.data
  const incomingList = Array.isArray(rawData?.result) ? rawData.result : []

  // 过滤广告和应用时间过滤
  const filteredList = applyVideoTimeFilter(incomingList.filter(item => !isAdVideo(item)))

  // 转换数据格式 - 根据类型选择正确的转换函数
  const convertedList = filteredList.map((item) => {
    // 如果是直播间类型，使用直播间转换函数
    if (item.type === 'live_room') {
      return convertLiveRoomData(item)
    }
    // 否则使用视频转换函数
    return convertVideoData(item)
  })

  // 替换结果
  results.value = convertedList

  // 提取分页信息
  extractPagination(rawData, filteredList.length)
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

// 供 VideoCardGrid 预加载调用
async function handleLoadMore() {
  if (paginationMode.value !== 'scroll')
    return
  if (isLoading.value || exhausted.value)
    return

  await performSearch(true)
}

// Transform 函数：数据已经转换过了，直接返回
function transformVideo(video: any) {
  return video
}

// 暴露给父组件
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
  <div class="video-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <VideoCardGrid
      v-else
      :items="results || []"
      :grid-layout="gridLayout"
      :loading="isLoading"
      :no-more-content="paginationMode === 'scroll' && !hasMore"
      :transform-item="transformVideo"
      :get-item-key="(video: any) => video.aid || video.id"
      :empty-description="$t('common.no_data')"
      enable-row-padding
      show-preview
      @load-more="handleLoadMore"
    />

    <!-- 翻页模式 -->
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
.video-search-page {
  width: 100%;
  padding-bottom: 2rem;
}

.error-message {
  padding: 2rem;
  text-align: center;
  color: var(--bew-error-color);
}
</style>
