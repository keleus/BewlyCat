import { AppPage } from '~/enums/appEnums'
import { isWatchLaterListPage } from '~/utils/main'

/** 将 B 站原站地址映射到对应的 Bewly 页面；没有对应页面时返回 undefined。 */
export function getNativeBiliAppPage(url: string): AppPage | undefined {
  const { hostname, pathname } = new URL(url)

  if (hostname === 'search.bilibili.com')
    return AppPage.Search
  if (hostname === 't.bilibili.com')
    return AppPage.Moments
  if (hostname === 'space.bilibili.com' && /^\/\d+\/favlist\/?$/.test(pathname))
    return AppPage.Favorites
  if (hostname !== 'www.bilibili.com' && hostname !== 'bilibili.com')
    return undefined

  if (/^\/(?:anime|guochuang)(?:\/|$)/.test(pathname))
    return AppPage.Anime
  if (/^\/(?:account\/)?history(?:\/|$)/.test(pathname))
    return AppPage.History
  if (pathname.startsWith('/opus/'))
    return AppPage.Moments
  if (isWatchLaterListPage(url))
    return AppPage.WatchLater

  return undefined
}
