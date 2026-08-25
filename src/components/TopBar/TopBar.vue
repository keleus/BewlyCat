<script setup lang="ts">
import { onKeyStroke, useMouseInElement } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { OVERLAY_SCROLL_BAR_SCROLL, TOP_BAR_SCROLL_VISIBILITY_CHANGE, TOP_BAR_VISIBILITY_CHANGE } from '~/constants/globalEvents'
import { VideoPageTopBarConfig } from '~/enums/appEnums'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { isBewlyWidescreenActive } from '~/utils/bewlyWidescreen'
import { findLeafActiveElement } from '~/utils/element'
import { isHomePage, isUserSpacePage, isVideoOrBangumiPage } from '~/utils/main'
import emitter from '~/utils/mitt'

import NotificationsDrawer from './components/NotificationsDrawer.vue'
import TopBarHeader from './components/TopBarHeader.vue'
import TopBarModeSwitcher from './components/TopBarModeSwitcher.vue'
import { useTopBarInteraction } from './composables/useTopBarInteraction'

const { reachTop } = useBewlyApp()
// 顶栏状态管理
const topBarStore = useTopBarStore()
const { forceWhiteIcon } = useTopBarInteraction()

const conflictingHeaderSelectors = ['.fixed-author-header', '.fixed-top-header']
const conflictingHeaderSelector = conflictingHeaderSelectors.join(',')
const spaceNavbarSelector = '.nav-bar.space-navbar'

const { isDark } = useDark()
const { isLayoutEditing } = useLayoutEditMode()

// 顶栏显示控制
const hideTopBar = ref<boolean>(false)
const desiredTopBarVisible = ref(true)
const forceHideTopBar = ref(false)
const bewlyWidescreenActive = ref(false)
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
    setupConflictingHeaderObserver()
  }
}

// 延迟隐藏计时器
let hideTimer: number | null = null
let urlChangeCheckQueued = false
let topBarUnmounted = false

function scheduleUrlChangeCheck() {
  if (urlChangeCheckQueued || topBarUnmounted)
    return

  urlChangeCheckQueued = true
  queueMicrotask(() => {
    urlChangeCheckQueued = false
    checkUrlChange()
  })
}

// 检测是否有弹窗激活
const hasActivePopup = computed(() => {
  return Object.values(topBarStore.popupVisible).some(visible => visible)
})

const ORIGINAL_VIDEO_TOP_BAR_CONTROLLED_CLASS = 'bewly-original-video-top-bar-controlled'
const ORIGINAL_VIDEO_TOP_BAR_HIDDEN_CLASS = 'bewly-original-video-top-bar-hidden'

function applyTopBarVisibility() {
  const shouldShow = !bewlyWidescreenActive.value
    && desiredTopBarVisible.value
    && (
      !forceHideTopBar.value
      || hasActivePopup.value
    )

  hideTopBar.value = !shouldShow
  topBarStore.setTopBarVisible(shouldShow)
  syncOriginalVideoTopBarVisibility(shouldShow)
  emitter.emit(TOP_BAR_VISIBILITY_CHANGE, shouldShow)
}

function syncOriginalVideoTopBarVisibility(visible: boolean) {
  const shouldControl = isVideoOrBangumiPage()
    && settings.value.enableTopBar
    && settings.value.useOriginalBilibiliTopBar
    && settings.value.videoPageTopBarConfig !== VideoPageTopBarConfig.ShowOnMouse

  document.documentElement.classList.toggle(ORIGINAL_VIDEO_TOP_BAR_CONTROLLED_CLASS, shouldControl)
  document.documentElement.classList.toggle(ORIGINAL_VIDEO_TOP_BAR_HIDDEN_CLASS, shouldControl && !visible)
}

