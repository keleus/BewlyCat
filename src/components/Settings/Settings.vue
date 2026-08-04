<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import { createTransformer } from '~/utils/transformer'

import type { SettingsSearchEntry } from './searchCatalog'
import { settingsSearchEntries } from './searchCatalog'
import type { MenuItem } from './types'
import { MenuType } from './types'

const emit = defineEmits(['close'])

const { t, tm, rt } = useI18n()
const breadcrumbDetail = ref<string>()
const searchQuery = ref('')
const settingsContentKey = ref(0)
const settingsContentReady = ref(false)
let settingsContentFrame: number | undefined

onMounted(() => {
  // 先让设置外壳完成首帧绘制，再挂载异步设置页，避免点击反馈被重组件初始化阻塞。
  settingsContentFrame = requestAnimationFrame(() => {
    settingsContentFrame = requestAnimationFrame(() => {
      settingsContentFrame = undefined
      settingsContentReady.value = true
    })
  })
})

provide('setSettingsBreadcrumb', (detail?: string) => {
  breadcrumbDetail.value = detail
})

const settingsMenu = {
  [MenuType.General]: defineAsyncComponent(() => import('./PluginComponentsAndPages/General/General.vue')),
  [MenuType.BewlyPages]: defineAsyncComponent(() => import('./Navigation/BewlyPages.vue')),
  [MenuType.BewlyComponents]: defineAsyncComponent(() => import('./Navigation/BewlyComponents.vue')),
  [MenuType.Bilibili]: defineAsyncComponent(() => import('./BilibiliFeaturesEnhancement/BilibiliFeaturesEnhancement.vue')),
  [MenuType.Appearance]: defineAsyncComponent(() => import('./Appearance/Appearance.vue')),
  [MenuType.Shortcuts]: defineAsyncComponent(() => import('./Shortcuts/Shortcuts.vue')),
  [MenuType.About]: defineAsyncComponent(() => import('./About/About.vue')),
}
const settingsMenuStorageKey = 'bewly-settings-active-menu'
const navigationPageStorageKey = 'bewly-settings-navigation-page'
const bewlyPagesStorageKey = 'bewly-settings-bewly-pages-page'
const bewlyComponentsStorageKey = 'bewly-settings-bewly-components-page'
const playbackPageStorageKey = 'bewly-settings-playback-page'
const bilibiliPageStorageKey = 'bewly-settings-bilibili-page'
const storedMenuItem = sessionStorage.getItem(settingsMenuStorageKey)
const legacyNavigationPage = sessionStorage.getItem(navigationPageStorageKey)
const legacyPlaybackPages: Record<string, string> = {
  Player: 'player',
  AutoPlay: 'auto-play',
}
if (storedMenuItem && legacyPlaybackPages[storedMenuItem])
  sessionStorage.setItem(bilibiliPageStorageKey, legacyPlaybackPages[storedMenuItem])

if (!sessionStorage.getItem(bilibiliPageStorageKey)) {
  const legacyPlaybackPage = sessionStorage.getItem(playbackPageStorageKey)
  if (legacyPlaybackPage)
    sessionStorage.setItem(bilibiliPageStorageKey, legacyPlaybackPage)
}

const legacyNavigationComponentPages = new Set(['video-card', 'topbar', 'dock'])
const legacyNavigationMenu = legacyNavigationPage === 'link-opening'
  ? MenuType.General
  : legacyNavigationPage && legacyNavigationComponentPages.has(legacyNavigationPage)
    ? MenuType.BewlyComponents
    : MenuType.BewlyPages

const legacyMenuAliases: Record<string, MenuType> = {
  Browsing: legacyNavigationMenu,
  Navigation: legacyNavigationMenu,
  Player: MenuType.Bilibili,
  AutoPlay: MenuType.Bilibili,
  Playback: MenuType.Bilibili,
  BilibiliFeaturesEnhancement: MenuType.Bilibili,
  Advanced: MenuType.General,
}

