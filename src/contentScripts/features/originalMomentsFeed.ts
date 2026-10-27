import { stripBilibiliLocalePathname } from '~/utils/bilibiliLocale'

export const ORIGINAL_MOMENTS_CARD_SELECTOR = '.bili-dyn-item'
export const ORIGINAL_MOMENTS_FEED_SELECTOR = '.bili-dyn-list__items'

export function isOriginalMomentsFeed(url: string = location.href) {
  try {
    const { hostname, pathname } = new URL(url)
    return hostname === 't.bilibili.com' && /^\/?$/.test(stripBilibiliLocalePathname(pathname))
  }
  catch {
    return false
  }
}
