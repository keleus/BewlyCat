<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Empty from '~/components/Empty.vue'
import SmoothLoading from '~/components/SmoothLoading.vue'
import UserCard from '~/components/UserCard/UserCard.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import api from '~/utils/api'

import Pagination from '../components/Pagination.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { useUserRelations } from '../composables/useUserRelations'
import { convertUserCardData } from '../searchTransforms'
import type { UserSearchFilters } from '../types'
import { dedupeByKey } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  filters: UserSearchFilters
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
  currentPage,
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
  if (isLoadMore && results.value) {
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
      page,
      pagesize: 30,
      order: orderConfig.order,
      order_sort: orderConfig.order_sort,
      user_type: props.filters.userType,
    },
  )

  if (!success || !lastResponse.value?.data)
    return

  const rawData = lastResponse.value.data
  const incomingList = Array.isArray(rawData?.result) ? rawData.result : []

  // 替换结果
  results.value = incomingList

  // 批量查询用户关系
  const mids = results.value!.map((u: any) => u.mid).filter(Boolean)
  await batchQueryUserRelations(mids)

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
  currentPage,
  totalPages,
})
</script>

<template>
  <div class="user-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!results || results.length === 0)" class="empty-state">
      <Empty :description="t('common.no_data')" />
    </div>

    <div v-else class="user-grid">
      <UserCard
        v-for="user in results"
        :key="user.mid"
        v-bind="{
          ...convertUserCardData(user),
          isFollowed: userRelations[user.mid]?.isFollowing ? 1 : 0,
        }"
        :compact="true"
        @follow-state-changed="(mid: number, isFollowing: boolean) => handleFollowStateChanged({ mid, isFollowing })"
      />
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
.user-search-page {
  width: 100%;
  padding-bottom: 2rem;
}

.user-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
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
