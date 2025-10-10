<script setup lang="ts">
import { Icon } from '@iconify/vue'

import Button from '~/components/Button.vue'
import Tooltip from '~/components/Tooltip.vue'
import { settings } from '~/logic'
import { calcCurrentTime } from '~/utils/dataFormatter'

import type { Video } from '../types'

interface Props {
  video: Video
  layout: 'modern' | 'old'
  removed: boolean
  isHover: boolean
  shouldHideOverlayElements: boolean
  previewVideoUrl: string
  videoElement: HTMLVideoElement | null
  isInWatchLater: boolean
  showWatcherLater: boolean
  coverImageUrl: string
  // Modern layout specific
  coverStatValues?: {
    view: string
    danmaku: string
    like: string
    duration: string
  }
  coverStatsVisibility?: {
    view: boolean
    danmaku: boolean
    like: boolean
    duration: boolean
  }
  hasCoverStats?: boolean
  shouldHideCoverStats?: boolean
  coverStatsStyle?: Record<string, string>
}

defineProps<Props>()
const emit = defineEmits<{
  toggleWatchLater: []
  undo: []
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
</script>

<template>
  <div
    class="group/cover"
    shrink-0
    h-fit relative bg="$bew-skeleton" rounded="$bew-radius"
    :class="{ 'overflow-hidden': layout === 'modern' }"
    cursor-pointer
    group-hover:z-2
    transform="~ translate-z-0"
  >
    <!-- Video cover -->
    <Picture
      :src="coverImageUrl"
      loading="eager"
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
        @click.prevent.stop="emit('undo')"
      >
        <template #left>
          <div i-mingcute-back-line text-lg />
        </template>
        {{ $t('common.undo') }}
      </Button>
    </div>

    <!-- Video preview -->
    <Transition v-if="!removed && settings.enableVideoPreview" name="fade">
      <video
        v-if="previewVideoUrl && isHover"
        ref="videoRef"
        autoplay muted
        :controls="settings.enableVideoCtrlBarOnVideoCard"
        :style="{ pointerEvents: settings.enableVideoCtrlBarOnVideoCard ? 'auto' : 'none' }"
        pos="absolute top-0 left-0" w-full aspect-video rounded="$bew-radius" bg-black
      >
        <source :src="previewVideoUrl" type="video/mp4">
      </video>
    </Transition>

    <!-- Ranking Number -->
    <div
      v-if="video.rank"
      pos="absolute top-0"
      p-2
      :class="layout === 'modern' ? 'group-hover:opacity-0' : { 'opacity-0': shouldHideOverlayElements }"
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
      <!-- Old layout: Video Duration (right bottom) -->
      <div
        v-if="layout === 'old' && (video.duration || video.durationStr)"
        pos="absolute bottom-0 right-0"
        z="2"
        p="x-2 y-1"
        m="1"
        rounded="$bew-radius"
        text="!white xs"
        bg="black opacity-60"
        :class="{ 'opacity-0': shouldHideOverlayElements }"
        duration-300
      >
        {{ video.duration ? calcCurrentTime(video.duration) : video.durationStr }}
      </div>

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
        :class="layout === 'modern' ? 'group-hover:opacity-0' : { 'opacity-0': shouldHideOverlayElements }"
        pos="absolute left-0 top-0" bg="$bew-theme-color" text="xs white" fw-bold
        p="x-2 y-1" m-1 inline-block rounded="$bew-radius" duration-300
      >
        LIVE
        <i i-svg-spinners:pulse-3 align-middle mt--0.2em />
      </div>

      <div
        v-if="video.badge && Object.keys(video.badge).length > 0"
        :class="layout === 'modern' ? 'group-hover:opacity-0' : { 'opacity-0': shouldHideOverlayElements }"
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
        @click.prevent.stop="emit('toggleWatchLater')"
      >
        <Tooltip v-if="!isInWatchLater" :content="$t('common.save_to_watch_later')" placement="bottom-right" type="dark">
          <div i-mingcute:carplay-line />
        </Tooltip>
        <Tooltip v-else :content="$t('common.added')" placement="bottom-right" type="dark">
          <Icon icon="line-md:confirm" />
        </Tooltip>
      </button>

      <!-- Modern layout: Cover stats (bottom overlay) -->
      <div
        v-if="layout === 'modern' && hasCoverStats"
        class="video-card-cover-stats"
        :class="{ 'video-card-cover-stats--hidden': shouldHideCoverStats }"
        :style="coverStatsStyle"
      >
        <div class="video-card-cover-stats__items">
          <span
            v-if="coverStatsVisibility?.view"
            class="video-card-cover-stats__item"
          >
            <Icon icon="mingcute:play-circle-line" class="video-card-cover-stats__icon" aria-hidden="true" />
            <span class="video-card-cover-stats__value">{{ coverStatValues?.view }}</span>
          </span>

          <span
            v-if="coverStatsVisibility?.danmaku"
            class="video-card-cover-stats__item"
          >
            <Icon icon="mingcute:danmaku-line" class="video-card-cover-stats__icon" aria-hidden="true" />
            <span class="video-card-cover-stats__value">{{ coverStatValues?.danmaku }}</span>
          </span>

          <span
            v-if="coverStatsVisibility?.like"
            class="video-card-cover-stats__item"
          >
            <Icon icon="mingcute:thumb-up-2-line" class="video-card-cover-stats__icon" aria-hidden="true" />
            <span class="video-card-cover-stats__value">{{ coverStatValues?.like }}</span>
          </span>
        </div>

        <span
          v-if="coverStatsVisibility?.duration"
          class="video-card-cover-stats__item video-card-cover-stats__item--duration"
        >
          <span class="video-card-cover-stats__value">{{ coverStatValues?.duration }}</span>
        </span>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
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
</style>
