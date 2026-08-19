<script setup lang="ts">
import { onKeyStroke, useEventListener, useIntersectionObserver, useThrottleFn } from '@vueuse/core'
import type { Ref } from 'vue'
import { provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Icon from '~/components/Icon.vue'
import type { BewlyAppProvider, SettingsNavigationTarget } from '~/composables/useAppProvider'
import { DrawerType, UndoForwardState } from '~/composables/useAppProvider'
import type { ConfirmDialogOptions } from '~/composables/useConfirmDialog'
import { confirmDialogKey } from '~/composables/useConfirmDialog'
import { useDark } from '~/composables/useDark'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { BEWLY_MOUNTED, DRAWER_VIDEO_ENTER_PAGE_FULL, DRAWER_VIDEO_EXIT_PAGE_FULL, IFRAME_PAGE_SWITCH_BEWLY, IFRAME_PAGE_SWITCH_BILI, OVERLAY_SCROLL_BAR_SCROLL, OVERLAY_SCROLL_STATE_CHANGE } from '~/constants/globalEvents'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { settings, settingsReady } from '~/logic'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { setOriginalBilibiliTopBarScrolled } from '~/utils/bilibiliTopBar'
import { isHomePage, isInIframe, isNotificationPage, isSearchResultsPage, isVideoOrBangumiPage, openLinkToNewTab, queryDomUntilFound, scrollToTop } from '~/utils/main'
import emitter from '~/utils/mitt'
import { applyPendingSettingsMigrations, formatSettingsMigrationConfirmMessage, hasPendingSettingsMigrations } from '~/utils/settingsMigration'

import { setupNecessarySettingsWatchers } from './necessarySettingsWatchers'

// Check if current page is festival page
function isFestivalPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(document.URL)
}

const mainStore = useMainStore()
const settingsStore = useSettingsStore()
const topBarStore = useTopBarStore()
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
const showSettings = ref(false)
const pendingSettingsNavigation = ref<SettingsNavigationTarget>()
const searchFocusOverlayActive = ref(false)

function openSettings(target?: SettingsNavigationTarget) {
  pendingSettingsNavigation.value = target
  showSettings.value = true
}

// The top-bar switcher is teleported to document.body, outside this Shadow DOM.
// Raise the host while settings are open so the modal can stay above that layer.
watch(showSettings, (visible) => {
  document.getElementById('bewly')?.classList.toggle('settings-open', visible)
}, { immediate: true })

interface ConfirmDialogRequest {
  id: number
  message: string
  title?: string
  confirmLabel?: string
  resolve: (confirmed: boolean) => void
  settled: boolean
}

/**
 * Lightweight confirm host (no Dialog / Transition / Teleport).
 * Resolving the promise often mutates large page lists (favorites, history…);
 * doing that in the same tick as a Transition/Teleport teardown races Vue's
 * patcher and throws insertBefore NotFoundError under <App>.
 */
const activeConfirmDialog = ref<ConfirmDialogRequest>()
const confirmDialogQueue: ConfirmDialogRequest[] = []
let confirmDialogBusy = false
let confirmDialogIdSeq = 0

function showNextConfirmDialog() {
  activeConfirmDialog.value = confirmDialogQueue.shift()
}

const confirmDialogPanelStyle = computed(() => {
  const frostedGlass = settings.value.enableFrostedGlass
  return {
    backdropFilter: frostedGlass ? 'var(--bew-filter-glass-2)' : 'none',
    WebkitBackdropFilter: frostedGlass ? 'var(--bew-filter-glass-2)' : 'none',
    backgroundColor: frostedGlass ? 'var(--bew-elevated-alt)' : 'var(--bew-elevated-alt-solid)',
  }
})

function showConfirmDialog(message: string, options: ConfirmDialogOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const request: ConfirmDialogRequest = {
      id: ++confirmDialogIdSeq,
      message,
      title: options.title,
      confirmLabel: options.confirmLabel,
      resolve,
      settled: false,
    }

    if (activeConfirmDialog.value || confirmDialogBusy)
      confirmDialogQueue.push(request)
    else
      activeConfirmDialog.value = request
  })
}

