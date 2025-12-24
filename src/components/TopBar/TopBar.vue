<script setup lang="ts">
import { onKeyStroke, useMouseInElement, useMutationObserver } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { OVERLAY_SCROLL_BAR_SCROLL, TOP_BAR_VISIBILITY_CHANGE } from '~/constants/globalEvents'
import { VideoPageTopBarConfig } from '~/enums/appEnums'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { isHomePage, isUserSpacePage, isVideoOrBangumiPage } from '~/utils/main'
import emitter from '~/utils/mitt'

import NotificationsDrawer from './components/NotificationsDrawer.vue'
import TopBarHeader from './components/TopBarHeader.vue'
import { useTopBarInteraction } from './composables/useTopBarInteraction'

const { scrollbarRef, reachTop } = useBewlyApp()
// 顶栏状态管理
const topBarStore = useTopBarStore()
const { forceWhiteIcon } = useTopBarInteraction()

const conflictingHeaderSelectors = ['.fixed-author-header', '.fixed-top-header']

const { isDark } = useDark()

// 顶栏显示控制
const hideTopBar = ref<boolean>(false)
const desiredTopBarVisible = ref(true)
const forceHideTopBar = ref(false)
const headerTarget = ref(null)
const topAreaTarget = ref(null)
const { isOutside: isOutsideTopBar } = useMouseInElement(headerTarget)
const { isOutside: isOutsideTopArea } = useMouseInElement(topAreaTarget)

// 当前URL
const currentUrl = ref(window.location.href)

// 监听URL变化
function checkUrlChange() {
  if (currentUrl.value !== window.location.href) {
    currentUrl.value = window.location.href
    setupScrollListeners()
    updateConflictingHeaderVisibility()
  }
}

// 延迟隐藏计时器
let hideTimer: number | null = null
let urlCheckTimer: number | null = null

// 检测是否有弹窗激活
const hasActivePopup = computed(() => {
  return Object.values(topBarStore.popupVisible).some(visible => visible)
})

function applyTopBarVisibility() {
  const shouldShow = desiredTopBarVisible.value
    && (
      !forceHideTopBar.value
      || hasActivePopup.value
      || topBarStore.isSwitcherButtonVisible
    )

  hideTopBar.value = !shouldShow
  topBarStore.setTopBarVisible(shouldShow)
  emitter.emit(TOP_BAR_VISIBILITY_CHANGE, shouldShow)
}

// 处理顶栏显示/隐藏逻辑的函数
function handleTopBarVisibility() {
  if (isVideoOrBangumiPage() && settings.value.videoPageTopBarConfig === VideoPageTopBarConfig.ShowOnMouse) {
    // 清除之前的计时器
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }

    // 如果鼠标在顶栏区域或顶部监听区域，或者有任何弹窗激活，或者切换器按钮可见，则显示顶栏
    if (!isOutsideTopBar.value || !isOutsideTopArea.value || hasActivePopup.value || topBarStore.isSwitcherButtonVisible) {
      toggleTopBarVisible(true)
    }
    else {
      // 延迟隐藏顶栏
      hideTimer = window.setTimeout(() => {
        // 再次检查是否有弹窗激活，防止在延迟期间有弹窗打开
        const hasActivePopupNow = hasActivePopup.value
        const isSwitcherButtonVisibleNow = topBarStore.isSwitcherButtonVisible

        // 在鼠标显示模式下，如果所有弹窗都关闭且鼠标不在检测区域，则隐藏顶栏
        if (!hasActivePopupNow && !isSwitcherButtonVisibleNow) {
          toggleTopBarVisible(false)
        }
      }, 500) // 500ms 延迟
    }
  }
}

// 监听鼠标位置变化和相关状态
watch([isOutsideTopBar, isOutsideTopArea, () => topBarStore.isSwitcherButtonVisible], handleTopBarVisibility)

// 监听弹窗状态变化
watch(hasActivePopup, () => {
  // 当弹窗状态变化时，触发顶栏显示/隐藏逻辑
  handleTopBarVisibility()
  applyTopBarVisibility()
})

watch(forceHideTopBar, () => {
  applyTopBarVisibility()
})

watch(() => topBarStore.isSwitcherButtonVisible, () => {
  applyTopBarVisibility()
})

// 滚动处理
const scrollTop = ref<number>(0)
const oldScrollTop = ref<number>(0)
const SCROLL_THRESHOLD = 10 // 滚动阈值，只有滚动超过这个值才触发顶栏显示/隐藏

