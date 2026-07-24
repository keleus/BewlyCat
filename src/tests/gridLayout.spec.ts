import { describe, expect, it } from 'vitest'

import {
  getAdaptiveGridColumnCount,
  getListLayoutColumnCount,
  LIST_LAYOUT_GRID_GAP,
  LIST_LAYOUT_MIN_CARD_WIDTH,
} from '~/utils/gridLayout'

describe('adaptive grid layout', () => {
  const columns = {
    base: 1,
    sm: 2,
    md: 3,
    lg: 4,
    xl: 5,
    xxl: 6,
  }

  it('uses the configured column count at each viewport breakpoint', () => {
    expect(getAdaptiveGridColumnCount(639, columns)).toBe(1)
    expect(getAdaptiveGridColumnCount(640, columns)).toBe(2)
    expect(getAdaptiveGridColumnCount(768, columns)).toBe(3)
    expect(getAdaptiveGridColumnCount(1024, columns)).toBe(4)
    expect(getAdaptiveGridColumnCount(1280, columns)).toBe(5)
    expect(getAdaptiveGridColumnCount(1536, columns)).toBe(6)
  })

  it('normalizes invalid configured values at the active breakpoint', () => {
    expect(getAdaptiveGridColumnCount(1280, { ...columns, xl: 0 })).toBe(5)
    expect(getAdaptiveGridColumnCount(1280, { ...columns, xl: 4.6 })).toBe(5)
  })
})

describe('list grid layout', () => {
  function minimumWidthForColumns(columns: number): number {
    return columns * LIST_LAYOUT_MIN_CARD_WIDTH
      + (columns - 1) * LIST_LAYOUT_GRID_GAP
  }

  it('adds columns whenever another minimum-width card fits', () => {
    expect(getListLayoutColumnCount(minimumWidthForColumns(2) - 1)).toBe(1)
    expect(getListLayoutColumnCount(minimumWidthForColumns(2))).toBe(2)
    expect(getListLayoutColumnCount(minimumWidthForColumns(3))).toBe(3)
    expect(getListLayoutColumnCount(minimumWidthForColumns(4))).toBe(4)
  })

  it('falls back to one column for invalid or non-positive widths', () => {
    expect(getListLayoutColumnCount(0)).toBe(1)
    expect(getListLayoutColumnCount(Number.NaN)).toBe(1)
  })
})