function finishConfirmDialog(confirmed: boolean) {
  const request = activeConfirmDialog.value
  if (!request || request.settled)
    return

  request.settled = true
  confirmDialogBusy = true
  // Unmount the overlay first; only then resolve so callers' DOM updates
  // (e.g. splicing favorite cards) never interleave with this node removal.
  activeConfirmDialog.value = undefined

  nextTick(() => {
    request.resolve(confirmed)
    confirmDialogBusy = false
    showNextConfirmDialog()
  })
}

onKeyStroke('Escape', (e: KeyboardEvent) => {
  if (!activeConfirmDialog.value && !isLayoutEditing.value)
    return
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
  if (activeConfirmDialog.value)
    finishConfirmDialog(false)
  else
    exitLayoutEditMode()
}, { dedupe: true })

onKeyStroke('Enter', (e: KeyboardEvent) => {
  if (!activeConfirmDialog.value)
    return
  e.preventDefault()
  e.stopPropagation()
  finishConfirmDialog(true)
}, { dedupe: true })

provide(confirmDialogKey, {
  confirm: showConfirmDialog,
})

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

  const confirmed = await showConfirmDialog(message, {
    title: t('settings.maintenance.migrate_legacy_title'),
    confirmLabel: t('settings.maintenance.migrate_legacy_action'),
  })
  if (!confirmed) {
    sessionStorage.setItem(SETTINGS_MIGRATION_PROMPT_DISMISSED_KEY, '1')
    return
  }

  applyPendingSettingsMigrations(record)
}

// Get the 'page' query parameter from the URL
function getPageParam(): AppPage | null {
  const urlParams = new URLSearchParams(window.location.search)
  const result = urlParams.get('page') as AppPage | null
  if (result && Object.values(AppPage).includes(result))
    return result
  return null
}

const activatedPage = ref<AppPage>(getPageParam() || (settings.value.dockItemsConfig.find(e => e.visible === true)?.page || AppPage.Home))

