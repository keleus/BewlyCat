<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'

import SearchCategoryTabs from './components/SearchCategoryTabs.vue'
import type { LiveSubCategory } from './components/SearchLiveFilters.vue'
import SearchLiveFilters from './components/SearchLiveFilters.vue'
import SearchResultsPanel from './components/SearchResultsPanel.vue'
import SearchUserFilters from './components/SearchUserFilters.vue'
import SearchVideoFilters from './components/SearchVideoFilters.vue'
import type { SearchCategory, SearchCategoryOption } from './types'

const props = defineProps<{
  keyword: string
}>()

const normalizedKeyword = computed(() => (props.keyword || '').trim())
const CATEGORY_KEYS: SearchCategory[] = ['all', 'video', 'bangumi', 'media_ft', 'user', 'live', 'article']

// 从URL读取category参数
function getCategoryFromUrl(): SearchCategory {
  const urlParams = new URLSearchParams(window.location.search)
  const categoryParam = urlParams.get('category') as SearchCategory | null
  if (categoryParam && CATEGORY_KEYS.includes(categoryParam)) {
    return categoryParam
  }
  return 'all'
}

// 从URL读取所有筛选条件（不包括视频筛选）
function getFiltersFromUrl() {
  const urlParams = new URLSearchParams(window.location.search)

  return {
    // 用户筛选
    userOrder: urlParams.get('user_order') || '',
    userType: Number(urlParams.get('user_type')) || 0,

    // 直播筛选
    liveSubCategory: (urlParams.get('search_type') || 'all') as LiveSubCategory,
    liveRoomOrder: urlParams.get('live_room_order') || '',
    liveUserOrder: urlParams.get('live_user_order') || '',
  }
}

// 更新URL参数
function updateUrlParams(params: Record<string, string | number | undefined | null>, triggerEvent = false) {
  const urlParams = new URLSearchParams(window.location.search)

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 0 || value === 'all') {
      urlParams.delete(key)
    }
    else {
      urlParams.set(key, String(value))
    }
  })

  const newUrl = `${window.location.pathname}?${urlParams.toString()}`
  window.history.pushState({}, '', newUrl)
  // 默认不触发pushstate事件，避免不必要的重新加载
  if (triggerEvent) {
    window.dispatchEvent(new Event('pushstate'))
  }
}

const currentCategory = ref<SearchCategory>(getCategoryFromUrl())
const searchResults = ref<Partial<Record<SearchCategory, any>>>({})
const isLoading = ref(false)
const error = ref('')

const PAGE_SIZE = 30

const categoryPage = reactive<Record<SearchCategory, number>>({
  all: 0,
  video: 0,
  bangumi: 0,
  media_ft: 0,
  user: 0,
  live: 0,
  article: 0,
})

const categoryTotalPages = reactive<Record<SearchCategory, number>>({
  all: 0,
  video: 0,
  bangumi: 0,
  media_ft: 0,
  user: 0,
  live: 0,
  article: 0,
})

const categoryTotalResults = reactive<Record<SearchCategory, number>>({
  all: 0,
  video: 0,
  bangumi: 0,
  media_ft: 0,
  user: 0,
  live: 0,
  article: 0,
})

// 单独存储live_user和live_room的总数
const liveUserTotalResults = ref<number>(0)
const liveRoomTotalResults = ref<number>(0)

const categoryExhausted = reactive<Record<SearchCategory, boolean>>({
  all: false,
  video: false,
  bangumi: false,
  media_ft: false,
  user: false,
  live: false,
  article: false,
})

const categoryContext = reactive<Record<SearchCategory, string>>({
  all: '',
  video: '',
  bangumi: '',
  media_ft: '',
  user: '',
  live: '',
  article: '',
})

const { handleReachBottom, handlePageRefresh, haveScrollbar } = useBewlyApp()
const topBarStore = useTopBarStore()
const { searchKeyword: topBarSearchKeyword } = storeToRefs(topBarStore)

const videoOrderOptions = [
  { value: '', label: '综合排序' },
  { value: 'click', label: '最多播放' },
  { value: 'pubdate', label: '最新发布' },
  { value: 'dm', label: '最多弹幕' },
  { value: 'stow', label: '最多收藏' },
]

// 从URL初始化筛选条件（不包括视频筛选）
const initialFilters = getFiltersFromUrl()

// 视频筛选条件默认值
const currentVideoOrder = ref<string>('')
const currentDuration = ref<number>(0)
const currentTimeRange = ref<string>('all')
const customStartDate = ref<string>('')
const customEndDate = ref<string>('')

const currentUserOrder = ref<string>(initialFilters.userOrder)
const currentUserType = ref<number>(initialFilters.userType)

const currentLiveSubCategory = ref<LiveSubCategory>(initialFilters.liveSubCategory)
const currentLiveRoomOrder = ref<string>(initialFilters.liveRoomOrder)
const currentLiveUserOrder = ref<string>(initialFilters.liveUserOrder)

// 批量查询用户关系状态
const userRelations = ref<Record<number, { isFollowing: boolean, isLoading: boolean }>>({})

async function batchQueryUserRelations(mids: number[]) {
  if (mids.length === 0)
    return

  // B站API限制最多40个mid
  const chunks: number[][] = []
  for (let i = 0; i < mids.length; i += 40) {
    chunks.push(mids.slice(i, i + 40))
  }

  for (const chunk of chunks) {
    try {
      const response = await api.user.getRelations({
        fids: chunk.join(','),
      })

      if (response.code === 0 && response.data) {
        Object.keys(response.data).forEach((midStr) => {
          const mid = Number(midStr)
          const relation = response.data[midStr]
          // attribute: 0=未关注, 1=悄悄关注, 2=关注, 6=互相关注, 128=拉黑
          const isFollowing = relation.attribute === 2 || relation.attribute === 6
          userRelations.value[mid] = {
            isFollowing,
            isLoading: false,
          }
        })
      }
    }
    catch (error) {
      console.error('批量查询用户关系失败:', error)
    }
  }
}

const durationOptions = [
  { value: 0, label: '全部时长' },
  { value: 1, label: '10分钟以下' },
  { value: 2, label: '10-30分钟' },
  { value: 3, label: '30-60分钟' },
  { value: 4, label: '60分钟以上' },
]

