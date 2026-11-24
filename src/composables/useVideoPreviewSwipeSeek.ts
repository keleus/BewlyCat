import type { Ref } from 'vue'
import { onBeforeUnmount, ref } from 'vue'

/** 首页与动态视频预览共用的横向拖动调进度交互。 */
export function useVideoPreviewSwipeSeek(
  videoRef: Ref<HTMLVideoElement | null>,
  shouldEnableSwipeSeek: Readonly<Ref<boolean>>,
  shouldEnableVideoControls: Readonly<Ref<boolean>>,
  handlePreviewMouseMove: () => void = () => {},
) {
  const isScrubbing = ref(false)
  const scrubProgress = ref(0)
  /** 仅记录 pointerdown 意图；真正 scrub 需横向拖过阈值后才激活 */
  let activeScrubPointerId: number | null = null
  let scrubStartX = 0
  let scrubStartY = 0
  let scrubStartTime = 0
  let scrubPreviewWidth = 0
  /** 是否已确认为横向拖动手势（越过阈值）。长按/微抖不会置 true */
  let hasDragGesture = false
  let suppressPreviewClick = false
  let suppressPreviewClickTimeout: number | null = null
  let pendingScrubTime: number | null = null
  let scrubAnimationFrame: number | null = null
  let scrubSeekTimeout: number | null = null
  let lastScrubSeekAt = 0

  /** 需要明显的左右拖动才接管，避免长按/点击抖动误触并频繁 seek */
  const SCRUB_START_THRESHOLD_PX = 18
  const NEARBY_SEEK_RANGE_SECONDS = 30
  /** 拖动中降低视频 seek 频率；进度条仍即时更新 */
  const SCRUB_SEEK_INTERVAL_MS = 120

  function updateScrubProgress(videoEl: HTMLVideoElement) {
    scrubProgress.value =
      Number.isFinite(videoEl.duration) && videoEl.duration > 0
        ? Math.min(100, Math.max(0, (videoEl.currentTime / videoEl.duration) * 100))
        : 0
  }

  function clearScrubSeekSchedule() {
    if (scrubAnimationFrame !== null) {
      cancelAnimationFrame(scrubAnimationFrame)
      scrubAnimationFrame = null
    }
    if (scrubSeekTimeout !== null) {
      clearTimeout(scrubSeekTimeout)
      scrubSeekTimeout = null
    }
  }

  function resetPreviewScrub() {
    clearScrubSeekSchedule()
    activeScrubPointerId = null
    hasDragGesture = false
    isScrubbing.value = false
    pendingScrubTime = null
    scrubPreviewWidth = 0
    lastScrubSeekAt = 0
  }

  function getVideoTimeFromPointer(videoEl: HTMLVideoElement, pointerX: number) {
    if (scrubPreviewWidth <= 0) return null

    const duration = videoEl.duration
    if (!Number.isFinite(duration) || duration <= 0) return null

    const seekRange = Math.min(duration, NEARBY_SEEK_RANGE_SECONDS)
    const deltaX = pointerX - scrubStartX
    return Math.min(
      duration,
      Math.max(0, scrubStartTime + (deltaX / scrubPreviewWidth) * seekRange),
    )
  }

  function applyPendingScrubSeek(videoEl: HTMLVideoElement, timestamp = performance.now()) {
    const nextTime = pendingScrubTime
    if (nextTime === null) return

    lastScrubSeekAt = timestamp
    videoEl.currentTime = nextTime
  }

  /**
   * 进度条即时刷新；真正改 video.currentTime 做节流。
   * 节流等待结束后会补一次最新位置，避免拖动时画面卡住。
   */
  function scheduleVideoTimeUpdate(videoEl: HTMLVideoElement, targetTime: number) {
    pendingScrubTime = targetTime
    scrubProgress.value = Math.min(100, Math.max(0, (targetTime / videoEl.duration) * 100))

    const now = performance.now()
    const elapsed = now - lastScrubSeekAt
    if (elapsed >= SCRUB_SEEK_INTERVAL_MS) {
      clearScrubSeekSchedule()
      applyPendingScrubSeek(videoEl, now)
      return
    }

    if (scrubSeekTimeout !== null || scrubAnimationFrame !== null) return

    const waitMs = Math.max(0, SCRUB_SEEK_INTERVAL_MS - elapsed)
    scrubSeekTimeout = window.setTimeout(() => {
      scrubSeekTimeout = null
      scrubAnimationFrame = requestAnimationFrame((timestamp) => {
        scrubAnimationFrame = null
        if (pendingScrubTime === null || !hasDragGesture) return
        applyPendingScrubSeek(videoEl, timestamp)
      })
    }, waitMs)
  }

  function handlePreviewPointerDown(event: PointerEvent) {
    const videoEl = videoRef.value
    const previewEl = event.currentTarget as HTMLElement

    if (!shouldEnableSwipeSeek.value || !videoEl || event.button !== 0) return
    if (!Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return

    // Keep the native control bar interactive when it is enabled.
    const rect = previewEl.getBoundingClientRect()
    if (shouldEnableVideoControls.value && event.clientY >= rect.bottom - 40) return

    // 只记录起点。长按/点击不 seek、不 capture；需左右拖过阈值才激活。
    activeScrubPointerId = event.pointerId
    scrubStartX = event.clientX
    scrubStartY = event.clientY
    scrubStartTime = videoEl.currentTime
    scrubPreviewWidth = rect.width
    hasDragGesture = false
    pendingScrubTime = null
    lastScrubSeekAt = 0
  }

  function handlePreviewPointerMove(event: PointerEvent) {
    // 未进入横向 scrub 时才刷新控制条，避免拖动中额外响应式开销
    if (!hasDragGesture) handlePreviewMouseMove()

    if (activeScrubPointerId !== event.pointerId) return

    const videoEl = videoRef.value
    const previewEl = event.currentTarget as HTMLElement
    if (!videoEl || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return

    const deltaX = event.clientX - scrubStartX
    const deltaY = event.clientY - scrubStartY

    if (!hasDragGesture) {
      const horizontalDistance = Math.abs(deltaX)
      const verticalDistance = Math.abs(deltaY)

      // 位移不足：当作长按/静止，不处理
      if (horizontalDistance < SCRUB_START_THRESHOLD_PX) return

      // 纵向优先：交给页面滚动，放弃本次 scrub 意图
      if (horizontalDistance <= verticalDistance) {
        resetPreviewScrub()
        return
      }

      // 明确横向拖动一段距离后才接管
      hasDragGesture = true
      isScrubbing.value = true
      pendingScrubTime = scrubStartTime
      updateScrubProgress(videoEl)
      previewEl.setPointerCapture(event.pointerId)
    }

    const targetTime = getVideoTimeFromPointer(videoEl, event.clientX)
    if (targetTime !== null) scheduleVideoTimeUpdate(videoEl, targetTime)
    event.preventDefault()
    event.stopPropagation()
  }

  function finishPreviewScrub(event: PointerEvent, cancelled = false) {
    if (activeScrubPointerId !== event.pointerId) return

    const previewEl = event.currentTarget as HTMLElement
    if (previewEl.hasPointerCapture(event.pointerId))
      previewEl.releasePointerCapture(event.pointerId)

    const didDrag = hasDragGesture
    const finalScrubTime = pendingScrubTime
    resetPreviewScrub()

    // 未形成横向拖动（点击/长按）直接结束，不 seek、不拦截点击
    if (!didDrag || cancelled) return

    const videoEl = videoRef.value
    if (videoEl && finalScrubTime !== null) videoEl.currentTime = finalScrubTime

    suppressPreviewClick = true
    if (suppressPreviewClickTimeout !== null) clearTimeout(suppressPreviewClickTimeout)
    suppressPreviewClickTimeout = window.setTimeout(() => {
      suppressPreviewClick = false
      suppressPreviewClickTimeout = null
    }, 0)
    event.preventDefault()
    event.stopPropagation()
  }

  function handlePreviewClick(event: MouseEvent) {
    if (!suppressPreviewClick) return

    suppressPreviewClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  function handlePreviewDragStart(event: DragEvent) {
    event.preventDefault()
  }

  function disposeSwipeSeek() {
    resetPreviewScrub()
    if (suppressPreviewClickTimeout !== null) {
      clearTimeout(suppressPreviewClickTimeout)
      suppressPreviewClickTimeout = null
    }
    suppressPreviewClick = false
  }

  onBeforeUnmount(disposeSwipeSeek)

  return {
    isScrubbing,
    scrubProgress,
    resetPreviewScrub,
    disposeSwipeSeek,
    handlePreviewPointerDown,
    handlePreviewPointerMove,
    finishPreviewScrub,
    handlePreviewClick,
    handlePreviewDragStart,
  }
}
