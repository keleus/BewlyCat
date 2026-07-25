import { useResizeObserver } from '@vueuse/core'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toValue, watch } from 'vue'

export interface LiquidSegmentRect {
  x: number
  y: number
  width: number
  height: number
}

const MOVE_DURATION_MS = 560

/**
 * Sliding liquid "blob" indicator for segmented controls.
 * Uses different easings on width vs translate to get a squeeze/stretch feel.
 */
export function useLiquidSegmentIndicator(options: {
  containerRef: Ref<HTMLElement | null | undefined>
  /** Active key used to remeasure when selection changes */
  activeKey: MaybeRefOrGetter<unknown>
  /** CSS selector for segment items inside the container */
  itemSelector?: string
  /** Attribute or class used to find the active item */
  activeItemSelector?: string
}) {
  const itemSelector = options.itemSelector ?? '[data-segment-item]'
  const activeItemSelector = options.activeItemSelector ?? `${itemSelector}[data-active="true"]`

  const rect = ref<LiquidSegmentRect>({ x: 0, y: 0, width: 0, height: 0 })
  const visible = ref(false)
  const isMoving = ref(false)
  let moveTimer: ReturnType<typeof setTimeout> | undefined
  let ready = false

  const indicatorStyle = computed(() => {
    const { x, y, width, height } = rect.value
    return {
      width: `${Math.max(width, 0)}px`,
      height: `${Math.max(height, 0)}px`,
      opacity: visible.value ? '1' : '0',
      transform: `translate3d(${x}px, ${y}px, 0)`,
      transition: ready
        ? undefined
        : 'none',
    } as Record<string, string | undefined>
  })

  function clearMoveTimer() {
    if (moveTimer !== undefined) {
      clearTimeout(moveTimer)
      moveTimer = undefined
    }
  }

  function markMoving() {
    isMoving.value = true
    clearMoveTimer()
    moveTimer = setTimeout(() => {
      isMoving.value = false
      moveTimer = undefined
    }, MOVE_DURATION_MS)
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

    const containerBox = container.getBoundingClientRect()
    const itemBox = activeEl.getBoundingClientRect()

    const next: LiquidSegmentRect = {
      x: itemBox.left - containerBox.left - container.clientLeft + container.scrollLeft,
      y: itemBox.top - containerBox.top - container.clientTop + container.scrollTop,
      width: itemBox.width,
      height: itemBox.height,
    }

    if (immediate || !ready || !visible.value) {
      const prevTransition = ready
      ready = false
      rect.value = next
      visible.value = true
      // restore transitions on next frame after first paint
      if (prevTransition || immediate) {
        requestAnimationFrame(() => {
          ready = true
        })
      }
      else {
        requestAnimationFrame(() => {
          ready = true
        })
      }
      return
    }

    const changed = Math.abs(next.x - rect.value.x) > 0.5
      || Math.abs(next.y - rect.value.y) > 0.5
      || Math.abs(next.width - rect.value.width) > 0.5
      || Math.abs(next.height - rect.value.height) > 0.5

    if (changed)
      markMoving()

    rect.value = next
    visible.value = true
    ready = true
  }

  async function updateIndicator(immediate = false) {
    await nextTick()
    // double rAF: wait for layout after class toggles / font metrics
    requestAnimationFrame(() => {
      requestAnimationFrame(() => measure(immediate))
    })
  }

  watch(() => toValue(options.activeKey), () => {
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
  })

  return {
    indicatorStyle,
    isMoving,
    updateIndicator,
  }
}