const timeRangeOptions = [
  { value: 'all', label: '全部日期' },
  { value: 'day', label: '最近一天' },
  { value: 'week', label: '最近一周' },
  { value: 'halfyear', label: '最近半年' },
]

const userOrderOptions = [
  { value: '', label: '默认排序' },
  { value: 'fans', label: '粉丝数由高到低' },
  { value: 'fans_desc', label: '粉丝数由低到高' },
  { value: 'level', label: 'Lv等级由高到低' },
  { value: 'level_desc', label: 'Lv等级由低到高' },
]

const userTypeOptions = [
  { value: 0, label: '全部用户' },
  { value: 1, label: 'UP主用户' },
  { value: 2, label: '普通用户' },
  { value: 3, label: '认证用户' },
]

const liveRoomOrderOptions = [
  { value: '', label: '综合排序' },
  { value: 'live_time', label: '最新开播' },
]

const liveUserOrderOptions = [
  { value: '', label: '综合排序' },
  { value: 'online', label: '在线人数' },
  { value: 'fans', label: '粉丝数' },
]

const categories: ReadonlyArray<SearchCategoryOption> = [
  { value: 'all', label: '综合', icon: 'i-tabler:search' },
  { value: 'video', label: '视频', icon: 'i-tabler:video' },
  { value: 'bangumi', label: '番剧', icon: 'i-tabler:movie' },
  { value: 'media_ft', label: '影视', icon: 'i-tabler:movie-off' },
  { value: 'user', label: '用户', icon: 'i-tabler:user' },
  { value: 'live', label: '直播', icon: 'i-tabler:broadcast' },
  { value: 'article', label: '专栏', icon: 'i-tabler:article' },
]

const categoryCounts = reactive<Record<SearchCategory, number>>({
  all: 0,
  video: 0,
  bangumi: 0,
  media_ft: 0,
  user: 0,
  live: 0,
  article: 0,
})

const LOAD_MORE_COOLDOWN_MS = 800 // 增加冷却时间，避免频繁滚动触发多次请求
const RETRY_IF_LOADING_DELAY_MS = 120
const AUTO_FILL_MAX_ATTEMPTS = 2
const SCROLL_DEBOUNCE_MS = 300 // 滚动防抖延迟

interface LoadMoreState {
  pending: boolean
  lastTriggered: number
  lastAppended: number
  autoFillAttempts: number
}

const loadMoreState: Record<SearchCategory, LoadMoreState> = {
  all: { pending: false, lastTriggered: 0, lastAppended: 0, autoFillAttempts: 0 },
  video: { pending: false, lastTriggered: 0, lastAppended: 0, autoFillAttempts: 0 },
  bangumi: { pending: false, lastTriggered: 0, lastAppended: 0, autoFillAttempts: 0 },
  media_ft: { pending: false, lastTriggered: 0, lastAppended: 0, autoFillAttempts: 0 },
  user: { pending: false, lastTriggered: 0, lastAppended: 0, autoFillAttempts: 0 },
  live: { pending: false, lastTriggered: 0, lastAppended: 0, autoFillAttempts: 0 },
  article: { pending: false, lastTriggered: 0, lastAppended: 0, autoFillAttempts: 0 },
}

const loadMoreTimers: Partial<Record<SearchCategory, number>> = {}
let scrollDebounceTimer: number | undefined

const currentTotalPages = computed(() => categoryTotalPages[currentCategory.value] ?? 0)
const hasMore = computed(() => hasMoreForCategory(currentCategory.value))

const activeRequestTokens: Partial<Record<SearchCategory, symbol>> = {}
const currentSearchSessionId = ref(generateSearchSessionId())
const isVideoFilterActive = computed(() => {
  // 检查是否有任何筛选条件被激活
  if (currentVideoOrder.value !== '' || currentDuration.value !== 0)
    return true
  // 检查时间范围筛选
  if (currentTimeRange.value !== 'all')
    return true
  // 检查自定义日期（即使 timeRange 不是 'custom'，只要有输入就算激活）
  if (customStartDate.value !== '' || customEndDate.value !== '')
    return true
  return false
})

watch(
  () => props.keyword,
  async (newKeyword, oldKeyword) => {
    const normalizedNewKeyword = (newKeyword || '').trim()
    const normalizedOldKeyword = (oldKeyword || '').trim()

    if (!normalizedNewKeyword) {
      currentSearchSessionId.value = generateSearchSessionId()
      resetAllCategories()
      return
    }

    if (normalizedNewKeyword === normalizedOldKeyword && newKeyword === oldKeyword)
      return

    currentSearchSessionId.value = generateSearchSessionId()

    // 从URL读取筛选条件并恢复状态（不包括视频筛选）
    const filters = getFiltersFromUrl()
    const categoryFromUrl = getCategoryFromUrl()

    // 恢复筛选条件
    currentCategory.value = categoryFromUrl
    // 视频筛选条件重置为默认值
    currentVideoOrder.value = ''
    currentDuration.value = 0
    currentTimeRange.value = 'all'
    customStartDate.value = ''
    customEndDate.value = ''
    // 恢复用户和直播筛选条件
    currentUserOrder.value = filters.userOrder
    currentUserType.value = filters.userType
    currentLiveSubCategory.value = filters.liveSubCategory
    currentLiveRoomOrder.value = filters.liveRoomOrder
    currentLiveUserOrder.value = filters.liveUserOrder

    resetAllCategories()

    // 首先调用综合搜索API获取各个tab的数据
    await performSearch('all')

    // 如果当前category不是all，再调用对应category的搜索
    if (categoryFromUrl !== 'all') {
      await performSearch(categoryFromUrl)
    }
  },
  { immediate: true },
)

watch(normalizedKeyword, (value) => {
  topBarSearchKeyword.value = value
}, { immediate: true })

function refreshVideoResults() {
  clearCategoryData('video')
  void performSearch('video')
}

function refreshAllResults() {
  clearCategoryData('all')
  void performSearch('all')
}

