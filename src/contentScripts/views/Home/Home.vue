<script setup lang="ts">
import { useThrottleFn } from '@vueuse/core'

import { useBewlyApp } from '~/composables/useAppProvider'
import { OVERLAY_SCROLL_BAR_SCROLL, TOP_BAR_VISIBILITY_CHANGE } from '~/constants/globalEvents'
import { gridLayout, LIQUID_GLASS_TINT_DEFAULT_PERCENT, LIQUID_GLASS_TINT_MAX_PERCENT, LIQUID_GLASS_TINT_MIN_PERCENT, settings } from '~/logic'
import type { HomeTab } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { createPillDisplacementMap } from '~/utils/liquidGlass'
import emitter from '~/utils/mitt'

import VersionReminder from './components/VersionReminder.vue'
import type { GridLayoutIcon } from './types'
import { HomeSubPage } from './types'

const mainStore = useMainStore()
const { handleBackToTop, homeActivatedPage, homeActivatedPageTouched } = useBewlyApp()
const handleThrottledBackToTop = useThrottleFn((targetScrollTop: number = 0) => handleBackToTop(targetScrollTop), 1000)

// ✅ 性能优化：缓存 scrollTop 值，避免重复 DOM 读取
const cachedScrollTop = ref(0)

// 使用全局的homeActivatedPage状态
const activatedPage = homeActivatedPage
const pages = computed(() => ({
  [HomeSubPage.ForYou]: defineAsyncComponent(() => import('./components/ForYou.vue')),
  [HomeSubPage.Following]: settings.value.useFollowingNewLayout
    ? defineAsyncComponent(() => import('./components/Following.vue'))
    : defineAsyncComponent(() => import('./components/FollowingOld.vue')),
  [HomeSubPage.SubscribedSeries]: defineAsyncComponent(() => import('./components/SubscribedSeries.vue')),
  [HomeSubPage.Trending]: defineAsyncComponent(() => import('./components/Trending.vue')),
  [HomeSubPage.Ranking]: defineAsyncComponent(() => import('./components/Ranking.vue')),
  [HomeSubPage.Precious]: defineAsyncComponent(() => import('./components/Precious.vue')),
  [HomeSubPage.Weekly]: defineAsyncComponent(() => import('./components/Weekly.vue')),
  [HomeSubPage.Live]: defineAsyncComponent(() => import('./components/Live.vue')),
}))
const showSearchPageMode = ref<boolean>(false)
const tabContentLoading = ref<boolean>(false)
const currentTabs = ref<HomeTab[]>([])
const tabPageRef = ref()
const topBarVisibility = ref<boolean>(true)
const shouldShowHomeTabs = computed(() => currentTabs.value.length > 1)
const shouldShowHomeHeader = computed(() => shouldShowHomeTabs.value || settings.value.enableGridLayoutSwitcher)
const shouldShowFixedTabsBackground = computed(() => {
  return settings.value.fixedHomeTabsOnHomePage && cachedScrollTop.value > 8
})
const supportsHomeLiquidGlassRefraction = typeof CSS !== 'undefined'
  && (
    CSS.supports('backdrop-filter', 'url("#bew-home-tab-liquid-glass-filter")')
    || CSS.supports('-webkit-backdrop-filter', 'url("#bew-home-tab-liquid-glass-filter")')
  )

interface HomeLiquidGlassMap {
  height: number
  href: string
  width: number
}

const homeHeaderRef = ref<HTMLElement>()
const homeTabLiquidGlassMap = shallowRef<HomeLiquidGlassMap>()
const homeGridLiquidGlassMap = shallowRef<HomeLiquidGlassMap>()
const homeLiquidGlassMapCache = new Map<string, string>()
const HOME_LIQUID_GLASS_MAP_CACHE_LIMIT = 24
let homeLiquidGlassResizeObserver: ResizeObserver | undefined
let homeLiquidGlassUpdateFrame: number | undefined

function clampLiquidGlassTint(value: number) {
  return Math.min(
    LIQUID_GLASS_TINT_MAX_PERCENT,
    Math.max(LIQUID_GLASS_TINT_MIN_PERCENT, Number.isFinite(value) ? value : LIQUID_GLASS_TINT_DEFAULT_PERCENT),
  )
}

