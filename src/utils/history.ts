import type { List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'

export function getHistoryUrl(item: HistoryItem): string {
  const { history } = item

  // 稿件优先使用历史分 P，避免 uri 或缺失的分 P 总数导致回到第一 P。
  if (history.business === Business.ARCHIVE) {
    const url = `https://www.bilibili.com/video/${history.bvid}`
    return Number.isInteger(history.page) && history.page > 0
      ? `${url}?p=${history.page}`
      : url
  }

  if (item.uri)
    return item.uri

  if (history.business === Business.LIVE)
    return `https://live.bilibili.com/${history.oid}`

  if (history.business === Business.ARTICLE || history.business === Business.ARTICLE_LIST)
    return `https://www.bilibili.com/read/cv${history.cid === 0 ? history.oid : history.cid}`

  return ''
}
