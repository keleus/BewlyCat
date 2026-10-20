<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import browser from 'webextension-polyfill'

import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import { numFormatter } from '~/utils/dataFormatter'
import type { ImmersiveFeedFrameState } from '~/utils/immersiveFeed'
import {
  createImmersiveFeedMessage,
  IMMERSIVE_FEED_FRAME_NAME,
  IMMERSIVE_FEED_PRELOAD_FRAME_NAME,
  ImmersiveFeedMessageType,
  isImmersiveFeedMessage,
  isTypingContext,
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
// 当前视频开播后稍等再预加载下一条，避免与当前视频争抢带宽
const PRELOAD_START_DELAY_MS = 1500
const loadingGifUrl = browser.runtime.getURL('/assets/loading.gif')

const { t } = useI18n()
const { mainAppRef } = useBewlyApp()

const rootRef = ref<HTMLElement | null>(null)
const frameElements = new Map<string, HTMLIFrameElement>()
const currentKey = ref<string | undefined>(props.initialKey)
// 已到列表末尾且仍在加载时，新数据到达后自动切到下一条
const pendingAdvance = ref(false)
// 新 iframe 完成宽屏布局并开播前保持遮罩，避免露出未整理的原始视频页
const isFrameShown = ref(false)
// 仅预加载下一条：preloadKey 为正在后台加载的视频，preparedKey 表示它已可直接显示
const preloadKey = ref<string>()
const preparedKey = ref<string>()
let frameShowTimer: ReturnType<typeof setTimeout> | undefined
let preloadTimer: ReturnType<typeof setTimeout> | undefined
let lastIndex = 0

const currentIndex = computed(() => currentKey.value
  ? props.items.findIndex(item => item.key === currentKey.value)
  : -1)
const currentItem = computed(() => currentIndex.value >= 0 ? props.items[currentIndex.value] : undefined)
const nextItem = computed(() => currentIndex.value >= 0 ? props.items[currentIndex.value + 1] : undefined)
const hasPrevious = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value >= 0
  && (currentIndex.value < props.items.length - 1 || !props.noMoreContent))

// 当前视频在前、预加载的下一条在后：切换时移除前者即可，不移动 iframe（移动会导致重新加载）
const frameItems = computed(() => {
  const frames: Array<{ item: ImmersiveFeedItem, active: boolean }> = []
  if (currentItem.value)
    frames.push({ item: currentItem.value, active: true })
  if (preloadKey.value && nextItem.value?.key === preloadKey.value)
    frames.push({ item: nextItem.value, active: false })
  return frames
})

function getFrameUrl(item: ImmersiveFeedItem) {
  return `${location.origin}/video/${item.video.bvid}/`
}

