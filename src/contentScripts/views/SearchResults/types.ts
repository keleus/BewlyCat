export type SearchCategory = 'all' | 'video' | 'bangumi' | 'media_ft' | 'user' | 'live' | 'article'

export interface SearchCategoryOption {
  value: SearchCategory
  label: string
  icon: string
}