if (!sessionStorage.getItem(bewlyPagesStorageKey) && legacyNavigationPage && ['home', 'moments', 'search'].includes(legacyNavigationPage))
  sessionStorage.setItem(bewlyPagesStorageKey, legacyNavigationPage)

if (!sessionStorage.getItem(bewlyComponentsStorageKey) && legacyNavigationPage && legacyNavigationComponentPages.has(legacyNavigationPage))
  sessionStorage.setItem(bewlyComponentsStorageKey, legacyNavigationPage)

const initialMenuItem = storedMenuItem
  ? legacyMenuAliases[storedMenuItem] ?? storedMenuItem as MenuType
  : null
const activatedMenuItem = ref<MenuType>(
  initialMenuItem && Object.values(MenuType).includes(initialMenuItem)
    ? initialMenuItem
    : MenuType.General,
)
const settingsWindow = ref<HTMLDivElement>()
const settingsSearchRef = ref<HTMLElement>()
const searchInputRef = ref<HTMLInputElement>()
const searchPopoverStyle = ref<CSSProperties>({})
const isSearchFocused = ref(false)
const { mainAppRef } = useBewlyApp()

function handleSearchBlur() {
  isSearchFocused.value = false
}

function handleSearchFocus() {
  isSearchFocused.value = true
}

function updateSearchPopoverBounds() {
  const searchElement = settingsSearchRef.value
  const contentElement = searchElement?.closest<HTMLElement>('.settings-content')
  if (!searchElement || !contentElement)
    return

  const searchRect = searchElement.getBoundingClientRect()
  const contentRect = contentElement.getBoundingClientRect()
  const edgeInset = 8
  const popoverGap = 10
  const narrowLayout = window.innerWidth <= 760
  const bottomEdge = Math.min(window.innerHeight - edgeInset, contentRect.bottom - edgeInset)

  // Fixed positioning so the popover can be teleported out of the settings
  // window (which has its own backdrop-filter that would swallow ours).
  searchPopoverStyle.value = {
    position: 'fixed',
    top: `${searchRect.bottom + popoverGap}px`,
    right: narrowLayout ? 'auto' : `${window.innerWidth - searchRect.right}px`,
    left: narrowLayout ? `${contentRect.left + edgeInset}px` : 'auto',
    width: narrowLayout ? `${Math.max(0, contentRect.width - edgeInset * 2)}px` : `${searchRect.width}px`,
    maxHeight: `${Math.max(0, bottomEdge - searchRect.bottom - popoverGap)}px`,
  }
}

function focusSettingsSearch(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('.settings-search-results'))
    return

  searchInputRef.value?.focus({ preventScroll: true })
  nextTick(updateSearchPopoverBounds)
}

useEventListener(window, 'resize', () => {
  createTransformer(settingsWindow, {
    x: '50%',
    y: '50%',
    notrigger: true,
    centerTarget: {
      x: true,
      y: true,
    },
  })
  nextTick(updateSearchPopoverBounds)
})

const scrollViewportRef = ref<HTMLElement>()

// 滚动时关闭搜索弹窗（保留搜索词）
useEventListener(() => scrollViewportRef.value, 'scroll', () => {
  if (isSearchFocused.value) {
    isSearchFocused.value = false
    searchInputRef.value?.blur()
  }
}, { capture: true })

provide('scrollSettingsContentToTop', () => {
  scrollViewportRef.value?.scrollTo({ top: 0 })
})

watch(
  () => activatedMenuItem.value,
  (menuItem) => {
    breadcrumbDetail.value = undefined
    sessionStorage.setItem(settingsMenuStorageKey, menuItem)
    scrollViewportRef.value?.scrollTo({ top: 0 })
  },
)