// 保存overlay scroll的handler引用，用于正确移除监听器
let overlayScrollHandler: ((scrollTop: number) => void) | null = null

function handleScroll(arg?: number | Event): void {
  // 优先使用传入的 scrollTop 值，避免重复 DOM 读取
  if (typeof arg === 'number') {
    scrollTop.value = arg
  }
  else if (isHomePage() && !settings.value.useOriginalBilibiliHomepage) {
    // 仅在非首页或使用原始页面时才读取 DOM
    const osInstance = scrollbarRef.value?.osInstance()
    if (osInstance) {
      scrollTop.value = osInstance.elements().viewport.scrollTop
    }
    return
  }
  else {
    scrollTop.value = document.documentElement.scrollTop
  }

  // 计算滚动距离，只有超过阈值才处理
  const scrollDelta = scrollTop.value - oldScrollTop.value

  // 在视频页面处理不同的配置
  if (isVideoOrBangumiPage()) {
    const config = settings.value.videoPageTopBarConfig

    // 总是显示：不处理滚动隐藏
    if (config === VideoPageTopBarConfig.AlwaysShow) {
      // 不做任何处理，保持显示
      oldScrollTop.value = scrollTop.value
      return
    }

    // 总是隐藏：不处理滚动显示
    if (config === VideoPageTopBarConfig.AlwaysHide) {
      // 不做任何处理，保持隐藏
      oldScrollTop.value = scrollTop.value
      return
    }

    // 鼠标显示：不处理滚动事件
    if (config === VideoPageTopBarConfig.ShowOnMouse) {
      oldScrollTop.value = scrollTop.value
      return
    }

    // 滚动显示：处理滚动逻辑
    if (config === VideoPageTopBarConfig.ShowOnScroll) {
      if (scrollTop.value === 0) {
        toggleTopBarVisible(true)
        oldScrollTop.value = scrollTop.value
      }
      else if (Math.abs(scrollDelta) > SCROLL_THRESHOLD) {
        // 只有滚动超过阈值才更新状态
        if (scrollDelta > 0) {
          toggleTopBarVisible(false)
        }
        else {
          toggleTopBarVisible(true)
        }
        oldScrollTop.value = scrollTop.value
      }
    }
  }
  // 处理其他页面的自动隐藏逻辑
  else {
    if (scrollTop.value === 0) {
      toggleTopBarVisible(true)
      oldScrollTop.value = scrollTop.value
      return
    }

    // 只有滚动超过阈值才处理
    if (Math.abs(scrollDelta) <= SCROLL_THRESHOLD) {
      return
    }

    // 在用户首页强制开启滚动隐藏，无论设置如何
    if (isUserSpacePage()) {
      if (isOutsideTopBar.value && scrollTop.value !== 0) {
        if (scrollDelta > 0)
          toggleTopBarVisible(false)
        else
          toggleTopBarVisible(true)
      }
    }
    else if (settings.value.autoHideTopBar && isOutsideTopBar.value && scrollTop.value !== 0) {
      if (scrollDelta > 0)
        toggleTopBarVisible(false)
      else
        toggleTopBarVisible(true)
    }

    oldScrollTop.value = scrollTop.value
  }
}

function toggleTopBarVisible(visible: boolean) {
  desiredTopBarVisible.value = visible
  applyTopBarVisibility()
}

function setupScrollListeners() {
  // 根据视频页面配置设置初始显示状态
  if (isVideoOrBangumiPage()) {
    const config = settings.value.videoPageTopBarConfig
    if (config === VideoPageTopBarConfig.AlwaysHide || config === VideoPageTopBarConfig.ShowOnMouse) {
      toggleTopBarVisible(false)
    }
    else {
      toggleTopBarVisible(true)
    }
  }
  else {
    toggleTopBarVisible(true)
  }

  // 清理之前的监听器
  cleanupScrollListeners()

  // 在视频页面根据配置决定是否设置滚动监听
  if (isVideoOrBangumiPage()) {
    const config = settings.value.videoPageTopBarConfig
    // 只有在滚动显示模式下才设置滚动监听
    if (config !== VideoPageTopBarConfig.ShowOnScroll) {
      return
    }
  }

  // 设置滚动监听
  if (isHomePage() && !settings.value.useOriginalBilibiliHomepage) {
    // 创建并保存handler引用
    overlayScrollHandler = (payloadScrollTop: number) => {
      handleScroll(payloadScrollTop)
    }
    emitter.on(OVERLAY_SCROLL_BAR_SCROLL, overlayScrollHandler)
  }
  else {
    window.addEventListener('scroll', handleScroll)
  }
}

