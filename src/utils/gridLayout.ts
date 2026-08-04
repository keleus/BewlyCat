/**
 * The default width at which a manually selected two-column list falls back
 * to one column when automatic switching is enabled.
 */
export const MOBILE_LIST_LAYOUT_BREAKPOINT = 640

/** Keep the user-configurable breakpoint in a range that still produces usable cards. */
export const MIN_LIST_LAYOUT_BREAKPOINT = 320
export const MAX_LIST_LAYOUT_BREAKPOINT = 1200

export function normalizeListLayoutBreakpoint(value: unknown): number {
  if (value == null || (typeof value === 'string' && value.trim() === ''))
    return MOBILE_LIST_LAYOUT_BREAKPOINT

  if (typeof value !== 'number' && typeof value !== 'string')
    return MOBILE_LIST_LAYOUT_BREAKPOINT

  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return MOBILE_LIST_LAYOUT_BREAKPOINT

  return Math.min(
    MAX_LIST_LAYOUT_BREAKPOINT,
    Math.max(MIN_LIST_LAYOUT_BREAKPOINT, Math.round(normalized)),
  )
}

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
  breakpoint: number = MOBILE_LIST_LAYOUT_BREAKPOINT,
): number {
  if (layout === 'oneColumn')
    return 1

  if (!autoSwitch)
    return 2

  const switchBreakpoint = normalizeListLayoutBreakpoint(breakpoint)
  return Number.isFinite(viewportWidth) && viewportWidth >= switchBreakpoint ? 2 : 1
}