const homeLiquidGlassRefractionScale = 3.5
const homeLiquidGlassStyle = computed(() => {
  const tint = clampLiquidGlassTint(settings.value.liquidGlassTintIntensity) / 100
  const surfaceAlpha = 0.06 + tint * 0.05
  const themeAlpha = 0.005 + tint * 0.025

  return {
    '--bew-home-liquid-glass-surface': `color-mix(in oklab, var(--bew-elevated), transparent ${(100 - surfaceAlpha * 100).toFixed(2)}%)`,
    '--bew-home-liquid-glass-theme-tint': `color-mix(in oklab, var(--bew-theme-color), transparent ${(100 - themeAlpha * 100).toFixed(2)}%)`,
    '--bew-home-liquid-glass-rim-opacity': '0.190',
    '--bew-home-liquid-glass-focus-alpha': (0.075 + tint * 0.055).toFixed(3),
  }
})
const shouldUseHomeLiquidGlassRefraction = computed(() => {
  return settings.value.enableLiquidGlass
    && supportsHomeLiquidGlassRefraction
    && Boolean(homeTabLiquidGlassMap.value || homeGridLiquidGlassMap.value)
})

function createElementLiquidGlassMap(
  element: HTMLElement | null,
  currentMap: HomeLiquidGlassMap | undefined,
): HomeLiquidGlassMap | undefined {
  if (!element)
    return undefined

  const rect = element.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))

  if (currentMap?.width === width && currentMap.height === height)
    return currentMap

  const cacheKey = `${width}x${height}`
  const cachedHref = homeLiquidGlassMapCache.get(cacheKey)
  if (cachedHref) {
    homeLiquidGlassMapCache.delete(cacheKey)
    homeLiquidGlassMapCache.set(cacheKey, cachedHref)
    return { height, href: cachedHref, width }
  }

  const href = createPillDisplacementMap(width, height)
  if (href) {
    const oldestKey = homeLiquidGlassMapCache.keys().next().value
    if (homeLiquidGlassMapCache.size >= HOME_LIQUID_GLASS_MAP_CACHE_LIMIT && oldestKey !== undefined)
      homeLiquidGlassMapCache.delete(oldestKey)
    homeLiquidGlassMapCache.set(cacheKey, href)
  }

  return href ? { height, href, width } : undefined
}

function updateHomeLiquidGlassMaps() {
  homeLiquidGlassUpdateFrame = undefined
  const header = homeHeaderRef.value
  homeTabLiquidGlassMap.value = createElementLiquidGlassMap(
    header?.querySelector<HTMLElement>('.tab-activated') ?? null,
    homeTabLiquidGlassMap.value,
  )
  homeGridLiquidGlassMap.value = createElementLiquidGlassMap(
    header?.querySelector<HTMLElement>('.grid-layout-item-activated') ?? null,
    homeGridLiquidGlassMap.value,
  )
}

function scheduleHomeLiquidGlassMapUpdate() {
  if (homeLiquidGlassUpdateFrame !== undefined)
    return

  if (typeof requestAnimationFrame === 'undefined') {
    updateHomeLiquidGlassMaps()
    return
  }

  homeLiquidGlassUpdateFrame = requestAnimationFrame(updateHomeLiquidGlassMaps)
}

function cancelHomeLiquidGlassMapUpdate() {
  if (homeLiquidGlassUpdateFrame === undefined)
    return

  if (typeof cancelAnimationFrame !== 'undefined')
    cancelAnimationFrame(homeLiquidGlassUpdateFrame)
  homeLiquidGlassUpdateFrame = undefined
}

