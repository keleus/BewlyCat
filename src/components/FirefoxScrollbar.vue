<script setup lang="ts">
/**
 * 为插件滚动容器或原生页面视口绘制覆盖式滚动条。
 * 视口模式仍由 document 滚动，不移动原站 DOM 或替换其滚动容器。
 * 目标容器需自行隐藏原生滚动条（scrollbar-width: none）。
 */
import { useEventListener, useResizeObserver } from '@vueuse/core'

const props = defineProps<{
  target: HTMLElement | null
  viewport?: boolean
}>()

const MIN_THUMB_SIZE = 32

const trackRef = ref<HTMLElement>()
const thumbSize = ref(0)
const thumbOffset = ref(0)
const scrollable = ref(false)
const dragging = ref(false)

let frame = 0
let dragStartY = 0
let dragStartScrollTop = 0

function update() {
  frame = 0
  const target = props.target
  const track = trackRef.value
  if (!target || !track)
    return

  const { scrollHeight, clientHeight, scrollTop } = target
  const trackSize = track.clientHeight
  const maxScrollTop = scrollHeight - clientHeight
  // v-show 初始会隐藏轨道，此时高度为 0；先按内容判断显隐，
  // 显示后的 ResizeObserver 再计算滑块，避免永远停在隐藏状态。
  scrollable.value = maxScrollTop > 1
  if (!scrollable.value || trackSize <= 0)
    return

  const size = Math.min(trackSize, Math.max(MIN_THUMB_SIZE, trackSize * clientHeight / scrollHeight))
  thumbSize.value = size
  thumbOffset.value = (trackSize - size) * Math.min(1, Math.max(0, scrollTop / maxScrollTop))
}

function scheduleUpdate() {
  if (!frame)
    frame = requestAnimationFrame(update)
}

// 拖动 1px 滑块对应的滚动距离
function getScrollRatio(target: HTMLElement) {
  const trackSpace = (trackRef.value?.clientHeight ?? 0) - thumbSize.value
  return trackSpace > 0 ? (target.scrollHeight - target.clientHeight) / trackSpace : 0
}

function handleThumbPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !props.target)
    return
  event.preventDefault()
  event.stopPropagation()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  dragStartY = event.clientY
  dragStartScrollTop = props.target.scrollTop
}

function handleThumbPointerMove(event: PointerEvent) {
  const target = props.target
  if (!dragging.value || !target)
    return
  target.scrollTop = dragStartScrollTop + (event.clientY - dragStartY) * getScrollRatio(target)
}

function handleThumbPointerUp(event: PointerEvent) {
  if (!dragging.value)
    return
  dragging.value = false
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
}

// 点击轨道空白处按页翻动，与原生滚动条行为一致
function handleTrackPointerDown(event: PointerEvent) {
  const target = props.target
  const track = trackRef.value
  if (event.button !== 0 || !target || !track)
    return
  event.preventDefault()
  const clickOffset = event.clientY - track.getBoundingClientRect().top
  const direction = clickOffset < thumbOffset.value ? -1 : 1
  target.scrollBy({ top: direction * target.clientHeight * 0.9, behavior: 'smooth' })
}

// 根页面滚动在 document 派发事件，而不是在 scrollingElement 上。
useEventListener(() => props.viewport ? document : props.target, 'scroll', scheduleUpdate, { passive: true })
useResizeObserver(() => props.target, scheduleUpdate)
useResizeObserver(trackRef, scheduleUpdate)

// 内容高度变化（加载更多、切换页面）不会触发容器自身的 ResizeObserver
watch(() => props.target, (target, _previousTarget, onCleanup) => {
  scheduleUpdate()
  if (!target)
    return
  const contentObserver = new ResizeObserver(scheduleUpdate)
  const mutationObserver = new MutationObserver(() => {
    contentObserver.disconnect()
    for (const child of Array.from(target.children))
      contentObserver.observe(child)
    scheduleUpdate()
  })
  for (const child of Array.from(target.children))
    contentObserver.observe(child)
  mutationObserver.observe(target, { childList: true })
  onCleanup(() => {
    contentObserver.disconnect()
    mutationObserver.disconnect()
  })
}, { immediate: true, flush: 'post' })

onBeforeUnmount(() => {
  if (frame)
    cancelAnimationFrame(frame)
})
</script>

<template>
  <div
    v-show="scrollable"
    ref="trackRef"
    class="firefox-scrollbar"
    :class="{ 'firefox-scrollbar--dragging': dragging, 'firefox-scrollbar--viewport': viewport }"
    aria-hidden="true"
    @pointerdown.self="handleTrackPointerDown"
  >
    <div
      class="firefox-scrollbar__thumb"
      :style="{ height: `${thumbSize}px`, transform: `translateY(${thumbOffset}px)` }"
      @pointerdown="handleThumbPointerDown"
      @pointermove="handleThumbPointerMove"
      @pointerup="handleThumbPointerUp"
      @pointercancel="handleThumbPointerUp"
    />
  </div>
</template>

<style lang="scss" scoped>
.firefox-scrollbar {
  position: absolute;
  top: 2px;
  right: 0;
  bottom: 2px;
  z-index: 1;
  width: 12px;
  user-select: none;
}

.firefox-scrollbar__thumb {
  position: absolute;
  top: 0;
  right: 3px;
  width: 6px;
  border-radius: var(--bew-radius-full);
  background-color: rgba(120, 120, 140, 0.44);
  transition:
    width 0.15s ease,
    background-color 0.15s ease;
  will-change: transform;
}

.firefox-scrollbar--viewport {
  position: fixed;
  // 顶栏沿用已有雾层覆盖滑块与透明轨道，与首页 iframe 的叠放关系一致。
  z-index: 998;
}

.firefox-scrollbar:hover .firefox-scrollbar__thumb,
.firefox-scrollbar--dragging .firefox-scrollbar__thumb {
  width: 8px;
  background-color: rgba(120, 120, 140, 0.64);
}
</style>
