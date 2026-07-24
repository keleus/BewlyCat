import { settings } from '~/logic'

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

/**
 * 构建关键词搜索链接的唯一入口：
 * 开启插件搜索页时跳扩展内搜索页，否则跳 B 站原生搜索页
 */
export function buildKeywordSearchUrl(keyword: string): string {
  const encoded = encodeURIComponent(keyword)

  if (settings.value.usePluginSearchResultsPage)
    return `https://www.bilibili.com/?page=SearchResults&keyword=${encoded}`

  return `https://search.bilibili.com/all?keyword=${encoded}`
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
