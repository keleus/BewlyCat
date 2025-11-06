<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { isHomePage } from '~/utils/main'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'

const { showSearchBar, forceWhiteIcon } = useTopBarInteraction()
const topBarStore = useTopBarStore()
const { searchKeyword } = storeToRefs(topBarStore)

// 可以考虑添加一个计算属性来处理样式
const searchBarStyles = computed(() => ({
  '--b-search-bar-normal-color': settings.value.disableFrostedGlass ? 'var(--bew-elevated)' : 'color-mix(in oklab, var(--bew-elevated-solid), transparent 60%)',
  '--b-search-bar-hover-color': 'var(--bew-elevated-hover)',
  '--b-search-bar-focus-color': 'var(--bew-elevated)',
  '--b-search-bar-normal-icon-color': forceWhiteIcon.value && !settings.value.disableFrostedGlass ? 'white' : 'var(--bew-text-1)',
  '--b-search-bar-normal-text-color': forceWhiteIcon.value && !settings.value.disableFrostedGlass ? 'white' : 'var(--bew-text-1)',
}))

const currentLocation = ref(window.location.href)

function updateCurrentLocation() {
  currentLocation.value = window.location.href
}

useEventListener(window, 'pushstate', updateCurrentLocation)
useEventListener(window, 'popstate', updateCurrentLocation)

const searchBehavior = computed<'navigate' | 'stay'>(() => {
  // 不再在这里决定搜索行为，让 SearchBar 组件自己根据情况判断
  // SearchBar 会根据当前是否在搜索页来决定是否使用 stay 模式
  return 'navigate'
})

function pushKeywordToSearchResultsPage(keyword: string) {
  const normalized = keyword.trim()
  if (!normalized)
    return

  // 如果在首页,直接使用 pushState 更新 URL
  if (isHomePage()) {
    const params = new URLSearchParams(window.location.search)
    params.set('page', 'SearchResults')
    params.set('keyword', normalized)
    // 清除旧的筛选参数，重新搜索时重置筛选条件
    params.delete('category')
    params.delete('pn')
    params.delete('user_order')
    params.delete('user_type')
    params.delete('search_type')
    params.delete('live_room_order')
    params.delete('live_user_order')
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.pushState({}, '', newUrl)
    // 触发 pushstate 事件通知其他组件（如 SearchResults.vue）
    window.dispatchEvent(new Event('pushstate'))
  }
  else {
    // 如果不在首页,跳转到 bilibili.com 主页的搜索结果页
    const params = new URLSearchParams()
    params.set('page', 'SearchResults')
    params.set('keyword', normalized)
    window.location.href = `https://www.bilibili.com/?${params.toString()}`
  }
}

function handleSearch(keyword: string) {
  // 先更新 searchKeyword，确保顶栏搜索框显示正确的值
  searchKeyword.value = keyword

  // 只有在搜索结果页且启用了插件搜索时才使用 pushState 方式
  // 其他情况由 SearchBar 组件的 navigateToSearchResultPage 处理
  if (!settings.value.usePluginSearchResultsPage)
    return

  // 检查是否在搜索结果页（通过 URL 参数判断，因为在 TopBar 中无法 inject BEWLY_APP）
  const urlParams = new URLSearchParams(window.location.search)
  const isInSearchResultsPage = urlParams.get('page') === 'SearchResults' && !!urlParams.get('keyword')

  if (!isInSearchResultsPage)
    return

  pushKeywordToSearchResultsPage(keyword)
}
</script>

<template>
  <div flex="inline 1 md:justify-center items-center" w="full" data-top-bar-search>
    <Transition name="slide-out">
      <SearchBar
        v-if="showSearchBar"
        v-model="searchKeyword"
        class="search-bar"
        :style="searchBarStyles"
        :show-hot-search="settings.showHotSearchInTopBar"
        :search-behavior="searchBehavior"
        @search="handleSearch"
      />
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";
</style>