const settingsMenuItems: MenuItem[] = [
  {
    value: MenuType.General,
    icon: 'i-mingcute:settings-3-line',
    iconActivated: 'i-mingcute:settings-3-fill',
    titleKey: 'settings.menu_general',
  },
  {
    value: MenuType.BewlyPages,
    icon: 'i-mingcute:web-line',
    iconActivated: 'i-mingcute:web-fill',
    titleKey: 'settings.menu_bewly_pages',
  },
  {
    value: MenuType.BewlyComponents,
    icon: 'i-mingcute:tool-line',
    iconActivated: 'i-mingcute:tool-fill',
    titleKey: 'settings.menu_bewly_components',
  },
  {
    value: MenuType.Bilibili,
    icon: 'i-mingcute:sparkles-2-line',
    iconActivated: 'i-mingcute:sparkles-2-fill',
    titleKey: 'settings.menu_bilibili',
    sectionStart: true,
  },
  {
    value: MenuType.Appearance,
    titleKey: 'settings.menu_appearance',
    icon: 'i-mingcute:paint-brush-line',
    iconActivated: 'i-mingcute:paint-brush-fill',
  },
  {
    value: MenuType.Shortcuts,
    icon: 'i-mingcute:keyboard-line',
    iconActivated: 'i-mingcute:keyboard-fill',
    titleKey: 'settings.shortcuts.title',
    sectionStart: true,
  },
  {
    value: MenuType.About,
    icon: 'i-mingcute:information-line',
    iconActivated: 'i-mingcute:information-fill',
    titleKey: 'settings.menu_about',
    sectionStart: true,
  },
]

const title = computed(() => {
  const currentMenuItem = settingsMenuItems.find(item => item.value === activatedMenuItem.value)
  return currentMenuItem ? t(currentMenuItem.titleKey) : t('settings.title')
})

function getSearchEntryTitle(entry: SettingsSearchEntry) {
  return entry.titleKey ? t(entry.titleKey) : entry.title ?? ''
}

function getSearchEntryLocation(entry: SettingsSearchEntry) {
  const primaryTitle = getMenuTitle(entry.menu)
  return entry.secondaryTitleKey
    ? `${primaryTitle} / ${t(entry.secondaryTitleKey)}`
    : primaryTitle
}

function getTranslatedSearchTerms(key: string): string[] {
  const collectTerms = (message: unknown): string[] => {
    if (typeof message === 'string' || typeof message === 'function')
      return [rt(message as Parameters<typeof rt>[0])]
    if (Array.isArray(message))
      return message.flatMap(collectTerms)
    if (message && typeof message === 'object')
      return Object.values(message).flatMap(collectTerms)
    return []
  }

  return collectTerms(tm(key))
}

function getSearchEntryText(entry: SettingsSearchEntry) {
  const inferredKeywordKeys = entry.titleKey
    ? [`${entry.titleKey}_desc`, `${entry.titleKey}_opt`, `${entry.titleKey}_option`]
    : []
  const translatedKeywords = [...inferredKeywordKeys, ...(entry.keywordKeys ?? [])]
    .flatMap(getTranslatedSearchTerms)

  // 菜单路径只用于结果定位，避免输入分类名时命中整组设置。
  return [
    getSearchEntryTitle(entry),
    ...translatedKeywords,
    ...(entry.keywords ?? []),
  ].join(' ').toLocaleLowerCase()
}

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query)
    return []

  const queryParts = query.split(/\s+/).filter(Boolean)
  return settingsSearchEntries
    .filter((entry) => {
      const searchableText = getSearchEntryText(entry)
      return queryParts.every(part => searchableText.includes(part))
    })
    .slice(0, 12)
})

const activeSearchResultIndex = ref(-1)
const searchResultsRef = ref<HTMLElement>()

watch(searchQuery, (query) => {
  activeSearchResultIndex.value = -1
  if (query)
    nextTick(updateSearchPopoverBounds)
})

function moveSearchResultSelection(event: KeyboardEvent, direction: 1 | -1) {
  if (event.isComposing)
    return

  const resultCount = searchResults.value.length
  if (!resultCount)
    return

  event.preventDefault()
  if (activeSearchResultIndex.value < 0)
    activeSearchResultIndex.value = direction > 0 ? 0 : resultCount - 1
  else
    activeSearchResultIndex.value = (activeSearchResultIndex.value + direction + resultCount) % resultCount

  // 键盘导航时让选中项滚动到可视区内
  nextTick(() => {
    searchResultsRef.value?.children[activeSearchResultIndex.value]?.scrollIntoView({ block: 'nearest' })
  })
}

