<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import type { SettingsMenu, SettingsNavigationTarget } from '~/composables/useAppProvider'
import { useBewlyApp } from '~/composables/useAppProvider'
import { USAGE_GUIDE_URL } from '~/constants/usageGuide'
import { settings } from '~/logic'
import { buildSettingsPageHash } from '~/utils/settingsPage'

import SettingsSearchResults from './components/SettingsSearchResults.vue'
import SettingsSectionHeading from './components/SettingsSectionHeading.vue'
import { createPinnedChannelHistory, pinnedChannelHistoryKey } from './composables/usePinnedChannelHistory'
import { useSettingsNavigation } from './composables/useSettingsNavigation'
import { useSettingsSearch } from './composables/useSettingsSearch'
import { provideSettingsSearchFilter } from './composables/useSettingsSearchFilter'
import { useSettingsSearchNavigation } from './composables/useSettingsSearchNavigation'
import { useSettingsSearchResults } from './composables/useSettingsSearchResults'
import { useSettingsUrlSync } from './composables/useSettingsUrlSync'
import { settingsMenus } from './settingsMenus'
import type { MenuType } from './types'

const pendingNavigation = defineModel<SettingsNavigationTarget | undefined>('pendingNavigation')

const pinnedChannelHistory = createPinnedChannelHistory(computed({
  get: () => settings.value.topBarPinnedChannels,
  set: keys => settings.value.topBarPinnedChannels = keys,
}))
provide(pinnedChannelHistoryKey, pinnedChannelHistory)

const { t } = useI18n()

const navigation = useSettingsNavigation()
const {
  activatedMenuItem,
  activeContent,
  activeMenu,
  activeSecondaryPage,
  expandedMenus,
  getSecondaryPage,
  secondaryGroups,
  toggleMenu,
  visibleMenus,
} = navigation

const searchInputRef = ref<HTMLInputElement>()
const { mainAppRef } = useBewlyApp()

// 鼠标点选后焦点仍留在控件上时，之后的任意按键（包括系统快捷键）都会让浏览器
// 把它判定为键盘聚焦并显示焦点环，因此点击后释放焦点。
const POINTER_RELEASED_FOCUS_SELECTOR = 'a, button, [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"]'
useEventListener(mainAppRef, 'click', (event: MouseEvent) => {
  // 键盘触发的 click 其 detail 为 0，需要保留焦点和焦点环。
  if (event.detail === 0)
    return

  const activeElement = (mainAppRef.value.getRootNode() as ShadowRoot).activeElement
  if (activeElement instanceof HTMLElement && activeElement.matches(POINTER_RELEASED_FOCUS_SELECTOR))
    activeElement.blur()
}, { capture: true })

function focusSettingsSearch() {
  searchInputRef.value?.focus({ preventScroll: true })
}

const scrollViewportRef = ref<HTMLElement>()

watch([activatedMenuItem, activeSecondaryPage], () => {
  scrollViewportRef.value?.scrollTo({ top: 0 })
})

const title = computed(() => t(activeMenu.value.titleKey))
const titleDetail = computed(() => activeSecondaryPage.value ? t(activeSecondaryPage.value.titleKey) : undefined)

const search = useSettingsSearch({ visibleMenus })
const {
  getSearchEntrySecondaryPage,
  getSearchEntryTitle,
  isSearching,
  matchedSearchTitles,
  searchQuery,
  searchResults,
  searchResultsSummary,
} = search

provideSettingsSearchFilter(isSearching, matchedSearchTitles)

const { searchResultSections } = useSettingsSearchResults({
  visibleMenus,
  isSearching,
  searchResults,
  getSearchEntrySecondaryPage,
})

// 搜索结果页和普通页面共用同一个滚动容器，切换模式时回到顶部。
watch(isSearching, () => {
  scrollViewportRef.value?.scrollTo({ top: 0 })
})

