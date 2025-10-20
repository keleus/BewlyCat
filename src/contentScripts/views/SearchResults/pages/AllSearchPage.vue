<script lang="ts" setup>
import { computed, onMounted, watch } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import api from '~/utils/api'

import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { useUserRelations } from '../composables/useUserRelations'
import type { VideoSearchFilters } from '../types'
import { applyVideoTimeFilter, buildVideoSearchParams } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  filters: VideoSearchFilters
}>()

const { haveScrollbar } = useBewlyApp()

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
          loadMore,
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
  if (loadMore && results.value) {
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

  // 检查是否已耗尽
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
  if (loadMore)
    await handleLoadMoreCompletion(haveScrollbar)

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
  </div>
</template>

<style scoped lang="scss">
.all-search-page {
  width: 100%;
  padding-bottom: 2rem;
}
</style>
