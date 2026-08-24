function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function computeFloatingMenuPosition(
  anchor: { top: number, right: number, bottom: number },
  viewportWidth: number,
  viewportHeight: number,
) {
  const inset = 8
  const gap = 8
  const availableWidth = Math.max(0, viewportWidth - inset * 2)
  const availableHeight = Math.max(0, viewportHeight - inset * 2)
  const width = Math.min(240, availableWidth)
  // 默认选项集完整展开约 470px；需与 VideoCardContextMenu 的 max-height 同步
  const preferredMaxHeight = Math.min(480, availableHeight)
  const left = clamp(anchor.right - width, inset, Math.max(inset, viewportWidth - width - inset))

  const spaceBelow = Math.max(0, viewportHeight - inset - anchor.bottom - gap)
  const spaceAbove = Math.max(0, anchor.top - gap - inset)
  const openBelow = spaceBelow >= preferredMaxHeight || spaceBelow >= spaceAbove
  const maxHeight = Math.min(preferredMaxHeight, openBelow ? spaceBelow : spaceAbove)

  // Anchor upward-opening menus by their bottom edge. Their actual height varies
  // with the visible option count, so subtracting the maximum height here would
  // leave an increasingly large gap as options are hidden.
  const top = openBelow ? `${anchor.bottom + gap}px` : undefined
  const bottom = openBelow ? undefined : `${viewportHeight - anchor.top + gap}px`

  return { left, top, bottom, width, maxHeight }
}
