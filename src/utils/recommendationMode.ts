import { settings } from '~/logic'

/**
 * 推荐模式在界面上的四个选项。存储仍拆为 recommendationMode 与 appRecommendationColumn，
 * 选择 App 单列 / 双列时同时写入两者，旧配置无需迁移。
 */
export type RecommendationModeOption = 'web' | 'webNoCookie' | 'appSingle' | 'appDouble'

export function createRecommendationModeOptions(t: (key: string) => string): { label: string, value: RecommendationModeOption }[] {
  return [
    { label: 'Web', value: 'web' },
    { label: t('settings.recommendation_mode_web_no_cookie'), value: 'webNoCookie' },
    { label: t('settings.recommendation_mode_app_single'), value: 'appSingle' },
    { label: t('settings.recommendation_mode_app_double'), value: 'appDouble' },
  ]
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
