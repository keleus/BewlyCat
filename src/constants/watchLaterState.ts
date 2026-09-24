/** 稍后再看条目的精简标识：只保留判断“是否已加入”和移除所需的字段 */
export interface WatchLaterEntry {
  /** 0 表示仅通过 bvid 添加、尚不知道 aid */
  aid: number
  bvid?: string
  epid?: number
}

export interface WatchLaterSnapshot {
  entries: WatchLaterEntry[]
  count: number
}

export type WatchLaterChange
  = | { type: 'add' | 'remove', entry: WatchLaterEntry }
    | { type: 'clear' }

export interface WatchLaterStateClaim {
  accountId: number
  maxAge: number
  force?: boolean
}

export interface WatchLaterStateClaimResult {
  shouldRefresh: boolean
  snapshot?: WatchLaterSnapshot
  updatedAt?: number
  refreshId?: number
}

export interface WatchLaterStatePublish {
  accountId: number
  refreshId: number
  snapshot: WatchLaterSnapshot
}

export interface WatchLaterStateRelease {
  accountId: number
  refreshId: number
}

export interface WatchLaterStateUpdated {
  accountId: number
  snapshot: WatchLaterSnapshot
  updatedAt: number
}

export interface WatchLaterStateMutate {
  accountId: number
  change: WatchLaterChange
  /** 发出变更的页面实例，接收方据此忽略自身回声 */
  sourceId?: string
}

export const WATCH_LATER_STATE_MESSAGE = {
  CLAIM_REFRESH: 'watchLaterState:claimRefresh',
  PUBLISH: 'watchLaterState:publish',
  RELEASE_REFRESH: 'watchLaterState:releaseRefresh',
  MUTATE: 'watchLaterState:mutate',
  UPDATED: 'watchLaterState:updated',
  MUTATED: 'watchLaterState:mutated',
} as const
