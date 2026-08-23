import { useEventListener } from '@vueuse/core'
import { computed, reactive, ref, watch } from 'vue'

import {
  ACCOUNT_URL,
  CHANNEL_PAGE_URL,
  SEARCH_PAGE_URL,
  SPACE_URL,
  TOPIC_DETAIL_URL,
  VIDEO_PAGE_URL,
} from '~/components/TopBar/constants/urls'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { useDelayedHover } from '~/composables/useDelayedHover'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { experimentalTopBarStyles } from '~/logic/storage'
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

type TopBarPopupKey = keyof ReturnType<typeof useTopBarStore>['popupVisible']

function isTopBarPopupKey(key: string, popupVisible: ReturnType<typeof useTopBarStore>['popupVisible']): key is TopBarPopupKey {
  return key in popupVisible
}

function getConfiguredPageUrl(page: AppPage): string {
  return `https://www.bilibili.com/?page=${page}`
}

export function useTopBarInteraction() {
  const topBarStore = useTopBarStore()
  const { closeAllPopups } = topBarStore
  const topBarItemElements: Partial<Record<TopBarPopupKey, Ref<HTMLElement | undefined>>> = {}
  const topBarTransformers = reactive<Partial<Record<TopBarPopupKey, Ref<any>>>>({})

  const isMouseOverPopup = reactive<Record<string, boolean>>({})

  // 当前点击的顶栏项
  const currentClickedTopBarItem = ref<string | null>(null)
  const handledClickEvents = new WeakSet<MouseEvent>()

  // 获取 App Provider
  const { activatedPage, reachTop } = useBewlyApp()
  const { isDark } = useDark()

  // 监听 URL 变化，使其响应式
  const currentLocationHref = ref(window.location.href)

  function updateCurrentLocationHref() {
    currentLocationHref.value = window.location.href
  }

  useEventListener(window, 'pushstate', updateCurrentLocationHref)
  useEventListener(window, 'popstate', updateCurrentLocationHref)

  // 原生搜索页与话题详情页的顶部都不用黑色阴影托底；
  // 自动档在这两类页面固定选择白雾分支。
  const preferWhiteFogInAuto = computed(() =>
    SEARCH_PAGE_URL.test(currentLocationHref.value)
    || TOPIC_DETAIL_URL.test(currentLocationHref.value))

  // 页面自己在顶栏底下铺了大图（原生首页、频道页、空间页、账号页）。
  // 这类底图的亮暗不受主题控制，只能恒用深色阴影压住，白图标才读得出来。
  const hasPageBanner = computed((): boolean => {
    if (!settings.value)
      return false

    return (isHomePage() && settings.value.useOriginalBilibiliHomepage)
      || (CHANNEL_PAGE_URL.test(location.href) && !VIDEO_PAGE_URL.test(location.href))
      || SPACE_URL.test(location.href)
      || ACCOUNT_URL.test(location.href)
  })

  // Bewly 自己的壁纸铺在顶栏底下。
  const hasWallpaper = computed((): boolean => {
    if (!settings.value)
      return false

    if (!isHomePage() || !activatedPage?.value)
      return false

    if (activatedPage.value === AppPage.Search) {
      if (settings.value.individuallySetSearchPageWallpaper)
        return !!settings.value.searchPageWallpaper
      return !!settings.value.wallpaper
    }

    if (activatedPage.value === AppPage.SearchResults)
      return !!settings.value.wallpaper

    if (settings.value.wallpaper)
      return true

    return settings.value.useSearchPageModeOnHomePage
      && settings.value.individuallySetSearchPageWallpaper
      && !!settings.value.searchPageWallpaper
  })

  // 实验三档使用余弦渐变管线与其配套色调判定。
  const isExperimentalStyle = computed((): boolean => {
    const style = settings.value?.topBarStyle
    return !!style && experimentalTopBarStyles.includes(style)
  })

  // 实验档色调：页面底图恒压黑；白雾全页同一套外观不切换；
  // 自动与壁纸档按页面横幅切换，壁纸跟随亮/暗模式决定雾色。
  const hasPageBackdrop = computed((): boolean => {
    if (!settings.value || !isExperimentalStyle.value)
      return false

    // 阴影：始终压住页面背景。
    if (settings.value.topBarStyle === 'expTransparent')
      return true

    // 白雾不按页面切阴影。
    if (settings.value.topBarStyle === 'expFrostedGlass')
      return false

    return preferWhiteFogInAuto.value ? false : hasPageBanner.value
  })

  const hasWallpaperBackdrop = computed((): boolean =>
    !!settings.value
    && isExperimentalStyle.value
    && settings.value.topBarStyle === 'expDefault'
    && hasWallpaper.value)

  // 遮罩是深色时图标才需要强制转白。
  const forceWhiteIcon = computed((): boolean => {
    const style = settings.value?.topBarStyle

    // 旧版三档保持 v1.5.x 的判定：阴影恒白图标；白雾全页一套外观；
    // 自动按横幅或壁纸存在与否压黑，不区分亮暗。
    if (style === 'transparent')
      return true
    if (style === 'frostedGlass')
      return false
    if (style === 'default')
      return !preferWhiteFogInAuto.value && (hasPageBanner.value || hasWallpaper.value)

    // 实验三档：底图恒用阴影，壁纸只在暗色模式下才是黑雾。
    return hasPageBackdrop.value || (hasWallpaperBackdrop.value && isDark.value)
  })

  const showSearchBar = computed((): boolean => {
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
    return true
  })

  // 设置顶栏项悬停事件
  function setupTopBarItemHoverEvent(key: TopBarPopupKey) {
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
  function setupTopBarItemTransformer(key: TopBarPopupKey, targetRef?: Ref<any>) {
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

    if (!isTopBarPopupKey(key, topBarStore.popupVisible))
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
    hasPageBackdrop,
    showSearchBar,
  }
}
