<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import type { SettingsNavigationTarget } from '~/composables/useAppProvider'
import { USAGE_GUIDE_URL } from '~/constants/usageGuide'
import { settings } from '~/logic'
import { openSettingsPage } from '~/utils/settingsPage'
import { createTransformer } from '~/utils/transformer'

import SettingsCategoryLayout from './components/SettingsCategoryLayout.vue'
import SettingsSearchResults from './components/SettingsSearchResults.vue'
import {
  createPinnedChannelHistory,
  pinnedChannelHistoryKey,
} from './composables/usePinnedChannelHistory'
import { useSettingsNavigation } from './composables/useSettingsNavigation'
import { useSettingsSearch } from './composables/useSettingsSearch'
import { provideSettingsSearchFilter } from './composables/useSettingsSearchFilter'
import { useSettingsSearchNavigation } from './composables/useSettingsSearchNavigation'
import { useSettingsSearchResults } from './composables/useSettingsSearchResults'
import { settingsMenus } from './settingsMenus'
import type { MenuType } from './types'

const props = defineProps<{
  pendingNavigation?: SettingsNavigationTarget
}>()

const emit = defineEmits<{
  close: []
  'update:pendingNavigation': [value: SettingsNavigationTarget | undefined]
}>()

const pinnedChannelHistory = createPinnedChannelHistory(
  computed({
    get: () => settings.value.topBarPinnedChannels,
    set: (keys) => (settings.value.topBarPinnedChannels = keys),
  }),
)
provide(pinnedChannelHistoryKey, pinnedChannelHistory)

// Settings is cached by KeepAlive; closing it does not dispose its scope.
const overlayActive = ref(true)
onActivated(() => {
  overlayActive.value = true
  pinnedChannelHistory.reset()
})

const { t } = useI18n()

const navigation = useSettingsNavigation()
const {
  activatedMenuItem,
  activeMenu,
  activeSecondaryPage,
  settingsMenuItems,
  visibleMenus,
  activateSettingsTarget,
  setActiveSecondaryPage,
} = navigation
const activeMenuDef = activeMenu
const visibleSecondaryPages = computed(() => activeMenu.value.pages ?? [])
const title = computed(() => t(activeMenu.value.titleKey))

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

const settingsWindow = ref<HTMLDivElement>()
const searchInputRef = ref<HTMLInputElement>()
const scrollViewportRef = ref<HTMLElement>()
const settingsContentReady = ref(false)
let settingsContentFrame: number | undefined

const searchNavigation = useSettingsSearchNavigation({
  scrollViewportRef,
  searchQuery,
  getSearchEntryTitle,
  getSearchEntrySecondaryPage,
  activateSettingsTarget,
})

onDeactivated(() => {
  overlayActive.value = false
  pinnedChannelHistory.reset()
  searchNavigation.cancelSearchNavigation()
})

const breadcrumbDetail = ref<string>()
provide('setSettingsBreadcrumb', (detail?: string) => {
  breadcrumbDetail.value = detail
})

const settingsWindowTransformer = createTransformer(settingsWindow, {
  x: '50%',
  y: '50%',
  notrigger: true,
  centerTarget: {
    x: true,
    y: true,
  },
})

onMounted(() => {
  // 先让设置外壳完成首帧绘制，再挂载异步设置页，避免点击反馈被重组件初始化阻塞。
  settingsContentFrame = requestAnimationFrame(() => {
    settingsContentFrame = requestAnimationFrame(() => {
      settingsContentFrame = undefined
      settingsContentReady.value = true
    })
  })
})

function focusSettingsSearch() {
  searchInputRef.value?.focus({ preventScroll: true })
}

useEventListener(window, 'resize', () => {
  settingsWindowTransformer.applyPosition()
})

provide('scrollSettingsContentToTop', () => {
  searchNavigation.cancelSearchNavigation()
  scrollViewportRef.value?.scrollTo({ top: 0 })
})