function activateSearchResult(event: KeyboardEvent) {
  if (event.isComposing)
    return

  const entry = searchResults.value[activeSearchResultIndex.value] ?? searchResults.value[0]
  if (entry) {
    event.preventDefault()
    navigateToSearchResult(entry)
  }
}

function getMenuTitle(menu: MenuType) {
  const menuItem = settingsMenuItems.find(item => item.value === menu)
  return menuItem ? t(menuItem.titleKey) : t('settings.title')
}

let highlightedSearchTarget: HTMLElement | undefined
let searchTargetHighlightTimer: number | undefined
let searchNavigationId = 0

function clearSearchTargetHighlight() {
  if (searchTargetHighlightTimer)
    window.clearTimeout(searchTargetHighlightTimer)

  highlightedSearchTarget?.classList.remove('settings-search-target')
  highlightedSearchTarget?.removeAttribute('data-settings-search-highlight')
  highlightedSearchTarget = undefined
  searchTargetHighlightTimer = undefined
}

function highlightSearchTarget(target: HTMLElement) {
  clearSearchTargetHighlight()
  const visualTarget = target.matches('.b-settings-item-group')
    ? target.querySelector<HTMLElement>(':scope > .group-heading') ?? target
    : target

  highlightedSearchTarget = visualTarget
  visualTarget.dataset.settingsSearchHighlight = t('settings.search.located')
  visualTarget.classList.add('settings-search-target')
  searchTargetHighlightTimer = window.setTimeout(clearSearchTargetHighlight, 2400)
}

function expandSearchTarget(target: HTMLElement) {
  const collapsedControls: HTMLElement[] = []

  if (target.matches('[aria-expanded="false"]'))
    collapsedControls.push(target)

  let ancestor: HTMLElement | null = target
  while (ancestor && ancestor !== settingsWindow.value) {
    const control = ancestor.matches('.b-settings-item-group')
      ? ancestor.querySelector<HTMLElement>(':scope > .group-heading[aria-expanded="false"]')
      : ancestor.matches('section')
        ? ancestor.querySelector<HTMLElement>(':scope > .settings-section-heading[aria-expanded="false"]')
        : undefined

    if (control)
      collapsedControls.push(control)

    ancestor = ancestor.parentElement
  }

  Array.from(new Set(collapsedControls)).reverse().forEach(control => control.click())
}

function scrollToSearchTarget(expectedTitle: string | undefined, navigationId: number, attempts = 0) {
  if (!expectedTitle || navigationId !== searchNavigationId || attempts > 30)
    return

  const target = Array.from(settingsWindow.value?.querySelectorAll<HTMLElement>('[data-settings-title]') ?? [])
    .find(element =>
      element.dataset.settingsTitle === expectedTitle
      && !element.closest('.page-fade-leave-active'),
    )

  if (target) {
    expandSearchTarget(target)
    nextTick(() => {
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        highlightSearchTarget(target)
      })
    })
    return
  }

  window.setTimeout(() => scrollToSearchTarget(expectedTitle, navigationId, attempts + 1), 100)
}

function navigateToSearchResult(entry: SettingsSearchEntry) {
  const navigationId = ++searchNavigationId
  entry.storageValues?.forEach(({ key, value }) => sessionStorage.setItem(key, value))

  activatedMenuItem.value = entry.menu
  if (entry.storageValues?.length)
    settingsContentKey.value++
  searchQuery.value = ''
  const targetTitle = entry.targetTitleKey
    ? t(entry.targetTitleKey)
    : entry.targetTitle ?? getSearchEntryTitle(entry)
  nextTick(() => scrollToSearchTarget(targetTitle, navigationId))
}

onBeforeUnmount(() => {
  if (settingsContentFrame !== undefined)
    cancelAnimationFrame(settingsContentFrame)
  searchNavigationId++
  clearSearchTargetHighlight()
})

