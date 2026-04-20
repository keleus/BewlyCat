<script setup lang="ts" generic="T = any">
import { useDebounceFn } from '@vueuse/core'

import type { Video } from '~/components/VideoCard/types'
import { useGridLayout } from '~/composables/useGridLayout'
import { useVideoCardShadowStyle } from '~/composables/useVideoCardShadowStyle'
import { OVERLAY_SCROLL_BAR_SCROLL } from '~/constants/globalEvents'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import emitter from '~/utils/mitt'

/**
 * 统一的 VideoCard Grid 组件
 * 支持滚动加载和预加载（基于剩余 item 数量）
 */

interface VideoCardGridProps<T = any> {
  /**
   * 数据列表
   */
  items: T[]

  /**
   * Grid 布局模式
   */
  gridLayout: GridLayoutType

  /**
   * 是否正在加载
   */
  loading?: boolean

  /**
   * 是否没有更多内容
   */
  noMoreContent?: boolean

  /**
   * 是否需要先登录
   */
  needToLoginFirst?: boolean

  /**
   * VideoCard 类型（可选，作为后备值）
   * 如果不指定，会根据数据自动推断
   */
  videoType?: 'rcmd' | 'appRcmd' | 'bangumi' | 'common'

  /**
   * 是否显示预览
   */
  showPreview?: boolean

  /**
   * 是否显示稍后再看
   */
  showWatchLater?: boolean

  /**
   * 是否显示更多按钮
   */
  moreBtn?: boolean

  /**
   * 数据转换函数：将原始数据转换为 VideoCard 所需的格式
   */
  transformItem: (item: T) => Video | undefined

  /**
   * 生成唯一ID的函数（可选接收 index 参数以确保唯一性）
   */
  getItemKey: (item: T, index?: number) => string | number

  /**
   * 是否为骨架屏项（判断函数）
   */
  isSkeletonItem?: (item: T) => boolean

  /**
   * 初始加载时的骨架屏数量
   * @default 30
   */
  initialSkeletonCount?: number

  /**
   * 空状态描述
   */
  emptyDescription?: string

  /**
   * 登录按钮文本
   */
  loginButtonText?: string

  /**
   * 刷新按钮文本
   */
  refreshButtonText?: string

  /**
   * 是否启用整行填充（用于无限滚动场景）
   * 启用后，当有更多数据时会用骨架屏填满最后一行
   * @default false
   */
  enableRowPadding?: boolean

  /**
   * 是否为 Following 页面
   * 用于在右键菜单中默认显示"取消关注"选项
   * @default false
   */
  isFollowingPage?: boolean

  /**
   * 最近一次请求是否失败（API 错误/网络异常等）
   * 父组件在请求失败时设为 true，成功时设为 false
   * 连续失败超过阈值后停止触发 loadMore
   * @default false
   */
  requestFailed?: boolean
}

const props = withDefaults(defineProps<VideoCardGridProps<T>>(), {
  loading: false,
  noMoreContent: false,
  needToLoginFirst: false,
  showPreview: false,
  showWatchLater: true,
  moreBtn: true,
  initialSkeletonCount: 30,
  isSkeletonItem: undefined,
  enableRowPadding: false,
  requestFailed: false,
})

const emit = defineEmits<{
  (e: 'loadMore'): void
  (e: 'refresh'): void
  (e: 'login'): void
}>()

// Grid 容器 ref
const gridContainerRef = ref<HTMLElement | null>(null)
const gridContentRef = ref<HTMLElement | null>(null)
const loadMoreSentinelRef = ref<HTMLElement | null>(null)
const isLoadMoreSentinelIntersecting = ref(false)

// 使用共享的 Grid 布局 composable（CSS 媒体查询驱动，无 JS 计算开销）
const { gridClass, gridCssVars } = useGridLayout(() => props.gridLayout)

// 获取 shadow 样式变量（避免依赖外部传入）
const { shadowStyleVars } = useVideoCardShadowStyle()

// 最少渲染数量阈值：数据量达到此值或 noMoreContent 时才显示实际内容
const MIN_ITEMS_TO_RENDER = 20

// 骨架屏数量使用固定值，避免依赖列数计算
const dynamicSkeletonCount = computed(() => {
  // 估算视口高度能容纳的行数 (假设每个卡片平均400px高)
  const rowsInViewport = Math.ceil(window.innerHeight / 400)
  // 多加载1.5倍的视口内容作为缓冲，假设最多5列
  const bufferedRows = Math.ceil(rowsInViewport * 1.5)
  const estimatedColumns = 5
  const totalCount = bufferedRows * estimatedColumns
  // 不超过设定的上限
  return Math.min(totalCount, props.initialSkeletonCount)
})

