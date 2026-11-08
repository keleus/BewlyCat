<script setup lang="ts">
import { onKeyStroke, useEventListener, useIntersectionObserver, useThrottleFn } from '@vueuse/core'
import type { Ref } from 'vue'
import { provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ApiErrorDetailsDialog from '~/components/ApiErrorDetailsDialog.vue'
import ConfirmDialogOverlay from '~/components/ConfirmDialogOverlay.vue'
import FirefoxScrollbar from '~/components/FirefoxScrollbar.vue'
import Icon from '~/components/Icon.vue'
import TopBarModeSwitcher from '~/components/TopBar/components/TopBarModeSwitcher.vue'
import { useAccountSync } from '~/composables/useAccountSync'
import { useActiveApiErrorSource } from '~/composables/useApiErrorDetails'
import type { BewlyAppProvider, SettingsNavigationTarget } from '~/composables/useAppProvider'
import { DrawerType, UndoForwardState } from '~/composables/useAppProvider'
import { useConfirmDialogHost } from '~/composables/useConfirmDialog'
import { useDark } from '~/composables/useDark'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { BEWLY_MOUNTED, DRAWER_VIDEO_ENTER_PAGE_FULL, DRAWER_VIDEO_EXIT_PAGE_FULL, IFRAME_PAGE_SWITCH_BEWLY, IFRAME_PAGE_SWITCH_BILI, IFRAME_SEARCH_NAVIGATION, OVERLAY_SCROLL_BAR_SCROLL, OVERLAY_SCROLL_STATE_CHANGE } from '~/constants/globalEvents'
import { isOriginalMomentsFeed } from '~/contentScripts/features/originalMomentsFeed'
import { installScrollBridge } from '~/contentScripts/features/scrollBridge'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { settings, settingsReady } from '~/logic'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { stripBilibiliLocalePathname } from '~/utils/bilibiliLocale'
import { setOriginalBilibiliTopBarScrolled, shouldShowOriginalBilibiliTopBar } from '~/utils/bilibiliTopBar'
import { isFirefoxBuild } from '~/utils/buildTarget'
import { SELECTION_FALLBACK_CLASS, supportsHighlightInheritance } from '~/utils/highlightInheritance'
import { isHomePage, isInIframe, isNotificationPage, isSearchResultsPage, isVideoOrBangumiPage, jumpScrollTo, openLinkToNewTab, queryDomUntilFound, scrollToTop } from '~/utils/main'
import emitter from '~/utils/mitt'
import { navigateToPluginSearchResults } from '~/utils/searchNavigation'
import { applyPendingSettingsMigrations, formatSettingsMigrationConfirmMessage, getPendingSettingsMigrationChoices, hasPendingSettingsMigrations } from '~/utils/settingsMigration'
import { openSettingsPage } from '~/utils/settingsPage'
import { isComponentVisible } from '~/utils/topBarBadge'
import { canOpenInVideoDialog } from '~/utils/videoDialog'

import { setupNecessarySettingsWatchers } from './necessarySettingsWatchers'

const mainStore = useMainStore()
const settingsStore = useSettingsStore()
const topBarStore = useTopBarStore()
useAccountSync()
// Layout edit mode is UI-only; persistent choices continue to use `settings`.
const { isLayoutEditing, exitLayoutEditMode } = useLayoutEditMode()
const { t } = useI18n()

// Conditionally use dark mode. `useDark()` handles the video-page-only route gate.
let isDark: Ref<boolean>
const shouldUseDark = settings.value.adaptToOtherPageStyles || settings.value.videoPageDarkMode

if (shouldUseDark) {
  const darkResult = useDark()
  isDark = darkResult.isDark
}
else {
  isDark = ref(false)
}
const searchFocusOverlayActive = ref(false)
const pageWallpaperReady = ref(false)
const useBlendedPageControls = computed(() => settings.value.enableFrostedGlass
  && settings.value.frostedGlassBlurIntensity > 0
  && !settings.value.disableBackground
  && (pageWallpaperReady.value || (settings.value.useLinearGradientThemeColorBackground && isDark.value)))

// Registered before the layout-edit Escape handler: an open dialog consumes Escape first.
const { activeConfirmDialog, showConfirmDialog, finishConfirmDialog } = useConfirmDialogHost()

onKeyStroke('Escape', (e: KeyboardEvent) => {
  if (!isLayoutEditing.value)
    return
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
  exitLayoutEditMode()
}, { dedupe: true })

const SETTINGS_MIGRATION_PROMPT_DISMISSED_KEY = 'bewlycat-settings-migration-prompt-dismissed'

async function promptSettingsMigrationIfNeeded() {
  if (isInIframe())
    return
  if (sessionStorage.getItem(SETTINGS_MIGRATION_PROMPT_DISMISSED_KEY))
    return

  await settingsReady
  const record = settings.value as unknown as Record<string, unknown>
  if (!hasPendingSettingsMigrations(record))
    return

  const message = formatSettingsMigrationConfirmMessage(
    record,
    t,
    'settings.maintenance.migrate_legacy_settings_confirm',
  )
  if (!message)
    return

  const toggleFields = getPendingSettingsMigrationChoices(record).map(choice => ({
    id: choice.id,
    label: String(t(choice.titleKey)),
    value: choice.value,
    enabledLabel: String(t('settings.chk_box.show')),
    disabledLabel: String(t('settings.chk_box.hidden')),
  }))
  const confirmed = await showConfirmDialog(message, {
    title: t('settings.maintenance.migrate_legacy_title'),
    confirmLabel: t('settings.maintenance.migrate_legacy_action'),
    toggleFields,
  })
  if (!confirmed) {
    sessionStorage.setItem(SETTINGS_MIGRATION_PROMPT_DISMISSED_KEY, '1')
    return
  }

  applyPendingSettingsMigrations(record, Object.fromEntries(
    toggleFields.map(field => [field.id, field.value]),
  ))
}

// Get the 'page' query parameter from the URL
function getPageParam(): AppPage | null {
  const urlParams = new URLSearchParams(window.location.search)
  const result = urlParams.get('page') as AppPage | null
  if (result && Object.values(AppPage).includes(result))
    return result
  return null
}

function getDefaultAppPage(): AppPage {
  return settings.value.dockItemsConfig.find(e => e.visible === true)?.page || AppPage.Home
}

const activatedPage = ref<AppPage>(getPageParam() || getDefaultAppPage())
const pageControlWallpaperMask = computed(() => {
  if (!pageWallpaperReady.value)
    return '0%'
  const separateSearchWallpaper = activatedPage.value === AppPage.Search && settings.value.individuallySetSearchPageWallpaper
  const enabled = separateSearchWallpaper ? settings.value.searchPageEnableWallpaperMasking : settings.value.enableWallpaperMasking
  const opacity = separateSearchWallpaper ? settings.value.searchPageWallpaperMaskOpacity : settings.value.wallpaperMaskOpacity
  return `${enabled && Number.isFinite(opacity) ? Math.min(100, Math.max(0, opacity)) : 0}%`
})

// 清理搜索相关的URL参数（仅在首页生效）
function clearSearchParamsFromUrl() {
  // 只在首页清理搜索参数，避免影响其他B站页面（如搜索结果页）
  if (!isHomePage() || isSearchResultsPage()) {
    return
  }

  const urlParams = new URLSearchParams(window.location.search)
  const hasSearchParams = urlParams.has('keyword')
    || urlParams.has('category')
    || urlParams.has('user_order')
    || urlParams.has('user_type')
    || urlParams.has('search_type')
    || urlParams.has('live_room_order')
    || urlParams.has('live_user_order')
    || urlParams.has('pn')

  if (hasSearchParams) {
    urlParams.delete('keyword')
    urlParams.delete('category')
    urlParams.delete('user_order')
    urlParams.delete('user_type')
    urlParams.delete('search_type')
    urlParams.delete('live_room_order')
    urlParams.delete('live_user_order')
    urlParams.delete('pn')
    // 注意：不要删除 'page' 参数，它用于 dock 的页面切换
    const newUrl = `${window.location.pathname}?${urlParams.toString()}`
    window.history.replaceState({}, '', newUrl)
  }
}

// 页面加载时，如果不是Search或SearchResults页面且在首页则清理搜索参数
if (activatedPage.value !== AppPage.Search && activatedPage.value !== AppPage.SearchResults && isHomePage() && !isSearchResultsPage()) {
  clearSearchParamsFromUrl()
  topBarStore.searchKeyword = ''
}

function isFreshHomeTabConfig(tabConfig: { page: HomeSubPage, visible: boolean }[]): boolean {
  return tabConfig.length === mainStore.homeTabs.length
    && tabConfig.every(tab => mainStore.homeTabs.some(defaultTab => defaultTab.page === tab.page))
}

function getDefaultHomeSubPage(tabConfig: { page: HomeSubPage, visible: boolean }[]): HomeSubPage {
  if (isFreshHomeTabConfig(tabConfig))
    return tabConfig.find(tab => tab.visible)?.page ?? HomeSubPage.ForYou

  return HomeSubPage.ForYou
}

function getHomeTabParam(url = new URL(window.location.href)): HomeSubPage | null {
  const tab = url.searchParams.get('tab') as HomeSubPage | null
  return isHomePage(url.href) && url.searchParams.get('page') === AppPage.Home
    && tab && Object.values(HomeSubPage).includes(tab)
    ? tab
    : null
}

// URL 中的显式 tab 优先于设置中的默认首页标签。
const initialHomeTab = getHomeTabParam()
const homeActivatedPage = ref<HomeSubPage>(initialHomeTab ?? getDefaultHomeSubPage(settings.value.homePageTabVisibilityList))
const homeActivatedPageTouched = ref<boolean>(initialHomeTab !== null)
const isHomeTabSwitching = ref<boolean>(false)

function syncNavigationFromUrl() {
  // 注入层的 pushstate 事件在原生方法执行前派发，延后读取最终地址。
  queueMicrotask(() => {
    const page = getPageParam()
    if (page)
      activatedPage.value = page
    if (page === AppPage.Home) {
      const tab = getHomeTabParam()
      homeActivatedPage.value = tab ?? getDefaultHomeSubPage(settings.value.homePageTabVisibilityList)
      homeActivatedPageTouched.value = tab !== null
    }
  })
}
useEventListener(window, 'pushstate', syncNavigationFromUrl)
useEventListener(window, 'popstate', syncNavigationFromUrl)

watch(
  () => settings.value.homePageTabVisibilityList,
  (tabConfig) => {
    if (homeActivatedPageTouched.value)
      return

    const defaultHomeSubPage = getDefaultHomeSubPage(tabConfig)
    if (homeActivatedPage.value !== defaultHomeSubPage)
      homeActivatedPage.value = defaultHomeSubPage
  },
  { deep: true, immediate: true },
)
const pages = {
  [AppPage.Home]: defineAsyncComponent(() => import('./Home/Home.vue')),
  [AppPage.Search]: defineAsyncComponent(() => import('./Search/Search.vue')),
  [AppPage.SearchResults]: defineAsyncComponent(() => import('./SearchResults/SearchResults.vue')),
  [AppPage.Anime]: defineAsyncComponent(() => import('./Anime/Anime.vue')),
  [AppPage.History]: defineAsyncComponent(() => import('./History/History.vue')),
  [AppPage.WatchLater]: defineAsyncComponent(() => import('./WatchLater/WatchLater.vue')),
  [AppPage.Favorites]: defineAsyncComponent(() => import('./Favorites/Favorites.vue')),
  [AppPage.Moments]: defineAsyncComponent(() => import('./Moments/Moments.vue')),
}
const activeApiErrorSource = useActiveApiErrorSource()
const mainAppRef = ref<HTMLElement>() as Ref<HTMLElement>

interface LayoutEditTargetProxy extends SettingsNavigationTarget {
  key: string
  direct: boolean
  left: number
  top: number
  width: number
  height: number
}

interface LayoutEditTargetDescriptor extends SettingsNavigationTarget {
  key: string
  direct?: boolean
}

interface LayoutEditQuickSettingsAction extends SettingsNavigationTarget {
  key: string
  labelKey: string
  icon: string
}

const layoutEditTargets = ref<LayoutEditTargetProxy[]>([])
const layoutEditGridKind = ref<'video-card' | 'moments'>()
const layoutEditDockVisible = ref(false)
let layoutEditTargetObserver: MutationObserver | undefined
let layoutEditTargetFrame: number | undefined
let exposedLayoutEditElements: HTMLElement[] = []

function clearExposedLayoutEditElements() {
  exposedLayoutEditElements.forEach((element) => {
    element.classList.remove('layout-edit-target--active')
    element.removeAttribute('data-layout-edit-active')
  })
  exposedLayoutEditElements = []
}

function isLayoutEditCandidateVisible(element: HTMLElement) {
  if (!element.isConnected || !element.getClientRects().length)
    return false

  const rect = element.getBoundingClientRect()
  if (rect.width < 4 || rect.height < 4 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth)
    return false

  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0
}

function isOriginalMomentsFeedPage() {
  return isOriginalMomentsFeed()
}

function refreshLayoutEditTargets() {
  layoutEditTargetFrame = undefined
  clearExposedLayoutEditElements()

  if (!isLayoutEditing.value || !mainAppRef.value) {
    layoutEditTargets.value = []
    layoutEditGridKind.value = undefined
    layoutEditDockVisible.value = false
    return
  }

  const seenKeys = new Set<string>()
  const nextTargets: LayoutEditTargetProxy[] = []
  const appendTarget = (element: HTMLElement, descriptor?: LayoutEditTargetDescriptor) => {
    const key = descriptor?.key ?? element.dataset.layoutEditTarget
    const menu = descriptor?.menu
      ?? element.dataset.layoutSettingsMenu as SettingsNavigationTarget['menu'] | undefined
    if (!key || !menu || seenKeys.has(key) || !isLayoutEditCandidateVisible(element))
      return

    const rect = element.getBoundingClientRect()
    const left = Math.max(0, rect.left)
    const top = Math.max(0, rect.top)
    const right = Math.min(window.innerWidth, rect.right)
    const bottom = Math.min(window.innerHeight, rect.bottom)
    if (right <= left || bottom <= top)
      return

    seenKeys.add(key)
    element.classList.add('layout-edit-target--active')
    element.dataset.layoutEditActive = 'true'
    exposedLayoutEditElements.push(element)
    nextTargets.push({
      key,
      menu,
      direct: descriptor?.direct ?? element.hasAttribute('data-layout-edit-direct'),
      secondaryPage: descriptor?.secondaryPage ?? element.dataset.layoutSettingsPage,
      targetTitleKey: descriptor?.targetTitleKey ?? element.dataset.layoutSettingsTitleKey,
      left,
      top,
      width: right - left,
      height: bottom - top,
    })
  }

  mainAppRef.value
    .querySelectorAll<HTMLElement>('[data-layout-edit-target]')
    .forEach(element => appendTarget(element))

  const momentsGrid = mainAppRef.value.querySelector<HTMLElement>('.moments-grid')
  const videoCardGrid = mainAppRef.value.querySelector<HTMLElement>('.video-card-grid-container')
  layoutEditGridKind.value = momentsGrid && isLayoutEditCandidateVisible(momentsGrid)
    ? 'moments'
    : videoCardGrid && isLayoutEditCandidateVisible(videoCardGrid)
      ? 'video-card'
      : undefined

  if (isVideoOrBangumiPage()) {
    const player = document.querySelector<HTMLElement>('.bpx-player-container, #bilibili-player, .bilibili-player, .squirtle-video-wrap')
    if (player) {
      appendTarget(player, {
        key: 'video-page-player',
        menu: 'Bilibili',
        secondaryPage: 'player',
        targetTitleKey: 'settings.group_player_display_mode',
      })
    }

    const watchLaterButton = document.querySelector<HTMLElement>('.bewly-watch-later-btn')
    if (watchLaterButton) {
      appendTarget(watchLaterButton, {
        key: 'video-page-watch-later',
        menu: 'Bilibili',
        secondaryPage: 'player',
        targetTitleKey: 'settings.external_watch_later_button',
      })
    }
  }

  // 原站新版评论内部使用 Shadow DOM；只对外层评论区提供一个整体入口。
  const commentRegion = Array.from(document.querySelectorAll<HTMLElement>(
    'bili-comments, #commentapp, #comment-module, #comment-body, .commentapp, .comment-container, .bili-comment-container, .bb-comment',
  )).find(isLayoutEditCandidateVisible)
  if (commentRegion) {
    appendTarget(commentRegion, {
      key: 'page-comments',
      menu: 'Bilibili',
      secondaryPage: 'comments',
      targetTitleKey: 'settings.group_comments',
    })
  }

  if (isOriginalMomentsFeedPage()) {
    const originalMomentTargets = [
      {
        key: 'original-moments-user-card',
        enabled: settings.value.originalMomentsShowUserCard,
        targetTitleKey: 'settings.original_moments_show_user_card',
        selectors: [
          '.bili-dyn-home--member > aside.left > section:has(.bili-dyn-my-info)',
          '.bili-dyn-home--member > aside.left > section:has(.bili-dyn-my-info--skeleton)',
          '.bili-dyn-my-info',
          '.bili-dyn-my-info--skeleton',
        ],
      },
      {
        key: 'original-moments-live-list',
        enabled: settings.value.originalMomentsShowLiveList,
        targetTitleKey: 'settings.original_moments_show_live_list',
        selectors: [
          '.bili-dyn-home--member > aside.left > section:has(.bili-dyn-live-users)',
          '.bili-dyn-live-users',
        ],
      },
      {
        key: 'original-moments-community-center',
        enabled: settings.value.originalMomentsShowCommunityCenter,
        targetTitleKey: 'settings.original_moments_show_community_center',
        selectors: [
          '.bili-dyn-home--member > aside.right > section:has(.bili-dyn-banner)',
          '.bili-dyn-banner',
        ],
      },
      {
        key: 'original-moments-hot-search',
        enabled: settings.value.originalMomentsShowHotSearch,
        targetTitleKey: 'settings.original_moments_show_hot_search',
        selectors: [
          '.bili-dyn-home--member > aside.right > section:has(.bili-dyn-topic-box)',
          '.bili-dyn-home--member > aside.right > section:has(.bili-dyn-search-trendings)',
          '.bili-dyn-home--member > aside.right > section:has(.topic-panel)',
          '.bili-dyn-topic-box',
          '.bili-dyn-search-trendings',
          '.topic-panel',
        ],
      },
      {
        key: 'original-moments-up-list',
        enabled: settings.value.originalMomentsShowUpList,
        targetTitleKey: 'settings.original_moments_show_up_list',
        selectors: [
          '.bili-dyn-home--member > main > section:has(.bili-dyn-up-list)',
          '.bili-dyn-up-list',
        ],
      },
    ]

    originalMomentTargets.forEach((target) => {
      if (!target.enabled)
        return

      const element = target.selectors
        .map(selector => document.querySelector<HTMLElement>(selector))
        .find(candidate => candidate && isLayoutEditCandidateVisible(candidate))
      if (!element)
        return

      appendTarget(element, {
        key: target.key,
        menu: 'BewlyPages',
        secondaryPage: 'moments',
        targetTitleKey: target.targetTitleKey,
      })
    })
  }

  layoutEditTargets.value = nextTargets
  layoutEditDockVisible.value = nextTargets.some(target => target.key === 'dock-component')
}

function scheduleLayoutEditTargetsRefresh() {
  if (layoutEditTargetFrame !== undefined)
    return
  layoutEditTargetFrame = window.requestAnimationFrame(refreshLayoutEditTargets)
}

function stopLayoutEditTargetObserver() {
  layoutEditTargetObserver?.disconnect()
  layoutEditTargetObserver = undefined
  if (layoutEditTargetFrame !== undefined)
    window.cancelAnimationFrame(layoutEditTargetFrame)
  layoutEditTargetFrame = undefined
  clearExposedLayoutEditElements()
  layoutEditTargets.value = []
  layoutEditGridKind.value = undefined
  layoutEditDockVisible.value = false
}

function startLayoutEditTargetObserver() {
  stopLayoutEditTargetObserver()
  nextTick(() => {
    if (!isLayoutEditing.value || !mainAppRef.value)
      return

    refreshLayoutEditTargets()
    layoutEditTargetObserver = new MutationObserver(scheduleLayoutEditTargetsRefresh)
    layoutEditTargetObserver.observe(mainAppRef.value, { childList: true, subtree: true })
    layoutEditTargetObserver.observe(document.body, { childList: true, subtree: true })
  })
}

function isLayoutEditControlEvent(event: Event) {
  return event.composedPath().some((target) => {
    return target instanceof HTMLElement
      && (target.hasAttribute('data-layout-edit-control') || target.classList.contains('bew-confirm-dialog'))
  })
}

function getDirectLayoutEditTarget(event: Event) {
  return event.composedPath().find((target): target is HTMLElement => {
    return target instanceof HTMLElement
      && target.hasAttribute('data-layout-edit-target')
      && target.hasAttribute('data-layout-edit-direct')
  })
}

function blockOriginalLayoutInteraction(event: Event) {
  if (!isLayoutEditing.value || isLayoutEditControlEvent(event))
    return

  const directTarget = getDirectLayoutEditTarget(event)
  if (event.type === 'click' && directTarget) {
    const menu = directTarget.dataset.layoutSettingsMenu as SettingsNavigationTarget['menu'] | undefined
    if (menu) {
      openSettingsPage({
        menu,
        secondaryPage: directTarget.dataset.layoutSettingsPage,
        targetTitleKey: directTarget.dataset.layoutSettingsTitleKey,
      })
    }
  }

  if (event.cancelable)
    event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function openLayoutTargetSettings(target: LayoutEditTargetProxy) {
  openSettingsPage({
    menu: target.menu,
    secondaryPage: target.secondaryPage,
    targetTitleKey: target.targetTitleKey,
  })
}

const layoutEditDockPage = computed(() => {
  if (!isHomePage() || activatedPage.value === AppPage.SearchResults)
    return undefined
  return mainStore.getDockItemByPage(activatedPage.value)
})

const layoutEditDockPageConfig = computed(() => {
  return settings.value.dockItemsConfig.find(item => item.page === layoutEditDockPage.value?.page)
})

const showLayoutEditPageModeAction = computed(() => {
  return Boolean(
    isLayoutEditing.value
    && !settings.value.useOriginalBilibiliHomepage
    && layoutEditDockPage.value?.hasBewlyPage,
  )
})

const showLayoutEditSearchResultsAction = computed(() => {
  return isLayoutEditing.value && activatedPage.value === AppPage.SearchResults
})

const layoutEditGridActionKind = computed<'video-card' | 'moments' | undefined>(() => {
  if (!isLayoutEditing.value || settings.value.useOriginalBilibiliHomepage)
    return undefined

  if (activatedPage.value === AppPage.SearchResults)
    return 'video-card'

  const showingPluginDockPage = !layoutEditDockPageConfig.value?.useOriginalBiliPage
  if (showingPluginDockPage && activatedPage.value === AppPage.Home)
    return 'video-card'
  if (showingPluginDockPage && activatedPage.value === AppPage.Moments)
    return 'moments'

  return layoutEditGridKind.value
})

const layoutEditContextActions = computed<LayoutEditQuickSettingsAction[]>(() => {
  if (!isLayoutEditing.value)
    return []

  if (isVideoOrBangumiPage()) {
    return [
      {
        key: 'video-default-player-mode',
        labelKey: 'layout_editor.video_default_player_mode',
        icon: 'mingcute:play-circle-line',
        menu: 'Bilibili',
        secondaryPage: 'player',
        targetTitleKey: 'settings.video_default_player_mode',
      },
      {
        key: 'video-auto-play',
        labelKey: 'layout_editor.video_auto_play',
        icon: 'mingcute:list-check-3-line',
        menu: 'Bilibili',
        secondaryPage: 'auto-play',
        targetTitleKey: 'settings.group_playback_end_behavior',
      },
      {
        key: 'video-external-watch-later',
        labelKey: 'layout_editor.video_external_watch_later',
        icon: 'mingcute:carplay-line',
        menu: 'Bilibili',
        secondaryPage: 'player',
        targetTitleKey: 'settings.external_watch_later_button',
      },
      {
        key: 'video-sidebar-position',
        labelKey: 'layout_editor.video_sidebar_position',
        icon: 'mingcute:navigation-line',
        menu: 'BewlyComponents',
        secondaryPage: 'dock',
        targetTitleKey: 'settings.sidebar_position',
      },
      {
        key: 'video-topbar-auto-hide',
        labelKey: 'layout_editor.video_topbar_auto_hide',
        icon: 'mingcute:settings-3-line',
        menu: 'BewlyComponents',
        secondaryPage: 'topbar',
        targetTitleKey: 'settings.video_page_top_bar_config',
      },
    ]
  }

  if (isOriginalMomentsFeedPage()) {
    const actions: LayoutEditQuickSettingsAction[] = []
    const appendHiddenOriginalMomentAction = (
      visible: boolean,
      key: string,
      labelKey: string,
      icon: string,
      targetTitleKey: string,
    ) => {
      if (visible)
        return
      actions.push({
        key,
        labelKey,
        icon,
        menu: 'BewlyPages',
        secondaryPage: 'moments',
        targetTitleKey,
      })
    }

    appendHiddenOriginalMomentAction(
      settings.value.originalMomentsShowUserCard,
      'original-moments-show-user-card',
      'layout_editor.original_moments_show_user_card',
      'mingcute:settings-3-line',
      'settings.original_moments_show_user_card',
    )
    appendHiddenOriginalMomentAction(
      settings.value.originalMomentsShowLiveList,
      'original-moments-show-live-list',
      'layout_editor.original_moments_show_live_list',
      'mingcute:play-circle-line',
      'settings.original_moments_show_live_list',
    )
    appendHiddenOriginalMomentAction(
      settings.value.originalMomentsShowCommunityCenter,
      'original-moments-show-community-center',
      'layout_editor.original_moments_show_community_center',
      'mingcute:layout-grid-line',
      'settings.original_moments_show_community_center',
    )
    appendHiddenOriginalMomentAction(
      settings.value.originalMomentsShowHotSearch,
      'original-moments-show-hot-search',
      'layout_editor.original_moments_show_hot_search',
      'mingcute:search-2-line',
      'settings.original_moments_show_hot_search',
    )
    appendHiddenOriginalMomentAction(
      settings.value.originalMomentsShowUpList,
      'original-moments-show-up-list',
      'layout_editor.original_moments_show_up_list',
      'mingcute:list-check-3-line',
      'settings.original_moments_show_up_list',
    )
    return actions
  }

  if (activatedPage.value === AppPage.Moments && !layoutEditDockPageConfig.value?.useOriginalBiliPage) {
    return [
      {
        key: 'moments-content-filters',
        labelKey: 'layout_editor.moments_filter_content',
        icon: 'mingcute:list-check-3-line',
        menu: 'BewlyPages',
        secondaryPage: 'moments',
        targetTitleKey: 'settings.moments_filtered_types',
      },
      {
        key: 'moments-preview',
        labelKey: 'layout_editor.moments_preview',
        icon: 'mingcute:play-circle-line',
        menu: 'BewlyPages',
        secondaryPage: 'moments',
        targetTitleKey: 'settings.moments_enable_video_preview',
      },
    ]
  }

  if (activatedPage.value === AppPage.Search) {
    return [
      {
        key: 'search-suggestions-history',
        labelKey: 'layout_editor.search_suggestions_history',
        icon: 'mingcute:search-2-line',
        menu: 'BewlyPages',
        secondaryPage: 'search',
        targetTitleKey: 'settings.group_search_bar',
      },
      {
        key: 'search-wallpaper',
        labelKey: 'layout_editor.search_wallpaper',
        icon: 'mingcute:settings-3-line',
        menu: 'BewlyPages',
        secondaryPage: 'search',
        targetTitleKey: 'settings.group_wallpaper',
      },
    ]
  }

  if (activatedPage.value === AppPage.SearchResults) {
    return [
      {
        key: 'search-results-personalization',
        labelKey: 'layout_editor.search_results_personalization',
        icon: 'mingcute:search-2-line',
        menu: 'BewlyPages',
        secondaryPage: 'search',
        targetTitleKey: 'settings.depersonalize_search_results',
      },
      {
        key: 'search-results-pagination',
        labelKey: 'layout_editor.search_results_pagination',
        icon: 'mingcute:list-check-3-line',
        menu: 'BewlyPages',
        secondaryPage: 'search',
        targetTitleKey: 'settings.search_results_pagination_mode',
      },
    ]
  }

  if (activatedPage.value !== AppPage.Home || layoutEditDockPageConfig.value?.useOriginalBiliPage)
    return []

  if (homeActivatedPage.value === HomeSubPage.ForYou) {
    return [
      {
        key: 'home-recommendation-filters',
        labelKey: 'layout_editor.home_filter_recommendations',
        icon: 'mingcute:list-check-3-line',
        menu: 'BewlyPages',
        secondaryPage: 'home',
        targetTitleKey: 'settings.group_recommendation_filters',
      },
      {
        key: 'home-recommendation-mode',
        labelKey: 'layout_editor.home_recommendation_mode',
        icon: 'mingcute:settings-3-line',
        menu: 'BewlyPages',
        secondaryPage: 'home',
        targetTitleKey: 'settings.group_recommendation_mode',
      },
    ]
  }

  if (homeActivatedPage.value === HomeSubPage.Following) {
    return [
      {
        key: 'following-live-videos',
        labelKey: settings.value.followingTabShowLivestreamingVideos
          ? 'layout_editor.following_hide_live'
          : 'layout_editor.following_show_live',
        icon: 'mingcute:play-circle-line',
        menu: 'BewlyPages',
        secondaryPage: 'home',
        targetTitleKey: 'settings.following_tab_show_livestreaming_videos',
      },
      {
        key: 'following-uploader-list',
        labelKey: 'layout_editor.following_hide_uploader_list',
        icon: 'mingcute:settings-3-line',
        menu: 'BewlyPages',
        secondaryPage: 'home',
        targetTitleKey: 'settings.use_following_new_layout',
      },
      {
        key: 'following-content-filters',
        labelKey: 'layout_editor.following_filter_videos',
        icon: 'mingcute:list-check-3-line',
        menu: 'BewlyPages',
        secondaryPage: 'home',
        targetTitleKey: 'settings.following_filter_charging_videos',
      },
    ]
  }

  return []
})

function openLayoutEditPageModeSettings() {
  const dockPage = layoutEditDockPage.value
  if (!dockPage)
    return

  openSettingsPage({
    menu: 'BewlyComponents',
    secondaryPage: 'dock',
    targetTitleKey: dockPage.i18nKey,
  })
}

function openLayoutEditGridSettings() {
  if (layoutEditGridActionKind.value === 'moments') {
    openSettingsPage({
      menu: 'BewlyPages',
      secondaryPage: 'moments',
      targetTitleKey: 'settings.moments_grid_columns',
    })
    return
  }

  if (layoutEditGridActionKind.value === 'video-card') {
    openSettingsPage({
      menu: 'BewlyComponents',
      secondaryPage: 'video-card',
      targetTitleKey: 'settings.grid_breakpoints',
    })
  }
}

function openLayoutEditDockPositionSettings() {
  openSettingsPage({
    menu: 'BewlyComponents',
    secondaryPage: 'dock',
    targetTitleKey: 'settings.dock_position',
  })
}

function openLayoutEditTopBarModeSettings() {
  openSettingsPage({
    menu: 'BewlyComponents',
    secondaryPage: 'topbar',
    targetTitleKey: 'topbar.top_bar_switcher',
  })
}

function openLayoutEditSearchResultsSettings() {
  openSettingsPage({
    menu: 'BewlyPages',
    secondaryPage: 'search',
    targetTitleKey: 'settings.group_search_results',
  })
}

function openLayoutEditContextSettings(action: LayoutEditQuickSettingsAction) {
  openSettingsPage({
    menu: action.menu,
    secondaryPage: action.secondaryPage,
    targetTitleKey: action.targetTitleKey,
  })
}

watch(isLayoutEditing, (editing) => {
  if (editing) {
    mainAppRef.value?.querySelector<HTMLElement>(':focus')?.blur()
    startLayoutEditTargetObserver()
    window.setTimeout(scheduleLayoutEditTargetsRefresh, 350)
    window.setTimeout(scheduleLayoutEditTargetsRefresh, 1200)
    window.setTimeout(scheduleLayoutEditTargetsRefresh, 2500)
  }
  else {
    stopLayoutEditTargetObserver()
  }
}, { immediate: true })

watch(() => settings.value.showLayoutEditButton, (visible) => {
  if (!visible && isLayoutEditing.value)
    exitLayoutEditMode()
})

watch(() => settings.value.dockPosition, () => {
  nextTick(scheduleLayoutEditTargetsRefresh)
  window.setTimeout(scheduleLayoutEditTargetsRefresh, 350)
})

watch(activatedPage, scheduleLayoutEditTargetsRefresh)

watch(
  [
    () => settings.value.originalMomentsShowUserCard,
    () => settings.value.originalMomentsShowLiveList,
    () => settings.value.originalMomentsShowCommunityCenter,
    () => settings.value.originalMomentsShowHotSearch,
    () => settings.value.originalMomentsShowUpList,
  ],
  scheduleLayoutEditTargetsRefresh,
)

useEventListener(window, 'resize', scheduleLayoutEditTargetsRefresh)
useEventListener(window, 'scroll', scheduleLayoutEditTargetsRefresh, { passive: true })
onUnmounted(stopLayoutEditTargetObserver)
const scrollViewportRef = ref<HTMLElement | null>(null)
// Firefox 原生滚动条无法自定义外观，仅 Firefox 包提供可选的重绘滚动条
const useFirefoxScrollbar = computed(() => isFirefoxBuild && settings.value.enableFirefoxScrollbarRepaint)
watch(scrollViewportRef, (viewport, _previousViewport, onCleanup) => {
  if (viewport && isHomePage() && !settings.value.useOriginalBilibiliHomepage)
    onCleanup(installScrollBridge(viewport))
}, { flush: 'post' })

function handlePageBackgroundMouseDown(event: MouseEvent) {
  // Only background elements bind this with .self. Avoid starting a native
  // selection across the feed from its gutters, while keeping card text selectable.
  if (activatedPage.value === AppPage.Home && event.button === 0)
    event.preventDefault()
}
const loadMoreSentinelRef = ref<HTMLElement>() // ✅ IntersectionObserver 哨兵元素
const handlePageRefresh = ref<() => void>()
const handleReachBottom = ref<() => void>()
const handleUndoRefresh = ref<() => void>()
const handleForwardRefresh = ref<() => void>()
const canRefreshHomeSubPage = ref<boolean>(false)
// 使用新的枚举状态管理撤销/前进按钮
const undoForwardState = ref<UndoForwardState>(UndoForwardState.Hidden)
const canRefreshCurrentPage = computed((): boolean => {
  return activatedPage.value !== AppPage.Home || homeActivatedPage.value !== HomeSubPage.Following || canRefreshHomeSubPage.value
})
let refreshScrollTimer: ReturnType<typeof setTimeout> | undefined

function cancelPendingPageRefresh() {
  clearTimeout(refreshScrollTimer)
  refreshScrollTimer = undefined
}

onBeforeUnmount(cancelPendingPageRefresh)

const handleThrottledPageRefresh = useThrottleFn(() => {
  cancelPendingPageRefresh()
  if (!canRefreshCurrentPage.value)
    return

  const viewport = scrollViewportRef.value
  if (!viewport) {
    handlePageRefresh.value?.()
    return
  }
  if (viewport.scrollTop === 0) {
    handlePageRefresh.value?.()
  }
  else {
    handleBackToTop()
    const refresh = handlePageRefresh.value
    const deadline = performance.now() + 3000
    const checkScrollComplete = () => {
      refreshScrollTimer = undefined
      if (!viewport.isConnected || viewport !== scrollViewportRef.value || refresh !== handlePageRefresh.value)
        return

      if (viewport.scrollTop <= 1) {
        refresh?.()
      }
      else if (performance.now() < deadline) {
        refreshScrollTimer = setTimeout(checkScrollComplete, 50)
      }
    }
    refreshScrollTimer = setTimeout(checkScrollComplete, 100)
  }
}, 500)
const handleThrottledReachBottom = useThrottleFn(() => handleReachBottom.value?.(), 200)
const handleThrottledBackToTop = useThrottleFn(() => handleBackToTop(), 500)
const handleThrottledPageUnRefresh = useThrottleFn(() => handleUndoRefresh.value?.(), 500)
const handleThrottledPageForwardRefresh = useThrottleFn(() => handleForwardRefresh.value?.(), 500)
const topBarRef = ref()
const reachTop = ref<boolean>(true)
const scrollTop = ref<number>(0)

watch(isHomeTabSwitching, (switching) => {
  if (switching)
    return

  // IntersectionObserver may have reported an intersection while callbacks were
  // suspended. Recheck once after restoration so a genuinely short/bottom page
  // can still request more content without waiting for another scroll event.
  requestAnimationFrame(() => {
    const viewport = scrollViewportRef.value
    const sentinel = loadMoreSentinelRef.value
    if (!viewport || !sentinel || isHomeTabSwitching.value)
      return

    const viewportRect = viewport.getBoundingClientRect()
    const sentinelRect = sentinel.getBoundingClientRect()
    if (sentinelRect.top <= viewportRect.bottom + 200 && sentinelRect.bottom >= viewportRect.top)
      handleThrottledReachBottom()
  })
})

const iframeDrawerURL = ref<string>('')
const showIframeDrawer = ref<boolean>(false)
// 每次打开分配新 id，替换已打开的弹窗时重新挂载 iframe
const videoDialog = ref<{ id: number, url: string } | null>(null)
let videoDialogId = 0

// 添加活跃抽屉状态管理
const activeDrawer = ref<DrawerType>(DrawerType.None)
function setActiveDrawer(drawer: DrawerType) {
  activeDrawer.value = drawer
}

// 用于控制当iframe内打开图片预览时隐藏顶栏和Dock
const hideUIForIframePhotoViewer = ref<boolean>(false)

const iframePageRef = ref()
// 只接受当前 Bewly 界面持有的 iframe 请求；消息仅携带关键词，不接受任意跳转 URL。
useEventListener(window, 'message', ({ data, source, origin }) => {
  if (data?.type !== IFRAME_SEARCH_NAVIGATION || typeof data.keyword !== 'string' || !data.keyword.trim())
    return

  const frames = document.getElementById('bewly')?.shadowRoot?.querySelectorAll<HTMLIFrameElement>('iframe')
  const frame = Array.from(frames ?? []).find(iframe => iframe.contentWindow === source)
  if (!frame)
    return
  try {
    if (new URL(frame.src).origin !== origin || !/^https?:\/\/(?:[\w-]+\.)?bilibili\.com$/.test(origin))
      return
  }
  catch {
    return
  }

  navigateToPluginSearchResults(data.keyword)
})
useEventListener(window, 'message', ({ data, source }) => {
  if (typeof data !== 'string')
    return

  const iframe = iframePageRef.value?.$el?.querySelector('iframe')
  if (!iframe || source !== iframe.contentWindow)
    return

  switch (data) {
    case IFRAME_PAGE_SWITCH_BEWLY:
      {
        const currentDockItemConfig = settingsStore.getDockItemConfigByPage(activatedPage.value)
        if (currentDockItemConfig)
          currentDockItemConfig.useOriginalBiliPage = false
      }
      break
    case IFRAME_PAGE_SWITCH_BILI:
      {
        const currentDockItemConfig = settingsStore.getDockItemConfigByPage(activatedPage.value)
        if (currentDockItemConfig)
          currentDockItemConfig.useOriginalBiliPage = true
      }
      break
  }
})

// 监听来自iframe的图片预览器状态
useEventListener(window, 'message', ({ data, source }) => {
  // 确保消息来自iframe
  if (!data || data.type !== 'IFRAME_PHOTO_VIEWER_STATE')
    return

  // 检查消息来源是否是iframe
  const iframe = iframePageRef.value?.$el?.querySelector('iframe')
  if (iframe && source === iframe.contentWindow) {
    hideUIForIframePhotoViewer.value = data.isOpen
  }
})

const iframePageURL = computed((): string => {
  // If the iframe is not the BiliBili homepage or in iframe, then don't show the iframe page
  if (!isHomePage(window.self.location.href) || isInIframe() || settings.value.useOriginalBilibiliHomepage)
    return ''
  const currentDockItemConfig = settings.value.dockItemsConfig.find(e => e.page === activatedPage.value)
  if (currentDockItemConfig) {
    return currentDockItemConfig.useOriginalBiliPage || !mainStore.getDockItemByPage(activatedPage.value)?.hasBewlyPage ? mainStore.getBiliWebPageURLByPage(activatedPage.value) : ''
  }
  return ''
})
const showBewlyPage = computed((): boolean => {
  if (isInIframe())
    return false

  // SearchResults 页面是虚拟页面，不在 dockItems 中，但应该显示
  if (activatedPage.value === AppPage.SearchResults) {
    return isHomePage() && !settings.value.useOriginalBilibiliHomepage
  }

  const dockItem = mainStore.getDockItemByPage(activatedPage.value)
  if (!dockItem?.hasBewlyPage)
    return false

  if (iframePageURL.value)
    return false

  return isHomePage() && !settings.value.useOriginalBilibiliHomepage
})

// Bewly 页面关闭时没有可切换的插件页，Dock 作为全站导航显示在所有页面。
const showDock = computed((): boolean => {
  if (!settings.value.enableDock)
    return false

  return settings.value.useOriginalBilibiliHomepage
    || settings.value.alwaysUseDock
    || showBewlyPage.value
    || Boolean(iframePageURL.value)
})

// App outlives page components. Drop outgoing closures before the next page
// registers its actions so evicted KeepAlive pages and their lists can be collected.
watch([activatedPage, () => activatedPage.value === AppPage.Home ? homeActivatedPage.value : undefined, showBewlyPage], () => {
  cancelPendingPageRefresh()
  handlePageRefresh.value = undefined
  handleReachBottom.value = undefined
  handleUndoRefresh.value = undefined
  handleForwardRefresh.value = undefined
  undoForwardState.value = UndoForwardState.Hidden
  canRefreshHomeSubPage.value = false
}, { flush: 'sync' })

// Keep the browser tab title in sync with the page selected from the Dock.
// Search results manages its own keyword-aware title in SearchResults.vue.
const dockPageTitle = computed<string | undefined>(() => {
  if (activatedPage.value === AppPage.SearchResults)
    return undefined

  const titleKey = activatedPage.value === AppPage.Home
    ? mainStore.homeTabs.find(tab => tab.page === homeActivatedPage.value)?.i18nKey
    : mainStore.getDockItemByPage(activatedPage.value)?.i18nKey

  if (!titleKey)
    return undefined

  if (activatedPage.value === AppPage.Home)
    return `首页-${t(titleKey)}-哔哩哔哩`

  return `${t(titleKey)} - 哔哩哔哩`
})

watch(dockPageTitle, (title) => {
  if (title && isHomePage())
    document.title = title
}, { immediate: true })

const isOriginalTopBarActive = computed(() => shouldShowOriginalBilibiliTopBar(
  settings.value.enableTopBarModule,
  settings.value.enableTopBar,
  settings.value.useOriginalBilibiliTopBar,
))

const showTopBar = computed((): boolean => {
  // 模块关闭时不挂载顶栏组件，账号同步由 useAccountSync 继续负责。
  if (!settings.value.enableTopBarModule)
    return false

  // When using the open in drawer feature, the iframe inside the page will hide the top bar
  if (isVideoOrBangumiPage() && isInIframe())
    return false

  // when user open the notifications page as a drawer, don't show the top bar
  if (isNotificationPage() && settings.value.openNotificationsPageAsDrawer && isInIframe())
    return false

  // Always show TopBar in the outer layer, never inside iframe
  // This ensures TopBar is always visible outside of iframe content
  if (isInIframe())
    return false

  // when using original bilibili homepage, show top bar
  return settings.value.useOriginalBilibiliHomepage
  // when on home page and not using original bilibili page, show top bar
    || (isHomePage() && !settingsStore.getDockItemIsUseOriginalBiliPage(activatedPage.value))
  // when using original bilibili page on home page, show top bar in outer layer
    || (isHomePage() && settingsStore.getDockItemIsUseOriginalBiliPage(activatedPage.value))
  // when not on home page, show top bar
    || !isHomePage()
})

function getActiveElement(): Element | null {
  const shadowRoot = document.getElementById('bewly')?.shadowRoot
  return shadowRoot?.activeElement || document.activeElement
}

function isEditableElement(element: Element | null): boolean {
  return element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
    || (element instanceof HTMLElement && (element.isContentEditable || !!element.closest('[contenteditable="true"]')))
}

function focusScrollViewport(options: { force?: boolean } = {}) {
  nextTick(() => {
    const viewport = scrollViewportRef.value
    if (!viewport || !showBewlyPage.value)
      return

    if (!options.force && (activeDrawer.value !== DrawerType.None || isEditableElement(getActiveElement())))
      return

    viewport.focus({ preventScroll: true })
  })
}

const isFirstTimeActivatedPageChange = ref<boolean>(true)
function syncNavigationUrl() {
  const url = new URL(window.location.href)
  // 停留在默认首页及默认标签时不写入参数，切换后再记录 page/tab。
  const keepTab = activatedPage.value === AppPage.Home
    && homeActivatedPage.value !== getDefaultHomeSubPage(settings.value.homePageTabVisibilityList)
  const keepPage = keepTab
    || activatedPage.value !== AppPage.Home
    || getDefaultAppPage() !== AppPage.Home
  if (keepPage)
    url.searchParams.set('page', activatedPage.value)
  else
    url.searchParams.delete('page')
  if (keepTab)
    url.searchParams.set('tab', homeActivatedPage.value)
  else
    url.searchParams.delete('tab')
  if (url.href !== window.location.href)
    window.history.replaceState(window.history.state, '', url.href)
}

watch(homeActivatedPage, () => {
  if (isHomePage() && activatedPage.value === AppPage.Home)
    syncNavigationUrl()
}, { immediate: true })

watch(
  () => activatedPage.value,
  () => {
    if (!isFirstTimeActivatedPageChange.value) {
      syncNavigationUrl()
    }

    const viewport = scrollViewportRef.value
    if (viewport)
      jumpScrollTo(viewport, 0)
    focusScrollViewport()
    isFirstTimeActivatedPageChange.value = false
  },
  { immediate: true },
)

watch(
  () => showBewlyPage.value,
  (visible) => {
    if (visible)
      focusScrollViewport()
  },
  { immediate: true, flush: 'post' },
)

watch([() => showTopBar.value, () => activatedPage.value], () => {
  // Remove the original Bilibili top bar when using original bilibili page to avoid two top bars showing
  const biliHeader = document.querySelector('.bili-header') as HTMLElement | null
  if (biliHeader && isHomePage()) {
    if (settingsStore.getDockItemIsUseOriginalBiliPage(activatedPage.value) && !isInIframe() && !settings.value.useOriginalBilibiliHomepage) {
      biliHeader.style.visibility = 'hidden'
    }
    else {
      biliHeader.style.visibility = 'visible'
    }
  }
}, { immediate: true })

// Setup necessary settings watchers
setupNecessarySettingsWatchers()
let scrollingEmitted = false
let isAppMounted = false
let stopHomeKeyStroke: (() => void) | null = null
let stopLoadMoreIntersectionObserver: (() => void) | null = null

function handleMetaHomeKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowUp' && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    handleThrottledBackToTop()
    focusScrollViewport({ force: true })
    e.preventDefault()
  }
}