function refreshHomeLiquidGlassTargets() {
  void nextTick(() => {
    homeLiquidGlassResizeObserver?.disconnect()

    if (!settings.value.enableLiquidGlass || !supportsHomeLiquidGlassRefraction) {
      cancelHomeLiquidGlassMapUpdate()
      homeTabLiquidGlassMap.value = undefined
      homeGridLiquidGlassMap.value = undefined
      return
    }

    const header = homeHeaderRef.value
    const activeTab = header?.querySelector<HTMLElement>('.tab-activated') ?? null
    const activeGridItem = header?.querySelector<HTMLElement>('.grid-layout-item-activated') ?? null

    if (typeof ResizeObserver !== 'undefined') {
      homeLiquidGlassResizeObserver ??= new ResizeObserver(scheduleHomeLiquidGlassMapUpdate)
      if (activeTab)
        homeLiquidGlassResizeObserver.observe(activeTab)
      if (activeGridItem)
        homeLiquidGlassResizeObserver.observe(activeGridItem)
    }

    scheduleHomeLiquidGlassMapUpdate()
  })
}
const gridLayoutIcons = computed((): GridLayoutIcon[] => {
  return [
    { icon: 'i-mingcute:table-3-line', iconActivated: 'i-mingcute:table-3-fill', value: 'adaptive' },
    { icon: 'i-mingcute:layout-grid-line', iconActivated: 'i-mingcute:layout-grid-fill', value: 'twoColumns' },
    { icon: 'i-mingcute:list-check-3-line', iconActivated: 'i-mingcute:list-check-3-fill', value: 'oneColumn' },
  ]
})

// 使用deep监听
watch(() => settings.value.homePageTabVisibilityList, () => {
  syncCurrentTabs()
}, { deep: true })

watch(
  [
    () => settings.value.enableLiquidGlass,
    () => settings.value.enableGridLayoutSwitcher,
    () => activatedPage.value,
    () => gridLayout.value.home,
    () => currentTabs.value.map(tab => tab.page).join('|'),
  ],
  refreshHomeLiquidGlassTargets,
  { flush: 'post' },
)

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
  showSearchPageMode.value = true

  // ✅ 性能优化：订阅滚动事件以缓存 scrollTop，避免后续 DOM 读取
  emitter.on(OVERLAY_SCROLL_BAR_SCROLL, handleOverlayScroll)
  emitter.on(TOP_BAR_VISIBILITY_CHANGE, handleTopBarVisibilityChange)

  syncCurrentTabs()
  refreshHomeLiquidGlassTargets()
})

onUnmounted(() => {
  homeLiquidGlassResizeObserver?.disconnect()
  cancelHomeLiquidGlassMapUpdate()
  homeLiquidGlassMapCache.clear()
  emitter.off(TOP_BAR_VISIBILITY_CHANGE, handleTopBarVisibilityChange)
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, handleOverlayScroll)
})