// 处理顶栏显示/隐藏逻辑的函数
function handleTopBarVisibility() {
  if (bewlyWidescreenActive.value)
    return

  if (isVideoOrBangumiPage()
    && !settings.value.useOriginalBilibiliTopBar
    && settings.value.videoPageTopBarConfig === VideoPageTopBarConfig.ShowOnMouse) {
    // 清除之前的计时器
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }

    // 如果鼠标在顶栏区域或顶部监听区域，或者有任何弹窗激活，则显示顶栏
    if (!isOutsideTopBar.value || !isOutsideTopArea.value || hasActivePopup.value) {
      toggleTopBarVisible(true)
    }
    else {
      // 延迟隐藏顶栏
      hideTimer = window.setTimeout(() => {
        // 再次检查是否有弹窗激活，防止在延迟期间有弹窗打开
        const hasActivePopupNow = hasActivePopup.value
        // 在鼠标显示模式下，如果所有弹窗都关闭且鼠标不在检测区域，则隐藏顶栏
        if (!hasActivePopupNow) {
          toggleTopBarVisible(false)
        }
      }, 500) // 500ms 延迟
    }
  }
}

// 监听鼠标位置变化和相关状态
watch([isOutsideTopBar, isOutsideTopArea], handleTopBarVisibility)

// 监听弹窗状态变化
watch(hasActivePopup, () => {
  // 当弹窗状态变化时，触发顶栏显示/隐藏逻辑
  handleTopBarVisibility()
  applyTopBarVisibility()
})

watch(forceHideTopBar, () => {
  applyTopBarVisibility()
})

watch(
  [
    () => settings.value.enableTopBar,
    () => settings.value.useOriginalBilibiliTopBar,
    () => settings.value.videoPageTopBarConfig,
  ],
  () => setupScrollListeners(),
)

// 滚动处理
const scrollTop = ref<number>(0)
const oldScrollTop = ref<number>(0)
const topBarVisibilityAnchorScrollTop = ref<number>(0)
const TOP_BAR_HIDE_SCROLL_THRESHOLD = 20
const TOP_BAR_SHOW_SCROLL_THRESHOLD = 20

// 保存overlay scroll的handler引用，用于正确移除监听器
let overlayScrollHandler: ((scrollTop: number) => void) | null = null