// 视频筛选条件变化时刷新结果（不更新URL）
watch([currentVideoOrder, currentDuration, currentTimeRange, customStartDate, customEndDate], () => {
  if (!normalizedKeyword.value)
    return

  refreshVideoResults()
  if (currentCategory.value === 'all')
    refreshAllResults()
}, { deep: false })

watch([currentUserOrder, currentUserType], () => {
  if (!normalizedKeyword.value)
    return

  // 更新URL参数
  updateUrlParams({
    user_order: currentUserOrder.value,
    user_type: currentUserType.value,
  })

  refreshUserResults()
}, { deep: false })

// 监听直播子分类变化
watch(currentLiveSubCategory, () => {
  if (!normalizedKeyword.value)
    return

  // 更新URL参数
  updateUrlParams({
    search_type: currentLiveSubCategory.value,
  })

  refreshLiveResults()
})

// 监听直播间排序变化
watch(currentLiveRoomOrder, () => {
  if (!normalizedKeyword.value)
    return

  // 更新URL参数
  updateUrlParams({
    live_room_order: currentLiveRoomOrder.value,
  })

  // 如果是"全部"或"直播间"模式，刷新直播数据
  if (currentLiveSubCategory.value === 'all') {
    void refreshLiveRoomsOnly()
  }
  else if (currentLiveSubCategory.value === 'live_room') {
    refreshLiveResults()
  }
})

// 监听主播排序变化
watch(currentLiveUserOrder, () => {
  if (!normalizedKeyword.value)
    return

  // 更新URL参数
  updateUrlParams({
    live_user_order: currentLiveUserOrder.value,
  })

  if (currentLiveSubCategory.value === 'live_user') {
    refreshLiveResults()
  }
})

function refreshUserResults() {
  clearCategoryData('user')
  void performSearch('user', false)
}

function refreshLiveResults() {
  clearCategoryData('live')
  void performSearch('live', false)
}

// 只刷新直播间数据（用于"全部"模式下改变排序）
async function refreshLiveRoomsOnly() {
  const keyword = normalizedKeyword.value
  if (!keyword)
    return

  isLoading.value = true
  const requestToken = Symbol('search-live-rooms')
  activeRequestTokens.live = requestToken

  try {
    const response = await api.search.searchLive({
      keyword,
      page: 1,
      pagesize: PAGE_SIZE,
      order: currentLiveRoomOrder.value,
    })

    if (!response || response.code !== 0) {
      return
    }

    if (activeRequestTokens.live !== requestToken || normalizedKeyword.value !== keyword)
      return

    const currentLiveData = searchResults.value.live
    if (!currentLiveData)
      return

    // 只更新 live_room 部分，保留 live_user
    const newLiveRooms = Array.isArray(response.data?.result?.live_room)
      ? response.data.result.live_room
      : []

    searchResults.value = {
      ...searchResults.value,
      live: {
        ...currentLiveData,
        result: {
          ...currentLiveData.result,
          live_room: newLiveRooms,
        },
      },
    }

    // 更新直播间相关的分页信息
    const liveRoomTotal = Number(response.data?.pageinfo?.live_room?.total)
      || Number(response.data?.pageinfo?.live_room?.numResults)
      || newLiveRooms.length
      || 0
    categoryTotalResults.live = liveRoomTotal
  }
  catch (err) {
    console.error('Refresh live rooms error:', err)
  }
  finally {
    await waitForRender()
    isLoading.value = false
  }
}

function getTimeRangeParams(): Record<string, number> {
  const range = currentTimeRange.value

  // 自定义日期范围
  if (range === 'custom') {
    const startDate = customStartDate.value
    const endDate = customEndDate.value

    // 如果没有输入任何日期，返回空
    if (!startDate && !endDate)
      return {}

    let begin = 0
    let end = Math.floor(Date.now() / 1000)

    // 解析开始日期
    if (startDate) {
      const startTime = new Date(startDate).getTime()
      if (!Number.isNaN(startTime))
        begin = Math.floor(startTime / 1000)
    }

    // 解析结束日期（设置为当天的23:59:59）
    if (endDate) {
      const endTime = new Date(endDate).getTime()
      if (!Number.isNaN(endTime))
        end = Math.floor(endTime / 1000) + 86399 // 加上23小时59分59秒
    }

    // 如果开始日期大于结束日期，交换它们
    if (begin > 0 && end > 0 && begin > end)
      [begin, end] = [end, begin]

    return {
      pubtime_begin_s: begin,
      pubtime_end_s: end,
    }
  }

  // 预设日期范围
  if (range === 'all')
    return {}

  const now = Math.floor(Date.now() / 1000)
  let begin = 0
  switch (range) {
    case 'day':
      begin = now - 24 * 3600
      break
    case 'week':
      begin = now - 7 * 24 * 3600
      break
    case 'halfyear':
      begin = now - 180 * 24 * 3600
      break
    default:
      begin = 0
  }
  if (begin <= 0)
    return {}
  return {
    pubtime_begin_s: begin,
    pubtime_end_s: now,
  }
}

interface VideoSearchParamsOptions {
  loadMore: boolean
  context: string
}

function buildVideoSearchParams({ loadMore, context }: VideoSearchParamsOptions): Record<string, any> {
  const rangeParams = getTimeRangeParams()
  const timeParams = {
    pubtime_begin_s: 0,
    pubtime_end_s: 0,
    ...rangeParams,
  }
  return {
    search_type: 'video',
    duration: currentDuration.value,
    order: currentVideoOrder.value,
    category_id: '',
    context: loadMore ? context : '',
    ...timeParams,
  }
}

function normalizeAllVideoResponse(data: any) {
  const list = Array.isArray(data?.result) ? data.result : []
  const section = {
    result_type: 'video',
    data: list,
  }
  return {
    ...data,
    result: [section],
  }
}

onUnmounted(() => {
  CATEGORY_KEYS.forEach(category => clearLoadMoreTimer(category))
  if (scrollDebounceTimer !== undefined) {
    clearTimeout(scrollDebounceTimer)
    scrollDebounceTimer = undefined
  }
  // 不在这里清空 topBarSearchKeyword，因为组件可能只是因为搜索词改变而重新创建
  // 真正离开搜索页面时，应该由父组件 Search.vue 负责清理
})

