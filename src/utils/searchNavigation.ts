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
