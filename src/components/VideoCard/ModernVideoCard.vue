<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import type { CSSProperties } from 'vue'
import { useToast } from 'vue-toastification'

import Button from '~/components/Button.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { appAuthTokens, settings } from '~/logic'
import type { VideoInfo } from '~/models/video/videoInfo'
import type { VideoPreviewResult } from '~/models/video/videoPreview'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getTvSign, TVAppKey } from '~/utils/authProvider'
import { calcCurrentTime, calcTimeSince, numFormatter, parseStatNumber } from '~/utils/dataFormatter'
import { getCSRF, removeHttpFromUrl } from '~/utils/main'
import { openLinkInBackground } from '~/utils/tabs'

import Tooltip from '../Tooltip.vue'
import type { Video } from './types'
import { getCurrentTime, getCurrentVideoUrl } from './utils'
import VideoCardAuthorAvatar from './VideoCardAuthor/components/VideoCardAuthorAvatar.vue'
import VideoCardAuthorName from './VideoCardAuthor/components/VideoCardAuthorName.vue'
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
  /** rcmd: recommend video; appRcmd: app recommend video; bangumi: bangumi video; common: common video */
  type?: 'rcmd' | 'appRcmd' | 'bangumi' | 'common'
  showWatcherLater?: boolean
  horizontal?: boolean
  showPreview?: boolean
  moreBtn?: boolean
}

const toast = useToast()
const { mainAppRef, openIframeDrawer } = useBewlyApp()
const topBarStore = useTopBarStore()

const showVideoOptions = ref<boolean>(false)
const videoOptionsFloatingStyles = ref<CSSProperties>({})
// Whether the user has marked it as disliked
const removed = ref<boolean>(false)

const moreBtnRef = ref<HTMLDivElement | null>(null)
const contextMenuRef = ref<HTMLDivElement | null>(null)

const selectedDislikeOpt = ref<{ dislikeReasonId: number }>()

const videoCurrentTime = ref<number | null>(null)

const videoUrl = computed(() => {
  if (removed.value || !props.video)
    return undefined

  let url = ''
  if (props.video.url)
    url = props.video.url
  else if (props.video.bvid || props.video.aid)
    url = getCurrentVideoUrl(props.video, videoCurrentTime)
  else if (props.video.epid)
    url = `https://www.bilibili.com/bangumi/play/ep${props.video.epid}/`
  else if (props.video.roomid)
    url = `https://live.bilibili.com/${props.video.roomid}/`
  else
    return ''

  try {
    const urlObj = new URL(url)
    if (!urlObj.pathname.endsWith('/')) {
      urlObj.pathname += '/'
    }
    return urlObj.toString()
  }
  catch {
    return url
  }
})

const isInWatchLater = ref<boolean>(false)
const isHover = ref<boolean>(false)
const mouseEnterTimeOut = ref<ReturnType<typeof setTimeout> | null>(null)
const previewVideoUrl = ref<string>('')
const contentVisibility = ref<'auto' | 'visible'>('auto')
const videoElement = ref<HTMLVideoElement | null>(null)

// Track actual card width for better auto title sizing
const cardRootRef = ref<HTMLElement | null>(null)
let cardResizeObserver: ResizeObserver | null = null
const cardWidth = ref<number>(0)

const videoStatNumbers = computed(() => {
  if (!props.video) {
    return {
      view: undefined,
      danmaku: undefined,
      like: undefined,
    }
  }

  const { view, viewStr, danmaku, danmakuStr, like, likeStr } = props.video

  return {
    view: parseStatNumber(view ?? viewStr),
    danmaku: parseStatNumber(danmaku ?? danmakuStr),
    like: parseStatNumber(like ?? likeStr),
  }
})

const coverStatValues = computed(() => {
  if (!props.video) {
    return {
      view: '',
      danmaku: '',
      like: '',
      duration: '',
    }
  }

  const stats = videoStatNumbers.value

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
  const visibility = coverStatsVisibility.value
  const values = coverStatValues.value

  return (
    (visibility.view && values.view)
    || (visibility.danmaku && values.danmaku)
    || (visibility.like && values.like)
    || (visibility.duration && values.duration)
  )
})

const shouldHideCoverStats = computed(() => props.showPreview && settings.value.enableVideoPreview && isHover.value && previewVideoUrl.value && topBarStore.isLogin)

