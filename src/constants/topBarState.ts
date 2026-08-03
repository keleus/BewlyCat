import type { UnReadDm, UnReadMessage } from '~/components/TopBar/types'

export interface TopBarSharedState {
  unReadMessage: UnReadMessage
  unReadDm: UnReadDm
  newMomentsCount: number
  watchLaterCount: number
  hasBCoinToReceive: boolean
  bCoinAlreadyReceived: boolean
  vipExpAlreadyReceived: boolean
  bCoinNextReceiveAt?: number | null
  vipExpNextReceiveAt?: number | null
}

export interface TopBarStateClaim {
  accountId: number
  maxAge: number
  force?: boolean
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

export interface TopBarStateInvalidate {
  accountId: number
}

export interface TopBarFavoritesChanged {
  accountId: number
}

export const TOP_BAR_STATE_MESSAGE = {
  CLAIM_REFRESH: 'topBarState:claimRefresh',
  PUBLISH: 'topBarState:publish',
  RELEASE_REFRESH: 'topBarState:releaseRefresh',
  INVALIDATE: 'topBarState:invalidate',
  INVALIDATED: 'topBarState:invalidated',
  FAVORITES_CHANGED: 'topBarState:favoritesChanged',
  UPDATED: 'topBarState:updated',
  LOGIN_STATE_CHANGED: 'topBarState:loginStateChanged',
} as const
