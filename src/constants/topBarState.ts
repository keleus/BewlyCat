import type { UnReadDm, UnReadMessage } from '~/components/TopBar/types'

export interface TopBarSharedState {
  unReadMessage: UnReadMessage
  unReadDm: UnReadDm
  newMomentsCount: number
  watchLaterCount: number
}

export interface TopBarRefreshClaim {
  shouldRefresh: boolean
  snapshot?: TopBarSharedState
  refreshId?: number
}

export interface TopBarStatePublish {
  snapshot: TopBarSharedState
  refreshId: number
}

export interface TopBarStateRelease {
  refreshId: number
}

export const TOP_BAR_STATE_MESSAGE = {
  CLAIM_REFRESH: 'topBarState:claimRefresh',
  PUBLISH: 'topBarState:publish',
  RELEASE_REFRESH: 'topBarState:releaseRefresh',
  UPDATED: 'topBarState:updated',
} as const
