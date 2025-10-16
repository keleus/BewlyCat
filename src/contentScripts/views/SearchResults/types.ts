export type SearchCategory = 'all' | 'video' | 'bangumi' | 'user' | 'live' | 'article'

export interface SearchCategoryOption {
  value: SearchCategory
  label: string
  icon: string
}
