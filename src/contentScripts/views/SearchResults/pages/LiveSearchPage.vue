<script lang="ts" setup>
import { computed, ref, watch } from 'vue'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import api from '~/utils/api'

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
} = useSearchRequest<any>('live')

// 分页管理
const {
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

  if (normalizedNew === normalizedOld && newKeyword === oldKeyword)
    return

  resetAll()
  await performSearch(false)
}, { immediate: true })

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

  if (loadMore && (isLoading.value || exhausted.value))
    return false

  if (!loadMore)
    setExhausted(false)

  const targetPage = getNextPage(loadMore)
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

    const mergedUsers = loadMore
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

    const mergedRooms = loadMore
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

    const mergedRooms = loadMore
      ? dedupeByKey([...prevRooms, ...incomingRooms], item => String(item?.roomid ?? item?.id ?? JSON.stringify(item)))
      : incomingRooms

    const mergedUsers = loadMore
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
    extractPagination({
      ...rawData,
      total: liveRoomTotal,
      numResults: liveRoomTotal,
    }, incomingRooms.length)
  }

  updatePage(targetPage)

  // 检查是否已耗尽
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
  if (loadMore)
    await handleLoadMoreCompletion(haveScrollbar)

  return true
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
      @follow-state-changed="handleFollowStateChanged"
      @switch-to-live-user="handleSwitchToLiveUser"
    />

    <Loading v-if="isLoading && (liveRoomList.length > 0 || liveUserList.length > 0)" />

    <Empty
      v-else-if="!isLoading && (liveRoomList.length > 0 || liveUserList.length > 0) && !hasMore"
      :description="$t('common.no_more_content')"
    />
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
