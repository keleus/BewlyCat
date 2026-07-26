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
export const LIQUID_MOVE_DURATION_MS = 580

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function easeInOutCubic(t: number) {
  const p = clamp(t, 0, 1)
  return p < 0.5
    ? 4 * p * p * p
    : 1 - ((-2 * p + 2) ** 3) / 2
}

function centerOf(rect: LiquidSegmentRect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

interface LiquidGeometry {
  x: number
  y: number
  width: number
  height: number
  /** 1 = rest, >1 stretched along travel, <1 squeezed on cross-axis */
  scaleX: number
  scaleY: number
}

/**
 * Smooth capsule droplet between two items.
 * Always a full rounded pill (border-radius 9999) — no clip-path, so no cusps/arrows.
 * "Liquid" feel comes from lead/trail lag + mild mid-travel squash/stretch.
 */
function computeLiquidGeometry(from: LiquidSegmentRect, to: LiquidSegmentRect, t: number): LiquidGeometry {
  const progress = clamp(t, 0, 1)
  const c0 = centerOf(from)
  const c1 = centerOf(to)
  const dx = c1.x - c0.x
  const dy = c1.y - c0.y
  const isHoriz = Math.abs(dx) >= Math.abs(dy)

  if (progress <= 0.001) {
    return {
      x: from.x,
      y: from.y,
      width: from.width,
      height: from.height,
      scaleX: 1,
      scaleY: 1,
    }
  }
  if (progress >= 0.999) {
    return {
      x: to.x,
      y: to.y,
      width: to.width,
      height: to.height,
      scaleX: 1,
      scaleY: 1,
    }
  }

  // Lead advances first; trail lags → mass is squeezed toward the destination
  const leadT = easeInOutCubic(clamp(progress * 1.05, 0, 1))
  const trailT = easeInOutCubic(clamp((progress - 0.14) / 0.86, 0, 1))

  const lead = {
    x: lerp(c0.x, c1.x, leadT),
    y: lerp(c0.y, c1.y, leadT),
  }
  const trail = {
    x: lerp(c0.x, c1.x, trailT),
    y: lerp(c0.y, c1.y, trailT),
  }

  const r0 = Math.min(from.width, from.height) / 2
  const r1 = Math.min(to.width, to.height) / 2
  const radius = lerp(r0, r1, (leadT + trailT) / 2)

  // How far apart the two "masses" are (drives elongation)
  const span = Math.hypot(lead.x - trail.x, lead.y - trail.y)
  // Mid-travel emphasis for squash (smooth, peaks at 0.5)
  const mid = Math.sin(Math.PI * progress)

  if (isHoriz) {
    const width = Math.max(span + radius * 2, radius * 2)
    const height = radius * 2
    const cx = (lead.x + trail.x) / 2
    const cy = (lead.y + trail.y) / 2
    // Stretch along X, gently squeeze Y at mid (still fully round caps)
    const scaleX = 1 + 0.06 * mid
    const scaleY = 1 - 0.16 * mid
    return {
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      scaleX,
      scaleY,
    }
  }

  const height = Math.max(span + radius * 2, radius * 2)
  const width = radius * 2
  const cx = (lead.x + trail.x) / 2
  const cy = (lead.y + trail.y) / 2
  const scaleX = 1 - 0.16 * mid
  const scaleY = 1 + 0.06 * mid
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    scaleX,
    scaleY,
  }
}

/**
 * Sliding liquid droplet indicator for segmented controls.
 * Morphs as a smooth rounded capsule (no pointed clip-paths).
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
  const scaleX = ref(1)
  const scaleY = ref(1)
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
    // Position by top-left, then scale from center for mid-travel squash
    return {
      width: `${Math.max(width, 0)}px`,
      height: `${Math.max(height, 0)}px`,
      opacity: visible.value ? '1' : '0',
      transform: `translate3d(${x}px, ${y}px, 0) scale(${scaleX.value}, ${scaleY.value})`,
      transition: 'opacity 200ms ease, background-color 220ms ease, box-shadow 220ms ease',
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
    scaleX.value = geo.scaleX
    scaleY.value = geo.scaleY
  }

  function applySettled(next: LiquidSegmentRect) {
    rect.value = next
    scaleX.value = 1
    scaleY.value = 1
    fromRect = next
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
    fromRect = from

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
