<script setup lang="ts">
import { useElementSize, useWindowSize } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import Icon from '~/components/Icon.vue'
import { UndoForwardState, useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { useDelayedHover } from '~/composables/useDelayedHover'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { isHomePage, openLinkToNewTab } from '~/utils/main'
import { matchesShortcutKey } from '~/utils/shortcutKeys'

import Tooltip from '../Tooltip.vue'
import {
  ANIME_BODY_FILL_PATH,
  ANIME_BODY_LINE_PATH,
  ANIME_EYES_FILL_PATH,
  ANIME_EYES_LINE_PATH,
  CLOCK_FILL_CIRCLE_PATH,
  CLOCK_HAND_FILL_PATH,
  CLOCK_HAND_LINE_PATH,
  CLOCK_RING_PATH,
  WATCH_LATER_PLAY_FILL_PATH,
  WATCH_LATER_PLAY_LINE_PATH,
  WATCH_LATER_RING_PATH,
} from './dockIconPaths'
import type { HoveringDockItem } from './types'

const props = defineProps<{
  activatedPage: AppPage
}>()

const emit = defineEmits<{
  (e: 'dockItemClick', dockItem: DockItem): void
  (e: 'dockItemMiddleClick', dockItem: DockItem): void
  (e: 'refresh'): void
  (e: 'backToTop'): void
  (e: 'undoRefresh'): void
  (e: 'forwardRefresh'): void
}>()

const mainStore = useMainStore()
const { t } = useI18n()
const { isDark, toggleDark } = useDark()
const { reachTop, homeActivatedPage, undoForwardState, canRefreshHomeSubPage, openSettings } = useBewlyApp()
const { isLayoutEditing, toggleLayoutEditMode } = useLayoutEditMode()

// 计算属性：是否显示撤销按钮
const showUndo = computed(() => undoForwardState.value === UndoForwardState.ShowUndo)
// 计算属性：是否显示前进按钮
const showForward = computed(() => undoForwardState.value === UndoForwardState.ShowForward)

const hideDock = ref<boolean>(false)
const dockContentHover = ref<boolean>(false)
const dockReady = ref(false)
let dockReadyFrame: number | undefined
const keepDockActionsVisible = computed((): boolean => {
  return settings.value.autoHideDock && settings.value.alwaysShowDockActionsWhenAutoHide
})
const dockContentRef = useDelayedHover({
  enterDelay: 100,
  leaveDelay: 600,
  enter: () => {
    if (shouldIgnorePinnedActionHover())
      return
    dockContentHover.value = true
    toggleHideDock(false)
  },
  leave: () => {
    dockContentHover.value = false
    toggleHideDock(true)
  },
})

// Global mouse move detection for edge zones
const edgeZoneSize = 20 // pixels from edge
let mouseEnterTimer: any | undefined
let mouseLeaveTimer: any | undefined

function handleGlobalMouseMove(event: MouseEvent) {
  if (!settings.value.autoHideDock) {
    return
  }

  if (keepDockActionsVisible.value && isPinnedActionsTarget(event.target)) {
    if (mouseEnterTimer) {
      clearTimeout(mouseEnterTimer)
      mouseEnterTimer = undefined
    }
    return
  }

  const { clientX, clientY } = event
  const { innerWidth, innerHeight } = window

  let isInEdgeZone = false

  if (settings.value.dockPosition === 'left' && clientX <= edgeZoneSize) {
    isInEdgeZone = true
  }
  else if (settings.value.dockPosition === 'right' && clientX >= innerWidth - edgeZoneSize) {
    isInEdgeZone = true
  }
  else if (settings.value.dockPosition === 'bottom' && clientY >= innerHeight - edgeZoneSize) {
    isInEdgeZone = true
  }

  if (isInEdgeZone) {
    if (mouseLeaveTimer) {
      clearTimeout(mouseLeaveTimer)
      mouseLeaveTimer = undefined
    }
    if (!mouseEnterTimer) {
      mouseEnterTimer = setTimeout(() => {
        toggleHideDock(false)
      }, 100)
    }
  }
  else {
    if (mouseEnterTimer) {
      clearTimeout(mouseEnterTimer)
      mouseEnterTimer = undefined
    }
    if (!mouseLeaveTimer && !dockContentHover.value) {
      mouseLeaveTimer = setTimeout(() => {
        toggleHideDock(true)
      }, 600)
    }
  }
}

const hoveringDockItem = reactive<HoveringDockItem>({
  themeMode: false,
})
const currentDockItems = ref<DockItem[]>([])

type DockActionPulse = 'refresh' | 'back-to-top' | 'history'
const dockActionPulse = ref<DockActionPulse>()
let dockActionPulseTimer: number | undefined
let dockActionPulseFrame: number | undefined

function pulseDockAction(pulse: DockActionPulse) {
  const applyPulse = () => {
    dockActionPulse.value = pulse
    dockActionPulseTimer = window.setTimeout(() => {
      dockActionPulse.value = undefined
      dockActionPulseTimer = undefined
    }, 700)
  }

  const shouldReplay = dockActionPulse.value === pulse || dockActionPulseFrame !== undefined
  if (dockActionPulseTimer !== undefined) {
    window.clearTimeout(dockActionPulseTimer)
    dockActionPulseTimer = undefined
  }
  if (dockActionPulseFrame !== undefined) {
    cancelAnimationFrame(dockActionPulseFrame)
    dockActionPulseFrame = undefined
  }

  if (shouldReplay) {
    // 双 RAF 让移除动画类后的样式先完成一帧计算，再加回动画类。
    dockActionPulse.value = undefined
    dockActionPulseFrame = requestAnimationFrame(() => {
      dockActionPulseFrame = requestAnimationFrame(() => {
        dockActionPulseFrame = undefined
        applyPulse()
      })
    })
  }
  else {
    applyPulse()
  }
}

// 与 dock-icon-click-rebound 的 CSS 时长保持一致
const CLICK_REBOUND_DURATION = 320
// 覆盖 dock 缩放过渡（300ms），避免布局切换造成的瞬时 mouseleave 清掉抑制
const CLICK_SUPPRESSION_RELEASE_DELAY = 350
const EDIT_DOCK_TARGET = 'edit-dock'
const THEME_MODE_TARGET = 'theme-mode'

const clickReboundTarget = ref<string>()
const clickSuppressedTarget = ref<string>()
let clickReboundTimer: number | undefined
let clickReboundFrame: number | undefined
let suppressionReleaseTimer: number | undefined
let suppressionReleaseTarget: string | undefined

function triggerDockIconClickFeedback(target: string, event?: MouseEvent) {
  const button = event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
  if (button) {
    const icon = Array.from(button.querySelectorAll('.dock-item-icon, .dock-edit-icon, .dock-theme-icon'))
      .find(el => getComputedStyle(el).display !== 'none')
    button.style.setProperty('--dock-click-rebound-from', icon ? getComputedStyle(icon).transform : 'none')
  }

  clickSuppressedTarget.value = target
  const applyRebound = () => {
    clickReboundTarget.value = target
    // 从动画真正恢复时开始计时，避免 RAF 延后时提前结束回弹。
    clickReboundTimer = window.setTimeout(() => {
      clickReboundTarget.value = undefined
      clickReboundTimer = undefined
    }, CLICK_REBOUND_DURATION)
  }

  const shouldReplay = clickReboundTarget.value === target || clickReboundFrame !== undefined
  if (clickReboundTimer !== undefined) {
    window.clearTimeout(clickReboundTimer)
    clickReboundTimer = undefined
  }
  if (clickReboundFrame !== undefined) {
    cancelAnimationFrame(clickReboundFrame)
    clickReboundFrame = undefined
  }
  if (shouldReplay) {
    // 等移除动画类完成一帧样式计算，再重播回弹；等待期间的点击仍走此路径。
    clickReboundTarget.value = undefined
    clickReboundFrame = requestAnimationFrame(() => {
      clickReboundFrame = requestAnimationFrame(() => {
        clickReboundFrame = undefined
        if (clickSuppressedTarget.value === target)
          applyRebound()
      })
    })
  }
  else {
    applyRebound()
  }
  if (suppressionReleaseTimer) {
    window.clearTimeout(suppressionReleaseTimer)
    suppressionReleaseTimer = undefined
  }
  suppressionReleaseTarget = undefined
}

function scheduleClickSuppressionRelease(target: string) {
  if (clickSuppressedTarget.value !== target)
    return
  if (suppressionReleaseTimer)
    window.clearTimeout(suppressionReleaseTimer)
  suppressionReleaseTarget = target
  suppressionReleaseTimer = window.setTimeout(() => {
    if (clickSuppressedTarget.value === target)
      clickSuppressedTarget.value = undefined
    suppressionReleaseTimer = undefined
    suppressionReleaseTarget = undefined
  }, CLICK_SUPPRESSION_RELEASE_DELAY)
}

function cancelClickSuppressionRelease(target: string) {
  if (suppressionReleaseTarget !== target)
    return
  if (suppressionReleaseTimer)
    window.clearTimeout(suppressionReleaseTimer)
  suppressionReleaseTimer = undefined
  suppressionReleaseTarget = undefined
}

function clearClickSuppression(target: string) {
  if (clickSuppressedTarget.value !== target)
    return
  if (suppressionReleaseTimer) {
    window.clearTimeout(suppressionReleaseTimer)
    suppressionReleaseTimer = undefined
  }
  suppressionReleaseTarget = undefined
  clickSuppressedTarget.value = undefined
}

function handleDockIconBlur(target: string, event: FocusEvent) {
  if (event.currentTarget instanceof Element && event.currentTarget.matches(':hover'))
    return
  clearClickSuppression(target)
}

// 每个导航图标按自身语义取一个悬停动画，未列出的页面保持静止
const dockIconAnimationClasses: Partial<Record<AppPage, string>> = {
  [AppPage.Home]: 'dock-icon-anim-home',
  [AppPage.Search]: 'dock-icon-anim-search',
  [AppPage.Anime]: 'dock-icon-anim-anime',
  [AppPage.Favorites]: 'dock-icon-anim-favorites',
  [AppPage.History]: 'dock-icon-anim-history',
  [AppPage.WatchLater]: 'dock-icon-anim-watch-later',
  [AppPage.Moments]: 'dock-icon-anim-moments',
}

const clockHandMaskId = `dock-clock-hand-mask-${useId()}`
const animeEyeMaskId = `dock-anime-eye-mask-${useId()}`

const backToTopButtonEnabled = computed((): boolean => !settings.value.disableBackToTopButtonOnDock)

const dockEditActions = computed(() => [
  {
    key: 'refresh' as const,
    label: t('common.operation.refresh'),
    icon: 'tabler:reload',
    settingsTitleKey: 'settings.back_to_top_and_refresh_buttons_are_separated',
    hidden: false,
  },
  {
    key: 'backToTop' as const,
    label: t('layout_editor.back_to_top'),
    icon: 'line-md:arrow-small-up',
    settingsTitleKey: 'settings.disable_back_to_top_button_on_dock',
    hidden: !backToTopButtonEnabled.value,
  },
])

const tooltipPlacement = computed(() => {
  if (settings.value.dockPosition === 'left')
    return 'right'
  else if (settings.value.dockPosition === 'right')
    return 'left'
  else if (settings.value.dockPosition === 'bottom')
    return 'top'
  return 'right'
})

/**
 * Whether to show the back to top or refresh button
 */
const showBackToTopOrRefreshButton = computed((): boolean => {
  const dockItemConfig = settings.value.dockItemsConfig.find(e => e.page === props.activatedPage)
  if (dockItemConfig && dockItemConfig.useOriginalBiliPage) {
    return false
  }

  // 在首页显示返回顶部/刷新按钮（包括搜索页）
  return isHomePage()
})

const canRefreshCurrentPage = computed((): boolean => {
  if (props.activatedPage === AppPage.Search || props.activatedPage === AppPage.SearchResults)
    return false

  return props.activatedPage !== AppPage.Home || homeActivatedPage.value === HomeSubPage.ForYou || canRefreshHomeSubPage.value
})

const showBackToTopOrRefreshActions = computed((): boolean => {
  return showBackToTopOrRefreshButton.value && (canRefreshCurrentPage.value || (backToTopButtonEnabled.value && !reachTop.value))
})

/**
 * Whether to show the undo/forward buttons
 * Only show on Home page when current sub-page is ForYou
 */
const shouldShowUndoForwardButtons = computed((): boolean => {
  return props.activatedPage === AppPage.Home && homeActivatedPage.value === HomeSubPage.ForYou
})

const showUndoForwardActions = computed((): boolean => {
  return shouldShowUndoForwardButtons.value && (showUndo.value || showForward.value) && settings.value.enableUndoRefreshButton
})

const showDockActionButtons = computed((): boolean => {
  return showBackToTopOrRefreshActions.value || showUndoForwardActions.value
})

watch(() => settings.value.autoHideDock, (newValue) => {
  hideDock.value = newValue
}, { immediate: true })

// use Json stringify to watch the changes of the array item properties
watch(() => JSON.stringify(settings.value.dockItemsConfig), () => {
  currentDockItems.value = computeDockItem()
  const isDockItemTarget = (target: string | undefined): target is string =>
    !!target && target !== EDIT_DOCK_TARGET && target !== THEME_MODE_TARGET
  const reboundTarget = clickReboundTarget.value
  if (isDockItemTarget(reboundTarget) && !currentDockItems.value.some(item => item.page === reboundTarget))
    clickReboundTarget.value = undefined
  const suppressedTarget = clickSuppressedTarget.value
  if (isDockItemTarget(suppressedTarget) && !currentDockItems.value.some(item => item.page === suppressedTarget))
    clearClickSuppression(suppressedTarget)
}, { immediate: true })

watch([() => settings.value.showLayoutEditButton, isLayoutEditing], ([show, editing]) => {
  if (show || editing)
    return
  clearClickSuppression(EDIT_DOCK_TARGET)
  if (clickReboundTarget.value === EDIT_DOCK_TARGET)
    clickReboundTarget.value = undefined
})

watch([() => settings.value.disableLightDarkModeSwitcherOnDock, isLayoutEditing], ([disabled, editing]) => {
  if (!disabled || editing)
    return
  clearClickSuppression(THEME_MODE_TARGET)
  if (clickReboundTarget.value === THEME_MODE_TARGET)
    clickReboundTarget.value = undefined
})

function computeDockItem(): DockItem[] {
  if (Array.isArray(settings.value.dockItemsConfig) && settings.value.dockItemsConfig.length < mainStore.dockItems.length) {
    // Add missing items to dockItemsConfig
    const missingItems = mainStore.dockItems.filter(dock => !settings.value.dockItemsConfig.some(item => item.page === dock.page))
    settings.value.dockItemsConfig = [
      ...settings.value.dockItemsConfig,
      ...missingItems.map(dock => ({
        page: dock.page,
        visible: true,
        openInNewTab: false,
        useOriginalBiliPage: dock.useOriginalBiliPage,
      })),
    ]
  }
  // if dockItemsConfig not fresh, set it to default
  else if (!Array.isArray(settings.value.dockItemsConfig) || settings.value.dockItemsConfig.length !== mainStore.dockItems.length) {
    settings.value.dockItemsConfig = mainStore.dockItems.map(dock => ({
      page: dock.page,
      visible: true,
      openInNewTab: false,
      useOriginalBiliPage: dock.useOriginalBiliPage,
    }))
  }

  const targetDockItems: DockItem[] = []

  settings.value.dockItemsConfig.forEach((item) => {
    const foundItem = mainStore.dockItems.find(defaultItem => defaultItem.page === item.page)
    // If the dock item does not have Bewly page, then use the original BiliBili page
    if (!foundItem?.hasBewlyPage)
      item.useOriginalBiliPage = true

    if (item.visible) {
      targetDockItems.push({
        i18nKey: foundItem?.i18nKey || '',
        icon: foundItem?.icon || '',
        iconActivated: foundItem?.iconActivated || '',
        page: foundItem?.page || AppPage.Home,
        openInNewTab: item.openInNewTab,
        useOriginalBiliPage: item.useOriginalBiliPage || !foundItem?.hasBewlyPage,
        url: foundItem?.url || '',
        hasBewlyPage: foundItem?.hasBewlyPage || false,
      })
    }
  })
  return targetDockItems
}

function handleDockThemeClick(event: MouseEvent) {
  if (!isLayoutEditing.value) {
    triggerDockIconClickFeedback(THEME_MODE_TARGET, event)
    toggleDark(event)
  }
}

function handleDockThemeEnter() {
  hoveringDockItem.themeMode = true
  cancelClickSuppressionRelease(THEME_MODE_TARGET)
}

function handleDockThemeLeave() {
  hoveringDockItem.themeMode = false
  scheduleClickSuppressionRelease(THEME_MODE_TARGET)
}

function toggleHideDock(hide: boolean) {
  if (isLayoutEditing.value) {
    hideDock.value = false
    return
  }
  if (settings.value.autoHideDock)
    hideDock.value = hide
  else
    hideDock.value = false
}

function isPinnedActionsTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('.dock-action-buttons')
}

