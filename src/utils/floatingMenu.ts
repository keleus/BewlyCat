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
  const maxHeight = Math.min(406, availableHeight)
  const left = clamp(anchor.right - width, inset, Math.max(inset, viewportWidth - width - inset))

  const belowTop = anchor.bottom + gap
  const hasEnoughSpaceBelow = viewportHeight - inset - belowTop >= maxHeight
  const top = hasEnoughSpaceBelow
    ? belowTop
    : Math.max(inset, anchor.top - gap - maxHeight)

  return { left, top, width, maxHeight }
}
