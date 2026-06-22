<script setup lang="ts" generic="T = any">
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useDebounceFn } from '@vueuse/core'

import type { Video } from '~/components/VideoCard/types'
import { useGridLayout } from '~/composables/useGridLayout'
import { useVideoCardShadowStyle } from '~/composables/useVideoCardShadowStyle'
import { OVERLAY_SCROLL_BAR_SCROLL } from '~/constants/globalEvents'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import emitter from '~/utils/mitt'

import SmoothLoading from './SmoothLoading.vue'

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
   * 自定义卡片点击处理。未传入时 VideoCard 使用设置中的默认打开行为。
   */
  cardClickHandler?: (item: T, event: MouseEvent) => void

  /**
   * 是否让封面左上角插槽常驻显示。
   * @default false
   */
  coverTopLeftAlwaysVisible?: boolean

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
   * 加载更多时是否在列表末尾插入骨架屏
   * @default true
   */
  showLoadingMoreSkeleton?: boolean

  /**
   * 加载更多时插入的骨架屏数量
   * @default 10
   */
  loadingMoreSkeletonCount?: number

  /**
   * 是否在列表底部显示固定占位的加载提示
   * @default false
   */
  showLoadMoreIndicator?: boolean

  /**
   * 底部加载提示的固定高度
   * @default '110px'
   */
  loadMoreIndicatorHeight?: string

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
  showLoadingMoreSkeleton: true,
  loadingMoreSkeletonCount: 10,
  showLoadMoreIndicator: false,
  loadMoreIndicatorHeight: '110px',
  requestFailed: false,
})

const emit = defineEmits<{
  (e: 'loadMore'): void
  (e: 'refresh'): void
  (e: 'login'): void
}>()

// Grid 容器 ref
const gridContainerRef = ref<HTMLElement | null>(null)
const loadMoreSentinelRef = ref<HTMLElement | null>(null)
const isLoadMoreSentinelIntersecting = ref(false)
const reachedLoadMoreDuringLoading = ref(false)

// 使用共享的 Grid 布局 composable（CSS 媒体查询驱动，无 JS 计算开销）
const { gridCssVars } = useGridLayout(() => props.gridLayout)

// 获取 shadow 样式变量（避免依赖外部传入）
const { shadowStyleVars } = useVideoCardShadowStyle()

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

// 仅首屏空数据加载时显示骨架屏；滚动加载时不再向虚拟列表插入临时卡片。
const showInitialSkeleton = computed(() => {
  if (props.needToLoginFirst)
    return false
  if (!props.loading)
    return false
  return props.items.length === 0
})

// 生成首屏骨架屏数据
const initialSkeletonItems = computed(() => {
  if (!showInitialSkeleton.value)
    return []

  return Array.from({ length: dynamicSkeletonCount.value }, (_, i) => ({
    _isSkeleton: true,
    _skeletonId: `skeleton-initial-${i}`,
  })) as T[]
})

// 有真实数据时，用与视频卡片相同结构的骨架卡片表示下一批数据正在加载。
const showLoadingMoreSkeletonItems = computed(() => {
  return props.showLoadingMoreSkeleton
    && props.loading
    && props.items.length > 0
    && !props.needToLoginFirst
})

const loadingMoreSkeletonItems = computed(() => {
  if (!showLoadingMoreSkeletonItems.value)
    return []

  const minimumSkeletonCount = normalizePositiveInt(props.loadingMoreSkeletonCount, 10)
  const columns = getRenderedColumnCount()
  const remainder = (props.items.length + minimumSkeletonCount) % columns
  const skeletonCount = minimumSkeletonCount + (remainder === 0 ? 0 : columns - remainder)
  return Array.from({ length: skeletonCount }, (_, i) => ({
    _isSkeleton: true,
    _skeletonId: `skeleton-more-${i}`,
  })) as T[]
})

