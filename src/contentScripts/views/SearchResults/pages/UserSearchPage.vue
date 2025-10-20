<script lang="ts" setup>
import { watch } from 'vue'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import api from '~/utils/api'

import UserGrid from '../components/renderers/UserGrid.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { useUserRelations } from '../composables/useUserRelations'
import type { UserSearchFilters } from '../types'
import { dedupeByKey } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  filters: UserSearchFilters
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
} = useSearchRequest<any[]>('user')

// 分页管理
const {
  totalResults,
  totalPages,
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

  if (normalizedNew === normalizedOld && newKeyword === oldKeyword)
    return

  resetAll()
  await performSearch(false)
}, { immediate: true })

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

  // 用户排序映射
  const userOrderMap: Record<string, { order: string, order_sort: number }> = {
    '': { order: '', order_sort: 0 },
    'fans': { order: 'fans', order_sort: 0 },
    'fans_desc': { order: 'fans', order_sort: 1 },
    'level': { order: 'level', order_sort: 0 },
    'level_desc': { order: 'level', order_sort: 1 },
  }
  const orderConfig = userOrderMap[props.filters.order] || { order: '', order_sort: 0 }

  const success = await search(
    keyword,
    params => api.search.searchUser(params),
    {
      page: targetPage,
      pagesize: 30,
      order: orderConfig.order,
      order_sort: orderConfig.order_sort,
      user_type: props.filters.userType,
    },
  )

  if (!success)
    return false

  if (!lastResponse.value?.data)
    return false

  const rawData = lastResponse.value.data
  const incomingList = Array.isArray(rawData?.result) ? rawData.result : []

  // 合并或替换结果
  if (loadMore && results.value) {
    const merged = [...results.value, ...incomingList]
    // 去重
    results.value = dedupeByKey(merged, item => String(item?.mid ?? JSON.stringify(item)))
  }
  else {
    results.value = incomingList
  }

  // 批量查询用户关系
  const mids = results.value!.map((u: any) => u.mid).filter(Boolean)
  await batchQueryUserRelations(mids)

  // 提取分页信息
  extractPagination(rawData, incomingList.length)
  updatePage(targetPage)

  // 检查是否已耗尽
  const finalLength = results.value!.length
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

function handleFollowStateChanged(data: { mid: number, isFollowing: boolean }) {
  updateUserRelation(data.mid, data.isFollowing)
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
  <div class="user-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      {{ $t('common.no_data') }}
    </div>

    <UserGrid
      v-else
      :users="results || []"
      :user-relations="userRelations"
      @follow-state-changed="handleFollowStateChanged"
    />

    <Loading v-if="isLoading && results && results.length > 0" />

    <Empty
      v-else-if="!isLoading && results && results.length > 0 && !hasMore"
      :description="$t('common.no_more_content')"
    />
  </div>
</template>

<style scoped lang="scss">
.user-search-page {
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
