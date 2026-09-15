import type { ObjectDirective } from 'vue'

interface MetaOverflowState {
  observer: ResizeObserver
  children: Set<HTMLElement>
  frame?: number
}

const states = new WeakMap<HTMLElement, MetaOverflowState>()

function updateVisibleMeta(row: HTMLElement) {
  const children = Array.from(row.children) as HTMLElement[]

  // 先恢复候选项以测量完整宽度，最终仍按原来的 DOM 顺序显示。
  for (const child of children)
    child.style.removeProperty('display')

  const rowStyle = getComputedStyle(row)
  const availableWidth = row.clientWidth - Number.parseFloat(rowStyle.paddingLeft) - Number.parseFloat(rowStyle.paddingRight)
  const gap = Number.parseFloat(rowStyle.columnGap) || 0
  const candidates = children.map((element) => {
    const style = getComputedStyle(element)
    const paddingAndBorder = style.boxSizing === 'border-box'
      ? 0
      : Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
        + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth)
    return {
      element,
      priority: Number(element.dataset.metaPriority ?? 3),
      // 使用布局宽度，避免卡片的缩放动画影响可容纳标签的数量。
      width: Number.parseFloat(style.width) + paddingAndBorder + Number.parseFloat(style.marginLeft) + Number.parseFloat(style.marginRight),
    }
  }).sort((a, b) => a.priority - b.priority)

  const visible = new Set<HTMLElement>()
  let usedWidth = 0

  for (const candidate of candidates) {
    const requiredWidth = candidate.width + (visible.size > 0 ? gap : 0)
    // 时间始终保留；其余候选项只保留按优先级排列后能完整放下的前缀。
    if (candidate.priority !== 0 && usedWidth + requiredWidth > availableWidth)
      break

    visible.add(candidate.element)
    usedWidth += requiredWidth
  }

  for (const child of children) {
    if (!visible.has(child))
      child.style.display = 'none'
  }
}

function observeChildren(row: HTMLElement, state: MetaOverflowState) {
  const children = new Set(Array.from(row.children) as HTMLElement[])
  for (const child of state.children) {
    if (!children.has(child))
      state.observer.unobserve(child)
  }
  for (const child of children) {
    if (!state.children.has(child))
      state.observer.observe(child)
  }
  state.children = children
}

export const vMetaOverflow: ObjectDirective<HTMLElement> = {
  mounted(row) {
    const state: MetaOverflowState = {
      observer: new ResizeObserver(() => {
        if (state.frame !== undefined)
          return

        // 显隐会改变子项尺寸，放到下一帧更新以避免 ResizeObserver 循环。
        state.frame = requestAnimationFrame(() => {
          state.frame = undefined
          updateVisibleMeta(row)
        })
      }),
      children: new Set(),
    }
    states.set(row, state)
    state.observer.observe(row)
    observeChildren(row, state)
    updateVisibleMeta(row)
  },
  updated(row) {
    const state = states.get(row)
    if (state)
      observeChildren(row, state)
    updateVisibleMeta(row)
  },
  unmounted(row) {
    const state = states.get(row)
    state?.observer.disconnect()
    if (state?.frame !== undefined)
      cancelAnimationFrame(state.frame)
    states.delete(row)
  },
}
