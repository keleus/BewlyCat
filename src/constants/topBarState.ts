import type { UnReadDm, UnReadMessage } from '~/components/TopBar/types'

export interface TopBarSharedState {
  unReadMessage: UnReadMessage
  unReadDm: UnReadDm
  newMomentsCount: number
  watchLaterCount: number
  hasBCoinToReceive: boolean
  bCoinAlreadyReceived: boolean
  vipExpAlreadyReceived: boolean
}

export interface TopBarStateClaim {
  accountId: number
  maxAge: number
}

export interface TopBarRefreshClaim {
  shouldRefresh: boolean
  snapshot?: TopBarSharedState
  refreshId?: number
}

export interface TopBarStatePublish {
  accountId: number
  snapshot: TopBarSharedState
  refreshId: number
}

export interface TopBarStateRelease {
  accountId: number
  refreshId: number
}

export const TOP_BAR_STATE_MESSAGE = {
  CLAIM_REFRESH: 'topBarState:claimRefresh',
  PUBLISH: 'topBarState:publish',
  RELEASE_REFRESH: 'topBarState:releaseRefresh',
  UPDATED: 'topBarState:updated',
} as const
