<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useThrottleFn } from '@vueuse/core'

import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { OVERLAY_SCROLL_BAR_SCROLL, TOP_BAR_VISIBILITY_CHANGE } from '~/constants/globalEvents'
import { gridLayout, settings } from '~/logic'
import type { HomeTab } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import emitter from '~/utils/mitt'

import VersionReminder from './components/VersionReminder.vue'
import type { GridLayoutIcon } from './types'
import { HomeSubPage } from './types'

const mainStore = useMainStore()
const {
  handleBackToTop,
  homeActivatedPage,
  homeActivatedPageTouched,
  isHomeTabSwitching,
  scrollViewportRef,
} = useBewlyApp()
const handleThrottledBackToTop = useThrottleFn((targetScrollTop: number = 0) => handleBackToTop(targetScrollTop), 1000)

// ✅ 性能优化：缓存 scrollTop 值，避免重复 DOM 读取
const cachedScrollTop = ref(0)
const tabScrollPositions = new Map<HomeSubPage, number>()
let pendingTabScrollTop: number | null = null

// 使用全局的homeActivatedPage状态
const activatedPage = homeActivatedPage
// KeepAlive 依赖稳定的组件类型，不能在 computed 内重复创建异步组件包装器。
const forYouPage = defineAsyncComponent(() => import('./components/ForYou.vue'))
const followingPage = defineAsyncComponent(() => import('./components/Following.vue'))
const followingOldPage = defineAsyncComponent(() => import('./components/FollowingOld.vue'))
const subscribedSeriesPage = defineAsyncComponent(() => import('./components/SubscribedSeries.vue'))
const trendingPage = defineAsyncComponent(() => import('./components/Trending.vue'))
const rankingPage = defineAsyncComponent(() => import('./components/Ranking.vue'))
const preciousPage = defineAsyncComponent(() => import('./components/Precious.vue'))
const weeklyPage = defineAsyncComponent(() => import('./components/Weekly.vue'))
const livePage = defineAsyncComponent(() => import('./components/Live.vue'))
const pages = computed(() => ({
  [HomeSubPage.ForYou]: forYouPage,
  [HomeSubPage.Following]: settings.value.useFollowingNewLayout
    ? followingPage
    : followingOldPage,
  [HomeSubPage.SubscribedSeries]: subscribedSeriesPage,
  [HomeSubPage.Trending]: trendingPage,
  [HomeSubPage.Ranking]: rankingPage,
  [HomeSubPage.Precious]: preciousPage,
  [HomeSubPage.Weekly]: weeklyPage,
  [HomeSubPage.Live]: livePage,
}))
const activatedPageCacheKey = computed(() => activatedPage.value === HomeSubPage.Following
  ? `${activatedPage.value}:${settings.value.useFollowingNewLayout ? 'new' : 'old'}`
  : activatedPage.value)
const tabContentLoading = ref<boolean>(false)
const currentTabs = ref<HomeTab[]>([])
const tabPageRef = ref()
const topBarVisibility = ref<boolean>(true)
const shouldShowHomeTabs = computed(() => currentTabs.value.length > 1)
const shouldShowHomeHeader = computed(() => shouldShowHomeTabs.value || settings.value.enableGridLayoutSwitcher)
const gridLayoutIcons = computed((): GridLayoutIcon[] => {
  return [
    { icon: 'mingcute:table-3-line', iconActivated: 'mingcute:table-3-fill', value: 'adaptive' },
    { icon: 'mingcute:layout-grid-line', iconActivated: 'mingcute:layout-grid-fill', value: 'twoColumns' },
    { icon: 'mingcute:list-check-3-line', iconActivated: 'mingcute:list-check-3-fill', value: 'oneColumn' },
  ]
})

const tabsIndicatorRef = ref<InstanceType<typeof LiquidSegmentIndicator> | null>(null)
const gridIndicatorRef = ref<InstanceType<typeof LiquidSegmentIndicator> | null>(null)

