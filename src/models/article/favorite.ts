/**
 * 图文收藏列表
 * GET /x/polymer/web-dynamic/v1/opus/feed/fav
 * 结构与空间图文 feed 类似，见 bilibili-api-collect docs/opus/space.md
 */
export interface FavoriteArticlesResult {
  code: number
  message: string
  ttl: number
  data?: FavoriteArticlesData
}

export interface FavoriteArticlesData {
  items?: FavoriteArticle[]
  has_more?: boolean
  /** 下一页 offset，通常为最后一条 opus_id */
  offset?: string
  update_num?: number | string
  update_baseline?: string
}

export interface FavoriteArticleAuthor {
  name?: string
  face?: string
  mid?: number | string
}

export interface FavoriteArticleCover {
  url?: string
  width?: number
  height?: number
}

export interface FavoriteArticleStat {
  /** 已格式化展示文案，如 "9144" / "20.4万" */
  view?: string
  like?: string
}

export interface FavoriteArticle {
  opus_id: string
  content?: string
  jump_url?: string
  badge?: unknown
  author?: FavoriteArticleAuthor
  cover?: FavoriteArticleCover | null
  stat?: FavoriteArticleStat
  /** 展示用时间，如 "7-8" / "2023-8-17" */
  pub_time?: string
}