function handleScroll(arg?: number | Event): void {
  // ✅ 性能优化：优先使用传入的 scrollTop 值，避免重复 DOM 读取
  if (typeof arg === 'number') {
    scrollTop.value = arg
  }
  else {
    // ✅ 只在非首页或使用原始页面时才需要读取 DOM
    // 首页场景下必须通过 OVERLAY_SCROLL_BAR_SCROLL 事件接收 scrollTop
    if (!isHomePage() || settings.value.useOriginalBilibiliHomepage) {
      scrollTop.value = document.documentElement.scrollTop
    }
    else {
      // 首页且使用 Bewly 页面时，必须通过事件传递 scrollTop
      // 如果执行到这里说明事件没有正确传递参数，警告并返回
      console.warn('[TopBar Performance] Missing scrollTop parameter from OVERLAY_SCROLL_BAR_SCROLL event')
      return
    }
  }

  if (isUserSpacePage())
    scheduleConflictingHeaderVisibilityUpdate()

  // 计算滚动距离，只有超过阈值才处理
  const scrollDelta = scrollTop.value - oldScrollTop.value
  const finishScrollHandling = () => {
    oldScrollTop.value = scrollTop.value
  }

  // 在视频页面处理不同的配置
  if (isVideoOrBangumiPage()) {
    const config = settings.value.videoPageTopBarConfig

    // 总是显示：不处理滚动隐藏
    if (config === VideoPageTopBarConfig.AlwaysShow) {
      // 不做任何处理，保持显示
      finishScrollHandling()
      return
    }

    // 总是隐藏：不处理滚动显示
    if (config === VideoPageTopBarConfig.AlwaysHide) {
      // 不做任何处理，保持隐藏
      finishScrollHandling()
      return
    }

    // 鼠标显示：不处理滚动事件
    if (config === VideoPageTopBarConfig.ShowOnMouse) {
      finishScrollHandling()
      return
    }

    // 滚动显示：处理滚动逻辑
    if (config === VideoPageTopBarConfig.ShowOnScroll) {
      if (scrollTop.value === 0) {
        setTopBarVisibleFromScroll(true, scrollDelta)
      }
      else if (!hideTopBar.value && scrollDelta < 0) {
        topBarVisibilityAnchorScrollTop.value = scrollTop.value
      }
      else if (hideTopBar.value && scrollDelta > 0) {
        topBarVisibilityAnchorScrollTop.value = scrollTop.value
      }
      else if (!hideTopBar.value && scrollDelta > 0 && scrollTop.value - topBarVisibilityAnchorScrollTop.value > TOP_BAR_HIDE_SCROLL_THRESHOLD) {
        // 只有滚动超过阈值才更新状态
        setTopBarVisibleFromScroll(false, scrollDelta)
      }
      else if (hideTopBar.value && scrollDelta < 0 && topBarVisibilityAnchorScrollTop.value - scrollTop.value > TOP_BAR_SHOW_SCROLL_THRESHOLD) {
        setTopBarVisibleFromScroll(true, scrollDelta)
      }
    }
    finishScrollHandling()
  }
  // 处理其他页面的自动隐藏逻辑
  else {
    if (scrollTop.value === 0) {
      setTopBarVisibleFromScroll(true, scrollDelta)
      finishScrollHandling()
      return
    }

    // 在用户首页强制开启滚动隐藏，无论设置如何
    if (isUserSpacePage() || settings.value.autoHideTopBar) {
      if (!hideTopBar.value && scrollDelta < 0) {
        topBarVisibilityAnchorScrollTop.value = scrollTop.value
      }
      else if (hideTopBar.value && scrollDelta > 0) {
        topBarVisibilityAnchorScrollTop.value = scrollTop.value
      }
      else if (!hideTopBar.value && scrollDelta > 0 && scrollTop.value - topBarVisibilityAnchorScrollTop.value > TOP_BAR_HIDE_SCROLL_THRESHOLD) {
        setTopBarVisibleFromScroll(false, scrollDelta)
      }
      else if (hideTopBar.value && scrollDelta < 0 && topBarVisibilityAnchorScrollTop.value - scrollTop.value > TOP_BAR_SHOW_SCROLL_THRESHOLD) {
        setTopBarVisibleFromScroll(true, scrollDelta)
      }
    }
    finishScrollHandling()
  }
}

function toggleTopBarVisible(visible: boolean) {
  desiredTopBarVisible.value = visible
  applyTopBarVisibility()
}

function setTopBarVisibleFromScroll(visible: boolean, scrollDelta: number) {
  topBarVisibilityAnchorScrollTop.value = scrollTop.value
  toggleTopBarVisible(visible)
  emitTopBarScrollVisibilityChange(!hideTopBar.value, scrollDelta)
}

function emitTopBarScrollVisibilityChange(visible: boolean, scrollDelta: number) {
  emitter.emit(TOP_BAR_SCROLL_VISIBILITY_CHANGE, {
    visible,
    scrollTop: scrollTop.value,
    scrollDelta,
  })
}

