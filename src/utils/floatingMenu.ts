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
  const preferredMaxHeight = Math.min(406, availableHeight)
  const left = clamp(anchor.right - width, inset, Math.max(inset, viewportWidth - width - inset))

  const spaceBelow = Math.max(0, viewportHeight - inset - anchor.bottom - gap)
  const spaceAbove = Math.max(0, anchor.top - gap - inset)
  const openBelow = spaceBelow >= preferredMaxHeight || spaceBelow >= spaceAbove
  const maxHeight = Math.min(preferredMaxHeight, openBelow ? spaceBelow : spaceAbove)

  // Anchor upward-opening menus by their bottom edge. Their actual height varies
  // with the visible option count, so subtracting the maximum height here would
  // leave an increasingly large gap as options are hidden.
  const top = openBelow
    ? anchor.bottom + gap
    : anchor.top - gap
  const transform = openBelow ? undefined : 'translateY(-100%)'

  return { left, top, width, maxHeight, transform }
}
