<script setup lang="ts">
import { onKeyStroke, useEventListener, useThrottleFn, useToggle } from '@vueuse/core'
import type { Ref } from 'vue'

import type { BewlyAppProvider } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { BEWLY_MOUNTED, DRAWER_VIDEO_ENTER_PAGE_FULL, DRAWER_VIDEO_EXIT_PAGE_FULL, IFRAME_PAGE_SWITCH_BEWLY, IFRAME_PAGE_SWITCH_BILI, OVERLAY_SCROLL_BAR_SCROLL } from '~/constants/globalEvents'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { isHomePage, isInIframe, isNotificationPage, isVideoOrBangumiPage, openLinkToNewTab, queryDomUntilFound, scrollToTop } from '~/utils/main'
import emitter from '~/utils/mitt'

import { setupNecessarySettingsWatchers } from './necessarySettingsWatchers'

const mainStore = useMainStore()
const settingsStore = useSettingsStore()
const { isDark } = useDark()
const [showSettings, toggleSettings] = useToggle(false)

// Get the 'page' query parameter from the URL
function getPageParam(): AppPage | null {
  const urlParams = new URLSearchParams(window.location.search)
  const result = urlParams.get('page') as AppPage | null
  if (result && Object.values(AppPage).includes(result))
    return result
  return null
}

