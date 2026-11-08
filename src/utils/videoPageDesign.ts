import { settings } from '~/logic'
import { isStandardVideoPage, isVideoPlaybackPage } from '~/utils/main'

export function isVideoPageGlassStyleEnabled(url: string = location.href): boolean {
  return settings.value.videoPageGlassStyle && isStandardVideoPage(url)
}

/** 关闭「适应其他页面样式」时，这些视频页专属开关仍需要 bewly-design 样式。 */
export function isVideoPageDesignEnabled(url: string = location.href): boolean {
  return (settings.value.videoPageDarkMode && isVideoPlaybackPage(url))
    || isVideoPageGlassStyleEnabled(url)
}
