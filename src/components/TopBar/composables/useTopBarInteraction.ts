import { useEventListener } from '@vueuse/core'
import { computed, reactive, ref, watch } from 'vue'

import {
  ACCOUNT_URL,
  CHANNEL_PAGE_URL,
  SEARCH_PAGE_URL,
  SPACE_URL,
  VIDEO_PAGE_URL,
} from '~/components/TopBar/constants/urls'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useDelayedHover } from '~/composables/useDelayedHover'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { isHomePage } from '~/utils/main'
import { shouldUsePluginSearchResultsPage } from '~/utils/searchNavigation'
import { openLinkInBackground } from '~/utils/tabs'
import { createTransformer } from '~/utils/transformer'

const bewlyPageByTopBarItem: Partial<Record<string, AppPage>> = {
  channels: AppPage.Home,
  moments: AppPage.Moments,
  favorites: AppPage.Favorites,
  history: AppPage.History,
  watchLater: AppPage.WatchLater,
}

function getConfiguredPageUrl(page: AppPage): string {
  return `https://www.bilibili.com/?page=${page}`
}

export function useTopBarInteraction() {
  const topBarStore = useTopBarStore()
  const { closeAllPopups } = topBarStore
  const topBarItemElements: Record<string, Ref<HTMLElement | undefined>> = {}
  const topBarTransformers = reactive({})

  const isMouseOverPopup = reactive<Record<string, boolean>>({})

  // 当前点击的顶栏项
  const currentClickedTopBarItem = ref<string | null>(null)
  const handledClickEvents = new WeakSet<MouseEvent>()

  // 获取 App Provider
  const { activatedPage, reachTop } = useBewlyApp()

  // 监听 URL 变化，使其响应式
  const currentLocationHref = ref(window.location.href)

  function updateCurrentLocationHref() {
    currentLocationHref.value = window.location.href
  }

  useEventListener(window, 'pushstate', updateCurrentLocationHref)
  useEventListener(window, 'popstate', updateCurrentLocationHref)

  // TopBar 相关计算属性
  const forceWhiteIcon = computed((): boolean => {
    if (!settings.value)
      return false

    if (settings.value.topBarStyle === 'transparent')
      return true

    // 固定使用无背景图首页的标准毛玻璃样式，不再根据页面壁纸切换图标颜色。
    if (settings.value.topBarStyle === 'frostedGlass')
      return false

    if (
      (isHomePage() && settings.value.useOriginalBilibiliHomepage)
      || (CHANNEL_PAGE_URL.test(location.href) && !VIDEO_PAGE_URL.test(location.href))
      || SPACE_URL.test(location.href)
      || ACCOUNT_URL.test(location.href)
    ) {
      return true
    }

    if (!isHomePage())
      return false

    // 确保 activatedPage.value 存在
    if (!activatedPage?.value)
      return false

    if (activatedPage.value === AppPage.Search) {
      if (settings.value.individuallySetSearchPageWallpaper) {
        if (settings.value.searchPageWallpaper)
          return true
        return false
      }
      return !!settings.value.wallpaper
    }
    else if (activatedPage.value === AppPage.SearchResults) {
      // 搜索结果页使用全局壁纸设置
      return !!settings.value.wallpaper
    }
    else {
      if (settings.value.wallpaper)
        return true

      if (settings.value.useSearchPageModeOnHomePage) {
        if (settings.value.individuallySetSearchPageWallpaper && !!settings.value.searchPageWallpaper)
          return true
        else if (settings.value.wallpaper)
          return true
      }
    }
    return false
  })

  const showSearchBar = computed((): boolean => {
    const currentUrl = currentLocationHref.value
    const isSearchPage = SEARCH_PAGE_URL.test(currentUrl)

    if (isHomePage()) {
      if (settings.value.useOriginalBilibiliHomepage)
        return true
      if (!activatedPage?.value)
        return true
      // Search 页面的显示逻辑：不显示顶栏搜索框（因为页面中已有搜索框）
      if (activatedPage.value === AppPage.Search) {
        return false
      }
      // SearchResults 页面的显示逻辑：
      if (activatedPage.value === AppPage.SearchResults) {
        // 启用了插件搜索结果页才显示搜索框
        if (!shouldUsePluginSearchResultsPage())
          return false
        // 其他情况显示搜索框
      }
      if (settings.value.useSearchPageModeOnHomePage && activatedPage.value === AppPage.Home && reachTop?.value)
        return false
    }
    else if (isSearchPage) {
      // 原生搜索页面本身已有搜索框，隐藏顶栏搜索框避免重复
      return false
    }

    return true
  })

  // 设置顶栏项悬停事件
  function setupTopBarItemHoverEvent(key: string) {
    const element = useDelayedHover({
      enterDelay: 320,
      leaveDelay: 320,
      beforeEnter: () => closeAllPopups(key),
      enter: () => {
        topBarStore.popupVisible[key] = true
      },
      leave: () => {
        // 只有当鼠标不在弹窗上时才隐藏
        setTimeout(() => {
          if (!isMouseOverPopup[key]) {
            topBarStore.popupVisible[key] = false
          }
        }, 200)
      },
    })

    topBarItemElements[key] = element
    return element
  }

  // 设置顶栏项变换器
  function setupTopBarItemTransformer(key: string, targetRef?: any) {
    const trigger = topBarItemElements[key]
    if (!trigger)
      return

    const transformer = createTransformer(trigger, {
      x: '0px',
      y: '50px',
      centerTarget: {
        x: true,
      },
    })

    // 如果提供了targetRef，将其存储但不修改transformer的内部逻辑
    if (targetRef) {
      topBarTransformers[key] = targetRef
      watch(
        [targetRef, () => topBarStore.popupVisible[key]],
        ([el, visible]) => {
          if (!visible || !el)
            return
          transformer.value = el
          transformer.applyPosition()
        },
        { immediate: true, flush: 'post' },
      )
      return targetRef
    }

    topBarTransformers[key] = transformer
    return transformer
  }

  // 处理顶栏项点击
  function openConfiguredPageFromTopBar(page: AppPage) {
    const pageUrl = getConfiguredPageUrl(page)
    const openMode = settings.value.topBarLinkOpenMode

    if (openMode === 'background') {
      void openLinkInBackground(pageUrl)
      return
    }

    if (openMode === 'newTab' || (openMode === 'currentTabIfNotHomepage' && isHomePage())) {
      window.open(pageUrl, '_blank')
      return
    }

    if (isHomePage()) {
      // activatedPage 会读取同一项 Dock 配置，决定显示 Bewly 页面还是原版 Bilibili 页面。
      activatedPage.value = page
      return
    }

    location.href = pageUrl
  }

  function getTopBarItemHref(key: string, originalHref: string): string {
    if (settings.value.touchScreenOptimization || !settings.value.openTopBarItemsInBewly)
      return originalHref

    const page = bewlyPageByTopBarItem[key]
    return page ? getConfiguredPageUrl(page) : originalHref
  }

  function handleClickTopBarItem(event: MouseEvent, key: string) {
    if (handledClickEvents.has(event))
      return

    if (settings.value.touchScreenOptimization) {
      handledClickEvents.add(event)
      event.preventDefault()
      event.stopPropagation()
      closeAllPopups(key)
      topBarStore.popupVisible[key] = !topBarStore.popupVisible[key]
      currentClickedTopBarItem.value = key
      return
    }

    if (!settings.value.openTopBarItemsInBewly || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return

    const page = bewlyPageByTopBarItem[key]
    if (!page)
      return

    handledClickEvents.add(event)
    event.preventDefault()
    event.stopPropagation()
    closeAllPopups()
    openConfiguredPageFromTopBar(page)
  }

  function handleClickTopBarLogo(event: MouseEvent) {
    if (!settings.value.touchScreenOptimization)
      return

    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return

    handleClickTopBarItem(event, 'channels')
  }

  // 处理通知项点击
  function handleNotificationsItemClick(item: { name: string, url: string, unreadCount: number, icon: string }) {
    if (settings.value.openNotificationsPageAsDrawer) {
      topBarStore.drawerVisible.notifications = true
      topBarStore.notificationsDrawerUrl = item.url
    }
  }

  return {
    currentClickedTopBarItem,
    setupTopBarItemHoverEvent,
    setupTopBarItemTransformer,
    handleClickTopBarItem,
    handleClickTopBarLogo,
    handleNotificationsItemClick,
    getTopBarItemHref,
    forceWhiteIcon,
    showSearchBar,
  }
}
