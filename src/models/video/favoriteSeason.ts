export interface CollectedFavoriteSeasonsResult {
  code: number
  message: string
  ttl: number
  data: CollectedFavoriteSeasonsData
}

export interface CollectedFavoriteSeasonsData {
  count: number
  list: CollectedFavoriteSeason[]
  has_more: boolean
}

export interface CollectedFavoriteSeason {
  id: number
  fid: number
  mid: number
  attr: number
  attr_desc: string
  title: string
  cover: string
  upper: {
    mid: number
    name: string
    face: string
    jump_link: string
  }
  cover_type: number
  intro: string
  ctime: number
  mtime: number
  state: number
  fav_state: number
  media_count: number
  view_count: number
  vt: number
  is_top: boolean
  recent_fav: null
  play_switch: number
  type: number
  link: string
  bvid: string
  is_kid_playlist: boolean
  kid_playlist_desc: string
}

export interface FavoriteSeasonResourcesResult {
  code: number
  message: string
  ttl: number
  data: FavoriteSeasonResourcesData
}

export interface FavoriteSeasonResourcesData {
  info: FavoriteSeasonInfo
  medias: FavoriteSeasonMedia[]
}

export interface FavoriteSeasonInfo {
  id: number
  season_type: number
  title: string
  cover: string
  upper: {
    mid: number
    name: string
  }
  cnt_info: {
    collect: number
    play: number
    danmaku: number
    vt: number
  }
  media_count: number
  intro: string
  enable_vt: number
}

export interface FavoriteSeasonMedia {
  id: number
  title: string
  cover: string
  duration: number
  pubtime: number
  bvid: string
  upper: {
    mid: number
    name: string
  }
  cnt_info: {
    collect: number
    play: number
    danmaku: number
    vt: number
  }
  enable_vt: number
  vt_display: string
  is_self_view: boolean
}
