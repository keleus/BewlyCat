<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { createTransformer } from '~/utils/transformer'

import type { SettingsSearchEntry } from './searchCatalog'
import { settingsSearchEntries } from './searchCatalog'
import type { MenuItem } from './types'
import { MenuType } from './types'

const emit = defineEmits(['close'])

const { t, te } = useI18n()
const breadcrumbDetail = ref<string>()
const searchQuery = ref('')
const settingsContentKey = ref(0)

provide('setSettingsBreadcrumb', (detail?: string) => {
  breadcrumbDetail.value = detail
})

const settingsMenu = {
  [MenuType.General]: defineAsyncComponent(() => import('./PluginComponentsAndPages/General/General.vue')),
  [MenuType.Navigation]: defineAsyncComponent(() => import('./Navigation/Navigation.vue')),
  [MenuType.Playback]: defineAsyncComponent(() => import('./Playback/Playback.vue')),
  [MenuType.Appearance]: defineAsyncComponent(() => import('./Appearance/Appearance.vue')),
  [MenuType.Shortcuts]: defineAsyncComponent(() => import('./Shortcuts/Shortcuts.vue')),
  [MenuType.BilibiliFeaturesEnhancement]: defineAsyncComponent(() => import('./BilibiliFeaturesEnhancement/BilibiliFeaturesEnhancement.vue')),
  [MenuType.Advanced]: defineAsyncComponent(() => import('./Advanced/Advanced.vue')),
  [MenuType.About]: defineAsyncComponent(() => import('./About/About.vue')),
}
const settingsMenuStorageKey = 'bewly-settings-active-menu'
const storedMenuItem = sessionStorage.getItem(settingsMenuStorageKey)
const initialMenuItem = storedMenuItem === 'Browsing'
  ? MenuType.Navigation
  : storedMenuItem as MenuType | null
const activatedMenuItem = ref<MenuType>(
  initialMenuItem && Object.values(MenuType).includes(initialMenuItem)
    ? initialMenuItem
    : MenuType.General,
)
const settingsWindow = ref<HTMLDivElement>()

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
})

const scrollViewportRef = ref<HTMLElement>()

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
    value: MenuType.Navigation,
    icon: 'i-mingcute:compass-line',
    iconActivated: 'i-mingcute:compass-fill',
    titleKey: 'settings.menu_navigation',
  },
  {
    value: MenuType.Playback,
    icon: 'i-mingcute:play-circle-line',
    iconActivated: 'i-mingcute:play-circle-fill',
    titleKey: 'settings.menu_playback',
  },
  {
    value: MenuType.Appearance,
    titleKey: 'settings.menu_appearance',
    icon: 'i-mingcute:paint-brush-line',
    iconActivated: 'i-mingcute:paint-brush-fill',
  },
  {
    value: MenuType.BilibiliFeaturesEnhancement,
    icon: 'i-mingcute:sparkles-2-line',
    iconActivated: 'i-mingcute:sparkles-2-fill',
    titleKey: 'settings.menu_bilibili_features_enhancement',
    sectionStart: true,
  },
  {
    value: MenuType.Shortcuts,
    icon: 'i-mingcute:keyboard-line',
    iconActivated: 'i-mingcute:keyboard-fill',
    titleKey: 'settings.shortcuts.title',
  },
  {
    value: MenuType.Advanced,
    icon: 'i-mingcute:tool-line',
    iconActivated: 'i-mingcute:tool-fill',
    titleKey: 'settings.menu_advanced',
    sectionStart: true,
  },
  {
    value: MenuType.About,
    icon: 'i-mingcute:information-line',
    iconActivated: 'i-mingcute:information-fill',
    titleKey: 'settings.menu_about',
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

function getSearchEntryText(entry: SettingsSearchEntry) {
  const inferredDescriptionKey = entry.titleKey ? `${entry.titleKey}_desc` : undefined
  const translatedKeywords = entry.keywordKeys
    ?.filter(key => te(key))
    .map(key => t(key)) ?? []
  const inferredDescription = inferredDescriptionKey && te(inferredDescriptionKey)
    ? t(inferredDescriptionKey)
    : ''

  return [
    getSearchEntryTitle(entry),
    getSearchEntryLocation(entry),
    inferredDescription,
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

watch(searchQuery, () => {
  activeSearchResultIndex.value = -1
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
      max-w-1200px max-h-900px transform="~ translate-x--1/2 translate-y--1/2 gpu"
      flex="~ justify-between items-center"
    >
      <aside
        class="settings-primary-navigation"
        shrink-0 p="r-4" z-2
      >
        <ul
          style="
            box-shadow: var(--bew-shadow-4);
          "
          relative flex="~ gap-2 col" rounded="25px" p-2
          bg="$bew-content-alt dark:$bew-elevated"
          overflow-hidden antialiased
        >
          <!-- frosted glass background -->
          <!-- https://github.com/BewlyBewly/BewlyBewly/issues/1162 -->
          <div
            style="
              box-shadow: var(--bew-shadow-edge-glow-2);
              backdrop-filter: var(--bew-filter-glass-2);
            "
            pos="absolute top-0 left-0" z--1
            w-full h-full pointer-events-none
            border="1 $bew-border-color"
            rounded-inherit duration-inherit
          />

          <li
            v-for="menuItem in settingsMenuItems"
            :key="menuItem.value"
            :class="{ 'menu-section-start': menuItem.sectionStart }"
          >
            <a
              cursor-pointer w-full h-40px
              rounded-30px flex items-center overflow-x-hidden
              duration-300 bg="hover:$bew-fill-2"
              :class="{ 'menu-item-activated': menuItem.value === activatedMenuItem }"
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
            </a>
          </li>
        </ul>
      </aside>

      <div
        class="settings-content"
        style="
          --un-shadow: var(--bew-shadow-4), var(--bew-shadow-edge-glow-2);
          backdrop-filter: var(--bew-filter-glass-2);
        "
        relative overflow="x-hidden" flex-1 min-w-0 h-full
        bg="$bew-elevated-alt"
        shadow rounded="$bew-radius" border="1 $bew-border-color"
      >
        <header
          flex justify-between items-center w-full h-80px
          pos="absolute top-0 left-0" p="x-11" box-border gap-4
          z-1 rounded="t-$bew-radius"
          style="
            text-shadow: 0 0 10px var(--bew-elevated-solid), 0 0 15px var(--bew-elevated-solid)
          "
        >
          <!-- Mask -->
          <div
            pos="absolute top-0 left-0" w-inherit h-inherit pointer-events-none
            :style="{
              maskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, black 0, transparent 100%)' : 'none',
              WebkitMaskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, black 0, transparent 100%)' : 'none',
              backdropFilter: 'blur(6px)',
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
          <div class="settings-search">
            <i i-mingcute:search-2-line />
            <input
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
            >
            <div
              v-if="searchQuery"
              id="settings-search-results"
              ref="searchResultsRef"
              class="settings-search-results"
              role="listbox"
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
          </div>
          <div
            style="
              backdrop-filter: var(--bew-filter-glass-1);
              box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
            "
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
            maskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, transparent 0%, black 80px 30%)' : 'none',
            WebkitMaskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, transparent 0%, black 80px 30%)' : 'none',
            scrollbarGutter: 'stable',
          }"
          h-inherit of-y-auto of-x-hidden
          style="padding-top: 80px;"
        >
          <main w-full min-h="[calc(100%-80px)]" p="x-12 b-10">
            <!-- <div h-80px mt--8 /> -->

            <Transition name="page-fade">
              <Component
                :is="settingsMenu[activatedMenuItem as keyof typeof settingsMenu]"
                :key="settingsContentKey"
              />
            </Transition>
          </main>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.menu-item-activated {
  --uno: "text-$bew-text-auto bg-$bew-theme-color-auto";
}