function handleClose() {
  emit('close')
}

function changeMenuItem(menuItem: MenuType) {
  activatedMenuItem.value = menuItem
}
</script>

<template>
  <div class="fixed w-full h-full top-0 left-0">
    <div
      class="fixed w-full h-full top-0 left-0"
      @click="handleClose"
    />
    <div
      id="settings-window"
      ref="settingsWindow"
      pos="fixed top-1/2 left-1/2" w="90%" h="90%"
      max-w-1000px max-h-900px transform="~ translate-x--1/2 translate-y--1/2 gpu"
      flex="~ justify-between items-center"
    >
      <aside
        class="settings-primary-navigation group"
        shrink-0 p="x-4"
        pos="absolute xl:left--84px left--44px" z-2
      >
        <ul
          class="settings-primary-navigation__list"
          style="
            box-shadow: var(--bew-shadow-4);
          "
          relative
          bg="$bew-content-alt group-hover:$bew-elevated dark:$bew-elevated dark-group-hover:$bew-elevated"
          overflow-hidden antialiased
        >
          <!-- frosted glass background -->
          <!-- https://github.com/BewlyBewly/BewlyBewly/issues/1162 -->
          <div
            class="settings-primary-navigation__surface"
            :style="{
              // 对齐 1.6.9：侧栏固定用 dialog 级 glass-2
              backdropFilter: settings.enableFrostedGlass ? 'var(--bew-filter-glass-2)' : 'none',
            }"
            z--1 pointer-events-none rounded-inherit
          />

          <li
            v-for="menuItem in settingsMenuItems"
            :key="menuItem.value"
            :class="{ 'menu-section-start': menuItem.sectionStart }"
          >
            <button
              type="button"
              class="settings-primary-navigation__item"
              cursor-pointer
              :class="{ 'menu-item-activated': menuItem.value === activatedMenuItem }"
              :aria-current="menuItem.value === activatedMenuItem ? 'page' : undefined"
              @click="changeMenuItem(menuItem.value)"
            >
              <div
                v-show="menuItem.value !== activatedMenuItem"
                text="xl center" w-40px h-20px flex="~ shrink-0" justify-center
                :class="menuItem.icon"
              />
              <div
                v-show="menuItem.value === activatedMenuItem"
                text="xl center" w-40px h-20px flex="~ shrink-0" justify-center
                :class="menuItem.iconActivated"
              />
              <div flex="~ items-center gap-2" shrink-0>
                <span>{{ $t(menuItem.titleKey) }}</span>
                <span
                  v-if="menuItem.badge"
                  text="xs"
                  bg="orange-500/20"
                  px-2 py-0.5
                  rounded-full
                  text-orange-500
                  fw-500
                >
                  {{ menuItem.badge }}
                </span>
              </div>
            </button>
          </li>
        </ul>
      </aside>

      <div
        class="settings-content"
        :style="{
          '--un-shadow': 'var(--bew-shadow-4), var(--bew-shadow-edge-glow-2)',
          'backdropFilter': settings.enableFrostedGlass ? 'var(--bew-filter-glass-1)' : 'none',
        }"
        relative overflow-hidden flex-1 min-w-0
        h-full
        bg="$bew-elevated-alt"
        shadow rounded="$bew-modal-radius" border="1 $bew-border-color"
      >
        <header
          class="settings-header"
          flex justify-between items-center w-full h-92px
          pos="absolute top-0 left-0" p="x-11" box-border gap-4
          z-1 rounded="t-$bew-modal-radius"
          style="
            text-shadow: 0 0 10px var(--bew-elevated-solid), 0 0 15px var(--bew-elevated-solid)
          "
        >
          <!-- Mask -->
          <div
            pos="absolute top-0 left-0" w-inherit h-inherit pointer-events-none
            :style="{
              maskImage: settings.enableFrostedGlass
                ? 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)'
                : 'none',
              WebkitMaskImage: settings.enableFrostedGlass
                ? 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)'
                : 'none',
              backgroundColor: settings.enableFrostedGlass ? 'transparent' : 'var(--bew-elevated-alt-solid)',
              backdropFilter: settings.enableFrostedGlass ? 'blur(3px) saturate(180%)' : 'none',
              WebkitBackdropFilter: settings.enableFrostedGlass ? 'blur(3px) saturate(180%)' : 'none',
            }"
            z--1 rounded-inherit
          />
          <nav class="settings-breadcrumb" :aria-label="$t('settings.breadcrumb')">
            <span>{{ $t('settings.title') }}</span>
            <i i-mingcute:right-line />
            <strong>{{ title }}</strong>
            <template v-if="breadcrumbDetail">
              <i i-mingcute:right-line />
              <strong>{{ breadcrumbDetail }}</strong>
            </template>
          </nav>
          <div
            ref="settingsSearchRef"
            class="settings-search"
            :class="{ 'has-query': Boolean(searchQuery) }"
            :style="{
              backgroundColor: settings.enableFrostedGlass ? 'var(--bew-content)' : 'var(--bew-content-solid)',
            }"
            @click="focusSettingsSearch"
          >
            <i i-mingcute:search-2-line />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="search"
              :placeholder="$t('settings.search.placeholder')"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="settings-search-results"
              :aria-expanded="Boolean(searchQuery)"
              :aria-activedescendant="activeSearchResultIndex >= 0 ? `settings-search-result-${activeSearchResultIndex}` : undefined"
              @keydown.esc="searchQuery = ''"
              @keydown.down="moveSearchResultSelection($event, 1)"
              @keydown.up="moveSearchResultSelection($event, -1)"
              @keydown.enter="activateSearchResult"
              @focus="() => { handleSearchFocus(); updateSearchPopoverBounds() }"
              @blur="handleSearchBlur"
            >
          </div>
          <div
            style="
              box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
            "
            :style="{
              backdropFilter: settings.enableFrostedGlass ? 'var(--bew-filter-glass-1)' : 'none',
            }"
            text="!16px hover:$bew-theme-color" w="32px" h="32px"
            flex="~ items-center justify-center shrink-0"
            bg="$bew-elevated dark:$bew-fill-1 hover:$bew-theme-color-30"
            rounded-8 cursor="pointer" border="1 $bew-border-color" box-border
            duration-300
            @click="handleClose"
          >
            <div i-ic-baseline-clear />
          </div>
        </header>
        <div
          ref="scrollViewportRef"
          :style="{
            maskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, transparent 0%, black 92px 30%)' : 'none',
            WebkitMaskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, transparent 0%, black 92px 30%)' : 'none',
            scrollbarGutter: 'stable',
            overflowAnchor: 'none',
            overscrollBehavior: 'contain',
          }"
          h-inherit of-y-auto of-x-hidden
          style="padding-top: 92px;"
        >
          <main w-full min-h="[calc(100%-92px)]" p="x-12 b-10">
            <!-- <div h-80px mt--8 /> -->

            <Transition name="page-fade">
              <Component
                :is="settingsMenu[activatedMenuItem as keyof typeof settingsMenu]"
                v-if="settingsContentReady"
                :key="settingsContentKey"
              />
            </Transition>
          </main>
        </div>
      </div>
    </div>

    <Teleport :to="mainAppRef" :disabled="!mainAppRef">
      <Transition name="settings-search-popover">
        <div
          v-if="searchQuery && isSearchFocused"
          id="settings-search-results"
          ref="searchResultsRef"
          class="settings-search-results bew-popover-surface"
          role="listbox"
          :style="[
            searchPopoverStyle,
            {
              backgroundColor: settings.enableFrostedGlass ? 'var(--bew-elevated-alt)' : 'var(--bew-elevated-alt-solid)',
              zIndex: 10010,
            },
          ]"
        >
          <button
            v-for="(entry, index) in searchResults"
            :id="`settings-search-result-${index}`"
            :key="`${entry.menu}-${entry.secondaryTitleKey ?? ''}-${entry.titleKey ?? entry.title}-${index}`"
            type="button"
            role="option"
            :aria-selected="index === activeSearchResultIndex"
            :class="{ active: index === activeSearchResultIndex }"
            @mouseenter="activeSearchResultIndex = index"
            @click="navigateToSearchResult(entry)"
          >
            <strong>{{ getSearchEntryTitle(entry) }}</strong>
            <span>{{ getSearchEntryLocation(entry) }}</span>
          </button>
          <p v-if="searchResults.length === 0">
            {{ $t('settings.search.no_results') }}
          </p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.menu-item-activated {
  --uno: "text-$bew-text-auto bg-$bew-theme-color-auto";
}

