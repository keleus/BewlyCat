import type { ThreePointV2 } from '~/models/video/appForYou'

/** Data-only interaction state survives offscreen card recycling. */
export interface VideoCardState {
  removed: boolean
  selectedDislikeOpt?: { reasonId?: number, feedbackId?: number }
  videoCurrentTime: number | null
  isInWatchLater: boolean
  resolvedWatchLaterAid?: number
}

export function createVideoCardState(): VideoCardState {
  return { removed: false, videoCurrentTime: null, isInWatchLater: false }
}

export interface Video {
  id: number
  duration?: number
  durationStr?: string
  title: string
  desc?: string
  cover: string

  /** `author` for individual submissions by UP; `authorList` for collaborative submissions by UP */
  author?: Author | Author[]

  view?: number
  viewStr?: string
  danmaku?: number
  danmakuStr?: string
  like?: number
  likeStr?: string

  publishedTimestamp?: number
  capsuleText?: string

  bvid?: string
  aid?: number
  // used for live
  roomid?: number
  epid?: number
  goto?: string
  param?: string
  /** After set the `url`, clicking the video will navigate to this url. It won't be affected by aid, bvid or epid */
  url?: string
  /** Better to provide cid, otherwise video preview will need to call another API to get it */
  cid?: number

  followed?: boolean
  liveStatus?: number
  trackId?: string

  /** API-provided display labels, such as recommendation reasons or “1万点赞”. */
  tag?: string | string[]
  /** Real content tags exposed on search-result pages; clicking these starts a search. */
  searchableTags?: string[]
  /** Searchable video partition name from APIs, such as `typename` in search results. */
  category?: string
  rank?: number
  type?: 'horizontal' | 'vertical' | 'bangumi' | 'ketang'
  threePointV2: ThreePointV2[]

  badge?: {
    bgColor: string
    color: string
    iconUrl?: string
    text: string
  }
}

export interface Author {
  name?: string
  /** After set the `authorUrl`, clicking the author's name or avatar will navigate to this url. It won't be affected by mid */
  authorUrl?: string
  authorFace: string
  followed?: boolean | undefined
  mid?: number
}
