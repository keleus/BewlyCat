<script setup lang="ts" generic="T = any">
import { useDebounceFn } from '@vueuse/core'

import type { Video } from '~/components/VideoCard/types'
import type { BewlyAppProvider } from '~/composables/useAppProvider'
import { useGridLayout } from '~/composables/useGridLayout'
import { useVideoCardShadowStyle } from '~/composables/useVideoCardShadowStyle'
import { OVERLAY_SCROLL_BAR_SCROLL } from '~/constants/globalEvents'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import { getAdaptiveGridColumnCount, getListGridColumnCount } from '~/utils/gridLayout'
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
   * 是否隐藏作者信息
   */
  hideAuthor?: boolean

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
const bewlyApp = inject<BewlyAppProvider | undefined>('BEWLY_APP', undefined)

// 使用共享的 Grid 布局 composable（CSS 媒体查询驱动，无 JS 计算开销）
const { gridClass, gridCssVars } = useGridLayout(() => props.gridLayout)

// 获取 shadow 样式变量（避免依赖外部传入）
const { shadowStyleVars } = useVideoCardShadowStyle()

// 卡片入场：仅对新增真实卡片播放，区分 grid / list
const GRID_ENTER_DURATION_MS = 200
const LIST_ENTER_DURATION_MS = 180
const GRID_ENTER_STAGGER_MS = 24
const GRID_ENTER_MAX_DELAY_MS = 192
const revealedCardKeys = new Set<string | number>()
const enteringCardMeta = reactive(new Map<string | number, { mode: 'grid' | 'list', delay: number }>())
const cardEnterTimers = new Map<string | number, ReturnType<typeof setTimeout>>()
const prefersReducedMotion = ref(false)
let reducedMotionMediaQuery: MediaQueryList | null = null

const cardEnterMode = computed<'grid' | 'list'>(() => {
  return props.gridLayout === 'adaptive' ? 'grid' : 'list'
})

function clearCardEnterState() {
  revealedCardKeys.clear()
  enteringCardMeta.clear()
  cardEnterTimers.forEach(timer => clearTimeout(timer))
  cardEnterTimers.clear()
}

function getCardEnterClass(key: string | number) {
  const meta = enteringCardMeta.get(key)
  if (!meta)
    return null
  return meta.mode === 'grid'
    ? 'video-card-grid-item--enter-grid'
    : 'video-card-grid-item--enter-list'
}

function getCardEnterStyle(key: string | number) {
  const meta = enteringCardMeta.get(key)
  if (!meta || meta.delay <= 0)
    return undefined
  return {
    '--enter-delay': `${meta.delay}ms`,
  }
}

function markRenderItemsEntering(items: VideoCardRenderItem[]) {
  if (prefersReducedMotion.value) {
    for (const item of items) {
      if (!item.skeleton)
        revealedCardKeys.add(item.key)
    }
    enteringCardMeta.clear()
    return
  }

  const mode = cardEnterMode.value
  let batchIndex = 0

  for (const item of items) {
    if (item.skeleton || revealedCardKeys.has(item.key) || enteringCardMeta.has(item.key))
      continue

    revealedCardKeys.add(item.key)

    const delay = mode === 'grid'
      ? Math.min(batchIndex * GRID_ENTER_STAGGER_MS, GRID_ENTER_MAX_DELAY_MS)
      : 0
    batchIndex++

    enteringCardMeta.set(item.key, { mode, delay })

    const previousTimer = cardEnterTimers.get(item.key)
    if (previousTimer)
      clearTimeout(previousTimer)

    const duration = (mode === 'grid' ? GRID_ENTER_DURATION_MS : LIST_ENTER_DURATION_MS) + delay
    cardEnterTimers.set(item.key, setTimeout(() => {
      enteringCardMeta.delete(item.key)
      cardEnterTimers.delete(item.key)
    }, duration + 40))
  }
}

function handleReducedMotionChange(event: MediaQueryListEvent) {
  prefersReducedMotion.value = event.matches
  if (event.matches) {
    enteringCardMeta.clear()
    cardEnterTimers.forEach(timer => clearTimeout(timer))
    cardEnterTimers.clear()
  }
}

function setupReducedMotionWatcher() {
  if (typeof window === 'undefined' || !window.matchMedia)
    return

  reducedMotionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  prefersReducedMotion.value = reducedMotionMediaQuery.matches

  if (typeof reducedMotionMediaQuery.addEventListener === 'function')
    reducedMotionMediaQuery.addEventListener('change', handleReducedMotionChange)
  else
    reducedMotionMediaQuery.addListener(handleReducedMotionChange)
}