function setupScrollListeners() {
  // 根据视频页面配置设置初始显示状态
  if (isVideoOrBangumiPage()) {
    const config = settings.value.videoPageTopBarConfig
    if (config === VideoPageTopBarConfig.AlwaysHide
      || (config === VideoPageTopBarConfig.ShowOnMouse && !settings.value.useOriginalBilibiliTopBar)) {
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

function isVisibleElement(el: HTMLElement) {
  const style = window.getComputedStyle(el)
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number.parseFloat(style.opacity) !== 0
    && el.offsetWidth > 0
    && el.offsetHeight > 0
}

function isStickySpaceNavbarVisible() {
  if (!isUserSpacePage())
    return false

  const navbar = document.querySelector<HTMLElement>(spaceNavbarSelector)
  if (!navbar || !isVisibleElement(navbar))
    return false

  const style = window.getComputedStyle(navbar)
  if (style.position !== 'sticky')
    return false

  const rect = navbar.getBoundingClientRect()
  return rect.top <= 1 && rect.bottom > 0
}

function updateConflictingHeaderVisibility() {
  bewlyWidescreenActive.value = isBewlyWidescreenActive()

  const hasVisibleHeader = !isUserSpacePage() && conflictingHeaderSelectors.some((selector) => {
    const el = document.querySelector(selector) as HTMLElement | null
    return el ? isVisibleElement(el) : false
  })

  forceHideTopBar.value = hasVisibleHeader || isStickySpaceNavbarVisible()
  applyTopBarVisibility()
}

function updateWidescreenState() {
  const nextWidescreenActive = isBewlyWidescreenActive()
  if (bewlyWidescreenActive.value === nextWidescreenActive)
    return

  bewlyWidescreenActive.value = nextWidescreenActive
  applyTopBarVisibility()
}

let conflictingHeaderObserver: MutationObserver | undefined
let widescreenStateObserver: MutationObserver | undefined
let conflictingHeaderUpdateFrame: number | undefined
let conflictingHeaderRebindQueued = false
let conflictingHeaderDiscoveryTimer: ReturnType<typeof setTimeout> | undefined
let conflictingHeaderDiscoveryDeadline = 0
const CONFLICTING_HEADER_DISCOVERY_TIMEOUT = 15_000

function isConflictingHeaderPage() {
  return isUserSpacePage()
    || (location.hostname === 't.bilibili.com' && /^\/\d+/.test(location.pathname))
    || (location.hostname === 'www.bilibili.com'
      && (/^\/read\/cv\d+/.test(location.pathname) || /^\/opus\/\d+/.test(location.pathname)))
}

function getConflictingHeaderPageRootSelector() {
  if (isUserSpacePage())
    return '#app'

  if (location.hostname === 't.bilibili.com' || location.pathname.startsWith('/opus/'))
    return '#opus-detail-app, #app'

  return '#app, #App, .article-container, .page-content'
}

function findConflictingHeaderPageRoot() {
  const rootSelector = getConflictingHeaderPageRootSelector()
  const header = document.querySelector<HTMLElement>(getConflictingHeaderSelector())
  return header?.closest<HTMLElement>(rootSelector)
    ?? document.querySelector<HTMLElement>(rootSelector)
}

function getConflictingHeaderSelector() {
  return isUserSpacePage() ? spaceNavbarSelector : conflictingHeaderSelector
}

function scheduleConflictingHeaderVisibilityUpdate() {
  if (conflictingHeaderUpdateFrame !== undefined || topBarUnmounted)
    return

  conflictingHeaderUpdateFrame = requestAnimationFrame(() => {
    conflictingHeaderUpdateFrame = undefined
    updateConflictingHeaderVisibility()
  })
}

function containsConflictingHeader(node: Node) {
  return node instanceof Element
    && (node.matches(getConflictingHeaderSelector()) || !!node.querySelector(getConflictingHeaderSelector()))
}

function scheduleConflictingHeaderObserverRefresh() {
  if (conflictingHeaderRebindQueued || topBarUnmounted)
    return

  conflictingHeaderRebindQueued = true
  queueMicrotask(() => {
    conflictingHeaderRebindQueued = false
    if (!topBarUnmounted)
      setupConflictingHeaderObserver()
  })
}

function stopConflictingHeaderDiscovery() {
  if (conflictingHeaderDiscoveryTimer) {
    clearTimeout(conflictingHeaderDiscoveryTimer)
    conflictingHeaderDiscoveryTimer = undefined
  }
  conflictingHeaderDiscoveryDeadline = 0
}

function scheduleConflictingHeaderDiscovery() {
  if (conflictingHeaderDiscoveryTimer || topBarUnmounted)
    return

  if (!conflictingHeaderDiscoveryDeadline)
    conflictingHeaderDiscoveryDeadline = Date.now() + CONFLICTING_HEADER_DISCOVERY_TIMEOUT
  if (Date.now() >= conflictingHeaderDiscoveryDeadline)
    return

  conflictingHeaderDiscoveryTimer = setTimeout(() => {
    conflictingHeaderDiscoveryTimer = undefined
    if (!isConflictingHeaderPage()) {
      stopConflictingHeaderDiscovery()
      return
    }

    if (document.querySelector(getConflictingHeaderSelector()))
      setupConflictingHeaderObserver()
    else
      scheduleConflictingHeaderDiscovery()
  }, 500)
}

function setupConflictingHeaderObserver() {
  if (topBarUnmounted)
    return

  conflictingHeaderObserver?.disconnect()
  conflictingHeaderObserver = undefined

  if (!isConflictingHeaderPage()) {
    stopConflictingHeaderDiscovery()
    forceHideTopBar.value = false
    bewlyWidescreenActive.value = isBewlyWidescreenActive()
    applyTopBarVisibility()
    return
  }

  const pageRoot = findConflictingHeaderPageRoot()
  conflictingHeaderObserver = new MutationObserver((records) => {
    const hasObservedAttributeChange = records.some(record => record.type === 'attributes')
    const hasRelevantStructureChange = !pageRoot?.isConnected || records.some(record =>
      record.type === 'childList'
      && (Array.from(record.addedNodes).some(containsConflictingHeader)
        || Array.from(record.removedNodes).some(containsConflictingHeader)),
    )

    if (hasRelevantStructureChange || hasObservedAttributeChange) {
      scheduleConflictingHeaderObserverRefresh()
      scheduleConflictingHeaderVisibilityUpdate()
    }
  })

  if (!pageRoot) {
    // 页面应用根尚未挂载时只观察 body 的直接子节点；找到 #app/#App 后
    // setupConflictingHeaderObserver 会立刻收窄观察范围。
    conflictingHeaderObserver.observe(document.body, { childList: true })
    return
  }

  const headers = Array.from(document.querySelectorAll<HTMLElement>(getConflictingHeaderSelector()))
  if (!headers.length) {
    // 目标头部是懒挂载节点；发现阶段限制在当前页面应用根内。
    conflictingHeaderObserver.observe(pageRoot, { childList: true, subtree: true })
    scheduleConflictingHeaderDiscovery()
  }
  else {
    stopConflictingHeaderDiscovery()
    for (const header of headers) {
      let current: HTMLElement | null = header
      while (current) {
        conflictingHeaderObserver.observe(current, {
          childList: true,
          attributes: true,
          attributeFilter: ['class', 'style'],
        })
        if (current === pageRoot)
          break
        current = current.parentElement
      }
    }
  }

  if (pageRoot.parentElement)
    conflictingHeaderObserver.observe(pageRoot.parentElement, { childList: true })
  scheduleConflictingHeaderVisibilityUpdate()
}

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
  nextTick(async () => {
    // 初始化数据和更新定时器
    try {
      await topBarStore.initData()
    }
    catch (error) {
      console.error('初始化顶栏数据失败:', error)
    }
    if (topBarUnmounted)
      return

    // 启动定时器：已登录时同步角标/补填 userInfo；未登录时不启动轮询，
    // 登录态由本地 Cookie 事实与事件驱动维护（见 issue #921）
    topBarStore.startUpdateTimer()
    setupScrollListeners()

    setupConflictingHeaderObserver()
    // Bewly 宽屏只通过 body class 暴露状态；仅观察 body 自身，避免重新
    // 引入对整棵视频页 DOM 的 attributes 监听。
    widescreenStateObserver = new MutationObserver(updateWidescreenState)
    widescreenStateObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })
    window.addEventListener('pushstate', scheduleUrlChangeCheck)
    window.addEventListener('replacestate', scheduleUrlChangeCheck)
    window.addEventListener('popstate', scheduleUrlChangeCheck)
    window.addEventListener('hashchange', scheduleUrlChangeCheck)
    window.addEventListener('pageshow', scheduleUrlChangeCheck)
    scheduleUrlChangeCheck()

    // 添加全局点击事件监听器（用于触屏模式下点击外部关闭弹窗）
    document.addEventListener('click', handleClickOutsidePopup)
    // 页面重新可见时按本地 Cookie 校正登录态：覆盖「他处登录/登出后
    // 本标签处于后台」的场景，无需轮询（见 issue #921）
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })
})

