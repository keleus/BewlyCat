import type { VirtualItem, Virtualizer } from '@tanstack/vue-virtual'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useResizeObserver } from '@vueuse/core'
import type { Ref } from 'vue'
import { computed, nextTick, watch } from 'vue'

import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'

export interface UseVirtualGridOptions<T = any> {
  /**
   * 数据列表
   */
  items: Ref<T[]>

  /**
   * Grid 布局模式
   */
  gridLayout: () => GridLayoutType

  /**
   * 容器引用
   */
  containerRef: Ref<HTMLElement | undefined>

  /**
   * OverlayScrollbars 滚动条引用
   */
  scrollbarRef: Ref<any>

  /**
   * 预渲染行数（上下各预渲染多少行）
   * @default 5
   */
  overscan?: number

  /**
   * 预加载触发回调
   * 当剩余未渲染的行数少于指定阈值时触发
   */
  onLoadMore?: () => void

  /**
   * 触发预加载的阈值（剩余行数）
   * @default 15（剩余 15 行时触发加载，非常提前的预加载）
   */
  loadMoreThreshold?: number

  /**
   * 自定义行高估算函数
   * @param isHorizontal 是否为横向布局
   * @param columnCount 列数
   * @param containerWidth 容器宽度
   * @returns 估算的行高（像素）
   */
  estimateRowHeight?: (
    isHorizontal: boolean,
    columnCount: number,
    containerWidth: number
  ) => number
}

export interface UseVirtualGridReturn<T = any> {
  /**
   * 虚拟滚动的行列表
   */
  virtualItems: Ref<VirtualItem[]>

  /**
   * 虚拟滚动容器的总高度
   */
  totalSize: Ref<number>

  /**
   * 当前列数
   */
  columnCount: Ref<number>

  /**
   * 虚拟 Grid 样式
   */
  virtualGridStyle: Ref<Record<string, any>>

  /**
   * 获取指定行的数据项
   */
  getItemsForRow: (rowIndex: number) => T[]

  /**
   * 虚拟滚动器实例
   */
  virtualizer: Ref<Virtualizer<Element, Element>>

  /**
   * 智能重新测量函数
   * 会检查 viewport 是否准备好，如果没准备好会轮询等待
   */
  remeasure: () => void
}

/**
 * 通用的虚拟 Grid 布局 composable
 * 用于优化大量数据的 Grid 渲染性能
 *
 * @example
 * ```ts
 * const { virtualItems, totalSize, columnCount, virtualGridStyle, getItemsForRow } = useVirtualGrid({
 *   items: videoList,
 *   gridLayout: () => props.gridLayout,
 *   containerRef,
 *   scrollbarRef,
 * })
 * ```
 */
