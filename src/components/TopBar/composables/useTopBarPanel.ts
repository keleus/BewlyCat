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
  let focusPending = false
  let generation = 0
  let disposed = false
  function position() {
    if (disposed || !open.value || frame)
      return
    const currentGeneration = generation
    frame = requestAnimationFrame(async () => {
      frame = 0
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
      const sizing = { ...dimensions, maxHeight: `${maxHeight}px` }
      if (Object.entries(sizing).some(([key, value]) => panelStyle.value[key] !== value)) {
        panelStyle.value = { ...panelStyle.value, ...sizing }
        await nextTick()
      }
      if (disposed || currentGeneration !== generation || !open.value || !panel.value)
        return
      const width = panel.value.getBoundingClientRect().width
      const preferredLeft = options.align === 'end' ? triggerRect.right - width : triggerRect.left
      const left = Math.max(8, Math.min(preferredLeft, viewportWidth - width - 8))
      const nextStyle = {
        ...dimensions,
        left: `${left - rect.left}px`,
        top: `${triggerRect.bottom - rect.top + 8}px`,
        maxHeight: `${maxHeight}px`,
      }
      if (Object.keys(panelStyle.value).length !== Object.keys(nextStyle).length
        || Object.entries(nextStyle).some(([key, value]) => panelStyle.value[key] !== value)) {
        panelStyle.value = nextStyle
      }
      if (focusPending) {
        focusPending = false
        await nextTick()
        if (!disposed && currentGeneration === generation && open.value)
          panel.value?.querySelector<HTMLElement>('input, a[href], button:not(:disabled)')?.focus({ preventScroll: true })
      }
    })
  }
  watch(open, async (visible) => {
    generation++
    cancelAnimationFrame(frame)
    frame = 0
    focusPending = visible
    if (!visible) {
      panelStyle.value = { visibility: 'hidden' }
      return
    }
    await nextTick()
    position()
  })
  onClickOutside(anchor, () => close(false))
  useEventListener(window, 'resize', position)
  useEventListener(window, 'scroll', (event) => {
    if (!open.value || event.composedPath().includes(panel.value as EventTarget))
      return
    position()
  }, { capture: true, passive: true })
  useResizeObserver(anchor, position)
  useResizeObserver(panel, position)
  if (options.trigger)
    useResizeObserver(options.trigger, position)
  useEventListener(anchor, 'focusout', (event: FocusEvent) => {
    if (event.relatedTarget instanceof Node && !anchor.value?.contains(event.relatedTarget))
      close(false)
  })
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
  })
  return { panelStyle, position }
}