function handleDocumentScroll() {
  if (scrollViewportRef.value && isHomePage() && !settings.value.useOriginalBilibiliHomepage)
    return

  scrollTop.value = window.scrollY
  reachTop.value = window.scrollY <= 0
}

onMounted(() => {
  isAppMounted = true
  window.dispatchEvent(new CustomEvent(BEWLY_MOUNTED))

  // ✅ 设置 IntersectionObserver 用于无限滚动底部检测（仅在首页且使用Bewly页面时）
  // 避免在每次滚动时读取 scrollHeight/clientHeight
  if (isHomePage() && !settings.value.useOriginalBilibiliHomepage) {
    nextTick(() => {
      if (!isAppMounted)
        return

      const viewport = scrollViewportRef.value
      if (!viewport)
        return

      stopLoadMoreIntersectionObserver?.()
      const { stop } = useIntersectionObserver(
        loadMoreSentinelRef,
        ([{ isIntersecting }]) => {
          if (isIntersecting && !isHomeTabSwitching.value) {
            handleThrottledReachBottom()
          }
        },
        {
          root: viewport,
          rootMargin: '200px', // 提前 200px 触发加载
          threshold: 0,
        },
      )
      stopLoadMoreIntersectionObserver = stop
    })
  }

  if (isHomePage() && !settings.value.useOriginalBilibiliHomepage) {
    focusScrollViewport()

    // Windows/Linux: 监听 Home 键
    stopHomeKeyStroke = onKeyStroke('Home', (e) => {
      handleThrottledBackToTop()
      focusScrollViewport({ force: true })
      e.preventDefault()
    })

    // macOS: 使用原生事件监听 Command+↑ 组合键
    document.addEventListener('keydown', handleMetaHomeKeydown)
  }

  document.addEventListener('scroll', handleDocumentScroll, { passive: true })
  // 刷新后停在半页时，首帧就要有正确的滚动状态（reachTop 与遮罩强度）
  handleDocumentScroll()
  void promptSettingsMigrationIfNeeded()
})