function shouldIgnorePinnedActionHover(event?: Event): boolean {
  if (!keepDockActionsVisible.value || !hideDock.value)
    return false
  if (event)
    return isPinnedActionsTarget(event.target)
  return !!dockContentRef.value?.querySelector('.dock-action-buttons:hover')
}

function handleDockAreaEnter(event: MouseEvent) {
  if (shouldIgnorePinnedActionHover(event))
    return
  toggleHideDock(false)
}

function handleDockItemClick($event: MouseEvent, dockItem: DockItem) {
  if (isLayoutEditing.value)
    return

  if ($event.ctrlKey || $event.metaKey) {
    openDockItemInNewTab(dockItem, $event)
    return
  }

  triggerDockIconClickFeedback(dockItem.page, $event)
  emit('dockItemClick', dockItem)
}

function openDockItemInNewTab(dockItem: DockItem, event?: MouseEvent) {
  if (isLayoutEditing.value)
    return

  triggerDockIconClickFeedback(dockItem.page, event)
  openLinkToNewTab(`https://www.bilibili.com/?page=${dockItem.page}`)
}

function handleDockEditClick(event: MouseEvent) {
  triggerDockIconClickFeedback(EDIT_DOCK_TARGET, event)
  toggleLayoutEditMode('dock')
}

