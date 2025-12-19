<script lang="ts" setup>
import type { Ref } from 'vue'
import { computed, inject, ref, watch, watchEffect } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import type { VideoCardLayoutSetting } from '~/logic/storage'
import { calcCurrentTime, numFormatter } from '~/utils/dataFormatter'

import VideoCardCover from './components/VideoCardCover.vue'
import VideoCardInfo from './components/VideoCardInfo.vue'
import { useVideoCardLogic } from './composables/useVideoCardLogic'
import type { Video } from './types'
import VideoCardContextMenu from './VideoCardContextMenu/VideoCardContextMenu.vue'

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
  hideAuthor?: boolean
}

const layout = computed((): 'modern' | 'old' => {
  const layoutSetting = settings.value.videoCardLayout as VideoCardLayoutSetting | undefined
  return layoutSetting === 'old' ? 'old' : 'modern'
})

// 数据现在在转换阶段已经完成 HTML 解码，直接使用 props
const logic = useVideoCardLogic(props)
const { mainAppRef } = useBewlyApp()

// inject 父组件提供的卡片宽度（由 VideoCardGrid 计算并 provide）
// 用于基于宽度的响应式显示，避免 CSS Container Query 在特定缩放下的性能问题
const cardWidth = inject<Ref<number>>('videoCardWidth', ref(300))

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
  const width = cardWidth.value

  // 无用户信息模式下，只显示播放量和时长
  if (props.hideAuthor) {
    return {
      view: Boolean(view),
      danmaku: false,
      like: false,
      duration: Boolean(duration),
    }
  }

  // 基于卡片宽度控制显示（替代 CSS Container Query，避免缩放性能问题）
  // 使用滞后阈值防止边界抖动：隐藏时用低阈值，显示时用高阈值
  // 实际断点：点赞 200px，弹幕 160px，播放量 120px
  // 由于 cardWidth 已 round，这里直接比较即可
  return {
    view: Boolean(view) && width > 120,
    danmaku: Boolean(danmaku) && width > 160,
    like: Boolean(like) && width > 200,
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

const primaryTags = computed(() => {
  const video = props.video
  if (!video)
    return []
  const { tag } = video
  if (!tag)
    return []
  if (Array.isArray(tag))
    return tag.filter(Boolean)
  return [tag]
})

// 使用 CSS 变量定义，让浏览器通过 CSS 容器查询自动响应
const coverStatsStyle = computed(() => {
  if (layout.value !== 'modern')
    return {}

  // 所有响应式样式都通过 CSS 容器查询处理，这里只设置基础值
  return {}
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

// Highlight tags calculation - 使用查找表优化性能
const LIKE_RATIO_THRESHOLDS = [
  { view: 1_000_000, ratio: 0.01 },
  { view: 200_000, ratio: 0.025 },
  { view: 100_000, ratio: 0.04 },
  { view: 10_000, ratio: 0.05 },
] as const

const DANMAKU_RATIO_THRESHOLDS = [
  { view: 1_000_000, ratio: 0.001 },
  { view: 200_000, ratio: 0.0025 },
  { view: 100_000, ratio: 0.004 },
  { view: 0, ratio: 0.005 },
] as const

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
    const likeRatio = likeCount / viewCount

    // 使用查找表快速判断是否高赞
    const likeThreshold = LIKE_RATIO_THRESHOLDS.find(t => viewCount >= t.view)
    if (likeThreshold && likeRatio >= likeThreshold.ratio) {
      tags.push('高赞')
    }

    const danmakuCount = stats.danmaku ?? 0
    const danmakuRatio = danmakuCount / viewCount

    // 使用查找表快速判断是否高互动
    const danmakuThreshold = DANMAKU_RATIO_THRESHOLDS.find(t => viewCount >= t.view)
    if (danmakuThreshold && danmakuRatio > danmakuThreshold.ratio) {
      tags.push('高互动')
    }
  }

  const durationTag = props.video ? getDurationHighlight(props.video) : undefined

  if (durationTag)
    tags.push(durationTag)

  // 百万播放标签 - 只有在外部tag没有播放字眼时显示，且优先级最后
  if (viewCount >= 1_000_000) {
    const hasPlayKeyword = primaryTags.value.some(tag => /播放|观看|views?|play/i.test(tag))
    if (!hasPlayKeyword)
      tags.push('百万播放')
  }

  // 如果传入了2个或更多Tag，则不显示推荐tag
  if (primaryTags.value.length >= 2) {
    return []
  }
  else if (primaryTags.value.length > 0) {
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

// 图片加载状态：用于等待图片加载完成后才显示真实内容
const imageLoaded = ref(false)

// Cover 骨架屏状态：只依赖数据骨架屏，让图片能立即开始加载
const coverSkeleton = computed(() => props.skeleton)

// Info 骨架屏状态：数据骨架屏 || 图片未加载完成
const infoSkeleton = computed(() => {
  // 如果是数据骨架屏，直接返回true
  if (props.skeleton)
    return true
  // 如果数据已加载，但图片未加载完成，Info部分继续显示骨架屏
  if (!imageLoaded.value)
    return true
  return false
})

// 监听skeleton prop变化，重置imageLoaded状态
watch(() => props.skeleton, (newVal) => {
  if (newVal) {
    // 变成骨架屏时，重置图片加载状态
    imageLoaded.value = false
  }
})

// 处理图片加载完成
function handleImageLoaded() {
  imageLoaded.value = true
}

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
    class="video-card-container"
    duration-300 ease-in-out
    rounded="$bew-radius"
    :ring="skeleton ? '' : 'hover:8 hover:$bew-fill-2 active:8 active:$bew-fill-3'"
    :bg="skeleton ? '' : 'hover:$bew-fill-2 active:$bew-fill-3'"
    :class="layout === 'modern' ? 'mb-3' : 'mb-4'"
  >
    <div
      class="video-card group"
      w="full"
      rounded="$bew-radius"
    >
      <component
        :is="coverSkeleton ? 'div' : 'ALink'"
        :style="{ display: horizontal ? 'flex' : 'block', gap: horizontal ? '1.5rem' : '0' }"
        v-bind="coverSkeleton ? {} : {
          href: logic.videoUrl.value,
          type: 'videoCard',
          customClickEvent: settings.videoCardLinkOpenMode === 'drawer' || settings.videoCardLinkOpenMode === 'background',
        }"
        v-on="coverSkeleton ? {} : {
          mouseenter: logic.handleMouseEnter,
          mouseleave: logic.handelMouseLeave,
          click: logic.handleClick,
        }"
      >
        <!-- Cover -->
        <div
          :class="horizontal ? 'horizontal-card-cover' : 'vertical-card-cover'"
        >
          <VideoCardCover
            :skeleton="coverSkeleton"
            :video="props.video"
            :layout="layout"
            :horizontal="horizontal"
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
            @image-loaded="handleImageLoaded"
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
          :skeleton="infoSkeleton"
          :video="props.video"
          :layout="layout"
          :horizontal="horizontal || false"
          :video-url="logic.videoUrl.value"
          :more-btn="moreBtn"
          :show-video-options="logic.showVideoOptions.value"
          :title-style="titleStyle"
          :author-font-size-class="authorFontSizeClass"
          :meta-font-size-class="metaFontSizeClass"
          :highlight-tags="highlightTags"
          :hide-author="hideAuthor"
          @more-btn-click="logic.handleMoreBtnClick"
        />
      </component>
    </div>

    <!-- context menu -->
    <Teleport
      v-if="logic.showVideoOptions.value && props.video"
      :to="mainAppRef"
    >
      <VideoCardContextMenu
        :video="{
          ...props.video,
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
/* 优化性能：使用更高效的 containment 策略 */
.video-card-container {
  /* 使用 content-visibility 由父组件 VideoCardGrid 统一控制 */
  /* 这里只设置 contain 限制重排范围 */
  /* 移除 size 以允许内容自动撑开高度，避免高度跳动 */
  contain: layout style;
  min-width: 0;

  /* 防止字体加载导致的layout shift */
  text-rendering: optimizeSpeed;
  /* 防止字体度量变化 */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.horizontal-card-cover {
  --uno: "w-full max-w-400px aspect-video";
}

.vertical-card-cover {
  --uno: "w-full";
}

.bew-title-auto {
  /* 使用固定的响应式字体大小，不使用容器查询单位 */
  font-size: clamp(12px, 2.5vw, 18px);
  line-height: clamp(1.15, 1.35, 1.5);
}

.video-card-title {
  min-height: calc(var(--bew-title-line-height, 1.35) * 2em);
  /* 确保两行高度固定 */
  max-height: calc(var(--bew-title-line-height, 1.35) * 2em);
  overflow: hidden;
}

/* 使用固定样式，不使用容器查询 - 大幅减少滚动时的计算开销 */
:deep(.video-card-stats) {
  --video-card-stats-font-size: 0.75rem;
  --video-card-stats-overlay-scale: 1.4;
  --video-card-stats-icon-size: 0.825rem;
}

/* 使用媒体查询替代容器查询 - 在小屏幕隐藏部分统计信息 */
@media (max-width: 768px) {
  :deep(.cover-stat-like) {
    display: none !important;
  }
}
</style>
