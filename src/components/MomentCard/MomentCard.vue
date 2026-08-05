<script setup lang="ts">
import type { ComponentPublicInstance, CSSProperties } from 'vue'
import { computed, provide, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import VideoWatchedTag from '~/components/VideoWatchedTag.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import { computeFloatingMenuPosition } from '~/utils/floatingMenu'

import type { Author, Video } from '../VideoCard/types'
import VideoCardContextMenu from '../VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue'
import type { DisplayForwardVideo, DisplayMoment, WatchLaterTarget } from './types'
import {
  formatCount,
  getAvatarThumbnailUrl,
  getCardPreviewText,
  getMomentThumbnailUrl,
  getWatchLaterStateKey,
  isCompactPlainTextMoment,
} from './utils'

interface Props {
  moment: DisplayMoment
  cardWidth?: number
  ready?: boolean
  entering?: boolean
  previewActive?: boolean
  previewUrl?: string
  isLikeLoading?: boolean
  isWatchLaterAdded: (target: WatchLaterTarget) => boolean
  isWatchLaterLoading: (target: WatchLaterTarget) => boolean
}

const {
  moment,
  cardWidth = 520,
  ready = false,
  entering = false,
  previewActive = false,
  previewUrl = '',
  isLikeLoading = false,
  isWatchLaterAdded,
  isWatchLaterLoading,
} = defineProps<Props>()

const emit = defineEmits<{
  cardElement: [element: HTMLElement | null]
  openDetail: [moment: DisplayMoment, forceDialog?: boolean]
  mediaEnter: [moment: DisplayMoment]
  mediaLeave: [moment: DisplayMoment]
  coverLoad: [event: Event, momentId: string]
  previewVideo: [element: Element | null, moment: DisplayMoment]
  previewCanplay: [event: Event]
  forwardVideoClick: [video: DisplayForwardVideo]
  toggleWatchLater: [target: WatchLaterTarget]
  toggleLike: [moment: DisplayMoment]
}>()

const { t } = useI18n()
const { mainAppRef } = useBewlyApp()

const cardLayoutStyles = computed<CSSProperties>(() => {
  const scale = Math.max(1, cardWidth / 520)
  return {
    '--moment-card-text-body-min-height': `${Math.round(120 + 230 * (scale - 1))}px`,
    '--moment-card-text-cover-min-height': `${Math.round(176 * scale)}px`,
  } as CSSProperties
})

// The shared context menu expects the same video shape as VideoCard. A dynamic
// video without a stable aid is intentionally left without a menu instead of
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
    title: moment.title || '视频动态',
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

const menuButtonLabel = computed(() => menuVideo.value
  ? t('video_card.operation.more_options')
  : '')

const showVideoOptions = ref(false)
const videoOptionsFloatingStyles = ref<CSSProperties>({})
const moreBtnRef = ref<HTMLButtonElement | null>(null)

// VideoCard positions its menu from the trigger and teleports the shared menu
// into the app root. Keep the same positioning behavior for MomentCard.
function handleMoreBtnClick(event: Event) {
  event.stopPropagation()
  event.preventDefault()

  if (!menuVideo.value || !moreBtnRef.value)
    return

  const anchor = moreBtnRef.value.getBoundingClientRect()
  const position = computeFloatingMenuPosition(anchor, window.innerWidth, window.innerHeight)
  showVideoOptions.value = false
  videoOptionsFloatingStyles.value = {
    position: 'fixed',
    top: `${position.top}px`,
    left: `${position.left}px`,
    width: `${position.width}px`,
    maxHeight: `${position.maxHeight}px`,
  }
  showVideoOptions.value = true
}

function closeVideoOptions() {
  showVideoOptions.value = false
}

function handleCardClick(event: MouseEvent) {
  const target = event.target
  if (target instanceof Element) {
    const interactiveTarget = target.closest('button, a, [role="button"]')
    // 根 article 自身就是 role="button"；只过滤卡片内部的独立交互控件。
    if (interactiveTarget && interactiveTarget !== event.currentTarget)
      return
  }

  emit('openDetail', moment)
}

// VideoCardContextMenu uses this injection to select its common option set.
provide('getVideoType', () => 'common')

function handleCardRef(element: Element | ComponentPublicInstance | null) {
  emit('cardElement', element instanceof HTMLElement ? element : null)
}

function handleCoverLoad(event: Event) {
  emit('coverLoad', event, moment.id)
}

function handlePreviewVideo(element: Element | ComponentPublicInstance | null) {
  emit('previewVideo', element instanceof Element ? element : null, moment)
}

function handleForwardVideoClick() {
  if (moment.forward?.video)
    emit('forwardVideoClick', moment.forward.video)
}
</script>

<template>
  <article
    :ref="handleCardRef"
    class="moment-card"
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
    @click="handleCardClick"
    @keydown.enter.self="emit('openDetail', moment)"
  >
    <div class="moment-card__surface">
      <header class="moment-card__header">
        <img :src="getAvatarThumbnailUrl(moment.author.face)" :alt="moment.author.name" class="moment-card__avatar" loading="lazy" decoding="async">
        <span class="moment-card__identity">
          <strong>{{ moment.author.name }}</strong>
          <small>{{ moment.time || '刚刚' }}</small>
        </span>
        <button
          v-if="menuVideo"
          ref="moreBtnRef"
          type="button"
          class="moment-card__more-btn"
          :class="{ 'is-open': showVideoOptions }"
          :aria-label="menuButtonLabel"
          aria-haspopup="menu"
          :aria-expanded="showVideoOptions"
          :title="menuButtonLabel"
          @click.stop.prevent="handleMoreBtnClick"
          @keydown.enter.stop.prevent="handleMoreBtnClick"
          @keydown.space.stop.prevent="handleMoreBtnClick"
        >
          <span i-mingcute:more-2-line aria-hidden="true" />
        </button>
      </header>

      <div
        class="moment-card__main"
        :class="{
          'moment-card__main--has-media': (!moment.isChargeExclusive || moment.isVideo) && (
            (moment.images.length > 0 && (moment.isVideo || moment.isLive))
            || (!moment.images.length && (moment.isVideo || moment.isLive))
          ),
          'moment-card__main--video': moment.isVideo || (!moment.isChargeExclusive && moment.isLive),
          'moment-card__main--live': !moment.isChargeExclusive && moment.isLive,
        }"
      >
        <div
          v-if="moment.images.length && (moment.isVideo || moment.isLive)"
          class="moment-card__media moment-card__cover moment-card__cover--media"
          @mouseenter="emit('mediaEnter', moment)"
          @mouseleave="emit('mediaLeave', moment)"
        >
          <img
            :src="getMomentThumbnailUrl(moment.images[0])"
            :alt="moment.title"
            :class="{ 'is-ready': ready }"
            loading="lazy"
            decoding="async"
            @load="handleCoverLoad"
          >
          <video
            v-if="previewActive && previewUrl"
            :ref="handlePreviewVideo"
            :src="moment.isLive ? undefined : previewUrl"
            autoplay
            muted
            :loop="!moment.isLive"
            playsinline
            @canplay="emit('previewCanplay', $event)"
          />
          <span
            v-if="moment.isVideo && settings.showVideoCardViewCount && moment.videoPlay"
            class="moment-card__video-stats"
          >
            <span class="moment-card__video-stat-group">
              <span>
                <span i-tabler-player-play aria-hidden="true" />
                {{ moment.videoPlay }}
              </span>
            </span>
          </span>
          <span v-if="moment.isLive" class="moment-card__live-mark">
            LIVE
            <span i-svg-spinners:pulse-3 aria-hidden="true" />
          </span>
          <span v-if="moment.isChargeExclusive" class="moment-card__charge-badge">
            {{ moment.chargeBadge || '充电专属' }}
          </span>
          <button
            v-if="settings.showVideoCardWatchLater && moment.isVideo && !moment.isLive"
            type="button"
            class="moment-card__watch-later"
            :class="{ 'is-added': isWatchLaterAdded(moment) }"
            :disabled="isWatchLaterLoading(moment)"
            :aria-label="isWatchLaterAdded(moment) ? '已添加稍后再看' : '添加至稍后再看'"
            :aria-pressed="isWatchLaterAdded(moment)"
            :title="isWatchLaterAdded(moment) ? '已添加' : '稍后再看'"
            @click.stop="emit('toggleWatchLater', moment)"
          >
            <span v-if="isWatchLaterLoading(moment)" i-svg-spinners:ring-resize aria-hidden="true" />
            <span v-else-if="isWatchLaterAdded(moment)" i-line-md:confirm aria-hidden="true" />
            <span v-else i-mingcute:carplay-line aria-hidden="true" />
          </button>
        </div>
        <div v-else-if="(moment.isVideo || moment.isLive) && (!moment.isChargeExclusive || moment.isVideo)" class="moment-card__media moment-card__cover moment-card__text-cover moment-card__text-cover--video">
          <span v-if="moment.isLive" i-tabler-live-photo class="moment-card__text-cover-icon" />
          <span v-else i-tabler-player-play-filled class="moment-card__text-cover-icon" />
          <span>{{ moment.isLive ? '直播动态' : '视频动态' }}</span>
          <button
            v-if="settings.showVideoCardWatchLater && moment.isVideo && !moment.isLive"
            type="button"
            class="moment-card__watch-later"
            :class="{ 'is-added': isWatchLaterAdded(moment) }"
            :disabled="isWatchLaterLoading(moment)"
            :aria-label="isWatchLaterAdded(moment) ? '已添加稍后再看' : '添加至稍后再看'"
            :aria-pressed="isWatchLaterAdded(moment)"
            :title="isWatchLaterAdded(moment) ? '已添加' : '稍后再看'"
            @click.stop="emit('toggleWatchLater', moment)"
          >
            <span v-if="isWatchLaterLoading(moment)" i-svg-spinners:ring-resize aria-hidden="true" />
            <span v-else-if="isWatchLaterAdded(moment)" i-line-md:confirm aria-hidden="true" />
            <span v-else i-mingcute:carplay-line aria-hidden="true" />
          </button>
        </div>

        <div class="moment-card__body">
          <p v-if="moment.title && !moment.forward?.video" class="moment-card__title">
            <VideoWatchedTag
              v-if="moment.isVideo"
              :aid="moment.aid"
              :bvid="moment.bvid"
            />
            {{ moment.title }}
          </p>
          <p
            v-if="moment.mediaMeta && !moment.isChargeExclusive && (!moment.isVideo || moment.isLive)"
            class="moment-card__media-meta"
            :class="{ 'moment-card__media-meta--live': moment.isLive }"
          >
            {{ moment.mediaMeta }}
          </p>
          <p v-if="!moment.isLive && (moment.richText.length || getCardPreviewText(moment))" class="moment-card__desc">
            <template v-if="moment.richText.length">
              <template v-for="(segment, segmentIndex) in moment.richText" :key="`${moment.id}-${segmentIndex}`">
                <img
                  v-if="segment.type === 'emoji' && segment.imageUrl"
                  :src="segment.imageUrl"
                  :alt="segment.text"
                  :title="segment.text"
                  class="moment-card__emoji"
                  :class="{ 'moment-card__emoji--large': segment.size === 2 }"
                  loading="lazy"
                  decoding="async"
                >
                <a
                  v-else-if="segment.type === 'link' && segment.url"
                  :href="segment.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="moment-card__rich-link"
                  @click.stop
                >
                  {{ segment.text }}
                </a>
                <template v-else>
                  {{ segment.text }}
                </template>
              </template>
            </template>
            <template v-else>
              {{ getCardPreviewText(moment) }}
            </template>
          </p>
          <a
            v-if="moment.forward?.video"
            :href="moment.forward.video.url || undefined"
            target="_blank"
            rel="noopener noreferrer"
            class="moment-card__forward-video"
            :aria-label="`打开原视频：${moment.forward.video.title}`"
            @click.stop="handleForwardVideoClick"
          >
            <span class="moment-card__forward-video-cover">
              <img
                :src="getMomentThumbnailUrl(moment.forward.video.cover)"
                :alt="moment.forward.video.title"
                loading="lazy"
                decoding="async"
              >
              <span
                v-if="settings.showVideoCardViewCount && moment.forward.video.play"
                class="moment-card__video-stats"
              >
                <span class="moment-card__video-stat-group">
                  <span>
                    <span i-tabler-player-play aria-hidden="true" />
                    {{ moment.forward.video.play }}
                  </span>
                </span>
              </span>
              <span
                v-if="settings.showVideoCardWatchLater && getWatchLaterStateKey(moment.forward.video)"
                role="button"
                :tabindex="isWatchLaterLoading(moment.forward.video) ? -1 : 0"
                class="moment-card__watch-later"
                :class="{
                  'is-added': isWatchLaterAdded(moment.forward.video),
                  'is-disabled': isWatchLaterLoading(moment.forward.video),
                }"
                :aria-disabled="isWatchLaterLoading(moment.forward.video)"
                :aria-label="isWatchLaterAdded(moment.forward.video) ? '已添加稍后再看' : '添加至稍后再看'"
                :aria-pressed="isWatchLaterAdded(moment.forward.video)"
                :title="isWatchLaterAdded(moment.forward.video) ? '已添加' : '稍后再看'"
                @click.stop.prevent="emit('toggleWatchLater', moment.forward.video)"
                @keydown.enter.stop.prevent="emit('toggleWatchLater', moment.forward.video)"
                @keydown.space.stop.prevent="emit('toggleWatchLater', moment.forward.video)"
              >
                <span v-if="isWatchLaterLoading(moment.forward.video)" i-svg-spinners:ring-resize aria-hidden="true" />
                <span v-else-if="isWatchLaterAdded(moment.forward.video)" i-line-md:confirm aria-hidden="true" />
                <span v-else i-mingcute:carplay-line aria-hidden="true" />
              </span>
            </span>
            <span class="moment-card__forward-video-info">
              <strong>
                <VideoWatchedTag
                  :aid="moment.forward.video.aid"
                  :bvid="moment.forward.video.bvid"
                />
                {{ moment.forward.video.title || moment.forward.fallback }}
              </strong>
              <small><span i-tabler-user aria-hidden="true" />{{ moment.forward.author }}</small>
            </span>
          </a>
          <div
            v-else-if="moment.forward"
            class="moment-card__forward"
            :class="{ 'moment-card__forward--draw': Boolean(moment.forward.images?.length) }"
          >
            <div class="moment-card__forward-copy">
              <strong>@{{ moment.forward.author }}</strong>
              <p>{{ moment.forward.title || moment.forward.text || moment.forward.fallback }}</p>
            </div>
            <div
              v-if="moment.forward.images?.length"
              class="moment-card__forward-gallery"
              :class="`moment-card__forward-gallery--${Math.min(moment.forward.images.length, 9)}`"
            >
              <img
                v-for="(image, imageIndex) in moment.forward.images.slice(0, 9)"
                :key="image"
                :src="getMomentThumbnailUrl(image, 360)"
                :alt="`${moment.forward.author} 的动态图片 ${imageIndex + 1}`"
                loading="lazy"
                decoding="async"
              >
            </div>
          </div>
        </div>

        <div
          v-if="moment.images.length && !moment.isVideo && !moment.isLive"
          class="moment-card__gallery"
          :class="`moment-card__gallery--${Math.min(moment.images.length, 9)}`"
        >
          <img
            v-for="(image, imageIndex) in moment.images.slice(0, 9)"
            :key="image"
            :src="getMomentThumbnailUrl(image, 360)"
            :alt="`${moment.author.name} 的动态图片 ${imageIndex + 1}`"
            loading="lazy"
            decoding="async"
            @load="handleCoverLoad"
          >
          <span v-if="moment.images.length > 9" class="moment-card__image-count">+{{ moment.images.length - 9 }}</span>
          <span v-if="moment.isChargeExclusive" class="moment-card__charge-badge">
            {{ moment.chargeBadge || '充电专属' }}
          </span>
        </div>
      </div>

      <Teleport
        v-if="showVideoOptions && menuVideo"
        :to="mainAppRef"
      >
        <VideoCardContextMenu
          :video="menuVideo"
          :context-menu-styles="videoOptionsFloatingStyles"
          @close="closeVideoOptions"
          @removed="closeVideoOptions"
        />
      </Teleport>

      <a
        v-if="moment.additional"
        :href="moment.additional.url || undefined"
        class="moment-card__additional moment-card__additional--footer"
        :class="{ 'moment-card__additional--no-cover': moment.isChargeExclusive || !moment.additional.cover }"
        @click.stop
      >
        <img
          v-if="moment.additional.cover && !moment.isChargeExclusive"
          :src="getMomentThumbnailUrl(moment.additional.cover, 80)"
          alt=""
          loading="lazy"
          decoding="async"
        >
        <span><strong>{{ moment.additional.title || '附加内容' }}</strong><small v-if="moment.additional.desc">{{ moment.additional.desc }}</small></span>
        <em>{{ moment.additional.action }}</em>
      </a>

      <button
        v-if="moment.hotComment"
        type="button"
        class="moment-card__hot-comment"
        aria-label="查看热门评论"
        @click.stop="emit('openDetail', moment)"
      >
        <span class="moment-card__hot-comment-label">
          <span i-tabler-message-circle-filled aria-hidden="true" />
          热门评论
        </span>
        <span class="moment-card__hot-comment-content">
          <template v-if="moment.hotComment.richText.length">
            <template v-for="(segment, segmentIndex) in moment.hotComment.richText" :key="`${moment.id}-hot-comment-${segmentIndex}`">
              <img
                v-if="segment.type === 'emoji' && segment.imageUrl"
                :src="segment.imageUrl"
                :alt="segment.text"
                :title="segment.text"
                class="moment-card__emoji"
                :class="{ 'moment-card__emoji--large': segment.size === 2 }"
                loading="lazy"
                decoding="async"
              >
              <template v-else>{{ segment.text }}</template>
            </template>
          </template>
          <template v-else>{{ moment.hotComment.text }}</template>
        </span>
      </button>

      <footer class="moment-card__footer">
        <button
          v-if="settings.momentsCardOpenMode !== 'dialog' && !moment.isLive"
          type="button"
          aria-label="弹窗打开动态"
          @click.stop="emit('openDetail', moment, true)"
          @keydown.enter.stop
        >
          <span i-tabler-layout-dashboard />
          <span class="moment-card__open-label">弹窗打开</span>
        </button>
        <a
          v-else
          :href="moment.url"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="新建标签页打开动态"
          @click.stop
        >
          <span i-tabler-external-link />
          <span class="moment-card__open-label">新标签页打开</span>
        </a>
        <button v-if="!moment.isLive" type="button" aria-label="查看评论" @click.stop="emit('openDetail', moment)">
          <span i-tabler-message-circle />
          {{ formatCount(moment.commentCount) }}
        </button>
        <span v-else class="moment-card__footer-stat" :aria-label="`直播人气 ${moment.livePopularity || '暂无数据'}`">
          <span i-tabler-users />
          {{ moment.livePopularity || '直播中' }}
        </span>
        <button
          type="button"
          class="moment-card__likes"
          :class="{ 'is-liked': moment.isLiked, 'is-unavailable': moment.isLikeDisabled }"
          :disabled="isLikeLoading || moment.isLikeDisabled"
          :aria-label="moment.isLikeDisabled ? '该动态暂不支持点赞' : moment.isLiked ? '取消点赞' : '点赞'"
          :aria-pressed="moment.isLiked"
          :title="moment.isLikeDisabled ? '该动态暂不支持点赞' : moment.isLiked ? '取消点赞' : '点赞'"
          @click.stop="emit('toggleLike', moment)"
          @keydown.enter.stop
        >
          <span v-if="moment.isLiked" i-tabler-heart-filled />
          <span v-else i-tabler-heart />
          {{ formatCount(moment.likeCount) }}
        </button>
      </footer>
    </div>
  </article>