// 递归加载保护机制
const consecutiveEmptyLoads = ref(0)
const MAX_CONSECUTIVE_EMPTY_LOADS = 2
const lastItemsCount = ref(0)

// 连续请求失败保护机制
const consecutiveFailures = ref(0)
const MAX_CONSECUTIVE_FAILURES = 3

// 分块渲染：渲染限制（在 displayItems 定义之前声明，避免循环依赖）
const renderLimit = ref(0)

// 是否显示初始骨架屏（数据量不足阈值且还有更多内容时）
// 改为计算是否需要填充骨架屏，而不是完全切换
const needSkeletonPadding = computed(() => {
  if (props.needToLoginFirst)
    return false
  if (props.noMoreContent)
    return false
  if (props.items.length >= MIN_ITEMS_TO_RENDER)
    return false
  return true
})

// 生成填充骨架屏数据（填补到最小渲染数量）
const paddingSkeletonItems = computed(() => {
  if (!needSkeletonPadding.value)
    return []

  const currentCount = props.items.length
  const targetCount = dynamicSkeletonCount.value
  const paddingCount = Math.max(0, targetCount - currentCount)

  return Array.from({ length: paddingCount }, (_, i) => ({
    _isSkeleton: true,
    _skeletonId: `skeleton-padding-${i}`,
  })) as T[]
})

// 是否正在加载更多（数据已达阈值且loading）
const isLoadingMore = computed(() => {
  return props.loading && props.items.length >= MIN_ITEMS_TO_RENDER
})

// 生成加载更多时的骨架屏数据（使用固定数量，由 CSS Grid 自动处理布局）
const loadingMoreSkeletonItems = computed(() => {
  if (!isLoadingMore.value)
    return []

  // 加载更多时显示固定数量的骨架屏，CSS Grid 会自动处理布局
  const totalSkeletons = 10

  return Array.from({ length: totalSkeletons }, (_, i) => ({
    _isSkeleton: true,
    _skeletonId: `skeleton-more-${i}`,
  })) as T[]
})

// 合并实际数据和骨架屏
const displayItems = computed(() => {
  // 数据不足时：数据 + 填充骨架屏
  if (needSkeletonPadding.value) {
    return [...props.items, ...paddingSkeletonItems.value]
  }

  // 加载更多时：数据 + 骨架屏
  if (isLoadingMore.value) {
    return [...props.items, ...loadingMoreSkeletonItems.value]
  }

  // 其他情况：只显示数据
  return props.items
})

// 检查是否可以加载更多
function canLoadMore(): boolean {
  // 连续请求失败次数超过限制时停止
  if (consecutiveFailures.value >= MAX_CONSECUTIVE_FAILURES) {
    return false
  }

  // 连续空加载次数超过限制时停止
  if (consecutiveEmptyLoads.value >= MAX_CONSECUTIVE_EMPTY_LOADS) {
    return false
  }

  // 关键：避免在上一批次未渲染完成时触发 loadMore
  // 否则 sentinel 会保持"太高"，IO/scroll 检查会链式加载
  if (renderLimit.value < displayItems.value.length) {
    return false
  }

  return !props.loading && !props.noMoreContent && !props.needToLoginFirst && props.items.length > 0
}

// 触发加载更多
const loadMoreRequested = ref(false)
let loadMoreRequestTimeout: number | null = null

function triggerLoadMore() {
  if (canLoadMore()) {
    if (loadMoreRequested.value)
      return

    loadMoreRequested.value = true
    emit('loadMore')

    // 防止父组件未及时更新 loading 导致的"卡死"
    if (loadMoreRequestTimeout !== null)
      window.clearTimeout(loadMoreRequestTimeout)
    loadMoreRequestTimeout = window.setTimeout(() => {
      if (!props.loading)
        loadMoreRequested.value = false
      loadMoreRequestTimeout = null
    }, 1500)
  }
}

const supportsIntersectionObserver = typeof window !== 'undefined' && 'IntersectionObserver' in window
let intersectionObserver: IntersectionObserver | null = null

function cleanupIntersectionObserver() {
  if (intersectionObserver) {
    intersectionObserver.disconnect()
    intersectionObserver = null
  }
  isLoadMoreSentinelIntersecting.value = false
}

