<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { createTransformer } from '~/utils/transformer'

import type { MenuItem } from './types'
import { MenuType } from './types'

const emit = defineEmits(['close'])

const { t } = useI18n()
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

interface SettingsSearchEntry {
  titleKey: string
  menu: MenuType
  targetTitleKey?: string
  secondaryPage?: string
  secondaryStorageKey?: string
}

const settingsSearchEntries: SettingsSearchEntry[] = [
  { titleKey: 'settings.group_language', menu: MenuType.General, targetTitleKey: 'settings.group_language' },
  { titleKey: 'settings.select_language', menu: MenuType.General, targetTitleKey: 'settings.group_language' },
  { titleKey: 'settings.group_interaction_layout', menu: MenuType.General, targetTitleKey: 'settings.group_interaction_layout' },
  { titleKey: 'settings.touch_screen_optimization', menu: MenuType.General, targetTitleKey: 'settings.group_interaction_layout' },
  {
    titleKey: 'settings.group_link_opening_behavior',
    menu: MenuType.Navigation,
    targetTitleKey: 'settings.group_link_opening_behavior',
    secondaryPage: 'link-opening',
    secondaryStorageKey: 'bewly-settings-navigation-page',
  },
  { titleKey: 'settings.group_ad_blocking', menu: MenuType.General, targetTitleKey: 'settings.group_ad_blocking' },
  { titleKey: 'settings.block_ads', menu: MenuType.General, targetTitleKey: 'settings.group_ad_blocking' },
  { titleKey: 'settings.group_clean_share_link', menu: MenuType.General, targetTitleKey: 'settings.group_clean_share_link' },
  { titleKey: 'settings.enable_clean_share_link', menu: MenuType.General, targetTitleKey: 'settings.group_clean_share_link' },
  { titleKey: 'settings.group_favorites', menu: MenuType.General, targetTitleKey: 'settings.group_favorites' },
  {
    titleKey: 'settings.plugin.home',
    menu: MenuType.Navigation,
    targetTitleKey: 'settings.plugin.home',
    secondaryPage: 'home',
    secondaryStorageKey: 'bewly-settings-navigation-page',
  },
  {
    titleKey: 'settings.group_recommendation_filters',
    menu: MenuType.Navigation,
    targetTitleKey: 'settings.group_recommendation_filters',
    secondaryPage: 'home',
    secondaryStorageKey: 'bewly-settings-navigation-page',
  },
  {
    titleKey: 'settings.filter_out_vertical_videos',
    menu: MenuType.Navigation,
    targetTitleKey: 'settings.group_recommendation_filters',
    secondaryPage: 'home',
    secondaryStorageKey: 'bewly-settings-navigation-page',
  },
  {
    titleKey: 'settings.filter_by_view_count',
    menu: MenuType.Navigation,
    targetTitleKey: 'settings.group_recommendation_filters',
    secondaryPage: 'home',
    secondaryStorageKey: 'bewly-settings-navigation-page',
  },
  {
    titleKey: 'settings.plugin.video_card',
    menu: MenuType.Navigation,
    targetTitleKey: 'settings.plugin.video_card',
    secondaryPage: 'video-card',
    secondaryStorageKey: 'bewly-settings-navigation-page',
  },
  {
    titleKey: 'settings.group_video_card_grid',
    menu: MenuType.Navigation,
    targetTitleKey: 'settings.group_video_card_grid',
    secondaryPage: 'video-card',
    secondaryStorageKey: 'bewly-settings-navigation-page',
  },
  {
    titleKey: 'settings.video_card_shadow_curve',
    menu: MenuType.Navigation,
    targetTitleKey: 'settings.video_card_shadow_curve',
    secondaryPage: 'video-card',
    secondaryStorageKey: 'bewly-settings-navigation-page',
  },
  {
    titleKey: 'settings.plugin.topbar',
    menu: MenuType.Navigation,
    targetTitleKey: 'settings.plugin.topbar',
    secondaryPage: 'topbar',
    secondaryStorageKey: 'bewly-settings-navigation-page',
  },
  {
    titleKey: 'settings.plugin.dock_and_sidebar',
    menu: MenuType.Navigation,
    targetTitleKey: 'settings.plugin.dock_and_sidebar',
    secondaryPage: 'dock',
    secondaryStorageKey: 'bewly-settings-navigation-page',
  },
  {
    titleKey: 'settings.plugin.search',
    menu: MenuType.Navigation,
    targetTitleKey: 'settings.plugin.search',
    secondaryPage: 'search',
    secondaryStorageKey: 'bewly-settings-navigation-page',
  },
  { titleKey: 'settings.bilibili_features.video_playback', menu: MenuType.Playback, targetTitleKey: 'settings.bilibili_features.video_playback' },
  { titleKey: 'settings.video_default_player_mode', menu: MenuType.Playback, targetTitleKey: 'settings.bilibili_features.video_playback' },
  { titleKey: 'settings.bilibili_features.auto_play', menu: MenuType.Playback, targetTitleKey: 'settings.bilibili_features.auto_play' },
  { titleKey: 'settings.plugin.volume_balance', menu: MenuType.Playback, targetTitleKey: 'settings.plugin.volume_balance' },
  { titleKey: 'settings.group_visual_effects', menu: MenuType.Appearance, targetTitleKey: 'settings.group_visual_effects' },
  { titleKey: 'settings.enable_frosted_glass', menu: MenuType.Appearance, targetTitleKey: 'settings.group_visual_effects' },
  { titleKey: 'settings.group_color', menu: MenuType.Appearance, targetTitleKey: 'settings.group_color' },
  { titleKey: 'settings.theme', menu: MenuType.Appearance, targetTitleKey: 'settings.group_color' },
  { titleKey: 'settings.theme_color', menu: MenuType.Appearance, targetTitleKey: 'settings.group_color' },
  { titleKey: 'settings.group_wallpaper', menu: MenuType.Appearance, targetTitleKey: 'settings.group_wallpaper' },
  { titleKey: 'settings.group_fonts', menu: MenuType.Appearance, targetTitleKey: 'settings.group_fonts' },
  { titleKey: 'settings.customize_font', menu: MenuType.Appearance, targetTitleKey: 'settings.group_fonts' },
  { titleKey: 'settings.customize_css', menu: MenuType.Appearance, targetTitleKey: 'settings.menu_appearance' },
  { titleKey: 'settings.bilibili_features.comments', menu: MenuType.BilibiliFeaturesEnhancement, targetTitleKey: 'settings.bilibili_features.comments' },
  { titleKey: 'settings.bilibili_features.vip_features', menu: MenuType.BilibiliFeaturesEnhancement, targetTitleKey: 'settings.bilibili_features.vip_features' },
  { titleKey: 'settings.shortcuts.title', menu: MenuType.Shortcuts, targetTitleKey: 'settings.shortcuts.title' },
  { titleKey: 'settings.menu_compatibility', menu: MenuType.Advanced, targetTitleKey: 'settings.menu_compatibility' },
  { titleKey: 'settings.maintenance.title', menu: MenuType.Advanced, targetTitleKey: 'settings.maintenance.title' },
  { titleKey: 'settings.import_settings', menu: MenuType.Advanced, targetTitleKey: 'settings.maintenance.title' },
  { titleKey: 'settings.export_settings', menu: MenuType.Advanced, targetTitleKey: 'settings.maintenance.title' },
  { titleKey: 'settings.reset_settings', menu: MenuType.Advanced, targetTitleKey: 'settings.maintenance.title' },
]

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query)
    return []

  return settingsSearchEntries
    .filter(entry => t(entry.titleKey).toLocaleLowerCase().includes(query))
    .slice(0, 8)
})

