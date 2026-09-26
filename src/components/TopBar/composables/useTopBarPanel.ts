import { onClickOutside, useEventListener, useResizeObserver } from '@vueuse/core'
import type { Ref } from 'vue'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

interface PanelOptions {
  width?: 'content'
  minWidth?: number
  maxWidth?: number
  align?: 'end'
  trigger?: Ref<HTMLElement | null>
}

// Absolute positioning keeps the panel inside the extension's Shadow DOM.
export function useTopBarPanel(anchor: Ref<HTMLElement | null>, panel: Ref<HTMLElement | null>, open: Ref<boolean>, close: (restoreFocus?: boolean) => void, options: PanelOptions = {}) {
  const panelStyle = ref<Record<string, string>>({ visibility: 'hidden' })
  let frame = 0
  let focusFrame = 0
  let generation = 0
  let disposed = false
  function position() {
    if (disposed || !open.value)
      return
    const currentGeneration = ++generation
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(async () => {
      if (!open.value || !anchor.value || !panel.value)
        return
      const viewportWidth = document.documentElement.clientWidth
      const availableWidth = Math.max(0, viewportWidth - 16)
      const rect = anchor.value.getBoundingClientRect()
      const triggerRect = options.trigger?.value?.getBoundingClientRect() ?? rect
      const maxHeight = Math.max(0, window.innerHeight - triggerRect.bottom - 16)
      const dimensions: Record<string, string> = options.width === 'content'
        ? {
            width: 'max-content',
            minWidth: `${Math.min(options.minWidth ?? 160, availableWidth)}px`,
            maxWidth: `${Math.min(options.maxWidth ?? 240, availableWidth)}px`,
          }
        : { width: `${Math.min(320, availableWidth)}px` }
      // Let intrinsic sizing include padding, borders and the scroll gutter first.
      panelStyle.value = { ...panelStyle.value, ...dimensions, maxHeight: `${maxHeight}px` }
      await nextTick()
      if (disposed || currentGeneration !== generation || !open.value || !panel.value)
        return
      const width = panel.value.getBoundingClientRect().width
      const preferredLeft = options.align === 'end' ? triggerRect.right - width : triggerRect.left
      const left = Math.max(8, Math.min(preferredLeft, viewportWidth - width - 8))
      panelStyle.value = {
        ...dimensions,
        left: `${left - rect.left}px`,
        top: `${triggerRect.bottom - rect.top + 8}px`,
        maxHeight: `${maxHeight}px`,
      }
    })
  }
  watch(open, async (visible) => {
    generation++
    cancelAnimationFrame(frame)
    cancelAnimationFrame(focusFrame)
    if (!visible) {
      panelStyle.value = { visibility: 'hidden' }
      return
    }
    await nextTick()
    position()
    focusFrame = requestAnimationFrame(() => {
      void nextTick(() => {
        if (open.value)
          panel.value?.querySelector<HTMLElement>('input, a, button')?.focus({ preventScroll: true })
      })
    })
  })
  onClickOutside(anchor, () => close(false))
  useEventListener(window, 'resize', position)
  useEventListener(window, 'scroll', position, { capture: true, passive: true })
  useResizeObserver(anchor, position)
  useResizeObserver(panel, position)
  if (options.trigger)
    useResizeObserver(options.trigger, position)
  useEventListener(anchor, 'keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open.value) {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    }
  }, { capture: true })
  onBeforeUnmount(() => {
    disposed = true
    generation++
    cancelAnimationFrame(frame)
    cancelAnimationFrame(focusFrame)
  })
  return { panelStyle, position }
}
