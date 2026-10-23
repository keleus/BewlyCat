import { settings } from '~/logic'
import type { RecommendationModeOption } from '~/logic/storage'

/** 快速切换按钮组至少显示的选项数 */
export const MIN_RECOMMENDATION_MODE_SWITCHER_OPTIONS = 2

/**
 * 推荐模式在界面上的四个选项。存储仍拆为 recommendationMode 与 appRecommendationColumn，
 * 选择 App 单列 / 双列时同时写入两者，旧配置无需迁移。
 */
export function createRecommendationModeOptions(t: (key: string) => string): { label: string, value: RecommendationModeOption }[] {
  return [
    { label: 'Web', value: 'web' },
    { label: t('settings.recommendation_mode_web_no_cookie'), value: 'webNoCookie' },
    { label: t('settings.recommendation_mode_app_single'), value: 'appSingle' },
    { label: t('settings.recommendation_mode_app_double'), value: 'appDouble' },
  ]
}

/** 按用户设置的顺序排列选项；缺失或非法值按原顺序排在末尾 */
export function sortRecommendationModeSwitcherOptions<T extends { value: RecommendationModeOption }>(options: T[]): T[] {
  const storedOrder = settings.value.recommendationModeSwitcherOrder
  const ranks = new Map<RecommendationModeOption, number>()
  const available = new Set(options.map(option => option.value))
  if (Array.isArray(storedOrder)) {
    for (const value of storedOrder) {
      if (available.has(value) && !ranks.has(value))
        ranks.set(value, ranks.size)
    }
  }
  const missingRank = ranks.size
  return [...options].sort((a, b) => (ranks.get(a.value) ?? missingRank) - (ranks.get(b.value) ?? missingRank))
}

/** 按设置筛出快速切换按钮组要显示的选项，并按用户设置的顺序排列；存储值不足下限时显示全部 */
export function filterRecommendationModeSwitcherOptions<T extends { value: RecommendationModeOption }>(options: T[]): T[] {
  const selected = settings.value.recommendationModeSwitcherOptions
  const visible = Array.isArray(selected) ? options.filter(option => selected.includes(option.value)) : []
  const result = visible.length >= MIN_RECOMMENDATION_MODE_SWITCHER_OPTIONS ? visible : options
  return sortRecommendationModeSwitcherOptions(result)
}

export function getRecommendationModeOption(): RecommendationModeOption {
  const mode = settings.value.recommendationMode
  if (mode !== 'app')
    return mode
  return settings.value.appRecommendationColumn === 'double' ? 'appDouble' : 'appSingle'
}

export function applyRecommendationModeOption(option: RecommendationModeOption) {
  if (option === 'appSingle' || option === 'appDouble') {
    settings.value.appRecommendationColumn = option === 'appDouble' ? 'double' : 'single'
    settings.value.recommendationMode = 'app'
    return
  }
  settings.value.recommendationMode = option
}
