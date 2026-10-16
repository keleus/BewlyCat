<script setup lang="ts">
import type { ComponentPublicInstance, CSSProperties } from 'vue'
import { computed, nextTick, onBeforeUnmount, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import VideoWatchedTag from '~/components/VideoWatchedTag.vue'
import WatchLaterCoverButton from '~/components/WatchLaterCoverButton.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useUserRelationScope } from '~/composables/useUserRelationScope'
import { settings } from '~/logic'
import { computeFloatingMenuPosition } from '~/utils/floatingMenu'
import { normalizeWatchLaterTarget } from '~/utils/watchLaterActions'

import type { Author, Video } from '../VideoCard/types'
import { createCommentPreview, toggleCommentPreview } from './commentPreview'
import { isMomentLotteryUrl } from './lottery'
import MomentAdditionalCard from './MomentAdditionalCard.vue'
import MomentAuthorHeader from './MomentAuthorHeader.vue'
import MomentCardFooter from './MomentCardFooter.vue'
import MomentComments from './MomentComments.vue'
import MomentContextMenu from './MomentContextMenu.vue'
import MomentDescription from './MomentDescription.vue'
import MomentForwardCard from './MomentForwardCard.vue'
import MomentForwardVideo from './MomentForwardVideo.vue'
import MomentHotComment from './MomentHotComment.vue'
import MomentImageSet from './MomentImageSet.vue'
import MomentMediaCover from './MomentMediaCover.vue'
import MomentRepost from './MomentRepost.vue'
import MomentVideoCard from './MomentVideoCard.vue'
import MomentVote from './MomentVote.vue'
import type { DisplayForwardVideo, DisplayMoment } from './types'
import type { MomentLinkKind } from './utils'
import {
  classifyMomentLink,
  getAuthorSpaceUrl,
  getAvatarThumbnailUrl,
  getCardPreviewText,
  getMomentThumbnailUrl,
  getMomentVideoUrl,
  isCompactPlainTextMoment,
  shouldUseNativeLinkOpen,
} from './utils'

interface Props {
  moment: DisplayMoment
  cardWidth?: number
  imageRatio?: number
  ready?: boolean
  entering?: boolean
  previewActive?: boolean
  previewUrl?: string
  isLikeLoading?: boolean
  isReservationLoading?: boolean
}

const {
  moment,
  cardWidth = 520,
  imageRatio,
  ready = false,
  entering = false,
  previewActive = false,
  previewUrl = '',
  isLikeLoading = false,
  isReservationLoading = false,
} = defineProps<Props>()

const emit = defineEmits<{
  cardElement: [element: HTMLElement | null]
  openLottery: [url: string]
  openDetail: [moment: DisplayMoment, forceDialog?: boolean]
  openMedia: [moment: DisplayMoment]
  openImagePreview: [urls: string[], index: number, trigger: HTMLElement | null]
  mediaEnter: [moment: DisplayMoment]
  mediaLeave: [moment: DisplayMoment]
  coverLoad: [event: Event, momentId: string]
  previewVideo: [element: Element | null, moment: DisplayMoment]
  previewCanplay: [event: Event]
  openLink: [payload: { url: string, kind: MomentLinkKind, video?: DisplayForwardVideo }]
  toggleLike: [moment: DisplayMoment]
  toggleReservation: [moment: DisplayMoment]
  removed: [moment: DisplayMoment]
}>()

const { t } = useI18n()
const { mainAppRef } = useBewlyApp()
// 评论只由当前挂载的卡片持有，离开虚拟窗口后不随动态列表常驻。
const commentPreview = createCommentPreview()
useUserRelationScope(() => [Number(moment.author.mid)])

const cardLayoutStyles = computed<CSSProperties>(() => {
  const scale = Math.max(1, cardWidth / 520)
  return {
    '--moment-card-text-cover-min-height': `${Math.round(176 * scale)}px`,
  } as CSSProperties
})

const authorSpaceUrl = computed(() => getAuthorSpaceUrl(moment.author.mid))
const forwardAuthorSpaceUrl = computed(() => getAuthorSpaceUrl(moment.forward?.authorMid))

// 稍后再看目标在数据边界统一规整：识别不到任何视频 ID 时为 undefined，按钮自然不渲染。
// 注意只能挑 aid/bvid/epid：moment.id 是动态 ID，normalize 会把通用 id 兜底当 aid，直接传整个 moment 会误加入。
const watchLaterTarget = computed(() => normalizeWatchLaterTarget({
  aid: moment.aid,
  bvid: moment.bvid,
  epid: moment.epid,
}))
const descriptionId = computed(() => `moment-card-desc-${moment.id.replace(/[^\w-]/g, '-')}`)
const commentsId = computed(() => `moment-card-comments-${moment.id.replace(/[^\w-]/g, '-')}`)
const repostExpanded = ref(false)
const repostCount = ref(0)
// 本卡片内发表或删除的评论数，列表数据要等下次刷新才会更新。
const commentCountDelta = ref(0)
const footerRef = ref<InstanceType<typeof MomentCardFooter> | null>(null)

// 转发框与评论区互斥：展开其中一个时收起另一个。
function toggleComments() {
  if (!commentPreview.expanded)
    repostExpanded.value = false
  toggleCommentPreview(commentPreview)
}

function toggleRepost() {
  repostExpanded.value = !repostExpanded.value
  if (repostExpanded.value && commentPreview.expanded)
    toggleCommentPreview(commentPreview)
}

// 评论区展开分两阶段：先挂载并在 0fr 收起态加载首屏评论，数据就绪、最终高度确定后再播放展开，
// 避免展开动画播到一半时被异步到达的评论内容突然撑开。
const commentsMounted = ref(false)
const commentsEntered = ref(false)
const commentsPreparing = ref(false)
let commentsReady = false
let commentsLeaveTimer: ReturnType<typeof setTimeout> | undefined

watch(() => commentPreview.expanded, (expanded) => {
  clearTimeout(commentsLeaveTimer)
  if (expanded) {
    commentsReady = false
    commentsPreparing.value = true
    commentsEntered.value = false
    commentsMounted.value = true
    // 收起动画未结束就重新展开时子组件仍挂载、首屏已就绪，不会再发出 ready，由此直接播放展开。
    if (!commentPreview.loading && (commentPreview.page > 0 || commentPreview.error || commentPreview.done))
      handleCommentsReady()
  }
  else {
    commentsPreparing.value = false
    commentsEntered.value = false
    commentsLeaveTimer = setTimeout(() => {
      commentsMounted.value = false
    }, 220)
  }
})

onBeforeUnmount(() => clearTimeout(commentsLeaveTimer))

function handleCommentsReady() {
  if (commentsReady)
    return
  commentsReady = true
  commentsPreparing.value = false
  // 两帧：先让浏览器按 0fr 完成布局，再过渡到完整高度。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (commentPreview.expanded)
        commentsEntered.value = true
    })
  })
}

