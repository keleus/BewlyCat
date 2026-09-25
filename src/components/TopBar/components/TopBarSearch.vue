<script setup lang="ts">
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'

const props = withDefaults(defineProps<{
  forceVisible?: boolean
  editMode?: boolean
  compact?: boolean
}>(), {
  forceVisible: false,
  editMode: false,
  compact: false,
})

const compactOpen = ref(false)
const compactFieldRef = ref<HTMLElement | null>(null)
const compactButtonRef = ref<HTMLButtonElement | null>(null)

watch(() => props.compact, (compact) => {
  if (!compact)
    compactOpen.value = false
})

async function openCompactSearch() {
  compactOpen.value = true
  await nextTick()
  compactFieldRef.value?.querySelector<HTMLInputElement>('input')?.focus()
}

function closeCompactSearch(restoreFocus = false) {
  compactOpen.value = false
  if (restoreFocus)
    compactButtonRef.value?.focus()
}

onClickOutside(compactFieldRef, (event) => {
  if (compactOpen.value && event.target !== compactButtonRef.value)
    closeCompactSearch()
})
onKeyStroke('Escape', () => {
  if (compactOpen.value)
    closeCompactSearch(true)
})

const { showSearchBar, forceWhiteIcon } = useTopBarInteraction()
watch(showSearchBar, (visible) => {
  if (!visible && !props.forceVisible)
    compactOpen.value = false
})
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
  // SearchBar 根据当前页面和「搜索栏链接打开行为」决定导航方式。
  return 'navigate'
})

function handleSearch(keyword: string) {
  if (props.editMode)
    return

  searchKeyword.value = keyword
  if (props.compact)
    closeCompactSearch()
}
</script>

<template>
  <div class="top-bar-search" flex="inline 1 md:justify-center items-center" w="full" data-top-bar-search>
    <button
      v-if="props.compact && (showSearchBar || props.forceVisible)"
      ref="compactButtonRef"
      type="button"
      class="top-bar-search__compact-button"
      :disabled="props.editMode"
      :aria-label="$t('common.search')"
      :aria-expanded="compactOpen"
      @click="openCompactSearch"
    >
      <i i-tabler:search aria-hidden="true" />
    </button>
    <Transition name="slide-out">
      <div
        v-if="(showSearchBar || props.forceVisible) && (!props.compact || compactOpen)"
        ref="compactFieldRef"
        class="top-bar-search__field"
        :class="{ 'top-bar-search__field--compact': props.compact }"
      >
        <SearchBar
          v-model="searchKeyword"
          class="search-bar"
          :style="searchBarStyles"
          :show-hot-search="settings.showHotSearchInTopBar"
          :search-behavior="props.editMode ? 'stay' : searchBehavior"
          :top-bar-mode="true"
          :top-bar-popup-below="props.compact"
          @search="handleSearch"
        />
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";

.top-bar-search__field {
  width: 100%;
  min-width: 0;
}

.top-bar-search__field--compact {
  position: fixed;
  z-index: 1001;
  top: calc(var(--bew-top-bar-height) + var(--bew-space-2));
  left: var(--bew-space-2);
  width: calc(100vw - 2 * var(--bew-space-2));
}

.top-bar-search__compact-button {
  display: grid;
  width: var(--bew-control-height);
  height: var(--bew-control-height);
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-elevated);
  color: var(--bew-text-1);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color);
  }
}
</style>
