import { settings } from '~/logic'
import { isGlassSupportedPlaybackPage, isVideoPlaybackPage } from '~/utils/main'

export type VideoPageTheme = 'light' | 'dark'

export function isFestivalPageUrl(url: string = location.href): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(url)
}

/** 关闭「视频页跟随浅/深色主题」且位于视频播放页时，返回独立指定的浅色或深色。 */
export function resolveVideoPageThemeOverride(url: string = location.href): VideoPageTheme | null {
  if (settings.value.videoPageFollowGlobalTheme || !isVideoPlaybackPage(url)) return null
  return settings.value.videoPageTheme
}

export function hasVideoPageThemeOverride(url: string = location.href): boolean {
  return resolveVideoPageThemeOverride(url) !== null
}

export function isVideoPageGlassStyleEnabled(url: string = location.href): boolean {
  return settings.value.videoPageGlassStyle && isGlassSupportedPlaybackPage(url)
}

/** 关闭「适应其他页面样式」时，这些视频页专属开关仍需要 bewly-design 样式。 */
function isVideoPageDesignEnabled(url: string = location.href): boolean {
  return resolveVideoPageThemeOverride(url) === 'dark' || isVideoPageGlassStyleEnabled(url)
}

export function applyBewlyDesignClasses(
  doc: Document = document,
  url: string = location.href,
): boolean {
  const festivalPage = isFestivalPageUrl(url)
  const shouldApply = settings.value.adaptToOtherPageStyles
    ? !festivalPage
    : isVideoPageDesignEnabled(url)
  const shouldApplyVideoDarkOnly =
    !settings.value.adaptToOtherPageStyles && isVideoPageDesignEnabled(url)
  const glassEnabled = isVideoPageGlassStyleEnabled(url)
  const glassOverlayEnabled = glassEnabled && settings.value.videoPageGlassStyleOverlay

  const root = doc.documentElement
  root.classList.toggle('bewly-design', shouldApply)
  root.classList.toggle('bewly-video-dark-only', shouldApplyVideoDarkOnly)
  root.classList.toggle('bewly-video-glass', glassEnabled)
  root.classList.toggle('bewly-video-glass-overlay', glassOverlayEnabled)
  root.classList.toggle('rounded-video-player', settings.value.roundedVideoPlayer && !festivalPage)

  return shouldApply
}
