import { defineStore } from 'pinia'

import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { getUserID } from '~/utils/main'
import { getDefaultCustomUseOriginalBiliPage } from '~/utils/pageMode'

export interface DockItem {
  i18nKey: string
  icon: string
  iconActivated: string
  page: AppPage
  openInNewTab: boolean
  useOriginalBiliPage: boolean
  url: string
  hasBewlyPage: boolean // Whether BewlyBewly has a page for this item
}

export interface HomeTab {
  i18nKey: string
  page: HomeSubPage
}

export const useMainStore = defineStore('main', () => {
  const dockItems = computed((): DockItem[] => {
    return [
      {
        i18nKey: 'dock.home',
        icon: 'i-mingcute:home-5-line',
        iconActivated: 'i-mingcute:home-5-fill',
        page: AppPage.Home,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.Home),
        url: 'https://www.bilibili.com',
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.search',
        icon: 'i-mingcute:search-2-line',
        iconActivated: 'i-mingcute:search-2-fill',
        page: AppPage.Search,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.Search),
        url: 'https://search.bilibili.com/all',
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.anime',
        icon: 'i-mingcute:tv-2-line',
        iconActivated: 'i-mingcute:tv-2-fill',
        page: AppPage.Anime,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.Anime),
        url: 'https://www.bilibili.com/anime',
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.favorites',
        icon: 'i-mingcute:star-line',
        iconActivated: 'i-mingcute:star-fill',
        page: AppPage.Favorites,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.Favorites),
        url: `https://space.bilibili.com/${getUserID()}/favlist`,
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.history',
        icon: 'i-mingcute:time-line',
        iconActivated: 'i-mingcute:time-fill',
        page: AppPage.History,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.History),
        url: `https://www.bilibili.com/history`,
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.watch_later',
        icon: 'i-mingcute:carplay-line',
        iconActivated: 'i-mingcute:carplay-fill',
        page: AppPage.WatchLater,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.WatchLater),
        url: `https://www.bilibili.com/watchlater/list`,
        hasBewlyPage: true,
      },
      {
        i18nKey: 'dock.moments',
        icon: 'i-tabler:windmill',
        iconActivated: 'i-tabler:windmill-filled',
        page: AppPage.Moments,
        openInNewTab: false,
        useOriginalBiliPage: getDefaultCustomUseOriginalBiliPage(AppPage.Moments),
        url: `https://t.bilibili.com`,
        hasBewlyPage: true,
      },
    ]
  })

  const homeTabs = shallowReadonly<HomeTab[]>(
    [
      {
        i18nKey: 'home.for_you',
        page: HomeSubPage.ForYou,
      },
      {
        i18nKey: 'home.following',
        page: HomeSubPage.Following,
      },
      {
        i18nKey: 'home.subscribed_series',
        page: HomeSubPage.SubscribedSeries,
      },
      {
        i18nKey: 'home.trending',
        page: HomeSubPage.Trending,
      },
      {
        i18nKey: 'home.weekly',
        page: HomeSubPage.Weekly,
      },
      {
        i18nKey: 'home.precious',
        page: HomeSubPage.Precious,
      },
      {
        i18nKey: 'home.ranking',
        page: HomeSubPage.Ranking,
      },
      {
        i18nKey: 'home.live',
        page: HomeSubPage.Live,
      },
    ],
  )

  function getBiliWebPageURLByPage(page: AppPage): string {
    const dockItem = dockItems.value.find(e => e.page === page)
    return dockItem?.url || ''
  }

  function getDockItemByPage(page: AppPage): DockItem | undefined {
    return dockItems.value.find(e => e.page === page)
  }

  return { dockItems, homeTabs, getBiliWebPageURLByPage, getDockItemByPage }
})