function handleVisibilityChange() {
  if (!document.hidden) {
    topBarStore.reconcileLocalLoginState()
    scheduleUrlChangeCheck()
    scheduleConflictingHeaderVisibilityUpdate()
  }
}

onUnmounted(() => {
  topBarUnmounted = true
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }

  conflictingHeaderObserver?.disconnect()
  widescreenStateObserver?.disconnect()
  stopConflictingHeaderDiscovery()
  if (conflictingHeaderUpdateFrame !== undefined) {
    cancelAnimationFrame(conflictingHeaderUpdateFrame)
    conflictingHeaderUpdateFrame = undefined
  }

  cleanupScrollListeners()
  // 使用 store 中的方法清理定时器
  topBarStore.cleanup()

  // 移除全局点击事件监听器
  document.removeEventListener('click', handleClickOutsidePopup)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('pushstate', scheduleUrlChangeCheck)
  window.removeEventListener('replacestate', scheduleUrlChangeCheck)
  window.removeEventListener('popstate', scheduleUrlChangeCheck)
  window.removeEventListener('hashchange', scheduleUrlChangeCheck)
  window.removeEventListener('pageshow', scheduleUrlChangeCheck)
  document.documentElement.classList.remove(
    ORIGINAL_VIDEO_TOP_BAR_CONTROLLED_CLASS,
    ORIGINAL_VIDEO_TOP_BAR_HIDDEN_CLASS,
  )
})