async function collapseComments() {
  if (!commentPreview.expanded)
    return
  toggleComments()
  await nextTick()
  footerRef.value?.focusCommentsToggle()
}

const ownScrollGalleryWidth = computed(() => Math.max(0, cardWidth - 32))
const forwardScrollGalleryWidth = computed(() => Math.max(0, cardWidth - 58))

const showVideoDuration = computed(() => settings.value.showVideoCardDuration && Boolean(moment.duration))
const showVideoCoverStats = computed(() =>
  (settings.value.showVideoCardViewCount && Boolean(moment.videoPlay))
  || showVideoDuration.value,
)

// The shared context menu expects the same video shape as VideoCard. A dynamic
// video without a stable aid falls back to the moment-only menu instead of
// manufacturing an id that could make copy/dislike actions target the wrong
// video.
function getMenuVideo(source: {
  aid?: number | string
  bvid?: string
  title: string
  cover: string
  duration?: string
  play?: string
  danmaku?: string
  url?: string
  author?: Author
}) {
  const aid = Number(source.aid || 0)
  if (!Number.isFinite(aid) || aid <= 0)
    return null

  const url = source.url
    || (source.bvid ? `https://www.bilibili.com/video/${source.bvid}` : `https://www.bilibili.com/video/av${aid}`)
  if (!url)
    return null

  return {
    id: aid,
    aid,
    bvid: source.bvid,
    title: source.title,
    cover: source.cover,
    durationStr: source.duration,
    viewStr: source.play,
    danmakuStr: source.danmaku,
    url,
    author: source.author,
    threePointV2: [],
  } satisfies Video
}

