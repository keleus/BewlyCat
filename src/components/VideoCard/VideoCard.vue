<script lang="ts" setup>
import { settings } from '~/logic'
import type { VideoCardLayoutSetting } from '~/logic/storage'
import { calcCurrentTime, numFormatter } from '~/utils/dataFormatter'

import VideoCardCover from './components/VideoCardCover.vue'
import VideoCardInfo from './components/VideoCardInfo.vue'
import { useVideoCardLogic } from './composables/useVideoCardLogic'
import type { Video } from './types'
import VideoCardContextMenu from './VideoCardContextMenu/VideoCardContextMenu.vue'
import VideoCardSkeleton from './VideoCardSkeleton.vue'

const props = withDefaults(defineProps<Props>(), {
  showWatcherLater: true,
  type: 'common',
  moreBtn: true,
})

interface Props {
  skeleton?: boolean
  video?: Video
  type?: 'rcmd' | 'appRcmd' | 'bangumi' | 'common'
  showWatcherLater?: boolean
  horizontal?: boolean
  showPreview?: boolean
  moreBtn?: boolean
}

const layout = computed((): 'modern' | 'old' => {
  const layoutSetting = settings.value.videoCardLayout as VideoCardLayoutSetting | undefined
  return layoutSetting === 'old' ? 'old' : 'modern'
})

const logic = useVideoCardLogic(props)

// Modern layout specific: cover stats calculation
const statSuffixPattern = /(播放量?|观看|弹幕|点赞|views?|likes?|danmakus?|comments?|回复|人气|转发|分享|[次条人])/gi
const statSeparatorPattern = /[•·]/g

function formatStatValue(count?: number, countStr?: string) {
  if (typeof count === 'number')
    return numFormatter(count).trim()
  if (!countStr)
    return ''
  const sanitized = countStr
    .replace(statSuffixPattern, '')
    .replace(statSeparatorPattern, '')
    .replace(/\s+/g, ' ')
    .trim()
  return sanitized || countStr.trim()
}

const coverStatValues = computed(() => {
  if (!props.video || layout.value !== 'modern') {
    return {
      view: '',
      danmaku: '',
      like: '',
      duration: '',
    }
  }

  const stats = logic.videoStatNumbers.value

  return {
    view: formatStatValue(stats.view, props.video.viewStr),
    danmaku: formatStatValue(stats.danmaku, props.video.danmakuStr),
    like: formatStatValue(stats.like, props.video.likeStr),
    duration: props.video.duration
      ? calcCurrentTime(props.video.duration)
      : props.video.durationStr ?? '',
  }
})

const coverStatsVisibility = computed(() => {
  const { view, danmaku, like, duration } = coverStatValues.value
  const width = logic.cardWidth.value

  let showDanmaku = Boolean(danmaku)
  let showLike = Boolean(like)

  if (width && width < 240)
    showLike = false
  if (width && width < 210)
    showDanmaku = false

  return {
    view: Boolean(view),
    danmaku: showDanmaku,
    like: showLike,
    duration: Boolean(duration),
  }
})

const hasCoverStats = computed(() => {
  if (layout.value !== 'modern')
    return false

  const visibility = coverStatsVisibility.value
  const values = coverStatValues.value

  return (
    (visibility.view && values.view)
    || (visibility.danmaku && values.danmaku)
    || (visibility.like && values.like)
    || (visibility.duration && values.duration)
  )
})

const shouldHideCoverStats = computed(() =>
  props.showPreview
  && settings.value.enableVideoPreview
  && logic.isHover.value
  && logic.previewVideoUrl.value
  && logic.shouldHideOverlayElements.value,
)

const COVER_STATS_BASE_FONT_REM = 0.75
const COVER_STATS_MIN_FONT_REM = 0.68
const COVER_STATS_MAX_FONT_REM = 0.82
const COVER_STATS_MIN_OVERLAY_SCALE = 1.25
const COVER_STATS_MAX_OVERLAY_SCALE = 1.6
const COVER_STATS_MIN_WIDTH = 180
const COVER_STATS_MAX_WIDTH = 360

function clampWidth(value: number) {
  return Math.min(Math.max(value, COVER_STATS_MIN_WIDTH), COVER_STATS_MAX_WIDTH)
}

function interpolate(start: number, end: number, factor: number) {
  const clampedFactor = Math.min(Math.max(factor, 0), 1)
  return start + (end - start) * clampedFactor
}

function roundToDecimals(value: number, decimals = 3) {
  const multiplier = 10 ** decimals
  return Math.round(value * multiplier) / multiplier
}

