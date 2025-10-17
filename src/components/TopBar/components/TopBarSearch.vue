<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

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
  if (!settings.value.usePluginSearchResultsPage)
    return 'navigate'

  const url = new URL(currentLocation.value)
  const params = new URLSearchParams(url.search)
  return params.get('page') === 'Search' ? 'stay' : 'navigate'
})

function pushKeywordToSearchPage(keyword: string) {
  const normalized = keyword.trim()
  if (!normalized)
    return

  const params = new URLSearchParams(window.location.search)
  params.set('page', 'Search')
  params.set('keyword', normalized)
  const newUrl = `${window.location.pathname}?${params.toString()}`
  window.history.pushState({}, '', newUrl)
  // 触发 pushstate 事件通知其他组件（如 Search.vue）
  window.dispatchEvent(new Event('pushstate'))
}

function handleSearch(keyword: string) {
  // 先更新 searchKeyword，确保顶栏搜索框显示正确的值
  searchKeyword.value = keyword

  if (searchBehavior.value !== 'stay')
    return

  pushKeywordToSearchPage(keyword)
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