const menuVideo = computed<Video | null>(() => {
  if (!moment.isVideo || moment.isLive)
    return null

  return getMenuVideo({
    aid: moment.aid,
    bvid: moment.bvid,
    title: moment.title || t('moment_card.video_post'),
    cover: moment.images[0] || moment.chargeCover || '',
    duration: moment.duration,
    play: moment.videoPlay,
    danmaku: moment.videoDanmaku,
    url: moment.videoUrl,
    author: {
      name: moment.author.name,
      authorFace: getAvatarThumbnailUrl(moment.author.face),
      mid: Number(moment.author.mid) || undefined,
    },
  })
})

const cardHref = computed(() => {
  if (moment.isLive && moment.roomId)
    return `https://live.bilibili.com/${moment.roomId}`
  return (moment.isVideo && getMomentVideoUrl(moment)) || moment.url
})
const showVideoOptions = ref(false)
const videoOptionsFloatingStyles = ref<CSSProperties>({})
const moreBtnRef = ref<HTMLButtonElement | null>(null)

// VideoCard positions its menu from the trigger and teleports the shared menu
// into the app root. Keep the same positioning behavior for MomentCard.
function handleMoreBtnClick(event: Event) {
  event.stopPropagation()
  event.preventDefault()

  if (!moreBtnRef.value)
    return

  const anchor = moreBtnRef.value.getBoundingClientRect()
  const position = computeFloatingMenuPosition(anchor, window.innerWidth, window.innerHeight)
  showVideoOptions.value = false
  videoOptionsFloatingStyles.value = {
    position: 'fixed',
    top: position.top,
    bottom: position.bottom,
    left: `${position.left}px`,
    width: `${position.width}px`,
    maxHeight: `${position.maxHeight}px`,
  }
  showVideoOptions.value = true
}

function closeVideoOptions() {
  showVideoOptions.value = false
}

let cardElement: HTMLElement | null = null
let cardPointerStart: { id: number, x: number, y: number, time: number } | undefined
let suppressPointerNavigation = false

function hasSelectedCardText(target: Node | null = cardElement) {
  const root = cardElement?.getRootNode() as ShadowRoot & { getSelection?: () => Selection | null }
  const selection = root?.getSelection?.() || window.getSelection()
  return Boolean(target && selection?.toString() && selection.rangeCount && selection.getRangeAt(0).intersectsNode(target))
}

function handleCardPointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0)
    return
  cardPointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp }
  // 点击清除现有选区也不应顺带打开动态。
  suppressPointerNavigation = hasSelectedCardText()
}

function handleCardPointerMove(event: PointerEvent) {
  if (!cardPointerStart || cardPointerStart.id !== event.pointerId)
    return
  if (Math.hypot(event.clientX - cardPointerStart.x, event.clientY - cardPointerStart.y) > 6)
    suppressPointerNavigation = true
}

function handleCardPointerUp(event: PointerEvent) {
  if (!cardPointerStart || cardPointerStart.id !== event.pointerId)
    return
  handleCardPointerMove(event)
  if (event.timeStamp - cardPointerStart.time >= 500 || event.type === 'pointercancel')
    suppressPointerNavigation = true
  cardPointerStart = undefined
}

function preventSelectedTextNavigation(event: MouseEvent) {
  // 修饰键和非主键交给浏览器，不受上次拖选留下的状态影响。
  if (shouldUseNativeLinkOpen(event))
    return false
  // 键盘激活仍然可用；拖选、长按和触屏滚动后的合成 click 不执行导航。
  if (!event.detail || (!suppressPointerNavigation && !hasSelectedCardText()))
    return false
  event.preventDefault()
  event.stopPropagation()
  return true
}

function handleCardClick(event: MouseEvent, targetMoment = moment) {
  if (event.defaultPrevented || shouldUseNativeLinkOpen(event))
    return
  const target = event.target
  if (target instanceof Element) {
    const interactive = target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')
    if (interactive && interactive !== event.currentTarget)
      return
  }
  if (preventSelectedTextNavigation(event))
    return
  event.stopPropagation()
  emit('openDetail', targetMoment)
}

function handleDetailLinkClick(event: MouseEvent, targetMoment = moment, forceDialog = false) {
  if (shouldUseNativeLinkOpen(event) || preventSelectedTextNavigation(event))
    return
  event.preventDefault()
  event.stopPropagation()
  emit('openDetail', targetMoment, forceDialog)
}

