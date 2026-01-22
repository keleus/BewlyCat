// https://app.quicktype.io/?l=ts
// 更新以适配B站新的WBI推荐接口

export interface forYouResult {
  code: number
  message: string
  ttl: number
  data: Data
}

export interface Data {
  item: Item[]
  side_bar_column: any[]
  business_card: null | any
  floor_info: null | any
  user_feature: null | any
  preload_expose_pct: number
  preload_floor_expose_pct: number
  mid: number
}

export interface Item {
  id: number
  bvid: string
  cid: number
  goto: Goto
  uri: string
  pic: string
  pic_4_3: string
  title: string
  duration: number
  pubdate: number
  owner: Owner | null // 广告卡片时可能为 null
  stat: Stat | null // 广告卡片时可能为 null
  av_feature: null | any
  is_followed: number
  rcmd_reason: RcmdReason | null // 可能为 null
  show_info: number
  track_id: string
  pos: number
  room_info: null | any
  ogv_info: null | any
  business_info: null | any // 广告卡片时为对象
  is_stock: number
  enable_vt: number
  vt_display: string
  dislike_switch?: number // 可选字段
  dislike_switch_pc?: number // 可选字段
}

export enum Goto {
  AV = 'av',
  AD = 'ad', // 广告卡片
}

export interface Owner {
  mid: number
  name: string
  face: string
}

export interface RcmdReason {
  reason_type: number
  content?: string
}

export interface Stat {
  view: number
  like?: number
  danmaku: number
  vt: number
  share?: number
  reply?: number
  favorite?: number
  coin?: number
}
