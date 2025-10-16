<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'

import SearchCategoryTabs from './components/SearchCategoryTabs.vue'
import SearchResultsPanel from './components/SearchResultsPanel.vue'
import SearchVideoFilters from './components/SearchVideoFilters.vue'
import type { SearchCategory, SearchCategoryOption } from './types'

const props = defineProps<{
  keyword: string
}>()

const normalizedKeyword = computed(() => (props.keyword || '').trim())
const CATEGORY_KEYS: SearchCategory[] = ['all', 'video', 'bangumi', 'user', 'live', 'article']

const currentCategory = ref<SearchCategory>('all')
const searchResults = ref<Partial<Record<SearchCategory, any>>>({})
const isLoading = ref(false)
const error = ref('')

const PAGE_SIZE = 30

const categoryPage = reactive<Record<SearchCategory, number>>({
  all: 0,
  video: 0,
  bangumi: 0,
  user: 0,
  live: 0,
  article: 0,
})

const categoryTotalPages = reactive<Record<SearchCategory, number>>({
  all: 0,
  video: 0,
  bangumi: 0,
  user: 0,
  live: 0,
  article: 0,
})

const categoryTotalResults = reactive<Record<SearchCategory, number>>({
  all: 0,
  video: 0,
  bangumi: 0,
  user: 0,
  live: 0,
  article: 0,
})

const categoryExhausted = reactive<Record<SearchCategory, boolean>>({
  all: false,
  video: false,
  bangumi: false,
  user: false,
  live: false,
  article: false,
})

const categoryContext = reactive<Record<SearchCategory, string>>({
  all: '',
  video: '',
  bangumi: '',
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

const currentVideoOrder = ref<string>('')
const currentDuration = ref<number>(0)
const currentTimeRange = ref<string>('all')
const customStartDate = ref<string>('')
const customEndDate = ref<string>('')

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

const categories: ReadonlyArray<SearchCategoryOption> = [
  { value: 'all', label: '综合', icon: 'i-tabler:search' },
  { value: 'video', label: '视频', icon: 'i-tabler:video' },
  { value: 'bangumi', label: '番剧', icon: 'i-tabler:movie' },
  { value: 'user', label: '用户', icon: 'i-tabler:user' },
  { value: 'live', label: '直播', icon: 'i-tabler:broadcast' },
  { value: 'article', label: '专栏', icon: 'i-tabler:article' },
]

const categoryCounts = reactive<Record<SearchCategory, number>>({
  all: 0,
  video: 0,
  bangumi: 0,
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
  (newKeyword, oldKeyword) => {
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
    currentCategory.value = 'all'
    resetAllCategories()
    void performSearch('all')
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

watch([currentVideoOrder, currentDuration, currentTimeRange, customStartDate, customEndDate], () => {
  if (!normalizedKeyword.value)
    return
  refreshVideoResults()
  if (currentCategory.value === 'all')
    refreshAllResults()
}, { deep: false })

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
  if (!topBarStore.isSearchPage)
    topBarSearchKeyword.value = ''
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
  if (category !== 'all')
    categoryCounts[category] = 0
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
      case 'user':
        response = await api.search.searchUser({
          keyword,
          page: targetPage,
          pagesize: PAGE_SIZE,
        })
        break
      case 'live':
        response = await api.search.searchLive({
          keyword,
          page: targetPage,
          pagesize: PAGE_SIZE,
        })
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

    searchResults.value = {
      ...searchResults.value,
      [category]: finalData,
    }

    const { totalResults, totalPages } = extractPagination(category, rawIncomingData, targetPage)
    categoryPage[category] = targetPage
    categoryTotalResults[category] = totalResults
    categoryTotalPages[category] = totalPages
    if (category === 'all' && !useVideoFilters)
      updateCountsFromAll(rawIncomingData)
    else
      categoryCounts[category] = totalResults

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
    const prevRooms = Array.isArray(previous?.result?.live_room) ? previous.result.live_room : []
    const newRooms = Array.isArray(incoming?.result?.live_room) ? incoming.result.live_room : []
    const mergedRooms = dedupeCategoryItems('live', [...prevRooms, ...newRooms])
    return {
      ...previous,
      ...incoming,
      result: {
        ...previous?.result,
        ...incoming?.result,
        live_room: mergedRooms,
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
  const totalResultsCandidate = [
    data?.numResults,
    data?.num_results,
    data?.pageinfo?.total,
    data?.page_info?.total,
    data?.total,
  ].map(Number).find(value => Number.isFinite(value) && value >= 0)

  let totalResults = totalResultsCandidate ?? 0

  if (!totalResults) {
    if (category === 'live') {
      totalResults = Number(data?.result?.live_room_total)
        || Number(data?.result?.live_room?.length)
        || 0
    }
    else if (category === 'all') {
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
  if (category === 'live')
    return Array.isArray(data?.result?.live_room) ? data.result.live_room.length : 0
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
    media_ft: 'bangumi',
    bili_user: 'user',
    user: 'user',
    live: 'live',
    live_room: 'live',
    live_all: 'live',
    article: 'article',
  }

  ;(['video', 'bangumi', 'user', 'live', 'article'] as SearchCategory[]).forEach((category) => {
    categoryCounts[category] = 0
  })

  const topList = data?.top_tlist || {}
  for (const key in topList) {
    const category = typeToCategory[key]
    if (!category)
      continue
    const parsed = Number(topList[key])
    if (Number.isFinite(parsed))
      categoryCounts[category] = parsed
  }

  const pageinfo = data?.pageinfo || {}
  for (const key in pageinfo) {
    const category = typeToCategory[key]
    if (!category)
      continue
    const info = pageinfo[key]
    const total = Number(info?.total ?? info?.numResults)
    if (Number.isFinite(total) && total >= 0)
      categoryCounts[category] = total
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

    <SearchResultsPanel
      :categories="categories"
      :current-category="currentCategory"
      :search-results="searchResults"
      :is-loading="isLoading"
      :error="error"
      :normalized-keyword="normalizedKeyword"
      :has-more="hasMore"
      :current-total-pages="currentTotalPages"
    />
  </div>
</template>

<style scoped lang="scss">
.search-results-container {
  padding: 0;
}
</style>
