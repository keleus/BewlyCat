import type { Settings } from '~/logic/storage'

export type MomentTypeFilterSetting = Extract<keyof Settings, | 'momentsHideVideoDynamics'
  | 'momentsHideDrawDynamics'
  | 'momentsHideUgcSeasonDynamics'
  | 'momentsHideForwardDynamics'
  | 'momentsHidePgcDynamics'
  | 'momentsHideArticleDynamics'
  | 'momentsFilterUpRecommendation'
  | 'momentsHideChargeExclusive'
  | 'momentsHideVideoReservation'
  | 'momentsHideLiveReservation'
  | 'momentsHideLiveDynamics'>

export interface MomentTypeFilterOption {
  setting: MomentTypeFilterSetting
  labelKey: string
  icon: string
}

/** Bewly 动态流按类型过滤的选项；设置页与动态页过滤入口共用，设置值为 true 表示隐藏该类动态 */
export const MOMENT_TYPE_FILTER_OPTIONS: readonly MomentTypeFilterOption[] = [
  { setting: 'momentsHideVideoDynamics', labelKey: 'settings.moments_filter_video_dynamic', icon: 'i-tabler-player-play' },
  { setting: 'momentsHideDrawDynamics', labelKey: 'settings.moments_filter_draw_dynamic', icon: 'i-tabler-photo' },
  { setting: 'momentsHideUgcSeasonDynamics', labelKey: 'settings.moments_filter_ugc_season_dynamic', icon: 'i-tabler-stack' },
  { setting: 'momentsHideForwardDynamics', labelKey: 'settings.moments_filter_forward_dynamic', icon: 'i-tabler-repeat' },
  { setting: 'momentsHidePgcDynamics', labelKey: 'settings.moments_filter_pgc_dynamic', icon: 'i-tabler-device-tv' },
  { setting: 'momentsHideArticleDynamics', labelKey: 'settings.moments_filter_article_dynamic', icon: 'i-tabler-news' },
  { setting: 'momentsFilterUpRecommendation', labelKey: 'settings.moments_filter_up_recommendation_short', icon: 'i-tabler-sparkles' },
  { setting: 'momentsHideChargeExclusive', labelKey: 'settings.moments_filter_charge_dynamic', icon: 'i-tabler-battery-charging' },
  { setting: 'momentsHideVideoReservation', labelKey: 'settings.moments_filter_video_reservation', icon: 'i-tabler-calendar-time' },
  { setting: 'momentsHideLiveReservation', labelKey: 'settings.moments_filter_live_reservation', icon: 'i-tabler-calendar-event' },
  { setting: 'momentsHideLiveDynamics', labelKey: 'settings.moments_filter_live_dynamic', icon: 'i-tabler-broadcast' },
]