// 快捷键分组等 details 默认折叠，结果页里命中的项需要展开才能看到。
watch(searchResults, async () => {
  if (!isSearching.value)
    return
  await nextTick()
  const viewport = scrollViewportRef.value
  if (!viewport)
    return

  for (const match of Array.from(viewport.querySelectorAll('.settings-search-match'))) {
    let ancestor = match.parentElement
    while (ancestor && ancestor !== viewport) {
      if (ancestor instanceof HTMLDetailsElement && !ancestor.open)
        ancestor.open = true
      ancestor = ancestor.parentElement
    }
  }
}, { flush: 'post' })

const searchNavigation = useSettingsSearchNavigation({
  scrollViewportRef,
  searchQuery,
  getSearchEntryTitle,
  getSearchEntrySecondaryPage,
  activateSettingsTarget: navigation.activateSettingsTarget,
})

function navigateToTarget(target: SettingsNavigationTarget) {
  const storageKey = settingsMenus.find(menu => menu.value === target.menu)?.storageKey
  searchNavigation.navigateToSearchResult({
    menu: target.menu as MenuType,
    targetTitleKey: target.targetTitleKey,
    storageValues: target.secondaryPage && storageKey
      ? [{ key: storageKey, value: target.secondaryPage }]
      : undefined,
  })
}

function handleSidebarLinkClick(menu?: MenuType) {
  if (menu)
    expandedMenus.value.add(menu)
  // 侧栏导航视为离开搜索结果页。
  searchQuery.value = ''
}

watch(pendingNavigation, (target) => {
  if (!target)
    return

  navigateToTarget(target)
  pendingNavigation.value = undefined
}, { immediate: true })

function getMenuHref(menu: (typeof visibleMenus.value)[number], secondaryPage = getSecondaryPage(menu)?.value) {
  return buildSettingsPageHash({ menu: menu.value as SettingsMenu, secondaryPage })
}

useSettingsUrlSync(computed(() => getMenuHref(activeMenu.value)), navigateToTarget)

watchEffect(() => {
  document.title = isSearching.value
    ? `${t('settings.search.results_title')} - BewlyCat`
    : `${titleDetail.value ?? title.value} - BewlyCat`
})

const brandIconUrl = browser.runtime.getURL('/assets/icon-512.png')
</script>

