export const MOBILE_LIST_LAYOUT_BREAKPOINT = 640

export type ListGridLayout = 'twoColumns' | 'oneColumn'

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

export function getListGridColumnCount(
  layout: ListGridLayout,
  viewportWidth: number,
  autoSwitch: boolean,
): number {
  if (layout === 'oneColumn')
    return 1

  if (!autoSwitch)
    return 2

  return Number.isFinite(viewportWidth) && viewportWidth >= MOBILE_LIST_LAYOUT_BREAKPOINT ? 2 : 1
}