// Animate from the capsule's real geometric radius instead of `radius-full`.
// Interpolating from 9999px stays visually clamped until the final frames and
// makes the corners appear to snap when the rail expands.
.settings-primary-navigation__list {
  --settings-primary-nav-inset: var(--bew-space-2);
  --settings-primary-nav-item-size: 40px;
  --settings-primary-nav-expanded-item-width: 190px;

  display: flex;
  box-sizing: border-box;
  width: calc(
    var(--settings-primary-nav-item-size) + var(--settings-primary-nav-inset) + var(--settings-primary-nav-inset)
  );
  padding: var(--settings-primary-nav-inset);
  flex-direction: column;
  align-items: stretch;
  gap: var(--bew-space-2);
  border-radius: 28px; // 40px item + 8px padding on each side, divided by two.
  transition:
    width var(--bew-duration-moderate) var(--bew-ease-standard),
    border-radius var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-standard);

  > li {
    width: 100%;
    flex: 0 0 auto;
  }
}

.settings-primary-navigation__surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: 1px solid var(--bew-border-color);
  box-shadow: none;
  transition: box-shadow var(--bew-duration-moderate) var(--bew-ease-standard);
}

.settings-primary-navigation__item {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  height: var(--settings-primary-nav-item-size);
  align-items: center;
  overflow-x: hidden;
  border-radius: var(--bew-space-5); // Half of the collapsed 40px item.
  transition:
    border-radius var(--bew-duration-moderate) var(--bew-ease-standard),
    color var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard);

  &:hover:not(.menu-item-activated) {
    background: var(--bew-fill-2);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: -2px;
  }
}