watch(currentTabs, () => {
  void tabsIndicatorRef.value?.updateIndicator(true)
})

watch(() => settings.value.enableGridLayoutSwitcher, (enabled) => {
  if (enabled)
    void gridIndicatorRef.value?.updateIndicator(true)
})

function getInitialTabScrollTop(): number {
  return settings.value.useSearchPageModeOnHomePage ? 510 : 0
}

function restoreTabScrollPosition() {
  if (pendingTabScrollTop === null)
    return

  const viewport = scrollViewportRef.value
  if (viewport)
    viewport.scrollTop = pendingTabScrollTop

  pendingTabScrollTop = null
}

function finishTabSwitch() {
  // Also restore here as a safeguard for transitions that skip the enter hook.
  restoreTabScrollPosition()
  requestAnimationFrame(() => {
    isHomeTabSwitching.value = false
  })
}

watch(activatedPage, (newPage, oldPage) => {
  const viewport = scrollViewportRef.value
  if (!viewport)
    return

  tabScrollPositions.set(oldPage, viewport.scrollTop)
  pendingTabScrollTop = tabScrollPositions.get(newPage) ?? getInitialTabScrollTop()
  isHomeTabSwitching.value = true
}, { flush: 'sync' })

// 使用deep监听
watch(() => settings.value.homePageTabVisibilityList, () => {
  syncCurrentTabs()
}, { deep: true })

function handleOverlayScroll(scrollTop: number) {
  cachedScrollTop.value = scrollTop
}

function handleTopBarVisibilityChange(visible: boolean) {
  topBarVisibility.value = visible
}

function computeTabs(): HomeTab[] {
  // if homePageTabVisibilityList not fresh , set it to default
  if (!settings.value.homePageTabVisibilityList.length || settings.value.homePageTabVisibilityList.length !== mainStore.homeTabs.length)
    settings.value.homePageTabVisibilityList = mainStore.homeTabs.map(tab => ({ page: tab.page, visible: tab.page !== HomeSubPage.Precious }))

  const targetTabs: HomeTab[] = []

  for (const tab of settings.value.homePageTabVisibilityList) {
    if (tab.visible) {
      targetTabs.push({
        i18nKey: (mainStore.homeTabs.find(defaultTab => defaultTab.page === tab.page) || {})?.i18nKey || tab.page,
        page: tab.page,
      })
    }
  }

  return targetTabs
}

function syncCurrentTabs() {
  const nextTabs = computeTabs()
  currentTabs.value = nextTabs

  const fallbackPage = nextTabs[0]?.page || mainStore.homeTabs[0].page
  if (!nextTabs.some(tab => tab.page === activatedPage.value)) {
    activatedPage.value = fallbackPage
    homeActivatedPage.value = fallbackPage
  }
}

onMounted(() => {
  // ✅ 性能优化：订阅滚动事件以缓存 scrollTop，避免后续 DOM 读取
  emitter.on(OVERLAY_SCROLL_BAR_SCROLL, handleOverlayScroll)
  emitter.on(TOP_BAR_VISIBILITY_CHANGE, handleTopBarVisibilityChange)

  syncCurrentTabs()
})

onUnmounted(() => {
  emitter.off(TOP_BAR_VISIBILITY_CHANGE, handleTopBarVisibilityChange)
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, handleOverlayScroll)
  isHomeTabSwitching.value = false
})

function handleChangeTab(tab: HomeTab) {
  homeActivatedPageTouched.value = true

  if (activatedPage.value === tab.page) {
    const scrollTop = scrollViewportRef.value?.scrollTop ?? cachedScrollTop.value

    if ((!settings.value.useSearchPageModeOnHomePage && scrollTop > 0) || (settings.value.useSearchPageModeOnHomePage && scrollTop > 510)) {
      handleThrottledBackToTop(settings.value.useSearchPageModeOnHomePage ? 510 : 0)
    }
    else {
      if (tabContentLoading.value)
        return
      if (tabPageRef.value)
        tabPageRef.value.initData()
    }
    return
  }
  if (tabContentLoading.value)
    toggleTabContentLoading(false)

  activatedPage.value = tab.page
  // Update global home activated page state
  homeActivatedPage.value = tab.page
}

