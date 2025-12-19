<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Empty from '~/components/Empty.vue'
import SmoothLoading from '~/components/SmoothLoading.vue'
import UserCard from '~/components/UserCard/UserCard.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import api from '~/utils/api'

import Pagination from '../components/Pagination.vue'
import { useLoadMore } from '../composables/useLoadMore'
import { usePagination } from '../composables/usePagination'
import { useSearchRequest } from '../composables/useSearchRequest'
import { useUserRelations } from '../composables/useUserRelations'
import { convertLiveRoomData, convertUserCardData, formatNumber } from '../searchTransforms'
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

// Grid 布局：直播搜索结果使用 adaptive 布局
const gridLayout: GridLayoutType = 'adaptive'

// 转换后的直播间列表
const transformedLiveRoomList = computed(() => {
  return liveRoomList.value.map(live => convertLiveRoomData(live))
})

// 检查是否在翻页模式下且不在第一页
const isInPaginationNonFirstPage = computed(() => {
  return paginationMode.value === 'pagination' && currentPage.value > 1
})

// 是否显示空状态（仅在 live_user 子分类或 all 子分类下两个列表都为空时）
const showEmptyState = computed(() => {
  if (isLoading.value)
    return false

  if (props.filters.subCategory === 'live_user')
    return liveUserList.value.length === 0

  if (props.filters.subCategory === 'all')
    return liveUserList.value.length === 0 && liveRoomList.value.length === 0

  // live_room 子分类由 VideoCardGrid 处理空状态
  return false
})

function formatResultCount(count: number): string {
  return formatNumber(count)
}

// Transform 函数：数据已经转换过了，直接返回
function transformLiveRoom(room: any) {
  return room
}

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

// 预加载更多直播间
async function handleLoadMore() {
  if (paginationMode.value !== 'scroll')
    return
  if (isLoading.value || exhausted.value)
    return

  await performSearch(true)
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

    <div v-else class="live-results" space-y-6>
      <!-- 空状态（live_user 或 all 子分类下两个列表都为空） -->
      <Empty v-if="showEmptyState" :description="t('common.no_data')" />

      <template v-else>
        <!-- 主播 (上面) -->
        <div
          v-if="!isInPaginationNonFirstPage
            && liveUserList.length > 0
            && (filters.subCategory === 'all' || filters.subCategory === 'live_user')"
        >
          <div flex items-center gap-3 mb-3>
            <h3 text="lg $bew-text-1" font-medium>
              主播
            </h3>
            <span text="sm $bew-text-3">
              共找到{{ formatResultCount(filters.subCategory === 'live_user' ? totalResults : (liveUserTotalResults || liveUserList.length)) }}个结果
            </span>
          </div>
          <div grid="~ cols-3 gap-4">
            <UserCard
              v-for="user in (filters.subCategory === 'all'
                ? liveUserList.slice(0, 6)
                : liveUserList)"
              :key="user.mid || user.uid"
              v-bind="{
                ...convertUserCardData(user),
                isFollowed: userRelations[user.mid || user.uid]?.isFollowing ? 1 : 0,
              }"
              :compact="true"
              @follow-state-changed="(mid: number, isFollowing: boolean) => handleFollowStateChanged({ mid, isFollowing })"
            />
          </div>
          <!-- 查看更多按钮 (仅在全部模式下且主播总数>6时显示) -->
          <div
            v-if="filters.subCategory === 'all' && (liveUserTotalResults || 0) > 6"
            mt-4 flex justify-center
          >
            <button
              class="view-more-btn"
              px-6 py-2 rounded="$bew-radius-half"
              bg="$bew-fill-1 hover:$bew-fill-2"
              text="sm $bew-text-1"
              transition-all
              @click="handleSwitchToLiveUser"
            >
              查看更多主播 ({{ Math.max((liveUserTotalResults || 0) - 6, 0) }}+)
            </button>
          </div>
        </div>

        <!-- 直播间 (下面) - 始终渲染 VideoCardGrid 以支持骨架屏和空状态 -->
        <div v-if="filters.subCategory === 'all' || filters.subCategory === 'live_room'">
          <div v-if="liveRoomList.length > 0" flex items-center gap-3 mb-3>
            <h3 text="lg $bew-text-1" font-medium>
              直播间
            </h3>
            <span text="sm $bew-text-3">
              共找到{{ formatResultCount(filters.subCategory === 'live_room' ? totalResults : (liveRoomTotalResults || liveRoomList.length)) }}个结果
            </span>
          </div>
          <VideoCardGrid
            :items="transformedLiveRoomList"
            :grid-layout="gridLayout"
            :transform-item="transformLiveRoom"
            :get-item-key="(room: any) => room.id || room.roomid"
            :loading="isLoading"
            :no-more-content="!hasMore"
            :show-watcher-later="false"
            :empty-description="t('common.no_data')"
            enable-row-padding
            show-preview
            @load-more="handleLoadMore"
          />
        </div>
      </template>

      <!-- 滚动加载模式：主播列表没有更多时显示提示（主播不用 VideoCardGrid） -->
      <template v-if="paginationMode === 'scroll' && filters.subCategory === 'live_user'">
        <SmoothLoading
          :show="isLoading && liveUserList.length > 0"
          :keep-space="true"
        />

        <Empty
          v-if="!isLoading && liveUserList.length > 0 && !hasMore"
          :description="t('common.no_more_content')"
        />
      </template>
    </div>

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
.live-search-page {
  width: 100%;
  padding-bottom: 2rem;
}

.live-results {
  width: 100%;
}

.view-more-btn {
  cursor: pointer;
  border: none;
  outline: none;
}

.error-message {
  padding: 2rem;
  text-align: center;
  color: var(--bew-error-color);
}
</style>
