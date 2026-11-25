import './common'
import './shadowDom'
import './thirdParties'
import { isOriginalMomentsFeed } from '~/contentScripts/features/originalMomentsFeed'
import { settings, settingsReady } from '~/logic/storage'
import { isInBilibiliLiveContext } from '~/utils/bilibiliLive'
import { stripBilibiliLocaleUrl } from '~/utils/bilibiliLocale'
import { isElectron, isHomePage, isInIframe, isWatchLaterListPage } from '~/utils/main'

type PageStyleKey =
  | 'forceDark'
  | 'accountSettingsPage'
  | 'animePage'
  | 'animePlaybackAndMoviePage'
  | 'articlesPage'
  | 'channelPage'
  | 'creativeCenterPage'
  | 'error404Page'
  | 'historyPage'
  | 'homePage'
  | 'loginPage'
  | 'momentsPage'
  | 'notePage'
  | 'notificationsPage'
  | 'premiumPage'
  | 'searchPage'
  | 'topicPage'
  | 'userSpacePage'
  | 'videoPage'
  | 'watchLaterPage'

const PAGE_STYLE_LOADERS: Record<PageStyleKey, () => Promise<{ default: string }>> = {
  forceDark: () => import('./forceDark.scss?inline'),
  accountSettingsPage: () => import('./pages/accountSettingsPage.scss?inline'),
  animePage: () => import('./pages/animePage.scss?inline'),
  animePlaybackAndMoviePage: () => import('./pages/animePlayback&MoviePage.scss?inline'),
  articlesPage: () => import('./pages/articlesPage.scss?inline'),
  channelPage: () => import('./pages/channelPage.scss?inline'),
  creativeCenterPage: () => import('./pages/creativeCenterPage.scss?inline'),
  error404Page: () => import('./pages/error404Page.scss?inline'),
  historyPage: () => import('./pages/historyPage.scss?inline'),
  homePage: () => import('./pages/homePage.scss?inline'),
  loginPage: () => import('./pages/loginPage.scss?inline'),
  momentsPage: () => import('./pages/momentsPage.scss?inline'),
  notePage: () => import('./pages/notePage.scss?inline'),
  notificationsPage: () => import('./pages/notificationsPage.scss?inline'),
  premiumPage: () => import('./pages/premiumPage.scss?inline'),
  searchPage: () => import('./pages/searchPage.scss?inline'),
  topicPage: () => import('./pages/topicPage.scss?inline'),
  userSpacePage: () => import('./pages/userSpacePage.scss?inline'),
  videoPage: () => import('./pages/videoPage.scss?inline'),
  watchLaterPage: () => import('./pages/watchLaterPage.scss?inline'),
}

const pageStyleCache = new Map<PageStyleKey, string>()

async function loadPageStyle(...keys: PageStyleKey[]): Promise<string> {
  const parts = await Promise.all(
    keys.map(async (key) => {
      const cached = pageStyleCache.get(key)
      if (cached !== undefined) return cached

      const mod = await PAGE_STYLE_LOADERS[key]()
      pageStyleCache.set(key, mod.default)
      return mod.default
    }),
  )
  return parts.join('\n')
}

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

const PAGE_STYLE_ATTR = 'data-bewly-page-style'
const HOST_STYLE_SELECTOR = ':scope > style[data-bewly-host-styles]'
const PAGE_STYLE_SELECTOR = `:scope > style[${PAGE_STYLE_ATTR}]`

let styleSetupRevision = 0
let lastStyledUrl = document.URL
let pendingPageStyleText: string | undefined
let pageStyleObserver: MutationObserver | undefined

function syncPageStyleElement(cssText: string): boolean {
  const root = document.documentElement
  if (!root) return false

  const existing = Array.from(root.querySelectorAll<HTMLStyleElement>(PAGE_STYLE_SELECTOR))
  if (!cssText) {
    for (const styleEl of existing) styleEl.remove()
    return true
  }

  let styleEl = existing[0]
  for (let i = 1; i < existing.length; i++) existing[i].remove()

  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.setAttribute(PAGE_STYLE_ATTR, '')
  }

  // 同类型页面间 SPA 跳转（如视频切 P / 切 BV）内容一致时跳过重写，避免无谓的样式表重解析。
  if (styleEl.textContent !== cssText) styleEl.textContent = cssText

  const hostStyle = root.querySelector(HOST_STYLE_SELECTOR)
  if (hostStyle) {
    if (hostStyle.nextElementSibling !== styleEl) hostStyle.after(styleEl)
  } else {
    const anchor = root.querySelector(':scope > body') ?? root.querySelector(':scope > head')
    if (anchor) {
      if (anchor.nextElementSibling !== styleEl) anchor.after(styleEl)
    } else if (!styleEl.isConnected) {
      root.append(styleEl)
    }
  }

  return true
}