// 合并实际数据和骨架屏
const displayItems = computed(() => {
  if (showInitialSkeleton.value)
    return initialSkeletonItems.value

  if (showLoadingMoreSkeletonItems.value)
    return [...props.items, ...loadingMoreSkeletonItems.value]

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
const isFirefox = typeof navigator !== 'undefined' && /\bFirefox\//.test(navigator.userAgent)
let intersectionObserver: IntersectionObserver | null = null
let isGridActive = false
let scrollListenersActive = false

function cleanupIntersectionObserver() {
  if (intersectionObserver) {
    intersectionObserver.disconnect()
    intersectionObserver = null
  }
  isLoadMoreSentinelIntersecting.value = false
}

function setupIntersectionObserver() {
  if (!supportsIntersectionObserver || !isGridActive)
    return

  cleanupIntersectionObserver()

  const sentinel = loadMoreSentinelRef.value
  if (!sentinel)
    return

  const scrollElement = findScrollElement()
  const preloadDistance = getPreloadDistance(scrollElement)

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      if (!isGridActive)
        return

      const entry = entries[0]
      if (!entry)
        return

      isLoadMoreSentinelIntersecting.value = entry.isIntersecting

      if (!entry.isIntersecting)
        reachedLoadMoreDuringLoading.value = false

      if (entry.isIntersecting) {
        // 进入预加载区间时触发加载
        checkShouldPreload()
      }
    },
    {
      root: scrollElement,
      // 使用滚动容器的一页实际高度，避免百分比 rootMargin 按宽度解析。
      rootMargin: `0px 0px ${preloadDistance}px 0px`,
      threshold: 0,
    },
  )

  intersectionObserver.observe(sentinel)
}

// RAF 标志，用于批量处理 DOM 读取
let checkPreloadRAF: number | null = null
let containerResizeObserver: ResizeObserver | null = null

// 检查是否需要预加载
function checkShouldPreload() {
  if (!isGridActive)
    return

  if (props.loading) {
    if (isLoadMoreSentinelIntersecting.value)
      reachedLoadMoreDuringLoading.value = true
    return
  }

  if (!canLoadMore())
    return

  // 优先使用 IntersectionObserver 的结果。
  if (supportsIntersectionObserver && isLoadMoreSentinelIntersecting.value) {
    triggerLoadMore()
    return
  }

  // observer 回调可能滞后；用滚动几何位置兜底，保证至少提前一页加载。
  if (checkPreloadRAF !== null)
    return

  checkPreloadRAF = requestAnimationFrame(() => {
    checkPreloadRAF = null

    if (isWithinPreloadDistance())
      triggerLoadMore()
  })
}

// 防抖的滚动检查
const debouncedCheck = useDebounceFn(checkShouldPreload, 100)

// 监听滚动
// emitter 路径已在 App.vue 的 RAF 内，直接同步更新避免双 RAF 延迟
// native 路径浏览器已限制为每帧一次，也可直接更新
function handleScroll() {
  debouncedCheck()
}

// 设置滚动监听
function setupScrollListeners() {
  if (scrollListenersActive)
    return

  scrollListenersActive = true

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
  if (!scrollListenersActive)
    return

  scrollListenersActive = false
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, handleScroll)
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('resize', handleResize)
}

function getRenderedColumnCount(): number {
  const containerWidth = gridContainerRef.value?.clientWidth
    || (typeof window !== 'undefined' ? window.innerWidth : 0)
  return getCurrentColumnCount(props.gridLayout, containerWidth)
}

function getMissingItemsInLastRow(): number {
  const columns = getRenderedColumnCount()
  const remainder = props.items.length % columns
  return remainder === 0 ? 0 : columns - remainder
}

