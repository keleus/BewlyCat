import { settings } from '~/logic'
import { isHomePage, isInIframe } from '~/utils/main'

const NATIVE_SEARCH_CATEGORY_BY_PATH: Record<string, string> = {
  article: 'article',
  bangumi: 'bangumi',
  live: 'live',
  media_bangumi: 'bangumi',
  media_ft: 'media_ft',
  movie: 'media_ft',
  upuser: 'user',
  user: 'user',
  video: 'video',
}

export function shouldUsePluginSearchResultsPage(): boolean {
  return settings.value.usePluginSearchResultsPage
    && !settings.value.useOriginalBilibiliHomepage
}

/**
 * Build a native Bilibili search URL from a keyword.
 *
 * This intentionally starts from a fresh URL so page/tracking parameters from
 * the current BewlyCat route (for example `from_source`) are never forwarded.
 */
export function buildNativeSearchUrl(keyword: string): string {
  const normalized = keyword.trim()
  const targetUrl = new URL('https://search.bilibili.com/all')

  if (normalized)
    targetUrl.searchParams.set('keyword', normalized)

  return targetUrl.toString()
}

/**
 * 构建关键词搜索链接的唯一入口：
 * 开启插件搜索页时跳扩展内搜索页，否则跳 B 站原生搜索页
 */
export function buildKeywordSearchUrl(keyword: string): string {
  const encoded = encodeURIComponent(keyword)

  if (shouldUsePluginSearchResultsPage())
    return `https://www.bilibili.com/?page=SearchResults&keyword=${encoded}`

  return buildNativeSearchUrl(keyword)
}

const PLUGIN_SEARCH_RESET_PARAMS = [
  'category',
  'pn',
  'user_order',
  'user_type',
  'search_type',
  'live_room_order',
  'live_user_order',
] as const

/**
 * 开启插件搜索结果页时，在当前插件首页就地切到搜索结果，
 * 或从其他 B 站页面跳到插件搜索结果。返回 true 表示已接管导航。
 */
export function navigateToPluginSearchResults(keyword: string): boolean {
  if (!shouldUsePluginSearchResultsPage())
    return false

  const normalized = keyword.trim()
  if (!normalized)
    return false

  const targetUrl = `https://www.bilibili.com/?page=SearchResults&keyword=${encodeURIComponent(normalized)}`

  if (!isHomePage()) {
    if (isInIframe())
      window.top?.location.assign(targetUrl)
    else
      window.location.assign(targetUrl)
    return true
  }

  const params = new URLSearchParams(window.location.search)
  params.set('page', 'SearchResults')
  params.set('keyword', normalized)
  for (const key of PLUGIN_SEARCH_RESET_PARAMS)
    params.delete(key)

  window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`)
  window.dispatchEvent(new Event('pushstate'))
  return true
}

/**
 * Convert a Bilibili native search URL into BewlyCat's built-in search results
 * URL. Returning null leaves unsupported or keyword-less pages untouched.
 */
export function getPluginSearchResultsUrl(value: string): string | null {
  try {
    const sourceUrl = new URL(value)
    if (
      (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:')
      || sourceUrl.hostname !== 'search.bilibili.com'
    ) {
      return null
    }

    const keyword = sourceUrl.searchParams.get('keyword')?.trim()
    if (!keyword)
      return null

    const targetUrl = new URL('https://www.bilibili.com/')
    targetUrl.searchParams.set('page', 'SearchResults')
    targetUrl.searchParams.set('keyword', keyword)

    const nativeCategory = sourceUrl.pathname.split('/').filter(Boolean)[0]?.toLowerCase()
    const pluginCategory = nativeCategory && NATIVE_SEARCH_CATEGORY_BY_PATH[nativeCategory]
    if (pluginCategory)
      targetUrl.searchParams.set('category', pluginCategory)

    return targetUrl.toString()
  }
  catch {
    return null
  }
}
