<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import api from '~/utils/api'

import Pagination from '../components/Pagination.vue'
import LiveResultsView from '../components/renderers/LiveResultsView.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { useUserRelations } from '../composables/useUserRelations'
import type { LiveSearchFilters } from '../types'
import { dedupeByKey } from '../utils/searchHelpers'

const props = defineProps<{
  keyword: string
  filters: LiveSearchFilters
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
} = useSearchRequest<any>('live')

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

// 直播间和主播的独立总数
const liveRoomTotalResults = ref(0)
const liveUserTotalResults = ref(0)

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

// 获取直播间列表
const liveRoomList = computed(() => {
  if (!results.value?.result)
    return []
  return Array.isArray(results.value.result.live_room) ? results.value.result.live_room : []
})

// 获取主播列表
const liveUserList = computed(() => {
  if (!results.value?.result)
    return []
  return Array.isArray(results.value.result.live_user) ? results.value.result.live_user : []
})

// 获取当前结果长度
function getCurrentResultLength(): number {
  return liveRoomList.value.length + liveUserList.value.length
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
watch(() => props.filters, (newFilters, oldFilters) => {
  if (!props.keyword.trim())
    return

  // 如果只是排序变化，特殊处理
  if (newFilters.subCategory === oldFilters?.subCategory) {
    // 只刷新对应的部分
    if (newFilters.subCategory === 'all' && newFilters.roomOrder !== oldFilters?.roomOrder) {
      // 全部模式下，只刷新直播间排序
      void refreshLiveRoomsOnly()
      return
    }
  }

  // 其他情况完全重新搜索
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

  // 根据子分类选择不同的API
  if (props.filters.subCategory === 'live_room') {
    // 仅搜索直播间
    success = await search(
      keyword,
      params => api.search.searchLiveRoom(params),
      {
        page: targetPage,
        pagesize: 30,
        order: props.filters.roomOrder,
      },
    )
  }
  else if (props.filters.subCategory === 'live_user') {
    // 仅搜索主播
    success = await search(
      keyword,
      params => api.search.searchLiveUser(params),
      {
        page: targetPage,
        page_size: 30,
        order: props.filters.userOrder,
      },
    )
  }
  else {
    // 全部（默认使用live类型，包含直播间和主播）
    success = await search(
      keyword,
      params => api.search.searchLive(params),
      {
        page: targetPage,
        pagesize: 30,
        order: props.filters.roomOrder,
      },
    )
  }

  if (!success || !lastResponse.value?.data)
    return false

  const rawData = lastResponse.value.data

  // 根据不同的子分类处理数据
  // 统一返回 { result: { live_room: [...], live_user: [...] } } 格式
  if (props.filters.subCategory === 'live_user') {
    // 主播搜索：尝试嵌套结构和扁平结构
    const incomingList = Array.isArray(rawData?.result?.live_user)
      ? rawData.result.live_user
      : (Array.isArray(rawData?.result) ? rawData.result : [])
    const prevUsers = Array.isArray(results.value?.result?.live_user) ? results.value.result.live_user : []

    const mergedUsers = isLoadMore
      ? dedupeByKey([...prevUsers, ...incomingList], item => String(item?.mid ?? JSON.stringify(item)))
      : incomingList

    results.value = {
      result: {
        live_room: [],
        live_user: mergedUsers,
      },
    }

    // 批量查询用户关系
    const mids = mergedUsers.map((u: any) => u.mid).filter(Boolean)
    await batchQueryUserRelations(mids)

    // 提取分页信息
    extractPagination(rawData, incomingList.length)
    liveUserTotalResults.value = totalResults.value
  }
  else if (props.filters.subCategory === 'live_room') {
    // 直播间搜索：尝试嵌套结构和扁平结构
    const incomingList = Array.isArray(rawData?.result?.live_room)
      ? rawData.result.live_room
      : (Array.isArray(rawData?.result) ? rawData.result : [])
    const prevRooms = Array.isArray(results.value?.result?.live_room) ? results.value.result.live_room : []

    const mergedRooms = isLoadMore
      ? dedupeByKey([...prevRooms, ...incomingList], item => String(item?.roomid ?? item?.id ?? JSON.stringify(item)))
      : incomingList

    results.value = {
      result: {
        live_room: mergedRooms,
        live_user: [],
      },
    }

    // 提取分页信息
    extractPagination(rawData, incomingList.length)
    liveRoomTotalResults.value = totalResults.value
  }
  else {
    // 全部模式：包含直播间和主播
    const incomingRooms = Array.isArray(rawData?.result?.live_room) ? rawData.result.live_room : []
    const incomingUsers = Array.isArray(rawData?.result?.live_user) ? rawData.result.live_user : []

    const prevRooms = Array.isArray(results.value?.result?.live_room) ? results.value.result.live_room : []
    const prevUsers = Array.isArray(results.value?.result?.live_user) ? results.value.result.live_user : []

    const mergedRooms = isLoadMore
      ? dedupeByKey([...prevRooms, ...incomingRooms], item => String(item?.roomid ?? item?.id ?? JSON.stringify(item)))
      : incomingRooms

    const mergedUsers = isLoadMore
      ? dedupeByKey([...prevUsers, ...incomingUsers], item => String(item?.mid ?? JSON.stringify(item)))
      : incomingUsers

    results.value = {
      result: {
        live_room: mergedRooms,
        live_user: mergedUsers,
      },
    }

    // 批量查询主播关系
    const mids = mergedUsers.map((u: any) => u.mid).filter(Boolean)
    await batchQueryUserRelations(mids)

    // 提取分页信息（基于直播间）
    const liveRoomTotal = Number(rawData?.pageinfo?.live_room?.total)
      || Number(rawData?.pageinfo?.live_room?.numResults)
      || incomingRooms.length
      || 0

    const liveUserTotal = Number(rawData?.pageinfo?.live_user?.total)
      || Number(rawData?.pageinfo?.live_user?.numResults)
      || incomingUsers.length
      || 0

    liveRoomTotalResults.value = liveRoomTotal
    liveUserTotalResults.value = liveUserTotal

    // 使用直播间的分页信息
    // 注意：只传递直播间相关的分页信息，避免使用原始数据中可能包含的错误总页数
    extractPagination({
      total: liveRoomTotal,
      numResults: liveRoomTotal,
      pagesize: rawData?.pagesize || 30,
      pageinfo: rawData?.pageinfo?.live_room,
    }, incomingRooms.length)
  }

  updatePage(targetPage)

  // 检查是否已耗尽（仅在滚动模式下）
  if (paginationMode.value === 'scroll') {
    const finalLength = getCurrentResultLength()
    const newItems = Math.max(finalLength - previousLength, 0)

    const incomingLength = props.filters.subCategory === 'all'
      ? (Array.isArray(rawData?.result?.live_room) ? rawData.result.live_room.length : 0)
      + (Array.isArray(rawData?.result?.live_user) ? rawData.result.live_user.length : 0)
      : (Array.isArray(rawData?.result) ? rawData.result.length : 0)

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

  // 根据子分类选择不同的API
  if (props.filters.subCategory === 'live_room') {
    // 仅搜索直播间
    success = await search(
      keyword,
      params => api.search.searchLiveRoom(params),
      {
        page,
        pagesize: 30,
        order: props.filters.roomOrder,
      },
    )
  }
  else if (props.filters.subCategory === 'live_user') {
    // 仅搜索主播
    success = await search(
      keyword,
      params => api.search.searchLiveUser(params),
      {
        page,
        page_size: 30,
        order: props.filters.userOrder,
      },
    )
  }
  else {
    // 全部（默认使用live类型，包含直播间和主播）
    success = await search(
      keyword,
      params => api.search.searchLive(params),
      {
        page,
        pagesize: 30,
        order: props.filters.roomOrder,
      },
    )
  }

  if (!success || !lastResponse.value?.data)
    return

  const rawData = lastResponse.value.data

  // 根据不同的子分类处理数据
  // 统一返回 { result: { live_room: [...], live_user: [...] } } 格式
  if (props.filters.subCategory === 'live_user') {
    // 主播搜索：尝试嵌套结构和扁平结构
    const incomingList = Array.isArray(rawData?.result?.live_user)
      ? rawData.result.live_user
      : (Array.isArray(rawData?.result) ? rawData.result : [])

    results.value = {
      result: {
        live_room: [],
        live_user: incomingList,
      },
    }

    // 批量查询用户关系
    const mids = incomingList.map((u: any) => u.mid).filter(Boolean)
    await batchQueryUserRelations(mids)

    // 提取分页信息
    extractPagination(rawData, incomingList.length)
    liveUserTotalResults.value = totalResults.value
  }
  else if (props.filters.subCategory === 'live_room') {
    // 直播间搜索：尝试嵌套结构和扁平结构
    const incomingList = Array.isArray(rawData?.result?.live_room)
      ? rawData.result.live_room
      : (Array.isArray(rawData?.result) ? rawData.result : [])

    results.value = {
      result: {
        live_room: incomingList,
        live_user: [],
      },
    }

    // 提取分页信息
    extractPagination(rawData, incomingList.length)
    liveRoomTotalResults.value = totalResults.value
  }
  else {
    // 全部模式：包含直播间和主播
    const incomingRooms = Array.isArray(rawData?.result?.live_room) ? rawData.result.live_room : []
    const incomingUsers = Array.isArray(rawData?.result?.live_user) ? rawData.result.live_user : []

    results.value = {
      result: {
        live_room: incomingRooms,
        live_user: incomingUsers,
      },
    }

    // 批量查询主播关系
    const mids = incomingUsers.map((u: any) => u.mid).filter(Boolean)
    await batchQueryUserRelations(mids)

    // 提取分页信息（基于直播间）
    const liveRoomTotal = Number(rawData?.pageinfo?.live_room?.total)
      || Number(rawData?.pageinfo?.live_room?.numResults)
      || incomingRooms.length
      || 0

    const liveUserTotal = Number(rawData?.pageinfo?.live_user?.total)
      || Number(rawData?.pageinfo?.live_user?.numResults)
      || incomingUsers.length
      || 0

    liveRoomTotalResults.value = liveRoomTotal
    liveUserTotalResults.value = liveUserTotal

    // 使用直播间的分页信息
    // 注意：只传递直播间相关的分页信息，避免使用原始数据中可能包含的错误总页数
    extractPagination({
      total: liveRoomTotal,
      numResults: liveRoomTotal,
      pagesize: rawData?.pagesize || 30,
      pageinfo: rawData?.pageinfo?.live_room,
    }, incomingRooms.length)
  }

  updatePage(page)

  isPageChanging.value = false

  // 更新 URL 中的页码参数
  emit('updatePage', page)
}

// 只刷新直播间数据（用于"全部"模式下改变排序）
async function refreshLiveRoomsOnly() {
  const keyword = props.keyword.trim()
  if (!keyword)
    return

  isLoading.value = true

  try {
    const response = await api.search.searchLive({
      keyword,
      page: 1,
      pagesize: 30,
      order: props.filters.roomOrder,
    })

    if (!response || response.code !== 0)
      return

    const newLiveRooms = Array.isArray(response.data?.result?.live_room)
      ? response.data.result.live_room
      : []

    // 只更新 live_room 部分，保留 live_user
    if (results.value?.result) {
      results.value = {
        result: {
          ...results.value.result,
          live_room: newLiveRooms,
        },
      }
    }

    // 更新直播间相关的分页信息
    const liveRoomTotal = Number(response.data?.pageinfo?.live_room?.total)
      || Number(response.data?.pageinfo?.live_room?.numResults)
      || newLiveRooms.length
      || 0
    liveRoomTotalResults.value = liveRoomTotal
  }
  catch (err) {
    console.error('Refresh live rooms error:', err)
  }
  finally {
    isLoading.value = false
  }
}

function resetAll() {
  resetSearch()
  resetPagination()
  resetLoadMore()
  results.value = null
  liveRoomTotalResults.value = 0
  liveUserTotalResults.value = 0
}

function handleFollowStateChanged(data: { mid: number, isFollowing: boolean }) {
  updateUserRelation(data.mid, data.isFollowing)
}

function handleSwitchToLiveUser() {
  // 切换到主播模式 - 这个逻辑需要通知父组件
  // 暂时不实现，因为需要修改 SearchResults.vue 中的逻辑
  console.log('Switch to live_user mode')
}

// 暴露给父组件
defineExpose({
  isLoading,
  error,
  results,
  liveRoomList,
  liveUserList,
  totalResults,
  liveRoomTotalResults,
  liveUserTotalResults,
  hasMore,
  requestLoadMore,
  userRelations,
  updateUserRelation,
  currentPage,
  totalPages,
})
</script>

<template>
  <div class="live-search-page">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-else-if="!isLoading && (!liveRoomList || liveRoomList.length === 0) && (!liveUserList || liveUserList.length === 0)" class="empty-state">
      {{ $t('common.no_data') }}
    </div>

    <LiveResultsView
      v-else
      :live-user-list="liveUserList"
      :live-room-list="liveRoomList"
      :current-sub-category="filters.subCategory"
      :live-user-total-results="liveUserTotalResults"
      :live-room-total-results="liveRoomTotalResults"
      :current-total-results="totalResults"
      :user-relations="userRelations"
      :current-page="currentPage"
      :pagination-mode="paginationMode"
      @follow-state-changed="handleFollowStateChanged"
      @switch-to-live-user="handleSwitchToLiveUser"
    />

    <!-- 滚动加载模式 -->
    <template v-if="paginationMode === 'scroll'">
      <Loading v-if="isLoading && (liveRoomList.length > 0 || liveUserList.length > 0)" />

      <Empty
        v-else-if="!isLoading && (liveRoomList.length > 0 || liveUserList.length > 0) && !hasMore"
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
.live-search-page {
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