function handleBackToTopOrRefresh(action: 'backToTop' | 'refresh' | 'auto' = 'auto') {
  if (action === 'backToTop') {
    emit('backToTop')
    pulseDockAction('back-to-top')
  }
  else if (action === 'refresh') {
    if (canRefreshCurrentPage.value) {
      emit('refresh')
      pulseDockAction('refresh')
    }
  }
  else {
    if ((reachTop.value || !backToTopButtonEnabled.value) && canRefreshCurrentPage.value) {
      emit('refresh')
      pulseDockAction('refresh')
    }
    else if (backToTopButtonEnabled.value) {
      emit('backToTop')
      pulseDockAction('back-to-top')
    }
  }
}

// 处理撤销刷新
function handleUndoRefresh() {
  emit('undoRefresh')
  undoForwardState.value = UndoForwardState.ShowForward
}

// 添加处理前进的方法
function handleForwardRefresh() {
  emit('forwardRefresh')
  undoForwardState.value = UndoForwardState.ShowUndo
}

// 添加统一的前进后退处理方法
function handleHistoryNavigation() {
  if (showUndo.value) {
    handleUndoRefresh()
    pulseDockAction('history')
  }
  else if (showForward.value) {
    handleForwardRefresh()
    pulseDockAction('history')
  }
}

function isDockItemActivated(dockItem: DockItem): boolean {
  // SearchResults 页面时也激活 Search 按钮
  if (props.activatedPage === AppPage.SearchResults && dockItem.page === AppPage.Search) {
    return isHomePage()
  }
  return props.activatedPage === dockItem.page && isHomePage()
}

const { width: windowWidth, height: windowHeight } = useWindowSize()
const { width: dockWidth, height: dockHeight } = useElementSize(dockContentRef)

// The initial 0 -> measured scale must render without a transition; later
// responsive scale changes can keep the existing smooth behavior.
watch([dockWidth, dockHeight], ([width, height]) => {
  if (dockReady.value || dockReadyFrame !== undefined || !width || !height)
    return

  dockReadyFrame = requestAnimationFrame(() => {
    dockReady.value = true
    dockReadyFrame = undefined
  })
}, { flush: 'post' })

const dockScale = computed((): number => {
  if (!dockHeight.value || !dockWidth.value)
    return 1

  // Get current top bar height from CSS variable
  const getTopBarHeight = (): number => {
    const topBarHeight = getComputedStyle(document.documentElement)
      .getPropertyValue('--bew-top-bar-height')
      .replace('px', '')
    return Number.parseInt(topBarHeight) || 64 // fallback to 64px
  }

  const currentTopBarHeight = getTopBarHeight()

  // Dynamic margins based on screen size and dock position
  let heightMargin: number
  let widthMargin: number

  if (settings.value.dockPosition === 'bottom') {
    // For bottom position, use original logic
    heightMargin = Math.max(100, Math.min(150, windowHeight.value * 0.1))
    widthMargin = Math.max(100, Math.min(150, windowWidth.value * 0.1))
  }
  else {
    // For side positions, adjust margins considering responsive top bar height
    heightMargin = Math.max(50, Math.min(100, windowHeight.value * 0.08)) + currentTopBarHeight
    widthMargin = Math.max(50, Math.min(100, windowWidth.value * 0.08))
  }

  const maxAllowedHeight = windowHeight.value - heightMargin
  const maxAllowedWidth = windowWidth.value - widthMargin

  const buttonSize = 45 // lg:w-45px w-35px, use larger size for calculation
  const buttonGap = 8 // gap-2 = 8px

  let additionalHeight = 0
  let additionalWidth = 0

  if (settings.value.dockPosition === 'bottom') {
    const maxButtonCount = isLayoutEditing.value
      ? 2
      : (settings.value.backToTopAndRefreshButtonsAreSeparated && backToTopButtonEnabled.value ? 2 : 1)
    const maxUndoForwardButtonCount = settings.value.enableUndoRefreshButton ? 1 : 0
    additionalWidth = (maxButtonCount + maxUndoForwardButtonCount) * buttonSize + maxButtonCount * buttonGap
  }
  else {
    const maxButtonCount = isLayoutEditing.value
      ? 2
      : (settings.value.backToTopAndRefreshButtonsAreSeparated && backToTopButtonEnabled.value ? 2 : 1)
    const maxUndoForwardButtonCount = settings.value.enableUndoRefreshButton ? 1 : 0
    additionalHeight = (maxButtonCount + maxUndoForwardButtonCount) * buttonSize + maxButtonCount * buttonGap
  }

  const effectiveDockHeight = dockHeight.value + additionalHeight
  const effectiveDockWidth = dockWidth.value + additionalWidth

  // Calculate scale factors for both dimensions
  const heightScale = effectiveDockHeight > maxAllowedHeight
    ? maxAllowedHeight / effectiveDockHeight
    : 1

  const widthScale = effectiveDockWidth > maxAllowedWidth
    ? maxAllowedWidth / effectiveDockWidth
    : 1

  // Use the smaller scale to ensure dock fits in both dimensions
  return Math.min(heightScale, widthScale)
})