.settings-primary-navigation:hover {
  .settings-primary-navigation__list {
    width: calc(
      var(--settings-primary-nav-expanded-item-width) + var(--settings-primary-nav-inset) +
        var(--settings-primary-nav-inset)
    );
    border-radius: var(--bew-radius-2xl);
    transform: scale(1.05);
  }

  .settings-primary-navigation__surface {
    box-shadow: var(--bew-shadow-edge-glow-2);
  }
}

.settings-breadcrumb {
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
  width: min(320px, 38%);
  min-width: 42px;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-content);
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
    width: 100%;
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

.settings-search-results {
  box-sizing: border-box;
  padding: var(--bew-space-2);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: calc(var(--bew-radius) + 4px);

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--bew-space-3);
    width: 100%;
    min-height: var(--bew-control-height);
    padding: var(--bew-space-2) var(--bew-space-4);
    text-align: left;
    border-radius: var(--bew-radius);
    transition: background-color var(--bew-duration-normal) var(--bew-ease-standard);

    &:hover {
      background: var(--bew-fill-2);
    }

    &.active {
      background: var(--bew-fill-2);
    }
  }

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-body);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span,
  p {
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
  }

  span {
    flex: 0 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    padding: 12px;
    text-align: center;
  }
}

.settings-search-results {
  transform-origin: top right;
}

