import './common'
import './shadowDom'
import './thirdParties'

import { settings, settingsReady } from '~/logic/storage'
import { isHomePage, isInIframe, isWatchLaterListPage } from '~/utils/main'

const PAGE_STYLE_CLASSES = [
  'homePage',
  'notificationsPage',
  'momentsPage',
  'historyPage',
  'watchLaterPage',
  'notePage',
  'userSpacePage',
  'searchPage',
  'videoPage',
  'animePlaybackAndMoviePage',
  'animePage',
  'channelPage',
  'articlesPage',
  'topicPage',
  'error404Page',
  'forceDark',
  'creativeCenterPage',
  'accountSettingsPage',
  'premiumPage',
  'loginPage',
] as const

let styleSetupRevision = 0
let lastStyledUrl = document.URL

async function setupStyles() {
  const revision = ++styleSetupRevision
  const currentUrl = document.URL
  const root = document.documentElement
  const isCurrentSetup = () => revision === styleSetupRevision && document.URL === currentUrl
  const activatePage = (...classNames: string[]) => {
    if (!isCurrentSetup())
      return false

    root.classList.add(...classNames)
    return true
  }

  root.classList.remove(...PAGE_STYLE_CLASSES)

  // homepage 首页
  if (isHomePage()) {
    await import('./pages/homePage.scss')
    activatePage('homePage')
  }

  // notifications page 消息页
  else if (/https?:\/\/message\.bilibili\.com\.*/.test(currentUrl)) {
    await import('./pages/notificationsPage.scss')
    if (!activatePage('notificationsPage'))
      return

    if (isInIframe() && settings.value.openNotificationsPageAsDrawer) {
      root.classList.add('drawer')
    }
  }

  // moments page, new articles page 动态页, 新版专栏页
  else if (
    // moments
    /https?:\/\/t\.bilibili\.com\.*/.test(currentUrl)
    // moment detail, new articles page
    || /https?:\/\/www\.bilibili\.com\/opus\/.*/.test(currentUrl)) {
    if (!activatePage('momentsPage'))
      return

    const isOriginalMomentsFeed = /https?:\/\/t\.bilibili\.com\/?(?:[?#].*)?$/.test(currentUrl)
    let initialVisibilityGuard: HTMLStyleElement | undefined
    if (isOriginalMomentsFeed) {
      root.classList.remove('moments-original-components-ready')
      // storage 是异步读取的。先让可选区域不可见，等真实设置和正式样式同时就绪后再显示，
      // 避免用户已经关闭的原生组件在首屏短暂闪现。
      initialVisibilityGuard = document.createElement('style')
      initialVisibilityGuard.dataset.bewlyMomentsInitialVisibility = ''
      initialVisibilityGuard.textContent = `
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.left > section:has(.bili-dyn-my-info),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.left > section:has(.bili-dyn-my-info--skeleton),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.left > section:has(.bili-dyn-live-users),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.right > section:has(.bili-dyn-banner),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.right > section:has(.bili-dyn-topic-box),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.right > section:has(.bili-dyn-search-trendings),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > aside.right > section:has(.topic-panel),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-home--member > main > section:has(.bili-dyn-up-list),
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-my-info,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-my-info--skeleton,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-live-users,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-banner,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-topic-box,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-search-trendings,
        html.momentsPage:not(.moments-original-components-ready) .topic-panel,
        html.momentsPage:not(.moments-original-components-ready) .bili-dyn-up-list {
          visibility: hidden !important;
        }
      `
      root.appendChild(initialVisibilityGuard)
    }

    await Promise.all([
      import('./pages/momentsPage.scss'),
      isOriginalMomentsFeed ? settingsReady : Promise.resolve(),
    ])

    if (!isCurrentSetup()) {
      initialVisibilityGuard?.remove()
      return
    }

    if (isOriginalMomentsFeed) {
      root.classList.toggle('moments-hide-original-user-card', !settings.value.originalMomentsShowUserCard)
      root.classList.toggle('moments-hide-original-live-list', !settings.value.originalMomentsShowLiveList)
      root.classList.toggle('moments-hide-original-community-center', !settings.value.originalMomentsShowCommunityCenter)
      root.classList.toggle('moments-hide-original-hot-search', !settings.value.originalMomentsShowHotSearch)
      root.classList.toggle('moments-hide-original-up-list', !settings.value.originalMomentsShowUpList)
      root.classList.add('moments-original-components-ready')
      initialVisibilityGuard?.remove()
    }

    // 插件动态页通过抽屉 iframe 打开详情时，隐藏原站冗余布局并聚焦正文。
    const isMomentDetail = /https?:\/\/t\.bilibili\.com\/\d+/.test(currentUrl)
      || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/\d+/.test(currentUrl)
    if (isInIframe() && isMomentDetail) {
      root.classList.add('drawer')
      root.classList.add('remove-top-bar-without-placeholder')
    }
  }

  // history page 历史记录页
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/account\/history.*/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/history.*/.test(currentUrl)
  ) {
    await import('./pages/historyPage.scss')
    activatePage('historyPage')
  }

  // watch later page 稍候再看页
  else if (isWatchLaterListPage(currentUrl)) {
    await import('./pages/watchLaterPage.scss')
    activatePage('watchLaterPage')
  }

  // user note page 笔记页
  else if (/^https?:\/\/space\.bilibili\.com\/v\/note-list/.test(currentUrl)) {
    await import('./pages/notePage.scss')
    activatePage('notePage')
  }

  // user space page 空间页
  else if (/^https?:\/\/space\.bilibili\.com(?:\/|$).*/.test(currentUrl)) {
    await import('./pages/userSpacePage.scss')
    activatePage('userSpacePage')
  }

  // search page 搜索结果页
  else if (/^https?:\/\/search\.bilibili\.com(?:\/|$).*/.test(currentUrl)) {
    await import('./pages/searchPage.scss')
    activatePage('searchPage')
  }

  // video page 视频页
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/video\/.*/.test(currentUrl)
    // watch later playlist 稍候再看播放页
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/watchlater.*/.test(currentUrl)
    // favorite playlist 收藏播放页
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/ml.*/.test(currentUrl)
    // 旧版收藏播放页
    || /https?:\/\/(?:www\.)?bilibili\.com\/medialist\/play\/.*/.test(currentUrl)
    // 视频合集
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/.*/.test(currentUrl)
  ) {
    await import('./pages/videoPage.scss')
    activatePage('videoPage')
  }

  else if (
    // anime playback & movie page 番剧播放页与电影播放页
    /https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/.*/.test(currentUrl)
  ) {
    await import('./pages/animePlayback&MoviePage.scss')
    activatePage('animePlaybackAndMoviePage')
  }

  // anime page & chinese anime page 番剧页 与 国创动漫
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/(?:anime|guochuang).*/.test(currentUrl)) {
    await import('./pages/animePage.scss')
    activatePage('animePage')
  }

  // channel page e.g. tv shows, movie, variety shows & mooc pages 分区页
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/(?:tv|movie|variety|mooc|documentary).*/.test(currentUrl)) {
    await import('./pages/channelPage.scss')
    activatePage('channelPage')
  }

  // articles, articles list & articles ranking pages 专栏页, 专栏列表页, 专栏排行榜页
  else if (/https?:\/\/(?:www\.)?bilibili\.com\/read.*/.test(currentUrl)) {
    await import('./pages/articlesPage.scss')
    activatePage('articlesPage')
  }

  // topic page 话题页（真实链接为 /v/topic/detail?topic_id=…，detail 后是查询串而非路径段）
  else if (/https?:\/\/(?:www\.)?bilibili\.com\/v\/topic\/detail.*/.test(currentUrl)) {
    await import('./pages/topicPage.scss')
    activatePage('topicPage')
  }

  // 404 page 404页
  else if (/^https?:\/\/(?:www\.)?bilibili\.com\/404.*$/.test(currentUrl)) {
    await import('./pages/error404Page.scss')
    activatePage('error404Page')
  }

  // creative center page 创作中心页
  else if (/^https?:\/\/member\.bilibili\.com\/platform.*$/.test(currentUrl)) {
    await import('./forceDark.scss')
    if (!activatePage('forceDark'))
      return
    await import('./pages/creativeCenterPage.scss')
    activatePage('creativeCenterPage')
  }

  // account settings page 帳戶設定頁，除了大會員頁
  else if (/^https?:\/\/account\.bilibili\.com\/(?!big).*$/.test(currentUrl)) {
    await import('./pages/accountSettingsPage.scss')
    activatePage('accountSettingsPage')
  }

  // premium page bilibili 大會員頁
  else if (/^https?:\/\/account\.bilibili\.com\/big.*$/.test(currentUrl)) {
    await import('./pages/premiumPage.scss')
    activatePage('premiumPage')
  }

  // login page 登入頁
  else if (/^https?:\/\/passport\.bilibili\.com\/login.*$/.test(currentUrl)) {
    await import('./pages/loginPage.scss')
    activatePage('loginPage')
  }
}

let styleRefreshQueued = false
function scheduleStyleRefresh() {
  if (styleRefreshQueued)
    return

  styleRefreshQueued = true
  // MAIN-world history hooks fire before the URL is updated.
  queueMicrotask(() => {
    styleRefreshQueued = false
    if (lastStyledUrl === document.URL)
      return

    lastStyledUrl = document.URL
    void setupStyles()
  })
}

void setupStyles()
window.addEventListener('pushstate', scheduleStyleRefresh)
window.addEventListener('replacestate', scheduleStyleRefresh)
window.addEventListener('popstate', scheduleStyleRefresh)
window.addEventListener('hashchange', scheduleStyleRefresh)