const dockActionButtonsStyle = computed<CSSProperties>(() => {
  return {
    bottom: settings.value.dockPosition === 'bottom' ? 'unset' : 0,
    right: settings.value.dockPosition === 'bottom' ? 0 : 'unset',
    transform: settings.value.dockPosition === 'bottom' ? 'translate(100%, 0)' : 'translateY(100%)',
    flexDirection: settings.value.dockPosition === 'bottom' ? 'row' : 'column',
  }
})

const dockTransformStyle = computed((): { transform: string, transformOrigin: string } => {
  const position = settings.value.dockPosition
  const scale = dockScale.value
  dockContentRef.value?.style.setProperty('--scale', `${scale}`)

  // Adjust origin based on dock position
  const origin = {
    left: 'left center',
    right: 'right center',
    bottom: 'center bottom',
  }[position] || 'center center'

  return {
    transform: `scale(${scale})`,
    transformOrigin: origin,
  }
})

// 处理首页刷新快捷键
function handleHomeRefreshKeydown(event: KeyboardEvent) {
  // 检查快捷键设置是否启用
  const shortcutConfig = settings.value.shortcuts?.homeRefresh
  if (!shortcutConfig?.enabled) {
    return
  }

  // 检查是否按下了配置的快捷键
  if (matchesShortcutKey(event, shortcutConfig.key || 'R')) {
    // 检查页面中是否有任何输入框处于焦点状态
    const activeElement = document.activeElement

    // 使用事件路径检查是否点击了输入框
    const eventPath = event.composedPath ? event.composedPath() : (event as any).path || []
    let hasInputFocus = false

    // 检查事件路径中是否包含输入元素
    for (const element of eventPath) {
      if (element instanceof HTMLInputElement
        || element instanceof HTMLTextAreaElement
        || (element instanceof HTMLElement && element.contentEditable === 'true')) {
        hasInputFocus = true
        break
      }
    }

    // 备用检查：查找页面中所有输入元素并检查焦点
    if (!hasInputFocus) {
      const allInputs = document.querySelectorAll('input, textarea, [contenteditable="true"]')

      allInputs.forEach((input) => {
        const inputElement = input as HTMLElement
        if (inputElement === activeElement
          || inputElement === document.activeElement
          || inputElement.matches(':focus')) {
          hasInputFocus = true
        }
      })
    }

    // 最后检查：直接检查activeElement
    if (!hasInputFocus && activeElement) {
      if (activeElement.tagName === 'INPUT'
        || activeElement.tagName === 'TEXTAREA'
        || (activeElement instanceof HTMLElement && activeElement.contentEditable === 'true')) {
        hasInputFocus = true
      }
    }

    if (hasInputFocus)
      return

    // 如果没有输入框获得焦点且显示刷新按钮，则触发刷新
    if (showBackToTopOrRefreshButton.value && canRefreshCurrentPage.value) {
      event.preventDefault()
      handleBackToTopOrRefresh('refresh')
    }
  }
}

// 在组件挂载时添加键盘事件监听
onMounted(() => {
  document.addEventListener('keydown', handleHomeRefreshKeydown)
  // Add global mouse move listener for edge zone detection
  window.addEventListener('mousemove', handleGlobalMouseMove)
})

// 在组件卸载时移除键盘事件监听
onUnmounted(() => {
  document.removeEventListener('keydown', handleHomeRefreshKeydown)
  // Remove global mouse move listener
  window.removeEventListener('mousemove', handleGlobalMouseMove)
  // Clear any pending timers
  if (mouseEnterTimer) {
    clearTimeout(mouseEnterTimer)
  }
  if (mouseLeaveTimer) {
    clearTimeout(mouseLeaveTimer)
  }
  if (dockActionPulseTimer) {
    window.clearTimeout(dockActionPulseTimer)
  }
  if (dockActionPulseFrame !== undefined)
    cancelAnimationFrame(dockActionPulseFrame)
  if (clickReboundTimer) {
    window.clearTimeout(clickReboundTimer)
  }
  if (suppressionReleaseTimer) {
    window.clearTimeout(suppressionReleaseTimer)
  }
  if (clickReboundFrame !== undefined) {
    cancelAnimationFrame(clickReboundFrame)
  }
  if (dockReadyFrame !== undefined)
    cancelAnimationFrame(dockReadyFrame)
})
</script>

