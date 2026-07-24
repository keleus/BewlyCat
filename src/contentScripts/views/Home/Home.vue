<script setup lang="ts">
import { useThrottleFn } from '@vueuse/core'

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
})

onUnmounted(() => {
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
        class="home-header"
        :class="{
          'home-header--tabs-left': settings.homeTabsPosition === 'left',
          'home-header-fixed': settings.fixedHomeTabsOnHomePage,
        }"
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

                <Transition name="fade">
                  <div
                    v-show="activatedPage === tab.page && tabContentLoading"
                    i-svg-spinners:ring-resize
                    pos="absolute right-4px top-4px" duration-300
                    text="8px $bew-theme-color"
                  />
                </Transition>
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
  backdrop-filter: var(--bew-filter-glass-1);
  /* 关键优化：绘制隔离，防止重绘传播 */
  contain: paint layout;
  /* 创建独立堆叠上下文，减少合成压力 */
  isolation: isolate;
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
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 4px 16px rgb(0 0 0 / 0.08);
  backdrop-filter: var(--bew-filter-glass-1);
}

.home-grid-layout-switcher {
  grid-column: 3;
  justify-self: end;
  border-color: color-mix(in oklab, var(--bew-border-color), transparent 24%);
  background: color-mix(in oklab, var(--bew-elevated), transparent 28%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 3px rgb(0 0 0 / 0.05);
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
    0 2px 6px var(--bew-theme-color-10);
  transform: translateY(-0.5px);
}

.grid-layout-item-activated {
  color: var(--bew-theme-color);
  background: color-mix(in oklab, var(--bew-theme-color), var(--bew-elevated) 82%);
  box-shadow:
    inset 0 0 0 1px var(--bew-theme-color-20),
    0 1px 3px var(--bew-theme-color-10);
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