<template>
  <div class="settings-page">
    <aside class="settings-sidebar">
      <div class="settings-sidebar__brand">
        <img :src="brandIconUrl" alt="" width="32" height="32">
        <span>BewlyCat</span>
      </div>
      <nav class="settings-sidebar__nav" :aria-label="$t('settings.title')">
        <ul>
          <li
            v-for="menu in visibleMenus"
            :key="menu.value"
            :class="{ 'menu-section-start': menu.sectionStart }"
          >
            <div class="settings-sidebar__row">
              <a
                class="settings-sidebar__item"
                :class="{
                  'settings-sidebar__item--parent': menu.pages,
                  'is-active': !isSearching && menu.value === activeMenu.value && (!menu.pages || !expandedMenus.has(menu.value)),
                  'is-current': !isSearching && menu.value === activeMenu.value,
                }"
                :href="getMenuHref(menu)"
                :aria-current="!isSearching && menu.value === activeMenu.value && !menu.pages ? 'page' : undefined"
                @click="handleSidebarLinkClick(menu.value)"
              >
                <span
                  class="settings-sidebar__icon"
                  :class="!isSearching && menu.value === activeMenu.value ? menu.iconActivated : menu.icon"
                />
                <span>{{ $t(menu.titleKey) }}</span>
              </a>
              <button
                v-if="menu.pages"
                type="button"
                class="settings-sidebar__toggle"
                :aria-label="$t(menu.titleKey)"
                :aria-expanded="expandedMenus.has(menu.value)"
                :aria-controls="`settings-menu-${menu.value}`"
                @click="toggleMenu(menu.value)"
              >
                <span class="settings-sidebar__chevron i-mingcute:down-line" aria-hidden="true" />
              </button>
            </div>

            <div
              v-if="menu.pages"
              :id="`settings-menu-${menu.value}`"
              class="settings-sidebar__children"
              :class="{ 'is-expanded': expandedMenus.has(menu.value) }"
              :inert="!expandedMenus.has(menu.value)"
              :aria-hidden="!expandedMenus.has(menu.value)"
            >
              <div class="settings-sidebar__children-inner">
                <ul>
                  <template v-for="(group, groupIndex) in secondaryGroups.get(menu.value)" :key="group.key ?? groupIndex">
                    <li v-if="group.key" class="settings-sidebar__group-label">
                      {{ $t(group.key) }}
                    </li>
                    <li v-for="page in group.pages" :key="page.value">
                      <a
                        class="settings-sidebar__item settings-sidebar__item--child"
                        :class="{ 'is-active': !isSearching && page === activeSecondaryPage }"
                        :href="getMenuHref(menu, page.value)"
                        :aria-current="!isSearching && page === activeSecondaryPage ? 'page' : undefined"
                        @click="handleSidebarLinkClick()"
                      >
                        <span
                          class="settings-sidebar__icon"
                          :class="!isSearching && page === activeSecondaryPage ? page.iconActivated : page.icon"
                        />
                        <span>{{ $t(page.titleKey) }}</span>
                      </a>
                    </li>
                  </template>
                </ul>
              </div>
            </div>
          </li>
        </ul>
      </nav>
      <a
        class="settings-sidebar__item settings-sidebar__guide"
        :href="USAGE_GUIDE_URL"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="settings-sidebar__icon i-mingcute:question-line" />
        <span>{{ $t('settings.usage_guide') }}</span>
      </a>
    </aside>

    <div class="settings-content">
      <header class="settings-header">
        <nav class="settings-breadcrumb" :aria-label="$t('settings.breadcrumb')">
          <span>{{ $t('settings.title') }}</span>
          <i i-mingcute:right-line />
          <strong>{{ isSearching ? $t('settings.search.results_title') : title }}</strong>
          <template v-if="!isSearching && titleDetail">
            <i i-mingcute:right-line />
            <strong>{{ titleDetail }}</strong>
          </template>
        </nav>
        <div class="settings-search" @click="focusSettingsSearch">
          <i i-mingcute:search-2-line />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="search"
            :placeholder="$t('settings.search.placeholder')"
            :aria-label="$t('settings.search.placeholder')"
            :aria-describedby="isSearching ? 'settings-search-status' : undefined"
            @keydown.esc="searchQuery = ''"
          >
        </div>
      </header>

      <!-- 窄屏时侧栏变为横向，二级菜单在这里单独显示一行。 -->
      <nav
        v-if="activeMenu.pages"
        class="settings-subnav"
        :aria-label="$t('settings.category_navigation')"
      >
        <a
          v-for="page in activeMenu.pages"
          :key="page.value"
          class="settings-sidebar__item settings-sidebar__item--child"
          :class="{ 'is-active': !isSearching && page === activeSecondaryPage }"
          :href="getMenuHref(activeMenu, page.value)"
          :aria-current="!isSearching && page === activeSecondaryPage ? 'page' : undefined"
          @click="handleSidebarLinkClick()"
        >
          <span
            class="settings-sidebar__icon"
            :class="!isSearching && page === activeSecondaryPage ? page.iconActivated : page.icon"
          />
          <span>{{ $t(page.titleKey) }}</span>
        </a>
      </nav>

      <div ref="scrollViewportRef" class="settings-viewport">
        <!-- 按页面重建节点以重播入场动画；旧页立即移除，避免两页文字叠影。 -->
        <main
          :key="isSearching ? 'search-results' : `${activeMenu.value}/${activeSecondaryPage?.value ?? ''}`"
          class="settings-main"
        >
          <template v-if="isSearching">
            <SettingsSearchResults :sections="searchResultSections" :summary="searchResultsSummary" />
          </template>
          <template v-else>
            <SettingsSectionHeading
              v-if="activeSecondaryPage"
              :title="$t(activeSecondaryPage.titleKey)"
              :desc="activeSecondaryPage.descriptionKey ? $t(activeSecondaryPage.descriptionKey) : undefined"
              :icon="activeSecondaryPage.iconActivated"
            />
            <Component :is="activeContent" />
          </template>
        </main>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.settings-page {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  // 设置卡片是半透明白色，需要有底色才能和页面区分。
  background: var(--bew-elevated-alt-solid);
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  min-height: 0;
  // 右侧由滚动条预留位补足，展开多个菜单出现滚动条时菜单宽度不跳动。
  padding: var(--bew-space-5) var(--bew-space-1) var(--bew-space-3) var(--bew-space-3);
  overflow: hidden auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-gutter: stable;
  background: var(--bew-content-solid);
  border-right: 1px solid var(--bew-border-color);
}