<template>
  <aside
    class="dock-wrap"
    :class="`dock-wrap--${settings.dockPosition}`"
    pos="fixed" z-100 flex="~ col justify-center items-center"
    z-10 pointer-events-none
  >
    <!-- Edge Div -->
    <div
      v-if="settings.autoHideDock && hideDock && !isLayoutEditing"
      class="dock-edge"
      data-layout-settings-menu="BewlyComponents"
      data-layout-settings-page="dock"
      data-layout-settings-title-key="settings.group_dock"
      :class="`dock-edge-${settings.dockPosition}`"
      @mouseenter="toggleHideDock(false)"
      @mouseleave="toggleHideDock(true)"
    />

    <!-- Dock Content -->
    <div
      ref="dockContentRef"
      class="dock-content"
      data-layout-edit-target="dock-component"
      data-layout-edit-direct
      data-layout-settings-menu="BewlyComponents"
      data-layout-settings-page="dock"
      data-layout-settings-title-key="settings.group_dock"
      :class="{
        'left': settings.dockPosition === 'left',
        'right': settings.dockPosition === 'right',
        'bottom': settings.dockPosition === 'bottom',
        'hide': hideDock && !isLayoutEditing && !keepDockActionsVisible,
        'hide-inner': hideDock && !isLayoutEditing && keepDockActionsVisible,
        'half-hide': settings.halfHideDock && !isLayoutEditing,
        'hover': dockContentHover,
        'ready': dockReady,
      }"
      :style="dockTransformStyle"
      @mouseenter="handleDockAreaEnter"
      @mouseleave="toggleHideDock(true)"
    >
      <div
        class="dock-content-inner"
      >
        <template v-for="dockItem in currentDockItems" :key="dockItem.page">
          <Tooltip :content="$t(dockItem.i18nKey)" :placement="tooltipPlacement">
            <button
              class="dock-item group"
              :data-layout-edit-target="`dock-navigation-${dockItem.page}`"
              data-layout-settings-menu="BewlyComponents"
              data-layout-settings-page="dock"
              data-layout-settings-title-key="settings.dock_content_adjustment"
              :class="[
                dockIconAnimationClasses[dockItem.page],
                {
                  'active': isDockItemActivated(dockItem),
                  'inactive': hoveringDockItem.themeMode && isDark,
                  'disable-glowing-effect': settings.disableDockGlowingEffect,
                  'dock-icon-click-rebound': clickReboundTarget === dockItem.page,
                  'dock-icon-click-suppressed': clickSuppressedTarget === dockItem.page,
                },
              ]"
              @click="handleDockItemClick($event, dockItem)"
              @click.middle="openDockItemInNewTab(dockItem, $event)"
              @mouseenter="cancelClickSuppressionRelease(dockItem.page)"
              @mouseleave="scheduleClickSuppressionRelease(dockItem.page)"
              @blur="handleDockIconBlur(dockItem.page, $event)"
            >
              <span class="dock-item-icon-wrap">
                <!-- 路径取自 mingcute:bilibili-line/fill，拆出眼睛以支持眨眼 -->
                <template v-if="dockItem.page === AppPage.Anime">
                  <svg
                    v-show="!isDockItemActivated(dockItem)"
                    class="dock-item-icon dock-svg-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      fill-rule="evenodd"
                      :d="ANIME_BODY_LINE_PATH"
                    />
                    <path
                      class="dock-anime-eyes"
                      fill="currentColor"
                      fill-rule="evenodd"
                      :d="ANIME_EYES_LINE_PATH"
                    />
                  </svg>
                  <svg
                    v-show="isDockItemActivated(dockItem)"
                    class="dock-item-icon dock-svg-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <mask
                      :id="animeEyeMaskId"
                      maskUnits="userSpaceOnUse"
                      x="0" y="0" width="24"
                      height="24"
                    >
                      <rect width="24" height="24" fill="#fff" />
                      <path
                        class="dock-anime-eyes"
                        fill="#000"
                        fill-rule="evenodd"
                        :d="ANIME_EYES_FILL_PATH"
                      />
                    </mask>
                    <path
                      fill="currentColor"
                      fill-rule="evenodd"
                      :d="ANIME_BODY_FILL_PATH"
                      :mask="`url(#${animeEyeMaskId})`"
                    />
                  </svg>
                </template>

                <template v-else-if="dockItem.page === AppPage.History">
                  <svg
                    v-show="!isDockItemActivated(dockItem)"
                    class="dock-item-icon dock-svg-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      :d="CLOCK_RING_PATH"
                    />
                    <path
                      class="dock-clock-hand"
                      fill="currentColor"
                      :d="CLOCK_HAND_LINE_PATH"
                    />
                  </svg>
                  <svg
                    v-show="isDockItemActivated(dockItem)"
                    class="dock-item-icon dock-svg-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <mask
                      :id="clockHandMaskId"
                      maskUnits="userSpaceOnUse"
                      x="0" y="0" width="24"
                      height="24"
                    >
                      <rect width="24" height="24" fill="#fff" />
                      <path
                        class="dock-clock-hand"
                        fill="#000"
                        :d="CLOCK_HAND_FILL_PATH"
                      />
                    </mask>
                    <path
                      fill="currentColor"
                      :d="CLOCK_FILL_CIRCLE_PATH"
                      :mask="`url(#${clockHandMaskId})`"
                    />
                  </svg>
                </template>

                <template v-else-if="dockItem.page === AppPage.WatchLater">
                  <svg
                    v-show="!isDockItemActivated(dockItem)"
                    class="dock-item-icon dock-svg-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      :d="WATCH_LATER_RING_PATH"
                    />
                    <path
                      class="dock-carplay-play"
                      fill="currentColor"
                      :d="WATCH_LATER_PLAY_LINE_PATH"
                    />
                  </svg>
                  <svg
                    v-show="isDockItemActivated(dockItem)"
                    class="dock-item-icon dock-svg-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      :d="WATCH_LATER_RING_PATH"
                    />
                    <path
                      class="dock-carplay-play"
                      fill="currentColor"
                      :d="WATCH_LATER_PLAY_FILL_PATH"
                    />
                  </svg>
                </template>

                <template v-else>
                  <div
                    v-show="!isDockItemActivated(dockItem)"
                    class="dock-item-icon"
                    :class="dockItem.icon"
                    text-xl
                  />
                  <div
                    v-show="isDockItemActivated(dockItem)"
                    class="dock-item-icon"
                    :class="dockItem.iconActivated"
                    text-xl
                  />
                </template>

                <svg
                  v-if="dockItem.page === AppPage.Anime"
                  class="dock-anime-signal"
                  viewBox="-4 -4 32 32"
                  aria-hidden="true"
                >
                  <path class="dock-anime-wave dock-anime-wave-1" d="M18.2 3.4Q18.8 2 17.4 1.2" />
                  <path class="dock-anime-wave dock-anime-wave-2" d="M21.6 4.8Q23.8 0.4 19.1 -1.2" />
                </svg>

                <span
                  v-if="dockItem.page === AppPage.Favorites"
                  class="dock-favorites-sparkle"
                  aria-hidden="true"
                />
              </span>
            </button>
          </Tooltip>
        </template>

        <!-- dividing line -->
        <div class="divider" />

        <div
          v-if="isLayoutEditing || !settings.disableLightDarkModeSwitcherOnDock"
          class="dock-edit-utility-item"
          data-layout-edit-target="dock-theme"
          data-layout-settings-menu="BewlyComponents"
          data-layout-settings-page="dock"
          data-layout-settings-title-key="settings.disable_light_dark_mode_switcher"
          :class="{ 'dock-edit-utility-item--hidden': settings.disableLightDarkModeSwitcherOnDock }"
        >
          <Tooltip
            :content="isDark ? $t('dock.dark_mode') : $t('dock.light_mode')" :placement="tooltipPlacement"
            class="group"
            pointer-events-none
          >
            <!-- moon -->
            <div
              v-if="isDark"
              pos="absolute top-0 left-0 group-hover:top-2px group-hover:left--4px"
              w-full h-full bg-white rounded="1/2"
              z--2 pointer-events-none
              :shadow="
                settings.disableDockGlowingEffect
                  ? 'none'
                  : 'group-hover:[-8px_4px_160px_20px_hsla(226deg,85%,77%,1),-8px_4px_100px_12px_hsla(226deg,85%,77%,0.8),-8px_4px_60px_10px_hsla(226deg,85%,77%,0.6),-8px_4px_20px_4px_hsla(226deg,85%,77%,0.4),-4px_2px_8px_0_hsla(226deg,85%,77%,0.8)]'"
              opacity-0 group-hover:opacity-100
              duration-300
            />

            <button
              class="dock-item"
              bg="!dark-hover:$bew-bg" transform="!dark-hover:scale-100"
              :shadow="settings.disableDockGlowingEffect ? 'none' : '!dark-hover:[inset_4px_-2px_8px_hsla(226deg,85%,77%,1)]'"
              :class="{
                'dock-icon-click-rebound': clickReboundTarget === THEME_MODE_TARGET,
                'dock-icon-click-suppressed': clickSuppressedTarget === THEME_MODE_TARGET,
              }"
              pointer-events-auto
              @click="handleDockThemeClick"
              @mouseenter="handleDockThemeEnter"
              @mouseleave="handleDockThemeLeave"
              @blur="handleDockIconBlur(THEME_MODE_TARGET, $event)"
            >
              <Transition name="fade">
                <div v-show="hoveringDockItem.themeMode" absolute>
                  <Icon v-if="isDark" icon="line-md:sunny-outline-to-moon-loop-transition" class="dock-theme-icon" />
                  <Icon v-else icon="line-md:moon-alt-to-sunny-outline-loop-transition" class="dock-theme-icon" />
                </div>
              </Transition>
              <Transition name="fade">
                <div v-show="!hoveringDockItem.themeMode" absolute>
                  <Icon v-if="isDark" icon="line-md:sunny-outline-to-moon-transition" class="dock-theme-icon" />
                  <Icon v-else icon="line-md:moon-to-sunny-outline-transition" class="dock-theme-icon" />
                </div>
              </Transition>
            </button>
          </Tooltip>
        </div>

        <Tooltip :content="$t('dock.settings')" :placement="tooltipPlacement">
          <button
            class="dock-item group"
            data-layout-edit-target="dock-settings"
            data-layout-settings-menu="BewlyComponents"
            data-layout-settings-page="dock"
            data-layout-settings-title-key="settings.group_dock"
            :class="{
              inactive: hoveringDockItem.themeMode && isDark,
            }"
            @click="openSettings()"
          >
            <div i-mingcute:settings-3-line text-xl group-hover:rotate-180 transition="transform duration-400 ease-out" />
          </button>
        </Tooltip>

        <Tooltip
          v-if="settings.showLayoutEditButton || isLayoutEditing"
          :content="$t(isLayoutEditing ? 'layout_editor.finish' : 'layout_editor.edit_dock')"
          :placement="tooltipPlacement"
        >
          <button
            class="dock-item dock-edit-button"
            data-layout-edit-control
            :class="{
              'active': isLayoutEditing,
              'dock-icon-click-rebound': clickReboundTarget === EDIT_DOCK_TARGET,
              'dock-icon-click-suppressed': clickSuppressedTarget === EDIT_DOCK_TARGET,
            }"
            :aria-pressed="isLayoutEditing"
            @click="handleDockEditClick"
            @mouseenter="cancelClickSuppressionRelease(EDIT_DOCK_TARGET)"
            @mouseleave="scheduleClickSuppressionRelease(EDIT_DOCK_TARGET)"
            @blur="handleDockIconBlur(EDIT_DOCK_TARGET, $event)"
          >
            <Icon
              :icon="isLayoutEditing ? 'mingcute:check-line' : 'mingcute:edit-3-line'"
              class="dock-edit-icon"
            />
          </button>
        </Tooltip>
      </div>

      <div
        v-if="isLayoutEditing"
        class="dock-edit-action-items"
        :style="dockActionButtonsStyle"
      >
        <div
          v-for="action in dockEditActions"
          :key="action.key"
          class="dock-edit-action-item"
          :class="{ 'dock-edit-action-item--hidden': action.hidden }"
        >
          <button
            type="button"
            class="back-to-top-or-refresh-btn"
            :data-layout-edit-target="`dock-action-${action.key}`"
            data-layout-settings-menu="BewlyComponents"
            data-layout-settings-page="dock"
            :data-layout-settings-title-key="action.settingsTitleKey"
            :aria-label="action.label"
            :title="action.label"
          >
            <Icon
              :icon="action.icon"
              class="dock-edit-action-item__icon"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <!-- Back to top & refresh buttons -->
      <div
        v-if="!isLayoutEditing && showDockActionButtons"
        class="dock-action-buttons"
        data-layout-settings-menu="BewlyComponents"
        data-layout-settings-page="dock"
        data-layout-settings-title-key="settings.back_to_top_and_refresh_buttons_are_separated"
        :style="dockActionButtonsStyle"
        pos="absolute"
        flex="~ gap-2"
      >
        <template
          v-if="settings.backToTopAndRefreshButtonsAreSeparated"
        >
          <template v-for="key in 2" :key="key">
            <Transition name="fade">
              <button
                v-if="(key === 1 && canRefreshCurrentPage) || (key === 2 && backToTopButtonEnabled && !reachTop)"
                class="back-to-top-or-refresh-btn"
                :class="{
                  'inactive': hoveringDockItem.themeMode && isDark,
                  'dock-action-pulse-refresh': key === 1 && dockActionPulse === 'refresh',
                  'dock-action-pulse-back-to-top': key === 2 && dockActionPulse === 'back-to-top',
                }"
                @click="handleBackToTopOrRefresh(key === 1 ? 'refresh' : 'backToTop')"
              >
                <Icon
                  v-if="key === 1"
                  icon="tabler:reload"
                  class="dock-action-icon"
                  shrink-0 absolute text="size-$bew-icon-size-lg"
                />
                <Icon
                  v-else
                  icon="line-md:arrow-small-up"
                  class="dock-action-icon"
                  shrink-0 absolute text="size-$bew-icon-size-lg"
                />
              </button>
            </Transition>
          </template>
        </template>
        <template v-else>
          <button
            v-if="backToTopButtonEnabled || canRefreshCurrentPage"
            class="back-to-top-or-refresh-btn"
            :class="{
              'inactive': hoveringDockItem.themeMode && isDark,
              'dock-action-pulse-refresh': dockActionPulse === 'refresh',
              'dock-action-pulse-back-to-top': dockActionPulse === 'back-to-top',
            }"
            @click="handleBackToTopOrRefresh('auto')"
          >
            <Transition name="fade">
              <Icon
                v-if="(reachTop || !backToTopButtonEnabled) && canRefreshCurrentPage"
                icon="tabler:reload"
                class="dock-action-icon"
                shrink-0 absolute text="size-$bew-icon-size-lg"
              />
              <Icon
                v-else
                icon="line-md:arrow-small-up"
                class="dock-action-icon"
                shrink-0 absolute text="size-$bew-icon-size-lg"
              />
            </Transition>
          </button>
        </template>
        <!-- 将原来的两个按钮替换为一个 -->
        <Transition name="fade">
          <button
            v-if="showUndoForwardActions"
            class="back-to-top-or-refresh-btn"
            :class="{
              'inactive': hoveringDockItem.themeMode && isDark,
              'dock-action-pulse-history': dockActionPulse === 'history',
            }"
            @click="handleHistoryNavigation"
          >
            <Icon
              v-if="showUndo"
              icon="mdi:undo-variant"
              class="dock-action-icon"
              shrink-0 absolute text="size-$bew-icon-size-lg"
            />
            <Icon
              v-else-if="showForward"
              icon="mdi:redo-variant"
              class="dock-action-icon"
              shrink-0 absolute text="size-$bew-icon-size-lg"
            />
          </button>
        </Transition>
      </div>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
