<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'

import VideoWatchedTag from '~/components/VideoWatchedTag.vue'

// 可选项缺省为 undefined，模板按 falsy 处理；cover/title 等必传项由调用方保证
defineProps<{
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
  showDuration?: boolean
  duration?: string
  watchedAid?: number | string
  watchedBvid?: string
  watchLaterEnabled?: boolean
  watchLaterAdded?: boolean
  watchLaterLoading?: boolean
  previewActive?: boolean
  previewUrl?: string
}>()

const emit = defineEmits<{
  toggleWatchLater: []
  coverLoad: [event: Event]
  mediaEnter: []
  mediaLeave: []
  previewVideo: [element: Element | null]
  previewCanplay: [event: Event]
  authorClick: [event: MouseEvent]
}>()

const { t } = useI18n()

function handlePreviewRef(element: Element | ComponentPublicInstance | null) {
  emit('previewVideo', element instanceof Element ? element : null)
}
</script>

<template>
  <span
    class="moment-card__video-card-cover"
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
    <video
      v-if="previewActive && previewUrl"
      :ref="handlePreviewRef"
      :src="previewUrl"
      autoplay
      muted
      loop
      playsinline
      @canplay="emit('previewCanplay', $event)"
    />
    <span
      v-if="showStats"
      class="moment-card__video-stats"
    >
      <span class="moment-card__video-stat-group">
        <span v-if="showPlay">
          <span i-mingcute:play-circle-line aria-hidden="true" />
          {{ play }}
        </span>
      </span>
      <span v-if="showDuration" class="moment-card__video-duration">{{ duration }}</span>
    </span>
    <span v-if="chargeBadge" class="moment-card__charge-badge">{{ chargeBadge }}</span>
    <button
      v-if="watchLaterEnabled"
      type="button"
      class="moment-card__watch-later"
      :class="{ 'is-added': watchLaterAdded, 'is-loading': watchLaterLoading }"
      :aria-busy="watchLaterLoading || undefined"
      :aria-disabled="watchLaterLoading || undefined"
      :aria-label="watchLaterAdded ? t('moment_card.added_watch_later') : t('moment_card.add_watch_later')"
      :aria-pressed="watchLaterAdded"
      :title="watchLaterAdded ? t('moment_card.added_watch_later') : t('moment_card.add_watch_later')"
      @click.stop.prevent="emit('toggleWatchLater')"
    >
      <span v-if="watchLaterLoading" i-svg-spinners:ring-resize aria-hidden="true" />
      <span v-else-if="watchLaterAdded" i-line-md:confirm aria-hidden="true" />
      <span v-else i-mingcute:carplay-line aria-hidden="true" />
    </button>
  </span>
  <span class="moment-card__video-card-info">
    <strong>
      <VideoWatchedTag :aid="watchedAid" :bvid="watchedBvid" />
      {{ title }}
    </strong>
    <p v-if="desc" class="moment-card__video-card-desc">
      {{ desc }}
    </p>
    <small>
      <span i-tabler-user aria-hidden="true" />
      <a
        v-if="authorHref"
        :href="authorHref"
        class="moment-card__forward-author"
        rel="noopener noreferrer"
        @click="emit('authorClick', $event)"
      >{{ author }}</a>
      <template v-else>{{ author }}</template>
    </small>
  </span>
</template>