.settings-sidebar__brand {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-2);
  align-items: center;
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-display);
  font-weight: var(--bew-font-weight-bold);
  line-height: 32px;

  img {
    flex: 0 0 auto;
    border-radius: var(--bew-radius-md);
  }
}

.settings-sidebar__nav {
  flex: 1 1 auto;

  ul {
    display: flex;
    flex-direction: column;
    gap: var(--bew-space-1);
  }
}

.settings-sidebar__row {
  position: relative;
}

.settings-sidebar__item {
  display: flex;
  box-sizing: border-box;
  gap: var(--bew-space-3);
  align-items: center;
  min-height: 40px;
  padding: var(--bew-space-2) var(--bew-space-3);
  color: var(--bew-text-1);
  border-radius: var(--bew-interactive-radius);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-body);
  text-decoration: none;
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    color var(--bew-duration-normal) var(--bew-ease-standard);

  &:hover:not(.is-active) {
    background: var(--bew-theme-color-10);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: -2px;
  }

  &.is-current {
    font-weight: var(--bew-font-weight-semibold);
  }

  &.is-active {
    background: var(--bew-theme-color-20);
  }

  &.is-current .settings-sidebar__icon,
  &.is-active .settings-sidebar__icon {
    color: var(--bew-theme-color);
  }
}

.settings-sidebar__item--parent {
  padding-right: calc(var(--bew-space-8) + var(--bew-space-2));
}

.settings-sidebar__item--child {
  gap: var(--bew-space-2);
  min-height: 36px;
  padding-block: var(--bew-space-1);
}

.settings-sidebar__children {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard);

  &.is-expanded {
    grid-template-rows: 1fr;
    opacity: 1;
  }
}

.settings-sidebar__children-inner {
  min-height: 0;
  overflow: hidden;

  > ul {
    padding: var(--bew-space-1) 0 var(--bew-space-1) var(--bew-space-4);
  }
}

.settings-sidebar__group-label {
  padding: var(--bew-space-1) var(--bew-space-3) 0;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.settings-sidebar__icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  font-size: var(--bew-icon-size-md);
}

.settings-sidebar__toggle {
  position: absolute;
  top: 50%;
  right: var(--bew-space-1);
  display: grid;
  place-items: center;
  width: var(--bew-space-8);
  height: var(--bew-space-8);
  color: var(--bew-text-2);
  border-radius: var(--bew-interactive-radius);
  transform: translateY(-50%);
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);

  &:hover {
    color: var(--bew-text-1);
    background: var(--bew-theme-color-10);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: -2px;
  }
}

.settings-sidebar__chevron {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  transform: rotate(-90deg);
  transition: transform var(--bew-duration-normal) var(--bew-ease-standard);
}

.settings-sidebar__toggle[aria-expanded="true"] .settings-sidebar__chevron {
  transform: none;
}

.settings-sidebar__guide {
  flex: 0 0 auto;
  color: var(--bew-text-2);
}

.settings-subnav {
  display: none;
}

.menu-section-start {
  position: relative;
  margin-top: var(--bew-space-1);
  padding-top: var(--bew-space-2);

  &::before {
    position: absolute;
    top: 0;
    right: var(--bew-space-3);
    left: var(--bew-space-3);
    height: 1px;
    background: var(--bew-border-color);
    content: "";
  }
}

.settings-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.settings-header {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-4);
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: 64px;
  padding: 0 var(--bew-space-8);
  border-bottom: 1px solid var(--bew-border-color);
}

.settings-viewport {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden auto;
  overflow-anchor: none;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  // 隔离内容控件的层叠上下文，避免滚动内容盖住搜索结果。
  isolation: isolate;
}

