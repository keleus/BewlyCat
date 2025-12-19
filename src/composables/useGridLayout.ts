import { useElementSize, useWindowSize } from '@vueuse/core'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'

import type { GridLayoutType } from '~/logic'
import { defaultGridBreakpoints, gridBreakpoints } from '~/logic'

/**
 * 共享的 Grid 布局 composable
 *
 * 优化策略：
 * - 使用用户配置的断点来决定列数
 * - 只在断点变化时更新列数，中间宽度完全稳定
 * - 布局稳定可预测
 * - 如果用户配置为空，使用默认值
 * - 支持基于容器宽度的响应式布局（而非窗口宽度）
 *
 * @param gridLayout - 网格布局类型的 ref 或 getter
 * @param containerRef - (可选) 容器元素的 ref，如果提供则使用容器宽度而不是窗口宽度
 * @returns gridClass 和 gridStyle
 */
export function useGridLayout(
  gridLayout: () => GridLayoutType,
  containerRef?: Ref<HTMLElement | null | undefined>,
) {
  const { width: windowWidth } = useWindowSize()
  const { width: elementWidth } = useElementSize(containerRef ?? ref(null))

  // 获取有效的断点配置（如果用户配置为空，使用默认值）
  const effectiveBreakpoints = computed(() => {
    const userBreakpoints = gridBreakpoints.value
    return userBreakpoints.length > 0 ? userBreakpoints : defaultGridBreakpoints
  })

  // 根据当前宽度和断点配置计算列数
  const columnCount = computed((): number => {
    const layout = gridLayout()
    if (layout !== 'adaptive')
      return layout === 'twoColumns' ? 2 : 1

    const breakpoints = effectiveBreakpoints.value

    // 如果提供了 containerRef 且有有效宽度，使用容器宽度；否则回退到窗口宽度
    const currentWidth = (containerRef && elementWidth.value > 0)
      ? elementWidth.value
      : windowWidth.value

    // 按 minWidth 降序排列，找到第一个满足条件的断点
    const sortedBreakpoints = [...breakpoints].sort((a, b) => b.minWidth - a.minWidth)
    const matchedBreakpoint = sortedBreakpoints.find(bp => currentWidth >= bp.minWidth)

    return matchedBreakpoint?.columns ?? 1
  })

  // Grid class - 根据布局类型返回对应的 CSS 类
  const gridClass = computed((): string => {
    const layout = gridLayout()
    if (layout === 'adaptive')
      return 'grid-adaptive'
    if (layout === 'twoColumns')
      return 'grid-two-columns'
    return 'grid-one-column'
  })

  // Grid style - adaptive 模式使用计算的列数
  const gridStyle = computed(() => {
    const layout = gridLayout()
    if (layout !== 'adaptive')
      return {}

    // 使用固定列数，完全由 JS 根据断点控制
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${columnCount.value}, 1fr)`,
      gap: '20px',
    }
  })

  return {
    gridClass,
    gridStyle,
    columnCount,
  }
}