function handlePermalinkClick(event: MouseEvent) {
  // 预览先处理控制条和拖动手势，再由冒泡阶段决定是否打开视频。
  if (event.eventPhase === Event.CAPTURING_PHASE && (event.target as HTMLElement | null)?.closest('.moment-video-preview'))
    return

  // 整卡 a 内嵌的交互件（稍后再看等）自行处理点击，这里只拦掉默认跳转
  const nested = (event.target as HTMLElement | null)?.closest('button, a')
  if (nested && nested !== event.currentTarget) {
    event.preventDefault()
    return
  }

  if (preventSelectedTextNavigation(event))
    return
  // 媒体卡片才打开视频/直播，保留中键及修饰键的原生打开方式。
  if (shouldUseNativeLinkOpen(event))
    return

  event.preventDefault()
  event.stopPropagation()
  emit('openMedia', moment)
}

function getForwardOriginMoment(): DisplayMoment | null {
  const forward = moment.forward
  if (!forward?.url)
    return null

  const images = forward.images || []
  return {
    id: forward.id || forward.url,
    author: {
      mid: forward.authorMid || '',
      name: forward.author,
      face: '',
    },
    publishedAt: moment.publishedAt,
    title: forward.title,
    text: forward.text,
    richText: [],
    images,
    imageRatios: forward.imageRatios,
    isNineGrid: forward.isNineGrid,
    time: '',
    likeCount: 0,
    isLiked: false,
    isLikeDisabled: true,
    commentCount: 0,
    url: forward.url,
    isVideo: false,
    isRegularVideo: false,
    isUgcSeason: false,
    isDraw: images.length > 0,
    isPgc: false,
    isLive: false,
    isChargeExclusive: false,
    isForward: false,
    isArticle: Boolean(forward.isArticle),
    isUpRecommendation: false,
    isVideoReservation: false,
    isLiveReservation: false,
    mediaMeta: '',
    liveArea: '',
    livePopularity: '',
    duration: '',
    videoPlay: '',
    videoDanmaku: '',
  }
}

const forwardOriginMoment = computed(() => getForwardOriginMoment() ?? moment)

// VideoCardContextMenu uses this injection to select its common option set.
provide('getVideoType', () => 'common')

function handleCardRef(element: Element | ComponentPublicInstance | null) {
  cardElement = element instanceof HTMLElement ? element : null
  emit('cardElement', cardElement)
}

onBeforeUnmount(() => {
  // 离开虚拟窗口后主动解除图片资源引用，包含头像、转发、图集和评论图片。
  // 卡片高度由父级保留，回滚重新挂载时再按原 URL 加载。
  cardElement?.querySelectorAll('source').forEach(source => source.removeAttribute('srcset'))
  cardElement?.querySelectorAll('img').forEach((image) => {
    image.removeAttribute('srcset')
    image.removeAttribute('src')
  })
  cardElement = null
})

function handleCoverLoad(event: Event) {
  emit('coverLoad', event, moment.id)
}

function handleGalleryPreview(urls: string[], index: number, trigger: HTMLElement | null) {
  emit('openImagePreview', urls, index, trigger)
}

function handlePreviewVideo(element: Element | ComponentPublicInstance | null) {
  emit('previewVideo', element instanceof Element ? element : null, moment)
}

function handleOpenLink(event: MouseEvent, url?: string, kind?: MomentLinkKind, video?: DisplayForwardVideo) {
  if (preventSelectedTextNavigation(event))
    return
  if (!url || shouldUseNativeLinkOpen(event))
    return

  event.preventDefault()
  event.stopPropagation()
  emit('openLink', { url, kind: kind || classifyMomentLink(url), video })
}

function handleAuthorClick(event: MouseEvent) {
  handleOpenLink(event, authorSpaceUrl.value, 'other')
}

function handleForwardAuthorClick(event: MouseEvent) {
  handleOpenLink(event, forwardAuthorSpaceUrl.value, 'other')
}

function handleForwardVideoClick(event: MouseEvent) {
  const video = moment.forward?.video
  if (!video?.url)
    return
  handleOpenLink(event, video.url, 'video', video)
}

