<script setup lang="ts">
import { computed } from 'vue'

import { settings } from '~/logic'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'

const { showSearchBar, forceWhiteIcon } = useTopBarInteraction()

// 可以考虑添加一个计算属性来处理样式
const searchBarStyles = computed(() => ({
  '--b-search-bar-normal-color': settings.value.disableFrostedGlass ? 'var(--bew-elevated)' : 'color-mix(in oklab, var(--bew-elevated-solid), transparent 60%)',
  '--b-search-bar-hover-color': 'var(--bew-elevated-hover)',
  '--b-search-bar-focus-color': 'var(--bew-elevated)',
  '--b-search-bar-normal-icon-color': forceWhiteIcon.value && !settings.value.disableFrostedGlass ? 'white' : 'var(--bew-text-1)',
  '--b-search-bar-normal-text-color': forceWhiteIcon.value && !settings.value.disableFrostedGlass ? 'white' : 'var(--bew-text-1)',
}))
</script>

<template>
  <div flex="inline 1 md:justify-center items-center" w="full" data-top-bar-search>
    <Transition name="slide-out">
      <SearchBar
        v-if="showSearchBar"
        class="search-bar"
        :style="searchBarStyles"
        :show-hot-search="settings.showHotSearchInTopBar"
      />
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";
</style>