function cleanupReducedMotionWatcher() {
  if (!reducedMotionMediaQuery)
    return
  if (typeof reducedMotionMediaQuery.removeEventListener === 'function')
    reducedMotionMediaQuery.removeEventListener('change', handleReducedMotionChange)
  else
    reducedMotionMediaQuery.removeListener(handleReducedMotionChange)
  reducedMotionMediaQuery = null
}

setupReducedMotionWatcher()

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

// 仅首屏空数据加载时显示骨架屏；滚动加载时不再向列表插入临时卡片。
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

  return !props.loading && !props.noMoreContent && !props.needToLoginFirst && props.items.length > 0
}

// 触发加载更多
const loadMoreRequested = ref(false)
let loadMoreRequestTimeout: number | null = null
let continuePreloadTimer: number | null = null

function triggerLoadMore() {
  if (!canLoadMore())
    return
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

const supportsIntersectionObserver = typeof window !== 'undefined' && 'IntersectionObserver' in window
const supportsResizeObserver = typeof window !== 'undefined' && 'ResizeObserver' in window
const isFirefox = typeof navigator !== 'undefined' && /\bFirefox\//.test(navigator.userAgent)
let intersectionObserver: IntersectionObserver | null = null
let scrollResizeObserver: ResizeObserver | null = null
let isGridActive = false
let scrollListenersActive = false
let cachedScrollElement: HTMLElement | null = null
let lastObserverRoot: Element | null | undefined
let lastObserverPreloadDistance = -1
let checkPreloadRAF: number | null = null
let postLoadCheckRAF: number | null = null

function invalidateScrollElementCache() {
  cachedScrollElement = null
}

function cleanupIntersectionObserver(options?: { preserveIntersecting?: boolean }) {
  if (intersectionObserver) {
    intersectionObserver.disconnect()
    intersectionObserver = null
  }
  lastObserverRoot = undefined
  lastObserverPreloadDistance = -1
  if (!options?.preserveIntersecting)
    isLoadMoreSentinelIntersecting.value = false
}

function cleanupScrollResizeObserver() {
  if (scrollResizeObserver) {
    scrollResizeObserver.disconnect()
    scrollResizeObserver = null
  }
}

function setupScrollResizeObserver() {
  cleanupScrollResizeObserver()
  if (!supportsResizeObserver || !isGridActive)
    return

  const scrollElement = findScrollElement()
  if (!scrollElement || scrollElement === document.scrollingElement || scrollElement === document.documentElement || scrollElement === document.body)
    return

  scrollResizeObserver = new ResizeObserver(() => {
    if (!isGridActive)
      return
    // 视口高度变化会让 rootMargin 失真，需要重建 observer。
    setupIntersectionObserver(true)
    schedulePreloadCheck()
  })
  scrollResizeObserver.observe(scrollElement)
}

function setupIntersectionObserver(force = false) {
  if (!supportsIntersectionObserver || !isGridActive)
    return

  const sentinel = loadMoreSentinelRef.value
  if (!sentinel)
    return

  const scrollElement = findScrollElement()
  const preloadDistance = getPreloadDistance(scrollElement)

  if (
    !force
    && intersectionObserver
    && lastObserverRoot === scrollElement
    && lastObserverPreloadDistance === preloadDistance
  ) {
    return
  }

  // 重建时保留相交状态，避免 loading 过程中短暂丢失 reached 标记。
  cleanupIntersectionObserver({ preserveIntersecting: true })

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
      else if (props.loading)
        reachedLoadMoreDuringLoading.value = true

      if (entry.isIntersecting)
        checkShouldPreload()
    },
    {
      root: scrollElement,
      // 使用滚动容器的一页实际高度，避免百分比 rootMargin 按宽度解析。
      rootMargin: `0px 0px ${preloadDistance}px 0px`,
      threshold: 0,
    },
  )

  lastObserverRoot = scrollElement
  lastObserverPreloadDistance = preloadDistance
  intersectionObserver.observe(sentinel)
}

function schedulePreloadCheck() {
  if (!isGridActive)
    return
  if (checkPreloadRAF !== null)
    return

  checkPreloadRAF = requestAnimationFrame(() => {
    checkPreloadRAF = null
    checkShouldPreload()
  })
}