function setupIntersectionObserver() {
  if (!supportsIntersectionObserver)
    return

  cleanupIntersectionObserver()

  const sentinel = loadMoreSentinelRef.value
  if (!sentinel)
    return

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (!entry)
        return

      isLoadMoreSentinelIntersecting.value = entry.isIntersecting

      if (entry.isIntersecting) {
        // 进入预加载区间时触发加载
        checkShouldPreload()
      }
    },
    {
      root: null,
      // 预加载：当列表底部进入"一个视口高度"范围内触发
      rootMargin: '0px 0px 100% 0px',
      threshold: 0,
    },
  )

  intersectionObserver.observe(sentinel)
}

// RAF 标志，用于批量处理 DOM 读取
let checkPreloadRAF: number | null = null
let virtualWindowRAF: number | null = null
let measureRowSpanRAF: number | null = null
let containerResizeObserver: ResizeObserver | null = null

// 检查是否需要预加载
function checkShouldPreload() {
  if (!canLoadMore())
    return

  // 优先使用 IntersectionObserver 的结果（避免 scroll 下频繁 layout）
  if (supportsIntersectionObserver) {
    if (isLoadMoreSentinelIntersecting.value)
      triggerLoadMore()
    return
  }

  // Fallback: 使用 RAF 批量读取 DOM，避免 Forced Reflow
  if (checkPreloadRAF !== null)
    return

  checkPreloadRAF = requestAnimationFrame(() => {
    checkPreloadRAF = null

    const container = gridContainerRef.value
    if (!container)
      return

    // 批量读取 DOM 属性
    const rect = container.getBoundingClientRect()
    const viewportHeight = window.innerHeight

    // grid 底部到视口底部的距离（剩余未显示的内容高度）
    const remainingHeight = rect.bottom - viewportHeight

    // 如果剩余高度不足一个视口高度（一页），触发预加载
    if (remainingHeight < viewportHeight) {
      triggerLoadMore()
    }
  })
}

// 防抖的滚动检查
const debouncedCheck = useDebounceFn(checkShouldPreload, 100)

// 监听滚动
function handleScroll() {
  scheduleVirtualWindowUpdate()
  debouncedCheck()
}

// 设置滚动监听
function setupScrollListeners() {
  // Bewly 自己的页面都在内部滚动容器中，通过全局事件同步 scrollTop
  if (!settings.value.useOriginalBilibiliHomepage) {
    emitter.on(OVERLAY_SCROLL_BAR_SCROLL, handleScroll)
  }
  else {
    window.addEventListener('scroll', handleScroll, { passive: true })
  }

  window.addEventListener('resize', handleResize, { passive: true })
}

// 清理滚动监听
function cleanupScrollListeners() {
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, handleScroll)
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('resize', handleResize)
}

// 监听 loading 结束后检查是否需要继续加载
watch(() => props.loading, (newLoading, oldLoading) => {
  if (!newLoading) {
    loadMoreRequested.value = false
    if (loadMoreRequestTimeout !== null) {
      window.clearTimeout(loadMoreRequestTimeout)
      loadMoreRequestTimeout = null
    }

    // 跟踪连续请求失败
    if (props.requestFailed) {
      consecutiveFailures.value++
      if (consecutiveFailures.value >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(`[VideoCardGrid] 连续请求失败 ${consecutiveFailures.value} 次，停止加载`)
      }
    }

    // 检测空加载：loading 结束但 items 数量没变化
    if (lastItemsCount.value > 0 && props.items.length === lastItemsCount.value) {
      consecutiveEmptyLoads.value++
    }
  }

  if (oldLoading && !newLoading) {
    // 加载完成后，延迟检查是否需要继续加载
    nextTick(() => {
      checkShouldPreload()
    })
  }
})

// 监听 items 变化后检查（处理初次加载不足的情况）
watch(() => props.items.length, (newCount, oldCount) => {
  // items 被清空，重置状态（用户刷新了页面）
  if (newCount === 0 && oldCount > 0) {
    consecutiveEmptyLoads.value = 0
    consecutiveFailures.value = 0
    lastItemsCount.value = 0
    return
  }

  // 成功加载了新数据，重置空加载计数和失败计数
  if (newCount > lastItemsCount.value) {
    consecutiveEmptyLoads.value = 0
    consecutiveFailures.value = 0
  }
  lastItemsCount.value = newCount

  // items 更新通常意味着加载已完成或数据发生变化，允许下一次 loadMore
  loadMoreRequested.value = false

  nextTick(() => {
    checkShouldPreload()
  })
})

// 监听 noMoreContent 重置（用户切换模式或刷新时）
watch(() => props.noMoreContent, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    consecutiveEmptyLoads.value = 0
    consecutiveFailures.value = 0
  }
})

