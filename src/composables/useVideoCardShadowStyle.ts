import { computed } from 'vue'

import { settings } from '~/logic'

/**
 * Global composable for video card shadow styles
 * Computes shadow gradient once and applies via CSS variables
 * This avoids per-card computation overhead when rendering many cards
 */
export function useVideoCardShadowStyle() {
  const shadowGradient = computed(() => {
    const points = settings.value.videoCardShadowCurve
    if (!points || points.length === 0)
      return undefined

    const stops = [...points]
      .sort((a, b) => a.position - b.position)
      .map(p => `rgba(0, 0, 0, ${p.opacity / 100}) ${p.position}%`)
      .join(', ')
    return `linear-gradient(to top, ${stops})`
  })

  const shadowHeight = computed(() => {
    const height = settings.value.videoCardShadowHeight
    // When height is 0, return '0' to hide the shadow completely
    if (height === 0)
      return '0'
    // Return the full calc expression, matching original behavior
    return height !== undefined ? `calc(${height} * 100%)` : undefined
  })

  const shadowStyleVars = computed(() => {
    const style: Record<string, string> = {}

    // Always set height if defined (including 0)
    if (shadowHeight.value !== undefined)
      style['--bew-video-card-shadow-height-multiplier'] = shadowHeight.value

    // Only set gradient if height is not 0
    if (settings.value.videoCardShadowHeight !== 0 && shadowGradient.value)
      style['--bew-video-card-shadow-gradient'] = shadowGradient.value

    return style
  })

  return {
    shadowStyleVars,
  }
}
