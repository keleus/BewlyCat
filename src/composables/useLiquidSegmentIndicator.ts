import { useResizeObserver } from '@vueuse/core'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toValue, watch } from 'vue'

export interface LiquidSegmentRect {
  x: number
  y: number
  width: number
  height: number
}

/** Keep in sync with CSS move duration for wheel threshold / cooldown */
export const LIQUID_MOVE_DURATION_MS = 400

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function easeOutCubic(t: number) {
  const p = clamp(t, 0, 1)
  return 1 - (1 - p) ** 3
}

interface LiquidGeometry {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Liquid capsule morph: always keeps full item-sized rounded pill.
 * Never collapses into a ball or compresses on the cross-axis.
 * The sticky feel comes only from stretching along the travel direction.
 */
function computeLiquidGeometry(from: LiquidSegmentRect, to: LiquidSegmentRect, t: number): LiquidGeometry {
  const progress = clamp(t, 0, 1)

  if (progress <= 0.001) {
    return { x: from.x, y: from.y, width: from.width, height: from.height }
  }
  if (progress >= 0.999) {
    return { x: to.x, y: to.y, width: to.width, height: to.height }
  }

  const dx = (to.x + to.width / 2) - (from.x + from.width / 2)
  const dy = (to.y + to.height / 2) - (from.y + from.height / 2)
  const dist = Math.hypot(dx, dy)
  const isHoriz = Math.abs(dx) >= Math.abs(dy)

  // Position and size share the same eased progress so width/height never
  // lag behind translation — that was what produced the "runs, then shrinks"
  // two-stage read.
  const posT = easeOutCubic(progress)
  const baseW = lerp(from.width, to.width, posT)
  const baseH = lerp(from.height, to.height, posT)
  const baseCx = lerp(from.x + from.width / 2, to.x + to.width / 2, posT)
  const baseCy = lerp(from.y + from.height / 2, to.y + to.height / 2, posT)

  // Stretch is bound to *remaining* distance, not an independent envelope:
  // the blob elongates while it still has ground to cover and snaps back to
  // its resting pill shape the instant it arrives. This is what makes the
  // motion read as a single liquid gesture instead of move + settle.
  const remaining = 1 - posT
  const envelope = remaining ** 0.5
  const stretch = Math.min(dist * 0.40, Math.max(baseW, baseH) * 0.8) * envelope

  if (isHoriz) {
    const width = baseW + stretch
    return {
      x: baseCx - width / 2,
      y: baseCy - baseH / 2,
      width,
      height: baseH,
    }
  }

  const height = baseH + stretch
  return {
    x: baseCx - baseW / 2,
    y: baseCy - height / 2,
    width: baseW,
    height,
  }
}

/**
 * Sliding liquid indicator for segmented controls / dock.
 */
export function useLiquidSegmentIndicator(options: {
  containerRef: Ref<HTMLElement | null | undefined>
  activeKey: MaybeRefOrGetter<unknown>
  itemSelector?: string
  activeItemSelector?: string
}) {
  const itemSelector = options.itemSelector ?? '[data-segment-item]'
  const activeItemSelector = options.activeItemSelector ?? `${itemSelector}[data-active="true"]`

  const rect = ref<LiquidSegmentRect>({ x: 0, y: 0, width: 0, height: 0 })
  const visible = ref(false)
  const isMoving = ref(false)
  const scrubbing = ref(false)

  let moveTimer: ReturnType<typeof setTimeout> | undefined
  let rafId: number | undefined
  let ready = false
  let fromRect: LiquidSegmentRect | null = null
  let previewTarget: HTMLElement | null = null
  let previewProgress = 0
  let animToken = 0

  const indicatorStyle = computed(() => {
    const { x, y, width, height } = rect.value
    return {
      width: `${Math.max(width, 0)}px`,
      height: `${Math.max(height, 0)}px`,
      opacity: visible.value ? '1' : '0',
      transform: `translate3d(${x}px, ${y}px, 0)`,
    } as Record<string, string | undefined>
  })

  function clearMoveTimer() {
    if (moveTimer !== undefined) {
      clearTimeout(moveTimer)
      moveTimer = undefined
    }
  }

  function cancelRaf() {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId)
      rafId = undefined
    }
  }

  function markMoving(duration = LIQUID_MOVE_DURATION_MS) {
    isMoving.value = true
    clearMoveTimer()
    moveTimer = setTimeout(() => {
      isMoving.value = false
      moveTimer = undefined
    }, duration)
  }

  function applyGeometry(geo: LiquidGeometry) {
    rect.value = {
      x: geo.x,
      y: geo.y,
      width: geo.width,
      height: geo.height,
    }
  }

  function applySettled(next: LiquidSegmentRect) {
    rect.value = { ...next }
    fromRect = { ...next }
  }

  function readItemRect(container: HTMLElement, el: HTMLElement): LiquidSegmentRect {
    const containerBox = container.getBoundingClientRect()
    const itemBox = el.getBoundingClientRect()
    return {
      x: itemBox.left - containerBox.left - container.clientLeft + container.scrollLeft,
      y: itemBox.top - containerBox.top - container.clientTop + container.scrollTop,
      width: itemBox.width,
      height: itemBox.height,
    }
  }

  function animateMorph(from: LiquidSegmentRect, to: LiquidSegmentRect) {
    cancelRaf()
    const token = ++animToken
    const start = performance.now()
    markMoving(LIQUID_MOVE_DURATION_MS)
    fromRect = { ...from }

    const tick = (now: number) => {
      if (token !== animToken)
        return
      const t = clamp((now - start) / LIQUID_MOVE_DURATION_MS, 0, 1)
      applyGeometry(computeLiquidGeometry(from, to, t))
      if (t < 1) {
        rafId = requestAnimationFrame(tick)
      }
      else {
        rafId = undefined
        applySettled(to)
        isMoving.value = false
      }
    }
    rafId = requestAnimationFrame(tick)
  }

  function measure(immediate = false) {
    const container = options.containerRef.value
    if (!container) {
      visible.value = false
      return
    }

    const activeEl = container.querySelector(activeItemSelector) as HTMLElement | null
    if (!activeEl) {
      visible.value = false
      return
    }

    const activeRect = readItemRect(container, activeEl)

    if (previewTarget && previewProgress > 0 && container.contains(previewTarget)) {
      const targetRect = readItemRect(container, previewTarget)
      applyGeometry(computeLiquidGeometry(activeRect, targetRect, previewProgress))
      visible.value = true
      isMoving.value = true
      return
    }

    if (immediate || !ready || !visible.value || !fromRect) {
      cancelRaf()
      animToken++
      applySettled(activeRect)
      visible.value = true
      ready = true
      isMoving.value = false
      return
    }

    const origin = fromRect
    const changed = Math.abs(activeRect.x - origin.x) > 0.5
      || Math.abs(activeRect.y - origin.y) > 0.5
      || Math.abs(activeRect.width - origin.width) > 0.5
      || Math.abs(activeRect.height - origin.height) > 0.5

    if (!changed) {
      applySettled(activeRect)
      return
    }

    animateMorph(origin, activeRect)
    visible.value = true
    ready = true
  }

  async function updateIndicator(immediate = false) {
    await nextTick()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => measure(immediate))
    })
  }

  function setPreview(targetEl: HTMLElement | null, progress: number) {
    if (!targetEl || progress <= 0) {
      clearPreview()
      return
    }

    cancelRaf()
    animToken++
    previewTarget = targetEl
    previewProgress = clamp(progress, 0, 1)
    scrubbing.value = true
    isMoving.value = true
    measure(true)
  }

  function clearPreview(animateBack = true) {
    const hadPreview = previewProgress > 0 || !!previewTarget
    const container = options.containerRef.value
    const activeEl = container?.querySelector(activeItemSelector) as HTMLElement | null
    const currentGeo: LiquidSegmentRect = { ...rect.value }

    previewTarget = null
    previewProgress = 0
    scrubbing.value = false

    if (!hadPreview)
      return

    if (animateBack && container && activeEl) {
      const activeRect = readItemRect(container, activeEl)
      animateMorph(currentGeo, activeRect)
    }
    else {
      void updateIndicator(true)
    }
  }

  watch(() => toValue(options.activeKey), () => {
    previewTarget = null
    previewProgress = 0
    scrubbing.value = false
    void updateIndicator(false)
  })

  useResizeObserver(options.containerRef, () => {
    void updateIndicator(true)
  })

  onMounted(() => {
    void updateIndicator(true)
  })

  onBeforeUnmount(() => {
    clearMoveTimer()
    cancelRaf()
  })

  return {
    indicatorStyle,
    isMoving,
    scrubbing,
    updateIndicator,
    setPreview,
    clearPreview,
    moveDurationMs: LIQUID_MOVE_DURATION_MS,
  }
}
