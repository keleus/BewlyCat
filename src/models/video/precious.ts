// https://socialsisteryi.github.io/bilibili-API-collect/#/video_ranking/precious_videos
// Minimal typings for "入站必刷" (Precious Videos)

export interface PreciousResult {
  code: number
  message: string
  ttl: number
  data: {
    list: PreciousItem[]
    page?: {
      num: number
      size: number
      count: number
    }
  }
}

export interface PreciousItem {
  aid: number
  bvid: string
  cid: number
  title: string
  desc?: string
  pic: string
  duration: number
  pubdate: number
  owner?: {
    mid: number
    name: string
    face: string
  }
  stat?: {
    view: number
    danmaku: number
    [key: string]: any
  }
  [key: string]: any
}