function handleChangeTab(tab: HomeTab) {
  homeActivatedPageTouched.value = true

  if (activatedPage.value === tab.page) {
    // ✅ 性能优化：使用缓存的 scrollTop，避免 DOM 读取
    const scrollTop = cachedScrollTop.value

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
  else {
    handleThrottledBackToTop(settings.value.useSearchPageModeOnHomePage ? 510 : 0)
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
    <svg
      v-if="shouldUseHomeLiquidGlassRefraction"
      class="home-liquid-glass-definitions"
      width="0"
      height="0"
      aria-hidden="true"
    >
      <defs>
        <filter
          v-if="homeTabLiquidGlassMap"
          id="bew-home-tab-liquid-glass-filter"
          x="-8"
          y="-8"
          :width="homeTabLiquidGlassMap.width + 16"
          :height="homeTabLiquidGlassMap.height + 16"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feImage
            :href="homeTabLiquidGlassMap.href"
            x="0"
            y="0"
            :width="homeTabLiquidGlassMap.width"
            :height="homeTabLiquidGlassMap.height"
            preserveAspectRatio="none"
            result="displacement-map"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="displacement-map"
            :scale="homeLiquidGlassRefractionScale"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter
          v-if="homeGridLiquidGlassMap"
          id="bew-home-grid-liquid-glass-filter"
          x="-8"
          y="-8"
          :width="homeGridLiquidGlassMap.width + 16"
          :height="homeGridLiquidGlassMap.height + 16"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feImage
            :href="homeGridLiquidGlassMap.href"
            x="0"
            y="0"
            :width="homeGridLiquidGlassMap.width"
            :height="homeGridLiquidGlassMap.height"
            preserveAspectRatio="none"
            result="displacement-map"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="displacement-map"
            :scale="homeLiquidGlassRefractionScale"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>

    <!-- Home search page mode background -->
    <Transition name="bg">
      <div
        v-if="settings.useSearchPageModeOnHomePage && settings.individuallySetSearchPageWallpaper && showSearchPageMode"
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
            pos="relative left-0 top-0" w-full h-inherit pointer-events-none duration-300
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
          v-if="settings.useSearchPageModeOnHomePage && showSearchPageMode"
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
        ref="homeHeaderRef"
        class="home-header"
        :class="{
          'home-header--tabs-left': settings.homeTabsPosition === 'left',
          'home-header-fixed': settings.fixedHomeTabsOnHomePage,
          'home-header--liquid-glass': settings.enableLiquidGlass,
          'home-header--liquid-glass-refraction': shouldUseHomeLiquidGlassRefraction,
        }"
        :style="homeLiquidGlassStyle"
        w-full z-9 duration-300 ease-in-out
      >
        <section
          v-if="shouldShowHomeTabs"
          class="glass-panel home-tabs-panel"
          :class="{ 'home-tabs-panel--scrolled': shouldShowFixedTabsBackground }"
          h-40px
        >
          <div class="home-tabs-scroll" h-full of-x-auto of-y-hidden>
            <div
              class="home-tabs-inside" flex="~ items-center gap-1" h-inherit w-max p-2px
              box-border
            >
              <button
                v-for="tab in currentTabs" :key="tab.page"
                class="home-tab-button"
                :class="{ 'tab-activated': activatedPage === tab.page }"
                px-4 h-full
                bg="transparent hover:$bew-fill-1" text="$bew-text-2 hover:$bew-text-1" rounded-full
                cursor-pointer
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
          class="glass-panel home-grid-layout-switcher"
          flex="~ gap-1 shrink-0" p-1 h-38px
          rounded-full
          box-border border="1 $bew-border-color"
        >
          <div
            v-for="icon in gridLayoutIcons" :key="icon.value"
            :class="{ 'grid-layout-item-activated': gridLayout.home === icon.value }"
            flex="~ justify-center items-center"
            h-full aspect-square text="$bew-text-2 hover:$bew-text-1"
            rounded-full bg="hover:$bew-fill-2" duration-300
            cursor-pointer
            @click="gridLayout.home = icon.value"
          >
            <div :class="gridLayout.home === icon.value ? icon.iconActivated : icon.icon" text-base />
          </div>
        </div>
      </header>

      <Transition name="page-fade">
        <KeepAlive :max="3">
          <Component
            :is="pages[activatedPage]" :key="activatedPage"
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
  --uno: "duration-1000 ease-in-out";
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
  --uno: "duration-1000 ease-in-out";
}
.content-enter-from,
.content-leave-to {
  --uno: "opacity-0 h-100vh";
}
.content-leave-to {
  --uno: "hidden";
}

.glass-panel {
  background-image: var(--bew-liquid-glass-surface-image);
  backdrop-filter: var(--bew-filter-glass-1);
  /* 关键优化：绘制隔离，防止重绘传播 */
  contain: paint layout;
  /* 创建独立堆叠上下文，减少合成压力 */
  isolation: isolate;
}

.home-liquid-glass-definitions {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
}

.home-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: start;
  gap: 16px;
  margin-bottom: 20px;
}

.home-tabs-panel {
  grid-column: 2;
  max-width: calc(100vw - 320px);
  justify-self: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 9999px;
  box-shadow: none;
  box-sizing: border-box;
  backdrop-filter: none;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    backdrop-filter 0.2s ease;
}

.home-header--tabs-left {
  grid-template-columns: minmax(0, 1fr) auto;

  .home-tabs-panel {
    grid-column: 1;
    max-width: 100%;
    justify-self: start;
  }

  .home-grid-layout-switcher {
    grid-column: 2;
  }
}