// Avoid a viewport-sized click-through layer: it makes Chrome hit-test wheel
// scrolls on the main thread, which can stall a notch on an idle page.
.dock-wrap {
  &--left {
    inset: 0 auto 0 0;
    width: 0;
  }

  &--right {
    inset: 0 0 0 auto;
    width: 0;
  }

  &--bottom {
    inset: auto 0 0 0;
    height: 0;
  }

  > .dock-edge {
    --uno: "pointer-events-auto";
  }
}

.dock-edge {
  &-left,
  &-right,
  &-bottom {
    --uno: "absolute z--1";
  }

  &-left {
    --uno: "left-0 top-0 h-full";
    width: var(--bew-edge-hit-area);

    &:hover {
      width: var(--bew-edge-hover-area);
    }
  }

  &-right {
    --uno: "right-0 top-0 h-full";
    width: var(--bew-edge-hit-area);

    &:hover {
      width: var(--bew-edge-hover-area);
    }
  }

  &-bottom {
    --uno: "left-0 bottom-0 w-full";
    height: var(--bew-edge-hit-area);

    &:hover {
      height: var(--bew-edge-hover-area);
    }
  }
}

.back-to-top-or-refresh-btn :deep(.dock-action-icon) {
  width: var(--bew-icon-size-lg);
  height: var(--bew-icon-size-lg);
}