watch(loadMoreSentinelRef, () => {
  setupIntersectionObserver()
})

// 监听 displayItems 变化，触发分块渲染
watch(
  () => displayItems.value.length,
  (newLen, oldLen) => {
    // 刷新路径（数据被清空）
    if (newLen === 0) {
      renderLimit.value = 0
      return
    }

    // 列表收缩，立即夹紧
    if (newLen < renderLimit.value) {
      renderLimit.value = newLen
      return
    }

    // 只在追加时分块渲染
    if (newLen > oldLen) {
      scheduleChunkRender(newLen)
      return
    }

    // 兜底：保持同步
    renderLimit.value = newLen
  },
)

onMounted(() => {
  // 初始化 renderLimit：对于已存在的数据，立即全部渲染（无渐进式加载）
  renderLimit.value = displayItems.value.length

  setupScrollListeners()
  setupContainerResizeObserver()
  setupIntersectionObserver()
  // 初始检查
  nextTick(() => {
    scheduleMeasureGridRowSpan()
    scheduleVirtualWindowUpdate()
    checkShouldPreload()
  })
})

onUnmounted(() => {
  cleanupScrollListeners()
  cleanupContainerResizeObserver()
  cleanupIntersectionObserver()
  if (loadMoreRequestTimeout !== null) {
    window.clearTimeout(loadMoreRequestTimeout)
    loadMoreRequestTimeout = null
  }
  if (checkPreloadRAF !== null) {
    cancelAnimationFrame(checkPreloadRAF)
    checkPreloadRAF = null
  }
  if (virtualWindowRAF !== null) {
    cancelAnimationFrame(virtualWindowRAF)
    virtualWindowRAF = null
  }
  if (measureRowSpanRAF !== null) {
    cancelAnimationFrame(measureRowSpanRAF)
    measureRowSpanRAF = null
  }
  resetTransformCaches()
})

// 计算是否横向布局（根据 gridLayout 自动决定）
const isHorizontal = computed(() => {
  // adaptive: 纵向布局（图片在上，信息在下）
  // twoColumns/oneColumn: 横向布局（图片在左，信息在右）
  return props.gridLayout !== 'adaptive'
})

// 合并 shadow 样式变量和 grid 列数变量
const gridContainerStyle = computed(() => ({
  ...shadowStyleVars.value,
  ...gridCssVars.value,
}))

// 判断是否应该显示空状态（确认无更多内容且数据为空）
const showEmptyState = computed(() => {
  return props.noMoreContent && props.items.length === 0 && !props.needToLoginFirst
})

// -------------------------
// 分块渲染（Chunked Rendering）- 解决批量 DOM 插入导致的样式重算风暴
// -------------------------
let renderJobToken = 0

function scheduleChunkRender(target: number) {
  const token = ++renderJobToken

  const useRIC = typeof window !== 'undefined' && 'requestIdleCallback' in window

  const step = (deadline?: IdleDeadline) => {
    if (token !== renderJobToken)
      return

    const remaining = target - renderLimit.value
    if (remaining <= 0) {
      return
    }

    // 保守的默认值；如果浏览器报告有足够的空闲时间则提高
    let chunk = 8
    if (deadline && typeof deadline.timeRemaining === 'function') {
      const budget = deadline.timeRemaining()
      if (budget > 12)
        chunk = 20
      else if (budget > 8)
        chunk = 12
    }

    renderLimit.value += Math.min(chunk, remaining)

    if (useRIC) {
      ;(window as any).requestIdleCallback(step, { timeout: 50 })
    }
    else {
      requestAnimationFrame(() => step())
    }
  }

  // 立即开始（但仍然通过 rIC/rAF yield）
  step()
}

// 限制实际渲染的 items（分块显示）
const limitedDisplayItems = computed(() => displayItems.value.slice(0, renderLimit.value))

const INITIAL_VIRTUAL_ROWS = 6
const containerWidth = ref(0)
const viewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0)
const measuredRowSpan = ref(getEstimatedRowSpan(props.gridLayout))
const virtualStartRow = ref(0)
const virtualEndRow = ref(INITIAL_VIRTUAL_ROWS)

function normalizePositiveInt(value: unknown, fallback: number): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0)
    return fallback
  return Math.max(1, Math.round(normalized))
}

