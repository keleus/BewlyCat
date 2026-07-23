export const LIST_LAYOUT_MIN_CARD_WIDTH = 500
export const LIST_LAYOUT_GRID_GAP = 16

export function getListLayoutColumnCount(width: number): number {
  if (!Number.isFinite(width) || width <= 0)
    return 1

  return Math.max(
    1,
    Math.floor(
      (width + LIST_LAYOUT_GRID_GAP)
      / (LIST_LAYOUT_MIN_CARD_WIDTH + LIST_LAYOUT_GRID_GAP),
    ),
  )
}