function toggleTabContentLoading(loading: boolean) {
  tabContentLoading.value = loading
}
</script>

<template>
  <div pos="relative">
    <!-- Home search page mode background -->
    <Transition name="bg">
      <div
        v-if="settings.useSearchPageModeOnHomePage && settings.individuallySetSearchPageWallpaper"
        pos="absolute" w-screen h-580px z-0
        :style="{
          left: '50%',
          transform: 'translateX(-50%)',
          top: 'calc(-1 * (var(--bew-top-bar-height) + 10px))',
        }"
      >
        <div
          pos="absolute left-0 top-0" w-full h-inherit bg="cover center" z-1
          pointer-events-none
          :style="{
            backgroundImage: `url('${settings.searchPageWallpaper}')`,
            backgroundAttachment: settings.searchPageModeWallpaperFixed ? 'fixed' : 'unset',
          }"
        />
        <!-- background mask -->
        <Transition name="fade">
          <div
            v-if="(!settings.individuallySetSearchPageWallpaper && settings.enableWallpaperMasking) || (settings.searchPageEnableWallpaperMasking)"
            pos="relative left-0 top-0" w-full h-inherit pointer-events-none
            z-1
            :style="{
              backdropFilter: `blur(${settings.individuallySetSearchPageWallpaper ? settings.searchPageWallpaperBlurIntensity : settings.wallpaperBlurIntensity}px)`,
            }"
          >
            <div
              bg="$bew-homepage-bg" pos="absolute top-0 left-0" w-full h-full
              :style="{
                opacity: `${settings.searchPageWallpaperMaskOpacity}%`,
              }"
            />
          </div>
        </Transition>
      </div>
    </Transition>

    <main>
      <!-- Home search page mode content -->
      <Transition name="content">
        <div
          v-if="settings.useSearchPageModeOnHomePage"
          flex="~ col"
          justify-center
          items-center relative
          w-full z-10 mb-4
          h-500px
          pointer-events-none
        >
          <Logo
            v-if="settings.searchPageShowLogo" :size="180" :color="settings.searchPageLogoColor === 'white' ? 'white' : 'var(--bew-theme-color)'"
            :glow="settings.searchPageLogoGlow"
            m="t--70px b-12" z-1
          />
          <SearchBar
            pointer-events-auto
            :darken-on-focus="settings.searchPageDarkenOnSearchFocus"
            :blurred-on-focus="settings.searchPageBlurredOnSearchFocus"
            :focused-character="settings.searchPageSearchBarFocusCharacter"
          />
        </div>
      </Transition>

      <header
        v-if="shouldShowHomeHeader"
        class="home-header"
        :class="{
          'home-header-fixed': settings.fixedHomeTabsOnHomePage,
        }"
        w-full z-9
      >
        <section
          v-if="shouldShowHomeTabs"
          class="glass-panel home-tabs-panel bew-segment-control bew-segment-control--surface"
          :class="{
            'bew-segment-control--static': !settings.enableLiquidSegmentIndicator,
            'bew-segment-control--solid': !settings.enableFrostedGlass,
          }"
        >
          <div class="home-tabs-scroll" h-full of-x-auto of-y-hidden>
            <div
              class="home-tabs-inside" flex="~ items-center" h-inherit w-max
              box-border
            >
              <LiquidSegmentIndicator
                v-if="settings.enableLiquidSegmentIndicator"
                ref="tabsIndicatorRef"
                :active-key="activatedPage"
              />
              <button
                v-for="tab in currentTabs" :key="tab.page"
                class="home-tab-button bew-segment-control__item bew-segment-control__item--wide"
                data-segment-item
                :data-active="activatedPage === tab.page ? 'true' : undefined"
                flex="~ gap-2 items-center shrink-0" relative
                @click="handleChangeTab(tab)"
              >
                <span class="text-center">{{ $t(tab.i18nKey) }}</span>
              </button>
            </div>
          </div>
        </section>

        <div
          v-if="settings.enableGridLayoutSwitcher"
          class="glass-panel home-grid-layout-switcher bew-segment-control bew-segment-control--surface"
          :class="{
            'bew-segment-control--static': !settings.enableLiquidSegmentIndicator,
            'bew-segment-control--solid': !settings.enableFrostedGlass,
          }"
          flex="~ shrink-0 items-center"
          box-border
        >
          <LiquidSegmentIndicator
            v-if="settings.enableLiquidSegmentIndicator"
            ref="gridIndicatorRef"
            :active-key="gridLayout.home"
          />
          <button
            v-for="icon in gridLayoutIcons" :key="icon.value"
            type="button"
            class="home-grid-layout-item bew-segment-control__item bew-segment-control__item--icon"
            data-segment-item
            :data-active="gridLayout.home === icon.value ? 'true' : undefined"
            :aria-pressed="gridLayout.home === icon.value"
            :title="icon.value"
            @click="gridLayout.home = icon.value"
          >
            <Icon
              class="home-grid-layout-item__icon bew-segment-control__icon"
              :icon="gridLayout.home === icon.value ? icon.iconActivated : icon.icon"
              aria-hidden="true"
            />
          </button>
        </div>
      </header>

      <Transition
        name="home-tab"
        mode="out-in"
        @enter="restoreTabScrollPosition"
        @after-enter="finishTabSwitch"
      >
        <KeepAlive :max="3">
          <Component
            :is="pages[activatedPage]" :key="activatedPageCacheKey"
            ref="tabPageRef"
            :grid-layout="gridLayout.home"
            :top-bar-visibility="topBarVisibility"
            @before-loading="toggleTabContentLoading(true)"
            @after-loading="toggleTabContentLoading(false)"
          />
        </KeepAlive>
      </Transition>
    </main>

    <VersionReminder />
  </div>