// 快捷键
onKeyStroke('/', (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  if (target && (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable))
    return

  const activeElement = findLeafActiveElement(document) as HTMLElement | undefined
  if (activeElement && (['INPUT', 'TEXTAREA'].includes(activeElement.tagName) || activeElement.isContentEditable))
    return

  event.preventDefault()
  toggleTopBarVisible(true)
})

onKeyStroke('Escape', (event: KeyboardEvent) => {
  if (!hasActivePopup.value)
    return

  event.preventDefault()
  topBarStore.closeAllPopups()
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
      v-if="!bewlyWidescreenActive
        && !settings.useOriginalBilibiliTopBar
        && isVideoOrBangumiPage()
        && settings.videoPageTopBarConfig === VideoPageTopBarConfigEnum.ShowOnMouse"
      ref="topAreaTarget"
      class="top-area-listener"
    />
    <Transition name="top-bar">
      <header
        v-if="topBarStore.showTopBar || isLayoutEditing"
        ref="headerTarget"
        class="top-bar"
        data-layout-edit-target="topbar-component"
        data-layout-edit-direct
        data-layout-settings-menu="BewlyComponents"
        data-layout-settings-page="topbar"
        data-layout-settings-title-key="settings.topbar_visibility"
        w="full"
        :class="{
          'hide': hideTopBar && !isLayoutEditing,
          'force-white-icon': forceWhiteIcon,
        }"
      >
        <TopBarHeader
          v-if="!isLayoutEditing || !settings.useOriginalBilibiliTopBar"
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

    <TopBarModeSwitcher
      v-if="settings.enableTopBar
        && settings.useOriginalBilibiliTopBar
        && settings.showBewlyOrBiliTopBarSwitcher"
      native
    />
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
  min-height: var(--bew-top-bar-height);
  transition:
    opacity var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-standard);
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
