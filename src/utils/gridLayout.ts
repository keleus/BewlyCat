export const LIST_LAYOUT_MIN_CARD_WIDTH = 500
export const LIST_LAYOUT_GRID_GAP = 16

export interface AdaptiveGridColumns {
  base: number
  sm: number
  md: number
  lg: number
  xl: number
  xxl: number
}

const DEFAULT_ADAPTIVE_GRID_COLUMNS: AdaptiveGridColumns = {
  base: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
  xxl: 6,
}

function normalizeColumnCount(value: unknown, fallback: number): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0)
    return fallback
  return Math.max(1, Math.round(normalized))
}

export function getAdaptiveGridColumnCount(width: number, columns: AdaptiveGridColumns): number {
  let breakpoint: keyof AdaptiveGridColumns = 'base'

  if (width >= 1536)
    breakpoint = 'xxl'
  else if (width >= 1280)
    breakpoint = 'xl'
  else if (width >= 1024)
    breakpoint = 'lg'
  else if (width >= 768)
    breakpoint = 'md'
  else if (width >= 640)
    breakpoint = 'sm'

  return normalizeColumnCount(columns[breakpoint], DEFAULT_ADAPTIVE_GRID_COLUMNS[breakpoint])
}

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
