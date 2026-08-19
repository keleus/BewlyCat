<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { onUnmounted, ref } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { navigateToPluginSearchResults, shouldUsePluginSearchResultsPage } from '~/utils/searchNavigation'

// 搜索关键词
const searchInput = ref<string>('')
const topBarStore = useTopBarStore()
const { searchKeyword: topBarSearchKeyword } = storeToRefs(topBarStore)

// 页面卸载时清空顶栏搜索框（真正离开搜索页面）
onUnmounted(() => {
  topBarSearchKeyword.value = ''
})

function handleSearch(keyword: string) {
  const normalized = keyword.trim()
  if (!normalized)
    return

  searchInput.value = normalized
  topBarSearchKeyword.value = normalized
  navigateToPluginSearchResults(normalized)
}
</script>

<template>
  <!-- 显示搜索页面 -->
  <div
    flex="~ col"
    justify-center
    items-center
    w-full z-10
    pos="relative"
    m="t-20vh"
  >
    <Logo
      v-if="settings.searchPageShowLogo" :size="180" :color="settings.searchPageLogoColor === 'white' ? 'white' : 'var(--bew-theme-color)'"
      :glow="settings.searchPageLogoGlow"
      mb-12 z-1
    />
    <SearchBar
      v-model="searchInput"
      data-layout-edit-target="search-page-search-bar"
      data-layout-settings-menu="BewlyPages"
      data-layout-settings-page="search"
      data-layout-settings-title-key="settings.group_search_bar"
      :darken-on-focus="settings.searchPageDarkenOnSearchFocus"
      :blurred-on-focus="settings.searchPageBlurredOnSearchFocus"
      :focused-character="settings.searchPageSearchBarFocusCharacter"
      :show-hot-search="settings.showHotSearchInTopBar"
      :search-behavior="shouldUsePluginSearchResultsPage() ? 'stay' : 'navigate'"
      @search="handleSearch"
    />
  </div>
</template>
