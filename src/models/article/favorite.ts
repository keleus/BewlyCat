export interface FavoriteArticlesResult {
  code: number
  message: string
  ttl: number
  data?: FavoriteArticlesData
}

export interface FavoriteArticlesData {
  count?: number
  total?: number
  pn?: number
  ps?: number
  favorites?: FavoriteArticle[]
}

export interface FavoriteArticle {
  id: number | string
  opus_id?: number | string
  dynamic_id?: number | string
  title: string
  summary?: string
  desc?: string
  image_urls?: string[]
  cover?: string
  banner_url?: string
  author?: {
    mid?: number
    name?: string
  }
  upper?: {
    mid?: number
    name?: string
  }
  author_name?: string
  mid?: number
  stats?: {
    view?: number
    like?: number
    reply?: number
  }
  view?: number
  like?: number
  reply?: number
  publish_time?: number
  pub_time?: number
  ctime?: number
  category?: {
    name?: string
  }
  category_name?: string
  tags?: Array<string | { name?: string, tag_name?: string }>
  url?: string
  jump_url?: string
  uri?: string
  link?: string
}
