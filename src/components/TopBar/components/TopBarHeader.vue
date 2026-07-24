<script setup lang="ts">
import { useMutationObserver } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'

import { settings } from '~/logic'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import TopBarLogo from './TopBarLogo.vue'
import TopBarRight from './TopBarRight.vue'
import TopBarSearch from './TopBarSearch.vue'

defineProps<{
  reachTop: boolean
  isDark: boolean
}>()

const { forceWhiteIcon, handleNotificationsItemClick, showSearchBar } = useTopBarInteraction()

const leftSection = ref<HTMLElement | null>(null)
const rightSection = ref<HTMLElement | null>(null)
const searchSection = ref<HTMLElement | null>(null)
const searchContent = ref<HTMLElement | null>(null)

const leftWidth = ref(0)
const rightWidth = ref(0)
const centerWidth = ref(0)
const searchContentWidth = ref(0)

// 使用单个 ResizeObserver 监听多个元素，减少开销
let resizeObserver: ResizeObserver | null = null

function setupResizeObserver() {
  if (resizeObserver)
    resizeObserver.disconnect()

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width
      if (entry.target === leftSection.value) {
        leftWidth.value = width
      }
      else if (entry.target === rightSection.value) {
        rightWidth.value = width
      }
      else if (entry.target === searchSection.value) {
        centerWidth.value = width
        refreshSearchContent()
      }
      else if (entry.target === searchContent.value) {
        searchContentWidth.value = width
      }
    }
  })

  if (leftSection.value)
    resizeObserver.observe(leftSection.value)
  if (rightSection.value)
    resizeObserver.observe(rightSection.value)
  if (searchSection.value)
    resizeObserver.observe(searchSection.value)
}

// 监听 searchContent 变化
watch(searchContent, (newEl, oldEl) => {
  if (resizeObserver) {
    if (oldEl)
      resizeObserver.unobserve(oldEl)
    if (newEl)
      resizeObserver.observe(newEl)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

useMutationObserver(searchSection, () => {
  refreshSearchContent()
}, { childList: true, subtree: true })

onMounted(() => {
  leftWidth.value = leftSection.value?.offsetWidth ?? 0
  rightWidth.value = rightSection.value?.offsetWidth ?? 0
  centerWidth.value = searchSection.value?.offsetWidth ?? 0
  refreshSearchContent()
  setupResizeObserver()
})

const maxOffset = computed(() => {
  if (!centerWidth.value || !searchContentWidth.value)
    return 0
  return Math.max(0, (centerWidth.value - searchContentWidth.value) / 2)
})

const searchOffset = computed(() => {
  // 略微减弱左右宽度补偿，为搜索框右侧的切换器和功能组留出呼吸空间
  const desired = (rightWidth.value - leftWidth.value) * 0.3
  const limit = maxOffset.value
  if (!limit)
    return 0
  return Math.min(Math.max(desired, -limit), limit)
})

function refreshSearchContent() {
  const el = searchSection.value?.querySelector<HTMLElement>('[data-top-bar-search-content]')
  searchContent.value = el ?? null
  searchContentWidth.value = el?.offsetWidth ?? 0
}
</script>

<template>
  <main
    class="top-bar-header"
    max-w="$bew-top-bar-max-width"
    grid="~ cols-[auto_1fr_auto] items-center gap-4"
    p="x-4 md:x-6 xl:x-8" m-auto
    h="$bew-top-bar-height"
  >
    <!-- Top bar mask -->
    <Transition name="fade">
      <div
        v-if="!reachTop && settings.enableFrostedGlass"
        style="
          mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1), rgba(0, 0, 0, 1) 24px, rgba(0, 0, 0, 0.9) 44px, transparent);
          -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1), rgba(0, 0, 0, 1) 24px, rgba(0, 0, 0, 0.9) 44px, transparent);
        "
        pos="absolute top-0 left-0" w-full h="$bew-top-bar-height"
        pointer-events-none
        :style="{
          backgroundColor: settings.enableFrostedGlass ? 'transparent' : 'var(--bew-bg)',
          opacity: settings.enableFrostedGlass ? 1 : 0.9,
          backdropFilter: settings.enableFrostedGlass ? 'var(--bew-filter-glass-1)' : 'none',
        }"
      />
    </Transition>

    <div
      pos="absolute top-0 left-0" w-full
      pointer-events-none opacity-100 duration-300
      :style="{
        background: `linear-gradient(to bottom, ${
          forceWhiteIcon
            ? 'rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.4) calc(var(--bew-top-bar-height) / 2)'
            : 'color-mix(in oklab, var(--bew-bg), transparent 20%), color-mix(in oklab, var(--bew-bg), transparent 40%) calc(var(--bew-top-bar-height) / 2)'
        }, transparent)`,
        opacity: reachTop ? 0.8 : 1,
        height: 'var(--bew-top-bar-height)',
      }"
    />

    <!-- Top bar theme color gradient -->
    <Transition name="fade">
      <div
        v-if="settings.showTopBarThemeColorGradient && !forceWhiteIcon && reachTop && isDark"
        pos="absolute top-0 left-0" w-full h="$bew-top-bar-height" pointer-events-none
        :style="{ background: 'linear-gradient(to bottom, var(--bew-theme-color-10), transparent)' }"
      />
    </Transition>

    <div ref="leftSection" class="top-bar-header__side top-bar-header__side--left">
      <TopBarLogo :force-white-icon="forceWhiteIcon" />
    </div>

    <!-- search bar -->
    <div
      ref="searchSection"
      class="top-bar-header__search"
      :style="{ transform: `translateX(${searchOffset}px)` }"
    >
      <div
        class="top-bar-header__search-content"
        data-top-bar-search-content
      >
        <div
          v-if="showSearchBar"
          class="top-bar-header__search-control"
        >
          <TopBarSearch />
        </div>
      </div>
    </div>

    <!-- right content -->
    <div ref="rightSection" class="top-bar-header__side top-bar-header__side--right">
      <TopBarRight
        @notifications-click="handleNotificationsItemClick"
      />
    </div>

    <div
      class="top-bar-header__divider"
      :class="{
        'top-bar-header__divider--visible': !reachTop,
        'top-bar-header__divider--white': forceWhiteIcon,
      }"
    />
  </main>
</template>

<style scoped lang="scss">
.top-bar-header {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.top-bar-header__divider {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  pointer-events: none;
  background: color-mix(in oklab, var(--bew-border-color), transparent 35%);
  opacity: 0;
  transform: scaleX(0.96);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;

  &--visible {
    opacity: 0.65;
    transform: scaleX(1);
  }

  &--white {
    background: rgba(255, 255, 255, 0.16);
  }
}

.top-bar-header__side {
  display: flex;
  align-items: center;
  min-width: 0;
}

.top-bar-header__side--left {
  justify-self: start;
}

.top-bar-header__side--right {
  justify-self: end;
  gap: 8px;
}

.top-bar-header__search {
  display: flex;
  justify-content: center;
  min-width: 0;
  transition: transform 0.2s ease;
}

.top-bar-header__search-content {
  display: flex;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: center;
}

.top-bar-header__search-control {
  width: 100%;
  max-width: clamp(520px, 40vw, 720px);
  min-width: 0;
  flex: 1 1 auto;
}

@media (max-width: 640px) {
  .top-bar-header {
    gap: 8px;
    padding-inline: 8px;
  }
}
</style>