.settings-primary-navigation {
  width: 220px;
}

.settings-breadcrumb {
  display: flex;
  overflow: hidden;
  gap: 7px;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  color: var(--bew-text-2);
  font-size: 15px;

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
    font-size: 18px;
    font-weight: 600;
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
  width: min(280px, 34%);
  min-width: 42px;
  height: 36px;
  padding: 0 11px;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: 10px;

  > i {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    color: var(--bew-text-2);
  }

  input {
    width: 100%;
    min-width: 0;
    margin-left: 8px;
    color: var(--bew-text-1);
    background: transparent;
    border: 0;
    outline: 0;
  }
}

.settings-search-results {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 10;
  width: 320px;
  max-width: 75vw;
  padding: 6px;
  background: var(--bew-elevated-solid);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  box-shadow: var(--bew-shadow-3);

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 9px 10px;
    text-align: left;
    border-radius: 8px;

    &:hover {
      background: var(--bew-fill-2);
    }

    &.active {
      background: var(--bew-fill-2);

      strong {
        color: var(--bew-theme-color);
      }
    }
  }

  strong {
    color: var(--bew-text-1);
    font-size: 14px;
  }

  span,
  p {
    color: var(--bew-text-2);
    font-size: 12px;
  }

  p {
    padding: 12px;
    text-align: center;
  }
}

:deep(.settings-search-target) {
  position: relative;
  z-index: 2;
  isolation: isolate;
  border-radius: var(--bew-radius);
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
  border-radius: var(--bew-radius);
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
  padding: 5px 9px;
  color: white;
  background: var(--bew-theme-color);
  border-radius: 999px;
  box-shadow: var(--bew-shadow-2);
  content: attr(data-settings-search-highlight);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
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

@media (max-width: 760px) {
  .settings-primary-navigation {
    width: 72px;
    box-sizing: border-box;

    li {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    a {
      width: 40px;
      flex: 0 0 40px;
      justify-content: center;
    }

    a > div:last-child {
      display: none;
    }

    a > div:first-child,
    a > div:nth-child(2) {
      width: 40px;
      flex: 0 0 40px;
    }
  }

  .settings-search {
    width: 42px;

    input {
      margin-left: 4px;
    }

    input::placeholder {
      color: transparent;
    }
  }
}

.menu-section-start {
  position: relative;
  margin-top: 9px;
  padding-top: 9px;

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
