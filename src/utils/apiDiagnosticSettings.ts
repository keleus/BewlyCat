import { appAuthTokens, settings } from '~/logic'
import type { ApiErrorReportItems } from '~/utils/apiDiagnostics'

const RECOMMENDATION_MODE_LABELS = {
  web: 'Web（携带 Cookie）',
  webNoCookie: 'Web（不携带 Cookie）',
  app: 'App',
} as const

function formatThreshold(enabled: boolean, threshold: string): string {
  return `${enabled ? '开' : '关'}（${threshold}）`
}

function getAppAuthorizationLabel(): string {
  const { accessToken, accessTokenExpiresAt, refreshTokenExpiresAt } = appAuthTokens.value
  const now = Date.now()
  if (!accessToken)
    return '未授权'
  if (refreshTokenExpiresAt && refreshTokenExpiresAt <= now)
    return '授权已过期'
  if (accessTokenExpiresAt && accessTokenExpiresAt <= now)
    return '访问令牌已过期，可刷新'
  return '已授权'
}

export function getRecommendationSettingsDiagnostics(): ApiErrorReportItems {
  const { recommendationMode, appRecommendationColumn, autoSwitchRecommendationMode, rememberNoCookieRecommendationState } = settings.value
  const appColumn = appRecommendationColumn === 'double' ? '双列' : '单列'

  return {
    推荐模式: recommendationMode === 'app'
      ? `${RECOMMENDATION_MODE_LABELS.app} ${appColumn}`
      : RECOMMENDATION_MODE_LABELS[recommendationMode],
    App授权: getAppAuthorizationLabel(),
    App失败时自动切换Web: autoSwitchRecommendationMode,
    记住无Cookie推荐状态: rememberNoCookieRecommendationState,
  }
}

/** 只报告阈值和条目数量：关键词和 UP 主名单属于用户隐私，排查风控只需要规模。 */
export function getRecommendationFilterDiagnostics(): ApiErrorReportItems {
  const value = settings.value

  return {
    已关注UP不过滤: value.disableFilterForFollowedUser,
    过滤竖屏视频: value.filterOutVerticalVideos,
    时长过滤: formatThreshold(value.enableFilterByDuration, `${value.filterByDuration} 秒`),
    播放量过滤: formatThreshold(value.enableFilterByViewCount, `${value.filterByViewCount}`),
    点赞数过滤: formatThreshold(value.enableFilterByLikeCount, `${value.filterByLikeCount}`),
    发布时间过滤: formatThreshold(value.enableFilterByPublishTime, `${value.filterByPublishTime} 天`),
    标题关键词过滤: formatThreshold(value.enableFilterByTitle, `${value.filterByTitle.length} 条`),
    UP主过滤: formatThreshold(value.enableFilterByUser, `${value.filterByUser.length} 条`),
  }
}

export function getFollowingSettingsDiagnostics(): ApiErrorReportItems {
  const value = settings.value

  return {
    UP列表展示: value.followingUploaderSort === 'group' ? '按分组' : '按更新时间',
    显示直播中: value.followingTabShowLivestreamingVideos,
    过滤充电专属视频: value.followingFilterChargingVideos,
    过滤动态视频: value.followingFilterDynamicVideos,
  }
}