function cleanupScrollListeners() {
  window.removeEventListener('scroll', handleScroll)
  // 只移除我们自己的handler，不影响其他组件（如VideoCardGrid）的监听器
  if (overlayScrollHandler) {
    emitter.off(OVERLAY_SCROLL_BAR_SCROLL, overlayScrollHandler)
    overlayScrollHandler = null
  }
}

function updateConflictingHeaderVisibility() {
  const hasVisibleHeader = conflictingHeaderSelectors.some((selector) => {
    const el = document.querySelector(selector) as HTMLElement | null
    if (!el)
      return false

    const style = window.getComputedStyle(el)
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number.parseFloat(style.opacity) !== 0
      && el.offsetWidth > 0
      && el.offsetHeight > 0
  })

  forceHideTopBar.value = hasVisibleHeader
}

let conflictingHeaderObserver: ReturnType<typeof useMutationObserver> | undefined

// 处理点击外部关闭 POP 窗（仅在触屏优化开启时）
function handleClickOutsidePopup(event: MouseEvent) {
  if (!settings.value.touchScreenOptimization)
    return

  if (!hasActivePopup.value)
    return

  const target = event.target as HTMLElement

  // 检查点击是否在顶栏项目按钮上（这些按钮会自己处理切换逻辑）
  const isTopBarItemButton = target.closest('.logo, .right-side-item, .home-button')
  if (isTopBarItemButton)
    return

  // 检查点击是否在弹窗内
  const isInPopup = target.closest('.bew-popover')
  if (isInPopup)
    return

  // 点击在弹窗外部，关闭所有弹窗
  topBarStore.closeAllPopups()
}

// 生命周期钩子
onMounted(() => {
  nextTick(() => {
    // 初始化数据和更新定时器
    topBarStore.initData()
    // 只有在登录状态下才启动更新定时器
    if (topBarStore.isLogin)
      topBarStore.startUpdateTimer()
    setupScrollListeners()

    updateConflictingHeaderVisibility()
    conflictingHeaderObserver = useMutationObserver(
      () => document.body,
      () => {
        updateConflictingHeaderVisibility()
      },
      {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      },
    ) ?? undefined

    // 设置URL变化检查定时器
    urlCheckTimer = window.setInterval(checkUrlChange, 1000)

    // 添加全局点击事件监听器（用于触屏模式下点击外部关闭弹窗）
    document.addEventListener('click', handleClickOutsidePopup)
  })
})

onUnmounted(() => {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }

  if (urlCheckTimer) {
    clearInterval(urlCheckTimer)
    urlCheckTimer = null
  }

  conflictingHeaderObserver?.stop()

  cleanupScrollListeners()
  // 使用 store 中的方法清理定时器
  topBarStore.cleanup()

  // 移除全局点击事件监听器
  document.removeEventListener('click', handleClickOutsidePopup)
})

// 快捷键
onKeyStroke('/', () => {
  toggleTopBarVisible(true)
})

defineExpose({
  toggleTopBarVisible,
  handleScroll,
})

// 导出枚举供模板使用
const VideoPageTopBarConfigEnum = VideoPageTopBarConfig
</script>

<template>
  <div class="top-bar-container">
    <!-- 顶部监听区域 -->
    <div
      v-if="isVideoOrBangumiPage() && settings.videoPageTopBarConfig === VideoPageTopBarConfigEnum.ShowOnMouse"
      ref="topAreaTarget"
      class="top-area-listener"
    />
    <Transition name="top-bar">
      <header
        v-if="topBarStore.showTopBar"
        ref="headerTarget"
        class="top-bar"
        w="full" transition="all 300 ease-in-out"
        :class="{ 'hide': hideTopBar, 'force-white-icon': forceWhiteIcon }"
      >
        <TopBarHeader
          :force-white-icon="forceWhiteIcon"
          :reach-top="reachTop"
          :is-dark="isDark"
        />

        <KeepAlive v-if="settings.openNotificationsPageAsDrawer">
          <NotificationsDrawer
            v-if="topBarStore.drawerVisible.notifications"
            :url="topBarStore.notificationsDrawerUrl"
            @close="topBarStore.drawerVisible.notifications = false"
          />
        </KeepAlive>
      </header>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use "./styles/index.scss";

.top-bar-container {
  position: relative;
  width: 100%;
}

.top-bar {
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
  position: fixed;
}

.top-area-listener {
  cursor: default;
  position: fixed;
  z-index: 1000;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
}
</style>