function handleRichLinkClick(event: MouseEvent, url?: string) {
  if (preventSelectedTextNavigation(event))
    return
  if (url && isMomentLotteryUrl(url) && !shouldUseNativeLinkOpen(event)) {
    event.preventDefault()
    event.stopPropagation()
    emit('openLottery', url)
    return
  }
  handleOpenLink(event, url, url ? classifyMomentLink(url) : 'other')
}

function handleAdditionalClick(event: MouseEvent) {
  const url = moment.additional?.url
  handleRichLinkClick(event, url)
}
</script>

<template>
  <article
    :ref="handleCardRef"
    class="moment-card"
    data-layout-edit-target="moment-card"
    data-layout-settings-menu="BewlyPages"
    data-layout-settings-page="moments"
    data-layout-settings-title-key="settings.moments_card_open_mode"
    :class="{
      'moment-card--text': !moment.images.length && !moment.isVideo && !moment.isLive && !moment.isChargeExclusive && !moment.forward?.video,
      'moment-card--compact-text': isCompactPlainTextMoment(moment),
      'moment-card--forward-video': !!moment.forward?.video,
      'moment-card--forward-draw': Boolean(moment.forward?.images?.length),
      'moment-card--charge': moment.isChargeExclusive,
      'moment-card--preparing': !ready,
      'moment-card--entering': entering,
    }"
    tabindex="0"
    role="button"
    :style="cardLayoutStyles"
    @mouseenter="!moment.isLive && !settings.momentsOnlyCoverVideoPreview && emit('mediaEnter', moment)"
    @mouseleave="emit('mediaLeave', moment)"
    @pointerdown.capture="handleCardPointerDown"
    @pointermove.capture="handleCardPointerMove"
    @pointerup.capture="handleCardPointerUp"
    @pointercancel.capture="handleCardPointerUp"
    @click="handleCardClick($event)"
    @keydown.enter.self="emit('openDetail', moment)"
    @keydown.space.self.prevent="emit('openDetail', moment)"
  >
    <div class="moment-card__surface">
      <MomentAuthorHeader
        :author="moment.author"
        :href="moment.url"
        :time="moment.time"
        :meta="moment.isVideo && !moment.isLive ? t('moment_card.video_post') : ''"
        @author-click="handleAuthorClick"
        @detail-click="handleDetailLinkClick($event)"
      >
        <template #actions>
          <button
            ref="moreBtnRef"
            type="button"
            class="moment-card__more-btn"
            data-layout-edit-target="moment-card-more"
            data-layout-settings-menu="BewlyComponents"
            data-layout-settings-page="video-card"
            data-layout-settings-title-key="settings.group_video_card_context_menu"
            :class="{ 'is-open': showVideoOptions }"
            :aria-label="t('video_card.operation.more_options')"
            aria-haspopup="menu"
            :aria-expanded="showVideoOptions"
            :title="t('video_card.operation.more_options')"
            @click.stop.prevent="handleMoreBtnClick"
            @keydown.enter.stop.prevent="handleMoreBtnClick"
            @keydown.space.stop.prevent="handleMoreBtnClick"
          >
            <span i-mingcute:more-2-line aria-hidden="true" />
          </button>
        </template>
      </MomentAuthorHeader>

      <div
        class="moment-card__main"
        :class="{
          'moment-card__main--video': moment.isVideo || (!moment.isChargeExclusive && moment.isLive),
          'moment-card__main--live': !moment.isChargeExclusive && moment.isLive,
        }"
      >
        <a
          :href="moment.url"
          class="moment-card__permalink"
          draggable="false"
          tabindex="-1"
          aria-hidden="true"
          @click="handleDetailLinkClick($event)"
        />
        <!-- 官方式横条视频卡：左封面、右标题与简介；转发视频复用同一结构 -->
        <template v-if="moment.isVideo && !moment.isLive">
          <div
            v-if="!moment.descInherited && (moment.richText.length || getCardPreviewText(moment))"
            class="moment-card__body"
          >
            <MomentDescription
              :id="descriptionId"
              :segments="moment.richText"
              :text="getCardPreviewText(moment)"
              :href="moment.url"
              :reset-key="moment.id"
              @link-click="handleRichLinkClick"
              @text-click="handleDetailLinkClick($event)"
            />
          </div>
          <MomentVideoCard
            variant="original"
            :href="cardHref || undefined"
            :aria-label="t('moment_card.open_original_video', { title: moment.title })"
            :cover="moment.images.length ? getMomentThumbnailUrl(moment.images[0]) : ''"
            :cover-alt="moment.title"
            :title="moment.title || t('moment_card.video_post')"
            :desc="moment.descInherited ? getCardPreviewText(moment) : ''"
            :author="moment.author.name"
            :text-cover-text="t('moment_card.video_post')"
            :charge-badge="moment.isChargeExclusive ? (moment.chargeBadge || t('moment_card.charging_exclusive')) : ''"
            :show-stats="showVideoCoverStats && !(previewActive && settings.momentsEnableVideoControls)"
            :show-play="settings.showVideoCardViewCount && Boolean(moment.videoPlay)"
            :play="moment.videoPlay"
            :show-duration="showVideoDuration"
            :duration="moment.duration"
            :watched-aid="moment.aid"
            :watched-bvid="moment.bvid"
            :preview-active="previewActive"
            :preview-url="previewUrl"
            @click.capture="handlePermalinkClick"
            @click="handlePermalinkClick"
            @cover-load="handleCoverLoad"
            @media-enter="settings.momentsOnlyCoverVideoPreview && emit('mediaEnter', moment)"
            @media-leave="settings.momentsOnlyCoverVideoPreview && emit('mediaLeave', moment)"
            @preview-leave="emit('mediaLeave', moment)"
            @preview-video="handlePreviewVideo"
            @preview-canplay="(event: Event) => emit('previewCanplay', event)"
          >
            <template #coverAction>
              <WatchLaterCoverButton :target="watchLaterTarget" persistent />
            </template>
          </MomentVideoCard>
        </template>
        <template v-else>
          <MomentMediaCover
            v-if="(moment.isVideo || moment.isLive) && (moment.images.length || !moment.isChargeExclusive || moment.isVideo)"
            :cover="moment.images.length ? getMomentThumbnailUrl(moment.images[0]) : ''"
            :alt="moment.title"
            :href="cardHref"
            :live="moment.isLive"
            :ready="ready"
            :preview-active="previewActive"
            :preview-url="previewUrl"
            :show-stats="moment.isVideo && showVideoCoverStats && !(previewActive && settings.momentsEnableVideoControls)"
            :show-play="settings.showVideoCardViewCount && Boolean(moment.videoPlay)"
            :play="moment.videoPlay"
            :show-duration="showVideoDuration"
            :duration="moment.duration"
            :charge-badge="moment.isChargeExclusive ? (moment.chargeBadge || t('moment_card.charging_exclusive')) : ''"
            @permalink-click="handlePermalinkClick"
            @media-enter="(moment.isLive || settings.momentsOnlyCoverVideoPreview) && emit('mediaEnter', moment)"
            @media-leave="(moment.isLive || settings.momentsOnlyCoverVideoPreview) && emit('mediaLeave', moment)"
            @cover-load="handleCoverLoad"
            @preview-video="handlePreviewVideo"
            @preview-canplay="(event: Event) => emit('previewCanplay', event)"
            @preview-leave="emit('mediaLeave', moment)"
          />
          <div class="moment-card__body">
            <p v-if="moment.title && !moment.forward?.video" class="moment-card__title">
              <a :href="moment.url" class="moment-card__text-link" draggable="false" tabindex="-1" @click="handleDetailLinkClick($event)">
                <VideoWatchedTag
                  v-if="moment.isVideo"
                  :aid="moment.aid"
                  :bvid="moment.bvid"
                />
                {{ moment.title }}
              </a>
            </p>
            <p
              v-if="moment.mediaMeta && !moment.isForward && !moment.isChargeExclusive && (!moment.isVideo || moment.isLive)"
              class="moment-card__media-meta"
              :class="{ 'moment-card__media-meta--live': moment.isLive }"
            >
              <a :href="moment.url" class="moment-card__text-link" draggable="false" tabindex="-1" @click="handleDetailLinkClick($event)">
                {{ moment.mediaMeta }}
              </a>
            </p>
            <MomentDescription
              v-if="!moment.isLive && (moment.richText.length || getCardPreviewText(moment))"
              :id="descriptionId"
              :segments="moment.richText"
              :text="getCardPreviewText(moment)"
              :href="moment.url"
              :reset-key="moment.id"
              @link-click="handleRichLinkClick"
              @text-click="handleDetailLinkClick($event)"
            />
            <MomentForwardVideo
              v-if="moment.forward?.video"
              :video="moment.forward.video"
              :author="moment.forward.author"
              :author-mid="moment.forward.authorMid"
              :author-face="moment.forward.authorFace"
              :author-action="moment.forward.authorAction"
              :fallback="moment.forward.fallback"
              :href="moment.url"
              :preview-active="previewActive"
              :preview-url="previewUrl"
              @author-click="handleForwardAuthorClick"
              @action-click="handleDetailLinkClick($event)"
              @video-click="handleForwardVideoClick"
              @media-enter="settings.momentsOnlyCoverVideoPreview && emit('mediaEnter', moment)"
              @media-leave="settings.momentsOnlyCoverVideoPreview && emit('mediaLeave', moment)"
              @preview-leave="emit('mediaLeave', moment)"
              @preview-video="handlePreviewVideo"
              @preview-canplay="(event: Event) => emit('previewCanplay', event)"
            />
            <MomentForwardCard
              v-else-if="moment.forward"
              :forward="moment.forward"
              :fallback-href="moment.url"
              :image-ratio="imageRatio"
              :container-width="forwardScrollGalleryWidth"
              @card-click="handleCardClick($event, forwardOriginMoment)"
              @activate="emit('openDetail', forwardOriginMoment)"
              @text-click="handleDetailLinkClick($event, forwardOriginMoment)"
              @view-original-click="handleDetailLinkClick($event, forwardOriginMoment, true)"
              @author-click="handleForwardAuthorClick"
              @link-click="handleRichLinkClick"
              @cover-load="handleCoverLoad"
              @preview="handleGalleryPreview"
            />
          </div>

          <MomentImageSet
            v-if="moment.images.length && !moment.isVideo && !moment.isLive"
            :images="moment.images"
            :image-ratios="moment.imageRatios"
            :is-nine-grid="moment.isNineGrid"
            :image-ratio="imageRatio"
            :container-width="ownScrollGalleryWidth"
            :author-name="moment.author.name"
            @cover-load="handleCoverLoad"
            @preview="handleGalleryPreview"
          >
            <span v-if="moment.isChargeExclusive" class="moment-card__charge-badge">
              {{ moment.chargeBadge || t('moment_card.charging_exclusive') }}
            </span>
          </MomentImageSet>
        </template>
      </div>

      <Teleport
        v-if="showVideoOptions"
        :to="mainAppRef"
      >
        <MomentContextMenu
          :moment="moment"
          :video="menuVideo"
          :menu-styles="videoOptionsFloatingStyles"
          :trigger-element="moreBtnRef"
          @close="closeVideoOptions"
          @removed="emit('removed', moment)"
        />
      </Teleport>

      <MomentVote
        v-if="moment.additional?.isVote && moment.additional.voteId"
        :vote-id="moment.additional.voteId"
        :moment-id="moment.id"
        :fallback-title="moment.additional.title"
        :fallback-desc="moment.additional.desc"
        :fallback-end-time="moment.additional.voteEndTime"
      />
      <MomentAdditionalCard
        v-else-if="moment.additional"
        :additional="moment.additional"
        :charge="moment.isChargeExclusive"
        :reservation-loading="isReservationLoading"
        @open="handleAdditionalClick"
        @toggle-reservation="emit('toggleReservation', moment)"
      />

      <MomentHotComment
        v-if="moment.hotComment"
        :comment="moment.hotComment"
        :expanded="commentPreview.expanded"
        :loading="commentsPreparing"
        :controls="commentsId"
        @toggle="toggleComments"
      />

      <MomentCardFooter
        ref="footerRef"
        :moment="moment"
        :repost-expanded="repostExpanded"
        :repost-count="repostCount"
        :comment-count="Math.max(0, moment.commentCount + commentCountDelta)"
        :comments-expanded="commentPreview.expanded"
        :comments-loading="commentsPreparing"
        :comments-controls="commentsId"
        :like-loading="isLikeLoading"
        @toggle-repost="toggleRepost"
        @toggle-comments="toggleComments"
        @toggle-like="emit('toggleLike', moment)"
      />
      <MomentRepost
        v-if="repostExpanded"
        :moment-id="moment.id"
        @close="repostExpanded = false"
        @sent="repostCount++; repostExpanded = false"
      />
      <div
        v-if="commentsMounted"
        class="moment-card__comments-host"
        :class="{ 'is-entered': commentsEntered }"
      >
        <MomentComments
          :id="commentsId"
          :moment="moment"
          :state="commentPreview"
          @ready="handleCommentsReady"
          @collapse="collapseComments"
          @count-change="delta => commentCountDelta += delta"
          @reposted="repostCount++"
          @open-image-preview="(urls, index, trigger) => emit('openImagePreview', urls, index, trigger)"
        />
      </div>
    </div>
  </article>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card--preparing {
  visibility: hidden;
}

