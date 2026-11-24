<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useVideoPreviewSwipeSeek } from '~/composables/useVideoPreviewSwipeSeek'
import { settings } from '~/logic'

const props = defineProps<{ url: string; live?: boolean }>()
const emit = defineEmits<{
  video: [element: Element | null]
  canplay: [event: Event]
  leave: []
}>()
const videoRef = ref<HTMLVideoElement | null>(null)
const controls = computed(() => !props.live && settings.value.momentsEnableVideoControls)
const swipeSeek = computed(() => !props.live && settings.value.momentsEnableVideoPreviewSwipeSeek)
const {
  isScrubbing,
  scrubProgress,
  resetPreviewScrub,
  handlePreviewPointerDown,
  handlePreviewPointerMove,
  finishPreviewScrub,
  handlePreviewClick,
  handlePreviewDragStart,
} = useVideoPreviewSwipeSeek(videoRef, swipeSeek, controls)

const interactionEvents = computed(() =>
  swipeSeek.value
    ? {
        pointerdown: handlePreviewPointerDown,
        pointermove: handlePreviewPointerMove,
        pointerup: finishPreviewScrub,
        pointercancel: (event: PointerEvent) => finishPreviewScrub(event, true),
        dragstart: handlePreviewDragStart,
      }
    : {},
)

function handleClick(event: MouseEvent) {
  handlePreviewClick(event)
  if (controls.value) {
    event.preventDefault()
    event.stopPropagation()
  }
}

let wasFullscreen = false
function syncFullscreen() {
  const fullscreen = Boolean(videoRef.value?.matches(':fullscreen'))
  const hoverTarget = settings.value.momentsOnlyCoverVideoPreview
    ? '.moment-card__video-card-cover, .moment-card__cover--media'
    : '.moment-card'
  if (wasFullscreen && !fullscreen && !videoRef.value?.closest(hoverTarget)?.matches(':hover'))
    emit('leave')
  wasFullscreen = fullscreen
}

watch(videoRef, (element) => emit('video', element), { flush: 'post' })
watch(swipeSeek, resetPreviewScrub)
onMounted(() => document.addEventListener('fullscreenchange', syncFullscreen))
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  emit('video', null)
})
</script>

<template>
  <span
    class="moment-video-preview"
    :class="{ 'moment-video-preview--scrubbable': swipeSeek }"
    v-on="interactionEvents"
    @click="handleClick"
    @keydown.stop
  >
    <video
      ref="videoRef"
      :src="live ? undefined : url"
      :controls="controls"
      :loop="!live"
      :draggable="false"
      autoplay
      muted
      playsinline
      @canplay.once="emit('canplay', $event)"
    />
    <span v-if="isScrubbing && !controls" class="moment-video-preview__progress" aria-hidden="true">
      <span :style="{ transform: `scaleX(${scrubProgress / 100})` }" />
    </span>
  </span>
</template>

<style scoped lang="scss">
.moment-video-preview {
  position: absolute;
  // 高于媒体区域的整块跳转链接，让原生控制条和拖动手势可以接收事件。
  z-index: 3;
  inset: 0;
  display: block;

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.moment-video-preview--scrubbable {
  touch-action: pan-y;
  user-select: none;

  video {
    -webkit-user-drag: none;
  }
}

.moment-video-preview__progress {
  position: absolute;
  right: var(--bew-space-2);
  bottom: var(--bew-space-2);
  left: var(--bew-space-2);
  height: var(--bew-space-1);
  overflow: hidden;
  border-radius: var(--bew-badge-radius);
  background: rgb(255 255 255 / 35%);
  pointer-events: none;

  > span {
    display: block;
    height: 100%;
    background: var(--bew-theme-color);
    transform-origin: left center;
  }
}
</style>