.settings-search-popover-enter-active,
.settings-search-popover-leave-active {
  transition:
    opacity 0.24s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-search-popover-enter-from,
.settings-search-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

:deep(.settings-search-target) {
  position: relative;
  z-index: 2;
  isolation: isolate;
  border-radius: var(--bew-panel-radius);
}

:deep(.settings-search-target > *) {
  position: relative;
  z-index: 1;
}

:deep(.settings-search-target::before) {
  position: absolute;
  inset: 0 -12px;
  z-index: 0;
  background: var(--bew-theme-color);
  border-radius: var(--bew-panel-radius);
  content: "";
  opacity: 0;
  pointer-events: none;
  animation: settings-search-target-flash 2.4s ease-in-out;
}

:deep(.settings-search-target::after) {
  position: absolute;
  top: -13px;
  right: 12px;
  z-index: 3;
  padding: var(--bew-space-1) var(--bew-space-2);
  color: white;
  background: var(--bew-theme-color);
  border-radius: var(--bew-badge-radius);
  box-shadow: var(--bew-shadow-2);
  content: attr(data-settings-search-highlight);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  pointer-events: none;
  white-space: nowrap;
  animation: settings-search-target-label 2.4s ease-out;
}

@keyframes settings-search-target-flash {
  0%,
  100% {
    opacity: 0;
  }

  18%,
  48%,
  78% {
    opacity: 0.18;
  }

  33%,
  63% {
    opacity: 0;
  }
}

@keyframes settings-search-target-label {
  0% {
    opacity: 0;
    transform: translateY(5px);
  }

  14%,
  72% {
    opacity: 1;
    transform: translateY(0);
  }

  100% {
    opacity: 0;
    transform: translateY(-5px);
  }
}

@media (max-width: 1279px) {
  #settings-window {
    /* 侧栏进入布局后先维持 1000px 内容宽度，空间不足时再连续收缩。 */
    width: min(calc(1000px + 72px), calc(100% - var(--bew-space-6)));
    max-width: none;
    margin-left: calc(-1 * var(--bew-space-1));
  }

  .settings-primary-navigation {
    /* xl 以下外侧空间不足：让折叠导航占据布局宽度，展开时仍可覆盖 content。 */
    position: relative;
    left: auto !important;
    width: 72px;
    box-sizing: border-box;
    padding-inline: var(--bew-space-2);
  }
}

@media (max-width: 760px) {
  .settings-header {
    gap: var(--bew-space-2);
    padding-inline: var(--bew-space-4);
  }

  .settings-primary-navigation {
    /* 触屏窄屏不依赖 hover，保持常驻图标列。 */
    li {
      width: 100%;
    }

    button {
      justify-content: center;
    }

    button > div:last-child {
      display: none;
    }

    button > div:first-child,
    button > div:nth-child(2) {
      width: 40px;
      flex: 0 0 40px;
    }

    &:hover {
      .settings-primary-navigation__list {
        width: calc(
          var(--settings-primary-nav-item-size) + var(--settings-primary-nav-inset) + var(--settings-primary-nav-inset)
        );
        border-radius: 28px;
      }

      .settings-primary-navigation__item {
        border-radius: var(--bew-space-5);
      }
    }
  }

  .settings-search {
    width: 42px;
    flex: 0 0 42px;
    cursor: pointer;

    input {
      width: 0;
      margin-left: 0;
      opacity: 0;
      pointer-events: none;
      transition:
        width var(--bew-duration-moderate) var(--bew-ease-standard),
        margin-left var(--bew-duration-moderate) var(--bew-ease-standard),
        opacity var(--bew-duration-normal) var(--bew-ease-standard);
    }

    &:focus-within,
    &.has-query {
      position: absolute;
      right: calc(var(--bew-space-4) + 32px + var(--bew-space-2));
      left: var(--bew-space-4);
      z-index: 3;
      width: auto;

      input {
        width: 100%;
        margin-left: var(--bew-space-2);
        opacity: 1;
        pointer-events: auto;
      }
    }
  }
}

.menu-section-start {
  position: relative;
  padding-top: calc(var(--bew-space-2) + 1px);

  &::before {
    position: absolute;
    top: 0;
    right: 8px;
    left: 8px;
    height: 1px;
    background: var(--bew-border-color);
    content: "";
  }
}
</style>