// 监听 loading 结束后检查是否需要继续加载
watch(() => props.loading, (newLoading, oldLoading) => {
  if (newLoading && isLoadMoreSentinelIntersecting.value && props.items.length > 0)
    reachedLoadMoreDuringLoading.value = true

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
    const stayedInPreloadArea = reachedLoadMoreDuringLoading.value
    reachedLoadMoreDuringLoading.value = false

    // 加载完成后，延迟检查是否需要继续加载
    nextTick(() => {
      // 用户可能在请求结束前刚好滚到底部。此时 sentinel 没有新的相交变化，
      // 直接按滚动容器几何位置补触发，避免丢掉这次 loadMore。
      if (isScrollAtBottom()) {
        triggerLoadMore()
        return
      }

      // 首页保留一页预加载缓冲。上一批结束后仍处于缓冲区时继续预取，
      // 直到新内容把列表底部推出这一页范围。
      if (stayedInPreloadArea && props.showLoadingMoreSkeleton && isWithinPreloadDistance()) {
        checkShouldPreload()
        return
      }

      // sentinel 在整个请求期间都处于相交状态时，IntersectionObserver 不会再次回调。
      // 只在末行差 1-2 张卡片时主动补查，避免恢复无条件递归加载。
      if (stayedInPreloadArea) {
        const missingItems = getMissingItemsInLastRow()
        if (missingItems === 0 || missingItems > 2)
          return
      }

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
    reachedLoadMoreDuringLoading.value = false
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

  if (props.loading || reachedLoadMoreDuringLoading.value)
    return

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
      // 虚拟滚动激活时，跳过分块渲染——虚拟窗口已经限制了 DOM 数量，
      // 分块渲染的 requestIdleCallback 在快速滚动时反而会导致渲染滞后
      const estimatedColumns = getCurrentColumnCount(props.gridLayout, gridContainerRef.value?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0))
      const virtualThreshold = 6 * estimatedColumns
      if (newLen > virtualThreshold) {
        renderLimit.value = newLen
      }
      else {
        scheduleChunkRender(newLen)
      }
      return
    }

    // 兜底：保持同步
    renderLimit.value = newLen
  },
)

function activateGrid() {
  if (isGridActive)
    return

  isGridActive = true
  setupScrollListeners()
  setupContainerResizeObserver()

  nextTick(() => {
    if (!isGridActive)
      return

    setupIntersectionObserver()
    checkShouldPreload()
  })
}

function deactivateGrid() {
  if (!isGridActive)
    return

  isGridActive = false
  cleanupScrollListeners()
  cleanupContainerResizeObserver()
  cleanupIntersectionObserver()

  if (checkPreloadRAF !== null) {
    cancelAnimationFrame(checkPreloadRAF)
    checkPreloadRAF = null
  }
}

onMounted(() => {
  // 初始化 renderLimit：对于已存在的数据，立即全部渲染（无渐进式加载）
  renderLimit.value = displayItems.value.length
  activateGrid()
})

onActivated(activateGrid)
onDeactivated(deactivateGrid)