function hasMoreForCategory(category: SearchCategory): boolean {
  if (categoryExhausted[category])
    return false

  const totalPages = categoryTotalPages[category]
  const currentPage = categoryPage[category]

  if (totalPages > 0)
    return currentPage < totalPages

  return Boolean(categoryContext[category])
}

function clearLoadMoreTimer(category: SearchCategory) {
  const timer = loadMoreTimers[category]
  if (timer !== undefined) {
    clearTimeout(timer)
    delete loadMoreTimers[category]
  }
}

function resetLoadMoreState(category: SearchCategory) {
  loadMoreState[category].pending = false
  loadMoreState[category].lastTriggered = 0
  loadMoreState[category].lastAppended = 0
  loadMoreState[category].autoFillAttempts = 0
  clearLoadMoreTimer(category)
}

function resetAllCategories() {
  searchResults.value = {}
  error.value = ''
  liveUserTotalResults.value = 0
  liveRoomTotalResults.value = 0
  CATEGORY_KEYS.forEach((category) => {
    categoryPage[category] = 0
    categoryTotalPages[category] = 0
    categoryTotalResults[category] = 0
    categoryExhausted[category] = false
    categoryContext[category] = ''
    if (category !== 'all')
      categoryCounts[category] = 0
    resetLoadMoreState(category)
  })
}

function clearCategoryData(category: SearchCategory) {
  const next = { ...searchResults.value }
  delete next[category]
  searchResults.value = next
  categoryPage[category] = 0
  categoryTotalPages[category] = 0
  categoryTotalResults[category] = 0
  categoryExhausted[category] = false
  categoryContext[category] = ''
  // 注意：不清除 liveUserTotalResults 和 liveRoomTotalResults
  // 因为这些是跨子分类共享的数据，切换子分类时应该保留
  // 同时不清除 categoryCounts，因为只有综合搜索才会更新这些数字
  // 清除它们会导致Tab数字显示为0
  resetLoadMoreState(category)
}

function scheduleLoadMoreAttempt(category: SearchCategory, delay: number) {
  clearLoadMoreTimer(category)

  const effectiveDelay = Math.max(delay, 0)

  loadMoreState[category].pending = true

  loadMoreTimers[category] = window.setTimeout(() => {
    delete loadMoreTimers[category]
    attemptLoadMore(category)
  }, effectiveDelay)
}

function requestLoadMore(category: SearchCategory) {
  if (!normalizedKeyword.value)
    return
  if (!hasMoreForCategory(category))
    return

  if (isLoading.value) {
    loadMoreState[category].pending = true
    scheduleLoadMoreAttempt(category, RETRY_IF_LOADING_DELAY_MS)
    return
  }

  const now = Date.now()
  const elapsed = now - loadMoreState[category].lastTriggered
  if (elapsed < LOAD_MORE_COOLDOWN_MS)
    return

  attemptLoadMore(category)
}

function attemptLoadMore(category: SearchCategory) {
  if (!normalizedKeyword.value || !hasMoreForCategory(category)) {
    loadMoreState[category].pending = false
    loadMoreState[category].autoFillAttempts = 0
    return
  }

  if (isLoading.value) {
    loadMoreState[category].pending = true
    scheduleLoadMoreAttempt(category, RETRY_IF_LOADING_DELAY_MS)
    return
  }

  loadMoreState[category].pending = false
  loadMoreState[category].lastTriggered = Date.now()
  loadMoreState[category].autoFillAttempts = 0
  void performSearch(category, true)
}

function getNextPage(category: SearchCategory, loadMore: boolean) {
  if (loadMore)
    return (categoryPage[category] || 0) + 1
  return 1
}

