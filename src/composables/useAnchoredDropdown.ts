import { useEventListener } from '@vueuse/core'
import type { CSSProperties, Ref } from 'vue'

const LIST_GAP = 4
const VIEWPORT_MARGIN = 8

/**
 * 输入框下拉提示：列表传送到顶层后按锚点 fixed 定位，避免被弹窗或设置面板的滚动区裁切。
 * 下方空间不足时向上展开；定位基于打开时的坐标，外部滚动或窗口尺寸变化时收起。
 */
export function useAnchoredDropdown(
  anchorRef: Ref<HTMLElement | undefined>,
  listRef: Ref<HTMLElement | undefined>,
  maxHeight = 240,
) {
  const open = ref(false)
  const activeIndex = ref(-1)
  const style = ref<CSSProperties>({})

  function updatePosition() {
    const rect = anchorRef.value?.getBoundingClientRect()
    if (!rect)
      return
    const spaceBelow = window.innerHeight - rect.bottom - LIST_GAP - VIEWPORT_MARGIN
    const spaceAbove = rect.top - LIST_GAP - VIEWPORT_MARGIN
    const openUp = spaceBelow < Math.min(maxHeight, 160) && spaceAbove > spaceBelow
    style.value = {
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      maxHeight: `${Math.max(0, Math.min(maxHeight, openUp ? spaceAbove : spaceBelow))}px`,
      ...(openUp
        ? { bottom: `${window.innerHeight - rect.top + LIST_GAP}px` }
        : { top: `${rect.bottom + LIST_GAP}px` }),
    }
  }

  function show() {
    updatePosition()
    open.value = true
  }

  function hide() {
    open.value = false
    activeIndex.value = -1
  }

  /** 方向键移动高亮项；列表未展开时先展开 */
  function move(step: 1 | -1, count: number) {
    if (!open.value) {
      show()
      return
    }
    if (!count)
      return
    activeIndex.value = (activeIndex.value + step + count) % count
    nextTick(() => listRef.value?.children[activeIndex.value]?.scrollIntoView({ block: 'nearest' }))
  }

  /** 列表展开时 Esc 只收起列表，不关闭外层弹窗 */
  function hideOnEscape(event: KeyboardEvent) {
    if (!open.value)
      return
    event.stopPropagation()
    hide()
  }

  useEventListener(window, 'wheel', (event: WheelEvent) => {
    if (open.value && listRef.value && !event.composedPath().includes(listRef.value))
      hide()
  }, { passive: true })
  useEventListener(window, 'resize', () => {
    if (open.value)
      hide()
  })

  return { open, activeIndex, style, show, hide, move, hideOnEscape }
}