.settings-main {
  box-sizing: border-box;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--bew-space-6) var(--bew-space-8) var(--bew-space-12);
  animation: settings-page-enter var(--bew-duration-normal) var(--bew-ease-standard);
}

// 从半透明开始而不是全透明：切换时内容立即可见，只是平滑地变实，不会出现整屏空白。
@keyframes settings-page-enter {
  from {
    opacity: 0.4;
    transform: translateY(var(--bew-space-1));
  }
}

.settings-breadcrumb {
  position: relative;
  z-index: 1;
  display: flex;
  overflow: hidden;
  gap: var(--bew-space-2);
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);

  i {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }

  strong {
    min-width: 0;
    flex: 0 1 auto;
    overflow: hidden;
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-heading);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-heading);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong:last-child {
    flex: 1 1 auto;
  }
}

.settings-search {
  position: relative;
  display: flex;
  box-sizing: border-box;
  align-items: center;
  flex: 0 1 auto;
  width: clamp(180px, 20vw, 320px);
  min-width: 42px;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-content-solid);
  border: 1px solid var(--bew-border-color);
  border-radius: calc(var(--bew-control-height) / 2);
  box-shadow: var(--bew-shadow-edge-glow-1);
  transition:
    width var(--bew-duration-moderate) var(--bew-ease-standard),
    border-radius var(--bew-duration-moderate) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    box-shadow var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);

  &:hover {
    border-color: var(--bew-theme-color-40);
  }

  &:focus-within {
    border-color: var(--bew-theme-color);
    border-radius: var(--bew-radius);
    box-shadow:
      var(--bew-shadow-edge-glow-1),
      0 0 0 2px var(--bew-theme-color);
  }

  > i {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    color: var(--bew-text-2);
    pointer-events: none;
  }

  input {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    margin-left: var(--bew-space-2);
    color: var(--bew-text-1);
    background: transparent;
    border: 0;
    outline: 0;
    font-size: var(--bew-font-size-body);
    font-weight: var(--bew-font-weight-regular);
    line-height: var(--bew-line-height-body);

    &:focus-visible {
      outline: 0;
    }
  }
}

@media (max-width: 900px) {
  .settings-page {
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-sidebar {
    flex-direction: row;
    padding: var(--bew-space-2) var(--bew-space-3);
    overflow: auto hidden;
    scrollbar-width: none;
    scrollbar-gutter: auto;
    border-right: 0;
    border-bottom: 1px solid var(--bew-border-color);
  }

  .settings-sidebar__brand,
  .settings-sidebar__guide,
  .settings-sidebar__toggle {
    display: none;
  }

  .settings-sidebar__nav ul {
    flex-direction: row;
  }

  .settings-sidebar__nav .settings-sidebar__children {
    display: none;
  }

  .settings-sidebar__item {
    white-space: nowrap;

    &.is-current {
      background: var(--bew-theme-color-20);
    }
  }

  .settings-sidebar__item--parent {
    padding-right: var(--bew-space-3);
  }

  .settings-subnav {
    display: flex;
    flex: 0 0 auto;
    gap: var(--bew-space-1);
    padding: var(--bew-space-2) var(--bew-space-3);
    overflow: auto hidden;
    scrollbar-width: none;
    background: var(--bew-content-solid);
    border-bottom: 1px solid var(--bew-border-color);
  }

  .menu-section-start {
    margin-top: 0;
    padding-top: 0;

    &::before {
      display: none;
    }
  }
}

@media (max-width: 760px) {
  .settings-header {
    height: 56px;
    padding: 0 var(--bew-space-4);
  }

  .settings-breadcrumb {
    display: none;
  }

  .settings-search {
    flex: 1 1 auto;
    width: auto;
  }

  .settings-main {
    // 设置卡片向两侧外扩 16px，留出 24px 才不会贴住窗口边缘。
    padding: var(--bew-space-4) var(--bew-space-6) var(--bew-space-10);
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings-sidebar__item,
  .settings-sidebar__toggle,
  .settings-sidebar__chevron,
  .settings-sidebar__children {
    transition: none;
  }

  .settings-main {
    animation: none;
  }
}
</style>
