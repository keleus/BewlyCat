import { describe, expect, it } from 'vitest'

import {
  getListLayoutColumnCount,
  LIST_LAYOUT_GRID_GAP,
  LIST_LAYOUT_MIN_CARD_WIDTH,
} from '~/utils/gridLayout'

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