</template>

<style lang="scss" scoped>
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
  box-shadow: none;
  transition:
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-emphasized);
}

.moment-card__surface {
  overflow: hidden;
  border-radius: inherit;
  background: var(--bew-elevated);
}

@media (hover: hover) and (pointer: fine) {
  .moment-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--bew-shadow-1);
  }
}

.moment-card:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 4px;
}

.moment-card:active {
  transform: translateY(0) scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .moment-card {
    transition: none;
  }

  .moment-card--entering {
    animation: none;
  }
}

.moment-card__cover {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--bew-fill-1);
}

.moment-card__cover > img {
  display: block;
  width: 100%;
  height: auto;
  opacity: 0;
  object-fit: cover;
  object-position: center top;
  background: var(--bew-fill-1);
  transition: opacity 0.12s ease;
}

.moment-card__cover > img.is-ready {
  opacity: 1;
}

.moment-card__cover--media {
  aspect-ratio: 16 / 9;
  background: #111;
}

.moment-card__cover--media > img,
.moment-card__cover--media > video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-card__cover--media > video {
  z-index: 1;
}

.moment-card__watch-later {
  position: absolute;
  top: var(--bew-space-2);
  right: var(--bew-space-2);
  z-index: 3;
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  place-items: center;
  color: #fff;
  background: rgb(0 0 0 / 62%);
  cursor: pointer;
  font-size: var(--bew-icon-size-md);
  opacity: 0;
  transform: scale(0.78);
  transition:
    opacity var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__cover:hover .moment-card__watch-later,
.moment-card__forward-video-cover:hover .moment-card__watch-later,
.moment-card__forward-video-cover:focus-within .moment-card__watch-later,
.moment-card__watch-later:focus-visible,
.moment-card__watch-later.is-added {
  opacity: 1;
  transform: scale(1);
}

.moment-card__watch-later:hover {
  background: rgb(0 0 0 / 78%);
}

.moment-card__watch-later:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.moment-card__watch-later:disabled,
.moment-card__watch-later.is-disabled {
  cursor: wait;
  opacity: 0.72;
}

.moment-card__image-count,
.moment-card__video-mark,
.moment-card__live-mark {
  position: absolute;
  bottom: var(--bew-space-2);
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-radius-full);
  color: #fff;
  background: rgb(0 0 0 / 58%);
  font-size: var(--bew-font-size-control);
}

