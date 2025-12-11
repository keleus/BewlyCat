import { computed } from 'vue'

import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'

/**
 * 共享的 Grid 布局 composable
 * 用于统一管理所有页面的网格布局样式，避免重复计算
 *
 * @param gridLayout - 网格布局类型的 ref 或 getter
 * @returns gridClass 和 gridStyle
 */
export function useGridLayout(gridLayout: () => GridLayoutType) {
  // Grid class - 轻量级计算，直接映射
  const gridClass = computed((): string => {
    const layout = gridLayout()
    if (layout === 'adaptive')
      return 'grid-adaptive'
    if (layout === 'twoColumns')
      return 'grid-two-columns'
    return 'grid-one-column'
  })

  // Grid style - 只在 adaptive 模式下计算
  // 使用 CSS auto-fit，让浏览器自动计算列数，避免 JS 计算导致的 forced reflow
  const gridStyle = computed(() => {
    const layout = gridLayout()
    if (layout !== 'adaptive')
      return {}

    const baseWidth = Math.max(160, settings.value.homeAdaptiveCardMinWidth || 280)

    return {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${baseWidth}px), 1fr))`,
      gap: '20px', // 对应 gap-5 (1.25rem = 20px)
      '--bew-home-card-min-width': `${baseWidth}px`,
    }
  })

  return {
    gridClass,
    gridStyle,
  }
}