const COVER_STATS_BASE_FONT_REM = 0.75
const COVER_STATS_MIN_FONT_REM = 0.68
const COVER_STATS_MAX_FONT_REM = 0.82
const COVER_STATS_MIN_OVERLAY_SCALE = 1.25
const COVER_STATS_MAX_OVERLAY_SCALE = 1.6
const COVER_STATS_MIN_WIDTH = 180
const COVER_STATS_MAX_WIDTH = 360

const coverStatsStyle = computed(() => {
  const width = cardWidth.value
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

const statSuffixPattern = /(播放量?|观看|弹幕|点赞|views?|likes?|danmakus?|comments?|回复|人气|转发|分享|[次条人])/gi
const statSeparatorPattern = /[•·]/g

const DEFAULT_TITLE_LINE_HEIGHT = 1.35
const CUSTOM_TITLE_LINE_HEIGHT = 1.25

const titleStyle = computed(() => {
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

const highlightTags = computed(() => {
  if (!props.video)
    return [] as string[]

  // 如果设置为不显示推荐标签，则不显示插件计算的标签
  if (!settings.value.showVideoCardRecommendTag)
    return [] as string[]

  const tags: string[] = []
  const stats = videoStatNumbers.value
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

const VIDEO_CARD_FONT_SIZE_MAP = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
} as const

const authorFontSizeClass = computed(() => VIDEO_CARD_FONT_SIZE_MAP[settings.value.videoCardAuthorFontSize] ?? VIDEO_CARD_FONT_SIZE_MAP.sm)
const metaFontSizeClass = computed(() => VIDEO_CARD_FONT_SIZE_MAP[settings.value.videoCardMetaFontSize] ?? VIDEO_CARD_FONT_SIZE_MAP.xs)

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

onMounted(() => {
  const el = cardRootRef.value
  if (!el)
    return
  const initialRect = el.getBoundingClientRect()
  if (initialRect.width) {
    const width = Math.round(initialRect.width)
    cardWidth.value = width
    el.style.setProperty('--bew-card-width', `${width}px`)
  }
  cardResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width
      el.style.setProperty('--bew-card-width', `${Math.round(width)}px`)
      cardWidth.value = Math.round(width)
    }
  })
  cardResizeObserver.observe(el)
})

onBeforeUnmount(() => {
  cardResizeObserver?.disconnect()
  cardResizeObserver = null
})

watch(() => isHover.value, async (newValue) => {
  if (!props.video || !newValue)
    return

  if (props.showPreview && settings.value.enableVideoPreview
    && !previewVideoUrl.value && (props.video.aid || props.video.bvid)) {
    // 检查登录状态，未登录不允许视频预览
    if (!topBarStore.isLogin)
      return

    let cid = props.video.cid
    if (!cid) {
      try {
        const res: VideoInfo = await api.video.getVideoInfo({
          bvid: props.video.bvid,
        })
        if (res.code === 0)
          cid = res.data.cid
      }
      catch {

      }
    }
    api.video.getVideoPreview({
      bvid: props.video.bvid,
      cid,
    }).then((res: VideoPreviewResult) => {
      if (res.code === 0 && res.data.durl && res.data.durl.length > 0)
        previewVideoUrl.value = res.data.durl[0].url
    })
  }
})

function toggleWatchLater() {
  if (!props.video)
    return

  if (!isInWatchLater.value) {
    const params: { bvid?: string, aid?: number, csrf: string } = {
      csrf: getCSRF(),
    }

    // 优先使用bvid，如果没有则使用aid
    if (props.video.bvid) {
      params.bvid = props.video.bvid
    }
    else {
      params.aid = props.video.id
    }

    api.watchlater.saveToWatchLater(params)
      .then((res) => {
        if (res.code === 0) {
          isInWatchLater.value = true
          // 延时1秒后获取稍后再看列表（add成功后居然不是立即生效的）
          setTimeout(() => {
            topBarStore.getAllWatchLaterList()
          }, 1000)
        }
        else {
          toast.error(res.message)
        }
      })
  }
  else {
    api.watchlater.removeFromWatchLater({
      aid: props.video.id,
      csrf: getCSRF(),
    })
      .then((res) => {
        if (res.code === 0) {
          isInWatchLater.value = false
          // 延时1秒后获取稍后再看列表（add成功后居然不是立即生效的）
          setTimeout(() => {
            topBarStore.getAllWatchLaterList()
          }, 1000)
        }
        else {
          toast.error(res.message)
        }
      })
  }
}

function handleMouseEnter() {
  // fix #789
  contentVisibility.value = 'visible'
  if (mouseEnterTimeOut.value)
    clearTimeout(mouseEnterTimeOut.value)
  const delay = settings.value.hoverVideoCardDelayed ? 1200 : 500
  mouseEnterTimeOut.value = setTimeout(() => {
    mouseEnterTimeOut.value = null
    isHover.value = true
  }, delay)
}

function handelMouseLeave() {
  contentVisibility.value = 'auto'
  isHover.value = false
  if (mouseEnterTimeOut.value) {
    clearTimeout(mouseEnterTimeOut.value)
    mouseEnterTimeOut.value = null
  }
}

function handleClick(event: MouseEvent) {
  videoCurrentTime.value = getCurrentTime(videoElement)
  if (settings.value.videoCardLinkOpenMode === 'background' && videoUrl.value && !event.ctrlKey && !event.metaKey) {
    event.preventDefault()
    openLinkInBackground(videoUrl.value)
  }
  if (settings.value.videoCardLinkOpenMode === 'drawer' && videoUrl.value && !event.ctrlKey && !event.metaKey) {
    event.preventDefault()
    openIframeDrawer(videoUrl.value)
  }
}

function handleMoreBtnClick(event: MouseEvent) {
  // the distance between the bottom and the height of the more button
  if (!moreBtnRef.value)
    return
  const { height } = moreBtnRef.value.getBoundingClientRect()

  /**
   * 计算菜单位置，确保在视口内可见
   * 如果底部空间不足，则向上偏移，但不超出顶部
   */
  const menuHeight = Math.min(406, window.innerHeight * 0.8) // 菜单最大高度为视口的80%或406px
  const topSpace = event.y
  const bottomSpace = window.innerHeight - event.y

  // 如果底部空间足够，则向下展开；否则向上展开
  const offsetTop = bottomSpace > menuHeight ? 0 : -menuHeight - height

  // 确保不会超出顶部
  const finalOffsetTop = Math.max(offsetTop, -topSpace + 10)

  showVideoOptions.value = false
  videoOptionsFloatingStyles.value = {
    position: 'absolute',
    top: 0,
    left: 0,
    transform: `translate(${event.x}px, ${event.y + finalOffsetTop}px)`,
  }
  showVideoOptions.value = true
}

function handleUndo() {
  if (props.type === 'appRcmd') {
    const params = {
      access_key: appAuthTokens.value.accessToken,
      goto: props.video?.goto,
      id: props.video?.id,
      // https://github.com/magicdawn/bilibili-app-recommend/blob/cb51f75f415f48235ce048537f2013122c16b56b/src/components/VideoCard/card.service.ts#L115
      idx: Number((Date.now() / 1000).toFixed(0)),
      reason_id: selectedDislikeOpt.value?.dislikeReasonId, // 1 means dislike, e.g. {"id": 1, "name": "不感兴趣","toast": "将减少相似内容推荐"}
      build: 74800100,
      device: 'pad',
      mobi_app: 'iphone',
      appkey: TVAppKey.appkey,
    }

    api.video.undoDislikeVideo({
      ...params,
      sign: getTvSign(params),
    }).then((res) => {
      if (res.code === 0) {
        removed.value = false
      }
      else {
        toast.error(res.message)
      }
    })
  }
  else {
    removed.value = false
  }
}

function handleRemoved(selectedOpt?: { dislikeReasonId: number }) {
  selectedDislikeOpt.value = selectedOpt
  removed.value = true
}

provide('getVideoType', () => props.type!)

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
</script>

<template>
  <div
    ref="cardRootRef"
    :style="{ contentVisibility }"
    duration-300 ease-in-out
    rounded="$bew-radius"
    ring="hover:8 hover:$bew-fill-2 active:8 active:$bew-fill-3"
    bg="hover:$bew-fill-2 active:$bew-fill-3"
    transform="~ translate-z-0"
    mb-3
  >
    <div v-if="!skeleton && video">
      <div
        class="video-card group"
        w="full"
        rounded="$bew-radius"
      >
        <ALink
          :style="{ display: horizontal ? 'flex' : 'block', gap: horizontal ? '1.5rem' : '0' }"
          :href="videoUrl"
          type="videoCard"
          :custom-click-event="settings.videoCardLinkOpenMode === 'drawer' || settings.videoCardLinkOpenMode === 'background'"
          @mouseenter="handleMouseEnter"
          @mouseleave="handelMouseLeave"
          @click="handleClick"
        >
          <!-- Cover -->
          <div
            class="group/cover"
            :class="horizontal ? 'horizontal-card-cover' : 'vertical-card-cover'"
            shrink-0
            h-fit relative bg="$bew-skeleton" rounded="$bew-radius" overflow-hidden
            cursor-pointer
            group-hover:z-2
            transform="~ translate-z-0"
          >
            <!-- Video cover -->
            <Picture
              :src="`${removeHttpFromUrl(video.cover)}@672w_378h_1c_!web-home-common-cover`"
              loading="eager"
              w="full" max-w-full align-middle aspect-video object-cover
              rounded="$bew-radius"
            />

            <div
              v-if="removed"
              pos="absolute top-0 left-0" w-full h-fit aspect-video flex="~ col gap-2 items-center justify-center"
              bg="$bew-fill-4" backdrop-blur-20px mix-blend-luminosity rounded="$bew-radius" z-2
            >
              <p mb-2 color-white text-lg>
                {{ $t('video_card.video_removed') }}
              </p>
              <Button
                color="rgba(255,255,255,.35)" text-color="white" size="small"
                @click.prevent.stop="handleUndo"
              >
                <template #left>
                  <div i-mingcute-back-line text-lg />
                </template>
                {{ $t('common.undo') }}
              </Button>
            </div>

            <!-- Video preview -->
            <Transition v-if="!removed && showPreview && settings.enableVideoPreview" name="fade">
              <video
                v-if="previewVideoUrl && isHover"
                ref="videoElement"
                autoplay muted
                :controls="settings.enableVideoCtrlBarOnVideoCard"
                :style="{ pointerEvents: settings.enableVideoCtrlBarOnVideoCard ? 'auto' : 'none' }"
                pos="absolute top-0 left-0" w-full aspect-video rounded="$bew-radius" bg-black
                @mouseenter="handleMouseEnter"
              >
                <source :src="previewVideoUrl" type="video/mp4">
              </video>
            </Transition>

            <!-- Ranking Number -->
            <div
              v-if="video.rank"
              pos="absolute top-0"
              p-2 group-hover:opacity-0
              duration-300
            >
              <div
                v-if="Number(video.rank) <= 3"
                bg="$bew-theme-color" text-center lh-0 h-30px w-30px
                text-white rounded="1/2" shadow="$bew-shadow-1"
                border="1 $bew-theme-color"
                grid="~ place-content-center"
                text="xl" fw-bold
              >
                {{ video.rank }}
              </div>
              <div
                v-else
                bg="$bew-elevated-solid" text-center lh-30px h-30px w-30px
                rounded="1/2" shadow="$bew-shadow-1"
                border="1 $bew-border-color"
              >
                {{ video.rank }}
              </div>
            </div>

            <template v-if="!removed">
              <div
                class="opacity-0 group-hover/cover:opacity-100"
                transform="scale-70 group-hover/cover:scale-100"
                duration-300
                pos="absolute top-0 left-0" z-2
                @click.stop=""
              >
                <slot name="coverTopLeft" />
              </div>

              <div
                v-if="video.liveStatus === 1"
                class="group-hover:opacity-0"
                pos="absolute left-0 top-0" bg="$bew-theme-color" text="xs white" fw-bold
                p="x-2 y-1" m-1 inline-block rounded="$bew-radius" duration-300
              >
                LIVE
                <i i-svg-spinners:pulse-3 align-middle mt--0.2em />
              </div>

              <div
                v-if="video.badge && Object.keys(video.badge).length > 0"
                class="group-hover:opacity-0"
                :style="{
                  backgroundColor: video.badge.bgColor,
                  color: video.badge.color,
                }"
                pos="absolute right-0 top-0" bg="$bew-theme-color" text="xs white"
                p="x-2 y-1" m-1 inline-block rounded="$bew-radius" duration-300
              >
                {{ video.badge.text }}
              </div>

              <!-- Watcher later button -->
              <button
                v-if="showWatcherLater"
                pos="absolute top-0 right-0" z="2"
                p="x-2 y-1" m="1"
                rounded="$bew-radius"
                text="!white xl"
                bg="black opacity-60"
                class="opacity-0 group-hover/cover:opacity-100"
                transform="scale-70 group-hover/cover:scale-100"
                duration-300
                @click.prevent.stop="toggleWatchLater"
              >
                <Tooltip v-if="!isInWatchLater" :content="$t('common.save_to_watch_later')" placement="bottom-right" type="dark">
                  <div i-mingcute:carplay-line />
                </Tooltip>
                <Tooltip v-else :content="$t('common.added')" placement="bottom-right" type="dark">
                  <Icon icon="line-md:confirm" />
                </Tooltip>
              </button>

              <div
                v-if="hasCoverStats"
                class="video-card-cover-stats"
                :class="{ 'video-card-cover-stats--hidden': shouldHideCoverStats }"
                :style="coverStatsStyle"
              >
                <div class="video-card-cover-stats__items">
                  <span
                    v-if="coverStatsVisibility.view"
                    class="video-card-cover-stats__item"
                  >
                    <Icon icon="mingcute:play-circle-line" class="video-card-cover-stats__icon" aria-hidden="true" />
                    <span class="video-card-cover-stats__value">{{ coverStatValues.view }}</span>
                  </span>

                  <span
                    v-if="coverStatsVisibility.danmaku"
                    class="video-card-cover-stats__item"
                  >
                    <Icon icon="mingcute:danmaku-line" class="video-card-cover-stats__icon" aria-hidden="true" />
                    <span class="video-card-cover-stats__value">{{ coverStatValues.danmaku }}</span>
                  </span>

                  <span
                    v-if="coverStatsVisibility.like"
                    class="video-card-cover-stats__item"
                  >
                    <Icon icon="mingcute:thumb-up-2-line" class="video-card-cover-stats__icon" aria-hidden="true" />
                    <span class="video-card-cover-stats__value">{{ coverStatValues.like }}</span>
                  </span>
                </div>

                <span
                  v-if="coverStatsVisibility.duration"
                  class="video-card-cover-stats__item video-card-cover-stats__item--duration"
                >
                  <span class="video-card-cover-stats__value">{{ coverStatValues.duration }}</span>
                </span>
              </div>
            </template>
          </div>

          <!-- Other Information -->
          <div
            v-if="!removed"
            :style="{
              width: horizontal ? '100%' : 'unset',
              marginTop: horizontal ? '0' : '0.5rem',
            }"
            flex="~"
          >
            <div class="group/desc" flex="~ col gap-2" w="full" align="items-start">
              <div flex="~ gap-1 justify-between items-start" w="full" pos="relative">
                <h3
                  class="keep-two-lines video-card-title"
                  text="overflow-ellipsis $bew-text-1 lg"
                  :class="{ 'bew-title-auto': settings.homeAdaptiveTitleAutoSize }"
                  :style="titleStyle"
                  cursor="pointer"
                >
                  <a :href="videoUrl" target="_blank" :title="video.title">
                    {{ video.title }}
                  </a>
                </h3>

                <div
                  v-if="moreBtn"
                  ref="moreBtnRef"
                  class="video-card__more-btn"
                  :class="{ 'more-active': showVideoOptions }"
                  bg="hover:$bew-fill-2 active:$bew-fill-3"
                  shrink-0 w-32px h-32px m="t--3px r--4px"
                  grid place-items-center cursor-pointer rounded="full" overflow="hidden"
                  duration-300
                  @click.stop.prevent="handleMoreBtnClick"
                >
                  <div i-mingcute:more-2-line text="lg" />
                </div>
              </div>

              <div
                class="video-card-meta"
                flex="~ gap-2 items-center"
                w="full"
              >
                <VideoCardAuthorAvatar
                  v-if="video.author"
                  :author="video.author"
                  :is-live="video.liveStatus === 1"
                  compact
                />

                <div flex="~ col gap-1" w="full">
                  <div
                    v-if="video.author"
                    flex="~ items-center gap-2"
                    text="$bew-text-2"
                    :class="authorFontSizeClass"
                  >
                    <VideoCardAuthorName :author="video.author" />
                  </div>

                  <div
                    v-if="video.tag || highlightTags.length || video.publishedTimestamp || video.capsuleText || video.type === 'vertical' || video.type === 'bangumi'"
                    flex="~ items-center gap-2 wrap"
                    :class="metaFontSizeClass"
                  >
                    <span
                      v-if="video.tag"
                      class="video-card-meta__chip"
                      text="$bew-theme-color"
                      p="x-2"
                      lh-6
                      rounded="$bew-radius"
                      bg="$bew-theme-color-20"
                    >
                      {{ video.tag }}
                    </span>

                    <span
                      v-for="extraTag in highlightTags"
                      :key="`highlight-${extraTag}`"
                      class="video-card-meta__chip"
                      text="$bew-theme-color"
                      p="x-2"
                      lh-6
                      rounded="$bew-radius"
                      bg="$bew-theme-color-20"
                    >
                      {{ extraTag }}
                    </span>

                    <span
                      v-if="video.publishedTimestamp || video.capsuleText"
                      class="video-card-meta__chip"
                      bg="$bew-fill-1"
                      p="x-2"
                      lh-6
                      rounded="$bew-radius"
                      text="$bew-text-3"
                    >
                      {{ video.publishedTimestamp ? calcTimeSince(video.publishedTimestamp * 1000) : video.capsuleText?.trim() }}
                    </span>

                    <span
                      v-if="video.type === 'vertical' || video.type === 'bangumi'"
                      text="$bew-text-2"
                      grid="~ place-items-center"
                    >
                      <div v-if="video.type === 'vertical'" i-mingcute:cellphone-2-line />
                      <div v-else-if="video.type === 'bangumi'" i-mingcute:movie-line />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
      v-if="showVideoOptions && video"
      :to="mainAppRef"
    >
      <VideoCardContextMenu
        ref="contextMenuRef"
        :video="{
          ...video,
          url: videoUrl,
        }"
        :context-menu-styles="videoOptionsFloatingStyles"
        @close="showVideoOptions = false"
        @removed="handleRemoved"
      />
      <!-- @reopen="handleMoreBtnClick" -->
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