const coverStatsStyle = computed(() => {
  if (layout.value !== 'modern')
    return {}

  const width = logic.cardWidth.value
  if (!width) {
    return {
      '--video-card-stats-font-size': `${COVER_STATS_BASE_FONT_REM}rem`,
      '--video-card-stats-overlay-scale': COVER_STATS_MIN_OVERLAY_SCALE.toString(),
      '--video-card-stats-icon-size': `${roundToDecimals(COVER_STATS_BASE_FONT_REM * 1.1)}rem`,
    }
  }

  const clampedWidth = clampWidth(width)
  const interpolation = (clampedWidth - COVER_STATS_MIN_WIDTH) / (COVER_STATS_MAX_WIDTH - COVER_STATS_MIN_WIDTH)
  const fontSizeRem = interpolate(COVER_STATS_MIN_FONT_REM, COVER_STATS_MAX_FONT_REM, interpolation)
  const overlayScale = interpolate(COVER_STATS_MIN_OVERLAY_SCALE, COVER_STATS_MAX_OVERLAY_SCALE, interpolation)
  const iconSizeRem = roundToDecimals(fontSizeRem * 1.1)

  return {
    '--video-card-stats-font-size': `${roundToDecimals(fontSizeRem)}rem`,
    '--video-card-stats-overlay-scale': roundToDecimals(overlayScale).toString(),
    '--video-card-stats-icon-size': `${iconSizeRem}rem`,
  }
})

// Title and text sizing
const DEFAULT_TITLE_LINE_HEIGHT = 1.35
const CUSTOM_TITLE_LINE_HEIGHT = 1.25

const titleStyle = computed((): Record<string, string | number> => {
  const { homeAdaptiveTitleAutoSize, homeAdaptiveTitleFontSize } = settings.value

  if (!homeAdaptiveTitleAutoSize && homeAdaptiveTitleFontSize) {
    return {
      fontSize: `${homeAdaptiveTitleFontSize}px`,
      lineHeight: CUSTOM_TITLE_LINE_HEIGHT.toString(),
      '--bew-title-line-height': CUSTOM_TITLE_LINE_HEIGHT.toString(),
    }
  }

  return {
    '--bew-title-line-height': DEFAULT_TITLE_LINE_HEIGHT.toString(),
  }
})

// Highlight tags calculation
const highlightTags = computed(() => {
  if (!props.video)
    return [] as string[]

  // 如果设置为不显示推荐标签，则不显示插件计算的标签
  if (!settings.value.showVideoCardRecommendTag)
    return [] as string[]

  const tags: string[] = []
  const stats = logic.videoStatNumbers.value
  const viewCount = stats.view ?? 0

  if (viewCount <= 0)
    return tags

  if (viewCount >= 10_000) {
    const likeCount = stats.like ?? 0
    const likeRatio = viewCount > 0 ? likeCount / viewCount : 0
    if ((likeRatio >= 0.05)
      || (viewCount >= 100_000 && likeRatio >= 0.04)
      || (viewCount >= 200_000 && likeRatio >= 0.025)
      || (viewCount >= 1_000_000 && likeRatio >= 0.01)) {
      tags.push('高赞')
    }

    const danmakuCount = stats.danmaku ?? 0
    if ((danmakuCount / viewCount > 0.005)
      || (danmakuCount / viewCount > 0.004 && viewCount >= 100_000)
      || (danmakuCount / viewCount > 0.0025 && viewCount >= 200_000)
      || (danmakuCount / viewCount > 0.001 && viewCount >= 1_000_000)) {
      tags.push('高互动')
    }
  }

  const durationTag = getDurationHighlight(props.video)

  if (durationTag)
    tags.push(durationTag)

  // 百万播放标签 - 只有在外部tag没有播放字眼时显示，且优先级最后
  if (viewCount >= 1_000_000) {
    const hasPlayKeyword = props.video.tag && /播放|观看|views?|play/i.test(props.video.tag)
    if (!hasPlayKeyword) {
      tags.push('百万播放')
    }
  }

  if (props.video.tag) {
    // tags只返回一个
    return tags.slice(0, 1)
  }
  else {
    // 最多返回2个，避免越界
    return tags.slice(0, 2)
  }
})

function getDurationHighlight(video: Video) {
  const durationInSeconds = getDurationInSeconds(video)

  if (!durationInSeconds)
    return

  if (durationInSeconds >= 40 * 60)
    return '超长视频'

  if (durationInSeconds >= 20 * 60)
    return '长视频'
}

function getDurationInSeconds(video: Video) {
  const { duration } = video
  if (typeof duration === 'number' && duration > 0)
    return duration

  return parseDurationStr(video.durationStr)
}

function parseDurationStr(durationStr?: string) {
  if (!durationStr)
    return

  const parts = durationStr.split(':').map(part => Number(part))
  if (parts.some(part => Number.isNaN(part)))
    return

  let seconds = 0
  for (const value of parts)
    seconds = seconds * 60 + value

  return seconds
}

const VIDEO_CARD_FONT_SIZE_MAP = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
} as const

const authorFontSizeClass = computed(() => VIDEO_CARD_FONT_SIZE_MAP[settings.value.videoCardAuthorFontSize] ?? VIDEO_CARD_FONT_SIZE_MAP.sm)
const metaFontSizeClass = computed(() => VIDEO_CARD_FONT_SIZE_MAP[settings.value.videoCardMetaFontSize] ?? VIDEO_CARD_FONT_SIZE_MAP.xs)