async function performSearch(category: SearchCategory, loadMore = false) {
  const keyword = normalizedKeyword.value
  if (!keyword)
    return

  if (loadMore && (isLoading.value || categoryExhausted[category]))
    return

  if (!loadMore)
    categoryExhausted[category] = false

  const targetPage = getNextPage(category, loadMore)
  isLoading.value = true
  error.value = ''
  const requestToken = Symbol('search-request')
  activeRequestTokens[category] = requestToken
  loadMoreState[category].lastAppended = 0

  try {
    const useVideoFilters = category === 'all' && isVideoFilterActive.value
    let response: any

    switch (category) {
      case 'all':
        if (useVideoFilters) {
          response = await api.search.searchVideo({
            keyword,
            page: targetPage,
            page_size: PAGE_SIZE,
            ...buildVideoSearchParams({
              loadMore,
              context: categoryContext.all,
            }),
          })
        }
        else {
          response = await api.search.searchAll({
            keyword,
            page: targetPage,
            page_size: PAGE_SIZE,
            context: targetPage > 1 ? categoryContext.all : '',
            web_roll_page: targetPage,
          })
        }
        break
      case 'video':
        response = await api.search.searchVideo({
          keyword,
          page: targetPage,
          page_size: PAGE_SIZE,
          ...buildVideoSearchParams({
            loadMore,
            context: categoryContext.video,
          }),
        })
        break
      case 'bangumi':
        response = await api.search.searchBangumi({
          keyword,
          page: targetPage,
          pagesize: PAGE_SIZE,
        })
        break
      case 'media_ft':
        response = await api.search.searchMediaFt({
          keyword,
          page: targetPage,
          pagesize: PAGE_SIZE,
        })
        break
      case 'user': {
        const userOrderMap: Record<string, { order: string, order_sort: number }> = {
          '': { order: '', order_sort: 0 },
          'fans': { order: 'fans', order_sort: 0 },
          'fans_desc': { order: 'fans', order_sort: 1 },
          'level': { order: 'level', order_sort: 0 },
          'level_desc': { order: 'level', order_sort: 1 },
        }
        const orderConfig = userOrderMap[currentUserOrder.value] || { order: '', order_sort: 0 }

        response = await api.search.searchUser({
          keyword,
          page: targetPage,
          pagesize: PAGE_SIZE,
          order: orderConfig.order,
          order_sort: orderConfig.order_sort,
          user_type: currentUserType.value,
        })
        break
      }
      case 'live':
        // 根据子分类选择不同的API
        if (currentLiveSubCategory.value === 'live_room') {
          // 仅搜索直播间
          response = await api.search.searchLiveRoom({
            keyword,
            page: targetPage,
            pagesize: PAGE_SIZE,
            order: currentLiveRoomOrder.value,
          })
        }
        else if (currentLiveSubCategory.value === 'live_user') {
          // 仅搜索主播
          response = await api.search.searchLiveUser({
            keyword,
            page: targetPage,
            page_size: PAGE_SIZE,
            order: currentLiveUserOrder.value,
          })
        }
        else {
          // 全部（默认使用live类型，包含直播间和主播）
          response = await api.search.searchLive({
            keyword,
            page: targetPage,
            pagesize: PAGE_SIZE,
            order: currentLiveRoomOrder.value,
          })
        }
        break
      case 'article':
        response = await api.search.searchArticle({
          keyword,
          page: targetPage,
          pagesize: PAGE_SIZE,
        })
        break
    }

    if (!response || response.code !== 0) {
      error.value = '搜索失败，请稍后重试'
      return
    }

    if (activeRequestTokens[category] !== requestToken || normalizedKeyword.value !== keyword)
      return

    const rawIncomingData = response.data ?? {}
    const normalizedIncomingData = (category === 'all' && useVideoFilters)
      ? normalizeAllVideoResponse(rawIncomingData)
      : rawIncomingData
    const previousData = searchResults.value[category]
    const mergedData = loadMore && previousData
      ? mergeCategoryData(category, previousData, normalizedIncomingData)
      : normalizedIncomingData

    const nextContext = extractSearchContext(rawIncomingData)
    if (nextContext)
      categoryContext[category] = nextContext

    let finalData = mergedData
    if (category === 'video') {
      const filteredResult = applyVideoTimeFilter(Array.isArray(mergedData?.result) ? [...mergedData.result] : [])
      finalData = {
        ...mergedData,
        result: filteredResult,
      }
    }

    if (activeRequestTokens[category] !== requestToken || normalizedKeyword.value !== keyword)
      return

    // 在更新 searchResults 前批量查询用户关系状态
    if (category === 'user' && Array.isArray(finalData?.result)) {
      const mids = finalData.result.map((u: any) => u.mid).filter(Boolean)
      await batchQueryUserRelations(mids)
    }
    else if (category === 'live') {
      // 处理直播搜索的用户关系
      if (currentLiveSubCategory.value === 'live_user' && Array.isArray(finalData?.result)) {
        // 主播搜索：result是主播数组
        const mids = finalData.result.map((u: any) => u.mid).filter(Boolean)
        await batchQueryUserRelations(mids)
      }
      else if (Array.isArray(finalData?.result?.live_user)) {
        // 全部或直播间搜索：result.live_user是主播数组
        const mids = finalData.result.live_user.map((u: any) => u.mid).filter(Boolean)
        await batchQueryUserRelations(mids)
      }
    }
    else if (category === 'all' && Array.isArray(finalData?.result)) {
      const userSection = finalData.result.find((s: any) => s?.result_type === 'bili_user')
      if (userSection && Array.isArray(userSection.data)) {
        const mids = userSection.data.map((u: any) => u.mid).filter(Boolean)
        await batchQueryUserRelations(mids)
      }
    }

    searchResults.value = {
      ...searchResults.value,
      [category]: finalData,
    }

    const { totalResults, totalPages } = extractPagination(category, rawIncomingData, targetPage)
    categoryPage[category] = targetPage
    categoryTotalPages[category] = totalPages

    // 对于直播分类，根据子分类保存不同的总数
    if (category === 'live') {
      if (currentLiveSubCategory.value === 'live_user') {
        // 主播搜索：保存主播总数，不覆盖直播间总数
        liveUserTotalResults.value = totalResults
        // categoryTotalResults.live 保持直播间的数量不变
      }
      else if (currentLiveSubCategory.value === 'live_room') {
        // 直播间搜索：保存直播间总数
        liveRoomTotalResults.value = totalResults
        categoryTotalResults[category] = totalResults
      }
      else {
        // 全部模式：同时保存直播间和主播的总数
        const liveRoomTotal = Number(rawIncomingData?.pageinfo?.live_room?.total)
          || Number(rawIncomingData?.pageinfo?.live_room?.numResults)
          || 0
        const liveUserTotal = Number(rawIncomingData?.pageinfo?.live_user?.total)
          || Number(rawIncomingData?.pageinfo?.live_user?.numResults)
          || 0
        liveRoomTotalResults.value = liveRoomTotal
        liveUserTotalResults.value = liveUserTotal
        categoryTotalResults[category] = liveRoomTotal
      }
    }
    else {
      categoryTotalResults[category] = totalResults
    }

    // 只有在 'all' 分类时才更新所有Tab的统计数字
    // 这样可以避免切换Tab或子分类时导致Tab数字变动
    if (category === 'all' && !useVideoFilters) {
      updateCountsFromAll(rawIncomingData)
    }

    if (category === 'all' && !useVideoFilters)
      categoryContext.all = extractSearchContext(rawIncomingData)

    // 同步video分类数据到all分类的视频section
    // 只在video分类加载时同步，all分类加载时不同步（all有自己的数据源）
    if (category === 'video')
      syncVideoSectionIntoAll()

    if (loadMore) {
      const previousLength = getCategoryResultLength(category, previousData)
      const finalLength = getCategoryResultLength(category, finalData)
      const newItems = Math.max(finalLength - previousLength, 0)
      loadMoreState[category].lastAppended = newItems
      const incomingLength = getCategoryResultLength(category, normalizedIncomingData)
      if (incomingLength <= 0) {
        categoryExhausted[category] = true
      }
      else if (newItems <= 0 && targetPage >= categoryTotalPages[category]) {
        categoryExhausted[category] = true
      }
    }
    else if (getCategoryResultLength(category, finalData) === 0) {
      categoryExhausted[category] = true
      loadMoreState[category].lastAppended = 0
    }
    else {
      loadMoreState[category].lastAppended = getCategoryResultLength(category, finalData)
    }
  }
  catch (err) {
    console.error('Search error:', err)
    error.value = '搜索出错，请稍后重试'
  }
  finally {
    await waitForRender()
    isLoading.value = false
    if (loadMore)
      void handleLoadMoreCompletion(category)
  }
}