.moment-card__image-count {
  right: var(--bew-space-2);
}

.moment-card__video-mark {
  left: var(--bew-space-2);
}

.moment-card__live-mark {
  top: 8px;
  left: 8px;
  bottom: auto;
  z-index: 2;
  border-radius: var(--bew-badge-radius);
  background: var(--bew-theme-color);
  font-weight: var(--bew-font-weight-bold);
  letter-spacing: 0.02em;
}

.moment-card__charge-badge {
  position: absolute;
  top: var(--bew-space-2);
  left: var(--bew-space-2);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-radius-full);
  color: #fff;
  background: linear-gradient(135deg, #ff8eb4, #fb7299);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  box-shadow: 0 2px 8px rgb(251 114 153 / 35%);
}

.moment-card__text-cover {
  min-height: 152px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-3);
  color: var(--bew-text-2);
  background: linear-gradient(145deg, var(--bew-theme-color-20), var(--bew-fill-1));
}

.moment-card__text-cover--video {
  color: #fff;
  background: linear-gradient(145deg, #394e74, #141b2d);
}

.moment-card__text-cover-icon {
  font-size: var(--bew-icon-size-xl);
}

.moment-card--charge .moment-card__additional em {
  color: #fb7299;
}

.moment-card__body {
  padding: var(--bew-space-3);
}

.moment-card--text .moment-card__body {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  padding-top: var(--bew-space-4);
}

.moment-card--text .moment-card__desc {
  flex: 1 1 auto;
  -webkit-line-clamp: 10;
}

.moment-card__title {
  margin: 0 0 var(--bew-space-2);
}

.moment-card__media-meta {
  margin: 0 0 var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

.moment-card__media-meta--live {
  align-self: flex-start;
  padding: 4px 8px;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
  line-height: 1.35;
}

.moment-card__desc {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  white-space: pre-wrap;
  word-break: break-word;
}

.moment-card__footer {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

.moment-card__forward {
  display: flex;
  flex-direction: column;
  margin-top: var(--bew-space-3);
  overflow: hidden;
  border: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 58%);
  border-radius: var(--bew-card-radius);
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.moment-card__forward-copy {
  padding: var(--bew-space-3);
}

.moment-card__forward strong {
  color: var(--bew-text-1);
}

.moment-card__forward p {
  display: -webkit-box;
  margin: var(--bew-space-1) 0 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.moment-card__additional {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  margin-top: var(--bew-space-3);
  padding: 12px 16px;
  border-radius: var(--bew-interactive-radius);
  color: inherit;
  background: var(--bew-fill-1);
  text-decoration: none;
}

.moment-card__additional--no-cover {
  grid-template-columns: minmax(0, 1fr) auto;
}

.moment-card__additional img {
  width: 40px;
  height: 40px;
  border-radius: var(--bew-radius-md);
  object-fit: cover;
}

.moment-card__additional span {
  display: flex;
  min-width: 0;
  min-height: 40px;
  flex-direction: column;
  justify-content: center;
}

.moment-card__additional strong,
.moment-card__additional small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__additional small {
  margin-top: var(--bew-space-1);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
}

.moment-card__additional em {
  margin-left: 12px;
  padding-right: 4px;
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  font-style: normal;
}

.moment-card__avatar {
  width: 21px;
  height: 21px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bew-fill-1);
}

.moment-card__likes {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  margin-left: auto;
  padding: var(--bew-space-1) var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-radius-md);
  color: var(--bew-text-2);
  background: transparent;
  cursor: pointer;
  font: inherit;
  white-space: nowrap;
  transition:
    color 0.16s ease,
    background-color 0.16s ease,
    transform 0.16s ease;
}

.moment-card__likes:hover {
  color: var(--bew-theme-color);
  background: color-mix(in srgb, var(--bew-theme-color) 10%, transparent);
}

.moment-card__likes:active {
  transform: scale(0.94);
}

.moment-card__likes.is-liked {
  color: var(--bew-theme-color);
}

.moment-card__likes:disabled {
  cursor: wait;
  opacity: 0.65;
}

.moment-card__likes.is-unavailable {
  cursor: not-allowed;
}

.moment-card__header {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  padding: var(--bew-space-3) var(--bew-space-4);
}

.moment-card__header .moment-card__avatar {
  width: 36px;
  height: 36px;
}

.moment-card__identity {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.moment-card__identity strong,
.moment-card__identity small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__identity strong {
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
}

.moment-card__identity small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
}

.moment-card__main {
  padding: 0 var(--bew-space-4) var(--bew-space-3);
}

.moment-card__main--has-media {
  display: grid;
  grid-template-columns: minmax(170px, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: var(--bew-space-3);
}

.moment-card__main--live {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
}

.moment-card__main--live .moment-card__body {
  order: 1;
  height: auto;
  max-height: none;
}

.moment-card__main--live .moment-card__media {
  order: 2;
  width: 100%;
}

.moment-card__main--live .moment-card__cover--media {
  aspect-ratio: 16 / 9;
}

.moment-card__media {
  min-width: 0;
  overflow: hidden;
  border-radius: var(--bew-media-radius);
}

.moment-card__cover--media {
  aspect-ratio: 16 / 9;
}

.moment-card__gallery {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: var(--bew-space-1);
  margin-top: var(--bew-space-3);
  overflow: hidden;
  border-radius: var(--bew-media-radius);
  aspect-ratio: 1;
  background: var(--bew-fill-1);
}

.moment-card__gallery--1 {
  grid-template-columns: 1fr;
}

.moment-card__gallery--2,
.moment-card__gallery--4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.moment-card__gallery--2 {
  aspect-ratio: 2 / 1;
}

.moment-card__gallery--3 {
  aspect-ratio: 3 / 1;
}

.moment-card__gallery--5,
.moment-card__gallery--6 {
  aspect-ratio: 3 / 2;
}

.moment-card__gallery > img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: cover;
  object-position: center top;
  background: var(--bew-fill-1);
}

.moment-card__gallery .moment-card__image-count {
  right: 8px;
  bottom: 8px;
}

.moment-card__text-cover {
  min-height: var(--moment-card-text-cover-min-height, 176px);
  box-sizing: border-box;
}

.moment-card__text-cover--video {
  min-height: 0;
  aspect-ratio: 16 / 9;
}

.moment-card__body {
  min-width: 0;
  padding: 0;
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
  background: var(--bew-fill-2);
}

.moment-card__more-btn:active {
  background: var(--bew-fill-3);
}

.moment-card__more-btn:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 2px;
}

.moment-card__main--video .moment-card__body {
  display: flex;
  height: max(95.625px, calc((100cqw - 44px) * 0.28125));
  flex-direction: column;
  overflow: hidden;
}

.moment-card__main--video.moment-card__main--live .moment-card__body {
  height: auto;
  max-height: none;
}

.moment-card__main--video .moment-card__desc {
  min-height: 0;
  flex: 1 1 auto;
  -webkit-line-clamp: var(--moment-card-description-lines, unset);
  text-overflow: ellipsis;
}

.moment-card__main--video:not(.moment-card__main--live) .moment-card__title {
  display: -webkit-box;
  flex: 0 0 auto;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  text-overflow: ellipsis;
}

.moment-card--text .moment-card__body {
  min-height: var(--moment-card-text-body-min-height, 120px);
  padding-top: 0;
}

.moment-card--text .moment-card__desc,
.moment-card--forward-video .moment-card__desc {
  -webkit-line-clamp: 7;
}

.moment-card--forward-draw .moment-card__body {
  min-height: 0;
}

.moment-card--compact-text .moment-card__body {
  min-height: 0;
}

.moment-card__title {
  margin-bottom: var(--bew-space-2);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.moment-card__desc {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  -webkit-line-clamp: 7;
}

.moment-card__emoji {
  display: inline-block;
  width: 1.35em;
  height: 1.35em;
  margin: 0 0.08em;
  vertical-align: -0.28em;
  object-fit: contain;
}

.moment-card__emoji--large {
  width: 1.6em;
  height: 1.6em;
  vertical-align: -0.4em;
}

.moment-card__rich-link {
  color: var(--bew-theme-color);
  text-decoration: none;
  text-underline-offset: 0.15em;
}

.moment-card__rich-link:hover {
  text-decoration: underline;
}

.moment-card__forward-video {
  display: grid;
  grid-template-columns: minmax(150px, 44%) minmax(0, 1fr);
  margin-top: var(--bew-space-3);
  overflow: hidden;
  border: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 58%);
  border-radius: var(--bew-card-radius);
  color: inherit;
  background: var(--bew-fill-1);
  box-sizing: border-box;
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.moment-card__forward-video:hover,
.moment-card__forward-video:focus-visible {
  border-color: color-mix(in oklab, var(--bew-theme-color), transparent 48%);
  background: color-mix(in oklab, var(--bew-theme-color) 7%, var(--bew-fill-1));
  outline: none;
}

.moment-card__forward-video-cover {
  position: relative;
  display: block;
  min-width: 0;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: #111;
}

.moment-card__forward-video-cover > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-card__forward-gallery {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: var(--bew-space-1);
  margin: 0 var(--bew-space-3) var(--bew-space-3);
  overflow: hidden;
  border-radius: var(--bew-media-radius);
  aspect-ratio: 1;
  background: var(--bew-fill-1);
}

.moment-card__forward-gallery--1 {
  grid-template-columns: 1fr;
}

.moment-card__forward-gallery--2,
.moment-card__forward-gallery--4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.moment-card__forward-gallery--2 {
  aspect-ratio: 2 / 1;
}

.moment-card__forward-gallery--3 {
  aspect-ratio: 3 / 1;
}

.moment-card__forward-gallery--5,
.moment-card__forward-gallery--6 {
  aspect-ratio: 3 / 2;
}

.moment-card__forward-gallery > img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: cover;
  object-position: center top;
  background: var(--bew-fill-1);
}

.moment-card__video-stats {
  position: absolute;
  inset: auto 0 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-2);
  min-height: 28px;
  padding: 12px 8px 4px;
  color: #fff;
  background: linear-gradient(to bottom, transparent, rgb(0 0 0 / 72%));
  box-sizing: border-box;
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-shadow: 0 1px 2px rgb(0 0 0 / 65%);
}

