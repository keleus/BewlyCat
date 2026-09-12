import type { Author } from '~/components/VideoCard/types'
import type { List as WatchLaterItem } from '~/models/video/watchLater'

/** 影视条目可能没有 UP 主信息，统一用影片封面、片名和播放地址兜底。 */
export function getWatchLaterAuthor(item: WatchLaterItem): Author {
  const { owner, bangumi } = item

  return {
    name: owner.name || bangumi?.season?.title || item.title,
    authorFace: owner.face || bangumi?.cover || item.pic,
    mid: owner.mid || undefined,
    authorUrl: owner.mid
      ? undefined
      : item.redirect_url
        || (bangumi?.ep_id ? `https://www.bilibili.com/bangumi/play/ep${bangumi.ep_id}` : '')
        || (bangumi?.season?.season_id ? `https://www.bilibili.com/bangumi/play/ss${bangumi.season.season_id}` : '')
        || item.uri
        || `https://www.bilibili.com/video/${item.bvid || `av${item.aid}`}/`,
  }
}