.dock-content {
  --uno: "absolute flex justify-center items-center scale-$scale";

  transition-duration: 0ms;
  // Only the visible pieces should hit-test; the inner margin would otherwise
  // cover the page scrollbar next to the Dock.
  pointer-events: none;

  > * {
    pointer-events: auto;
  }

  &.ready {
    transition-duration: var(--bew-duration-moderate, 300ms);
  }

  // Dock reveal can move an item underneath a stationary pointer. Delay only
  // Dock tooltips so that movement does not cause a tooltip to flash immediately.
  :deep(.b-tooltip) {
    transition-delay: 0ms;
  }

  :deep(.b-tooltip-wrapper:hover .b-tooltip) {
    transition-delay: var(--bew-duration-moderate, 300ms);
  }

  &.left {
    --uno: "left-2 after:right--4px";
  }
  &.left.hide:not(.hover) {
    --uno: "opacity-0 !translate-x--100%";
  }
  &.left.hide-inner:not(.hover) .dock-content-inner {
    --uno: "opacity-0 !translate-x--100%";
  }
  &.left.half-hide:not(.hover) {
    --uno: "!opacity-60 !translate-x--50%";
  }

  &.right {
    --uno: "right-2 after:left--4px";
  }
  &.right.hide:not(.hover) {
    --uno: "opacity-0 !translate-x-100%";
  }
  &.right.hide-inner:not(.hover) .dock-content-inner {
    --uno: "opacity-0 !translate-x-100%";
  }
  &.right.half-hide:not(.hover) {
    --uno: "!opacity-60 !translate-x-50%";
  }

  &.bottom {
    --uno: "top-unset bottom-0";
  }
  &.bottom.hide:not(.hover) {
    --uno: "opacity-0 !translate-y-100%";
  }
  &.bottom.hide-inner:not(.hover) .dock-content-inner {
    --uno: "opacity-0 !translate-y-100%";
  }
  &.bottom.half-hide:not(.hover) {
    --uno: "!opacity-60 !translate-y-50%";
  }

  &.hide-inner:not(.hover) .dock-content-inner {
    pointer-events: none;
  }

  .divider {
    --uno: "my-1 mx-3 h-2px bg-$bew-border-color rounded-full";
  }

  &.bottom .divider {
    --uno: "w-2px h-auto my-3 mx-1";
  }

  .dock-content-inner {
    --uno: "duration-300 ease-in-out";
    --uno: "p-2 m-2 bg-$bew-content-alt dark:bg-$bew-elevated";
    --uno: "flex flex-col gap-2 shrink-0";
    --uno: "rounded-full border-1 border-$bew-border-color";
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
    backdrop-filter: var(--bew-filter-glass-1);
    transition:
      transform var(--bew-duration-moderate, 300ms) ease-in-out,
      opacity var(--bew-duration-moderate, 300ms) ease-in-out;
  }

  .dock-action-buttons {
    z-index: 1;
  }

  &.bottom .dock-content-inner {
    --uno: "flex-row";
  }

  .back-to-top-or-refresh-btn {
    --uno: "transform active:important-scale-90 hover:scale-110";
    --uno: "lg:w-45px w-35px lg:h-45px h-35px";
    --uno: "grid place-items-center";
    --uno: "filter-$bew-filter-glass-1";
    --uno: "bg-$bew-elevated hover:bg-$bew-content-hover";
    --uno: "rounded-full shadow-$bew-shadow-2 border-1 border-$bew-border-color";

    backdrop-filter: var(--bew-filter-glass-1);
    transition:
      transform 300ms var(--bew-ease-emphasized, cubic-bezier(0.34, 1.3, 0.64, 1)),
      background 300ms ease,
      color 300ms ease,
      box-shadow 300ms ease,
      opacity 300ms ease;
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);

    &.active {
      --uno: "important-bg-$bew-theme-color-auto text-$bew-text-auto";
      --uno: "shadow-$shadow-active dark:shadow-$shadow-dark";
      --uno: "active:shadow-$shadow-active-active dark-active:shadow-$shadow-dark-active";
    }

    &.inactive {
      --uno: "opacity-80 !shadow-none";
    }
  }

  &.bottom .back-to-top-or-refresh-btn {
    --uno: "bottom-unset lg:right--45px right--35px";
  }
}

.dock-edit-utility-item {
  position: relative;
  flex: none;
}

.dock-edit-utility-item--hidden :deep(.dock-item) {
  opacity: 0.45;
}

.dock-edit-action-items {
  position: absolute;
  z-index: 10002;
  display: flex;
  gap: var(--bew-space-2);
}

.dock-edit-action-item {
  position: relative;
  flex: none;
}

.dock-edit-action-item--hidden .back-to-top-or-refresh-btn {
  opacity: 0.45;
}

.dock-edit-action-item__icon {
  position: absolute;
  width: var(--bew-icon-size-lg);
  height: var(--bew-icon-size-lg);
  flex: none;
}

.dock-item {
  --shadow-dark: 0 4px 30px 4px rgba(255, 255, 255, 0.6);
  --shadow-active: 0 4px 30px var(--bew-theme-color-60);
  --shadow-dark-active: 0 4px 20px rgba(255, 255, 255, 0.8);
  --shadow-active-active: 0 4px 20px var(--bew-theme-color-80);

  --uno: "relative transform active:important-scale-90 hover:scale-110";
  --uno: "lg:w-45px w-35px";
  --uno: "lg:lh-45px lh-35px";
  --uno: "p-0 flex items-center justify-center";
  --uno: "aspect-square relative";
  --uno: "leading-0";
  --uno: "rounded-full antialiased";
  --uno: "bg-$bew-fill-alt hover:bg-$bew-fill-2 cursor-pointer";
  --uno: "dark:bg-$bew-fill-1 dark-hover:bg-$bew-fill-4";

  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
  transition:
    transform 300ms var(--bew-ease-emphasized, cubic-bezier(0.34, 1.3, 0.64, 1)),
    background 300ms ease,
    color 300ms ease,
    box-shadow 300ms ease,
    opacity 300ms ease;

  &:hover {
    box-shadow:
      var(--bew-shadow-edge-glow-1),
      0 0 0 2px var(--bew-fill-2),
      var(--bew-shadow-2);
  }

  &.disable-glowing-effect {
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1) !important;
  }

  &.active {
    --uno: "important-bg-$bew-theme-color text-white !dark:bg-white !dark:text-black";
    --uno: "shadow-$shadow-active dark:shadow-$shadow-dark";
    --uno: "active:shadow-$shadow-active-active dark-active:shadow-$shadow-dark-active";
  }

  &.inactive {
    --uno: "opacity-80 !shadow-none";
  }

  :deep(.bew-local-icon) {
    --uno: "lg:w-22px w-18px lg:h-22px h-18px block align-middle";
  }
}

// 导航图标的悬停动画：按各自语义播放一次
.dock-item-icon-wrap {
  position: relative;
  display: grid;
  place-items: center;
}

.dock-item-icon {
  position: relative;
  z-index: 1;
}

.dock-svg-icon {
  display: block;
  width: 1.2em;
  height: 1.2em;
  font-size: calc(var(--bew-base-font-size) * 1.25);
}

.dock-item:hover .dock-item-icon,
.dock-item:focus-visible .dock-item-icon {
  animation-duration: 400ms;
  animation-timing-function: var(--bew-ease-standard, cubic-bezier(0.22, 0.61, 0.36, 1));
}

.dock-icon-anim-home:hover .dock-item-icon,
.dock-icon-anim-home:focus-visible .dock-item-icon {
  animation-name: dock-icon-home;
  animation-duration: 600ms;
}

.dock-icon-anim-search:hover .dock-item-icon,
.dock-icon-anim-search:focus-visible .dock-item-icon {
  animation-name: dock-icon-search;
  animation-duration: 650ms;
}

.dock-icon-anim-anime:hover .dock-anime-wave,
.dock-icon-anim-anime:focus-visible .dock-anime-wave {
  animation: dock-anime-wave 800ms var(--bew-ease-out) both;
}

.dock-icon-anim-anime:hover .dock-anime-wave-2,
.dock-icon-anim-anime:focus-visible .dock-anime-wave-2 {
  animation-delay: 120ms;
}

.dock-icon-anim-anime:hover .dock-anime-eyes,
.dock-icon-anim-anime:focus-visible .dock-anime-eyes {
  animation: dock-anime-eyes-blink 600ms var(--bew-ease-out);
}

.dock-icon-anim-favorites:hover .dock-item-icon,
.dock-icon-anim-favorites:focus-visible .dock-item-icon {
  animation-name: dock-icon-favorites;
  animation-duration: 550ms;
}

.dock-icon-anim-favorites:hover .dock-favorites-sparkle,
.dock-icon-anim-favorites:focus-visible .dock-favorites-sparkle {
  animation: dock-favorites-sparkle 700ms var(--bew-ease-out);
}

.dock-icon-anim-history:hover .dock-clock-hand,
.dock-icon-anim-history:focus-visible .dock-clock-hand {
  animation: dock-icon-history-hand 650ms var(--bew-ease-in-out);
}

