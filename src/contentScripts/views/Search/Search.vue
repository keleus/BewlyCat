<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { onUnmounted, ref } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

// 搜索关键词
const searchInput = ref<string>('')
const topBarStore = useTopBarStore()
const { searchKeyword: topBarSearchKeyword, isLogin } = storeToRefs(topBarStore)

// 页面卸载时清空顶栏搜索框（真正离开搜索页面）
onUnmounted(() => {
  topBarSearchKeyword.value = ''
})

function performInPlaceSearch(keyword: string) {
  const normalized = keyword.trim()
  if (!normalized)
    return

  // 如果未登录，跳转到 B 站原版搜索页面
  if (!isLogin.value) {
    const encoded = encodeURIComponent(normalized)
    window.location.href = `https://search.bilibili.com/all?keyword=${encoded}`
    return
  }

  const params = new URLSearchParams(window.location.search)
  params.set('page', 'SearchResults')
  params.set('keyword', normalized)
  // 清除旧的筛选参数，从搜索首页进入搜索结果页时重置筛选条件
  params.delete('category')
  params.delete('pn')
  params.delete('user_order')
  params.delete('user_type')
  params.delete('search_type')
  params.delete('live_room_order')
  params.delete('live_user_order')

  const newUrl = `${window.location.pathname}?${params.toString()}`

  window.history.pushState({}, '', newUrl)
  searchInput.value = normalized
  topBarSearchKeyword.value = normalized
  // 触发 pushstate 事件通知其他组件
  window.dispatchEvent(new Event('pushstate'))
}

function handleSearch(keyword: string) {
  if (!settings.value.usePluginSearchResultsPage)
    return
  performInPlaceSearch(keyword)
}
</script>

<template>
  <!-- 显示搜索页面 -->
  <div
    flex="~ col"
    justify-center
    items-center
    w-full z-10
    m="t-20vh"
  >
    <Logo
      v-if="settings.searchPageShowLogo" :size="180" :color="settings.searchPageLogoColor === 'white' ? 'white' : 'var(--bew-theme-color)'"
      :glow="settings.searchPageLogoGlow"
      mb-12 z-1
    />
    <SearchBar
      v-model="searchInput"
      :darken-on-focus="settings.searchPageDarkenOnSearchFocus"
      :blurred-on-focus="settings.searchPageBlurredOnSearchFocus"
      :focused-character="settings.searchPageSearchBarFocusCharacter"
      :show-hot-search="settings.showHotSearchInTopBar"
      :search-behavior="settings.usePluginSearchResultsPage ? 'stay' : 'navigate'"
      @search="handleSearch"
    />
  </div>
</template>