</template>

<style scoped lang="scss">
.bg-enter-active,
.bg-leave-active {
  --uno: "duration-500 ease-in-out";
}
.bg-enter-from,
.bg-leave-to {
  --uno: "h-100vh";
}
.bg-leave-to {
  --uno: "hidden";
}

.content-enter-active,
.content-leave-active {
  --uno: "duration-500 ease-in-out";
}
.content-enter-from,
.content-leave-to {
  --uno: "opacity-0 h-100vh";
}
.content-leave-to {
  --uno: "hidden";
}

.home-tab-enter-active,
.home-tab-leave-active {
  transition: opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
}

.home-tab-enter-from,
.home-tab-leave-to {
  opacity: 0;
}

.glass-panel {
  /* 毛玻璃关闭时 --bew-filter-glass-1 为 none；同时配合 --solid 去掉 surface 上的 filter */
  backdrop-filter: var(--bew-filter-glass-1);
  /* 关键优化：绘制隔离，防止重绘传播 */
  contain: paint layout;
  /* 创建独立堆叠上下文，减少合成压力 */
  isolation: isolate;
}

.glass-panel.bew-segment-control--solid {
  backdrop-filter: none;
}

.home-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--bew-space-4);
  margin-bottom: var(--bew-space-4);
}

.home-tabs-panel {
  grid-column: 1;
  max-width: 100%;
  justify-self: start;
}

.home-grid-layout-switcher {
  grid-column: 2;
  justify-self: end;
}

.home-grid-layout-item {
  &__icon {
    pointer-events: none;
  }
}

.home-tabs-scroll {
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.home-tabs-inside {
  position: relative;
  box-sizing: border-box;
  gap: var(--bew-control-gap);
}

.home-header-fixed {
  --uno: "sticky top-[calc(var(--bew-top-bar-height)+10px)]";
}

@media (prefers-reduced-motion: reduce) {
  .home-tab-enter-active,
  .home-tab-leave-active {
    transition: opacity 1ms linear;
  }
}
</style>
