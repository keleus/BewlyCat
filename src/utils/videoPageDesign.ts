import { settings } from '~/logic'
import { isGlassSupportedPlaybackPage, isVideoPlaybackPage } from '~/utils/main'

function isFestivalPage(url: string = location.href): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(url)
}

export function isVideoPageGlassStyleEnabled(url: string = location.href): boolean {
  return settings.value.videoPageGlassStyle && isGlassSupportedPlaybackPage(url)
}

/** 关闭「适应其他页面样式」时，这些视频页专属开关仍需要 bewly-design 样式。 */
function isVideoPageDesignEnabled(url: string = location.href): boolean {
  return (settings.value.videoPageDarkMode && isVideoPlaybackPage(url))
    || isVideoPageGlassStyleEnabled(url)
}

export function applyBewlyDesignClasses(doc: Document = document, url: string = location.href): boolean {
  const festivalPage = isFestivalPage(url)
  const shouldApply = settings.value.adaptToOtherPageStyles
    ? !festivalPage
    : isVideoPageDesignEnabled(url)
  const shouldApplyVideoDarkOnly = !settings.value.adaptToOtherPageStyles
    && isVideoPageDesignEnabled(url)
  const glassEnabled = isVideoPageGlassStyleEnabled(url)

  const root = doc.documentElement
  root.classList.toggle('bewly-design', shouldApply)
  root.classList.toggle('bewly-video-dark-only', shouldApplyVideoDarkOnly)
  root.classList.toggle('bewly-video-glass', glassEnabled)
  root.classList.toggle('rounded-video-player', settings.value.roundedVideoPlayer && !festivalPage)

  return shouldApply
}