// 监听 URL 变化,同步更新 activatedPage
useEventListener(window, 'pushstate', () => {
  const pageParam = getPageParam()
  if (pageParam && pageParam !== activatedPage.value) {
    activatedPage.value = pageParam
  }
})
useEventListener(window, 'popstate', () => {
  const pageParam = getPageParam()
  if (pageParam && pageParam !== activatedPage.value) {
    activatedPage.value = pageParam
  }
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

// 添加Home页面的子页面状态
const homeActivatedPage = ref<HomeSubPage>(getDefaultHomeSubPage(settings.value.homePageTabVisibilityList))
const homeActivatedPageTouched = ref<boolean>(false)
const isHomeTabSwitching = ref<boolean>(false)
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
  return window.location.hostname === 't.bilibili.com' && /^\/?$/.test(window.location.pathname)
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
      openSettings({
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
  openSettings({
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
        targetTitleKey: 'settings.auto_hide_top_bar',
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

  openSettings({
    menu: 'BewlyComponents',
    secondaryPage: 'dock',
    targetTitleKey: dockPage.i18nKey,
  })
}

function openLayoutEditGridSettings() {
  if (layoutEditGridActionKind.value === 'moments') {
    openSettings({
      menu: 'BewlyPages',
      secondaryPage: 'moments',
      targetTitleKey: 'settings.moments_grid_columns',
    })
    return
  }

  if (layoutEditGridActionKind.value === 'video-card') {
    openSettings({
      menu: 'BewlyComponents',
      secondaryPage: 'video-card',
      targetTitleKey: 'settings.grid_breakpoints',
    })
  }
}

function openLayoutEditDockPositionSettings() {
  openSettings({
    menu: 'BewlyComponents',
    secondaryPage: 'dock',
    targetTitleKey: 'settings.dock_position',
  })
}

function openLayoutEditTopBarModeSettings() {
  openSettings({
    menu: 'BewlyComponents',
    secondaryPage: 'topbar',
    targetTitleKey: 'settings.use_original_bilibili_topbar',
  })
}

function openLayoutEditSearchResultsSettings() {
  openSettings({
    menu: 'BewlyPages',
    secondaryPage: 'search',
    targetTitleKey: 'settings.group_search_results',
  })
}

function openLayoutEditContextSettings(action: LayoutEditQuickSettingsAction) {
  openSettings({
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
const loadMoreSentinelRef = ref<HTMLElement>() // ✅ IntersectionObserver 哨兵元素
const handlePageRefresh = ref<() => void>()
const handleReachBottom = ref<() => void>()
const handleUndoRefresh = ref<() => void>()
const handleForwardRefresh = ref<() => void>()
const canRefreshHomeSubPage = ref<boolean>(false)
// 使用新的枚举状态管理撤销/前进按钮
const undoForwardState = ref<UndoForwardState>(UndoForwardState.Hidden)
const canRefreshCurrentPage = computed((): boolean => {
  return activatedPage.value !== AppPage.Home || homeActivatedPage.value === HomeSubPage.ForYou || canRefreshHomeSubPage.value
})
const handleThrottledPageRefresh = useThrottleFn(() => {
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
    const checkScrollComplete = () => {
      if (viewport.scrollTop === 0) {
        handlePageRefresh.value?.()
      }
      else {
        setTimeout(checkScrollComplete, 50)
      }
    }
    setTimeout(checkScrollComplete, 100)
  }
}, 500)
const handleThrottledReachBottom = useThrottleFn(() => handleReachBottom.value?.(), 200)
const handleThrottledBackToTop = useThrottleFn(() => handleBackToTop(), 500)
const handleThrottledPageUnRefresh = useThrottleFn(() => handleUndoRefresh.value?.(), 500)
const handleThrottledPageForwardRefresh = useThrottleFn(() => handleForwardRefresh.value?.(), 500)
const topBarRef = ref()
const reachTop = ref<boolean>(true)

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

// 添加活跃抽屉状态管理
const activeDrawer = ref<DrawerType>(DrawerType.None)
function setActiveDrawer(drawer: DrawerType) {
  activeDrawer.value = drawer
}

// 用于控制当iframe内打开图片预览时隐藏顶栏和Dock
const hideUIForIframePhotoViewer = ref<boolean>(false)

const iframePageRef = ref()
useEventListener(window, 'message', ({ data }) => {
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

// 监听来自父页面的黑暗模式切换消息（用于iframe跨域场景）
useEventListener(window, 'message', ({ data, source }) => {
  // 只处理来自父窗口的消息
  if (source !== window.parent)
    return

  const { type, isDark, darkModeBaseColor } = data

  if (type === 'iframeDarkModeChange') {
    // 在iframe环境中，只更新DOM样式，不修改用户的主题设置
    // 避免覆盖用户选择的设备或定时主题模式
    if (isInIframe()) {
      // Check if we should apply selective dark mode (plugin UI only) on festival pages
      const isSelectiveDark = isFestivalPage()

      // 立即更新DOM样式，不修改settings.value.theme
      if (isDark) {
        // Always apply to plugin container
        document.querySelector('#bewly')?.classList.add('dark')

        // Only apply global styles if not on festival pages
        if (!isSelectiveDark) {
          document.documentElement.classList.add('dark')
          document.body?.classList.add('dark')
        }

        // 如果提供了深色模式基准颜色，则应用它（仅应用到DOM，不修改设置）
        if (darkModeBaseColor) {
          document.documentElement.style.setProperty('--bew-dark-base-color', darkModeBaseColor)
          // 对于Shadow DOM也需要设置
          const bewlyContainer = document.getElementById('bewly')
          if (bewlyContainer?.shadowRoot) {
            const shadowHost = bewlyContainer
            shadowHost.style.setProperty('--bew-dark-base-color', darkModeBaseColor)
          }
        }
      }
      else {
        document.querySelector('#bewly')?.classList?.remove('dark')

        // Only remove global classes if not in selective mode
        if (!isSelectiveDark) {
          document.documentElement.classList.remove('dark')
          document.body?.classList.remove('dark')
        }
      }

      // 强制重新计算样式
      void document.documentElement.offsetHeight
    }
  }
}, { passive: true })
const iframePageURL = computed((): string => {
  // If the iframe is not the BiliBili homepage or in iframe, then don't show the iframe page
  if (!isHomePage(window.self.location.href) || isInIframe())
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

const showTopBar = computed((): boolean => {
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

    if (!options.force && (showSettings.value || activeDrawer.value !== DrawerType.None || isEditableElement(getActiveElement())))
      return

    viewport.focus({ preventScroll: true })
  })
}

const isFirstTimeActivatedPageChange = ref<boolean>(true)
watch(
  () => activatedPage.value,
  () => {
    if (!isFirstTimeActivatedPageChange.value) {
      // Update the URL query parameter when activatedPage changes
      const url = new URL(window.location.href)
      url.searchParams.set('page', activatedPage.value)
      window.history.replaceState({}, '', url.toString())
    }

    scrollViewportRef.value?.scrollTo({ top: 0 })
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
    if (settingsStore.getDockItemIsUseOriginalBiliPage(activatedPage.value) && !isInIframe()) {
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

  if (isHomePage()) {
    // Force overwrite Bilibili Evolved body tag & html tag background color
    document.body.style.setProperty('background-color', 'unset', 'important')

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
  void promptSettingsMigrationIfNeeded()
})

function handleDockItemClick(dockItem: DockItem) {
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
    const scrollTop = latestScrollTop

    emitter.emit(OVERLAY_SCROLL_BAR_SCROLL, scrollTop)
    if (settings.value.enableTopBar && settings.value.useOriginalBilibiliTopBar)
      setOriginalBilibiliTopBarScrolled(document, scrollTop > 0)

    // 只在滚动距离超过阈值时更新状态
    const scrollDelta = Math.abs(scrollTop - lastScrollTop)
    if (scrollDelta > 50) {
      lastScrollTop = scrollTop
    }

    reachTop.value = scrollTop === 0

    // ✅ 移除手动的"到达底部"检测，改用 IntersectionObserver（见 loadMoreSentinelRef）
    // 这避免了在每次滚动时计算 threshold 和读取 scrollHeight/clientHeight

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

/**
 * Checks if the current viewport has a scrollbar.
 * @returns {Promise<boolean>} Returns true if the viewport has a scrollbar, false otherwise.
 */
async function haveScrollbar() {
  await nextTick()
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
  searchFocusOverlayActive,
  handleBackToTop,
  handlePageRefresh,
  canRefreshHomeSubPage,
  handleReachBottom,
  handleUndoRefresh,
  handleForwardRefresh,
  undoForwardState,
  openIframeDrawer,
  haveScrollbar,
  activeDrawer,
  setActiveDrawer,
  pendingSettingsNavigation,
  openSettings,
})

if (settings.value.cleanUrlArgument) {
  const BASE_PARAMS_TO_REMOVE = new Set([
    'spm_id_from',
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
      const currentUrl = new URL(window.location.href)
      let hasChanged = false

      for (const param of BASE_PARAMS_TO_REMOVE) {
        if (currentUrl.searchParams.has(param)) {
          currentUrl.searchParams.delete(param)
          hasChanged = true
        }
      }
      const hostname = currentUrl.hostname
      if ((hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com')) && currentUrl.pathname.startsWith('/video/')) {
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

        // 使用 requestIdleCallback 来避免阻塞页面加载
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => {
            history.replaceState(null, '', newUrl)
            lastCleanedUrl = window.location.href
            isCleaningUrl = false
          })
        }
        else {
          setTimeout(() => {
            history.replaceState(null, '', newUrl)
            lastCleanedUrl = window.location.href
            isCleaningUrl = false
          }, 0)
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
    <template v-if="showBewlyPage">
      <AppBackground :activated-page="activatedPage" />
    </template>

    <!-- Settings -->
    <KeepAlive>
      <Settings
        v-if="showSettings"
        style="z-index: var(--bew-z-settings);"
        @close="showSettings = false"
      />
    </KeepAlive>

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
        v-if="!settings.useOriginalBilibiliHomepage && (settings.alwaysUseDock || (showBewlyPage || iframePageURL))"
        pointer-events-auto
        :activated-page="activatedPage"
        @refresh="handleThrottledPageRefresh"
        @undo-refresh="handleThrottledPageUnRefresh"
        @forward-refresh="handleThrottledPageForwardRefresh"
        @back-to-top="handleThrottledBackToTop"
        @dock-item-click="handleDockItemClick"
      />
      <SideBar
        v-else
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
            class="bewly-scroll-viewport"
            h-inherit of-y-auto of-x-hidden
            tabindex="-1"
            style="overscroll-behavior: contain;"
            @scroll.passive="handleNativeScroll"
          >
            <main m-auto max-w="$bew-page-max-width">
              <div
                p="t-[calc(var(--bew-top-bar-height)+10px)]" m-auto
                w="lg:[calc(100%-200px)] [calc(100%-150px)]"
                :style="settings.enableTopBar && settings.useOriginalBilibiliTopBar && !reachTop
                  ? { paddingTop: 'calc(var(--bew-top-bar-height) + 120px)' }
                  : undefined"
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

      <Transition v-if="!showBewlyPage && iframePageURL && !isInIframe()" name="fade">
        <IframePage ref="iframePageRef" :url="iframePageURL" />
      </Transition>
    </div>

    <IframeDrawer
      v-if="showIframeDrawer"
      :url="iframeDrawerURL"
      @close="showIframeDrawer = false"
    />

    <!-- Static confirm overlay: no Transition/Teleport (see finishConfirmDialog). -->
    <div
      v-if="activeConfirmDialog"
      :key="activeConfirmDialog.id"
      class="bew-confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      :aria-label="$t('common.operation.confirm')"
    >
      <div class="bew-confirm-dialog__backdrop" @click="finishConfirmDialog(false)" />
      <div class="bew-confirm-dialog__panel" :style="confirmDialogPanelStyle">
        <header class="bew-confirm-dialog__header">
          <p class="bew-confirm-dialog__title">
            {{ activeConfirmDialog.title || $t('common.operation.confirm') }}
          </p>
          <button
            type="button"
            class="bew-confirm-dialog__close"
            :aria-label="$t('common.operation.cancel')"
            @click="finishConfirmDialog(false)"
          >
            <div i-ic-baseline-clear />
          </button>
        </header>
        <div class="bew-confirm-dialog__body">
          <p class="bew-confirm-dialog__message">
            {{ activeConfirmDialog.message }}
          </p>
        </div>
        <footer class="bew-confirm-dialog__footer">
          <Button type="tertiary" @click="finishConfirmDialog(true)">
            {{ activeConfirmDialog.confirmLabel || $t('common.operation.confirm') }}
          </Button>
          <Button type="primary" @click="finishConfirmDialog(false)">
            {{ $t('common.operation.cancel') }}
          </Button>
        </footer>
      </div>
    </div>
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

.bew-confirm-dialog {
  position: fixed;
  inset: 0;
  z-index: var(--bew-z-confirm-dialog);
  pointer-events: auto;
}

.bew-confirm-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 40%);
}

.bew-confirm-dialog__panel {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  width: 420px;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-modal-radius);
  box-shadow: var(--bew-shadow-4), var(--bew-shadow-edge-glow-2);
  transform: translate(-50%, -50%);
}

.bew-confirm-dialog__header {
  display: flex;
  gap: var(--bew-space-4);
  align-items: center;
  justify-content: space-between;
  min-height: 70px;
  padding: 0 var(--bew-space-8);
}

.bew-confirm-dialog__title {
  margin: 0;
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.bew-confirm-dialog__close {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  appearance: none;
  color: inherit;
  cursor: pointer;
  background: var(--bew-elevated);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);

  &:hover {
    color: var(--bew-theme-color);
    background: var(--bew-theme-color-30);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: var(--bew-space-0-5);
  }
}

.bew-confirm-dialog__body {
  padding: var(--bew-space-2) var(--bew-space-8) var(--bew-space-2);
}

.bew-confirm-dialog__message {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  white-space: pre-line;
}

.bew-confirm-dialog__footer {
  display: flex;
  gap: var(--bew-space-2);
  justify-content: flex-end;
  padding: var(--bew-space-2) var(--bew-space-8) var(--bew-space-6);
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
</style>
