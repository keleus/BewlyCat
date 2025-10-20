<script setup lang="ts">
import { computed, ref } from 'vue'

import AllSearchPage from '../pages/AllSearchPage.vue'
import ArticleSearchPage from '../pages/ArticleSearchPage.vue'
import BangumiSearchPage from '../pages/BangumiSearchPage.vue'
import LiveSearchPage from '../pages/LiveSearchPage.vue'
import MediaFtSearchPage from '../pages/MediaFtSearchPage.vue'
import UserSearchPage from '../pages/UserSearchPage.vue'
import VideoSearchPage from '../pages/VideoSearchPage.vue'
import type { SearchCategory, SearchCategoryOption } from '../types'
// 导入原有的 Panel 用于渲染
import SearchResultsPanelRenderer from './SearchResultsPanelRenderer.vue'

const props = defineProps<{
  currentCategory: SearchCategory
  keyword: string
  videoFilters: {
    order: string
    duration: number
    timeRange: string
    customStartDate: string
    customEndDate: string
  }
  userFilters: {
    order: string
    userType: number
  }
  liveFilters: {
    subCategory: 'all' | 'live_room' | 'live_user'
    roomOrder: string
    userOrder: string
  }
}>()

// Page 组件的 refs
const allPageRef = ref<InstanceType<typeof AllSearchPage>>()
const videoPageRef = ref<InstanceType<typeof VideoSearchPage>>()
const bangumiPageRef = ref<InstanceType<typeof BangumiSearchPage>>()
const mediaFtPageRef = ref<InstanceType<typeof MediaFtSearchPage>>()
const userPageRef = ref<InstanceType<typeof UserSearchPage>>()
const livePageRef = ref<InstanceType<typeof LiveSearchPage>>()
const articlePageRef = ref<InstanceType<typeof ArticleSearchPage>>()

// 当前激活的 Page 组件
const currentPageRef = computed(() => {
  switch (props.currentCategory) {
    case 'all':
      return allPageRef.value
    case 'video':
      return videoPageRef.value
    case 'bangumi':
      return bangumiPageRef.value
    case 'media_ft':
      return mediaFtPageRef.value
    case 'user':
      return userPageRef.value
    case 'live':
      return livePageRef.value
    case 'article':
      return articlePageRef.value
    default:
      return null
  }
})

// 将 Page 组件的输出适配为 Renderer 需要的 searchResults 格式
const searchResults = computed(() => {
  const page = currentPageRef.value
  if (!page || !page.results)
    return {}

  // all 和 live 分类的 results 本身已经是包含 result 字段的对象
  // 其他分类的 results 是数组，需要包装
  if (props.currentCategory === 'all' || props.currentCategory === 'live') {
    return {
      [props.currentCategory]: page.results,
    }
  }

  return {
    [props.currentCategory]: {
      result: page.results,
    },
  }
})

// 当前分类的状态
const currentState = computed(() => {
  const page = currentPageRef.value as any
  return {
    isLoading: page?.isLoading || false,
    error: page?.error || '',
    totalResults: page?.totalResults || 0,
    hasMore: page?.hasMore || false,
    userRelations: page?.userRelations || {},
    liveRoomList: page?.liveRoomList || [],
    liveUserList: page?.liveUserList || [],
    liveRoomTotalResults: page?.liveRoomTotalResults || 0,
    liveUserTotalResults: page?.liveUserTotalResults || 0,
  }
})

// 分类列表（用于 Renderer）
const categories: ReadonlyArray<SearchCategoryOption> = [
  { value: 'all', label: '综合', icon: 'i-tabler:search' },
  { value: 'video', label: '视频', icon: 'i-tabler:video' },
  { value: 'bangumi', label: '番剧', icon: 'i-tabler:movie' },
  { value: 'media_ft', label: '影视', icon: 'i-tabler:movie-off' },
  { value: 'user', label: '用户', icon: 'i-tabler:user' },
  { value: 'live', label: '直播', icon: 'i-tabler:broadcast' },
  { value: 'article', label: '专栏', icon: 'i-tabler:article' },
]

// 处理滚动到底部事件
function handleReachBottom() {
  const page = currentPageRef.value
  if (page && page.requestLoadMore) {
    page.requestLoadMore()
  }
}

// 处理用户关系更新
function handleUpdateUserRelation(mid: number, isFollowing: boolean) {
  const page = currentPageRef.value as any
  if (page && page.updateUserRelation) {
    page.updateUserRelation(mid, isFollowing)
  }
}

// 暴露给父组件
defineExpose({
  handleReachBottom,
})
</script>

<template>
  <div class="search-results-panel">
    <!-- All Search Page -->
    <AllSearchPage
      v-if="currentCategory === 'all'"
      ref="allPageRef"
      :keyword="keyword"
      :filters="videoFilters"
    >
      <template #default>
        <SearchResultsPanelRenderer
          :categories="categories"
          :current-category="currentCategory"
          :search-results="searchResults"
          :is-loading="currentState.isLoading"
          :error="currentState.error"
          :normalized-keyword="keyword"
          :has-more="currentState.hasMore"
          :current-total-pages="0"
          :current-total-results="currentState.totalResults"
          :user-relations="currentState.userRelations"
          @update-user-relation="handleUpdateUserRelation"
        />
      </template>
    </AllSearchPage>

    <!-- Video Search Page -->
    <VideoSearchPage
      v-if="currentCategory === 'video'"
      ref="videoPageRef"
      :keyword="keyword"
      :filters="videoFilters"
    />

    <!-- Bangumi Search Page -->
    <BangumiSearchPage
      v-if="currentCategory === 'bangumi'"
      ref="bangumiPageRef"
      :keyword="keyword"
    />

    <!-- MediaFt Search Page -->
    <MediaFtSearchPage
      v-if="currentCategory === 'media_ft'"
      ref="mediaFtPageRef"
      :keyword="keyword"
    />

    <!-- User Search Page -->
    <UserSearchPage
      v-if="currentCategory === 'user'"
      ref="userPageRef"
      :keyword="keyword"
      :filters="userFilters"
    />

    <!-- Live Search Page -->
    <LiveSearchPage
      v-if="currentCategory === 'live'"
      ref="livePageRef"
      :keyword="keyword"
      :filters="liveFilters"
    />

    <!-- Article Search Page -->
    <ArticleSearchPage
      v-if="currentCategory === 'article'"
      ref="articlePageRef"
      :keyword="keyword"
    />
  </div>
</template>

<style scoped lang="scss">
.search-results-panel {
  width: 100%;
}
</style>
