<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type flvjs from 'flv.js'
import type { ErrorData, Events } from 'hls.js'
import Hls from 'hls.js'

import Button from '~/components/Button.vue'
import LazyPicture from '~/components/LazyPicture.vue'
import Tooltip from '~/components/Tooltip.vue'
import { settings } from '~/logic'
import { calcCurrentTime } from '~/utils/dataFormatter'

import type { Video } from '../types'

interface Props {
  skeleton?: boolean
  video?: Video
  layout: 'modern' | 'old'
  horizontal?: boolean
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

const props = defineProps<Props>()
const emit = defineEmits<{
  toggleWatchLater: []
  undo: []
  imageLoaded: []
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const isLoadingStream = ref<boolean>(false)
let hls: Hls | null = null
let flvPlayer: flvjs.Player | null = null

function cleanupPlayers() {
  if (hls) {
    hls.destroy()
    hls = null
  }
  if (flvPlayer) {
    flvPlayer.pause()
    flvPlayer.unload()
    flvPlayer.detachMediaElement()
    flvPlayer.destroy()
    flvPlayer = null
  }
  isLoadingStream.value = false
}

async function setupStream(url: string, videoEl: HTMLVideoElement) {
  // Check if URL is FLV stream
  if (url.includes('.flv')) {
    try {
      // 动态导入 flv.js 以避免构建时依赖问题
      const flvjsModule = await import('flv.js')
      const flvjs = flvjsModule.default

      if (flvjs.isSupported()) {
        // Cleanup previous players and clear video src
        cleanupPlayers()

        // Clear video element src to prevent conflicts
        videoEl.removeAttribute('src')
        videoEl.load()

        isLoadingStream.value = true

        flvPlayer = flvjs.createPlayer({
          type: 'flv',
          url,
          isLive: true,
        }, {
          enableWorker: false, // 在扩展环境中禁用 worker
          enableStashBuffer: false, // 禁用存储缓冲，减少延迟
          stashInitialSize: 128, // 初始缓冲大小
          lazyLoad: false,
          lazyLoadMaxDuration: 1,
          seekType: 'range',
        })

        flvPlayer.attachMediaElement(videoEl)
        flvPlayer.load()

        flvPlayer.on(flvjs.Events.LOADING_COMPLETE, () => {
          isLoadingStream.value = false
        })

        flvPlayer.on(flvjs.Events.ERROR, (errorType, errorDetail) => {
          console.error('FLV Player error:', errorType, errorDetail)
          isLoadingStream.value = false
          cleanupPlayers()
        })

        // 当有数据可以播放时立即播放
        videoEl.addEventListener('loadeddata', () => {
          isLoadingStream.value = false
          videoEl.play().catch(() => {
            // Ignore autoplay errors
          })
        }, { once: true })

        videoEl.addEventListener('canplay', () => {
          if (isLoadingStream.value) {
            isLoadingStream.value = false
          }
        }, { once: true })
      }
    }
    catch (error) {
      console.error('Failed to load flv.js:', error)
      isLoadingStream.value = false
    }
  }
  // Check if URL is HLS stream (.m3u8)
  else if (url.includes('.m3u8') || url.includes('m3u8')) {
    if (Hls.isSupported()) {
      // Cleanup previous players and clear video src
      cleanupPlayers()

      // Clear video element src to prevent conflicts
      videoEl.removeAttribute('src')
      videoEl.load()

      isLoadingStream.value = true

      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        // 优化配置以更快开始播放
        maxBufferLength: 10, // 减少缓冲长度
        maxMaxBufferLength: 20,
        liveSyncDurationCount: 2, // 减少直播同步计数
        liveMaxLatencyDurationCount: 5,
        maxBufferSize: 60 * 1000 * 1000, // 60MB
      })

      hls.loadSource(url)
      hls.attachMedia(videoEl)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        isLoadingStream.value = false
        videoEl.play().catch(() => {
          // Ignore autoplay errors
        })
      })

      hls.on(Hls.Events.ERROR, (_event: Events.ERROR, data: ErrorData) => {
        if (data.fatal) {
          isLoadingStream.value = false
          switch (data.type) {
            case Hls.ErrorTypes.MEDIA_ERROR:
              // Try to recover from media errors
              hls?.recoverMediaError()
              break
            default:
              // For other fatal errors, cleanup
              cleanupPlayers()
              break
          }
        }
      })

      // 添加首帧加载事件
      hls.on(Hls.Events.BUFFER_APPENDED, () => {
        if (isLoadingStream.value) {
          isLoadingStream.value = false
        }
      })
    }
    // cSpell:ignore mpegurl
    else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      isLoadingStream.value = true
      videoEl.src = url

      const handleCanPlay = () => {
        isLoadingStream.value = false
        videoEl.removeEventListener('canplay', handleCanPlay)
      }

      videoEl.addEventListener('canplay', handleCanPlay)
      videoEl.play().catch(() => {
        isLoadingStream.value = false
        // Ignore autoplay errors
      })
    }
  }
}