.moment-card--entering {
  will-change: opacity;
  animation: moment-card-enter 0.2s ease both;
}

@keyframes moment-card-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.moment-card {
  container-type: inline-size;
  break-inside: avoid;
  position: relative;
  margin: 0;
  border-radius: var(--bew-card-radius);
  background-color: transparent;
  cursor: pointer;
  user-select: text;
  -webkit-user-select: text;
  box-shadow: none;
}

.moment-card__surface {
  position: relative;
  overflow: hidden;
  border-radius: inherit;
  background: var(--bew-elevated);
}

.moment-card__permalink {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

// 正文链接高于留白区链接，拖选仍命中文字；图集保留独立的图片交互。
.moment-card__text-link {
  @include mixins.text-link;
}

.moment-card__main {
  position: relative;
  padding: 0 var(--bew-space-4) var(--bew-space-4);
}

// 子组件各自声明内部交互元素的层级，这里只覆盖本模板内的链接与按钮。
.moment-card__surface :is(a, button, [role="button"]):not(.moment-card__permalink):not(.bew-watch-later-cover__btn) {
  @include mixins.interactive-layer;
}

.moment-card:focus-visible {
  @include mixins.focus-ring(4px);
}

@media (prefers-reduced-motion: reduce) {
  .moment-card {
    transition: none;
  }

  .moment-card--entering {
    animation: none;
  }
}

.moment-card__charge-badge {
  @include mixins.charge-badge;
}

.moment-card__body {
  min-width: 0;
  padding: 0;
}

.moment-card--text .moment-card__body {
  padding-top: var(--bew-space-4);
}

/* 纯文字卡高度随内容自适应，不设最小高度，避免短动态下方留出大块空白 */
.moment-card--forward-draw .moment-card__body,
.moment-card--compact-text .moment-card__body {
  min-height: 0;
}

.moment-card__title {
  margin: 0 0 var(--bew-space-2);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.moment-card__media-meta {
  margin: 0 0 var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

.moment-card__media-meta--live {
  align-self: flex-start;
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
  line-height: var(--bew-line-height-control);
}

.moment-card__main--live {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
}

.moment-card__main--live .moment-card__body {
  order: 1;
  height: auto;
  max-height: none;
}

.moment-card__main--live :deep(.moment-card__media) {
  order: 2;
  width: 100%;
}

.moment-card__main--video.moment-card__main--live .moment-card__body {
  display: flex;
  height: auto;
  max-height: none;
  flex-direction: column;
  overflow: hidden;
}

.moment-card__more-btn {
  display: grid;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--bew-radius-full);
  place-items: center;
  color: var(--bew-text-2);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: var(--bew-icon-size-md);
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__more-btn:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
}

.moment-card__more-btn.is-open {
  color: var(--bew-text-1);
}

.moment-card__more-btn:active {
  background: var(--bew-fill-3);
}

.moment-card__more-btn:focus-visible {
  @include mixins.focus-ring;
}

@container (max-width: 359px) {
  .moment-card--text .moment-card__body {
    min-height: 0;
  }
}

/* 评论区展开/收起：grid 轨道 0fr→1fr 过渡实现高度自适应动画，无需 JS 测量高度。
   挂载时先停在 0fr，首屏评论就绪后由 .is-entered 播放展开，避免内容异步到达撑断动画。 */
.moment-card__comments-host {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__comments-host.is-entered {
  grid-template-rows: 1fr;
}

.moment-card__comments-host > .moment-comments {
  min-height: 0;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .moment-card__comments-host {
    transition: none;
  }
}
</style>
