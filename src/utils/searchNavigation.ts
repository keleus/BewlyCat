import { settings } from '~/logic'

export { getPluginSearchResultsUrl } from './searchUrl'

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
