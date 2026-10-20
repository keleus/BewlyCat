<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import browser from 'webextension-polyfill'

import { useBewlyApp } from '~/composables/useAppProvider'
import { numFormatter } from '~/utils/dataFormatter'
import type { ImmersiveFeedFrameState } from '~/utils/immersiveFeed'
import {
  createImmersiveFeedMessage,
  IMMERSIVE_FEED_FRAME_NAME,
  ImmersiveFeedMessageType,
  isImmersiveFeedMessage,
} from '~/utils/immersiveFeed'

import type { ImmersiveFeedItem } from './types'

const props = defineProps<{
  items: ImmersiveFeedItem[]
  initialKey?: string
  loading: boolean
  noMoreContent: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'loadMore'): void
  /** 切换到某条视频，供推荐流记录曝光与点击 */
  (e: 'play', key: string): void
}>()

// 剩余不足该数量时提前加载下一页推荐
const PRELOAD_REMAINING_COUNT = 4
// iframe 内的视频页在 Esc 未被页面自身消费时发出的关闭请求（与抽屉共用）
const FRAME_CLOSE_REQUEST = 'BEWLY_DRAWER_CLOSE_REQUEST'
// 视频无法开播（充电专享、地区限制等）时不再等待，按时撤下遮罩露出原生页面提示
const FRAME_SHOW_TIMEOUT_MS = 12_000
const loadingGifUrl = browser.runtime.getURL('/assets/loading.gif')

const { t } = useI18n()
const { mainAppRef } = useBewlyApp()

const rootRef = ref<HTMLElement | null>(null)
const frameRef = ref<HTMLIFrameElement | null>(null)
const currentKey = ref<string | undefined>(props.initialKey)
// 已到列表末尾且仍在加载时，新数据到达后自动切到下一条
const pendingAdvance = ref(false)
// 新 iframe 完成宽屏布局并开播前保持遮罩，避免露出未整理的原始视频页
const isFrameShown = ref(false)
let frameShowTimer: ReturnType<typeof setTimeout> | undefined
let lastIndex = 0

const currentIndex = computed(() => currentKey.value
  ? props.items.findIndex(item => item.key === currentKey.value)
  : -1)
const currentItem = computed(() => currentIndex.value >= 0 ? props.items[currentIndex.value] : undefined)
const hasPrevious = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value >= 0
  && (currentIndex.value < props.items.length - 1 || !props.noMoreContent))
// 每条视频使用新的 iframe（以 key 区分），不会在页面历史中留下记录
const frameUrl = computed(() => currentItem.value
  ? `${location.origin}/video/${currentItem.value.video.bvid}/`
  : '')

// 只传可结构化克隆的普通对象，推荐流数据本身是响应式代理
const frameState = computed<ImmersiveFeedFrameState>(() => ({
  items: props.items.map(({ key, video }) => ({
    key,
    bvid: video.bvid,
    title: video.title,
    cover: video.cover,
    author: video.author.name,
    durationStr: video.durationStr,
    viewStr: video.viewStr || (video.view !== undefined ? numFormatter(video.view) : undefined),
  })),
  currentKey: currentKey.value,
  loading: props.loading,
  noMoreContent: props.noMoreContent,
  hasPrevious: hasPrevious.value,
  hasNext: hasNext.value,
}))

// 列表被刷新或过滤后当前视频可能不在其中，回退到原位置附近的视频
watch(() => props.items, (items) => {
  if (!items.length)
    return
  if (!currentKey.value || !items.some(item => item.key === currentKey.value)) {
    currentKey.value = items[Math.min(lastIndex, items.length - 1)].key
    pendingAdvance.value = false
  }
  else if (pendingAdvance.value && currentIndex.value < items.length - 1) {
    currentKey.value = items[currentIndex.value + 1].key
    pendingAdvance.value = false
  }
}, { immediate: true })

function showFrame() {
  clearTimeout(frameShowTimer)
  frameShowTimer = undefined
  isFrameShown.value = true
}

watch(currentKey, (key) => {
  if (!key)
    return
  lastIndex = Math.max(0, currentIndex.value)
  isFrameShown.value = false
  clearTimeout(frameShowTimer)
  frameShowTimer = setTimeout(showFrame, FRAME_SHOW_TIMEOUT_MS)
  emit('play', key)
}, { immediate: true })

onBeforeUnmount(() => clearTimeout(frameShowTimer))

watch([currentIndex, () => props.items.length, () => props.loading, () => props.noMoreContent], () => {
  if (props.loading || props.noMoreContent)
    return
  if (props.items.length - currentIndex.value <= PRELOAD_REMAINING_COUNT)
    emit('loadMore')
}, { immediate: true })

watch(() => props.noMoreContent, (noMore) => {
  if (noMore)
    pendingAdvance.value = false
})

watch(frameState, postFrameState)

function postFrameState() {
  frameRef.value?.contentWindow?.postMessage(
    createImmersiveFeedMessage(ImmersiveFeedMessageType.State, { state: frameState.value }),
    location.origin,
  )
}

function goTo(key: string) {
  if (props.items.some(item => item.key === key)) {
    pendingAdvance.value = false
    currentKey.value = key
  }
}

function goNext() {
  if (currentIndex.value >= 0 && currentIndex.value < props.items.length - 1) {
    currentKey.value = props.items[currentIndex.value + 1].key
    return
  }
  if (props.noMoreContent)
    return
  pendingAdvance.value = true
  if (!props.loading)
    emit('loadMore')
}