export function useVirtualGrid<T = any>(
  options: UseVirtualGridOptions<T>,
): UseVirtualGridReturn<T> {
  const {
    items,
    gridLayout,
    containerRef,
    scrollbarRef,
    overscan = 5,
    estimateRowHeight,
    onLoadMore,
    loadMoreThreshold = 15, // 默认剩余 15 行时触发，非常提前
  } = options

  // 高度缓存，避免重复计算
  const heightCache = new Map<string, number>()

  // 响应式的容器宽度，确保窗口变化时能触发重新计算
  const containerWidth = ref<number>(containerRef.value?.offsetWidth || 1200)

  // 计算动态列数
  const columnCount = computed(() => {
    const layout = gridLayout()

    if (layout === 'oneColumn')
      return 1
    if (layout === 'twoColumns')
      return 2

    // adaptive 模式：根据容器宽度动态计算
    const minWidth = settings.value.homeAdaptiveCardMinWidth || 280
    const gap = 20 // gap-5 对应 20px
    return Math.max(1, Math.floor((containerWidth.value + gap) / (minWidth + gap)))
  })

  // 获取指定行的数据项
  function getItemsForRow(rowIndex: number): T[] {
    const startIndex = rowIndex * columnCount.value
    const endIndex = Math.min(
      startIndex + columnCount.value,
      items.value.length,
    )
    return items.value.slice(startIndex, endIndex)
  }

  // 默认的行高估算函数
  function defaultEstimateRowHeight(
    isHorizontal: boolean,
    colCount: number,
    containerWidth: number,
  ): number {
    if (isHorizontal)
      return 140 // 横向卡片固定高度

    // 竖向卡片：封面(16:9) + 信息区域
    const cardWidth = containerWidth / colCount
    const coverHeight = (cardWidth - 20) * 9 / 16 // 减去 gap
    return coverHeight + 120 // 120px 信息区域
  }

  // 估算每行的高度
  function estimateRowSize(rowIndex: number): number {
    const itemsInRow = getItemsForRow(rowIndex)
    if (!itemsInRow.length)
      return 0

    // 检查缓存（使用行索引作为缓存键）
    const cacheKey = `row-${rowIndex}`
    if (heightCache.has(cacheKey))
      return heightCache.get(cacheKey)!

    // 使用自定义或默认的高度估算函数
    const isHorizontal = gridLayout() !== 'adaptive'

    const height = estimateRowHeight
      ? estimateRowHeight(isHorizontal, columnCount.value, containerWidth.value)
      : defaultEstimateRowHeight(isHorizontal, columnCount.value, containerWidth.value)

    // 缓存结果
    heightCache.set(cacheKey, height)
    return height
  }

  // 总行数
  const totalRows = computed(() =>
    Math.ceil(items.value.length / columnCount.value),
  )

  // 配置虚拟滚动器 - 使用 OverlayScrollbars 的 viewport 作为滚动元素
  const virtualizerOptions = computed(() => ({
    count: totalRows.value,
    getScrollElement: () => {
      const osInstance = scrollbarRef.value?.osInstance()
      return osInstance?.elements().viewport || null
    },
    estimateSize: estimateRowSize,
    overscan,
  }))

  const virtualizer = useVirtualizer(virtualizerOptions as any)

  // 虚拟滚动的计算属性
  const virtualItems = computed(() => virtualizer.value.getVirtualItems())
  const totalSize = computed(() => virtualizer.value.getTotalSize())

  // 虚拟滚动的 Grid 样式 - 覆盖 auto-fit，使用固定列数
  const virtualGridStyle = computed(() => {
    const layout = gridLayout()
    if (layout === 'adaptive') {
      // adaptive 模式：计算精确的列宽，确保尽可能按最小宽度塞下更多列
      const gap = 20
      const baseWidth = Math.max(160, settings.value.homeAdaptiveCardMinWidth || 280)

      // 计算精确的列宽：(容器宽度 - 所有间隙宽度) / 列数
      const totalGapWidth = gap * (columnCount.value - 1)
      const availableWidth = containerWidth.value - totalGapWidth
      const cardWidth = Math.floor(availableWidth / columnCount.value)

      return {
        display: 'grid',
        gridTemplateColumns: `repeat(${columnCount.value}, ${cardWidth}px)`,
        gap: '20px',
        '--bew-home-card-min-width': `${baseWidth}px`,
      }
    }
    // twoColumns 和 oneColumn 使用 CSS 类的样式
    return {}
  })

  // 监听容器尺寸变化
  useResizeObserver(containerRef, () => {
    // 更新容器宽度，触发 columnCount 和 virtualGridStyle 重新计算
    containerWidth.value = containerRef.value?.offsetWidth || 1200
    // 列数会自动重新计算（因为是 computed）
    // 需要清空高度缓存并重新测量
    heightCache.clear()
    nextTick(() => {
      if (virtualizer.value)
        virtualizer.value.measure()
    })
  })

  // 监听列数变化（包括设置改变导致的变化）
  watch(columnCount, () => {
    // 列数变化时清空高度缓存并重新测量
    heightCache.clear()
    nextTick(() => {
      if (virtualizer.value)
        virtualizer.value.measure()
    })
  })

  // 监听设置变化（最小宽度改变）
  watch(() => settings.value.homeAdaptiveCardMinWidth, () => {
    // 设置变化时清空高度缓存并重新测量
    heightCache.clear()
    nextTick(() => {
      if (virtualizer.value)
        virtualizer.value.measure()
    })
  })

  // 监听数据变化，当数据加载完成后手动触发虚拟滚动器更新
  watch(items, (newItems, oldItems) => {
    nextTick(() => {
      const osInstance = scrollbarRef.value?.osInstance()
      const viewport = osInstance?.elements().viewport
      if (viewport && virtualizer.value) {
        // 如果数据从空变为有数据，或者长度发生显著变化，清空高度缓存
        const oldLength = oldItems?.length || 0
        const newLength = newItems?.length || 0

        if (oldLength === 0 || Math.abs(newLength - oldLength) > 10) {
          heightCache.clear()
        }

        virtualizer.value.measure()
      }
    })
  })

  // 监听 viewport 的准备状态，当它变为可用时强制刷新虚拟滚动器
  watch(
    () => scrollbarRef.value?.osInstance()?.elements().viewport,
    (viewport) => {
      if (viewport && items.value.length > 0) {
        nextTick(() => {
          virtualizer.value.measure()
        })
      }
    },
    { immediate: true },
  )

  // 预加载监听：当接近底部时触发加载
  if (onLoadMore) {
    // 记录上次触发加载时的总行数，避免重复触发
    let lastTriggerTotalRows = 0

    // 监听滚动时的预加载
    watch(virtualItems, () => {
      if (!virtualItems.value.length || !onLoadMore)
        return

      const currentTotalRows = totalRows.value

      // 如果总行数没有增加，说明上次触发的加载还没完成，不要重复触发
      if (currentTotalRows <= lastTriggerTotalRows)
        return

      const lastVisibleRow = virtualItems.value[virtualItems.value.length - 1]
      if (!lastVisibleRow)
        return

      const remainingRows = currentTotalRows - lastVisibleRow.index - 1

      // 当剩余行数少于阈值时，触发加载
      if (remainingRows <= loadMoreThreshold) {
        lastTriggerTotalRows = currentTotalRows
        onLoadMore()
      }
    })

    // 初始加载检查：当首次加载数据后，检查是否需要立即预加载
    watch(() => items.value.length, (newLength, oldLength) => {
      if (!onLoadMore || newLength === 0)
        return

      // 只在数据从无到有，或者首次加载后立即检查
      if (oldLength === 0 && newLength > 0) {
        nextTick(() => {
          const osInstance = scrollbarRef.value?.osInstance()
          const viewport = osInstance?.elements().viewport
          if (!viewport || !virtualizer.value)
            return

          const currentTotalRows = totalRows.value
          const visibleRows = virtualItems.value.length

          // 如果总行数少于可见行数+阈值，说明第一页内容不够，需要立即加载更多
          if (currentTotalRows > 0 && currentTotalRows <= visibleRows + loadMoreThreshold) {
            lastTriggerTotalRows = currentTotalRows
            onLoadMore()
          }
        })
      }
    }, { immediate: false })
  }

  // 智能重新测量函数：检查 viewport 是否准备好，如果没准备好会轮询等待
  function remeasure() {
    // 使用 requestAnimationFrame 确保浏览器完成布局计算
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const checkAndMeasure = () => {
          const osInstance = scrollbarRef.value?.osInstance()
          const viewport = osInstance?.elements().viewport
          if (viewport && viewport.clientHeight > 0) {
            heightCache.clear()
            nextTick(() => {
              if (virtualizer.value)
                virtualizer.value.measure()
            })
          }
          else {
            // Viewport 还没准备好，轮询等待
            const retries = (checkAndMeasure as any).retries || 0
            if (retries < 10) {
              (checkAndMeasure as any).retries = retries + 1
              setTimeout(checkAndMeasure, 100)
            }
          }
        }
        checkAndMeasure()
      })
    })
  }

  return {
    virtualItems,
    totalSize,
    columnCount,
    virtualGridStyle,
    getItemsForRow,
    virtualizer,
    remeasure,
  }
}
