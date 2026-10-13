<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'

import MomentVideoPreview from './MomentVideoPreview.vue'

// 视频 / 直播动态的 16:9 大封面；无封面时回落为文字占位封面。
const {
  cover = '',
  alt = '',
  href = '',
  live = false,
  ready = false,
  previewActive = false,
  previewUrl = '',
  showStats = false,
  showPlay = false,
  play = '',
  showDuration = false,
  duration = '',
  chargeBadge = '',
} = defineProps<{
  /** 最终封面图 URL；空串渲染文字封面 */
  cover?: string
  alt?: string
  /** 封面整块跳转地址（视频页或直播间） */
  href?: string
  live?: boolean
  /** 封面图淡入时机由列表控制，避免卡片未定位时闪现 */
  ready?: boolean
  previewActive?: boolean
  previewUrl?: string
  showStats?: boolean
  showPlay?: boolean
  play?: string
  showDuration?: boolean
  duration?: string
  /** 非空时渲染充电专属徽章 */
  chargeBadge?: string
}>()

const emit = defineEmits<{
  permalinkClick: [event: MouseEvent]
  /** 仅有封面图时触发，供调用方决定是否加载悬停预览 */
  mediaEnter: []
  mediaLeave: []
  coverLoad: [event: Event]
  previewVideo: [element: Element | null]
  previewCanplay: [event: Event]
  previewLeave: []
}>()

const { t } = useI18n()

function handlePreviewRef(element: Element | ComponentPublicInstance | null) {
  emit('previewVideo', element instanceof Element ? element : null)
}
</script>

<template>
  <div
    v-if="cover"
    class="moment-card__media moment-card__cover moment-card__cover--media"
    @mouseenter="emit('mediaEnter')"
    @mouseleave="emit('mediaLeave')"
  >
    <a
      v-if="href"
      draggable="false"
      class="moment-card__permalink"
      :href="href"
      tabindex="-1"
      aria-hidden="true"
      rel="noopener noreferrer"
      @click.capture="emit('permalinkClick', $event)"
    />
    <img
      :src="cover"
      :alt="alt"
      :class="{ 'is-ready': ready }"
      loading="lazy"
      decoding="async"
      @load="emit('coverLoad', $event)"
    >
    <MomentVideoPreview
      v-if="previewActive && previewUrl"
      :url="previewUrl"
      :live="live"
      @video="handlePreviewRef"
      @canplay="emit('previewCanplay', $event)"
      @leave="emit('previewLeave')"
    />
    <span v-if="showStats" class="moment-card__video-stats">
      <span class="moment-card__video-stat-group">
        <span v-if="showPlay">
          <span i-mingcute:play-circle-line aria-hidden="true" />
          {{ play }}
        </span>
      </span>
      <span v-if="showDuration" class="moment-card__video-duration">{{ duration }}</span>
    </span>
    <span v-if="live" class="moment-card__live-mark">
      LIVE
      <span i-svg-spinners:pulse-3 aria-hidden="true" />
    </span>
    <span v-if="chargeBadge" class="moment-card__charge-badge">
      {{ chargeBadge }}
    </span>
  </div>
  <div v-else class="moment-card__media moment-card__cover moment-card__text-cover moment-card__text-cover--video">
    <a
      v-if="href"
      draggable="false"
      class="moment-card__permalink"
      :href="href"
      tabindex="-1"
      aria-hidden="true"
      rel="noopener noreferrer"
      @click.capture="emit('permalinkClick', $event)"
    />
    <span v-if="live" i-tabler-live-photo class="moment-card__text-cover-icon" />
    <span v-else i-tabler-player-play-filled class="moment-card__text-cover-icon" />
    <span>{{ live ? t('moment_card.live_post') : t('moment_card.video_post') }}</span>
  </div>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card__media {
  @include mixins.interactive-layer;

  min-width: 0;
  overflow: hidden;
  border-radius: var(--bew-media-radius);
}

.moment-card__permalink {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.moment-card__cover {
  width: 100%;
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

.moment-card__cover--media > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-card__live-mark {
  position: absolute;
  top: var(--bew-space-2);
  left: var(--bew-space-2);
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-badge-radius);
  color: #fff;
  background: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-bold);
  letter-spacing: 0.02em;
}

.moment-card__charge-badge {
  @include mixins.charge-badge;
}

// 文字封面需排在 .moment-card__cover 之后，覆盖其默认底色。
@include mixins.text-cover;
@include mixins.video-stats;

@container (max-width: 359px) {
  .moment-card__media {
    width: 100%;
  }
}
</style>
