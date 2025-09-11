// https://socialsisteryi.github.io/bilibili-API-collect/#/video_ranking/popular
// Minimal typings for "每周必看" (Popular Series)

export interface PopularSeriesListResult {
  code: number
  message: string
  ttl: number
  data: {
    list: PopularSeriesItem[]
  }
}

export interface PopularSeriesItem {
  number: number // 期数编号
  subject?: string // 标题，如“每周必看第X期”
  name?: string // 备用字段
  // 以下字段依接口不同可能存在，用于推导周时间范围
  begin?: number | string
  end?: number | string
  begin_time?: number | string
  end_time?: number | string
  start?: number | string
  start_time?: number | string
  stime?: number | string
  etime?: number | string
  // other fields are not used in UI
}

export interface PopularSeriesOneResult {
  code: number
  message: string
  ttl: number
  data: {
    number?: number
    list: PopularSeriesVideoItem[]
  }
}

// Video item shape largely matches ranking API
export interface PopularSeriesVideoItem {
  aid: number
  bvid: string
  cid: number
  title: string
  desc?: string
  pic: string
  duration: number
  pubdate: number
  owner: {
    mid: number
    name: string
    face: string
  }
  stat: {
    view: number
    danmaku: number
    [key: string]: any
  }
  [key: string]: any
}
