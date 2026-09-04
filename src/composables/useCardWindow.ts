import type { Ref } from 'vue'
import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, shallowRef, watch } from 'vue'

import { CardRowMetrics } from '~/utils/cardRowMetrics'

type CardKey = string | number

interface CardMeasurement {
  height: number
  estimatedHeight: number
  layout: string
}

export interface CardWindowSnapshot {
  measurements: [CardKey, CardMeasurement][]
  renderedKeys: CardKey[]
  anchor?: { key: CardKey, offset: number }
}

interface CardRange {
  start: number
  end: number
  /** A skipped range occupies one full-width grid track. */
  height?: number
}

/** Mount only nearby rows and rows containing an interaction that cannot be recycled. */
export function useCardWindow(options: {
  root: Ref<HTMLElement | null>
  container: Ref<HTMLElement | null>
  keys: Ref<CardKey[]>
  columns: Ref<number>
  gap: Ref<number>
  enabled: Ref<boolean>
  estimatedHeight: Ref<number>
  layout: Ref<string>
  canRelease: (key: CardKey) => boolean
  snapshot?: CardWindowSnapshot
  restoreScroll?: () => void
}) {
  const ranges = shallowRef<CardRange[]>([])
  const measurements = new Map<CardKey, CardMeasurement>(options.snapshot?.measurements)
  const slots = new Map<CardKey, HTMLElement>()
  const elementKeys = new WeakMap<Element, CardKey>()
  const indices = new Map<CardKey, number>()
  const metrics = new CardRowMetrics()
  let rowCount = 0
  let measuredColumns = options.columns.value
  let active = false
  let restoring = !!options.snapshot
  let generation = 0
  let frame: number | undefined
  let sweepTimer: ReturnType<typeof setTimeout> | undefined
  let resizeObserver: ResizeObserver | undefined
  let viewportObserver: ResizeObserver | undefined
  let scrollTarget: HTMLElement | Window | undefined
  let anchorPending = false
  let pendingAnchor: CardWindowSnapshot['anchor']
  let pendingScrollTop = 0
  let bookmark: { root: HTMLElement, scrollTop: number, anchor: CardWindowSnapshot['anchor'] } | undefined

  function viewport() {
    const root = options.root.value
    const top = root && root !== document.scrollingElement ? root.getBoundingClientRect().top + root.clientTop : 0
    return { top, height: Math.max(1, root?.clientHeight || window.innerHeight) }
  }

  function visibleAnchor() {
    const { top, height } = viewport()
    let anchor: CardWindowSnapshot['anchor']
    for (const [key, element] of slots) {
      if (!element.isConnected)
        continue
      const rect = element.getBoundingClientRect()
      const offset = rect.top - top
      const precedesAnchor = !anchor || offset < anchor.offset
        || (Math.abs(offset - anchor.offset) < 0.5 && (indices.get(key) ?? Infinity) < (indices.get(anchor.key) ?? Infinity))
      if (rect.bottom > top && rect.top < top + height && precedesAnchor)
        anchor = { key, offset: rect.top - top }
    }
    return anchor
  }

  function restoreAnchor(anchor: CardWindowSnapshot['anchor']) {
    const root = options.root.value
    const element = anchor && slots.get(anchor.key)
    if (root && anchor && element?.isConnected)
      root.scrollTop += element.getBoundingClientRect().top - viewport().top - anchor.offset
  }

  function keepScrollAnchor() {
    if (!active || restoring || anchorPending)
      return
    const root = options.root.value
    // ResizeObserver runs after CSS reflows. Use the last settled position
    // when the user has not scrolled since, rather than the already-shifted DOM.
    let anchor = root === bookmark?.root && root?.scrollTop === bookmark?.scrollTop
      ? bookmark?.anchor
      : visibleAnchor()
    const container = options.container.value
    // A scrollbar jump can put every old slot outside the viewport. Preserve
    // the destination row while its estimated predecessors are measured.
    if (!anchor && container) {
      const offset = viewport().top - container.getBoundingClientRect().top
      if (offset >= 0 && offset < metrics.offset(rowCount)) {
        const row = metrics.rowAt(offset)
        const key = options.keys.value[row * options.columns.value]
        if (key !== undefined)
          anchor = { key, offset: metrics.offset(row) - offset }
      }
    }
    if (!root || !anchor)
      return
    const scrollTop = root.scrollTop
    const version = generation
    anchorPending = true
    pendingAnchor = anchor
    pendingScrollTop = scrollTop
    void nextTick(async () => {
      // The caller changes ranges after capturing this anchor. If no Vue flush
      // was pending at capture time, wait for that newly queued patch as well.
      await nextTick()
      anchorPending = false
      pendingAnchor = undefined
      // A narrower row count can shrink the entire scroll range. The browser
      // clamps scrollTop in that case; it is not a new user scroll.
      const clampedScrollTop = Math.min(scrollTop, Math.max(0, root.scrollHeight - root.clientHeight))
      if (version !== generation || Math.abs(root.scrollTop - clampedScrollTop) > 1)
        return
      restoreAnchor(anchor)
      scheduleUpdate()
    })
  }

  function updateRanges() {
    const count = options.keys.value.length
    const columns = options.columns.value
    const gap = options.gap.value
    const { top, height } = viewport()
    const container = options.container.value
    const anchorIndex = options.snapshot?.anchor && indices.get(options.snapshot.anchor.key)
    const pendingIndex = pendingAnchor && indices.get(pendingAnchor.key)
    const offset = pendingIndex !== undefined && options.root.value?.scrollTop === pendingScrollTop
      ? metrics.offset(Math.floor(pendingIndex / columns)) - pendingAnchor!.offset
      : restoring || !container
        ? metrics.offset(Math.floor((anchorIndex ?? 0) / columns))
        : top - container.getBoundingClientRect().top
    const start = options.enabled.value ? metrics.rowAt(Math.max(0, offset - height * 3)) : 0
    const end = options.enabled.value ? Math.min(rowCount, metrics.rowAt(offset + height * 4) + 1) : rowCount
    const rows = new Set<number>()
    for (let row = start; row < end; row++)
      rows.add(row)

    let hasPinnedRows = false
    for (const [key, element] of slots) {
      const index = indices.get(key)
      if (index === undefined)
        continue
      const row = Math.floor(index / columns)
      if (rows.has(row))
        continue
      // Hysteresis keeps recently mounted rows around for direction changes.
      const nearby = metrics.offset(row + 1) > offset - height * 4 && metrics.offset(row) < offset + height * 5
      const focused = (element.getRootNode() as Document | ShadowRoot).activeElement
      const pinned = !options.canRelease(key) || (!!focused && element.contains(focused))
      if (nearby || pinned)
        rows.add(row)
      hasPinnedRows ||= pinned
    }
    clearTimeout(sweepTimer)
    sweepTimer = active && hasPinnedRows ? setTimeout(scheduleUpdate, 2000) : undefined

    const next: CardRange[] = []
    let cursor = 0
    for (const row of [...rows].sort((a, b) => a - b)) {
      if (row > cursor) {
        next.push({
          start: cursor * columns,
          end: Math.min(count, row * columns),
          // The grid supplies the gap before/after this replacement track.
          height: Math.max(0, metrics.offset(row) - metrics.offset(cursor) - gap),
        })
      }
      const previous = next[next.length - 1]
      if (previous && previous.height === undefined && previous.end === row * columns)
        previous.end = Math.min(count, (row + 1) * columns)
      else
        next.push({ start: row * columns, end: Math.min(count, (row + 1) * columns) })
      cursor = row + 1
    }
    if (cursor < rowCount) {
      next.push({
        start: cursor * columns,
        end: count,
        height: Math.max(0, metrics.offset(rowCount) - metrics.offset(cursor) - gap),
      })
    }
    if (next.length !== ranges.value.length || next.some((range, index) => {
      const previous = ranges.value[index]
      return range.start !== previous.start || range.end !== previous.end || range.height !== previous.height
    })) {
      keepScrollAnchor()
      ranges.value = next
      if (active && !resizeObserver)
        void nextTick(measureMounted)
    }
    void nextTick(() => {
      const root = options.root.value
      if (active && !anchorPending && root)
        bookmark = { root, scrollTop: root.scrollTop, anchor: visibleAnchor() }
    })
  }

  function scheduleUpdate() {
    if (!active || restoring || frame !== undefined)
      return
    frame = requestAnimationFrame(() => {
      frame = undefined
      updateRanges()
    })
  }

  function measuredHeight(key: CardKey) {
    const measurement = measurements.get(key)
    return measurement?.layout === options.layout.value
      ? Math.max(1, measurement.height + options.estimatedHeight.value - measurement.estimatedHeight)
      : options.estimatedHeight.value
  }

  function rebuildRows() {
    keepScrollAnchor()
    const keys = options.keys.value
    const columns = options.columns.value
    measuredColumns = columns
    indices.clear()
    rowCount = Math.ceil(keys.length / columns)
    const heights = Array.from({ length: rowCount }, () => 0)
    keys.forEach((key, index) => {
      indices.set(key, index)
      const row = Math.floor(index / columns)
      heights[row] = Math.max(heights[row], measuredHeight(key))
    })
    for (const key of measurements.keys()) {
      if (!indices.has(key))
        measurements.delete(key)
    }
    metrics.reset(heights.map(height => height + options.gap.value))
    updateRanges()
  }

  function measureMounted() {
    if (!active || measuredColumns !== options.columns.value)
      return
    const heights = new Map<number, number>()
    const pending: [CardKey, number][] = []
    for (const [key, element] of slots) {
      const index = indices.get(key)
      if (index === undefined || !element.isConnected)
        continue
      const height = element.getBoundingClientRect().height
      if (height <= 0)
        continue
      pending.push([key, height])
      const row = Math.floor(index / options.columns.value)
      heights.set(row, Math.max(heights.get(row) ?? 0, height))
    }
    // Capture the visible position before changing spacer heights above it.
    keepScrollAnchor()
    for (const [key, height] of pending)
      measurements.set(key, { height, layout: options.layout.value, estimatedHeight: options.estimatedHeight.value })
    let changed = false
    for (const [row, height] of heights)
      changed = metrics.set(row, height + options.gap.value) || changed
    if (changed)
      updateRanges()
  }

  function setElement(key: CardKey, value: unknown) {
    const previous = slots.get(key)
    if (previous === value)
      return
    if (previous) {
      resizeObserver?.unobserve(previous)
      slots.delete(key)
    }
    if (!(value instanceof HTMLElement))
      return
    slots.set(key, value)
    elementKeys.set(value, key)
    resizeObserver?.observe(value)
  }

  function captureSnapshot(): CardWindowSnapshot {
    measureMounted()
    return { measurements: [...measurements], renderedKeys: [...slots.keys()], anchor: visibleAnchor() }
  }

  function disconnect() {
    generation++
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    frame = undefined
    clearTimeout(sweepTimer)
    sweepTimer = undefined
    resizeObserver?.disconnect()
    viewportObserver?.disconnect()
    resizeObserver = viewportObserver = undefined
    scrollTarget?.removeEventListener('scroll', scheduleUpdate)
    window.removeEventListener('resize', scheduleUpdate)
    scrollTarget = undefined
  }

  function observe() {
    disconnect()
    if (!active)
      return
    const root = options.root.value
    scrollTarget = !root || root === document.scrollingElement ? window : root
    scrollTarget.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate, { passive: true })
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        if (entries.some(entry => elementKeys.has(entry.target)))
          measureMounted()
      })
      slots.forEach(element => resizeObserver?.observe(element))
      viewportObserver = new ResizeObserver(scheduleUpdate)
      viewportObserver.observe(root || document.documentElement)
      if (options.container.value)
        viewportObserver.observe(options.container.value)
    }
    scheduleUpdate()
  }

  function activate() {
    if (active)
      return
    active = true
    observe()
    void nextTick(() => {
      if (!active)
        return
      options.restoreScroll?.()
      if (restoring)
        restoreAnchor(options.snapshot?.anchor)
      restoring = false
      measureMounted()
      updateRanges()
    })
  }

  function deactivate() {
    active = false
    disconnect()
  }

  watch([options.keys, options.columns, options.gap, options.estimatedHeight, options.layout, options.enabled], rebuildRows, { immediate: true })
  watch([options.root, options.container], observe, { flush: 'post' })
  onMounted(activate)
  onActivated(activate)
  onDeactivated(deactivate)
  onBeforeUnmount(() => {
    deactivate()
    slots.clear()
    measurements.clear()
  })
  return { ranges, setElement, captureSnapshot }
}