.video-card__more-btn {
  position: relative;
  border-radius: 50%;
  overflow: hidden;
}

.video-card__more-btn::before,
.video-card__more-btn::after {
  border-radius: inherit;
}

.more-active {
  --uno: "opacity-100";
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

.video-card-cover-stats {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.4rem;
  padding: calc(var(--video-card-stats-font-size, 0.75rem) * 0.55)
    calc(var(--video-card-stats-font-size, 0.75rem) * 0.6) calc(var(--video-card-stats-font-size, 0.75rem) * 0.45);
  color: #fff;
  font-size: var(--video-card-stats-font-size, 0.75rem);
  opacity: 1;
  transition: opacity 0.2s ease;
  pointer-events: none;
  border-radius: inherit;
}

.video-card-cover-stats::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.8) 0%,
    rgba(0, 0, 0, 0.7) 30%,
    rgba(0, 0, 0, 0.5) 50%,
    rgba(0, 0, 0, 0.3) 70%,
    rgba(0, 0, 0, 0.15) 85%,
    rgba(0, 0, 0, 0.05) 95%,
    transparent 100%
  );
  height: calc(var(--video-card-stats-overlay-scale, 1.4) * 100%);
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
  pointer-events: none;
}

.video-card-cover-stats > * {
  position: relative;
  z-index: 1;
}

.video-card-cover-stats__items {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
  flex-wrap: nowrap;
  flex-shrink: 1;
}

.video-card-cover-stats__item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
  flex-shrink: 0;
}

.video-card-cover-stats__icon {
  font-size: var(--video-card-stats-icon-size, calc(var(--video-card-stats-font-size, 0.75rem) * 1.1));
  color: currentColor;
}

.video-card-cover-stats__value {
  font-size: var(--video-card-stats-font-size, 0.75rem);
  line-height: 1;
}

.video-card-cover-stats__item--duration {
  margin-left: auto;
  font-size: var(--video-card-stats-font-size, 0.75rem);
}

.video-card-cover-stats--hidden {
  opacity: 0;
  visibility: hidden;
}

.video-card-meta__chip {
  display: inline-flex;
  align-items: center;
  font-size: inherit;
  line-height: inherit;
  padding-block: calc(var(--bew-base-font-size) * 0.12);
}
</style>