function goPrevious() {
  pendingAdvance.value = false
  if (currentIndex.value > 0)
    currentKey.value = props.items[currentIndex.value - 1].key
}

function handleFrameLoad() {
  // 让视频页直接接收键盘操作（空格暂停、↑↓ 切换等）
  frameRef.value?.focus()
}

useEventListener(window, 'message', (event: MessageEvent) => {
  const frameWindow = frameRef.value?.contentWindow
  if (!frameWindow || event.source !== frameWindow || event.origin !== location.origin)
    return

  if (event.data?.type === FRAME_CLOSE_REQUEST) {
    emit('close')
    return
  }
  if (!isImmersiveFeedMessage(event.data))
    return

  switch (event.data.type) {
    case ImmersiveFeedMessageType.Ready:
      postFrameState()
      break
    case ImmersiveFeedMessageType.Shown:
      showFrame()
      break
    case ImmersiveFeedMessageType.Select:
      if (event.data.key)
        goTo(event.data.key)
      break
    case ImmersiveFeedMessageType.Previous:
      goPrevious()
      break
    case ImmersiveFeedMessageType.Next:
    case ImmersiveFeedMessageType.Ended:
      goNext()
      break
    case ImmersiveFeedMessageType.LoadMore:
      if (!props.loading && !props.noMoreContent)
        emit('loadMore')
      break
    case ImmersiveFeedMessageType.Close:
      emit('close')
      break
  }
})

// 焦点仍在首页（iframe 尚未加载）时的快捷键；捕获阶段避免作用到背后的推荐流
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
    return

  let handled = true
  switch (event.key) {
    case 'Escape':
      emit('close')
      break
    case 'ArrowUp':
    case 'PageUp':
    case 'w':
    case 'W':
      goPrevious()
      break
    case 'ArrowDown':
    case 'PageDown':
    case 's':
    case 'S':
      goNext()
      break
    default:
      handled = false
  }
  if (!handled)
    return
  event.preventDefault()
  event.stopImmediatePropagation()
}, { capture: true })

onMounted(() => {
  rootRef.value?.focus({ preventScroll: true })
})
</script>

<template>
  <Teleport :to="mainAppRef" :disabled="!mainAppRef">
    <div
      ref="rootRef"
      class="immersive-feed"
      role="dialog"
      aria-modal="true"
      :aria-label="t('home.immersive_mode')"
      tabindex="-1"
      @wheel.prevent
    >
      <iframe
        v-if="currentItem"
        :key="currentItem.key"
        ref="frameRef"
        class="immersive-feed__frame"
        :name="IMMERSIVE_FEED_FRAME_NAME"
        :src="frameUrl"
        :title="currentItem.video.title"
        allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
        allowfullscreen
        @load="handleFrameLoad"
      />
      <div v-else class="immersive-feed__placeholder">
        <span v-if="loading" class="i-mingcute-loading-3-line immersive-feed__spinner" aria-hidden="true" />
        <p>{{ loading ? t('home.immersive_loading') : t('home.immersive_empty') }}</p>
        <button type="button" class="immersive-feed__exit" @click="emit('close')">
          <span class="i-mingcute-close-line" aria-hidden="true" />
          {{ t('home.immersive_exit') }}
        </button>
      </div>

      <Transition name="immersive-feed-cover">
        <div
          v-if="currentItem && !isFrameShown"
          class="immersive-feed__cover"
          role="status"
          aria-live="polite"
        >
          <img class="immersive-feed__cover-icon" :src="loadingGifUrl" alt="" aria-hidden="true">
          <div class="immersive-feed__cover-text">
            <span class="immersive-feed__cover-label">{{ t('home.immersive_switching') }}</span>
            <span class="immersive-feed__cover-title">{{ currentItem.video.title }}</span>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.immersive-feed {
  position: fixed;
  inset: 0;
  z-index: var(--bew-z-immersive-feed);
  // 与 Bewly 宽屏的舞台背景一致，避免切换视频时闪白
  background: #0f1115;
  outline: none;
  overscroll-behavior: contain;
}

.immersive-feed__frame {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
  background: #0f1115;
}

.immersive-feed__cover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-3);
  padding: 0 var(--bew-space-6);
  background: #0f1115;
  color: rgb(255 255 255 / 0.88);
}

.immersive-feed__cover-icon {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  object-fit: contain;
}

.immersive-feed__cover-text {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
  min-width: 0;
  max-width: 560px;
}

.immersive-feed__cover-label {
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  font-weight: var(--bew-font-weight-medium);
}

.immersive-feed__cover-title {
  overflow: hidden;
  color: rgb(255 255 255 / 0.6);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.immersive-feed-cover-leave-active {
  transition: opacity var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease);
}

.immersive-feed-cover-leave-to {
  opacity: 0;
}

.immersive-feed__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-3);
  height: 100%;
  color: rgb(255 255 255 / 0.72);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);

  p {
    margin: 0;
  }
}

.immersive-feed__spinner {
  font-size: 32px;
  animation: immersive-feed-spin 1s linear infinite;
}

.immersive-feed__exit {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-4);
  border: none;
  border-radius: var(--bew-radius-full);
  background: rgb(255 255 255 / 0.16);
  color: #fff;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  cursor: pointer;

  &:hover {
    background: rgb(255 255 255 / 0.24);
  }
}

@keyframes immersive-feed-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .immersive-feed__spinner {
    animation-duration: 3s;
  }

  .immersive-feed-cover-leave-active {
    transition: none;
  }
}
</style>
