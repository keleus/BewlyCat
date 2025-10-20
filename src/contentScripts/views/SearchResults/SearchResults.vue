<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useTopBarStore } from '~/stores/topBarStore'

import SearchCategoryTabs from './components/SearchCategoryTabs.vue'
import SearchLiveFilters from './components/SearchLiveFilters.vue'
import SearchResultsPanel from './components/SearchResultsPanel.vue'
import SearchUserFilters from './components/SearchUserFilters.vue'
import SearchVideoFilters from './components/SearchVideoFilters.vue'
import type { LiveSubCategory, SearchCategory, SearchCategoryOption } from './types'

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

// 从URL读取所有筛选条件
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
function updateUrlParams(params: Record<string, string | number | undefined | null>) {
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
}

const currentCategory = ref<SearchCategory>(getCategoryFromUrl())

// 从URL初始化筛选条件
const initialFilters = getFiltersFromUrl()

// 视频筛选条件（不同步到URL）
const currentVideoOrder = ref<string>('')
const currentDuration = ref<number>(0)
const currentTimeRange = ref<string>('all')
const customStartDate = ref<string>('')
const customEndDate = ref<string>('')

// 用户筛选条件（同步到URL）
const currentUserOrder = ref<string>(initialFilters.userOrder)
const currentUserType = ref<number>(initialFilters.userType)

// 直播筛选条件（同步到URL）
const currentLiveSubCategory = ref<LiveSubCategory>(initialFilters.liveSubCategory)
const currentLiveRoomOrder = ref<string>(initialFilters.liveRoomOrder)
const currentLiveUserOrder = ref<string>(initialFilters.liveUserOrder)

// 组合过滤器对象
const videoFilters = computed(() => ({
  order: currentVideoOrder.value,
  duration: currentDuration.value,
  timeRange: currentTimeRange.value,
  customStartDate: customStartDate.value,
  customEndDate: customEndDate.value,
}))

const userFilters = computed(() => ({
  order: currentUserOrder.value,
  userType: currentUserType.value,
}))

const liveFilters = computed(() => ({
  subCategory: currentLiveSubCategory.value,
  roomOrder: currentLiveRoomOrder.value,
  userOrder: currentLiveUserOrder.value,
}))

const { handleReachBottom, handlePageRefresh } = useBewlyApp()
const topBarStore = useTopBarStore()
const { searchKeyword: topBarSearchKeyword } = storeToRefs(topBarStore)

const videoOrderOptions = [
  { value: '', label: '综合排序' },
  { value: 'click', label: '最多播放' },
  { value: 'pubdate', label: '最新发布' },
  { value: 'dm', label: '最多弹幕' },
  { value: 'stow', label: '最多收藏' },
]

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

const categories: ReadonlyArray<SearchCategoryOption> = [
  { value: 'all', label: '综合', icon: 'i-tabler:search' },
  { value: 'video', label: '视频', icon: 'i-tabler:video' },
  { value: 'bangumi', label: '番剧', icon: 'i-tabler:movie' },
  { value: 'media_ft', label: '影视', icon: 'i-tabler:movie-off' },
  { value: 'user', label: '用户', icon: 'i-tabler:user' },
  { value: 'live', label: '直播', icon: 'i-tabler:broadcast' },
  { value: 'article', label: '专栏', icon: 'i-tabler:article' },
]

// TODO: 需要从各个 Page 组件获取实际的 counts
// 暂时使用空对象
const categoryCounts = ref<Record<SearchCategory, number>>({
  all: 0,
  video: 0,
  bangumi: 0,
  media_ft: 0,
  user: 0,
  live: 0,
  article: 0,
})

const searchResultsPanelRef = ref<InstanceType<typeof SearchResultsPanel>>()

// 监听关键词变化
watch(() => props.keyword, async (newKeyword, oldKeyword) => {
  const normalizedNew = (newKeyword || '').trim()
  const normalizedOld = (oldKeyword || '').trim()

  if (!normalizedNew)
    return

  if (normalizedNew === normalizedOld && newKeyword === oldKeyword)
    return

  // 从URL读取筛选条件并恢复状态
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
}, { immediate: true })

// 同步搜索关键词到 topBar
watch(normalizedKeyword, (value) => {
  topBarSearchKeyword.value = value
}, { immediate: true })

// 监听用户筛选条件变化
watch([currentUserOrder, currentUserType], () => {
  if (!normalizedKeyword.value)
    return

  // 更新URL参数
  updateUrlParams({
    user_order: currentUserOrder.value,
    user_type: currentUserType.value,
  })
}, { deep: false })

// 监听直播子分类变化
watch(currentLiveSubCategory, () => {
  if (!normalizedKeyword.value)
    return

  // 更新URL参数
  updateUrlParams({
    search_type: currentLiveSubCategory.value,
  })
})

// 监听直播间排序变化
watch(currentLiveRoomOrder, () => {
  if (!normalizedKeyword.value)
    return

  // 更新URL参数
  updateUrlParams({
    live_room_order: currentLiveRoomOrder.value,
  })
})

// 监听主播排序变化
watch(currentLiveUserOrder, () => {
  if (!normalizedKeyword.value)
    return

  // 更新URL参数
  updateUrlParams({
    live_user_order: currentLiveUserOrder.value,
  })
})

function switchCategory(category: SearchCategory) {
  if (currentCategory.value === category)
    return

  currentCategory.value = category

  // 更新URL中的category参数，并清空不相关的筛选参数
  const params = new URLSearchParams(window.location.search)
  params.set('category', category)

  // 根据新的category清空不相关的筛选参数
  if (category !== 'user') {
    params.delete('user_order')
    params.delete('user_type')
  }
  if (category !== 'live') {
    params.delete('search_type')
    params.delete('live_room_order')
    params.delete('live_user_order')
  }

  const newUrl = `${window.location.pathname}?${params.toString()}`
  window.history.pushState({}, '', newUrl)
}

function initPageAction() {
  handleReachBottom.value = () => {
    if (!normalizedKeyword.value)
      return

    if (searchResultsPanelRef.value?.handleReachBottom) {
      searchResultsPanelRef.value.handleReachBottom()
    }
  }

  handlePageRefresh.value = () => {
    // 刷新逻辑可以在各个 Page 组件内部处理
    window.location.reload()
  }
}

onMounted(() => {
  initPageAction()
})
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
      ref="searchResultsPanelRef"
      :current-category="currentCategory"
      :keyword="normalizedKeyword"
      :video-filters="videoFilters"
      :user-filters="userFilters"
      :live-filters="liveFilters"
    />
  </div>
</template>

<style scoped lang="scss">
.search-results-container {
  padding: 0;
}
</style>