// Watch for preview URL and videoRef changes
watch([() => props.previewVideoUrl, () => props.isHover, videoRef], ([url, isHover, videoEl]) => {
  if (!isHover) {
    cleanupPlayers()
    if (videoEl) {
      // Clear video src when not hovering
      videoEl.removeAttribute('src')
      videoEl.load()
    }
    return
  }

  if (!url || !videoEl)
    return

  setupStream(url, videoEl)
})

// Cleanup on unmount
onBeforeUnmount(() => {
  cleanupPlayers()
})

// Shadow styles are now injected globally via CSS variables from App.vue
// No per-card computation needed - significant performance improvement!
</script>

<template>
  <div
    class="group/cover"
    shrink-0
    relative bg="$bew-skeleton" rounded="$bew-radius"
    overflow-hidden
    cursor-pointer
    group-hover:z-2
    style="aspect-ratio: 16 / 9; contain: layout style;"
  >
    <!-- Skeleton mode -->
    <div
      v-if="skeleton"
      w-full h-full bg="$bew-skeleton" rounded="$bew-radius"
      class="animate-pulse"
      style="aspect-ratio: 16 / 9;"
    />

    <!-- Normal mode -->
    <template v-else>
      <!-- Video cover -->
      <LazyPicture
        :src="coverImageUrl"
        loading="lazy"
        root-margin="150px"
        :show-skeleton="false"
        @loaded="emit('imageLoaded')"
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
        <div
          v-if="previewVideoUrl && isHover"
          pos="absolute top-0 left-0" w-full aspect-video rounded="$bew-radius" bg-black
        >
          <video
            ref="videoRef"
            autoplay muted
            :controls="settings.enableVideoCtrlBarOnVideoCard && !video?.roomid"
            :style="{ pointerEvents: settings.enableVideoCtrlBarOnVideoCard && !video?.roomid ? 'auto' : 'none' }"
            w-full h-full
          >
            <source :src="previewVideoUrl">
          </video>

          <!-- Loading indicator -->
          <Transition name="fade">
            <div
              v-if="isLoadingStream"
              pos="absolute top-0 left-0"
              w-full h-full
              flex="~ items-center justify-center"
              bg="black/50"
              pointer-events-none
            >
              <div class="loading-spinner" />
            </div>
          </Transition>
        </div>
      </Transition>

      <!-- Ranking Number -->
      <div
        v-if="video?.rank"
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

      <template v-if="!removed && video">
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
          class="video-card-cover-stats video-card-stats"
          :class="{ 'video-card-cover-stats--hidden': shouldHideCoverStats }"
          :style="coverStatsStyle"
        >
          <div class="video-card-cover-stats__items">
            <span
              v-if="coverStatsVisibility?.view"
              class="video-card-cover-stats__item cover-stat-view"
            >
              <Icon icon="mingcute:play-circle-line" class="video-card-cover-stats__icon" aria-hidden="true" />
              <span class="video-card-cover-stats__value">{{ coverStatValues?.view }}</span>
            </span>

            <span
              v-if="coverStatsVisibility?.danmaku"
              class="video-card-cover-stats__item cover-stat-danmaku"
            >
              <Icon icon="mingcute:danmaku-line" class="video-card-cover-stats__icon" aria-hidden="true" />
              <span class="video-card-cover-stats__value">{{ coverStatValues?.danmaku }}</span>
            </span>

            <span
              v-if="coverStatsVisibility?.like"
              class="video-card-cover-stats__item cover-stat-like"
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
  /* 只让下面两个角继承圆角，上面保持直线 */
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
  /* 确保容器不会溢出 */
  overflow: hidden;
}

.video-card-cover-stats::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(
    --bew-video-card-shadow-gradient,
    linear-gradient(
      to top,
      rgba(0, 0, 0, 0.8) 0%,
      rgba(0, 0, 0, 0.7) 30%,
      rgba(0, 0, 0, 0.5) 50%,
      rgba(0, 0, 0, 0.3) 70%,
      rgba(0, 0, 0, 0.15) 85%,
      rgba(0, 0, 0, 0.05) 95%,
      transparent 100%
    )
  );
  height: var(--bew-video-card-shadow-height-multiplier, calc(var(--video-card-stats-overlay-scale, 1.4) * 100%));
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
  /* 不允许收缩，避免数字被截断 */
  flex-shrink: 0;
  /* 允许内容溢出，由容器查询控制显示 */
  min-width: 0;
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
  /* 时长固定在最右侧，不收缩 */
  flex-shrink: 0;
}

/* 响应式显示控制已移至 VideoCard.vue 的 coverStatsVisibility 计算属性 */
/* 避免 CSS Container Query 在特定系统缩放（如 Windows 125%）下的性能问题 */

.video-card-cover-stats--hidden {
  opacity: 0;
  visibility: hidden;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
