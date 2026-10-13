<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'

import VideoWatchedTag from '~/components/VideoWatchedTag.vue'

import MomentVideoPreview from './MomentVideoPreview.vue'

// 横条视频卡：左封面、右标题与简介。根节点为链接，href / target / 点击监听由调用方经透传属性提供。
// 可选项缺省为 undefined，模板按 falsy 处理；cover/title 等必传项由调用方保证
const { variant = 'original' } = defineProps<{
  /** original：投稿视频，与卡片同底；forward：转发引用内的视频，独立底色 */
  variant?: 'original' | 'forward'
  /** 最终封面图 URL；空串回落到文字封面 */
  cover: string
  coverAlt?: string
  title: string
  /** 继承的视频简介，空则不渲染 */
  desc?: string
  author: string
  /** 提供时作者可点击跳转空间页（转发卡）；主卡为纯文本 */
  authorHref?: string
  /** 无封面时的文字占位文本 */
  textCoverText: string
  /** 非空渲染充电专属徽章 */
  chargeBadge?: string
  showStats?: boolean
  showPlay?: boolean
  play?: string
  /** 转发视频将统计放在信息区底部，封面只保留时长 */
  statsInInfo?: boolean
  showDanmaku?: boolean
  danmaku?: string
  showDuration?: boolean
  duration?: string
  watchedAid?: number | string
  watchedBvid?: string
  previewActive?: boolean
  previewUrl?: string
}>()

const emit = defineEmits<{
  coverLoad: [event: Event]
  mediaEnter: []
  mediaLeave: []
  previewVideo: [element: Element | null]
  previewCanplay: [event: Event]
  previewLeave: []
  authorClick: [event: MouseEvent]
}>()

function handlePreviewRef(element: Element | ComponentPublicInstance | null) {
  emit('previewVideo', element instanceof Element ? element : null)
}
</script>

<template>
  <a
    draggable="false"
    class="moment-card__video-card"
    :class="`moment-card__video-card--${variant}`"
  >
    <span
      class="moment-card__video-card-cover bew-cover-action-host"
      @mouseenter="emit('mediaEnter')"
      @mouseleave="emit('mediaLeave')"
    >
      <img
        v-if="cover"
        :src="cover"
        :alt="coverAlt || title"
        loading="lazy"
        decoding="async"
        @load="emit('coverLoad', $event)"
      >
      <span v-else class="moment-card__text-cover moment-card__text-cover--video">
        <span i-tabler-player-play-filled class="moment-card__text-cover-icon" aria-hidden="true" />
        <span>{{ textCoverText }}</span>
      </span>
      <MomentVideoPreview
        v-if="previewActive && previewUrl"
        :url="previewUrl"
        @video="handlePreviewRef"
        @canplay="emit('previewCanplay', $event)"
        @leave="emit('previewLeave')"
      />
      <span
        v-if="showStats"
        class="moment-card__video-stats"
      >
        <span class="moment-card__video-stat-group">
          <span v-if="showPlay && !statsInInfo">
            <span i-mingcute:play-circle-line aria-hidden="true" />
            {{ play }}
          </span>
        </span>
        <span v-if="showDuration" class="moment-card__video-duration">{{ duration }}</span>
      </span>
      <span v-if="chargeBadge" class="moment-card__charge-badge">{{ chargeBadge }}</span>
      <!-- 封面上的功能角标由功能所有者经插槽注入，布局组件不感知具体功能 -->
      <slot name="coverAction" />
    </span>
    <span class="moment-card__video-card-info">
      <strong>
        <VideoWatchedTag :aid="watchedAid" :bvid="watchedBvid" />
        {{ title }}
      </strong>
      <p v-if="desc" class="moment-card__video-card-desc">
        {{ desc }}
      </p>
      <small v-if="statsInInfo && (showPlay || showDanmaku)" class="moment-card__video-info-stats">
        <span v-if="showPlay">
          <span i-mingcute:play-circle-line aria-hidden="true" />
          {{ play }}
        </span>
        <span v-if="showDanmaku">
          <span i-mingcute:danmaku-line aria-hidden="true" />
          {{ danmaku }}
        </span>
      </small>
      <small v-else-if="!statsInInfo">
        <span i-tabler-user aria-hidden="true" />
        <a
          v-if="authorHref"
          draggable="false"
          :href="authorHref"
          class="moment-card__forward-author"
          rel="noopener noreferrer"
          @click="emit('authorClick', $event)"
        >{{ author }}</a>
        <template v-else>{{ author }}</template>
      </small>
    </span>
  </a>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card__video-card {
  @include mixins.interactive-layer;

  display: grid;
  grid-template-columns: minmax(150px, 44%) minmax(0, 1fr);
  margin-top: var(--bew-space-3);
  overflow: hidden;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-card-radius);
  color: inherit;
  background: var(--bew-fill-1);
  box-sizing: border-box;
  text-decoration: none;
  transition: background-color 0.16s ease;
}

.moment-card__video-card:hover,
.moment-card__video-card:focus-visible {
  background: var(--bew-fill-2);
}

/* 投稿视频属于当前动态正文，保持与卡片同底；灰底只用于转发引用层级。 */
.moment-card__video-card--original,
.moment-card__video-card--original:hover,
.moment-card__video-card--original:focus-visible {
  background: transparent;
}

.moment-card__video-card--forward {
  grid-template-columns: minmax(0, 40%) minmax(0, 1fr);
  margin-top: 0;
  background: var(--bew-content-solid);
}

.moment-card__video-card--forward:hover,
.moment-card__video-card--forward:focus-visible {
  background: var(--bew-content-solid);
}

.moment-card__video-card-cover {
  position: relative;
  display: block;
  min-width: 0;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: #111;
}

/* 简介撑高信息区时封面跟随整行，避免窄卡片的封面下方留白。 */
.moment-card__video-card--forward .moment-card__video-card-cover {
  align-self: stretch;
  aspect-ratio: auto;
}

.moment-card__video-card--forward .moment-card__video-card-cover::before {
  display: block;
  padding-top: 56.25%;
  content: "";
}

@include mixins.text-cover;
@include mixins.video-stats;

.moment-card__video-card-cover > img,
.moment-card__video-card-cover > video,
.moment-card__video-card-cover > .moment-card__text-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-card__charge-badge {
  @include mixins.charge-badge;
}

/* 信息区从条顶开始排：标题在上、简介紧随，发布者钉底 */
.moment-card__video-card-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3) var(--bew-space-4);
}

.moment-card__video-card-info strong {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* 继承的视频简介：弱化层级，与发布者本人文字区分 */
.moment-card__video-card-desc {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.moment-card__video-card-info small {
  /* 发布者固定在信息列底部，填充封面高于内容时的剩余空间 */
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--bew-space-1);
  margin-top: auto;
  overflow: hidden;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__video-info-stats {
  flex-wrap: wrap;
  gap: var(--bew-space-2) var(--bew-space-4);
}

.moment-card__video-info-stats > span {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
}

.moment-card__forward-author {
  @include mixins.interactive-layer;
  @include mixins.forward-author;
}
</style>
