<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import WatchLaterCoverButton from '~/components/WatchLaterCoverButton.vue'
import { settings } from '~/logic'
import { normalizeWatchLaterTarget } from '~/utils/watchLaterActions'

import MomentVideoCard from './MomentVideoCard.vue'
import type { DisplayForwardVideo } from './types'
import { getAuthorSpaceUrl, getAvatarThumbnailUrl, getMomentThumbnailUrl } from './utils'

// 转发视频：引用层承载原 UP，内层横条视频卡承载视频信息。
const {
  video,
  author,
  authorMid,
  authorFace,
  authorAction,
  fallback,
  href = '',
  previewActive = false,
  previewUrl = '',
} = defineProps<{
  video: DisplayForwardVideo
  author: string
  authorMid?: string
  authorFace?: string
  /** 原 UP 的发布动作文案，如“投稿了视频” */
  authorAction?: string
  /** 无标题、无封面时的占位文案 */
  fallback: string
  /** 发布动作文案的落点（通常为转发动态详情） */
  href?: string
  previewActive?: boolean
  previewUrl?: string
}>()

const emit = defineEmits<{
  authorClick: [event: MouseEvent]
  actionClick: [event: MouseEvent]
  videoClick: [event: MouseEvent]
  mediaEnter: []
  mediaLeave: []
  previewLeave: []
  previewVideo: [element: Element | null]
  previewCanplay: [event: Event]
}>()

const { t } = useI18n()
const authorSpaceUrl = computed(() => getAuthorSpaceUrl(authorMid))
const watchLaterTarget = computed(() => normalizeWatchLaterTarget(video))
const showDuration = computed(() => settings.value.showVideoCardDuration && Boolean(video.duration))

function handlePreviewVideo(element: Element | ComponentPublicInstance | null) {
  emit('previewVideo', element instanceof Element ? element : null)
}
</script>

<template>
  <div class="moment-card__forward-video">
    <div class="moment-card__forward-video-header">
      <component
        :is="authorSpaceUrl ? 'a' : 'span'"
        :href="authorSpaceUrl || undefined"
        class="moment-card__forward-author moment-card__forward-video-identity"
        rel="noopener noreferrer"
        @click="emit('authorClick', $event)"
      >
        <img
          v-if="authorFace"
          :src="getAvatarThumbnailUrl(authorFace)"
          alt=""
          loading="lazy"
          decoding="async"
        >
        <span v-else class="moment-card__forward-video-avatar" aria-hidden="true">
          <span i-tabler-user />
        </span>
        <span class="moment-card__forward-video-name">{{ author }}</span>
      </component>
      <a
        :href="href"
        class="moment-card__forward-video-action moment-card__text-link"
        draggable="false"
        tabindex="-1"
        @click="emit('actionClick', $event)"
      >
        {{ authorAction || t('moment_card.video_post') }}
      </a>
    </div>
    <MomentVideoCard
      variant="forward"
      :href="video.url || undefined"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="t('moment_card.open_original_video', { title: video.title })"
      :cover="getMomentThumbnailUrl(video.cover)"
      :cover-alt="video.title"
      :title="video.title || fallback"
      :desc="video.desc"
      :author="author"
      :text-cover-text="fallback"
      stats-in-info
      :show-stats="showDuration && !(previewActive && settings.momentsEnableVideoControls)"
      :show-play="settings.showVideoCardViewCount && Boolean(video.play)"
      :play="video.play"
      :show-danmaku="settings.showVideoCardDanmakuCount && Boolean(video.danmaku)"
      :danmaku="video.danmaku"
      :show-duration="showDuration"
      :duration="video.duration"
      :watched-aid="video.aid"
      :watched-bvid="video.bvid"
      :preview-active="previewActive"
      :preview-url="previewUrl"
      @click="emit('videoClick', $event)"
      @media-enter="emit('mediaEnter')"
      @media-leave="emit('mediaLeave')"
      @preview-leave="emit('previewLeave')"
      @preview-video="handlePreviewVideo"
      @preview-canplay="(event: Event) => emit('previewCanplay', event)"
    >
      <template #coverAction>
        <WatchLaterCoverButton :target="watchLaterTarget" persistent />
      </template>
    </MomentVideoCard>
  </div>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card__forward-video {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-3);
  margin-top: var(--bew-space-4);
  padding: var(--bew-space-3);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-card-radius);
  background: var(--bew-fill-1);
  box-sizing: border-box;
}

.moment-card__forward-video-header {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.moment-card__forward-author {
  @include mixins.forward-author;
}

a.moment-card__forward-author,
.moment-card__text-link {
  @include mixins.interactive-layer;
}

.moment-card__text-link {
  @include mixins.text-link;
}

.moment-card__forward-video-header .moment-card__forward-video-identity {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-1);
  color: var(--bew-theme-color);
}

.moment-card__forward-video-identity:hover {
  text-decoration: underline;
}

.moment-card__forward-video-identity > img,
.moment-card__forward-video-avatar {
  display: grid;
  width: var(--bew-space-6);
  height: var(--bew-space-6);
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: var(--bew-fill-2);
  object-fit: cover;
  font-size: var(--bew-icon-size-sm);
}

.moment-card__forward-video-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__forward-video-action {
  min-width: 0;
  color: var(--bew-text-2);
  overflow-wrap: anywhere;
}
</style>