function handleDockItemClick(dockItem: DockItem) {
  // Bewly 页面关闭时直接跳转原站页面，不经过 iframe。
  if (settings.value.useOriginalBilibiliHomepage) {
    if (dockItem.openInNewTab)
      openLinkToNewTab(dockItem.url)
    else
      location.href = dockItem.url
    return
  }

  // Opening in a new tab while still on the current tab doesn't require changing the `activatedPage`
  if (dockItem.openInNewTab) {
    openLinkToNewTab(`https://www.bilibili.com/?page=${dockItem.page}`)
  }
  else {
    if (dockItem.useOriginalBiliPage) {
      // It seem like the `activatedPage` watcher above will handle this, so no need to set iframePageURL.value here
      // iframePageURL.value = dockItem.url
      if (!isHomePage()) {
        location.href = `https://www.bilibili.com/?page=${dockItem.page}`
      }
    }
    else {
      if (isHomePage()) {
        changeActivatePage(dockItem.page)
      }
      else {
        location.href = `https://www.bilibili.com/?page=${dockItem.page}`
      }
    }

    // When not opened in a new tab, change the `activatedPage`
    activatedPage.value = dockItem.page

    // Clear search keyword and URL params when switching to/from search pages (only on homepage)
    if (isHomePage() && !isSearchResultsPage()) {
      // 从 SearchResults 返回 Search 页面时清理搜索参数
      if (dockItem.page === AppPage.Search) {
        topBarStore.searchKeyword = ''
        clearSearchParamsFromUrl()
      }
      // 从 Search/SearchResults 切换到其他页面时清理搜索参数
      else if (dockItem.page !== AppPage.SearchResults) {
        topBarStore.searchKeyword = ''
        clearSearchParamsFromUrl()
      }
    }
  }
}