const coverImageUrl = computed(() =>
  props.video ? `${logic.removeHttpFromUrl(props.video.cover)}@672w_378h_1c_!web-home-common-cover` : '',
)

const infoComponentRef = ref()

// Expose moreBtnRef from child component
watchEffect(() => {
  if (infoComponentRef.value?.moreBtnRef) {
    logic.moreBtnRef.value = infoComponentRef.value.moreBtnRef
  }
})

provide('getVideoType', () => props.type!)
</script>

<template>
  <div
    :ref="(el) => logic.cardRootRef.value = el as HTMLElement"
    :style="{ contentVisibility: logic.contentVisibility.value }"
    duration-300 ease-in-out
    rounded="$bew-radius"
    ring="hover:8 hover:$bew-fill-2 active:8 active:$bew-fill-3"
    bg="hover:$bew-fill-2 active:$bew-fill-3"
    transform="~ translate-z-0"
    will-change-transform
    :class="layout === 'modern' ? 'mb-3' : 'mb-4'"
  >
    <div v-if="!skeleton && video">
      <div
        class="video-card group"
        w="full"
        rounded="$bew-radius"
      >
        <ALink
          :style="{ display: horizontal ? 'flex' : 'block', gap: horizontal ? '1.5rem' : '0' }"
          :href="logic.videoUrl.value"
          type="videoCard"
          :custom-click-event="settings.videoCardLinkOpenMode === 'drawer' || settings.videoCardLinkOpenMode === 'background'"
          @mouseenter="logic.handleMouseEnter"
          @mouseleave="logic.handelMouseLeave"
          @click="logic.handleClick"
        >
          <!-- Cover -->
          <div
            :class="horizontal ? 'horizontal-card-cover' : 'vertical-card-cover'"
          >
            <VideoCardCover
              :video="video"
              :layout="layout"
              :removed="logic.removed.value"
              :is-hover="logic.isHover.value"
              :should-hide-overlay-elements="Boolean(logic.shouldHideOverlayElements.value)"
              :preview-video-url="logic.previewVideoUrl.value || ''"
              :video-element="logic.videoElement.value || null"
              :is-in-watch-later="logic.isInWatchLater.value"
              :show-watcher-later="showWatcherLater"
              :cover-image-url="coverImageUrl"
              :cover-stat-values="coverStatValues"
              :cover-stats-visibility="coverStatsVisibility"
              :has-cover-stats="Boolean(hasCoverStats)"
              :should-hide-cover-stats="Boolean(shouldHideCoverStats)"
              :cover-stats-style="coverStatsStyle as Record<string, string>"
              @toggle-watch-later="logic.toggleWatchLater"
              @undo="logic.handleUndo"
            >
              <template #coverTopLeft>
                <slot name="coverTopLeft" />
              </template>
            </VideoCardCover>
          </div>

          <!-- Other Information -->
          <VideoCardInfo
            v-if="!logic.removed.value"
            ref="infoComponentRef"
            :video="video"
            :layout="layout"
            :horizontal="horizontal || false"
            :video-url="logic.videoUrl.value"
            :more-btn="moreBtn"
            :show-video-options="logic.showVideoOptions.value"
            :title-style="titleStyle"
            :author-font-size-class="authorFontSizeClass"
            :meta-font-size-class="metaFontSizeClass"
            :highlight-tags="highlightTags"
            @more-btn-click="logic.handleMoreBtnClick"
          />
        </ALink>
      </div>
    </div>

    <!-- skeleton -->
    <VideoCardSkeleton
      v-if="skeleton"
      :horizontal="horizontal"
      important-mb-0
    />

    <!-- context menu -->
    <Teleport
      v-if="logic.showVideoOptions.value && video"
      :to="logic.mainAppRef"
    >
      <VideoCardContextMenu
        :ref="(el) => logic.contextMenuRef.value = el as HTMLDivElement"
        :video="{
          ...video,
          url: logic.videoUrl.value,
        }"
        :context-menu-styles="logic.videoOptionsFloatingStyles.value"
        @close="logic.showVideoOptions.value = false"
        @removed="logic.handleRemoved"
      />
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.horizontal-card-cover {
  --uno: "xl:w-280px lg:w-250px md:w-200px w-200px";
}

.vertical-card-cover {
  --uno: "w-full";
}

.bew-title-auto {
  /* Auto scale by actual card width (fallback to base grid width)
     Increase responsiveness and use unitless line-height for better small-size rendering */
  font-size: clamp(12px, calc((var(--bew-card-width, var(--bew-home-card-min-width, 280px)) / 280) * 20px), 30px);
  line-height: clamp(1.15, calc(1.1 + (var(--bew-card-width, var(--bew-home-card-min-width, 280px)) / 280) * 0.2), 1.5);
}

.video-card-title {
  min-height: calc(var(--bew-title-line-height, 1.35) * 2em);
}
</style>