// 检查是否需要预加载
function checkShouldPreload() {
  if (!isGridActive)
    return

  if (props.loading) {
    if (isLoadMoreSentinelIntersecting.value || isWithinPreloadDistance())
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
  if (isWithinPreloadDistance())
    triggerLoadMore()
}

// 滚动路径节流：IO 负责主路径，这里只做兜底，避免每帧布局读取。
const throttledScrollCheck = useDebounceFn(() => {
  if (!isGridActive || props.loading)
    return
  schedulePreloadCheck()
}, 80)

function handleScroll() {
  if (!isGridActive)
    return

  // loading 中只记录是否仍停留在预加载区，不做额外触发。
  if (props.loading) {
    if (isLoadMoreSentinelIntersecting.value)
      reachedLoadMoreDuringLoading.value = true
    return
  }

  // IO 已确认进入预加载区时，直接走同步检查（通常会被 loadMoreRequested 挡住）。
  if (isLoadMoreSentinelIntersecting.value) {
    checkShouldPreload()
    return
  }

  throttledScrollCheck()
}

function handleResize() {
  if (!isGridActive)
    return
  invalidateScrollElementCache()
  setupIntersectionObserver(true)
  setupScrollResizeObserver()
  schedulePreloadCheck()
}

function setupScrollListeners() {
  if (scrollListenersActive)
    return

  scrollListenersActive = true

  // Bewly 自己的页面都在内部滚动容器中，通过全局事件同步 scrollTop
  if (!settings.value.useOriginalBilibiliHomepage)
    emitter.on(OVERLAY_SCROLL_BAR_SCROLL, handleScroll)
  else
    window.addEventListener('scroll', handleScroll, { passive: true })

  window.addEventListener('resize', handleResize, { passive: true })
}

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
  // CSS 响应式布局使用视口断点，这里让骨架屏和补位计算保持相同的宽度基准。
  const responsiveWidth = (props.gridLayout === 'adaptive' || settings.value.autoSwitchListLayout) && typeof window !== 'undefined'
    ? window.innerWidth
    : containerWidth
  return getCurrentColumnCount(props.gridLayout, responsiveWidth)
}

function clearContinuePreloadTimer() {
  if (continuePreloadTimer !== null) {
    window.clearTimeout(continuePreloadTimer)
    continuePreloadTimer = null
  }
  if (postLoadCheckRAF !== null) {
    cancelAnimationFrame(postLoadCheckRAF)
    postLoadCheckRAF = null
  }
}

function scheduleContinuePreloadCheck() {
  clearContinuePreloadTimer()

  // 等骨架替换与列表高度稳定后，再决定是否继续预取。
  nextTick(() => {
    postLoadCheckRAF = requestAnimationFrame(() => {
      postLoadCheckRAF = null
      if (!isGridActive || props.loading || !canLoadMore())
        return

      if (isLoadMoreSentinelIntersecting.value || isWithinPreloadDistance())
        triggerLoadMore()
    })
  })
}