.moment-card__video-stat-group,
.moment-card__video-stat-group > span {
  display: inline-flex;
  min-width: 0;
  align-items: center;
}

.moment-card__video-stat-group {
  gap: var(--bew-space-2);
}

.moment-card__video-stat-group > span {
  gap: var(--bew-space-1);
}

.moment-card__forward-video-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2) var(--bew-space-3);
}

.moment-card__forward-video-info strong {
  display: -webkit-box;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.moment-card__forward-video-info small {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-1);
  overflow: hidden;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__additional--footer {
  margin: 0 var(--bew-space-4) var(--bew-space-3);
}

.moment-card__hot-comment {
  display: flex;
  width: 100%;
  max-width: 100%;
  min-height: 40px;
  align-items: center;
  gap: var(--bew-space-2);
  margin: 0 0 var(--bew-space-3);
  padding: var(--bew-space-2) var(--bew-space-4);
  overflow: hidden;
  border: 0;
  border-radius: 0;
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  box-sizing: border-box;
  cursor: pointer;
  font: inherit;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  text-align: left;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__hot-comment:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
}

.moment-card__hot-comment-label {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--bew-space-1);
  color: var(--bew-theme-color);
  font-weight: var(--bew-font-weight-semibold);
}

.moment-card__hot-comment-content {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  gap: 0;
  min-height: 42px;
  margin: 0;
  border-top: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 64%);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

.moment-card__footer > a,
.moment-card__footer > button,
.moment-card__footer > .moment-card__footer-stat {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  color: inherit;
  background: transparent;
  box-sizing: border-box;
  font: inherit;
  text-decoration: none;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background-color 0.16s ease;
}

.moment-card__footer-stat {
  cursor: default;
}

.moment-card__footer > a:hover,
.moment-card__footer > button:hover {
  color: var(--bew-theme-color);
  background: color-mix(in srgb, var(--bew-theme-color) 8%, transparent);
}

.moment-card__footer > :not(:first-child) {
  border-left: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 72%);
}

.moment-card__footer .moment-card__likes:active {
  transform: none;
}

.moment-card__footer .moment-card__likes:disabled {
  cursor: wait;
  opacity: 0.65;
}

@container (max-width: 359px) {
  .moment-card__main--has-media {
    display: flex;
    flex-direction: column;
  }

  .moment-card__media {
    width: 100%;
  }

  .moment-card__main--video .moment-card__body {
    height: auto;
    max-height: 220px;
  }

  .moment-card--text .moment-card__body {
    min-height: 0;
  }
}

@container (max-width: 379px) {
  .moment-card__open-label {
    display: none;
  }
}
</style>
