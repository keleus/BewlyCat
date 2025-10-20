export type SearchCategory = 'all' | 'video' | 'bangumi' | 'media_ft' | 'user' | 'live' | 'article'

export interface SearchCategoryOption {
  value: SearchCategory
  label: string
  icon: string
}

export type LiveSubCategory = 'all' | 'live_room' | 'live_user'

export interface VideoSearchFilters {
  order: string
  duration: number
  timeRange: string
  customStartDate: string
  customEndDate: string
}

export interface UserSearchFilters {
  order: string
  userType: number
}

export interface LiveSearchFilters {
  subCategory: LiveSubCategory
  roomOrder: string
  userOrder: string
}