function changeActivatePage(pageName: AppPage) {
  const scrollTop: number = scrollViewportRef.value?.scrollTop ?? 0

  if (activatedPage.value === pageName) {
    if (activatedPage.value !== AppPage.Search && activatedPage.value !== AppPage.SearchResults) {
      if (scrollTop === 0)
        handleThrottledPageRefresh()
      else
        handleThrottledBackToTop()
    }
    return
  }
  activatedPage.value = pageName
}

function handleBackToTop(targetScrollTop = 0 as number) {
  const viewport = scrollViewportRef.value
  if (viewport) {
    scrollToTop(viewport, targetScrollTop)
    topBarRef.value?.toggleTopBarVisible(true)
  }

  iframePageRef.value?.handleBackToTop()
}

function handleScrollJump(targetScrollTop = 0 as number) {
  const viewport = scrollViewportRef.value
  if (viewport) {
    jumpScrollTo(viewport, targetScrollTop)
    topBarRef.value?.toggleTopBarVisible(true)
  }
}

// 添加滚动结束检测
let scrollEndTimer: ReturnType<typeof setTimeout> | null = null
let scrollStateTimer: ReturnType<typeof setTimeout> | null = null
let lastScrollTop = 0
let rafId: number | null = null
let latestScrollTop = 0