// 只传可结构化克隆的普通对象，推荐流数据本身是响应式代理
const feedState = computed<Omit<ImmersiveFeedFrameState, 'active'>>(() => ({
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

function clearPreload() {
  clearTimeout(preloadTimer)
  preloadTimer = undefined
  preloadKey.value = undefined
  preparedKey.value = undefined
}

watch(currentKey, (key) => {
  if (!key)
    return
  lastIndex = Math.max(0, currentIndex.value)
  clearTimeout(frameShowTimer)

  // 切到已预加载完成的下一条：同一个 iframe 转为当前视频，无需再等待
  const promoted = key === preloadKey.value && key === preparedKey.value
  clearPreload()
  if (promoted) {
    isFrameShown.value = true
  }
  else {
    isFrameShown.value = false
    frameShowTimer = setTimeout(showFrame, FRAME_SHOW_TIMEOUT_MS)
  }

  emit('play', key)
  void nextTick(() => {
    postFeedState()
    if (promoted)
      frameElements.get(key)?.focus()
  })
}, { immediate: true })

// 当前视频显示后再预加载下一条；只处理下一条，不保留或预加载上一条
watch([isFrameShown, () => nextItem.value?.key, () => settings.value.immersivePreloadNext], ([shown, nextKey, enabled]) => {
  if (!enabled || !nextKey) {
    clearPreload()
    return
  }
  if (!shown || preloadKey.value === nextKey || preloadTimer)
    return
  preloadTimer = setTimeout(() => {
    preloadTimer = undefined
    if (settings.value.immersivePreloadNext && nextItem.value?.key === nextKey) {
      preparedKey.value = undefined
      preloadKey.value = nextKey
    }
  }, PRELOAD_START_DELAY_MS)
})

onBeforeUnmount(() => {
  clearTimeout(frameShowTimer)
  clearTimeout(preloadTimer)
})

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

watch(feedState, () => postFeedState())

function setFrameElement(key: string, element: unknown) {
  if (element instanceof HTMLIFrameElement)
    frameElements.set(key, element)
  else
    frameElements.delete(key)
}

function postFeedState(targetKey?: string) {
  for (const [key, frame] of frameElements) {
    if (targetKey && key !== targetKey)
      continue
    const state: ImmersiveFeedFrameState = { ...feedState.value, active: key === currentKey.value }
    frame.contentWindow?.postMessage(
      createImmersiveFeedMessage(ImmersiveFeedMessageType.State, { state }),
      location.origin,
    )
  }
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

function handleFrameLoad(key: string) {
  // 让当前视频页直接接收键盘操作（空格暂停、↑↓ 切换等）；预加载页不抢焦点
  if (key === currentKey.value)
    frameElements.get(key)?.focus()
}

function getMessageFrameKey(source: MessageEventSource | null) {
  for (const [key, frame] of frameElements) {
    if (frame.contentWindow && frame.contentWindow === source)
      return key
  }
  return undefined
}

useEventListener(window, 'message', (event: MessageEvent) => {
  if (event.origin !== location.origin)
    return
  const frameKey = getMessageFrameKey(event.source)
  if (!frameKey)
    return
  const fromCurrent = frameKey === currentKey.value

  if (event.data?.type === FRAME_CLOSE_REQUEST) {
    if (fromCurrent)
      emit('close')
    return
  }
  if (!isImmersiveFeedMessage(event.data))
    return

  switch (event.data.type) {
    case ImmersiveFeedMessageType.Ready:
      postFeedState(frameKey)
      return
    case ImmersiveFeedMessageType.Prepared:
      if (frameKey === preloadKey.value)
        preparedKey.value = frameKey
      return
  }

  // 其余操作只接受当前视频页发出的请求
  if (!fromCurrent)
    return
  switch (event.data.type) {
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
  if (event.ctrlKey || event.metaKey || event.altKey || isTypingContext(event))
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
      handled = settings.value.immersiveKeyboardSwitch
      if (handled)
        goPrevious()
      break
    case 'ArrowDown':
    case 'PageDown':
    case 's':
    case 'S':
      handled = settings.value.immersiveKeyboardSwitch
      if (handled)
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
      <template v-if="currentItem">
        <iframe
          v-for="frame in frameItems"
          :key="frame.item.key"
          :ref="(element) => setFrameElement(frame.item.key, element)"
          class="immersive-feed__frame"
          :class="{ 'immersive-feed__frame--preload': !frame.active }"
          :name="frame.active ? IMMERSIVE_FEED_FRAME_NAME : IMMERSIVE_FEED_PRELOAD_FRAME_NAME"
          :src="getFrameUrl(frame.item)"
          :title="frame.item.video.title"
          :tabindex="frame.active ? undefined : -1"
          :aria-hidden="frame.active ? undefined : 'true'"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
          allowfullscreen
          @load="handleFrameLoad(frame.item.key)"
        />
      </template>
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
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  border: none;
  background: #0f1115;

  // 预加载页保持与当前页相同尺寸以便提前完成宽屏布局，只是不可见、不可交互
  &--preload {
    z-index: 0;
    opacity: 0;
    pointer-events: none;
  }
}

.immersive-feed__cover {
  position: absolute;
  inset: 0;
  z-index: 2;
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
