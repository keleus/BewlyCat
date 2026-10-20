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
      // 未标注优先级的项（如视频类型图标）与标签一同参与按宽度隐藏。
      priority: Number(element.dataset.metaPriority ?? 4),
      // 使用布局宽度，避免卡片的缩放动画影响可容纳标签的数量。
      width: Number.parseFloat(style.width) + paddingAndBorder + Number.parseFloat(style.marginLeft) + Number.parseFloat(style.marginRight),
    }
  })

  const visibleCandidates = [...candidates]
  const getUsedWidth = () => visibleCandidates.reduce((sum, candidate) => sum + candidate.width, 0)
    + gap * Math.max(visibleCandidates.length - 1, 0)

  // 时间始终保留；放不下时优先隐藏最宽的标签（含计算标签与类型图标），使其余标签尽量显示，分区最后才隐藏。
  while (getUsedWidth() > availableWidth) {
    const removable = visibleCandidates.filter(candidate => candidate.priority !== 0)
    if (removable.length === 0)
      break

    const tags = removable.filter(candidate => candidate.priority >= 2)
    const pool = tags.length > 0 ? tags : removable
    const widest = pool.reduce((widest, candidate) => candidate.width > widest.width ? candidate : widest)
    visibleCandidates.splice(visibleCandidates.indexOf(widest), 1)
  }

  const visible = new Set(visibleCandidates.map(candidate => candidate.element))
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
