export interface UserVideosResult {
  code: number
  message: string
  data: {
    list: {
      vlist: UserVideo[]
    }
    page: {
      pn: number
      ps: number
      count: number
    }
    is_risk?: boolean
    gaia_res_type?: number
  }
}

export interface UserVideo {
  aid: number
  bvid: string
  title: string
  description: string
  pic: string
  author: string
  mid: number
  created: number
  length: string
  play: number | string
  video_review: number
  is_union_video?: number
  is_charging_arc?: boolean
  elec_arc_type?: number
}
