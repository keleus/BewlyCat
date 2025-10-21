<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import api from '~/utils/api'

import Pagination from '../components/Pagination.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { useUserRelations } from '../composables/useUserRelations'
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
  extractPagination,
  updatePage,
  getNextPage,
  reset: resetPagination,
} = usePagination()

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
  const itemsCount = getCurrentResultLength()
  return { success, itemsCount }
})

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
  const previousLength = getCurrentResultLength()

  let success = false
  const useVideoFilters = isVideoFilterActive.value

  if (useVideoFilters) {
    // 使用视频筛选时，调用视频搜索API
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
    // 综合搜索
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

  // 如果使用视频筛选，需要将数据标准化为 all 的格式
  let normalizedData = rawData
  if (useVideoFilters) {
    const list = Array.isArray(rawData?.result) ? rawData.result : []
    normalizedData = {
      ...rawData,
      result: [{
        result_type: 'video',
        data: list,
      }],
    }
  }

  const incomingSections = Array.isArray(normalizedData?.result) ? normalizedData.result : []

  // 合并或替换结果
  if (isLoadMore && results.value) {
    results.value = mergeSections(results.value, normalizedData)
  }
  else {
    results.value = normalizedData
  }

  // 批量查询用户关系
  if (Array.isArray(results.value?.result)) {
    const userSection = results.value.result.find((s: any) => s?.result_type === 'bili_user')
    if (userSection && Array.isArray(userSection.data)) {
      const mids = userSection.data.map((u: any) => u.mid).filter(Boolean)
      await batchQueryUserRelations(mids)
    }
  }

  // 提取分页信息
  const fallbackLength = incomingSections.reduce((sum: number, section: any) => {
    if (Array.isArray(section?.data))
      return sum + section.data.length
    return sum
  }, 0)
  extractPagination(rawData, fallbackLength)
  updatePage(targetPage)

  // 检查是否已耗尽（仅在滚动模式下）
  if (paginationMode.value === 'scroll') {
    const finalLength = getCurrentResultLength()
    const newItems = Math.max(finalLength - previousLength, 0)
    const incomingLength = incomingSections.reduce((sum: number, section: any) => {
      if (Array.isArray(section?.data))
        return sum + section.data.length
      return sum
    }, 0)

    if (incomingLength === 0) {
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

// 合并 sections
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
      return {
        ...section,
        data: applyVideoTimeFilter(section.data),
      }
    }
    return section
  })

  return {
    ...previous,
    ...incoming,
    result: resultSections,
  }
}

// section 去重
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

// 获取 section item 的唯一键
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

  let success = false
  const useVideoFilters = isVideoFilterActive.value

  if (useVideoFilters) {
    // 使用视频筛选时，调用视频搜索API
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
    // 综合搜索
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

  // 如果使用视频筛选，需要将数据标准化为 all 的格式
  let normalizedData = rawData
  if (useVideoFilters) {
    const list = Array.isArray(rawData?.result) ? rawData.result : []
    normalizedData = {
      ...rawData,
      result: [{
        result_type: 'video',
        data: list,
      }],
    }
  }

  const incomingSections = Array.isArray(normalizedData?.result) ? normalizedData.result : []

  // 替换结果
  results.value = normalizedData

  // 批量查询用户关系
  if (Array.isArray(results.value?.result)) {
    const userSection = results.value.result.find((s: any) => s?.result_type === 'bili_user')
    if (userSection && Array.isArray(userSection.data)) {
      const mids = userSection.data.map((u: any) => u.mid).filter(Boolean)
      await batchQueryUserRelations(mids)
    }
  }

  // 提取分页信息
  const fallbackLength = incomingSections.reduce((sum: number, section: any) => {
    if (Array.isArray(section?.data))
      return sum + section.data.length
    return sum
  }, 0)
  extractPagination(rawData, fallbackLength)
  updatePage(page)

  isPageChanging.value = false

  // 更新 URL 中的页码参数
  emit('updatePage', page)
}

function resetAll() {
  resetSearch()
  resetPagination()
  resetLoadMore()
  results.value = null
}

// 暴露给父组件
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
  <div class="all-search-page">
    <!-- 结果将由 SearchResultsPanel 渲染 -->
    <slot
      :results="results"
      :is-loading="isLoading"
      :error="error"
      :total-results="totalResults"
      :has-more="hasMore"
      :user-relations="userRelations"
      @update-user-relation="updateUserRelation"
    />

    <!-- 滚动加载模式 -->
    <template v-if="paginationMode === 'scroll'">
      <Loading v-if="isLoading && results && getCurrentResultLength() > 0" />

      <Empty
        v-else-if="!isLoading && results && getCurrentResultLength() > 0 && !hasMore"
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
.all-search-page {
  width: 100%;
  padding-bottom: 2rem;
}
</style>
