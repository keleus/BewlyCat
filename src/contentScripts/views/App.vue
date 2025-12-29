<script setup lang="ts">
import { onKeyStroke, useEventListener, useIntersectionObserver, useThrottleFn, useToggle } from '@vueuse/core'
import type { Ref } from 'vue'
import { provide, ref } from 'vue'

import type { BewlyAppProvider } from '~/composables/useAppProvider'
import { DrawerType, UndoForwardState } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { BEWLY_MOUNTED, DRAWER_VIDEO_ENTER_PAGE_FULL, DRAWER_VIDEO_EXIT_PAGE_FULL, IFRAME_PAGE_SWITCH_BEWLY, IFRAME_PAGE_SWITCH_BILI, OVERLAY_SCROLL_BAR_SCROLL, OVERLAY_SCROLL_STATE_CHANGE } from '~/constants/globalEvents'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { useTopBarStore } from '~/stores/topBarStore'
import { isHomePage, isInIframe, isNotificationPage, isSearchResultsPage, isVideoOrBangumiPage, openLinkToNewTab, queryDomUntilFound, scrollToTop } from '~/utils/main'
import emitter from '~/utils/mitt'

import { setupNecessarySettingsWatchers } from './necessarySettingsWatchers'

// Check if current page is festival page
function isFestivalPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(document.URL)
}

const mainStore = useMainStore()
const settingsStore = useSettingsStore()
const topBarStore = useTopBarStore()

// Conditionally use dark mode (skip on festival pages)
let isDark: Ref<boolean>
// Always use dark mode if enabled, but let useDark() handle selective application
const shouldUseDark = settings.value.adaptToOtherPageStyles

if (shouldUseDark) {
  const darkResult = useDark()
  isDark = darkResult.isDark
}
else {
  isDark = ref(false)
}
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

// 添加Home页面的子页面状态
const homeActivatedPage = ref<HomeSubPage>(HomeSubPage.ForYou)
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
const scrollViewportRef = ref<HTMLElement | null>(null)
const loadMoreSentinelRef = ref<HTMLElement>() // ✅ IntersectionObserver 哨兵元素
const handlePageRefresh = ref<() => void>()
const handleReachBottom = ref<() => void>()
const handleUndoRefresh = ref<() => void>()
const handleForwardRefresh = ref<() => void>()
// 使用新的枚举状态管理撤销/前进按钮
const undoForwardState = ref<UndoForwardState>(UndoForwardState.Hidden)
const handleThrottledPageRefresh = useThrottleFn(() => {
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
    // 避免覆盖用户设置的"auto"模式
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
    if (!isFirstTimeActivatedPageChange.value) {
      // Update the URL query parameter when activatedPage changes
      const url = new URL(window.location.href)
      url.searchParams.set('page', activatedPage.value)
      window.history.replaceState({}, '', url.toString())
    }

    scrollViewportRef.value?.scrollTo({ top: 0 })
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
let scrollingEmitted = false

onMounted(() => {
  window.dispatchEvent(new CustomEvent(BEWLY_MOUNTED))

  // ✅ 设置 IntersectionObserver 用于无限滚动底部检测（仅在首页且使用Bewly页面时）
  // 避免在每次滚动时读取 scrollHeight/clientHeight
  if (isHomePage() && !settings.value.useOriginalBilibiliHomepage) {
    nextTick(() => {
      const viewport = scrollViewportRef.value
      if (!viewport)
        return

      useIntersectionObserver(
        loadMoreSentinelRef,
        ([{ isIntersecting }]) => {
          if (isIntersecting) {
            handleThrottledReachBottom()
          }
        },
        {
          root: viewport,
          rootMargin: '200px', // 提前 200px 触发加载
          threshold: 0,
        },
      )
    })
  }

  if (isHomePage()) {
    // Force overwrite Bilibili Evolved body tag & html tag background color
    document.body.style.setProperty('background-color', 'unset', 'important')

    // 聚焦到滚动容器的函数
    const focusScrollContainer = () => {
      nextTick(() => {
        const viewport = scrollViewportRef.value
        if (!viewport)
          return

        viewport.setAttribute('tabindex', '0')
        viewport.focus({ preventScroll: true })
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
 * @returns {Promise<boolean>} Returns true if the viewport has a scrollbar, false otherwise.
 */
async function haveScrollbar() {
  await nextTick()
  const viewport = scrollViewportRef.value
  if (!viewport)
    return false

  return viewport.scrollHeight > viewport.clientHeight
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
  scrollViewportRef,
  reachTop,
  handleBackToTop,
  handlePageRefresh,
  handleReachBottom,
  handleUndoRefresh,
  handleForwardRefresh,
  undoForwardState,
  openIframeDrawer,
  haveScrollbar,
  activeDrawer,
  setActiveDrawer,
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
    'trackid',
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
      :style="{
        opacity: hideUIForIframePhotoViewer ? 0 : 1,
        transition: 'opacity 0.2s ease',
      }"
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
      :style="{
        opacity: hideUIForIframePhotoViewer ? 0 : 1,
        pointerEvents: hideUIForIframePhotoViewer ? 'none' : 'auto',
        transition: 'opacity 0.2s ease',
      }"
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
          <div
            ref="scrollViewportRef"
            h-inherit of-y-auto of-x-hidden
            style="overscroll-behavior: contain;"
            @scroll.passive="handleNativeScroll"
          >
            <main m-auto max-w="$bew-page-max-width">
              <div
                p="t-[calc(var(--bew-top-bar-height)+10px)]" m-auto
                w="lg:[calc(100%-200px)] [calc(100%-150px)]"
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
