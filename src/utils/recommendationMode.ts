import { settings } from '~/logic'
import type { RecommendationModeOption } from '~/logic/storage'

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

/** 按设置的顺序筛出快速切换按钮组要显示的选项；顺序与可见项下限由存储层的 normalize 保证 */
export function filterRecommendationModeSwitcherOptions<T extends { value: RecommendationModeOption }>(options: T[]): T[] {
  return settings.value.recommendationModeSwitcherOptions
    .filter(item => item.visible)
    .flatMap(item => options.filter(option => option.value === item.mode))
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