function handleOsScroll(_instance: any, event: Event) {
  // 从事件的 target 读取 scrollTop，避免调用 osInstance().elements() 触发强制布局
  latestScrollTop = (event.target as HTMLElement | null)?.scrollTop ?? 0

  // 如果已经有 RAF 在等待，跳过本次滚动事件
  if (rafId !== null)
    return

  // 只在滚动开始时发出一次信号（避免额外的响应式开销）
  if (!scrollingEmitted) {
    emitter.emit(OVERLAY_SCROLL_STATE_CHANGE, true)
    scrollingEmitted = true
  }

  // 使用 RAF 将所有 DOM 读取合并到下一帧
  rafId = requestAnimationFrame(() => {
    const frameScrollTop = latestScrollTop

    emitter.emit(OVERLAY_SCROLL_BAR_SCROLL, frameScrollTop)
    if (isOriginalTopBarActive.value)
      setOriginalBilibiliTopBarScrolled(document, frameScrollTop > 0)

    // 只在滚动距离超过阈值时更新状态
    const scrollDelta = Math.abs(frameScrollTop - lastScrollTop)
    if (scrollDelta > 50) {
      lastScrollTop = frameScrollTop
    }

    scrollTop.value = frameScrollTop
    reachTop.value = frameScrollTop === 0

    // IntersectionObserver 只在相交状态变化时回调，dock 切页等时机可能丢失边缘事件
    // （如切走时哨兵处于相交中，切回后状态未发生跳变），滚动时按几何位置兜底触发
    const viewportEl = scrollViewportRef.value
    const sentinelEl = loadMoreSentinelRef.value
    if (viewportEl && sentinelEl && !isHomeTabSwitching.value) {
      const viewportRect = viewportEl.getBoundingClientRect()
      const sentinelRect = sentinelEl.getBoundingClientRect()
      if (sentinelRect.top <= viewportRect.bottom + 200 && sentinelRect.bottom >= viewportRect.top)
        handleThrottledReachBottom()
    }

    // 清除之前的滚动结束定时器
    if (scrollEndTimer) {
      clearTimeout(scrollEndTimer)
    }

    // 清除之前的滚动状态定时器
    if (scrollStateTimer) {
      clearTimeout(scrollStateTimer)
    }

    // 设置滚动状态结束检测，150ms后发出滚动结束信号
    scrollStateTimer = setTimeout(() => {
      emitter.emit(OVERLAY_SCROLL_STATE_CHANGE, false)
      scrollingEmitted = false
    }, 150)

    // ✅ 简化滚动结束检测：移除 DOM 读取，IntersectionObserver 会处理底部检测
    scrollEndTimer = setTimeout(() => {
      // IntersectionObserver 会处理底部触发，这里只保留定时器结构以备将来扩展
    }, 150)

    rafId = null
  })
}