onUnmounted(() => {
  deactivateGrid()
  if (loadMoreRequestTimeout !== null) {
    window.clearTimeout(loadMoreRequestTimeout)
    loadMoreRequestTimeout = null
  }
  if (checkPreloadRAF !== null) {
    cancelAnimationFrame(checkPreloadRAF)
    checkPreloadRAF = null
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
      nextTick(() => {
        checkShouldPreload()
      })
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

const containerWidth = ref(0)
const viewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0)

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

function getFallbackEstimatedRowHeight(layout: GridLayoutType): number {
  return Math.max(1, getEstimatedRowSpan(layout) - getGridGap(layout))
}

function getEstimatedAdaptiveRowHeight(width: number, columns: number): number {
  if (width <= 0 || columns <= 0)
    return getFallbackEstimatedRowHeight('adaptive')

  const gap = getGridGap('adaptive')
  const cardWidth = Math.max(1, (width - gap * (columns - 1)) / columns)
  const coverHeight = cardWidth * 9 / 16

  // Keep the first virtual pass close to the actual card height so rows do
  // not render with a large temporary gap before ResizeObserver catches up.
  switch (settings.value.videoCardLayout) {
    case 'compact':
      return coverHeight + 66
    case 'old':
      return coverHeight + 132
    case 'modern':
    default:
      return coverHeight + 112
  }
}

function getEstimatedHorizontalItemHeight(layout: GridLayoutType, itemWidth: number): number {
  const fallbackHeight = layout === 'twoColumns' ? 220 : 236

  if (itemWidth <= 0)
    return fallbackHeight

  const coverWidth = Math.min(itemWidth, 400)
  const coverHeight = coverWidth * 9 / 16

  return Math.max(fallbackHeight, Math.ceil(coverHeight))
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

const VIRTUAL_RETAIN_SCREENS = 2

const virtualItemWidth = computed(() => {
  const columns = currentColumnCount.value
  const width = resolvedContainerWidth.value
  if (columns <= 1)
    return Math.max(1, width)
  return Math.max(1, (width - currentGridGap.value * (columns - 1)) / columns)
})

const estimatedItemHeight = computed(() => {
  if (props.gridLayout === 'adaptive')
    return getEstimatedAdaptiveRowHeight(resolvedContainerWidth.value, currentColumnCount.value)
  return getEstimatedHorizontalItemHeight(props.gridLayout, virtualItemWidth.value)
})

const visibleRowCount = computed(() => {
  const rowSpan = Math.max(1, estimatedItemHeight.value + currentGridGap.value)
  return Math.max(1, Math.ceil(viewportHeight.value / rowSpan))
})

const overscanRowCount = computed(() =>
  Math.max(2, Math.ceil(visibleRowCount.value * VIRTUAL_RETAIN_SCREENS)),
)

const overscanItemCount = computed(() =>
  overscanRowCount.value * currentColumnCount.value,
)

function findScrollElement(): HTMLElement | null {
  if (settings.value.useOriginalBilibiliHomepage)
    return document.scrollingElement as HTMLElement | null

  let element = gridContainerRef.value?.parentElement ?? null
  while (element) {
    const styles = window.getComputedStyle(element)
    const canScrollY = /auto|scroll|overlay/.test(styles.overflowY)
    if (canScrollY)
      return element
    element = element.parentElement
  }

  return null
}

function getPreloadDistance(scrollElement: HTMLElement | null = findScrollElement()): number {
  return Math.max(1, scrollElement?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0))
}

function getRemainingScroll(scrollElement: HTMLElement): number {
  return scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop
}

function isWithinPreloadDistance(): boolean {
  const scrollElement = findScrollElement()
  if (!scrollElement)
    return false

  return getRemainingScroll(scrollElement) <= getPreloadDistance(scrollElement)
}

function isScrollAtBottom(): boolean {
  const scrollElement = findScrollElement()
  if (!scrollElement)
    return false

  return getRemainingScroll(scrollElement) <= 2
}

const itemVirtualizer = useVirtualizer<HTMLElement, HTMLElement>(computed(() => ({
  count: displayItems.value.length,
  getScrollElement: () => findScrollElement(),
  estimateSize: () => estimatedItemHeight.value,
  overscan: overscanItemCount.value,
  gap: currentGridGap.value,
  lanes: currentColumnCount.value,
  getItemKey: index => getUniqueKey(displayItems.value[index], index),
  measureElement: () => estimatedItemHeight.value,
  shouldAdjustScrollPositionOnItemSizeChange: () => false,
})))

const virtualItems = computed(() => itemVirtualizer.value.getVirtualItems())
const virtualTotalHeight = computed(() => itemVirtualizer.value.getTotalSize())

function handleResize() {
  viewportHeight.value = typeof window !== 'undefined' ? window.innerHeight : viewportHeight.value
  itemVirtualizer.value.measure()
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
    itemVirtualizer.value.measure()
  })

  containerResizeObserver.observe(container)
}

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

function createRenderItem(item: T, index: number): VideoCardRenderItem {
  const key = getUniqueKey(item, index)
  const fallbackType = props.videoType || 'common'

  // 自动生成骨架屏
  if ((item as any)?._isSkeleton) {
    return {
      key,
      index,
      item,
      skeleton: true,
      type: fallbackType,
      video: undefined,
    }
  }

  // 外部骨架判断（命中时不做 transform）
  if (props.isSkeletonItem) {
    try {
      if (props.isSkeletonItem(item)) {
        return {
          key,
          index,
          item,
          skeleton: true,
          type: fallbackType,
          video: undefined,
        }
      }
    }
    catch {
      // ignore
    }
  }

  const video = getTransformedVideo(item, key)
  const skeleton = !video || (video.id == null && !video.bvid)
  const type = skeleton ? fallbackType : inferVideoTypeFromVideo(video)
  return { key, index, item, skeleton, type, video }
}

interface VirtualCardRenderItem extends VideoCardRenderItem {
  lane: number
  start: number
}

// 用 TanStack lanes 虚拟化卡片；测量高度固定，避免 skeleton/真实卡片切换后改写列高。
const renderItems = computed<VirtualCardRenderItem[]>(() => {
  const sourceItems = displayItems.value
  return virtualItems.value.flatMap((virtualItem) => {
    if (virtualItem.index >= renderLimit.value)
      return []

    const item = sourceItems[virtualItem.index]
    if (!item)
      return []

    return [{
      ...createRenderItem(item, virtualItem.index),
      lane: virtualItem.lane,
      start: virtualItem.start,
    }]
  })
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
  () => renderItems.value.map(item => item.key),
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
  itemVirtualizer.value.measure()
})

