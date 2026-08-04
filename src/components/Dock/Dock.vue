<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useElementSize, useWindowSize } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { computed, ref } from 'vue'

import { UndoForwardState, useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { useDelayedHover } from '~/composables/useDelayedHover'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { isHomePage, openLinkToNewTab } from '~/utils/main'

import LiquidSegmentIndicator from '../LiquidSegmentIndicator.vue'
import PageModeSwitcherButton from '../PageModeSwitcherButton.vue'
import Tooltip from '../Tooltip.vue'
import type { HoveringDockItem } from './types'

const props = defineProps<{
  activatedPage: AppPage
}>()

const emit = defineEmits<{
  (e: 'dockItemClick', dockItem: DockItem): void
  (e: 'dockItemMiddleClick', dockItem: DockItem): void
  (e: 'settingsVisibilityChange'): void
  (e: 'refresh'): void
  (e: 'backToTop'): void
  (e: 'undoRefresh'): void
  (e: 'forwardRefresh'): void
}>()

const mainStore = useMainStore()
const settingsStore = useSettingsStore()
const { isDark, toggleDark } = useDark()
const { reachTop, homeActivatedPage, undoForwardState, canRefreshHomeSubPage } = useBewlyApp()

// 计算属性：是否显示撤销按钮
const showUndo = computed(() => undoForwardState.value === UndoForwardState.ShowUndo)
// 计算属性：是否显示前进按钮
const showForward = computed(() => undoForwardState.value === UndoForwardState.ShowForward)

const hideDock = ref<boolean>(false)
const dockContentHover = ref<boolean>(false)
const dockReady = ref(false)
let dockReadyFrame: number | undefined
const dockContentRef = useDelayedHover({
  enterDelay: 100,
  leaveDelay: 600,
  enter: () => {
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
  settings: false,
})
const currentDockItems = ref<DockItem[]>([])

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
  if (settingsStore.getDockItemIsUseOriginalBiliPage(props.activatedPage)) {
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
  return showBackToTopOrRefreshButton.value && (canRefreshCurrentPage.value || !reachTop.value)
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

const detachDockActionButtons = computed((): boolean => {
  return settings.value.autoHideDock && settings.value.alwaysShowDockActionsWhenAutoHide
})

const showInlineDockActionButtons = computed((): boolean => {
  return showDockActionButtons.value && !detachDockActionButtons.value
})

const showDetachedDockActionButtons = computed((): boolean => {
  return showDockActionButtons.value && detachDockActionButtons.value
})

watch(() => settings.value.autoHideDock, (newValue) => {
  hideDock.value = newValue
}, { immediate: true })

// use Json stringify to watch the changes of the array item properties
watch(
  [
    () => JSON.stringify(settings.value.dockItemsConfig),
    () => settings.value.pageMode,
  ],
  () => {
    currentDockItems.value = computeDockItem()
  },
  { immediate: true },
)

function computeDockItem(): DockItem[] {
  const targetDockItems: DockItem[] = []

  for (const item of settingsStore.ensureDockItemsConfig()) {
    if (!item.visible)
      continue

    const defaultItem = mainStore.getDockItemByPage(item.page)
    if (!defaultItem)
      continue

    targetDockItems.push({
      ...defaultItem,
      openInNewTab: item.openInNewTab,
      useOriginalBiliPage: settingsStore.getDockItemIsUseOriginalBiliPage(item.page)
        || !defaultItem.hasBewlyPage,
    })
  }
  return targetDockItems
}

function toggleHideDock(hide: boolean) {
  if (settings.value.autoHideDock)
    hideDock.value = hide
  else
    hideDock.value = false
}

function handleDockItemClick($event: MouseEvent, dockItem: DockItem) {
  if ($event.ctrlKey || $event.metaKey) {
    openDockItemInNewTab(dockItem)
    return
  }

  emit('dockItemClick', dockItem)
}

function openDockItemInNewTab(dockItem: DockItem) {
  openLinkToNewTab(`https://www.bilibili.com/?page=${dockItem.page}`)
}

function handleBackToTopOrRefresh(action: 'backToTop' | 'refresh' | 'auto' = 'auto') {
  if (action === 'backToTop') {
    emit('backToTop')
  }
  else if (action === 'refresh') {
    if (canRefreshCurrentPage.value)
      emit('refresh')
  }
  else {
    if (reachTop.value && canRefreshCurrentPage.value) {
      emit('refresh')
    }
    else {
      emit('backToTop')
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
  }
  else if (showForward.value) {
    handleForwardRefresh()
  }
}

function isDockItemActivated(dockItem: DockItem): boolean {
  // SearchResults 页面时也激活 Search 按钮
  if (props.activatedPage === AppPage.SearchResults && dockItem.page === AppPage.Search) {
    return isHomePage()
  }
  return props.activatedPage === dockItem.page && isHomePage()
}

const activeDockItemPage = computed(() => {
  return currentDockItems.value.find(isDockItemActivated)?.page
})

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

  if (detachDockActionButtons.value) {
    additionalHeight = 0
    additionalWidth = 0
  }
  else if (settings.value.dockPosition === 'bottom') {
    const maxButtonCount = settings.value.backToTopAndRefreshButtonsAreSeparated ? 2 : 1
    const maxUndoForwardButtonCount = settings.value.enableUndoRefreshButton ? 1 : 0
    additionalWidth = (maxButtonCount + maxUndoForwardButtonCount) * buttonSize + maxButtonCount * buttonGap
  }
  else {
    const maxButtonCount = settings.value.backToTopAndRefreshButtonsAreSeparated ? 2 : 1
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

const detachedDockActionButtonsStyle = computed<CSSProperties>(() => {
  const scale = dockScale.value
  const gap = 8
  const actionButtonSize = windowWidth.value >= 1024 ? 45 : 35
  const sideActionInset = `${gap + Math.max(0, ((dockWidth.value - actionButtonSize) * scale) / 2)}px`

  if (settings.value.dockPosition === 'bottom') {
    return {
      left: `calc(50% + ${(dockWidth.value * scale) / 2 + gap}px)`,
      bottom: '8px',
      transform: `scale(${scale})`,
      transformOrigin: 'left bottom',
      flexDirection: 'row',
    }
  }

  return {
    top: `calc(50% + ${(dockHeight.value * scale) / 2 + gap}px)`,
    left: settings.value.dockPosition === 'left' ? sideActionInset : 'unset',
    right: settings.value.dockPosition === 'right' ? sideActionInset : 'unset',
    transform: `scale(${scale})`,
    transformOrigin: settings.value.dockPosition === 'left' ? 'left top' : 'right top',
    flexDirection: 'column',
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

  // 获取配置的快捷键
  const configuredKey = shortcutConfig.key || 'R'

  // 检查是否按下了配置的快捷键
  if (event.key && event.key.toUpperCase() === configuredKey.toUpperCase() && !event.ctrlKey && !event.metaKey && !event.altKey) {
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
  if (dockReadyFrame !== undefined)
    cancelAnimationFrame(dockReadyFrame)
})
</script>

<template>
  <aside
    class="dock-wrap"
    pos="fixed top-0" z-100 flex="~ col justify-center items-center" w-full h-full
    z-10 pointer-events-none
  >
    <!-- Edge Div -->
    <div
      v-if="settings.autoHideDock && hideDock"
      class="dock-edge"
      :class="`dock-edge-${settings.dockPosition}`"
      @mouseenter="toggleHideDock(false)"
      @mouseleave="toggleHideDock(true)"
    />

    <!-- Dock Content -->
    <div
      ref="dockContentRef"
      class="dock-content"
      :class="{
        'left': settings.dockPosition === 'left',
        'right': settings.dockPosition === 'right',
        'bottom': settings.dockPosition === 'bottom',
        'hide': hideDock,
        'half-hide': settings.halfHideDock,
        'hover': dockContentHover,
        'ready': dockReady,
      }"
      :style="dockTransformStyle"
      @mouseenter="toggleHideDock(false)"
      @mouseleave="toggleHideDock(true)"
    >
      <div
        class="dock-content-inner"
      >
        <div
          class="dock-page-navigation bew-segment-control"
          :class="{ 'disable-glowing-effect': settings.disableDockGlowingEffect }"
        >
          <LiquidSegmentIndicator :active-key="activeDockItemPage" white />

          <template v-for="dockItem in currentDockItems" :key="dockItem.page">
            <Tooltip :content="$t(dockItem.i18nKey)" :placement="tooltipPlacement">
              <button
                type="button"
                class="dock-page-navigation__item bew-segment-control__item bew-segment-control__item--icon"
                :class="{ inactive: hoveringDockItem.themeMode && isDark }"
                data-segment-item
                :data-active="isDockItemActivated(dockItem) ? 'true' : undefined"
                :aria-current="isDockItemActivated(dockItem) ? 'page' : undefined"
                @click="handleDockItemClick($event, dockItem)"
                @click.middle="openDockItemInNewTab(dockItem)"
              >
                <span
                  class="dock-page-navigation__icon"
                  :class="isDockItemActivated(dockItem) ? dockItem.iconActivated : dockItem.icon"
                  aria-hidden="true"
                />
              </button>
            </Tooltip>
          </template>
        </div>

        <!-- dividing line -->
        <div class="divider" />

        <PageModeSwitcherButton
          v-if="settings.showBewlyOrBiliPageSwitcher"
          :activated-page="activatedPage"
          :placement="tooltipPlacement"
          variant="dock"
          :disable-glowing-effect="settings.disableDockGlowingEffect"
        />

        <Tooltip
          v-if="!settings.disableLightDarkModeSwitcherOnDock"
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
            pointer-events-auto
            @click="toggleDark"
            @mouseenter="hoveringDockItem.themeMode = true"
            @mouseleave="hoveringDockItem.themeMode = false"
          >
            <Transition name="fade">
              <div v-show="hoveringDockItem.themeMode" absolute>
                <Icon v-if="isDark" icon="line-md:sunny-outline-to-moon-loop-transition" />
                <Icon v-else icon="line-md:moon-alt-to-sunny-outline-loop-transition" />
              </div>
            </Transition>
            <Transition name="fade">
              <div v-show="!hoveringDockItem.themeMode" absolute>
                <Icon v-if="isDark" icon="line-md:sunny-outline-to-moon-transition" />
                <Icon v-else icon="line-md:moon-to-sunny-outline-transition" />
              </div>
            </Transition>
          </button>
        </Tooltip>

        <Tooltip :content="$t('dock.settings')" :placement="tooltipPlacement">
          <button
            class="dock-item group"
            :class="{
              inactive: hoveringDockItem.themeMode && isDark,
            }"
            @click="emit('settingsVisibilityChange')"
          >
            <div i-mingcute:settings-3-line text-xl group-hover:rotate-180 transition="transform duration-400 ease-out" />
          </button>
        </Tooltip>
      </div>

      <!-- Back to top & refresh buttons -->
      <div
        v-if="showInlineDockActionButtons"
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
                v-if="(key === 1 && canRefreshCurrentPage) || (key === 2 && !reachTop)"
                class="back-to-top-or-refresh-btn"
                :class="{
                  inactive: hoveringDockItem.themeMode && isDark,
                }"
                @click="handleBackToTopOrRefresh(key === 1 ? 'refresh' : 'backToTop')"
              >
                <Icon
                  v-if="key === 1"
                  icon="line-md:rotate-270"
                  shrink-0 rotate-90 absolute text="size-$bew-icon-size-lg"
                />
                <Icon
                  v-else
                  icon="line-md:arrow-small-up"
                  shrink-0 absolute text="size-$bew-icon-size-lg"
                />
              </button>
            </Transition>
          </template>
        </template>
        <template v-else>
          <button
            class="back-to-top-or-refresh-btn"
            :class="{
              inactive: hoveringDockItem.themeMode && isDark,
            }"
            @click="handleBackToTopOrRefresh('auto')"
          >
            <Transition name="fade">
              <Icon
                v-if="reachTop && canRefreshCurrentPage"
                icon="line-md:rotate-270"
                shrink-0 rotate-90 absolute text="size-$bew-icon-size-lg"
              />
              <Icon
                v-else
                icon="line-md:arrow-small-up"
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
              inactive: hoveringDockItem.themeMode && isDark,
            }"
            @click="handleHistoryNavigation"
          >
            <Icon
              v-if="showUndo"
              icon="mdi:undo-variant"
              shrink-0 absolute text="size-$bew-icon-size-lg"
            />
            <Icon
              v-else-if="showForward"
              icon="mdi:redo-variant"
              shrink-0 absolute text="size-$bew-icon-size-lg"
            />
          </button>
        </Transition>
      </div>
    </div>

    <!-- Detached action buttons stay visible when the dock itself is auto-hidden. -->
    <div
      v-if="showDetachedDockActionButtons"
      class="detached-dock-actions"
      :style="detachedDockActionButtonsStyle"
      pos="absolute"
      flex="~ gap-2"
    >
      <Transition name="fade">
        <button
          v-if="showBackToTopOrRefreshButton && canRefreshCurrentPage"
          class="back-to-top-or-refresh-btn"
          @click="handleBackToTopOrRefresh('refresh')"
        >
          <Icon
            icon="line-md:rotate-270"
            shrink-0 rotate-90 absolute text="size-$bew-icon-size-lg"
          />
        </button>
      </Transition>
      <Transition name="fade">
        <button
          v-if="showBackToTopOrRefreshButton && !reachTop"
          class="back-to-top-or-refresh-btn"
          @click="handleBackToTopOrRefresh('backToTop')"
        >
          <Icon
            icon="line-md:arrow-small-up"
            shrink-0 absolute text="size-$bew-icon-size-lg"
          />
        </button>
      </Transition>
      <Transition name="fade">
        <button
          v-if="showUndoForwardActions"
          class="back-to-top-or-refresh-btn"
          @click="handleHistoryNavigation"
        >
          <Icon
            v-if="showUndo"
            icon="mdi:undo-variant"
            shrink-0 absolute text="size-$bew-icon-size-lg"
          />
          <Icon
            v-else-if="showForward"
            icon="mdi:redo-variant"
            shrink-0 absolute text="size-$bew-icon-size-lg"
          />
        </button>
      </Transition>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.dock-wrap {
  > * {
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
    --uno: "left-0 top-0 w-14px h-full hover:w-60px";
  }

  &-right {
    --uno: "right-0 top-0 w-14px h-full hover:w-60px";
  }

  &-bottom {
    --uno: "left-0 bottom-0 w-full h-14px hover-h-60px";
  }
}

.detached-dock-actions {
  --uno: "pointer-events-auto z-1";

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
  }
}

.dock-content {
  --uno: "absolute flex justify-center items-center scale-$scale";

  transition-duration: 0ms;

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
  &.left.half-hide:not(.hover) {
    --uno: "!opacity-60 !translate-x--50%";
  }

  &.right {
    --uno: "right-2 after:left--4px";
  }
  &.right.hide:not(.hover) {
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
  &.bottom.half-hide:not(.hover) {
    --uno: "!opacity-60 !translate-y-50%";
  }

  .divider {
    --uno: "my-1 mx-3 h-3px bg-$bew-border-color rounded-full";
  }

  &.bottom .divider {
    --uno: "w-3px h-auto my-3 mx-1";
  }

  .dock-content-inner {
    --uno: "duration-300 ease-in-out";
    --uno: "p-2 m-2 bg-$bew-content-alt dark:bg-$bew-elevated";
    --uno: "flex flex-col gap-2 shrink-0";
    --uno: "rounded-full border-1 border-$bew-border-color";
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
    backdrop-filter: var(--bew-filter-glass-1);
  }

  &.bottom .dock-content-inner {
    --uno: "flex-row";
  }

  .dock-page-navigation {
    --bew-liquid-indicator-bg-white: var(--bew-dock-navigation-active-bg);
    --bew-liquid-indicator-shadow-white: var(--bew-dock-navigation-active-shadow);

    flex-direction: column;
    width: auto;
    height: auto;
    padding: 0;
    gap: var(--bew-space-2);
    overflow: visible;

    &.disable-glowing-effect {
      --bew-liquid-indicator-shadow-white: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
    }
  }

  &.bottom .dock-page-navigation {
    flex-direction: row;
  }

  .dock-page-navigation__item {
    width: var(--bew-dock-control-size);
    height: var(--bew-dock-control-size);
    color: var(--bew-text-1);
    transition:
      color var(--bew-duration-normal) var(--bew-ease-standard),
      transform var(--bew-duration-moderate) var(--bew-ease-emphasized);

    &:hover:not([data-active="true"]):not(:disabled) {
      transform: scale(1.1);
    }

    &[data-active="true"] {
      color: var(--bew-dock-navigation-active-color);
    }

    &:hover:not([data-active="true"]):not(:disabled),
    &:focus-visible:not([data-active="true"]):not(:disabled) {
      background: transparent;
      box-shadow: none;
    }

    &:focus-visible:not([data-active="true"]):not(:disabled) {
      outline: 2px solid var(--bew-theme-color-40);
      outline-offset: var(--bew-space-0-5);
    }

    &:active:not(:disabled) {
      transform: scale(0.9);
    }

    &.inactive {
      opacity: 0.8;
      box-shadow: none !important;
    }
  }

  .dock-page-navigation:not(.disable-glowing-effect) {
    .dock-page-navigation__item:hover:not([data-active="true"]):not(:disabled),
    .dock-page-navigation__item:focus-visible:not([data-active="true"]):not(:disabled) {
      .dock-page-navigation__icon {
        filter: var(--bew-dock-navigation-hover-icon-glow);
      }
    }
  }

  .dock-page-navigation__icon {
    display: block;
    width: var(--bew-icon-size-md);
    height: var(--bew-icon-size-md);
    font-size: var(--bew-icon-size-md);
    transition: filter var(--bew-duration-normal) var(--bew-ease-standard);
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

.dock-item {
  --shadow-dark: 0 4px 30px 4px rgba(255, 255, 255, 0.6);
  --shadow-active: 0 4px 30px var(--bew-theme-color-60);
  --shadow-dark-active: 0 4px 20px rgba(255, 255, 255, 0.8);
  --shadow-active-active: 0 4px 20px var(--bew-theme-color-80);

  --uno: "relative transform active:important-scale-90 hover:scale-110";
  width: var(--bew-dock-control-size);
  height: var(--bew-dock-control-size);
  line-height: var(--bew-dock-control-size);
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

  svg {
    width: var(--bew-dock-control-icon-size);
    height: var(--bew-dock-control-icon-size);
    display: block;
    vertical-align: middle;
  }
}

@media (min-width: 1024px) {
  .dock-content .dock-page-navigation__item {
    width: var(--bew-dock-control-size-lg);
    height: var(--bew-dock-control-size-lg);
  }

  .dock-item {
    width: var(--bew-dock-control-size-lg);
    height: var(--bew-dock-control-size-lg);
    line-height: var(--bew-dock-control-size-lg);

    svg {
      width: var(--bew-dock-control-icon-size-lg);
      height: var(--bew-dock-control-icon-size-lg);
    }
  }
}
</style>