function getMenuTitle(menu: MenuType) {
  const menuItem = settingsMenuItems.find(item => item.value === menu)
  return menuItem ? t(menuItem.titleKey) : t('settings.title')
}

function scrollToSearchTarget(titleKey?: string, attempts = 0) {
  if (!titleKey || attempts > 12)
    return

  const expectedTitle = t(titleKey)
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-settings-title]'))
    .find(element => element.dataset.settingsTitle === expectedTitle)

  if (target) {
    const collapsedControl = target.matches('[aria-expanded="false"]')
      ? target
      : target.querySelector<HTMLElement>('[aria-expanded="false"]')
    collapsedControl?.click()
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    target.animate(
      [
        { outline: '2px solid var(--bew-theme-color)', outlineOffset: '4px' },
        { outline: '2px solid transparent', outlineOffset: '8px' },
      ],
      { duration: 1400, easing: 'ease-out' },
    )
    return
  }

  window.setTimeout(() => scrollToSearchTarget(titleKey, attempts + 1), 100)
}

function navigateToSearchResult(entry: SettingsSearchEntry) {
  if (entry.secondaryPage && entry.secondaryStorageKey)
    sessionStorage.setItem(entry.secondaryStorageKey, entry.secondaryPage)

  activatedMenuItem.value = entry.menu
  settingsContentKey.value++
  searchQuery.value = ''
  nextTick(() => scrollToSearchTarget(entry.targetTitleKey))
}

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
              @keydown.esc="searchQuery = ''"
            >
            <div v-if="searchQuery" class="settings-search-results">
              <button
                v-for="entry in searchResults"
                :key="`${entry.menu}-${entry.titleKey}`"
                type="button"
                @click="navigateToSearchResult(entry)"
              >
                <strong>{{ $t(entry.titleKey) }}</strong>
                <span>{{ getMenuTitle(entry.menu) }}</span>
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
