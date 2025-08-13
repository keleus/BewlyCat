<script setup lang="ts">
import { onKeyStroke, useMouseInElement } from '@vueuse/core'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

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

const { scrollbarRef, reachTop } = useBewlyApp()
// 顶栏状态管理
const topBarStore = useTopBarStore()

const { isDark } = useDark()

// 顶栏显示控制
const hideTopBar = ref<boolean>(false)
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
  }
}

// 延迟隐藏计时器
let hideTimer: number | null = null
let urlCheckTimer: number | null = null

// 监听鼠标位置变化
watch([isOutsideTopBar, isOutsideTopArea], ([newTopBarValue, newTopAreaValue]) => {
  if (isVideoOrBangumiPage() && settings.value.videoPageTopBarConfig === VideoPageTopBarConfig.ShowOnMouse) {
    // 清除之前的计时器
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }

    // 如果鼠标在顶栏区域或顶部监听区域，则显示顶栏
    if (!newTopBarValue || !newTopAreaValue) {
      toggleTopBarVisible(true)
    }
    else {
      // 延迟隐藏顶栏
      hideTimer = window.setTimeout(() => {
        toggleTopBarVisible(false)
      }, 500) // 500ms 延迟
    }
  }
})

// 滚动处理
const scrollTop = ref<number>(0)
const oldScrollTop = ref<number>(0)

function handleScroll() {
  if (isHomePage() && !settings.value.useOriginalBilibiliHomepage) {
    const osInstance = scrollbarRef.value?.osInstance()
    scrollTop.value = osInstance.elements().viewport.scrollTop as number
  }
  else {
    scrollTop.value = document.documentElement.scrollTop
  }

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
      }
      else if (scrollTop.value > oldScrollTop.value) {
        toggleTopBarVisible(false)
      }
      else {
        toggleTopBarVisible(true)
      }
    }
  }
  // 处理其他页面的自动隐藏逻辑
  else {
    if (scrollTop.value === 0)
      toggleTopBarVisible(true)

    // 在用户首页强制开启滚动隐藏，无论设置如何
    if (isUserSpacePage()) {
      if (isOutsideTopBar.value && scrollTop.value !== 0) {
        if (scrollTop.value > oldScrollTop.value)
          toggleTopBarVisible(false)
        else
          toggleTopBarVisible(true)
      }
    }
    else if (settings.value.autoHideTopBar && isOutsideTopBar.value && scrollTop.value !== 0) {
      if (scrollTop.value > oldScrollTop.value)
        toggleTopBarVisible(false)
      else
        toggleTopBarVisible(true)
    }
  }

  oldScrollTop.value = scrollTop.value
}

function toggleTopBarVisible(visible: boolean) {
  hideTopBar.value = !visible
  emitter.emit(TOP_BAR_VISIBILITY_CHANGE, !hideTopBar.value)
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

  emitter.off(OVERLAY_SCROLL_BAR_SCROLL)

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
    emitter.on(OVERLAY_SCROLL_BAR_SCROLL, () => {
      handleScroll()
    })
  }
  else {
    window.addEventListener('scroll', handleScroll)
  }
}

function cleanupScrollListeners() {
  window.removeEventListener('scroll', handleScroll)
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL)
}

// 生命周期钩子
onMounted(() => {
  nextTick(() => {
    // 先初始化数据
    topBarStore.initData()
    topBarStore.startUpdateTimer()
    setupScrollListeners()

    // 设置URL变化检查定时器
    urlCheckTimer = window.setInterval(checkUrlChange, 1000)
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

  cleanupScrollListeners()
  // 使用 store 中的方法清理定时器
  topBarStore.cleanup()
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
        :class="{ 'hide': hideTopBar, 'force-white-icon': topBarStore.forceWhiteIcon }"
      >
        <TopBarHeader
          :force-white-icon="topBarStore.forceWhiteIcon"
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
