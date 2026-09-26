<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import { useTopBarPanel } from '../composables/useTopBarPanel'

const props = withDefaults(defineProps<{
  forceVisible?: boolean
  editMode?: boolean
  compact?: boolean
}>(), {
  forceVisible: false,
  editMode: false,
  compact: false,
})

const { showSearchBar, forceWhiteIcon } = useTopBarInteraction()
const topBarStore = useTopBarStore()
const { searchKeyword } = storeToRefs(topBarStore)

const anchor = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panelOpen = computed({ get: () => topBarStore.popupVisible.compactSearch, set: value => topBarStore.popupVisible.compactSearch = value })
function close(restoreFocus = false) {
  if (!panelOpen.value)
    return
  panelOpen.value = false
  if (restoreFocus)
    trigger.value?.focus()
}
const { panelStyle } = useTopBarPanel(anchor, panel, panelOpen, close)
function toggleSearch() {
  if (props.editMode)
    return
  if (panelOpen.value) {
    close(true)
  }
  else {
    topBarStore.closeAllPopups()
    panelOpen.value = true
  }
}
watch(() => props.compact, async () => {
  const root = anchor.value?.getRootNode() as ShadowRoot | undefined
  const focused = anchor.value?.contains(root?.activeElement ?? null)
  close()
  if (focused) {
    await nextTick()
    if (props.compact)
      trigger.value?.focus()
    else
      anchor.value?.querySelector('input')?.focus()
  }
})
watch([showSearchBar, () => props.editMode], () => close())
onBeforeUnmount(() => {
  topBarStore.popupVisible.compactSearch = false
})

const useLightText = computed(() => !props.compact && forceWhiteIcon.value && settings.value.enableFrostedGlass)
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
}
</script>

<template>
  <div ref="anchor" class="top-bar-search-anchor" flex="inline 1 md:justify-center items-center" w="full" data-top-bar-search>
    <button
      v-if="compact && (showSearchBar || forceVisible)" ref="trigger" type="button" class="compact-search-button"
      :aria-label="$t('settings.pinned_manager.search_site')" :aria-expanded="panelOpen" aria-controls="compact-top-bar-search"
      @click="toggleSearch"
    >
      <i i-mingcute:search-line aria-hidden="true" />
    </button>
    <div v-if="compact && panelOpen" id="compact-top-bar-search" ref="panel" class="compact-search-panel bew-popover-surface" :style="panelStyle">
      <SearchBar
        v-model="searchKeyword" :style="searchBarStyles" :show-hot-search="settings.showHotSearchInTopBar"
        :search-behavior="searchBehavior" :top-bar-mode="true" :contained-top-bar-panel="true" @search="handleSearch"
      />
    </div>
    <Transition name="slide-out" :css="!compact">
      <SearchBar
        v-if="!compact && (showSearchBar || props.forceVisible)"
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
.top-bar-search-anchor {
  position: relative;
}
.compact-search-button {
  display: grid;
  place-items: center;
  width: var(--bew-control-height);
  flex: none;
  height: var(--bew-control-height);
  border-radius: var(--bew-control-radius);
  color: var(--bew-text-1);
  background: var(--bew-elevated);
}
.compact-search-panel {
  position: absolute;
  z-index: 999;
  padding: var(--bew-space-2);
  box-sizing: border-box;
}
</style>