function applyPageStyle(cssText: string) {
  if (isElectron() || isInBilibiliLiveContext()) return

  pendingPageStyleText = cssText
  if (syncPageStyleElement(cssText)) {
    pageStyleObserver?.disconnect()
    pageStyleObserver = undefined
    return
  }

  if (pageStyleObserver) return

  pageStyleObserver = new MutationObserver(() => {
    if (syncPageStyleElement(pendingPageStyleText ?? '')) {
      pageStyleObserver?.disconnect()
      pageStyleObserver = undefined
    }
  })
  pageStyleObserver.observe(document, { childList: true })
}

async function setupStyles() {
  if (isElectron() || isInBilibiliLiveContext()) return

  const revision = ++styleSetupRevision
  const rawUrl = document.URL
  // 多语言路径（如 /ja/video/...、/en/bangumi/play/...）去掉语言段后再匹配页面样式。
  const currentUrl = stripBilibiliLocaleUrl(rawUrl)
  const root = document.documentElement
  const isCurrentSetup = () => revision === styleSetupRevision && document.URL === rawUrl
  const activatePage = async (styleKeys: PageStyleKey[], ...classNames: string[]) => {
    const cssText = await loadPageStyle(...styleKeys)
    if (!isCurrentSetup()) return false

    applyPageStyle(cssText)
    root?.classList.add(...classNames)
    return true
  }

  root?.classList.remove(...PAGE_STYLE_CLASSES)

  // homepage 首页
  if (isHomePage()) {
    await activatePage(['homePage'], 'homePage')
  }

  // notifications page 消息页
  else if (/https?:\/\/message\.bilibili\.com\.*/.test(currentUrl)) {
    if (!(await activatePage(['notificationsPage'], 'notificationsPage'))) return

    if (isInIframe() && settings.value.openNotificationsPageAsDrawer) {
      root?.classList.add('drawer')
    }
  }

  // moments page, new articles page 动态页, 新版专栏页
  else if (
    // moments
    /https?:\/\/t\.bilibili\.com\.*/.test(currentUrl) ||
    // moment detail, new articles page
    /https?:\/\/www\.bilibili\.com\/opus\/.*/.test(currentUrl)
  ) {
    const isOriginalMomentsFeedPage = isOriginalMomentsFeed(currentUrl)
    let initialVisibilityGuard: HTMLStyleElement | undefined
    if (isOriginalMomentsFeedPage && root) {
      root.classList.add('momentsPage')
      root.classList.remove('moments-original-components-ready')
      // storage 与页面样式均是异步读取的。先让可选区域不可见，等真实设置和正式样式同时就绪后再显示，
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

    const [cssText] = await Promise.all([
      loadPageStyle('momentsPage'),
      isOriginalMomentsFeedPage ? settingsReady : Promise.resolve(),
    ])

    if (!isCurrentSetup()) {
      initialVisibilityGuard?.remove()
      return
    }

    applyPageStyle(cssText)
    root?.classList.add('momentsPage')

    if (isOriginalMomentsFeedPage && root) {
      root.classList.toggle(
        'moments-hide-original-user-card',
        !settings.value.originalMomentsShowUserCard,
      )
      root.classList.toggle(
        'moments-hide-original-live-list',
        !settings.value.originalMomentsShowLiveList,
      )
      root.classList.toggle(
        'moments-hide-original-community-center',
        !settings.value.originalMomentsShowCommunityCenter,
      )
      root.classList.toggle(
        'moments-hide-original-hot-search',
        !settings.value.originalMomentsShowHotSearch,
      )
      root.classList.toggle(
        'moments-hide-original-up-list',
        !settings.value.originalMomentsShowUpList,
      )
      root.classList.add('moments-original-components-ready')
      initialVisibilityGuard?.remove()
    }

    // 插件动态页通过抽屉 iframe 打开详情时，隐藏原站冗余布局并聚焦正文。
    const isMomentDetail =
      /https?:\/\/t\.bilibili\.com\/\d+/.test(currentUrl) ||
      /https?:\/\/(?:www\.)?bilibili\.com\/opus\/\d+/.test(currentUrl)
    if (isInIframe() && isMomentDetail) {
      root?.classList.add('drawer')
      root?.classList.add('remove-top-bar-without-placeholder')
    }
  }

  // history page 历史记录页
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/account\/history.*/.test(currentUrl) ||
    /https?:\/\/(?:www\.)?bilibili\.com\/history.*/.test(currentUrl)
  ) {
    await activatePage(['historyPage'], 'historyPage')
  }

  // watch later page 稍候再看页
  else if (isWatchLaterListPage(currentUrl)) {
    await activatePage(['watchLaterPage'], 'watchLaterPage')
  }

  // user note page 笔记页
  else if (/^https?:\/\/space\.bilibili\.com\/v\/note-list/.test(currentUrl)) {
    await activatePage(['notePage'], 'notePage')
  }

  // user space page 空间页
  else if (/^https?:\/\/space\.bilibili\.com(?:\/|$).*/.test(currentUrl)) {
    await activatePage(['userSpacePage'], 'userSpacePage')
  }

  // search page 搜索结果页
  else if (/^https?:\/\/search\.bilibili\.com(?:\/|$).*/.test(currentUrl)) {
    await activatePage(['searchPage'], 'searchPage')
  }

  // video page 视频页
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/video\/.*/.test(currentUrl) ||
    // watch later playlist 稍候再看播放页
    /https?:\/\/(?:www\.)?bilibili\.com\/list\/watchlater.*/.test(currentUrl) ||
    // favorite playlist 收藏播放页
    /https?:\/\/(?:www\.)?bilibili\.com\/list\/ml.*/.test(currentUrl) ||
    // 旧版收藏播放页
    /https?:\/\/(?:www\.)?bilibili\.com\/medialist\/play\/.*/.test(currentUrl) ||
    // 视频合集
    /https?:\/\/(?:www\.)?bilibili\.com\/list\/.*/.test(currentUrl)
  ) {
    await activatePage(['videoPage'], 'videoPage')
  } else if (
    // anime playback & movie page 番剧播放页与电影播放页
    /https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/.*/.test(currentUrl)
  ) {
    await activatePage(['animePlaybackAndMoviePage'], 'animePlaybackAndMoviePage')
  }

  // anime page & chinese anime page 番剧页 与 国创动漫
  else if (/https?:\/\/(?:www\.)?bilibili\.com\/(?:anime|guochuang).*/.test(currentUrl)) {
    await activatePage(['animePage'], 'animePage')
  }

  // channel page e.g. tv shows, movie, variety shows & mooc pages 分区页
  else if (
    /https?:\/\/(?:www\.)?bilibili\.com\/(?:tv|movie|variety|mooc|documentary).*/.test(currentUrl)
  ) {
    await activatePage(['channelPage'], 'channelPage')
  }

  // articles, articles list & articles ranking pages 专栏页, 专栏列表页, 专栏排行榜页
  else if (/https?:\/\/(?:www\.)?bilibili\.com\/read.*/.test(currentUrl)) {
    await activatePage(['articlesPage'], 'articlesPage')
  }

  // topic page 话题页（真实链接为 /v/topic/detail?topic_id=…，detail 后是查询串而非路径段）
  else if (/https?:\/\/(?:www\.)?bilibili\.com\/v\/topic\/detail.*/.test(currentUrl)) {
    await activatePage(['topicPage'], 'topicPage')
  }

  // 404 page 404页
  else if (/^https?:\/\/(?:www\.)?bilibili\.com\/404.*$/.test(currentUrl)) {
    await activatePage(['error404Page'], 'error404Page')
  }

  // creative center page 创作中心页
  else if (/^https?:\/\/member\.bilibili\.com\/platform.*$/.test(currentUrl)) {
    await activatePage(['forceDark', 'creativeCenterPage'], 'forceDark', 'creativeCenterPage')
  }

  // account settings page 帳戶設定頁，除了大會員頁
  else if (/^https?:\/\/account\.bilibili\.com\/(?!big).*$/.test(currentUrl)) {
    await activatePage(['accountSettingsPage'], 'accountSettingsPage')
  }

  // premium page bilibili 大會員頁
  else if (/^https?:\/\/account\.bilibili\.com\/big.*$/.test(currentUrl)) {
    await activatePage(['premiumPage'], 'premiumPage')
  }

  // login page 登入頁
  else if (/^https?:\/\/passport\.bilibili\.com\/login.*$/.test(currentUrl)) {
    await activatePage(['loginPage'], 'loginPage')
  } else {
    applyPageStyle('')
  }
}

let styleRefreshQueued = false
function scheduleStyleRefresh() {
  if (styleRefreshQueued) return

  styleRefreshQueued = true
  // MAIN-world history hooks fire before the URL is updated.
  queueMicrotask(() => {
    styleRefreshQueued = false
    if (lastStyledUrl === document.URL) return

    lastStyledUrl = document.URL
    void setupStyles()
  })
}

void setupStyles()
window.addEventListener('pushstate', scheduleStyleRefresh)
window.addEventListener('replacestate', scheduleStyleRefresh)
window.addEventListener('popstate', scheduleStyleRefresh)
window.addEventListener('hashchange', scheduleStyleRefresh)