watch(
  [currentColumnCount, () => props.gridLayout, () => settings.value.videoCardLayout],
  () => {
    itemVirtualizer.value.measure()
  },
  { flush: 'post' },
)

watch(
  () => displayItems.value.length,
  () => {
    itemVirtualizer.value.measure()
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
  <div class="video-card-grid-root">
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
      :class="{ 'is-firefox': isFirefox }"
      m="b-0 t-0" relative w-full
      :style="gridContainerStyle"
    >
      <div
        class="virtual-rows"
        :style="{ height: `${virtualTotalHeight}px` }"
      >
        <div
          v-for="renderItem in renderItems"
          :key="renderItem.key"
          :ref="(el) => itemVirtualizer.measureElement(el as HTMLElement | null)"
          :data-index="renderItem.index"
          class="virtual-item"
          :style="{
            'top': `${renderItem.start}px`,
            'left': `${renderItem.lane * (virtualItemWidth + currentGridGap)}px`,
            'width': `${virtualItemWidth}px`,
            'height': `${estimatedItemHeight}px`,
            'minHeight': `${estimatedItemHeight}px`,
            '--bew-video-card-virtual-height': `${estimatedItemHeight}px`,
          }"
        >
          <VideoCard
            :skeleton="renderItem.skeleton"
            :type="renderItem.type"
            :video="renderItem.video"
            :show-preview="showPreview"
            :show-watcher-later="showWatchLater"
            :horizontal="isHorizontal"
            :more-btn="moreBtn"
            :is-following-page="props.isFollowingPage"
            :custom-click-handler="props.cardClickHandler ? (event: MouseEvent) => props.cardClickHandler?.(renderItem.item, event) : undefined"
            :cover-top-left-always-visible="props.coverTopLeftAlwaysVisible"
          >
            <template v-for="(_, name) in $slots" #[name]>
              <slot :name="name" :item="renderItem.item" />
            </template>
          </VideoCard>
        </div>
      </div>

      <div ref="loadMoreSentinelRef" class="load-more-sentinel" aria-hidden="true" />
    </div>

    <SmoothLoading
      v-if="showLoadMoreIndicator"
      class="load-more-loading"
      :show="loading"
      :keep-space="true"
      :min-height="loadMoreIndicatorHeight"
    />

    <!-- 无更多内容提示（仅在有数据时显示，避免与空列表提示重复） -->
    <Empty v-if="noMoreContent && !needToLoginFirst && items.length > 0" class="pb-4" :description="$t('common.no_more_content')" />
  </div>
</template>

<style lang="scss" scoped>
.video-card-grid-root {
  overflow-anchor: none;
}

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

.virtual-rows {
  position: relative;
  width: 100%;
  contain: layout style;
  overflow-anchor: none;
}

.virtual-item {
  position: absolute;
  left: 0;
  contain: layout style;
  overflow-anchor: none;
  overflow: visible;

  &:hover,
  &:focus-within {
    z-index: 2;
  }

  :deep(.video-card-container) {
    content-visibility: visible;
    contain-intrinsic-size: auto none;
    min-height: var(--bew-video-card-virtual-height);
  }

  :deep(.video-card-container--skeleton) {
    box-sizing: border-box;
    height: var(--bew-video-card-virtual-height);
    max-height: var(--bew-video-card-virtual-height);
    overflow: hidden;
  }
}

.video-card-grid-container {
  overflow-anchor: none;

  &.is-firefox :deep(.video-card-container) {
    content-visibility: visible;
    contain-intrinsic-size: auto none;
  }
}

:deep(.video-card-container) {
  contain: layout style;
  content-visibility: auto;
  overflow-anchor: none;
  contain-intrinsic-size: auto 360px 260px;
  min-width: 0;
}

.load-more-sentinel {
  width: 100%;
  height: 1px;
  overflow-anchor: none;
}

.load-more-loading {
  overflow-anchor: none;

  :deep(.loading-container) {
    overflow-anchor: none;
  }
}
</style>