function getAdaptiveGridColumns(width: number): number {
  const gridColumns = settings.value.gridColumns

  if (width >= 1536)
    return normalizePositiveInt(gridColumns.xxl, 6)
  if (width >= 1280)
    return normalizePositiveInt(gridColumns.xl, 5)
  if (width >= 1024)
    return normalizePositiveInt(gridColumns.lg, 4)
  if (width >= 768)
    return normalizePositiveInt(gridColumns.md, 3)
  if (width >= 640)
    return normalizePositiveInt(gridColumns.sm, 2)

  return normalizePositiveInt(gridColumns.base, 1)
}

function getCurrentColumnCount(layout: GridLayoutType, width: number): number {
  if (layout === 'twoColumns')
    return 2
  if (layout === 'oneColumn')
    return 1
  return getAdaptiveGridColumns(width)
}

function getGridGap(layout: GridLayoutType): number {
  return layout === 'adaptive' ? 20 : 16
}

function getEstimatedRowSpan(layout: GridLayoutType): number {
  if (layout === 'twoColumns')
    return 236
  if (layout === 'oneColumn')
    return 188
  return 352
}

const resolvedContainerWidth = computed(() => {
  if (containerWidth.value > 0)
    return containerWidth.value

  if (gridContainerRef.value?.clientWidth)
    return gridContainerRef.value.clientWidth

  if (typeof window !== 'undefined')
    return window.innerWidth

  return 0
})

const currentColumnCount = computed(() =>
  getCurrentColumnCount(props.gridLayout, resolvedContainerWidth.value),
)

const currentGridGap = computed(() => getGridGap(props.gridLayout))

const totalRowCount = computed(() => {
  if (limitedDisplayItems.value.length === 0)
    return 0
  return Math.ceil(limitedDisplayItems.value.length / currentColumnCount.value)
})

const visibleRowCount = computed(() => {
  const rowSpan = Math.max(1, measuredRowSpan.value)
  return Math.max(1, Math.ceil(viewportHeight.value / rowSpan))
})

const overscanRowCount = computed(() =>
  Math.max(1, Math.ceil(visibleRowCount.value * 0.5)),
)

const virtualWindowRowCount = computed(() =>
  Math.max(INITIAL_VIRTUAL_ROWS, visibleRowCount.value + overscanRowCount.value * 2),
)

const shouldVirtualize = computed(() => {
  if (needSkeletonPadding.value)
    return false
  return limitedDisplayItems.value.length > virtualWindowRowCount.value * currentColumnCount.value
})

function syncVirtualWindowRows(startRow: number, endRow: number) {
  const totalRows = totalRowCount.value
  const safeStart = Math.max(0, Math.min(startRow, totalRows))
  const safeEnd = Math.max(safeStart, Math.min(endRow, totalRows))

  if (virtualStartRow.value !== safeStart)
    virtualStartRow.value = safeStart
  if (virtualEndRow.value !== safeEnd)
    virtualEndRow.value = safeEnd
}

function updateVirtualWindow() {
  viewportHeight.value = typeof window !== 'undefined' ? window.innerHeight : viewportHeight.value

  const totalRows = totalRowCount.value
  if (!shouldVirtualize.value || totalRows === 0) {
    syncVirtualWindowRows(0, totalRows)
    return
  }

  const container = gridContainerRef.value
  if (!container) {
    syncVirtualWindowRows(0, Math.min(totalRows, virtualWindowRowCount.value))
    return
  }

  const rowSpan = Math.max(1, measuredRowSpan.value)
  const rect = container.getBoundingClientRect()
  const maxScrollOffset = Math.max(0, totalRows * rowSpan - viewportHeight.value)
  const scrollOffset = Math.min(Math.max(-rect.top, 0), maxScrollOffset)
  const firstVisibleRow = Math.floor(scrollOffset / rowSpan)
  const startRow = Math.max(0, firstVisibleRow - overscanRowCount.value)
  const endRow = Math.min(
    totalRows,
    firstVisibleRow + visibleRowCount.value + overscanRowCount.value,
  )

  syncVirtualWindowRows(startRow, endRow)
}

function scheduleVirtualWindowUpdate() {
  if (virtualWindowRAF !== null)
    return

  virtualWindowRAF = requestAnimationFrame(() => {
    virtualWindowRAF = null
    updateVirtualWindow()
  })
}