.dock-icon-anim-watch-later:hover .dock-carplay-play,
.dock-icon-anim-watch-later:focus-visible .dock-carplay-play {
  animation: dock-icon-watch-later-play 500ms var(--bew-ease-emphasized, cubic-bezier(0.34, 1.3, 0.64, 1));
}

.dock-icon-anim-moments:hover .dock-item-icon,
.dock-icon-anim-moments:focus-visible .dock-item-icon {
  animation-name: dock-icon-moments;
  animation-duration: 650ms;
  animation-timing-function: var(--bew-ease-in-out);
}

.dock-item.dock-icon-click-rebound .dock-item-icon,
.dock-item.dock-icon-click-rebound .dock-theme-icon,
.dock-edit-button.dock-icon-click-rebound .dock-edit-icon {
  animation: dock-icon-click-rebound 320ms var(--bew-ease-emphasized, cubic-bezier(0.34, 1.3, 0.64, 1)) !important;
}

.dock-item.dock-icon-click-suppressed:not(.dock-icon-click-rebound) .dock-item-icon,
.dock-item.dock-icon-click-suppressed:not(.dock-icon-click-rebound) .dock-theme-icon,
.dock-edit-button.dock-icon-click-suppressed:not(.dock-icon-click-rebound) .dock-edit-icon {
  animation-name: none !important;
}

.dock-item.dock-icon-click-suppressed .dock-anime-eyes,
.dock-item.dock-icon-click-suppressed .dock-anime-wave,
.dock-item.dock-icon-click-suppressed .dock-favorites-sparkle,
.dock-item.dock-icon-click-suppressed .dock-clock-hand,
.dock-item.dock-icon-click-suppressed .dock-carplay-play {
  animation-name: none !important;
}

.dock-anime-signal {
  position: absolute;
  inset: -4px;
  z-index: 2;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  pointer-events: none;
}

.dock-anime-wave {
  opacity: 0;
  transform-box: view-box;
  transform-origin: 67.4% 22.4%;
}

.dock-anime-eyes {
  transform-box: view-box;
  transform-origin: 50% 52%;
}

.dock-edit-button:hover .dock-edit-icon,
.dock-edit-button:focus-visible .dock-edit-icon {
  animation: dock-edit-icon-wiggle 520ms var(--bew-ease-standard, cubic-bezier(0.22, 0.61, 0.36, 1));
}

.back-to-top-or-refresh-btn.dock-action-pulse-refresh .dock-action-icon {
  animation: dock-action-refresh 600ms var(--bew-ease-in-out);
}

.back-to-top-or-refresh-btn.dock-action-pulse-back-to-top .dock-action-icon {
  animation: dock-action-back-to-top 450ms var(--bew-ease-out);
}

.back-to-top-or-refresh-btn.dock-action-pulse-history .dock-action-icon {
  animation: dock-action-history 520ms var(--bew-ease-emphasized, cubic-bezier(0.34, 1.3, 0.64, 1));
}

.dock-favorites-sparkle {
  position: absolute;
  top: -2px;
  right: -2px;
  z-index: 2;
  width: 7px;
  height: 7px;
  background-color: currentColor;
  clip-path: polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%);
  opacity: 0;
  transform: scale(0) rotate(0deg);
  transform-origin: center;
}

.dock-clock-hand,
.dock-carplay-play {
  transform-box: view-box;
}

.dock-clock-hand {
  transform-origin: 50% 50%;
}

.dock-carplay-play {
  transform-origin: 54% 50%;
}

@keyframes dock-icon-home {
  0% {
    transform: translateY(0) scale(1, 1);
  }
  18% {
    transform: translateY(1.5px) scale(1.06, 0.92);
  }
  48% {
    transform: translateY(-5px) scale(0.96, 1.04);
  }
  68% {
    transform: translateY(1.5px) scale(1.05, 0.95);
  }
  84% {
    transform: translateY(-1.5px) scale(0.99, 1.01);
  }
  100% {
    transform: translateY(0) scale(1, 1);
  }
}

@keyframes dock-icon-search {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  20% {
    transform: translate(-2.5px, 1.5px) rotate(-10deg);
  }
  45% {
    transform: translate(2.5px, -1.5px) rotate(6deg);
  }
  70% {
    transform: translate(3px, 1px) rotate(8deg);
  }
  100% {
    transform: translate(0, 0) rotate(0deg);
  }
}

@keyframes dock-icon-favorites {
  0%,
  100% {
    transform: scale(1) rotate(0deg);
  }
  30% {
    transform: scale(1.2) rotate(10deg);
  }
  62% {
    transform: scale(0.96) rotate(-5deg);
  }
}

@keyframes dock-favorites-sparkle {
  0% {
    opacity: 0;
    transform: scale(0) rotate(0deg);
  }
  25% {
    opacity: 1;
    transform: scale(1.1) rotate(45deg);
  }
  55% {
    opacity: 1;
    transform: scale(1) rotate(65deg);
  }
  80% {
    opacity: 0.8;
    transform: scale(0.8) rotate(80deg);
  }
  100% {
    opacity: 0;
    transform: scale(0) rotate(90deg);
  }
}

@keyframes dock-anime-wave {
  0% {
    opacity: 0;
    transform: scale(0.7);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.15);
  }
}

@keyframes dock-anime-eyes-blink {
  0%,
  55%,
  70%,
  100% {
    transform: scaleY(1);
  }
  62% {
    transform: scaleY(0.12);
  }
}

@keyframes dock-icon-history-hand {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(-360deg);
  }
}

@keyframes dock-icon-watch-later-play {
  0%,
  100% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.22);
  }
  70% {
    transform: scale(0.96);
  }
}

@keyframes dock-icon-click-rebound {
  0% {
    transform: var(--dock-click-rebound-from, scale(1));
  }
  35% {
    transform: scale(0.9);
  }
  70% {
    transform: scale(1.04);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes dock-icon-moments {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes dock-edit-icon-wiggle {
  0%,
  100% {
    transform: rotate(0deg);
  }
  22% {
    transform: rotate(-10deg);
  }
  48% {
    transform: rotate(8deg);
  }
  72% {
    transform: rotate(-4deg);
  }
}

@keyframes dock-action-refresh {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes dock-action-back-to-top {
  0%,
  100% {
    transform: translateY(0);
  }
  35% {
    transform: translateY(-4px);
  }
  65% {
    transform: translateY(1px);
  }
}

@keyframes dock-action-history {
  0%,
  100% {
    transform: scale(1) rotate(0deg);
  }
  30% {
    transform: scale(0.85) rotate(-20deg);
  }
  65% {
    transform: scale(1.08) rotate(6deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dock-item:hover .dock-item-icon,
  .dock-item:focus-visible .dock-item-icon,
  .dock-item:hover .dock-clock-hand,
  .dock-item:focus-visible .dock-clock-hand,
  .dock-item:hover .dock-carplay-play,
  .dock-item:focus-visible .dock-carplay-play,
  .dock-item:hover .dock-anime-wave,
  .dock-item:focus-visible .dock-anime-wave,
  .dock-item:hover .dock-anime-eyes,
  .dock-item:focus-visible .dock-anime-eyes,
  .dock-item:hover .dock-favorites-sparkle,
  .dock-item:focus-visible .dock-favorites-sparkle,
  .dock-edit-button:hover .dock-edit-icon,
  .dock-edit-button:focus-visible .dock-edit-icon,
  .back-to-top-or-refresh-btn.dock-action-pulse-refresh .dock-action-icon,
  .back-to-top-or-refresh-btn.dock-action-pulse-back-to-top .dock-action-icon,
  .back-to-top-or-refresh-btn.dock-action-pulse-history .dock-action-icon,
  .dock-item.dock-icon-click-rebound .dock-item-icon,
  .dock-item.dock-icon-click-rebound .dock-theme-icon,
  .dock-edit-button.dock-icon-click-rebound .dock-edit-icon {
    animation: none !important;
  }
}
</style>
