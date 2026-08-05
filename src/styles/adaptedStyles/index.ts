import './common'
import './shadowDom'
import './thirdParties'

import { settings, settingsReady } from '~/logic/storage'
import { isHomePage, isInIframe, isWatchLaterListPage } from '~/utils/main'

async function setupStyles() {
  const currentUrl = document.URL

  // homepage 首页
  if (isHomePage()) {
    await import('./pages/homePage.scss')
    document.documentElement.classList.add('homePage')
  }

  // notifications page 消息页
  else if (/https?:\/\/message\.bilibili\.com\.*/.test(currentUrl)) {
    await import('./pages/notificationsPage.scss')
    document.documentElement.classList.add('notificationsPage')

    if (isInIframe() && settings.value.openNotificationsPageAsDrawer) {
      document.documentElement.classList.add('drawer')
    }
  }

  // moments page, new articles page 动态页, 新版专栏页
  else if (
    // moments
    /https?:\/\/t\.bilibili\.com\.*/.test(currentUrl)
    // moment detail, new articles page
    || /https?:\/\/www\.bilibili\.com\/opus\/.*/.test(currentUrl)) {
    document.documentElement.classList.add('momentsPage')

    const isOriginalMomentsFeed = /https?:\/\/t\.bilibili\.com\/?(?:[?#].*)?$/.test(currentUrl)
    let initialVisibilityGuard: HTMLStyleElement | undefined
    if (isOriginalMomentsFeed) {
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
      document.documentElement.appendChild(initialVisibilityGuard)
    }

    await Promise.all([
      import('./pages/momentsPage.scss'),
      isOriginalMomentsFeed ? settingsReady : Promise.resolve(),
    ])

    if (isOriginalMomentsFeed) {
      document.documentElement.classList.toggle('moments-hide-original-user-card', !settings.value.originalMomentsShowUserCard)
      document.documentElement.classList.toggle('moments-hide-original-live-list', !settings.value.originalMomentsShowLiveList)
      document.documentElement.classList.toggle('moments-hide-original-community-center', !settings.value.originalMomentsShowCommunityCenter)
      document.documentElement.classList.toggle('moments-hide-original-hot-search', !settings.value.originalMomentsShowHotSearch)
      document.documentElement.classList.toggle('moments-hide-original-up-list', !settings.value.originalMomentsShowUpList)
      document.documentElement.classList.add('moments-original-components-ready')
      initialVisibilityGuard?.remove()
    }

    // 插件动态页通过抽屉 iframe 打开详情时，隐藏原站冗余布局并聚焦正文。
    const isMomentDetail = /https?:\/\/t\.bilibili\.com\/\d+/.test(currentUrl)
      || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/\d+/.test(currentUrl)
    if (isInIframe() && isMomentDetail) {
      document.documentElement.classList.add('drawer')
      document.documentElement.classList.add('remove-top-bar-without-placeholder')
    }
  }

  // history page 历史记录页
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/account\/history.*/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/history.*/.test(currentUrl)
  ) {
    await import('./pages/historyPage.scss')
    document.documentElement.classList.add('historyPage')
  }

  // watch later page 稍候再看页
  else if (isWatchLaterListPage(currentUrl)) {
    await import('./pages/watchLaterPage.scss')
    document.documentElement.classList.add('watchLaterPage')
  }

  // user note page 笔记页
  else if (/^https?:\/\/space\.bilibili\.com\/v\/note-list/.test(currentUrl)) {
    await import('./pages/notePage.scss')
    document.documentElement.classList.add('notePage')
  }

  // user space page 空间页
  else if (/^https?:\/\/space\.bilibili\.com(?:\/|$).*/.test(currentUrl)) {
    await import('./pages/userSpacePage.scss')
    document.documentElement.classList.add('userSpacePage')
  }

  // search page 搜索结果页
  else if (/^https?:\/\/search\.bilibili\.com(?:\/|$).*/.test(currentUrl)) {
    await import('./pages/searchPage.scss')
    document.documentElement.classList.add('searchPage')
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
    document.documentElement.classList.add('videoPage')
  }

  else if (
    // anime playback & movie page 番剧播放页与电影播放页
    /https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/.*/.test(currentUrl)
  ) {
    await import('./pages/animePlayback&MoviePage.scss')
    document.documentElement.classList.add('animePlaybackAndMoviePage')
  }

  // anime page & chinese anime page 番剧页 与 国创动漫
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/(?:anime|guochuang).*/.test(currentUrl)) {
    await import('./pages/animePage.scss')
    document.documentElement.classList.add('animePage')
  }

  // channel page e.g. tv shows, movie, variety shows & mooc pages 分区页
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/(?:tv|movie|variety|mooc|documentary).*/.test(currentUrl)) {
    await import('./pages/channelPage.scss')
    document.documentElement.classList.add('channelPage')
  }

  // articles, articles list & articles ranking pages 专栏页, 专栏列表页, 专栏排行榜页
  else if (/https?:\/\/(?:www\.)?bilibili\.com\/read.*/.test(currentUrl)) {
    await import('./pages/articlesPage.scss')
    document.documentElement.classList.add('articlesPage')
  }

  // topic page 话题页
  else if (/https?:\/\/(?:www\.)?bilibili\.com\/v\/topic\/detail\/.*/.test(currentUrl)) {
    await import('./pages/topicPage.scss')
    document.documentElement.classList.add('topicPage')
  }

  // 404 page 404页
  else if (/^https?:\/\/(?:www\.)?bilibili\.com\/404.*$/.test(currentUrl)) {
    await import('./pages/error404Page.scss')
    document.documentElement.classList.add('error404Page')
  }

  // creative center page 创作中心页
  else if (/^https?:\/\/member\.bilibili\.com\/platform.*$/.test(currentUrl)) {
    await import('./forceDark.scss')
    document.documentElement.classList.add('forceDark')
    await import('./pages/creativeCenterPage.scss')
    document.documentElement.classList.add('creativeCenterPage')
  }

  // account settings page 帳戶設定頁，除了大會員頁
  else if (/^https?:\/\/account\.bilibili\.com\/(?!big).*$/.test(currentUrl)) {
    await import('./pages/accountSettingsPage.scss')
    document.documentElement.classList.add('accountSettingsPage')
  }

  // premium page bilibili 大會員頁
  else if (/^https?:\/\/account\.bilibili\.com\/big.*$/.test(currentUrl)) {
    await import('./pages/premiumPage.scss')
    document.documentElement.classList.add('premiumPage')
  }

  // login page 登入頁
  else if (/^https?:\/\/passport\.bilibili\.com\/login.*$/.test(currentUrl)) {
    await import('./pages/loginPage.scss')
    document.documentElement.classList.add('loginPage')
  }
}

setupStyles()