function measureGridRowSpan() {
  const grid = gridContentRef.value
  const fallbackRowSpan = getEstimatedRowSpan(props.gridLayout)

  if (!grid) {
    if (Math.abs(measuredRowSpan.value - fallbackRowSpan) > 1)
      measuredRowSpan.value = fallbackRowSpan
    return
  }

  const sampleCard = grid.querySelector('.video-card-container') as HTMLElement | null
  if (!sampleCard) {
    if (Math.abs(measuredRowSpan.value - fallbackRowSpan) > 1)
      measuredRowSpan.value = fallbackRowSpan
    return
  }

  const sampleHeight = sampleCard.getBoundingClientRect().height
  if (sampleHeight <= 0)
    return

  const styles = window.getComputedStyle(grid)
  const rowGap = Number.parseFloat(styles.rowGap || styles.gap || '') || currentGridGap.value
  const nextRowSpan = Math.max(sampleHeight + rowGap, fallbackRowSpan * 0.75)

  if (Math.abs(nextRowSpan - measuredRowSpan.value) > 1) {
    measuredRowSpan.value = nextRowSpan
    scheduleVirtualWindowUpdate()
  }
}

function scheduleMeasureGridRowSpan() {
  if (measureRowSpanRAF !== null)
    return

  measureRowSpanRAF = requestAnimationFrame(() => {
    measureRowSpanRAF = null
    measureGridRowSpan()
  })
}

function handleResize() {
  viewportHeight.value = typeof window !== 'undefined' ? window.innerHeight : viewportHeight.value
  measuredRowSpan.value = getEstimatedRowSpan(props.gridLayout)
  scheduleMeasureGridRowSpan()
  scheduleVirtualWindowUpdate()
  debouncedCheck()
}

function cleanupContainerResizeObserver() {
  if (containerResizeObserver) {
    containerResizeObserver.disconnect()
    containerResizeObserver = null
  }
}

function setupContainerResizeObserver() {
  cleanupContainerResizeObserver()

  const container = gridContainerRef.value
  if (!container || typeof ResizeObserver === 'undefined')
    return

  containerWidth.value = container.clientWidth

  containerResizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry)
      return

    const nextWidth = entry.contentRect.width
    if (Math.abs(nextWidth - containerWidth.value) <= 0.5)
      return

    containerWidth.value = nextWidth
    viewportHeight.value = typeof window !== 'undefined' ? window.innerHeight : viewportHeight.value
    scheduleMeasureGridRowSpan()
    scheduleVirtualWindowUpdate()
  })

  containerResizeObserver.observe(container)
}

const virtualStartIndex = computed(() => {
  if (!shouldVirtualize.value)
    return 0
  return Math.min(limitedDisplayItems.value.length, virtualStartRow.value * currentColumnCount.value)
})

const virtualEndIndex = computed(() => {
  if (!shouldVirtualize.value)
    return limitedDisplayItems.value.length
  return Math.min(limitedDisplayItems.value.length, virtualEndRow.value * currentColumnCount.value)
})

const topSpacerHeight = computed(() => {
  if (!shouldVirtualize.value)
    return 0
  return Math.max(0, virtualStartRow.value * measuredRowSpan.value)
})

const bottomSpacerHeight = computed(() => {
  if (!shouldVirtualize.value)
    return 0

  const remainingRows = Math.max(0, totalRowCount.value - virtualEndRow.value)
  return remainingRows * measuredRowSpan.value
})

interface WindowedDisplayItem<T = any> {
  index: number
  item: T
  key: string | number
}

const virtualWindowItems = computed<WindowedDisplayItem<T>[]>(() => {
  const items = limitedDisplayItems.value
  const startIndex = virtualStartIndex.value
  const endIndex = virtualEndIndex.value
  const slicedItems = shouldVirtualize.value ? items.slice(startIndex, endIndex) : items
  const baseIndex = shouldVirtualize.value ? startIndex : 0

  return slicedItems.map((item, localIndex) => {
    const index = baseIndex + localIndex
    return {
      index,
      item,
      key: getUniqueKey(item, index),
    }
  })
})

// 类型定义：每个 VideoCard 的渲染所需数据
interface VideoCardRenderItem {
  key: string | number
  index: number
  item: T
  skeleton: boolean
  type: 'rcmd' | 'appRcmd' | 'bangumi' | 'common'
  video: Video | undefined
}

// 辅助函数：从 video 对象推断类型
function inferVideoTypeFromVideo(video: Video | undefined): 'rcmd' | 'appRcmd' | 'bangumi' | 'common' {
  if (!video)
    return props.videoType || 'common'
  if (video.epid || video.goto === 'bangumi' || video.type === 'bangumi')
    return 'bangumi'
  if (props.videoType === 'rcmd' || props.videoType === 'appRcmd')
    return props.videoType
  return props.videoType || 'common'
}

