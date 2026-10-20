<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import Dialog from '~/components/Dialog.vue'
import { DRAWER_VIDEO_ENTER_PAGE_FULL, DRAWER_VIDEO_EXIT_PAGE_FULL, VIDEO_DIALOG_IFRAME_NAME } from '~/constants/globalEvents'
import {
  DIALOG_SAFE_HEIGHT,
  disposeDialogIframe,
  PLAYER_DIALOG_MAX_WIDTH,
  prepareDialogIframeDocument,
  readIframePlayerImmersive,
  watchIframePlayerImmersive,
} from '~/utils/videoDialog'

const props = defineProps<{
  url: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
const loadingGifUrl = browser.runtime.getURL('/assets/loading.gif')

const iframeRef = ref<HTMLIFrameElement | null>(null)
const frameLoaded = ref(false)
const playerImmersive = ref(false)
const externalUrl = ref(props.url)
let stopPlayerModeWatch: (() => void) | null = null
let focusRetryTimer: ReturnType<typeof setTimeout> | null = null
let isDisposed = false

function clearFocusRetryTimer() {
  if (focusRetryTimer) {
    clearTimeout(focusRetryTimer)
    focusRetryTimer = null
  }
}

function focusIframe(retryCount = 3) {
  clearFocusRetryTimer()

  nextTick(() => {
    requestAnimationFrame(() => {
      const iframe = iframeRef.value
      if (!iframe || isDisposed)
        return

      iframe.focus({ preventScroll: true })
      try {
        iframe.contentWindow?.focus()
      }
      catch {
        // 跨域 iframe 可能拒绝直接聚焦 window；此时保留 iframe 元素焦点。
      }

      if (retryCount > 0) {
        focusRetryTimer = setTimeout(() => {
          focusIframe(retryCount - 1)
        }, 120)
      }
    })
  })
}

function syncPlayerImmersive() {
  const iframe = iframeRef.value
  if (!iframe) {
    playerImmersive.value = false
    return
  }

  const immersive = readIframePlayerImmersive(iframe)
  if (immersive !== null)
    playerImmersive.value = immersive
}

function syncExternalUrl() {
  let url = props.url
  try {
    const currentUrl = iframeRef.value?.contentWindow?.location.href
    if (currentUrl && /^https?:\/\//.test(currentUrl))
      url = currentUrl
  }
  catch {
    // 跨域页面无法读取地址，保留原始链接。
  }
  // 与 iframe 的 src 分开，更新外链时不能重新挂载播放器。
  externalUrl.value = url
  return url
}

function handleIframeLoad(event: Event) {
  const iframe = event.target as HTMLIFrameElement | null
  if (!iframe || iframe !== iframeRef.value || isDisposed)
    return

  syncExternalUrl()
  prepareDialogIframeDocument(iframe)
  // 弹窗打开后把焦点移入 iframe，确保播放器快捷键与 ESC 立即生效。
  focusIframe()
  stopPlayerModeWatch?.()
  stopPlayerModeWatch = watchIframePlayerImmersive(iframe, syncPlayerImmersive)
  frameLoaded.value = true
}

function destroyIframe() {
  clearFocusRetryTimer()
  stopPlayerModeWatch?.()
  stopPlayerModeWatch = null
  playerImmersive.value = false

  const iframe = iframeRef.value
  if (!iframe)
    return
  // 先断开组件侧引用，about:blank 的迟到 load 事件不得重新注册观察器。
  iframeRef.value = null
  disposeDialogIframe(iframe)
}

function close() {
  if (isDisposed)
    return
  isDisposed = true
  destroyIframe()
  emit('close')
}

function openInNewTab() {
  const url = syncExternalUrl()
  if (!url)
    return

  window.open(url, '_blank', 'noopener,noreferrer')
  close()
}

function handleFrameMessage(event: MessageEvent) {
  if (!iframeRef.value || event.source !== iframeRef.value.contentWindow)
    return

  const messageType = event.data && typeof event.data === 'object' ? event.data.type : event.data
  if (messageType === DRAWER_VIDEO_ENTER_PAGE_FULL) {
    playerImmersive.value = true
    return
  }
  if (messageType === DRAWER_VIDEO_EXIT_PAGE_FULL) {
    syncPlayerImmersive()
    return
  }
  // iframe 内未被播放器消费的 ESC 会请求关闭弹窗
  if (messageType === 'BEWLY_DRAWER_CLOSE_REQUEST')
    close()
}

useEventListener(window, 'message', handleFrameMessage)

onBeforeUnmount(() => {
  isDisposed = true
  destroyIframe()
})
</script>

<template>
  <Dialog
    append-to-bewly-body
    content-flush
    transition-name="moments-dialog"
    :show-header="false"
    :show-border="false"
    :show-footer="false"
    :frosted-glass="false"
    :close-on-confirm="false"
    :title="t('video_dialog.title')"
    :width="PLAYER_DIALOG_MAX_WIDTH"
    :height="DIALOG_SAFE_HEIGHT"
    :content-height="DIALOG_SAFE_HEIGHT"
    :content-max-height="DIALOG_SAFE_HEIGHT"
    @close="close"
  >
    <template #floating-actions>
      <div
        class="video-dialog-actions"
        :style="{
          width: PLAYER_DIALOG_MAX_WIDTH,
          height: DIALOG_SAFE_HEIGHT,
        }"
      >
        <div class="video-dialog-actions__bar">
          <a
            class="video-dialog-actions__open"
            :class="{ 'is-hidden': playerImmersive }"
            :href="externalUrl"
            :aria-hidden="playerImmersive ? 'true' : undefined"
            :tabindex="playerImmersive ? -1 : 0"
            target="_blank"
            rel="noopener noreferrer"
            @pointerdown="syncExternalUrl"
            @focus="syncExternalUrl"
            @contextmenu="syncExternalUrl"
            @click.prevent.stop="openInNewTab"
          >
            {{ t('video_dialog.open_in_new_tab') }}
            <span i-tabler-external-link />
          </a>
          <button
            type="button"
            class="video-dialog-actions__close"
            :aria-label="t('video_dialog.close')"
            @click="close"
          >
            <span i-tabler-x />
          </button>
        </div>
      </div>
    </template>
    <div class="video-dialog-frame" :class="{ 'is-loading': !frameLoaded }">
      <div class="video-dialog-frame__loading" aria-hidden="true">
        <img class="video-dialog-frame__loading-icon" :src="loadingGifUrl" alt="" aria-hidden="true">
        {{ t('video_dialog.loading') }}
      </div>
      <iframe
        ref="iframeRef"
        class="video-dialog-frame__iframe"
        :name="VIDEO_DIALOG_IFRAME_NAME"
        :src="url"
        :title="t('video_dialog.title')"
        referrerpolicy="no-referrer-when-downgrade"
        allow="fullscreen; autoplay; clipboard-write"
        scrolling="yes"
        @load="handleIframeLoad"
      />
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.video-dialog-frame {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  border-radius: var(--bew-panel-radius);
  // 响应式 Dialog 约束高度，视频页在 iframe 内部滚动
  overflow: hidden;
  background: #000;
}
.video-dialog-frame__loading {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  color: var(--bew-text-2);
  background: var(--bew-bg);
  font-size: var(--bew-font-size-control);
  pointer-events: auto;
  opacity: 1;
  transition: opacity 0.18s ease;
}
.video-dialog-frame__loading-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex-shrink: 0;
}
.video-dialog-frame:not(.is-loading) .video-dialog-frame__loading {
  opacity: 0;
  pointer-events: none;
}
.video-dialog-frame__iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--bew-bg);
  // 允许 iframe 文档内部滚动（评论区等）
  overflow: auto;
}
.video-dialog-actions {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
.video-dialog-actions__bar {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  pointer-events: auto;
  transform: translateY(calc(100% + var(--bew-space-3)));
}
.video-dialog-actions__close {
  display: grid;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--bew-radius-full);
  place-items: center;
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-shadow: var(--bew-shadow-2);
  cursor: pointer;
  font-size: var(--bew-icon-size-md);
}
.video-dialog-actions__close:hover {
  background: var(--bew-elevated-solid-hover);
}
.video-dialog-actions__close:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 2px;
}
.video-dialog-actions__open {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-radius-full);
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-shadow: var(--bew-shadow-2);
  text-decoration: none;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  opacity: 0.92;
  transition: opacity 0.2s ease;
}
.video-dialog-actions__open:hover {
  opacity: 1;
}
.video-dialog-actions__open.is-hidden {
  display: none;
}
</style>
