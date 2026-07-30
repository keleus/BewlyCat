export const BEWLY_FAVORITE_DEAL_SUCCESS = 'BEWLY_FAVORITE_DEAL_SUCCESS'

export interface FavoriteDealSuccessPayload {
  rid: number
  type: number
  addMediaIds: number[]
  delMediaIds: number[]
}