// 关键优化：把 isSkeleton / inferVideoType / transform 从 template 挪到 computed，
// 避免任何"无关更新"(例如 scroll state)导致 11k 次函数调用。
const renderItems = computed<VideoCardRenderItem[]>(() => {
  const items = virtualWindowItems.value
  const fallbackType = props.videoType || 'common'
  const out: VideoCardRenderItem[] = Array.from({ length: items.length })

  for (let index = 0; index < items.length; index++) {
    const entry = items[index]!
    const { item, key } = entry

    // 自动生成骨架屏
    if ((item as any)?._isSkeleton) {
      out[index] = {
        key,
        index: entry.index,
        item,
        skeleton: true,
        type: fallbackType,
        video: undefined,
      }
      continue
    }

    // 外部骨架判断（命中时不做 transform）
    if (props.isSkeletonItem) {
      try {
        if (props.isSkeletonItem(item)) {
          out[index] = {
            key,
            index: entry.index,
            item,
            skeleton: true,
            type: fallbackType,
            video: undefined,
          }
          continue
        }
      }
      catch {
        // ignore
      }
    }

    const video = getTransformedVideo(item, key)
    const skeleton = !video || (video.id == null && !video.bvid)
    const type = skeleton ? fallbackType : inferVideoTypeFromVideo(video)
    out[index] = { key, index: entry.index, item, skeleton, type, video }
  }

  return out
})

interface VideoTransformCacheEntry<T = any> {
  item: T
  video: Video | undefined
}

let videoTransformCache = new Map<string | number, VideoTransformCacheEntry<T>>()

function resetTransformCaches() {
  videoTransformCache = new Map()
}

watch(() => props.transformItem, () => {
  resetTransformCaches()
})

watch(
  () => virtualWindowItems.value.map(item => item.key),
  (activeKeys) => {
    const activeKeySet = new Set(activeKeys)

    for (const key of videoTransformCache.keys()) {
      if (!activeKeySet.has(key))
        videoTransformCache.delete(key)
    }
  },
  { flush: 'post' },
)

function getTransformedVideo(item: T, key: string | number): Video | undefined {
  if (!item)
    return undefined

  // 检查是否为骨架屏占位，骨架屏不需要转换
  if ((item as any)?._isSkeleton)
    return undefined

  try {
    const cached = videoTransformCache.get(key)
    if (cached && cached.item === item)
      return cached.video

    const video = props.transformItem(item)
    videoTransformCache.set(key, { item, video })
    return video
  }
  catch {
    return undefined
  }
}

watch(gridContainerRef, () => {
  setupContainerResizeObserver()
  scheduleMeasureGridRowSpan()
  scheduleVirtualWindowUpdate()
})

watch(
  [currentColumnCount, () => limitedDisplayItems.value.length, () => props.gridLayout],
  () => {
    measuredRowSpan.value = getEstimatedRowSpan(props.gridLayout)
    scheduleMeasureGridRowSpan()
    scheduleVirtualWindowUpdate()
  },
  { flush: 'post' },
)

watch(
  [() => virtualStartIndex.value, () => virtualEndIndex.value, currentColumnCount],
  () => {
    scheduleMeasureGridRowSpan()
  },
  { flush: 'post' },
)

// 处理登录
function handleLogin() {
  emit('login')
}

// 处理刷新
function handleRefresh() {
  emit('refresh')
}

// 生成唯一 key
function getUniqueKey(item: T, index: number): string | number {
  // 如果是骨架屏占位，使用骨架屏 ID
  if ((item as any)?._skeletonId)
    return (item as any)._skeletonId

  // 如果 item 为空或无效，使用稳定的 index 作为 key（避免随机值破坏 v-memo）
  if (!item)
    return `empty-${index}`

  try {
    // 否则使用正常的 key
    return props.getItemKey(item, index)
  }
  catch {
    // 如果获取 key 失败，使用稳定的 index 作为 key
    return `error-${index}`
  }
}
</script>