function handleNativeScroll(event: Event) {
  handleOsScroll(null, event)
}

onUnmounted(() => {
  isAppMounted = false
  stopHomeKeyStroke?.()
  stopHomeKeyStroke = null
  stopLoadMoreIntersectionObserver?.()
  stopLoadMoreIntersectionObserver = null
  document.removeEventListener('keydown', handleMetaHomeKeydown)
  document.removeEventListener('scroll', handleDocumentScroll)

  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  if (scrollStateTimer) {
    clearTimeout(scrollStateTimer)
    scrollStateTimer = null
  }
  if (scrollEndTimer) {
    clearTimeout(scrollEndTimer)
    scrollEndTimer = null
  }
  if (scrollingEmitted) {
    emitter.emit(OVERLAY_SCROLL_STATE_CHANGE, false)
    scrollingEmitted = false
  }
})

function openIframeDrawer(url: string) {
  const isSameOrigin = (origin: URL, destination: URL) =>
    origin.protocol === destination.protocol && origin.host === destination.host && origin.port === destination.port

  const currentUrl = new URL(location.href)
  const destination = new URL(url)

  try {
    if (!isSameOrigin(currentUrl, destination)) {
      openLinkToNewTab(url)
      return
    }
  }
  catch {
    openLinkToNewTab(url)
    return
  }

  setActiveDrawer(DrawerType.IframeDrawer)
  iframeDrawerURL.value = url
  showIframeDrawer.value = true
}

function openVideoDialog(url: string) {
  if (!canOpenInVideoDialog(url)) {
    openLinkToNewTab(url)
    return
  }

  videoDialog.value = { id: ++videoDialogId, url }
}

/**
 * Checks if the current viewport has a scrollbar.
 * @returns {Promise<boolean>} Returns true if the viewport has a scrollbar, false otherwise.
 */
async function haveScrollbar() {
  await nextTick()
  // Read after the browser has laid out the newly rendered cards; reading right
  // after the Vue flush forced that layout synchronously after every page load.
  // Hidden tabs do not run animation frames, so a timeout keeps loading going.
  await new Promise<void>((resolve) => {
    const fallback = window.setTimeout(resolve, 100)
    requestAnimationFrame(() => setTimeout(() => {
      window.clearTimeout(fallback)
      resolve()
    }, 0))
  })
  const viewport = scrollViewportRef.value
  if (!viewport)
    return false

  return viewport.scrollHeight > viewport.clientHeight
}

// In drawer/dialog video, watch btn className changed and post message to parent
watchEffect(async (onCleanUp) => {
  if (!isInIframe())
    return null

  const webFullscreenBtnSelector = '.bpx-player-ctrl-web, .bilibili-player-video-web-fullscreen, .squirtle-video-pagefullscreen'

  function notifyDrawerPageFullscreen(el: HTMLElement) {
    const entered = el.classList.contains('bpx-state-entered')
      || !!document.querySelector('[data-screen="web"]')
    parent.postMessage(entered ? DRAWER_VIDEO_ENTER_PAGE_FULL : DRAWER_VIDEO_EXIT_PAGE_FULL)
  }

  const observer = new MutationObserver(([{ target: el }]) => {
    if (!(el instanceof HTMLElement))
      return
    notifyDrawerPageFullscreen(el)
  })

  const abort = new AbortController()
  queryDomUntilFound(webFullscreenBtnSelector, 500, abort).then((openVideo2WebFullBtn) => {
    if (!openVideo2WebFullBtn)
      return
    notifyDrawerPageFullscreen(openVideo2WebFullBtn)
    observer.observe(openVideo2WebFullBtn, { attributes: true, attributeFilter: ['class'] })
  })

  onCleanUp(() => {
    observer.disconnect()
    abort.abort()
  })
})

provide<BewlyAppProvider>('BEWLY_APP', {
  activatedPage,
  homeActivatedPage,
  homeActivatedPageTouched,
  isHomeTabSwitching,
  mainAppRef,
  scrollViewportRef,
  reachTop,
  scrollTop,
  searchFocusOverlayActive,
  handleBackToTop,
  handleScrollJump,
  handlePageRefresh,
  refreshCurrentPage: handleThrottledPageRefresh,
  canRefreshHomeSubPage,
  handleReachBottom,
  handleUndoRefresh,
  handleForwardRefresh,
  undoForwardState,
  openIframeDrawer,
  openVideoDialog,
  haveScrollbar,
  activeDrawer,
  setActiveDrawer,
  openSettings: openSettingsPage,
})

