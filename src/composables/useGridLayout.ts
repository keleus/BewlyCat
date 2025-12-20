import type { CSSProperties } from 'vue'
import { computed } from 'vue'

import type { GridLayoutType } from '~/logic'
import { gridColumns } from '~/logic'

// 页面加载时读取一次，之后不再监听变化（需刷新页面生效）
const initialGridColumns = { ...gridColumns.value }

const gridCssVars: CSSProperties = {
  '--grid-cols-base': initialGridColumns.base,
  '--grid-cols-sm': initialGridColumns.sm,
  '--grid-cols-md': initialGridColumns.md,
  '--grid-cols-lg': initialGridColumns.lg,
  '--grid-cols-xl': initialGridColumns.xl,
  '--grid-cols-xxl': initialGridColumns.xxl,
} as CSSProperties

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