<template>
  <div>
    <!-- 需要登录 -->
    <Empty v-if="needToLoginFirst" mt-6 :description="$t('common.please_log_in_first')">
      <Button type="primary" @click="handleLogin">
        {{ loginButtonText || $t('common.login') }}
      </Button>
    </Empty>

    <!-- 空列表 -->
    <Empty
      v-else-if="showEmptyState"
      mt-6
      :description="emptyDescription || $t('common.no_more_content')"
    >
      <Button type="primary" @click="handleRefresh">
        {{ refreshButtonText || $t('common.operation.refresh') }}
      </Button>
    </Empty>

    <!-- 统一的 Grid 容器 - 保持 ref 稳定 -->
    <div
      v-else
      ref="gridContainerRef"
      class="video-card-grid-container"
      m="b-0 t-0" relative w-full
      :style="gridContainerStyle"
    >
      <div
        v-if="topSpacerHeight > 0"
        class="virtual-spacer"
        :style="{ height: `${topSpacerHeight}px` }"
        aria-hidden="true"
      />

      <!-- Grid 内容（统一渲染，避免 v-if/v-else 切换导致的滚动跳动） -->
      <div ref="gridContentRef" :class="gridClass">
        <VideoCard
          v-for="renderItem in renderItems"
          :key="renderItem.key"
          v-memo="[renderItem.key, renderItem.skeleton, renderItem.type, renderItem.video, showPreview, showWatchLater, isHorizontal, moreBtn]"
          :skeleton="renderItem.skeleton"
          :type="renderItem.type"
          :video="renderItem.video"
          :show-preview="showPreview"
          :show-watcher-later="showWatchLater"
          :horizontal="isHorizontal"
          :more-btn="moreBtn"
          :is-following-page="props.isFollowingPage"
        >
          <template v-for="(_, name) in $slots" #[name]>
            <slot :name="name" :item="renderItem.item" />
          </template>
        </VideoCard>
      </div>

      <div
        v-if="bottomSpacerHeight > 0"
        class="virtual-spacer"
        :style="{ height: `${bottomSpacerHeight}px` }"
        aria-hidden="true"
      />

      <div ref="loadMoreSentinelRef" class="load-more-sentinel" aria-hidden="true" />
    </div>

    <!-- 无更多内容提示（仅在有数据时显示，避免与空列表提示重复） -->
    <Empty v-if="noMoreContent && !needToLoginFirst && items.length > 0" class="pb-4" :description="$t('common.no_more_content')" />
  </div>
</template>

<style lang="scss" scoped>
// Grid 布局 - 使用 Tailwind CSS 标准媒体断点 + CSS 变量控制列数
.grid-adaptive {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(var(--grid-cols-base, 1), 1fr);
  contain: layout style;
  align-items: stretch;
}

@media (min-width: 640px) {
  .grid-adaptive {
    grid-template-columns: repeat(var(--grid-cols-sm, 2), 1fr);
  }
}

@media (min-width: 768px) {
  .grid-adaptive {
    grid-template-columns: repeat(var(--grid-cols-md, 3), 1fr);
  }
}

@media (min-width: 1024px) {
  .grid-adaptive {
    grid-template-columns: repeat(var(--grid-cols-lg, 4), 1fr);
  }
}

@media (min-width: 1280px) {
  .grid-adaptive {
    grid-template-columns: repeat(var(--grid-cols-xl, 5), 1fr);
  }
}

@media (min-width: 1536px) {
  .grid-adaptive {
    grid-template-columns: repeat(var(--grid-cols-xxl, 6), 1fr);
  }
}

.grid-two-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  contain: layout style;
  align-items: stretch;
}

@supports (container-type: inline-size) {
  .video-card-grid-container {
    container-type: inline-size;
  }

  .grid-adaptive {
    grid-template-columns: repeat(var(--grid-cols-base, 1), 1fr);
  }

  @container (min-width: 640px) {
    .grid-adaptive {
      grid-template-columns: repeat(var(--grid-cols-sm, 2), 1fr);
    }
  }

  @container (min-width: 768px) {
    .grid-adaptive {
      grid-template-columns: repeat(var(--grid-cols-md, 3), 1fr);
    }
  }

  @container (min-width: 1024px) {
    .grid-adaptive {
      grid-template-columns: repeat(var(--grid-cols-lg, 4), 1fr);
    }
  }

  @container (min-width: 1280px) {
    .grid-adaptive {
      grid-template-columns: repeat(var(--grid-cols-xl, 5), 1fr);
    }
  }

  @container (min-width: 1536px) {
    .grid-adaptive {
      grid-template-columns: repeat(var(--grid-cols-xxl, 6), 1fr);
    }
  }
}

.grid-one-column {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 16px;
  contain: layout style;
  align-items: stretch;
}

.virtual-spacer {
  width: 100%;
  pointer-events: none;
  contain: layout style;
  overflow-anchor: none;
}

:deep(.video-card-container) {
  contain: layout style;
  content-visibility: auto;
  contain-intrinsic-size: auto none;
  min-width: 0;
}

.load-more-sentinel {
  width: 100%;
  height: 1px;
}
</style>