// 监听 loading 结束后检查是否需要继续加载
watch(() => props.loading, (newLoading, oldLoading) => {
  if (newLoading && props.items.length > 0) {
    if (isLoadMoreSentinelIntersecting.value || isWithinPreloadDistance())
      reachedLoadMoreDuringLoading.value = true
  }

  if (!newLoading) {
    loadMoreRequested.value = false
    if (loadMoreRequestTimeout !== null) {
      window.clearTimeout(loadMoreRequestTimeout)
      loadMoreRequestTimeout = null
    }

    // 跟踪连续请求失败
    if (props.requestFailed) {
      consecutiveFailures.value++
      if (consecutiveFailures.value >= MAX_CONSECUTIVE_FAILURES)
        console.warn(`[VideoCardGrid] 连续请求失败 ${consecutiveFailures.value} 次，停止加载`)
    }
    else if (props.items.length > lastItemsCount.value) {
      consecutiveFailures.value = 0
    }

    // 检测空加载：loading 结束但 items 数量没变化
    if (lastItemsCount.value > 0 && props.items.length === lastItemsCount.value)
      consecutiveEmptyLoads.value++
  }

  if (oldLoading && !newLoading) {
    reachedLoadMoreDuringLoading.value = false
    // 布局稳定后按实时几何位置决定是否续载：用户已上滑会自然跳过。
    scheduleContinuePreloadCheck()
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
    clearCardEnterState()
    clearContinuePreloadTimer()
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

  // 首屏内容不足一页时补齐；滚动中途新增内容由 IO / 滚动兜底负责。
  nextTick(() => {
    if (!isGridActive || props.loading || !canLoadMore())
      return
    if (isLoadMoreSentinelIntersecting.value || isWithinPreloadDistance())
      triggerLoadMore()
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
  setupIntersectionObserver(true)
})

function activateGrid() {
  if (isGridActive)
    return

  isGridActive = true
  invalidateScrollElementCache()
  setupScrollListeners()

  nextTick(() => {
    if (!isGridActive)
      return

    setupIntersectionObserver(true)
    setupScrollResizeObserver()
    schedulePreloadCheck()
  })
}

function deactivateGrid() {
  if (!isGridActive)
    return

  isGridActive = false
  cleanupScrollListeners()
  cleanupScrollResizeObserver()
  cleanupIntersectionObserver()
  clearContinuePreloadTimer()
  invalidateScrollElementCache()

  if (checkPreloadRAF !== null) {
    cancelAnimationFrame(checkPreloadRAF)
    checkPreloadRAF = null
  }
}

onMounted(() => {
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
  clearContinuePreloadTimer()
  clearCardEnterState()
  cleanupReducedMotionWatcher()
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

function normalizePositiveInt(value: unknown, fallback: number): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0)
    return fallback
  return Math.max(1, Math.round(normalized))
}

function getCurrentColumnCount(layout: GridLayoutType, width: number): number {
  if (layout === 'adaptive')
    return getAdaptiveGridColumnCount(width, settings.value.gridColumns)
  return getListGridColumnCount(layout, width, settings.value.autoSwitchListLayout)
}

function findScrollElement(): HTMLElement | null {
  if (cachedScrollElement?.isConnected)
    return cachedScrollElement

  if (settings.value.useOriginalBilibiliHomepage) {
    cachedScrollElement = document.scrollingElement as HTMLElement | null
    return cachedScrollElement
  }

  // 优先使用 App 提供的滚动视口，避免每次滚动都向上遍历并读 computedStyle。
  const appViewport = bewlyApp?.scrollViewportRef?.value
  if (appViewport?.isConnected) {
    cachedScrollElement = appViewport
    return cachedScrollElement
  }

  let element = gridContainerRef.value?.parentElement ?? null
  while (element) {
    const styles = window.getComputedStyle(element)
    const canScrollY = /auto|scroll|overlay/.test(styles.overflowY)
    if (canScrollY) {
      cachedScrollElement = element
      return cachedScrollElement
    }
    element = element.parentElement
  }

  cachedScrollElement = null
  return null
}

function getPreloadDistance(scrollElement: HTMLElement | null = findScrollElement()): number {
  // 预取约一屏内容；高度读取集中在缓存后的滚动根上。
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

// 普通追加渲染：按 displayItems 顺序保留所有已加载卡片，
// 对齐 B 站原生首页的连续滚动体验，不做虚拟窗口回收。
const renderItems = computed<VideoCardRenderItem[]>(() => {
  return displayItems.value.map((item, index) => createRenderItem(item, index))
})

watch(
  renderItems,
  (items) => {
    markRenderItemsEntering(items)
  },
  { flush: 'post' },
)

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
      :class="[gridClass, { 'is-firefox': isFirefox }]"
      m="b-0 t-0" relative w-full
      :style="gridContainerStyle"
    >
      <div
        v-for="renderItem in renderItems"
        :key="renderItem.key"
        class="video-card-grid-item"
        :class="getCardEnterClass(renderItem.key)"
        :style="getCardEnterStyle(renderItem.key)"
        :data-index="renderItem.index"
      >
        <VideoCard
          :skeleton="renderItem.skeleton"
          :type="renderItem.type"
          :video="renderItem.video"
          :show-preview="showPreview"
          :show-watcher-later="showWatchLater"
          :horizontal="isHorizontal"
          :more-btn="moreBtn"
          :hide-author="hideAuthor"
          :is-following-page="props.isFollowingPage"
          :custom-click-handler="props.cardClickHandler ? (event: MouseEvent) => props.cardClickHandler?.(renderItem.item, event) : undefined"
          :cover-top-left-always-visible="props.coverTopLeftAlwaysVisible"
        >
          <template v-for="(_, name) in $slots" #[name]>
            <slot :name="name" :item="renderItem.item" />
          </template>
        </VideoCard>
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
    <Empty v-if="noMoreContent && !needToLoginFirst && items.length > 0" class="pb-4" :description="$t('common.no_more_content')">
      <Button type="primary" @click="handleRefresh">
        {{ refreshButtonText || $t('common.operation.refresh') }}
      </Button>
    </Empty>
  </div>
</template>

<style lang="scss" scoped>
.video-card-grid-root {
  overflow-anchor: none;
}

// Grid 布局 - 根据设置页声明的视口断点和 CSS 变量控制列数
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

.grid-one-column {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 16px;
  contain: layout style;
  align-items: stretch;
}

@media (max-width: 639.98px) {
  .grid-two-columns.grid-list-auto-switch {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
}

.video-card-grid-container {
  overflow-anchor: none;

  &.is-firefox :deep(.video-card-container) {
    content-visibility: visible;
    contain-intrinsic-size: auto none;
  }
}

.video-card-grid-item {
  min-width: 0;
  overflow-anchor: none;
}

.video-card-grid-item--enter-grid {
  animation: video-card-grid-enter-grid 200ms ease both;
  animation-delay: var(--enter-delay, 0ms);
}

.video-card-grid-item--enter-list {
  animation: video-card-grid-enter-list 180ms ease both;
}

@keyframes video-card-grid-enter-grid {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes video-card-grid-enter-list {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .video-card-grid-item--enter-grid,
  .video-card-grid-item--enter-list {
    animation: none;
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
  grid-column: 1 / -1;
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
