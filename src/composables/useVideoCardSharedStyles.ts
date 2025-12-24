/**
 * 视频卡片共享样式计算（单例模式）
 * 避免每个卡片重复计算相同的样式
 */

import { computed } from 'vue'

import { settings } from '~/logic'

// 字体大小映射表（常量，无需重复计算）
const VIDEO_CARD_FONT_SIZE_MAP = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
} as const

// 标题行高常量
const TITLE_LINE_HEIGHT = 1.35

/**
 * 使用视频卡片共享样式
 * 所有卡片使用相同的字体大小，避免重复计算
 */
export function useVideoCardSharedStyles() {
  // 标题字体大小类（全局共享，使用4档预设）
  const titleFontSizeClass = computed(() =>
    VIDEO_CARD_FONT_SIZE_MAP[settings.value.videoCardTitleFontSize] ?? VIDEO_CARD_FONT_SIZE_MAP.base,
  )

  // 标题样式（全局共享）
  const titleStyle = computed((): Record<string, string | number> => {
    return {
      '--bew-title-line-height': TITLE_LINE_HEIGHT.toString(),
    }
  })

  // 作者字体大小类（全局共享）
  const authorFontSizeClass = computed(() =>
    VIDEO_CARD_FONT_SIZE_MAP[settings.value.videoCardAuthorFontSize] ?? VIDEO_CARD_FONT_SIZE_MAP.sm,
  )

  // 元数据字体大小类（全局共享）
  const metaFontSizeClass = computed(() =>
    VIDEO_CARD_FONT_SIZE_MAP[settings.value.videoCardMetaFontSize] ?? VIDEO_CARD_FONT_SIZE_MAP.xs,
  )

  return {
    titleFontSizeClass,
    titleStyle,
    authorFontSizeClass,
    metaFontSizeClass,
  }
}