watch(
  () => activatedMenuItem.value,
  () => {
    breadcrumbDetail.value = undefined
    scrollViewportRef.value?.scrollTo({ top: 0 })
  },
)

watch(
  () => props.pendingNavigation,
  (request) => {
    if (!request) return

    // 二级页定位键直接取自 settingsMenus 的 storageKey，避免另建菜单映射表。
    const secondaryStorageKey = settingsMenus.find(
      (menu) => menu.value === request.menu,
    )?.storageKey
    searchNavigation.navigateToSearchResult({
      menu: request.menu as MenuType,
      targetTitleKey: request.targetTitleKey,
      storageValues:
        request.secondaryPage && secondaryStorageKey
          ? [{ key: secondaryStorageKey, value: request.secondaryPage }]
          : undefined,
    })
    emit('update:pendingNavigation', undefined)
  },
  { immediate: true },
)

function handleClose() {
  emit('close')
}

function openSettingsPageInNewTab() {
  openSettingsPage({
    menu: activatedMenuItem.value,
    secondaryPage: activeSecondaryPage.value?.value,
  })
  handleClose()
}

function handleSecondaryPageChange(page: string) {
  setActiveSecondaryPage(activatedMenuItem.value, page)
}

// KeepAlive 关闭后组件仍保持挂载，仅在浮层激活时响应 ESC。
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (overlayActive.value && e.key === 'Escape') handleClose()
})

function changeMenuItem(menuItem: MenuType) {
  searchNavigation.cancelSearchNavigation()
  activatedMenuItem.value = menuItem
}

onBeforeUnmount(() => {
  if (settingsContentFrame !== undefined) cancelAnimationFrame(settingsContentFrame)
})
</script>