async function handleLoadMoreCompletion(category: SearchCategory) {
  const state = loadMoreState[category]
  const now = Date.now()
  const elapsed = now - state.lastTriggered
  const remainingCooldown = Math.max(LOAD_MORE_COOLDOWN_MS - elapsed, 0)

  if (state.pending && hasMoreForCategory(category)) {
    scheduleLoadMoreAttempt(category, Math.max(remainingCooldown, RETRY_IF_LOADING_DELAY_MS))
    return
  }

  if (!hasMoreForCategory(category)) {
    state.autoFillAttempts = 0
    return
  }

  const appendedItems = state.lastAppended
  const supportsAutoFill = category !== 'all' && appendedItems > 0
  if (!supportsAutoFill) {
    state.autoFillAttempts = 0
    return
  }

  if (state.autoFillAttempts >= AUTO_FILL_MAX_ATTEMPTS) {
    state.autoFillAttempts = 0
    return
  }

  const hasScrollBar = await haveScrollbar()
  if (hasScrollBar) {
    state.autoFillAttempts = 0
    return
  }

  state.autoFillAttempts += 1
  scheduleLoadMoreAttempt(category, Math.max(remainingCooldown, RETRY_IF_LOADING_DELAY_MS))
}

function mergeCategoryData(category: SearchCategory, previous: any, incoming: any) {
  if (category === 'all') {
    const prevSections = Array.isArray(previous?.result) ? previous.result : []
    const incomingSections = Array.isArray(incoming?.result) ? incoming.result : []
    const sectionMap = new Map<string, any>()

    prevSections.forEach((section: any) => {
      const data = Array.isArray(section?.data) ? dedupeSectionItems(section.result_type, [...section.data]) : section.data
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

  if (category === 'live') {
    // 对于live_user和live_room子分类，result是简单数组
    if (currentLiveSubCategory.value === 'live_user' || currentLiveSubCategory.value === 'live_room') {
      const prevList = Array.isArray(previous?.result) ? previous.result : []
      const newList = Array.isArray(incoming?.result) ? incoming.result : []
      const dedupeKey = currentLiveSubCategory.value === 'live_user' ? 'user' : 'live'
      const merged = dedupeCategoryItems(dedupeKey as SearchCategory, [...prevList, ...newList])

      return {
        ...previous,
        ...incoming,
        result: merged,
      }
    }

    // 对于all子分类，result包含live_room和live_user
    const prevRooms = Array.isArray(previous?.result?.live_room) ? previous.result.live_room : []
    const newRooms = Array.isArray(incoming?.result?.live_room) ? incoming.result.live_room : []
    const mergedRooms = dedupeCategoryItems('live', [...prevRooms, ...newRooms])

    const prevUsers = Array.isArray(previous?.result?.live_user) ? previous.result.live_user : []
    const newUsers = Array.isArray(incoming?.result?.live_user) ? incoming.result.live_user : []
    const mergedUsers = dedupeCategoryItems('user', [...prevUsers, ...newUsers])

    return {
      ...previous,
      ...incoming,
      result: {
        ...previous?.result,
        ...incoming?.result,
        live_room: mergedRooms,
        live_user: mergedUsers,
      },
    }
  }

  const prevList = Array.isArray(previous?.result) ? previous.result : []
  const newList = Array.isArray(incoming?.result) ? incoming.result : []
  const merged = dedupeCategoryItems(category, [...prevList, ...newList])

  return {
    ...previous,
    ...incoming,
    result: merged,
  }
}

function extractPagination(category: SearchCategory, data: any, fallbackPage: number) {
  // 对于直播分类，根据子分类统计
  if (category === 'live') {
    // 主播搜索
    if (currentLiveSubCategory.value === 'live_user') {
      const totalResultsCandidate = [
        data?.numResults,
        data?.num_results,
        data?.pageinfo?.total,
        data?.page_info?.total,
        data?.total,
      ].map(Number).find(value => Number.isFinite(value) && value >= 0)

      const totalResults = totalResultsCandidate ?? (Array.isArray(data?.result) ? data.result.length : 0)

      const pageSizeCandidate = [
        data?.page_size,
        data?.pagesize,
        data?.pageinfo?.per_page,
        data?.pageinfo?.page_size,
      ].map(Number).find(value => Number.isFinite(value) && value > 0)

      const effectivePageSize = pageSizeCandidate || PAGE_SIZE

      const totalPagesCandidate = [
        data?.numPages,
        data?.num_pages,
        data?.pageinfo?.total_page,
      ].map(Number).find(value => Number.isFinite(value) && value > 0)

      const totalPages = totalPagesCandidate
        || (totalResults && effectivePageSize ? Math.ceil(totalResults / effectivePageSize) : fallbackPage)

      return {
        totalResults,
        totalPages,
      }
    }

    // 直播间搜索
    if (currentLiveSubCategory.value === 'live_room') {
      const totalResultsCandidate = [
        data?.numResults,
        data?.num_results,
        data?.pageinfo?.total,
        data?.page_info?.total,
        data?.total,
      ].map(Number).find(value => Number.isFinite(value) && value >= 0)

      const totalResults = totalResultsCandidate ?? (Array.isArray(data?.result) ? data.result.length : 0)

      const pageSizeCandidate = [
        data?.page_size,
        data?.pagesize,
        data?.pageinfo?.per_page,
        data?.pageinfo?.page_size,
      ].map(Number).find(value => Number.isFinite(value) && value > 0)

      const effectivePageSize = pageSizeCandidate || PAGE_SIZE

      const totalPagesCandidate = [
        data?.numPages,
        data?.num_pages,
        data?.pageinfo?.total_page,
      ].map(Number).find(value => Number.isFinite(value) && value > 0)

      const totalPages = totalPagesCandidate
        || (totalResults && effectivePageSize ? Math.ceil(totalResults / effectivePageSize) : fallbackPage)

      return {
        totalResults,
        totalPages,
      }
    }

    // 全部（包含直播间和主播）
    const liveRoomTotal = Number(data?.pageinfo?.live_room?.total)
      || Number(data?.pageinfo?.live_room?.numResults)
      || Number(data?.result?.live_room?.length)
      || 0

    const liveRoomPageSize = Number(data?.pageinfo?.live_room?.page_size)
      || Number(data?.pageinfo?.live_room?.per_page)
      || PAGE_SIZE

    const liveRoomTotalPages = Number(data?.pageinfo?.live_room?.numPages)
      || Number(data?.pageinfo?.live_room?.pages)
      || (liveRoomTotal && liveRoomPageSize ? Math.ceil(liveRoomTotal / liveRoomPageSize) : fallbackPage)

    return {
      totalResults: liveRoomTotal,
      totalPages: liveRoomTotalPages,
    }
  }

  const totalResultsCandidate = [
    data?.numResults,
    data?.num_results,
    data?.pageinfo?.total,
    data?.page_info?.total,
    data?.total,
  ].map(Number).find(value => Number.isFinite(value) && value >= 0)

  let totalResults = totalResultsCandidate ?? 0

  if (!totalResults) {
    if (category === 'all') {
      totalResults = Array.isArray(data?.result)
        ? data.result.reduce((sum: number, section: any) => {
            if (Array.isArray(section?.data))
              return sum + section.data.length
            return sum
          }, 0)
        : 0
    }
    else {
      totalResults = Array.isArray(data?.result) ? data.result.length : 0
    }
  }

  const pageSizeCandidate = [
    data?.page_size,
    data?.pagesize,
    data?.pageinfo?.per_page,
    data?.pageinfo?.page_size,
    data?.page_info?.page_size,
    data?.page_info?.per_page,
  ].map(Number).find(value => Number.isFinite(value) && value > 0)

  const effectivePageSize = pageSizeCandidate || PAGE_SIZE

  const totalPagesCandidate = [
    data?.numPages,
    data?.num_pages,
    data?.pageinfo?.total_page,
    data?.pageinfo?.num_page,
    data?.page_info?.total_page,
    data?.page_info?.num_page,
  ].map(Number).find(value => Number.isFinite(value) && value > 0)

  const totalPages = totalPagesCandidate
    || (totalResults && effectivePageSize ? Math.ceil(totalResults / effectivePageSize) : fallbackPage)

  return {
    totalResults,
    totalPages,
  }
}

function getCategoryResultLength(category: SearchCategory, data: any): number {
  if (!data)
    return 0
  if (category === 'all') {
    const sections = Array.isArray(data?.result) ? data.result : []
    return sections.reduce((sum: number, section: any) => {
      if (Array.isArray(section?.data))
        return sum + section.data.length
      return sum
    }, 0)
  }
  if (category === 'live') {
    // 对于live_user子分类，result直接是主播数组
    if (currentLiveSubCategory.value === 'live_user') {
      return Array.isArray(data?.result) ? data.result.length : 0
    }
    // 对于live_room子分类，result直接是直播间数组
    if (currentLiveSubCategory.value === 'live_room') {
      return Array.isArray(data?.result) ? data.result.length : 0
    }
    // 对于all子分类，包含live_room和live_user
    const liveRoomCount = Array.isArray(data?.result?.live_room) ? data.result.live_room.length : 0
    const liveUserCount = Array.isArray(data?.result?.live_user) ? data.result.live_user.length : 0
    return liveRoomCount + liveUserCount
  }
  const list = data?.result
  return Array.isArray(list) ? list.length : 0
}

function extractSearchContext(data: any): string {
  const candidates = [
    data?.pageinfo?.context,
    data?.pageinfo?.next?.context,
    data?.page_info?.context,
    data?.page_info?.next?.context,
    data?.context,
  ]
  const found = candidates.find(value => typeof value === 'string' && value.length > 0)
  return typeof found === 'string' ? found : ''
}

async function waitForRender() {
  await nextTick()
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  }
}

function generateSearchSessionId(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function')
      return crypto.randomUUID().replace(/-/g, '')
    if (typeof crypto.getRandomValues === 'function') {
      const array = new Uint8Array(16)
      crypto.getRandomValues(array)
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
    }
  }
  const timestampPart = Date.now().toString(16)
  const randomPart = Math.random().toString(16).slice(2)
  return `${timestampPart}${randomPart}`.padEnd(32, '0').slice(0, 32)
}

function dedupeByKey(items: any[], keyGetter: (item: any) => string): any[] {
  const seen = new Set<string>()
  const result: any[] = []
  items.forEach((item) => {
    const key = keyGetter(item)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  })
  return result
}

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

function dedupeSectionItems(type: string, items: any[]): any[] {
  return dedupeByKey(items, item => getSectionItemKey(type, item))
}

function getCategoryItemKey(category: SearchCategory, item: any): string {
  switch (category) {
    case 'video':
      return String(item?.aid ?? item?.id ?? item?.bvid ?? JSON.stringify(item))
    case 'bangumi':
    case 'media_ft':
      return String(item?.season_id ?? item?.media_id ?? item?.id ?? JSON.stringify(item))
    case 'user':
      return String(item?.mid ?? JSON.stringify(item))
    case 'live':
      return String(item?.roomid ?? item?.id ?? JSON.stringify(item))
    case 'article':
      return String(item?.id ?? JSON.stringify(item))
    case 'all':
      return JSON.stringify(item)
    default:
      return String(item?.id ?? JSON.stringify(item))
  }
}

function dedupeCategoryItems(category: SearchCategory, items: any[]): any[] {
  return dedupeByKey(items, item => getCategoryItemKey(category, item))
}

function switchCategory(category: SearchCategory) {
  if (currentCategory.value === category)
    return

  const previousCategory = currentCategory.value
  resetLoadMoreState(previousCategory)

  currentCategory.value = category
  error.value = ''

  // 更新URL中的category参数，并清空不相关的筛选参数
  const params = new URLSearchParams(window.location.search)
  params.set('category', category)

  // 根据新的category清空不相关的筛选参数
  if (category !== 'user') {
    // 非用户分类时清空用户筛选参数
    params.delete('user_order')
    params.delete('user_type')
  }
  if (category !== 'live') {
    // 非直播分类时清空直播筛选参数
    params.delete('search_type')
    params.delete('live_room_order')
    params.delete('live_user_order')
  }

  const newUrl = `${window.location.pathname}?${params.toString()}`
  window.history.pushState({}, '', newUrl)
  // 不触发pushstate事件，避免不必要的重新加载

  if (!searchResults.value[category] && normalizedKeyword.value)
    void performSearch(category)
}

function initPageAction() {
  handleReachBottom.value = () => {
    if (!normalizedKeyword.value)
      return
    if (!hasMoreForCategory(currentCategory.value))
      return

    // 使用防抖避免频繁滚动触发多次请求
    if (scrollDebounceTimer !== undefined)
      clearTimeout(scrollDebounceTimer)

    scrollDebounceTimer = window.setTimeout(() => {
      scrollDebounceTimer = undefined
      requestLoadMore(currentCategory.value)
    }, SCROLL_DEBOUNCE_MS)
  }

  handlePageRefresh.value = () => {
    if (!isLoading.value && normalizedKeyword.value) {
      clearCategoryData(currentCategory.value)
      void performSearch(currentCategory.value)
    }
  }
}

onMounted(() => {
  initPageAction()
})

function updateCountsFromAll(data: any) {
  if (!data)
    return

  const typeToCategory: Record<string, SearchCategory | undefined> = {
    video: 'video',
    media_bangumi: 'bangumi',
    media_ft: 'media_ft',
    bili_user: 'user',
    user: 'user',
    live: 'live',
    live_room: 'live',
    live_all: 'live',
    article: 'article',
  }

  // 从 top_tlist 更新数字
  const topList = data?.top_tlist || {}
  for (const key in topList) {
    const category = typeToCategory[key]
    if (!category)
      continue
    const parsed = Number(topList[key])
    if (Number.isFinite(parsed) && parsed >= 0)
      categoryCounts[category] = parsed
  }

  const pageinfo = data?.pageinfo || {}
  for (const key in pageinfo) {
    const category = typeToCategory[key]
    if (!category)
      continue
    const info = pageinfo[key]
    // 对于直播分类，统计直播间和主播数量
    if (category === 'live') {
      if (key === 'live_room') {
        const total = Number(info?.total ?? info?.numResults)
        if (Number.isFinite(total) && total >= 0) {
          categoryCounts[category] = total
          liveRoomTotalResults.value = total
          categoryTotalResults.live = total
        }
      }
      else if (key === 'live_user') {
        const total = Number(info?.total ?? info?.numResults)
        if (Number.isFinite(total) && total >= 0) {
          liveUserTotalResults.value = total
        }
      }
    }
    else {
      const total = Number(info?.total ?? info?.numResults)
      if (Number.isFinite(total) && total >= 0)
        categoryCounts[category] = total
    }
  }
}

function applyVideoTimeFilter(list: any[]): any[] {
  if (!Array.isArray(list))
    return []
  return list.filter(item => !isVideoAd(item))
}

function isVideoAd(item: any): boolean {
  if (!item || typeof item !== 'object')
    return false
  if (item.is_ad === true || item.is_ad_loc === true)
    return true
  if (item.cm || item.cm_info || item.cm_mark)
    return true
  if (item.ad_info || item.ad_extra || item.ad_index)
    return true
  if (typeof item.card_type === 'string' && item.card_type.toLowerCase().includes('ad'))
    return true
  return false
}

function syncVideoSectionIntoAll() {
  const allData = searchResults.value.all
  const videoData = searchResults.value.video
  if (!allData || !Array.isArray(allData.result) || !videoData)
    return
  const sectionIndex = allData.result.findIndex((section: any) => section?.result_type === 'video')
  if (sectionIndex === -1)
    return
  const filtered = applyVideoTimeFilter(Array.isArray(videoData.result) ? [...videoData.result] : [])
  allData.result[sectionIndex] = {
    ...(allData.result[sectionIndex] || {}),
    result_type: 'video',
    data: filtered,
  }
}
</script>

<template>
  <div class="search-results-container">
    <SearchCategoryTabs
      :categories="categories"
      :current-category="currentCategory"
      :category-counts="categoryCounts"
      @select="switchCategory"
    />

    <SearchVideoFilters
      v-if="currentCategory === 'video' || currentCategory === 'all'"
      v-model:video-order="currentVideoOrder"
      v-model:duration="currentDuration"
      v-model:time-range="currentTimeRange"
      v-model:custom-start-date="customStartDate"
      v-model:custom-end-date="customEndDate"
      :order-options="videoOrderOptions"
      :duration-options="durationOptions"
      :time-range-options="timeRangeOptions"
    />

    <SearchUserFilters
      v-if="currentCategory === 'user'"
      v-model:order="currentUserOrder"
      v-model:user-type="currentUserType"
      :order-options="userOrderOptions"
      :user-type-options="userTypeOptions"
    />

    <SearchLiveFilters
      v-if="currentCategory === 'live'"
      v-model:sub-category="currentLiveSubCategory"
    />

    <SearchResultsPanel
      :categories="categories"
      :current-category="currentCategory"
      :search-results="searchResults"
      :is-loading="isLoading"
      :error="error"
      :normalized-keyword="normalizedKeyword"
      :has-more="hasMore"
      :current-total-pages="currentTotalPages"
      :current-total-results="categoryTotalResults[currentCategory]"
      :live-user-total-results="liveUserTotalResults"
      :live-room-total-results="liveRoomTotalResults"
      :user-relations="userRelations"
      :current-live-sub-category="currentLiveSubCategory"
      :live-room-order="currentLiveRoomOrder"
      :live-room-order-options="liveRoomOrderOptions"
      :live-user-order="currentLiveUserOrder"
      :live-user-order-options="liveUserOrderOptions"
      @update-user-relation="(mid, isFollowing) => {
        if (userRelations[mid]) {
          userRelations[mid].isFollowing = isFollowing
        }
      }"
      @switch-to-live-user="() => {
        currentLiveSubCategory = 'live_user'
      }"
      @update-live-room-order="(value) => {
        currentLiveRoomOrder = value
      }"
      @update-live-user-order="(value) => {
        currentLiveUserOrder = value
      }"
    />
  </div>
</template>

<style scoped lang="scss">
.search-results-container {
  padding: 0;
}
</style>
