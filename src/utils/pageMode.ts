import { AppPage } from '~/enums/appEnums'
import { getPluginSearchResultsUrl } from '~/utils/searchUrl'

export type PageMode = 'original' | 'bewly' | 'custom'

export interface PageModeTarget {
  page: AppPage
  preferencePage: AppPage
  bewlyUrl: string
}

const NEXT_PAGE_MODE: Readonly<Record<PageMode, PageMode>> = {
  original: 'bewly',
  bewly: 'custom',
  custom: 'original',
}
const BEWLY_PAGE_ALLOW_LIST = new Set<AppPage>([
  AppPage.Home,
  AppPage.Search,
  AppPage.SearchResults,
  AppPage.Anime,
  AppPage.History,
  AppPage.Favorites,
  AppPage.WatchLater,
  AppPage.Moments,
])
const CUSTOM_ORIGINAL_PAGE_DEFAULTS = new Set<AppPage>([
  AppPage.Moments,
])

function isBilibiliHomeHost(hostname: string): boolean {
  return hostname === 'www.bilibili.com' || hostname === 'bilibili.com'
}

function isBilibiliHomepagePath(pathname: string): boolean {
  return pathname === '/' || pathname === '' || pathname === '/index.html'
}

export function getNextPageMode(mode: PageMode): PageMode {
  return NEXT_PAGE_MODE[mode]
}

export function getDefaultCustomUseOriginalBiliPage(page: AppPage): boolean {
  return CUSTOM_ORIGINAL_PAGE_DEFAULTS.has(page)
}

export function resolveUseOriginalBiliPage(
  mode: PageMode,
  customUseOriginalBiliPage: boolean,
): boolean {
  if (mode === 'original')
    return true
  if (mode === 'bewly')
    return false
  return customUseOriginalBiliPage
}

function buildBewlyUrl(page: AppPage, sourceUrl?: URL): string {
  const targetUrl = new URL('https://www.bilibili.com/')
  targetUrl.searchParams.set('page', page)

  if (page === AppPage.SearchResults && sourceUrl) {
    const keyword = sourceUrl.searchParams.get('keyword')?.trim()
    const category = sourceUrl.searchParams.get('category')?.trim()
    if (keyword)
      targetUrl.searchParams.set('keyword', keyword)
    if (category)
      targetUrl.searchParams.set('category', category)
  }

  return targetUrl.toString()
}

function createTarget(page: AppPage, sourceUrl?: URL): PageModeTarget {
  return {
    page,
    preferencePage: page === AppPage.SearchResults ? AppPage.Search : page,
    bewlyUrl: buildBewlyUrl(page, sourceUrl),
  }
}

function isPathOrDescendant(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function resolvePageModeTarget(rawUrl: string, activatedPage: AppPage): PageModeTarget | null {
  try {
    const sourceUrl = new URL(rawUrl)
    if (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:')
      return null

    const { hostname, pathname } = sourceUrl

    if (hostname === 'search.bilibili.com') {
      const searchResultsUrl = getPluginSearchResultsUrl(rawUrl)
      if (searchResultsUrl) {
        return {
          page: AppPage.SearchResults,
          preferencePage: AppPage.Search,
          bewlyUrl: searchResultsUrl,
        }
      }
      return createTarget(AppPage.Search)
    }

    if (hostname === 'space.bilibili.com') {
      if (/^\/\d+\/favlist(?:\/|$)/.test(pathname))
        return createTarget(AppPage.Favorites)
      return null
    }

    if (hostname === 't.bilibili.com')
      return pathname === '/' || pathname === '' ? createTarget(AppPage.Moments) : null

    if (!isBilibiliHomeHost(hostname))
      return null

    if (isBilibiliHomepagePath(pathname)) {
      const pageParam = sourceUrl.searchParams.get('page')
      const page = pageParam ? pageParam as AppPage : activatedPage
      if (!BEWLY_PAGE_ALLOW_LIST.has(page))
        return null
      return createTarget(page, sourceUrl)
    }

    if (isPathOrDescendant(pathname, '/history') || isPathOrDescendant(pathname, '/account/history'))
      return createTarget(AppPage.History)
    if (isPathOrDescendant(pathname, '/anime'))
      return createTarget(AppPage.Anime)
    if (
      isPathOrDescendant(pathname, '/watchlater/list')
      || (isPathOrDescendant(pathname, '/watchlater') && sourceUrl.hash.startsWith('#/list'))
    ) {
      return createTarget(AppPage.WatchLater)
    }

    return null
  }
  catch {
    return null
  }
}

export function shouldReloadForPageModeChange(
  rawUrl: string,
  wasUsingOriginalBilibiliHomepage: boolean,
): boolean {
  if (!wasUsingOriginalBilibiliHomepage)
    return false

  try {
    const sourceUrl = new URL(rawUrl)
    return isBilibiliHomeHost(sourceUrl.hostname) && isBilibiliHomepagePath(sourceUrl.pathname)
  }
  catch {
    return false
  }
}

export function buildNativeSearchUrl(rawUrl: string): string {
  const targetUrl = new URL('https://search.bilibili.com/all')

  try {
    const sourceUrl = new URL(rawUrl)
    const keyword = sourceUrl.searchParams.get('keyword')?.trim()
    if (keyword)
      targetUrl.searchParams.set('keyword', keyword)
  }
  catch {
    // Invalid input falls back to the native search landing page.
  }

  return targetUrl.toString()
}

export function resolvePageModeNavigationUrl(
  rawUrl: string,
  target: PageModeTarget | null,
  useOriginalBiliPage: boolean,
): string | null {
  if (!target)
    return null

  try {
    const sourceUrl = new URL(rawUrl)
    const isBewlyShell = isBilibiliHomeHost(sourceUrl.hostname)
      && isBilibiliHomepagePath(sourceUrl.pathname)

    if (isBewlyShell) {
      if (target.page === AppPage.SearchResults && useOriginalBiliPage)
        return buildNativeSearchUrl(rawUrl)
      return null
    }

    return useOriginalBiliPage ? null : target.bewlyUrl
  }
  catch {
    return null
  }
}
