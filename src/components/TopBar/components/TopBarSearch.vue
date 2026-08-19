<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'

const props = withDefaults(defineProps<{
  forceVisible?: boolean
  editMode?: boolean
}>(), {
  forceVisible: false,
  editMode: false,
})

const { showSearchBar, forceWhiteIcon } = useTopBarInteraction()
const topBarStore = useTopBarStore()
const { searchKeyword } = storeToRefs(topBarStore)

const useLightText = computed(() => forceWhiteIcon.value && settings.value.enableFrostedGlass)
const normalSearchTextColor = computed(() => useLightText.value ? 'white' : 'var(--bew-text-1)')
const normalSearchPlaceholderColor = computed(() => (
  useLightText.value
    ? 'color-mix(in oklab, white, transparent 45%)'
    : 'var(--bew-text-3)'
))

// 顶栏覆盖在图片上且使用毛玻璃时，切换为高对比度亮色文字
const searchBarStyles = computed(() => ({
  '--b-search-bar-max-width': '100%',
  // Keep the initial radius calculation valid before the global tokens finish loading.
  '--b-search-bar-height': 'var(--bew-top-bar-primary-control-height, 46px)',
  '--b-search-bar-normal-color': settings.value.enableFrostedGlass ? 'color-mix(in oklab, var(--bew-elevated-solid), transparent 60%)' : 'var(--bew-elevated)',
  '--b-search-bar-hover-color': 'var(--bew-elevated)',
  '--b-search-bar-focus-color': 'var(--bew-elevated)',
  '--b-search-bar-normal-icon-color': normalSearchTextColor.value,
  '--b-search-bar-normal-text-color': normalSearchTextColor.value,
  '--b-search-bar-hover-text-color': 'var(--bew-text-1)',
  '--b-search-bar-focus-text-color': 'var(--bew-text-1)',
  '--b-search-bar-normal-placeholder-color': normalSearchPlaceholderColor.value,
  '--b-search-bar-hover-placeholder-color': 'var(--bew-text-3)',
  '--b-search-bar-focus-placeholder-color': 'var(--bew-text-3)',
}))

const searchBehavior = computed<'navigate' | 'stay'>(() => {
  // 不再在这里决定搜索行为，让 SearchBar 组件自己根据情况判断
  // SearchBar 会根据当前是否在搜索页来决定是否使用 stay 模式
  return 'navigate'
})

function handleSearch(keyword: string) {
  if (props.editMode)
    return

  searchKeyword.value = keyword
}
</script>

<template>
  <div flex="inline 1 md:justify-center items-center" w="full" data-top-bar-search>
    <Transition name="slide-out">
      <SearchBar
        v-if="showSearchBar || props.forceVisible"
        v-model="searchKeyword"
        class="search-bar"
        :style="searchBarStyles"
        :show-hot-search="settings.showHotSearchInTopBar"
        :search-behavior="props.editMode ? 'stay' : searchBehavior"
        :top-bar-mode="true"
        @search="handleSearch"
      />
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";
</style>