if (settings.value.cleanUrlArgument) {
  const BASE_PARAMS_TO_REMOVE = new Set([
    'spm_id_from',
    'hcfrom',
    'from_source',
    'msource',
    'bsource',
    'seid',
    'source',
    'session_id',
    'visit_id',
    'sourceFrom',
    'from_spmid',
    'share_source',
    'share_medium',
    'share_plat',
    'share_session_id',
    'share_tag',
    'unique_k',
    'csource',
    'vd_source',
    'tab',
    'is_story_h5',
    'share_from',
    'plat_id',
    '-Arouter',
    'launch_id',
    'live_from',
    'hotRank',
    'broadcast_type',
    'trackid',
  ])
  const VIDEO_ONLY_PARAMS_TO_REMOVE = new Set([
    'buvid',
    'mid',
    'spmid',
    'timestamp',
    'up_id',
  ])

  let isCleaningUrl = false // 防止重复执行
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null
  let lastCleanedUrl = window.location.href
  let urlChangeSyncQueued = false

  function cleanUrlParams() {
    // 防止在页面加载过程中执行URL清理
    if (isCleaningUrl || document.readyState === 'loading') {
      return
    }

    try {
      isCleaningUrl = true
      const sourceUrl = window.location.href
      const currentUrl = new URL(window.location.href)
      let hasChanged = false

      for (const param of BASE_PARAMS_TO_REMOVE) {
        if (param === 'tab' && getHomeTabParam(currentUrl))
          continue
        if (currentUrl.searchParams.has(param)) {
          currentUrl.searchParams.delete(param)
          hasChanged = true
        }
      }
      const hostname = currentUrl.hostname
      if ((hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com')) && stripBilibiliLocalePathname(currentUrl.pathname).startsWith('/video/')) {
        for (const param of VIDEO_ONLY_PARAMS_TO_REMOVE) {
          if (currentUrl.searchParams.has(param)) {
            currentUrl.searchParams.delete(param)
            hasChanged = true
          }
        }
      }

      if (hasChanged) {
        const newUrl = currentUrl.toString()
          .replace(/([^:])\/\/(?!\/)/g, '$1/') // 只替换中间的双斜杠，不处理末尾的斜杠
          .replace(/%3D/gi, '=')
          .replace(/%26/g, '&')

        const applyCleanUrl = () => {
          // 空闲回调执行前可能已切换 tab，旧地址不能覆盖新的导航状态。
          if (window.location.href === sourceUrl) {
            history.replaceState(history.state, '', newUrl)
            lastCleanedUrl = window.location.href
          }
          isCleaningUrl = false
          if (window.location.href !== newUrl)
            scheduleCleanup()
        }
        // 使用 requestIdleCallback 来避免阻塞页面加载
        if (window.requestIdleCallback) {
          window.requestIdleCallback(applyCleanUrl)
        }
        else {
          setTimeout(applyCleanUrl, 0)
        }
      }
      else {
        isCleaningUrl = false
      }
    }
    catch (error) {
      console.warn('URL清理失败:', error)
      isCleaningUrl = false
    }
  }

  // 延迟执行URL清理，确保页面完全加载后再执行
  function scheduleCleanup(delay = 2000) {
    if (cleanupTimer) {
      clearTimeout(cleanupTimer)
    }
    cleanupTimer = setTimeout(() => {
      if (document.readyState === 'complete') {
        cleanUrlParams()
      }
    }, delay)
  }

  // 只在页面完全加载后执行清理
  if (document.readyState === 'complete') {
    scheduleCleanup(1000)
  }
  else {
    window.addEventListener('load', () => scheduleCleanup(1000), { once: true })
  }

  function syncUrlCleanupAfterNavigation() {
    if (urlChangeSyncQueued)
      return

    urlChangeSyncQueued = true
    // pushState/replaceState 通知在原生 history 方法执行前派发，等微任务
    // 再读取最终 URL，并合并同一轮中的重复路由事件。
    queueMicrotask(() => {
      urlChangeSyncQueued = false
      if (window.location.href === lastCleanedUrl)
        return

      lastCleanedUrl = window.location.href
      scheduleCleanup(2000)
    })
  }

  useEventListener(window, 'pushstate', syncUrlCleanupAfterNavigation)
  useEventListener(window, 'replacestate', syncUrlCleanupAfterNavigation)
  useEventListener(window, 'popstate', syncUrlCleanupAfterNavigation)
  useEventListener(window, 'hashchange', syncUrlCleanupAfterNavigation)
  useEventListener(window, 'pageshow', syncUrlCleanupAfterNavigation)
  useEventListener(document, 'visibilitychange', () => {
    if (!document.hidden)
      syncUrlCleanupAfterNavigation()
  })

  onUnmounted(() => {
    if (cleanupTimer)
      clearTimeout(cleanupTimer)
  })
}
</script>

<template>
  <div
    id="bewly-wrapper"
    ref="mainAppRef"
    class="bewly-wrapper"
    :class="{
      'dark': isDark,
      'bewly-wrapper--viewport': isHomePage() && !settings.useOriginalBilibiliHomepage,
      [SELECTION_FALLBACK_CLASS]: !supportsHighlightInheritance(),
    }"
    text="$bew-text-1"
    @pointerdown.capture="blockOriginalLayoutInteraction"
    @click.capture="blockOriginalLayoutInteraction"
    @auxclick.capture="blockOriginalLayoutInteraction"
    @contextmenu.capture="blockOriginalLayoutInteraction"
    @keydown.capture="blockOriginalLayoutInteraction"
    @scroll.capture.passive="scheduleLayoutEditTargetsRefresh"
  >
    <!-- Background -->
    <template v-if="showBewlyPage && !settings.disableBackground">
      <AppBackground :activated-page="activatedPage" @wallpaper-ready="pageWallpaperReady = $event" />
    </template>

    <Transition name="fade">
      <svg
        v-if="isLayoutEditing"
        class="layout-edit-backdrop"
        aria-hidden="true"
        @wheel.prevent
        @touchmove.prevent
      >
        <defs>
          <mask id="layout-edit-cutout-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              v-for="target in layoutEditTargets"
              :key="target.key"
              :x="target.left - 3"
              :y="target.top - 3"
              :width="target.width + 6"
              :height="target.height + 6"
              rx="10"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="var(--bew-bg)"
          fill-opacity="0.9"
          mask="url(#layout-edit-cutout-mask)"
        />
      </svg>
    </Transition>

    <div
      v-if="isLayoutEditing"
      class="layout-edit-target-layer"
      data-layout-edit-control
    >
      <button
        v-for="target in layoutEditTargets"
        v-show="!target.direct"
        :key="target.key"
        type="button"
        class="layout-edit-target-proxy"
        :style="{
          left: `${target.left - 3}px`,
          top: `${target.top - 3}px`,
          width: `${target.width + 6}px`,
          height: `${target.height + 6}px`,
        }"
        :aria-label="$t('layout_editor.click_to_adjust')"
        :title="$t('layout_editor.click_to_adjust')"
        @click="openLayoutTargetSettings(target)"
      />
    </div>

    <div
      v-if="isLayoutEditing"
      class="layout-edit-helper"
      :class="{ 'layout-edit-helper--dock-left': settings.dockPosition === 'left' }"
      data-layout-edit-control
    >
      <div
        v-if="isLayoutEditing || showLayoutEditPageModeAction || showLayoutEditSearchResultsAction || layoutEditGridActionKind || layoutEditDockVisible || layoutEditContextActions.length"
        class="layout-edit-quick-actions"
      >
        <button
          v-if="settings.enableTopBarModule"
          type="button"
          class="layout-edit-quick-action"
          @click="openLayoutEditTopBarModeSettings"
        >
          <Icon icon="mingcute:transfer-3-line" aria-hidden="true" />
          <span>{{ $t(settings.useOriginalBilibiliTopBar
            ? 'layout_editor.switch_to_bewly_topbar'
            : 'layout_editor.switch_to_original_topbar') }}</span>
        </button>
        <button
          v-if="showLayoutEditPageModeAction"
          type="button"
          class="layout-edit-quick-action"
          @click="openLayoutEditPageModeSettings"
        >
          <Icon icon="mingcute:transfer-3-line" aria-hidden="true" />
          <span>{{ $t(layoutEditDockPageConfig?.useOriginalBiliPage
            ? 'layout_editor.switch_to_plugin_page'
            : 'layout_editor.switch_to_bilibili_page') }}</span>
        </button>
        <button
          v-for="action in layoutEditContextActions"
          :key="action.key"
          type="button"
          class="layout-edit-quick-action"
          @click="openLayoutEditContextSettings(action)"
        >
          <Icon :icon="action.icon" aria-hidden="true" />
          <span>{{ $t(action.labelKey) }}</span>
        </button>
        <button
          v-if="showLayoutEditSearchResultsAction"
          type="button"
          class="layout-edit-quick-action"
          @click="openLayoutEditSearchResultsSettings"
        >
          <Icon icon="mingcute:search-2-line" aria-hidden="true" />
          <span>{{ $t('settings.group_search_results') }}</span>
        </button>
        <button
          v-if="layoutEditDockVisible"
          type="button"
          class="layout-edit-quick-action"
          @click="openLayoutEditDockPositionSettings"
        >
          <Icon icon="mingcute:navigation-line" aria-hidden="true" />
          <span>{{ $t('layout_editor.adjust_dock_position') }}</span>
        </button>
        <button
          v-if="layoutEditGridActionKind"
          type="button"
          class="layout-edit-quick-action"
          @click="openLayoutEditGridSettings"
        >
          <Icon icon="mingcute:layout-grid-line" aria-hidden="true" />
          <span>{{ $t(layoutEditGridActionKind === 'moments'
            ? 'layout_editor.adjust_moments_grid_columns'
            : 'layout_editor.adjust_video_grid_columns') }}</span>
        </button>
      </div>

      <div class="layout-edit-hint" role="status">
        <Icon icon="mingcute:cursor-3-line" aria-hidden="true" />
        <span>{{ $t('layout_editor.click_to_adjust') }}</span>
      </div>
    </div>

    <!-- Dock & RightSideButtons -->
    <div
      v-if="!isInIframe()"
      class="dock-sidebar-host"
      :class="{ 'dock-sidebar-host--editing': isLayoutEditing }"
      pos="absolute top-0 left-0" w-full h-full overflow-hidden
      pointer-events-none
      :style="{
        opacity: hideUIForIframePhotoViewer ? 0 : 1,
        transition: 'opacity 0.2s ease',
      }"
    >
      <Dock
        v-if="showDock"
        pointer-events-auto
        :activated-page="activatedPage"
        @refresh="handleThrottledPageRefresh"
        @undo-refresh="handleThrottledPageUnRefresh"
        @forward-refresh="handleThrottledPageForwardRefresh"
        @back-to-top="handleThrottledBackToTop"
        @dock-item-click="handleDockItemClick"
      />
      <SideBar
        v-else-if="settings.enableSideBar"
        pointer-events-auto
      />
    </div>

    <!-- TopBar -->
    <div
      v-if="showTopBar"
      class="top-bar-host"
      :class="{
        'top-bar-host--behind-search-overlay': searchFocusOverlayActive,
        'top-bar-host--editing': isLayoutEditing,
      }"
      m-auto max-w="$bew-page-max-width"
      :style="{
        opacity: hideUIForIframePhotoViewer ? 0 : 1,
        pointerEvents: hideUIForIframePhotoViewer ? 'none' : 'auto',
        transition: 'opacity 0.2s ease',
      }"
    >
      <TopBar
        class="top-bar-layer"
        pos="top-0 left-0" w-full
      />
    </div>

    <TopBarModeSwitcher
      v-if="isInIframe()
        && isOriginalTopBarActive
        && isComponentVisible('topBarSwitcher')"
      native
    />

    <div
      v-if="!settings.useOriginalBilibiliHomepage"
      pos="absolute top-0 left-0" w-full h-full
      :style="{
        height: showBewlyPage || iframePageURL ? '100dvh' : '0',
      }"
    >
      <Transition name="fade">
        <template v-if="showBewlyPage">
          <div
            ref="scrollViewportRef"
            class="bewly-scroll-viewport bew-page-controls"
            :class="{
              'bew-page-controls--blend': useBlendedPageControls,
              'bewly-scroll-viewport--repainted-scrollbar': useFirefoxScrollbar,
            }"
            :style="{
              '--bew-control-wallpaper-mask': pageControlWallpaperMask,
              // 视频弹窗打开时锁定背后列表，避免弹窗内滚轮与方向键越界滚动
              'overflowY': videoDialog ? 'hidden' : undefined,
            }"
            h-inherit of-y-auto of-x-hidden
            tabindex="-1"
            style="overscroll-behavior: contain;"
            @scroll.passive="handleNativeScroll"
            @mousedown.self="handlePageBackgroundMouseDown"
          >
            <main m-auto max-w="$bew-page-max-width" @mousedown.self="handlePageBackgroundMouseDown">
              <div
                p="t-[calc(var(--bew-top-bar-height)+10px)]" m-auto
                w="lg:[calc(100%-200px)] [calc(100%-150px)]"
                :style="isOriginalTopBarActive && !reachTop
                  ? { paddingTop: 'calc(var(--bew-top-bar-height) + 120px)' }
                  : undefined"
                @mousedown.self="handlePageBackgroundMouseDown"
              >
                <Transition name="page-fade">
                  <Component :is="pages[activatedPage]" :key="activatedPage" />
                </Transition>

                <!-- ✅ IntersectionObserver 哨兵：用于检测滚动到底部，避免在 RAF 中读取 scrollHeight -->
                <div ref="loadMoreSentinelRef" h-1px w-full pointer-events-none opacity-0 />
              </div>
            </main>
          </div>
        </template>
      </Transition>
      <FirefoxScrollbar v-if="useFirefoxScrollbar && showBewlyPage" :target="scrollViewportRef" />

      <Transition v-if="!showBewlyPage && iframePageURL && !isInIframe()" name="fade">
        <IframePage ref="iframePageRef" :url="iframePageURL" @scroll="topBarRef?.handleScroll($event)" />
      </Transition>
    </div>

    <IframeDrawer
      v-if="showIframeDrawer"
      :url="iframeDrawerURL"
      @close="showIframeDrawer = false"
    />

    <VideoDialog
      v-if="videoDialog"
      :key="videoDialog.id"
      :url="videoDialog.url"
      @close="videoDialog = null"
    />

    <ApiErrorDetailsDialog
      v-if="activeApiErrorSource"
      :source="activeApiErrorSource"
      @close="activeApiErrorSource = null"
    />

    <!-- Static confirm overlay: no Transition/Teleport (see useConfirmDialogHost). -->
    <ConfirmDialogOverlay
      v-if="activeConfirmDialog"
      :key="activeConfirmDialog.id"
      :request="activeConfirmDialog"
      @finish="finishConfirmDialog"
    />
  </div>
