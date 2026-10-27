import type { ObjectDirective } from 'vue'

interface MetaOverflowState {
  observer: ResizeObserver
  children: Set<HTMLElement>
}

interface MetaCandidate {
  element: HTMLElement
  priority: number
  width: number
}

const states = new WeakMap<HTMLElement, MetaOverflowState>()

// Rows from every card are measured together: restore all candidates, read all
// widths, then hide. The pass runs after the browser has laid out the frame,
// when those reads are free; measuring right after Vue inserted a batch of
// cards forced a full layout of the grid. Overflowing tags stay clipped by the
// row (fixed height, overflow hidden) until then.
const pendingRows = new Set<HTMLElement>()
let frame: number | undefined
let timer: ReturnType<typeof setTimeout> | undefined

function scheduleRow(row: HTMLElement, afterLayout = false) {
  pendingRows.add(row)
  if (timer !== undefined)
    return

  // ResizeObserver callbacks already run after this frame's layout.
  if (afterLayout) {
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    frame = undefined
    timer = setTimeout(flushPendingRows, 0)
    return
  }

  frame ??= requestAnimationFrame(() => {
    frame = undefined
    timer ??= setTimeout(flushPendingRows, 0)
  })
}

function measureRow(row: HTMLElement) {
  const children = Array.from(row.children) as HTMLElement[]
  const rowStyle = getComputedStyle(row)
  const availableWidth = row.clientWidth - Number.parseFloat(rowStyle.paddingLeft) - Number.parseFloat(rowStyle.paddingRight)
  const gap = Number.parseFloat(rowStyle.columnGap) || 0
  const candidates: MetaCandidate[] = children.map((element) => {
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

  return { children, candidates, availableWidth, gap }
}

function getHiddenMeta({ children, candidates, availableWidth, gap }: ReturnType<typeof measureRow>) {
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
  return children.filter(child => !visible.has(child))
}

function flushPendingRows() {
  timer = undefined
  const rows = [...pendingRows].filter(row => row.isConnected && states.has(row))
  pendingRows.clear()
  if (!rows.length)
    return

  // 先恢复候选项以测量完整宽度，最终仍按原来的 DOM 顺序显示。
  for (const row of rows) {
    for (const child of Array.from(row.children) as HTMLElement[])
      child.style.removeProperty('display')
  }

  const hidden = rows.map(row => getHiddenMeta(measureRow(row)))

  for (const children of hidden) {
    for (const child of children)
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
      observer: new ResizeObserver(() => scheduleRow(row, true)),
      children: new Set(),
    }
    states.set(row, state)
    state.observer.observe(row)
    observeChildren(row, state)
    scheduleRow(row)
  },
  updated(row) {
    const state = states.get(row)
    if (state)
      observeChildren(row, state)
    scheduleRow(row)
  },
  unmounted(row) {
    states.get(row)?.observer.disconnect()
    states.delete(row)
    pendingRows.delete(row)
  },
}
