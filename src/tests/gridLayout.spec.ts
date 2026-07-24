import { describe, expect, it } from 'vitest'

import {
  getAdaptiveGridColumnCount,
  getListGridColumnCount,
  MOBILE_LIST_LAYOUT_BREAKPOINT,
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
  it('keeps the selected list layout when auto switching is disabled', () => {
    expect(getListGridColumnCount('oneColumn', 320, false)).toBe(1)
    expect(getListGridColumnCount('oneColumn', 1920, false)).toBe(1)
    expect(getListGridColumnCount('twoColumns', 320, false)).toBe(2)
    expect(getListGridColumnCount('twoColumns', 1920, false)).toBe(2)
  })

  it('switches two-column layout to one column below the mobile breakpoint', () => {
    expect(getListGridColumnCount('twoColumns', MOBILE_LIST_LAYOUT_BREAKPOINT - 1, true)).toBe(1)
    expect(getListGridColumnCount('twoColumns', MOBILE_LIST_LAYOUT_BREAKPOINT, true)).toBe(2)
    expect(getListGridColumnCount('oneColumn', 1920, true)).toBe(1)
  })

  it('falls back to one column when the viewport width is invalid', () => {
    expect(getListGridColumnCount('twoColumns', 0, true)).toBe(1)
    expect(getListGridColumnCount('twoColumns', Number.NaN, true)).toBe(1)
  })
})