<template>
  <div class="fixed w-full h-full top-0 left-0" data-layout-edit-control>
    <div class="fixed w-full h-full top-0 left-0" @click="handleClose" />
    <div
      id="settings-window"
      ref="settingsWindow"
      pos="fixed top-1/2 left-1/2"
      w="90%"
      h="90%"
      max-w-1000px
      max-h-900px
      transform="~ translate-x--1/2 translate-y--1/2 gpu"
      flex="~ justify-between items-center"
    >
      <aside
        class="settings-primary-navigation group"
        shrink-0
        p="x-4"
        pos="absolute xl:left--84px left--44px"
        z-2
      >
        <ul
          class="settings-primary-navigation__list"
          style="box-shadow: var(--bew-shadow-4)"
          relative
          bg="$bew-content-alt group-hover:$bew-elevated dark:$bew-elevated dark-group-hover:$bew-elevated"
          overflow-hidden
          antialiased
        >
          <!-- frosted glass background -->
          <!-- https://github.com/BewlyBewly/BewlyBewly/issues/1162 -->
          <div
            class="settings-primary-navigation__surface"
            :style="{
              boxShadow: 'var(--bew-shadow-edge-glow-2)',
              // 对齐 1.6.9：侧栏固定用 dialog 级 glass-2
              backdropFilter: settings.enableFrostedGlass ? 'var(--bew-filter-glass-2)' : 'none',
            }"
            z--1
            pointer-events-none
            rounded-inherit
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
                text="xl center"
                w-40px
                h-20px
                flex="~ shrink-0"
                justify-center
                :class="menuItem.icon"
              />
              <div
                v-show="menuItem.value === activatedMenuItem"
                text="xl center"
                w-40px
                h-20px
                flex="~ shrink-0"
                justify-center
                :class="menuItem.iconActivated"
              />
              <div flex="~ items-center gap-2" shrink-0>
                <span>{{ $t(menuItem.titleKey) }}</span>
              </div>
            </button>
          </li>
        </ul>
      </aside>

      <div
        class="settings-content"
        :style="{
          '--un-shadow': 'var(--bew-shadow-4), var(--bew-shadow-edge-glow-2)',
          backdropFilter: settings.enableFrostedGlass ? 'var(--bew-filter-glass-1)' : 'none',
        }"
        relative
        overflow-hidden
        flex-1
        min-w-0
        h-full
        bg="$bew-elevated-alt"
        shadow
        rounded="$bew-modal-radius"
        border="1 $bew-border-color"
      >
        <header
          class="settings-header"
          flex
          justify-between
          items-center
          w-full
          h-92px
          pos="absolute top-0 left-0"
          p="x-11"
          box-border
          gap-4
          z-1
          rounded="t-$bew-modal-radius"
          style="
            text-shadow:
              0 0 10px var(--bew-elevated-solid),
              0 0 15px var(--bew-elevated-solid);
          "
        >
          <!-- Mask -->
          <div
            pos="absolute top-0 left-0"
            w-inherit
            h-inherit
            pointer-events-none
            :style="{
              maskImage: settings.enableFrostedGlass
                ? 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)'
                : 'none',
              WebkitMaskImage: settings.enableFrostedGlass
                ? 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)'
                : 'none',
              backgroundColor: settings.enableFrostedGlass
                ? 'transparent'
                : 'var(--bew-elevated-alt-solid)',
              backdropFilter: settings.enableFrostedGlass ? 'blur(3px) saturate(180%)' : 'none',
              WebkitBackdropFilter: settings.enableFrostedGlass
                ? 'blur(3px) saturate(180%)'
                : 'none',
            }"
            z--1
            rounded-inherit
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
            class="settings-search"
            :class="{ 'has-query': Boolean(searchQuery) }"
            :style="{
              backgroundColor: settings.enableFrostedGlass
                ? 'var(--bew-content)'
                : 'var(--bew-content-solid)',
            }"
            @click="focusSettingsSearch"
          >
            <i i-mingcute:search-2-line />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="search"
              :placeholder="$t('settings.search.placeholder')"
              :aria-label="$t('settings.search.placeholder')"
              :aria-describedby="isSearching ? 'settings-search-status' : undefined"
              @keydown.esc="searchQuery = ''"
            />
          </div>
          <div class="settings-header-actions">
            <button
              type="button"
              class="settings-header-action settings-open-in-new-tab"
              :aria-label="$t('settings.open_in_new_tab')"
              :title="$t('settings.open_in_new_tab')"
              style="box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2)"
              :style="{
                backdropFilter: settings.enableFrostedGlass ? 'var(--bew-filter-glass-1)' : 'none',
              }"
              text="!16px hover:$bew-theme-color"
              w="32px"
              h="32px"
              flex="~ items-center justify-center shrink-0"
              relative
              z-1
              bg="$bew-elevated dark:$bew-fill-1 hover:$bew-theme-color-30"
              rounded-8
              cursor="pointer"
              border="1 $bew-border-color"
              box-border
              duration-300
              @click="openSettingsPageInNewTab"
            >
              <div class="settings-header-action__icon i-mingcute:external-link-line" />
            </button>
            <button
              type="button"
              class="settings-header-action"
              :aria-label="$t('common.operation.close')"
              :title="$t('common.operation.close')"
              style="box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2)"
              :style="{
                backdropFilter: settings.enableFrostedGlass ? 'var(--bew-filter-glass-1)' : 'none',
              }"
              text="!16px hover:$bew-theme-color"
              w="32px"
              h="32px"
              flex="~ items-center justify-center shrink-0"
              relative
              z-1
              bg="$bew-elevated dark:$bew-fill-1 hover:$bew-theme-color-30"
              rounded-8
              cursor="pointer"
              border="1 $bew-border-color"
              box-border
              duration-300
              @click="handleClose"
            >
              <div class="settings-header-action__icon i-mingcute:close-line" />
            </button>
          </div>
        </header>
        <div
          ref="scrollViewportRef"
          :style="{
            maskImage: settings.enableFrostedGlass
              ? 'linear-gradient(to bottom, transparent 0%, black 92px 30%)'
              : 'linear-gradient(to bottom, transparent 0%, black 55px, black 100%)',
            WebkitMaskImage: settings.enableFrostedGlass
              ? 'linear-gradient(to bottom, transparent 0%, black 92px 30%)'
              : 'linear-gradient(to bottom, transparent 0%, black 55px, black 100%)',
            scrollbarGutter: 'stable',
            overflowAnchor: 'none',
            overscrollBehavior: 'contain',
            // 隔离内容控件的层叠上下文（如 .bew-segment-control__item 的 z-1），
            // 避免毛玻璃关闭时与同 z-index 的 .settings-header 落入同一上下文、
            // 因 DOM 顺序靠后而绘制到头部之上。
            isolation: 'isolate',
          }"
          h-inherit
          of-y-auto
          of-x-hidden
          style="padding-top: 92px"
        >
          <!-- 底部留白高于右下角帮助按钮（16px 边距 + 32px），让末行内容可滚到按钮上方 -->
          <main w-full min-h="[calc(100%-92px)]" p="x-12 b-20">
            <!-- <div h-80px mt--8 /> -->

            <template v-if="isSearching">
              <SettingsSearchResults
                :sections="searchResultSections"
                :summary="searchResultsSummary"
              />
            </template>
            <Transition v-else name="page-fade">
              <SettingsCategoryLayout
                v-if="settingsContentReady && activeMenuDef.pages?.length"
                :key="`layout-${activatedMenuItem}`"
                :pages="visibleSecondaryPages"
                :storage-key="activeMenuDef.storageKey!"
                :active-page="activeSecondaryPage?.value"
                @update:active-page="handleSecondaryPageChange"
              />
              <Component
                :is="activeMenuDef.component"
                v-else-if="settingsContentReady && activeMenuDef.component"
                :key="`page-${activatedMenuItem}`"
              />
            </Transition>
          </main>
        </div>

        <!-- 右下角落在内容区 x-12 内边距内，不遮挡设置项右侧控件 -->
        <Tooltip
          class="settings-usage-guide"
          :content="$t('settings.usage_guide')"
          placement="left"
          floating
          floating-z-index="var(--bew-z-settings-tooltip)"
        >
          <a
            :href="USAGE_GUIDE_URL"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="$t('settings.usage_guide')"
            :style="{
              backdropFilter: settings.enableFrostedGlass ? 'var(--bew-filter-glass-1)' : 'none',
            }"
          >
            <i i-mingcute:question-line />
          </a>
        </Tooltip>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.menu-item-activated {
  --uno: 'text-$bew-text-auto bg-$bew-theme-color-auto';
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
    var(--settings-primary-nav-item-size) + var(--settings-primary-nav-inset) +
      var(--settings-primary-nav-inset)
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
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);

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

/* 需高于 Tooltip 根节点自带的 relative 定位 */
.settings-content .settings-usage-guide {
  position: absolute;
  right: var(--bew-space-4);
  bottom: var(--bew-space-4);
  z-index: 1;

  a {
    display: flex;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--bew-text-2);
    font-size: 16px;
    background: var(--bew-elevated);
    border: 1px solid var(--bew-border-color);
    border-radius: 50%;
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
    transition:
      color var(--bew-duration-moderate) var(--bew-ease-standard),
      background-color var(--bew-duration-moderate) var(--bew-ease-standard);
  }

  a:hover {
    color: var(--bew-theme-color);
    background: var(--bew-theme-color-30);
  }

  a:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: 2px;
  }
}

.dark .settings-content .settings-usage-guide a:not(:hover) {
  background: var(--bew-fill-1);
}

.settings-header-actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-2);
  align-items: center;
}

.settings-header-action {
  appearance: none;
  padding: 0;
  margin: 0;
}

.settings-header-action__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 18px;
  line-height: 1;
  flex: 0 0 auto;
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
          var(--settings-primary-nav-item-size) + var(--settings-primary-nav-inset) +
            var(--settings-primary-nav-inset)
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
    content: '';
  }
}
</style>
