import type { CSSProperties } from 'vue'
import { computed } from 'vue'

import type { GridLayoutType } from '~/logic'
import { gridColumns } from '~/logic'

const gridCssVars = computed<CSSProperties>(() => ({
  '--grid-cols-base': gridColumns.value.base,
  '--grid-cols-sm': gridColumns.value.sm,
  '--grid-cols-md': gridColumns.value.md,
  '--grid-cols-lg': gridColumns.value.lg,
  '--grid-cols-xl': gridColumns.value.xl,
  '--grid-cols-xxl': gridColumns.value.xxl,
}))

export function useGridLayout(gridLayout: () => GridLayoutType) {
  const gridClass = computed((): string => {
    const layout = gridLayout()
    if (layout === 'adaptive')
      return 'grid-adaptive'
    if (layout === 'twoColumns')
      return 'grid-two-columns'
    return 'grid-one-column'
  })

  return { gridClass, gridCssVars }
}