</template>

<style lang="scss" scoped>
.top-bar-layer {
  z-index: 1001;
}

.layout-edit-backdrop {
  position: fixed;
  z-index: 10000;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: default;
  pointer-events: auto;
}

.layout-edit-target-layer {
  position: fixed;
  z-index: 10002;
  inset: 0;
  pointer-events: none;
}

.layout-edit-target-proxy {
  position: fixed;
  box-sizing: border-box;
  padding: 0;
  border: 1px solid var(--bew-theme-color);
  border-radius: var(--bew-interactive-radius);
  background: transparent;
  box-shadow: 0 0 0 1px var(--bew-theme-color-20);
  cursor: pointer;
  pointer-events: auto;
}

.layout-edit-target-proxy:hover,
.layout-edit-target-proxy:focus-visible {
  border-color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
  box-shadow: 0 0 0 2px var(--bew-theme-color-30);
  outline: none;
}

.layout-edit-helper {
  position: fixed;
  z-index: 10005;
  bottom: max(var(--bew-space-4), env(safe-area-inset-bottom));
  left: max(var(--bew-space-4), env(safe-area-inset-left));
  display: flex;
  max-height: calc(100vh - var(--bew-space-8));
  max-width: min(360px, calc(100vw - var(--bew-space-8)));
  align-items: flex-start;
  flex-direction: column;
  gap: var(--bew-space-2);
  pointer-events: auto;
}

.layout-edit-helper--dock-left {
  right: max(var(--bew-space-4), env(safe-area-inset-right));
  left: auto;
  align-items: flex-end;
}

.layout-edit-quick-actions {
  display: flex;
  max-height: calc(100vh - var(--bew-control-height) - var(--bew-space-8));
  max-width: 100%;
  overflow-y: auto;
  align-items: flex-start;
  flex-direction: column;
  gap: var(--bew-space-1);
  overscroll-behavior: contain;
}

.layout-edit-quick-action,
.layout-edit-hint {
  display: inline-flex;
  min-height: var(--bew-control-height);
  align-items: center;
  gap: var(--bew-space-2);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-elevated-alt-solid);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  box-shadow: var(--bew-shadow-3), var(--bew-shadow-edge-glow-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.layout-edit-quick-action {
  max-width: 100%;
  border-color: var(--bew-theme-color-30);
  color: var(--bew-text-1);
  cursor: pointer;
  text-align: left;
}

.layout-edit-quick-action:hover {
  border-color: var(--bew-theme-color-60);
  background: color-mix(in oklab, var(--bew-elevated-alt-solid) 88%, var(--bew-theme-color) 12%);
  color: var(--bew-theme-color);
}

.layout-edit-quick-action:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: var(--bew-space-0-5);
}

.layout-edit-hint {
  pointer-events: none;
}

.layout-edit-quick-action :deep(.bew-local-icon),
.layout-edit-hint :deep(.bew-local-icon) {
  width: var(--bew-icon-size-sm);
  height: var(--bew-icon-size-sm);
  flex: none;
}

.dock-sidebar-host--editing,
.top-bar-host--editing {
  pointer-events: none !important;
}

.dock-sidebar-host--editing :deep([data-layout-edit-control]),
.top-bar-host--editing :deep([data-layout-edit-control]),
.dock-sidebar-host--editing :deep([data-layout-edit-direct]),
.top-bar-host--editing :deep([data-layout-edit-direct]) {
  pointer-events: auto !important;
}

.dock-sidebar-host--editing :deep([data-layout-edit-target="dock-component"][data-layout-edit-active="true"]) {
  outline: 1px solid var(--bew-theme-color);
  outline-offset: 3px;
  border-radius: var(--bew-interactive-radius);
}

.top-bar-host--editing :deep([data-layout-edit-target="topbar-component"][data-layout-edit-active="true"]) {
  outline: 1px solid var(--bew-theme-color);
  outline-offset: -1px;
  box-shadow: inset 0 0 0 1px var(--bew-theme-color-20);
}

.dock-sidebar-host--editing :deep([data-layout-edit-target]:not([data-layout-edit-active="true"])),
.top-bar-host--editing :deep([data-layout-edit-target]:not([data-layout-edit-active="true"])) {
  opacity: 0.12 !important;
}

.dock-sidebar-host--editing {
  z-index: 10001;
}

.top-bar-host--editing .top-bar-layer {
  z-index: 10001;
}

.top-bar-host--behind-search-overlay {
  position: relative;
  z-index: 0;
}

.bewly-wrapper {
  // To fix the filter used in `.bewly-wrapper` that cause the positions of elements become discorded.
  > * > * {
    filter: var(--bew-filter-force-dark);
  }
}

.bewly-wrapper--viewport {
  position: relative;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.bewly-scroll-viewport {
  outline: none;
  scrollbar-gutter: stable;
}

.bewly-scroll-viewport--repainted-scrollbar {
  scrollbar-width: none;
}
</style>