const activatedPage = ref<AppPage>(getPageParam() || (settings.value.dockItemsConfig.find(e => e.visible === true)?.page || AppPage.Home))
// 添加Home页面的子页面状态
const homeActivatedPage = ref<HomeSubPage>(HomeSubPage.ForYou)
const pages = {
  [AppPage.Home]: defineAsyncComponent(() => import('./Home/Home.vue')),
  [AppPage.Search]: defineAsyncComponent(() => import('./Search/Search.vue')),
  [AppPage.Anime]: defineAsyncComponent(() => import('./Anime/Anime.vue')),
  [AppPage.History]: defineAsyncComponent(() => import('./History/History.vue')),
  [AppPage.WatchLater]: defineAsyncComponent(() => import('./WatchLater/WatchLater.vue')),
  [AppPage.Favorites]: defineAsyncComponent(() => import('./Favorites/Favorites.vue')),
  [AppPage.Moments]: defineAsyncComponent(() => import('./Moments/Moments.vue')),
}
const mainAppRef = ref<HTMLElement>() as Ref<HTMLElement>
const scrollbarRef = ref()
const handlePageRefresh = ref<() => void>()
const handleReachBottom = ref<() => void>()
const handleUndoRefresh = ref<() => void>()
const handleForwardRefresh = ref<() => void>()
const showUndoButton = ref<boolean>(false)
const handleThrottledPageRefresh = useThrottleFn(() => {
  const osInstance = scrollbarRef.value?.osInstance()
  if (!osInstance) {
    handlePageRefresh.value?.()
    return
  }
  const { viewport } = osInstance.elements()
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
const handleThrottledReachBottom = useThrottleFn(() => handleReachBottom.value?.(), 500)
const handleThrottledBackToTop = useThrottleFn(() => handleBackToTop(), 500)
const handleThrottledPageUnRefresh = useThrottleFn(() => handleUndoRefresh.value?.(), 500)
const handleThrottledPageForwardRefresh = useThrottleFn(() => handleForwardRefresh.value?.(), 500)
const topBarRef = ref()
const reachTop = ref<boolean>(true)

const iframeDrawerURL = ref<string>('')
const showIframeDrawer = ref<boolean>(false)

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

// 监听来自父页面的黑暗模式切换消息（用于iframe跨域场景）
useEventListener(window, 'message', ({ data, source }) => {
  // 只处理来自父窗口的消息
  if (source !== window.parent)
    return

  const { type, isDark, darkModeBaseColor } = data

  if (type === 'iframeDarkModeChange') {
    // 在iframe环境中，只更新DOM样式，不修改用户的主题设置
    // 避免覆盖用户设置的"auto"模式
    if (isInIframe()) {
      // 立即更新DOM样式，不修改settings.value.theme
      if (isDark) {
        document.documentElement.classList.add('dark')
        document.body?.classList.add('dark')
        document.querySelector('#bewly')?.classList.add('dark')

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
        document.documentElement.classList.remove('dark')
        document.body?.classList.remove('dark')
        document.querySelector('#bewly')?.classList?.remove('dark')
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

  const dockItem = mainStore.getDockItemByPage(activatedPage.value)
  if (!dockItem?.hasBewlyPage)
    return false

  if (iframePageURL.value)
    return false

  return isHomePage() && !settings.value.useOriginalBilibiliHomepage
})
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

const isFirstTimeActivatedPageChange = ref<boolean>(true)
watch(
  () => activatedPage.value,
  () => {
    mainStore.setActivatedCover('')

    if (!isFirstTimeActivatedPageChange.value) {
      // Update the URL query parameter when activatedPage changes
      const url = new URL(window.location.href)
      url.searchParams.set('page', activatedPage.value)
      window.history.replaceState({}, '', url.toString())
    }

    if (scrollbarRef.value) {
      const osInstance = scrollbarRef.value.osInstance()
      osInstance.elements().viewport.scrollTop = 0
    }
    isFirstTimeActivatedPageChange.value = false
  },
  { immediate: true },
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

onMounted(() => {
  window.dispatchEvent(new CustomEvent(BEWLY_MOUNTED))

  if (isHomePage()) {
    // Force overwrite Bilibili Evolved body tag & html tag background color
    document.body.style.setProperty('background-color', 'unset', 'important')

    // 聚焦到滚动容器的函数
    const focusScrollContainer = () => {
      nextTick(() => {
        if (scrollbarRef.value) {
          const osInstance = scrollbarRef.value.osInstance()
          const viewport = osInstance?.elements().viewport
          if (viewport) {
            viewport.setAttribute('tabindex', '0')
            viewport.focus({ preventScroll: true })
          }
        }
      })
    }

    // Windows/Linux: 监听 Home 键
    onKeyStroke('Home', (e) => {
      handleThrottledBackToTop()
      focusScrollContainer()
      e.preventDefault()
    })

    // macOS: 使用原生事件监听 Command+↑ 组合键
    document.addEventListener('keydown', (e) => {
      // 确保只有同时按下 Command 和 ArrowUp 键时才触发
      if (e.key === 'ArrowUp' && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        handleThrottledBackToTop()
        focusScrollContainer()
        e.preventDefault()
      }
    })
  }

  document.addEventListener('scroll', () => {
    if (window.scrollY > 0)
      reachTop.value = false
    else
      reachTop.value = true
  })
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
        setTimeout(() => {
          changeActivatePage(dockItem.page)
        }, 200)
      }
      else {
        location.href = `https://www.bilibili.com/?page=${dockItem.page}`
      }
    }

    // When not opened in a new tab, change the `activatedPage`
    activatedPage.value = dockItem.page
  }
}

function changeActivatePage(pageName: AppPage) {
  const osInstance = scrollbarRef.value?.osInstance()
  const scrollTop: number = osInstance.elements().viewport.scrollTop

  if (activatedPage.value === pageName) {
    if (activatedPage.value !== AppPage.Search) {
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
  const osInstance = scrollbarRef.value?.osInstance()
  if (osInstance) {
    scrollToTop(osInstance.elements().viewport, targetScrollTop)
    topBarRef.value?.toggleTopBarVisible(true)
  }

  iframePageRef.value?.handleBackToTop()
}

function handleOsScroll() {
  emitter.emit(OVERLAY_SCROLL_BAR_SCROLL)

  const osInstance = scrollbarRef.value?.osInstance()
  const { viewport } = osInstance.elements()
  const { scrollTop, scrollHeight, clientHeight } = viewport // get scroll offset

  if (scrollTop === 0) {
    reachTop.value = true
  }
  else {
    reachTop.value = false
  }

  if (clientHeight + scrollTop >= scrollHeight - 300)
    handleThrottledReachBottom()

  if (isHomePage())
    topBarRef.value?.handleScroll()
}

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

  iframeDrawerURL.value = url
  showIframeDrawer.value = true
}

/**
 * Checks if the current viewport has a scrollbar.
 * @returns {boolean} Returns true if the viewport has a scrollbar, false otherwise.
 */
async function haveScrollbar() {
  await nextTick()
  const osInstance = scrollbarRef.value?.osInstance()
  // If the scrollbarRef is not ready, return false
  if (osInstance) {
    const { viewport } = osInstance.elements()
    const { scrollHeight } = viewport // get scroll offset
    return scrollHeight > window.innerHeight
  }
  else {
    return false
  }
}

// In drawer video, watch btn className changed and post message to parent
watchEffect(async (onCleanUp) => {
  if (!isInIframe())
    return null

  const observer = new MutationObserver(([{ target: el }]) => {
    if (!(el instanceof HTMLElement))
      return null
    if (el.classList.contains('bpx-state-entered')) {
      parent.postMessage(DRAWER_VIDEO_ENTER_PAGE_FULL)
    }
    else {
      parent.postMessage(DRAWER_VIDEO_EXIT_PAGE_FULL)
    }
  })

  const abort = new AbortController()
  queryDomUntilFound('.bpx-player-ctrl-btn.bpx-player-ctrl-web', 500, abort).then((openVideo2WebFullBtn) => {
    if (!openVideo2WebFullBtn)
      return
    observer.observe(openVideo2WebFullBtn, { attributes: true })
  })

  onCleanUp(() => {
    observer.disconnect()
    abort.abort()
  })
})

provide<BewlyAppProvider>('BEWLY_APP', {
  activatedPage,
  homeActivatedPage,
  mainAppRef,
  scrollbarRef,
  reachTop,
  handleBackToTop,
  handlePageRefresh,
  handleReachBottom,
  handleUndoRefresh,
  handleForwardRefresh,
  showUndoButton,
  openIframeDrawer,
  haveScrollbar,
})

if (settings.value.cleanUrlArgument) {
  const PARAMS_TO_REMOVE = [
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
  ]

  let isCleaningUrl = false // 防止重复执行
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null

  function cleanUrlParams() {
    // 防止在页面加载过程中执行URL清理
    if (isCleaningUrl || document.readyState === 'loading') {
      return
    }

    try {
      isCleaningUrl = true
      const currentUrl = new URL(window.location.href)
      let hasChanged = false

      PARAMS_TO_REMOVE.forEach((param) => {
        if (currentUrl.searchParams.has(param)) {
          currentUrl.searchParams.delete(param)
          hasChanged = true
        }
      })

      if (hasChanged) {
        const newUrl = currentUrl.toString()
          .replace(/([^:])\/\/(?!\/)/g, '$1/') // 只替换中间的双斜杠，不处理末尾的斜杠
          .replace(/%3D/gi, '=')
          .replace(/%26/g, '&')

        // 使用 requestIdleCallback 来避免阻塞页面加载
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => {
            history.replaceState(null, '', newUrl)
            isCleaningUrl = false
          })
        }
        else {
          setTimeout(() => {
            history.replaceState(null, '', newUrl)
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

  // 监听URL变化，但增加防抖和延迟
  if (typeof window !== 'undefined') {
    let lastUrl = window.location.href
    let urlCheckTimer: ReturnType<typeof setTimeout> | null = null

    const checkUrlChange = () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href
        scheduleCleanup(2000) // 页面跳转后延迟更长时间
      }
      urlCheckTimer = setTimeout(checkUrlChange, 1000) // 降低检查频率
    }

    // 页面可见性变化时停止/恢复检查
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (urlCheckTimer) {
          clearTimeout(urlCheckTimer)
          urlCheckTimer = null
        }
      }
      else {
        if (!urlCheckTimer) {
          checkUrlChange()
        }
      }
    })

    checkUrlChange()
  }
}
</script>

<template>
  <div
    id="bewly-wrapper"
    ref="mainAppRef"
    class="bewly-wrapper"
    :class="{ dark: isDark }"
    text="$bew-text-1 size-$bew-base-font-size"
  >
    <!-- Background -->
    <template v-if="showBewlyPage">
      <AppBackground :activated-page="activatedPage" />
    </template>

    <!-- Settings -->
    <KeepAlive>
      <Settings v-if="showSettings" z-10002 @close="showSettings = false" />
    </KeepAlive>

    <!-- Dock & RightSideButtons -->
    <div
      v-if="!isInIframe()"
      pos="absolute top-0 left-0" w-full h-full overflow-hidden
      pointer-events-none
    >
      <Dock
        v-if="!settings.useOriginalBilibiliHomepage && (settings.alwaysUseDock || (showBewlyPage || iframePageURL))"
        pointer-events-auto
        :activated-page="activatedPage"
        @settings-visibility-change="toggleSettings"
        @refresh="handleThrottledPageRefresh"
        @undo-refresh="handleThrottledPageUnRefresh"
        @forward-refresh="handleThrottledPageForwardRefresh"
        @back-to-top="handleThrottledBackToTop"
        @dock-item-click="handleDockItemClick"
      />
      <SideBar
        v-else
        pointer-events-auto
        @settings-visibility-change="toggleSettings"
      />
    </div>

    <!-- TopBar -->
    <div
      v-if="showTopBar"
      m-auto max-w="$bew-page-max-width"
    >
      <BewlyOrBiliTopBarSwitcher v-if="settings.showBewlyOrBiliTopBarSwitcher" />

      <TopBar
        pos="top-0 left-0" z="99 hover:1001" w-full
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
          <OverlayScrollbarsComponent
            ref="scrollbarRef" element="div" h-inherit defer
            @os-scroll="handleOsScroll"
          >
            <main m-auto max-w="$bew-page-max-width">
              <div
                p="t-[calc(var(--bew-top-bar-height)+10px)]" m-auto
                w="lg:[calc(100%-200px)] [calc(100%-150px)]"
              >
                <Transition name="page-fade">
                  <Component :is="pages[activatedPage]" />
                </Transition>
              </div>
            </main>
          </OverlayScrollbarsComponent>
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
  </div>
</template>

<style lang="scss" scoped>
.bewly-wrapper {
  // To fix the filter used in `.bewly-wrapper` that cause the positions of elements become discorded.
  > * > * {
    filter: var(--bew-filter-force-dark);
  }
}
</style>