.home-tabs-panel--scrolled {
  border-color: color-mix(in oklab, var(--bew-border-color), transparent 24%);
  background: color-mix(in oklab, var(--bew-elevated), transparent 18%);
  background-image: var(--bew-liquid-glass-surface-image);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    var(--bew-liquid-shadow-control);
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
  backdrop-filter: var(--bew-filter-glass-1);
}

.home-grid-layout-switcher {
  grid-column: 3;
  justify-self: end;
  border-color: color-mix(in oklab, var(--bew-border-color), transparent 24%);
  background: color-mix(in oklab, var(--bew-elevated), transparent 28%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    var(--bew-liquid-shadow-subtle);
}

.home-header--liquid-glass {
  .glass-panel {
    --bew-home-liquid-glass-background:
      linear-gradient(145deg, rgb(255 255 255 / 0.1), transparent 46%),
      linear-gradient(
        105deg,
        var(--bew-home-liquid-glass-surface),
        transparent 72%,
        var(--bew-home-liquid-glass-theme-tint)
      );

    position: relative;
    overflow: hidden;
    border-color: color-mix(in oklab, var(--bew-border-color), transparent 48%);
    background: transparent;
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.2),
      inset 0 -1px 0 rgb(0 0 0 / 0.055),
      var(--bew-liquid-shadow-floating);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

  .home-tabs-panel--scrolled {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

  .glass-panel::before {
    position: absolute;
    z-index: 0;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    content: "";
    background: var(--bew-home-liquid-glass-background);
    -webkit-backdrop-filter: var(--bew-filter-glass-1);
    backdrop-filter: var(--bew-filter-glass-1);
  }

  .glass-panel > * {
    position: relative;
    z-index: 2;
  }

  .home-tab-button:not(.tab-activated):hover,
  .home-grid-layout-switcher > div:not(.grid-layout-item-activated):hover {
    background: rgb(255 255 255 / 0.075);
  }

  .tab-activated,
  .grid-layout-item-activated {
    border: 0;
    background: linear-gradient(
      145deg,
      rgb(255 255 255 / var(--bew-home-liquid-glass-focus-alpha)),
      rgb(255 255 255 / 0.018) 58%,
      var(--bew-home-liquid-glass-theme-tint)
    );
    box-shadow:
      inset 0 0 0 1px rgb(255 255 255 / var(--bew-home-liquid-glass-rim-opacity)),
      inset 0 1px 0 rgb(255 255 255 / 0.22),
      inset 0 -1px 0 rgb(0 0 0 / 0.06);
  }
}

.home-header--liquid-glass-refraction {
  .tab-activated {
    -webkit-backdrop-filter: url("#bew-home-tab-liquid-glass-filter") blur(0.75px) saturate(125%);
    backdrop-filter: url("#bew-home-tab-liquid-glass-filter") blur(0.75px) saturate(125%);
  }

  .grid-layout-item-activated {
    -webkit-backdrop-filter: url("#bew-home-grid-liquid-glass-filter") blur(0.75px) saturate(125%);
    backdrop-filter: url("#bew-home-grid-liquid-glass-filter") blur(0.75px) saturate(125%);
  }
}

.home-tabs-scroll {
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.home-tab-button {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.15s ease;
}

.tab-activated {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-20);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    var(--bew-liquid-shadow-focus);
  transform: translateY(-0.5px);
}

.grid-layout-item-activated {
  color: var(--bew-theme-color);
  background: color-mix(in oklab, var(--bew-theme-color), var(--bew-elevated) 82%);
  box-shadow:
    inset 0 0 0 1px var(--bew-theme-color-20),
    var(--bew-liquid-shadow-focus);
  transform: translateY(-0.5px);
}

.home-header-fixed {
  --uno: "sticky top-[calc(var(--bew-top-bar-height)+10px)]";
}

@media (max-width: 1000px) {
  .home-header {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .home-tabs-panel {
    grid-column: 1;
    max-width: 100%;
  }

  .home-header--tabs-left .home-tabs-panel {
    justify-self: start;
  }

  .home-grid-layout-switcher {
    grid-column: 2;
  }
}
</style>
