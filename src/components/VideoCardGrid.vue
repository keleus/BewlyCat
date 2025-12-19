<script setup lang="ts" generic="T = any">
import { useDebounceFn, useElementSize } from '@vueuse/core'

import type { Video } from '~/components/VideoCard/types'
import { useGlobalScrollState } from '~/composables/useGlobalScrollState'
import { useGridLayout } from '~/composables/useGridLayout'
import { useVideoCardShadowStyle } from '~/composables/useVideoCardShadowStyle'
import { OVERLAY_SCROLL_BAR_SCROLL } from '~/constants/globalEvents'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import { isHomePage } from '~/utils/main'
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
   * 生成唯一ID的函数
   */
  getItemKey: (item: T) => string | number

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
}

const props = withDefaults(defineProps<VideoCardGridProps<T>>(), {
  loading: false,
  noMoreContent: false,
  needToLoginFirst: false,
  showPreview: false,
  showWatchLater: true,
  moreBtn: false,
  initialSkeletonCount: 30,
  isSkeletonItem: undefined,
  enableRowPadding: false,
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

// 使用共享的 Grid 布局 composable，传递容器 ref 以使用容器宽度
const { gridClass, gridStyle, columnCount } = useGridLayout(() => props.gridLayout, gridContainerRef)

// 获取容器宽度用于计算卡片宽度
const { width: containerWidth } = useElementSize(gridContainerRef)

// 计算单个卡片的宽度（用于子组件响应式逻辑，避免 Container Query 性能问题）
const cardWidth = computed(() => {
  const width = containerWidth.value
  const cols = columnCount.value
  if (width <= 0 || cols <= 0)
    return 300 // 默认宽度

  // adaptive 使用 20px gap，其他使用 16px (1rem)
  const gap = props.gridLayout === 'adaptive' ? 20 : 16
  // (总宽度 - 总间隙) / 列数
  const raw = (width - (cols - 1) * gap) / cols
  // 按 10px 量化，减少宽度变化频率，避免频繁 UI 更新
  // 例如: 203px -> 200px, 197px -> 190px
  const quantized = Math.floor(raw / 10) * 10
  return Math.max(100, quantized)
})

// 提供给子组件使用
provide('videoCardWidth', cardWidth)

// 使用全局滚动状态来优化性能
const { isScrolling } = useGlobalScrollState()

// 获取 shadow 样式变量（避免依赖外部传入）
const { shadowStyleVars } = useVideoCardShadowStyle()

// 动态计算骨架屏数量（基于视口大小和布局，确保是列数的整数倍）
const dynamicSkeletonCount = computed(() => {
  const columnsPerRow = columnCount.value
  // 估算视口高度能容纳的行数 (假设每个卡片平均400px高)
  const rowsInViewport = Math.ceil(window.innerHeight / 400)
  // 多加载1.5倍的视口内容作为缓冲
  const bufferedRows = Math.ceil(rowsInViewport * 1.5)
  // 计算总数（完整的行数 * 列数）
  const totalCount = bufferedRows * columnsPerRow
  // 不超过设定的上限，但确保是列数的整数倍
  const maxCount = Math.floor(props.initialSkeletonCount / columnsPerRow) * columnsPerRow
  return Math.min(totalCount, maxCount)
})

// 递归加载保护机制
const consecutiveEmptyLoads = ref(0)
const MAX_CONSECUTIVE_EMPTY_LOADS = 2
const lastItemsCount = ref(0)

// 检查是否可以加载更多
function canLoadMore(): boolean {
  // 连续空加载次数超过限制时停止
  if (consecutiveEmptyLoads.value >= MAX_CONSECUTIVE_EMPTY_LOADS) {
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
  debouncedCheck()
}

// 设置滚动监听
function setupScrollListeners() {
  if (supportsIntersectionObserver)
    return

  // 首页使用 OverlayScrollbars，监听自定义事件
  if (isHomePage() && !settings.value.useOriginalBilibiliHomepage) {
    emitter.on(OVERLAY_SCROLL_BAR_SCROLL, handleScroll)
  }
  // 其他页面监听 window scroll
  else {
    window.addEventListener('scroll', handleScroll, { passive: true })
  }
}

// 清理滚动监听
function cleanupScrollListeners() {
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, handleScroll)
  window.removeEventListener('scroll', handleScroll)
}

// 监听 loading 结束后检查是否需要继续加载
watch(() => props.loading, (newLoading, oldLoading) => {
  if (!newLoading) {
    loadMoreRequested.value = false
    if (loadMoreRequestTimeout !== null) {
      window.clearTimeout(loadMoreRequestTimeout)
      loadMoreRequestTimeout = null
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
    lastItemsCount.value = 0
    return
  }

  // 成功加载了新数据，重置空加载计数
  if (newCount > lastItemsCount.value) {
    consecutiveEmptyLoads.value = 0
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
  }
})

watch(loadMoreSentinelRef, () => {
  setupIntersectionObserver()
})

onMounted(() => {
  setupScrollListeners()
  setupIntersectionObserver()
  // 初始检查
  nextTick(() => {
    checkShouldPreload()
  })
})

onUnmounted(() => {
  cleanupScrollListeners()
  cleanupIntersectionObserver()
  if (loadMoreRequestTimeout !== null) {
    window.clearTimeout(loadMoreRequestTimeout)
    loadMoreRequestTimeout = null
  }
  if (checkPreloadRAF !== null) {
    cancelAnimationFrame(checkPreloadRAF)
    checkPreloadRAF = null
  }
})

// 计算是否横向布局（根据 gridLayout 自动决定）
const isHorizontal = computed(() => {
  // adaptive: 纵向布局（图片在上，信息在下）
  // twoColumns/oneColumn: 横向布局（图片在左，信息在右）
  return props.gridLayout !== 'adaptive'
})

// 滚动时禁用 pointer-events，减少 hover 触发的样式重计算
// 同时合并 shadow 样式变量
const gridContainerStyle = computed(() => ({
  pointerEvents: (isScrolling.value ? 'none' : 'auto') as 'none' | 'auto',
  ...shadowStyleVars.value,
}))

// 是否显示初始骨架屏（只在首次加载且没有数据时）
const showInitialSkeleton = computed(() => {
  return props.loading && props.items.length === 0
})

// 生成初始骨架屏数据（仅用于首次加载）
const initialSkeletonItems = computed(() => {
  if (!showInitialSkeleton.value)
    return []

  return Array.from({ length: dynamicSkeletonCount.value }, (_, i) => ({
    _isSkeleton: true,
    _skeletonId: `skeleton-init-${i}`,
  })) as T[]
})

// 是否正在加载更多（有数据且loading）
const isLoadingMore = computed(() => {
  return props.loading && props.items.length > 0
})

// 计算当前行不足时需要填充的骨架屏数量
const rowPaddingCount = computed(() => {
  const cols = columnCount.value
  if (cols <= 0 || props.items.length === 0)
    return 0

  const itemsInLastRow = props.items.length % cols
  if (itemsInLastRow === 0)
    return 0

  return cols - itemsInLastRow
})

// 生成加载更多时的骨架屏数据（追加到列表末尾，确保是完整的行）
const loadingMoreSkeletonItems = computed(() => {
  if (!isLoadingMore.value)
    return []

  const columnsPerRow = columnCount.value
  // 计算当前items补全到整行需要几个
  const fillToCompleteRow = rowPaddingCount.value

  // 加载更多时显示：补全当前行 + 2行完整的骨架屏
  const skeletonRows = 2
  const totalSkeletons = fillToCompleteRow + skeletonRows * columnsPerRow

  return Array.from({ length: totalSkeletons }, (_, i) => ({
    _isSkeleton: true,
    _skeletonId: `skeleton-more-${i}`,
  })) as T[]
})

// 生成行尾填充的骨架屏（非loading状态，但还有更多数据时，填满当前行）
const rowPaddingSkeletonItems = computed(() => {
  // 需要显式启用 enableRowPadding 才会填充
  if (!props.enableRowPadding)
    return []

  // 只有在非loading、非noMoreContent、有数据时才填充
  if (props.loading || props.noMoreContent || props.items.length === 0)
    return []

  const padding = rowPaddingCount.value
  if (padding === 0)
    return []

  return Array.from({ length: padding }, (_, i) => ({
    _isSkeleton: true,
    _skeletonId: `skeleton-padding-${i}`,
  })) as T[]
})

// 合并实际数据和骨架屏
const displayItems = computed(() => {
  // 加载更多时：数据 + 填充骨架屏 + 额外行骨架屏
  if (isLoadingMore.value) {
    return [...props.items, ...loadingMoreSkeletonItems.value]
  }

  // 非loading、有更多数据时：数据 + 行尾填充骨架屏
  if (rowPaddingSkeletonItems.value.length > 0) {
    return [...props.items, ...rowPaddingSkeletonItems.value]
  }

  // 其他情况：只显示数据（noMoreContent时不填充，保持原样）
  return props.items
})

// 判断是否应该显示空状态
const showEmptyState = computed(() => {
  return !props.loading && props.items.length === 0 && !props.needToLoginFirst
})

// 判断是否为骨架屏项
let videoTransformCache = new WeakMap<object, Video | undefined>()
let primitiveVideoTransformCache: Map<unknown, Video | undefined> | null = null

function resetTransformCaches() {
  videoTransformCache = new WeakMap<object, Video | undefined>()
  primitiveVideoTransformCache = null
}

watch(() => props.transformItem, () => {
  resetTransformCaches()
})

function getTransformedVideo(item: T): Video | undefined {
  if (!item)
    return undefined

  try {
    const keyType = typeof item
    if (keyType === 'object' || keyType === 'function') {
      const objKey = item as any as object
      if (videoTransformCache.has(objKey)) {
        // Cache命中，无需重新转换
        return videoTransformCache.get(objKey)
      }

      // Cache未命中，执行转换（性能关键路径）
      const video = props.transformItem(item)

      videoTransformCache.set(objKey, video)
      return video
    }

    // 原始类型兜底（很少见）
    if (!primitiveVideoTransformCache)
      primitiveVideoTransformCache = new Map()
    if (primitiveVideoTransformCache.has(item))
      return primitiveVideoTransformCache.get(item)

    const video = props.transformItem(item)

    primitiveVideoTransformCache.set(item, video)
    return video
  }
  catch {
    return undefined
  }
}

function isSkeleton(item: T): boolean {
  // 1. 检查是否为自动生成的骨架屏占位
  if ((item as any)?._isSkeleton)
    return true

  // 2. 使用自定义判断函数
  if (props.isSkeletonItem) {
    try {
      return props.isSkeletonItem(item)
    }
    catch {
      // 忽略错误，继续兜底判断
    }
  }

  // 3. 默认：检查是否可以成功转换为视频数据
  // 如果转换失败或 item 无效，显示骨架屏
  if (!item)
    return true

  const video = getTransformedVideo(item)
  return !video || !video.id
}

// 智能推断视频类型
function inferVideoType(item: T): 'rcmd' | 'appRcmd' | 'bangumi' | 'common' {
  // 如果是骨架屏，返回默认类型
  if (isSkeleton(item))
    return props.videoType || 'common'

  try {
    const video = getTransformedVideo(item)
    if (!video)
      return props.videoType || 'common'

    // 1. 检查是否为番剧
    if (video.epid || video.goto === 'bangumi' || video.type === 'bangumi')
      return 'bangumi'

    // 2. 如果父组件提供了 videoType，优先使用（用于区分 rcmd/appRcmd）
    if (props.videoType === 'rcmd' || props.videoType === 'appRcmd')
      return props.videoType

    // 3. 默认返回 common（适用于直播、普通视频等）
    return props.videoType || 'common'
  }
  catch {
    // 转换失败时返回默认类型
    return props.videoType || 'common'
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
    return props.getItemKey(item)
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
      m="b-0 t-0" relative w-full
      :style="gridContainerStyle"
    >
      <!-- 初始加载骨架屏 -->
      <div v-if="showInitialSkeleton" :class="gridClass" :style="gridStyle">
        <VideoCard
          v-for="item in initialSkeletonItems"
          :key="(item as any)._skeletonId"
          skeleton
          :horizontal="isHorizontal"
        >
          <template v-for="(_, name) in $slots" #[name]>
            <slot :name="name" :item="item" />
          </template>
        </VideoCard>
      </div>

      <!-- Grid 内容 -->
      <div v-else :class="gridClass" :style="gridStyle">
        <VideoCard
          v-for="(item, index) in displayItems"
          :key="getUniqueKey(item, index)"
          v-memo="[getUniqueKey(item, index), isHorizontal]"
          :skeleton="isSkeleton(item)"
          :type="inferVideoType(item)"
          :video="getTransformedVideo(item)"
          :show-preview="showPreview"
          :show-watcher-later="showWatchLater"
          :horizontal="isHorizontal"
          :more-btn="moreBtn"
        >
          <template v-for="(_, name) in $slots" #[name]>
            <slot :name="name" :item="item" />
          </template>
        </VideoCard>
      </div>

      <div ref="loadMoreSentinelRef" class="load-more-sentinel" aria-hidden="true" />
    </div>

    <!-- 无更多内容提示（仅在有数据时显示，避免与空列表提示重复） -->
    <Empty v-if="noMoreContent && !needToLoginFirst && items.length > 0" class="pb-4" :description="$t('common.no_more_content')" />
  </div>
</template>

<style lang="scss" scoped>
/* Grid 样式类定义 */
.grid-two-columns {
  --uno: "grid cols-1 xl:cols-2 gap-4";
  align-items: stretch; /* 同行卡片拉伸到统一高度 */
}

.grid-one-column {
  --uno: "grid cols-1 gap-4";
  align-items: stretch;
}

/**
 * Adaptive Grid - 列数由 JS 根据断点配置控制
 * gridStyle 会设置 display: grid, grid-template-columns, gap
 */
.grid-adaptive {
  contain: layout style;
  align-items: stretch; /* 同行卡片拉伸到统一高度 */
}

/* 优化性能：VideoCard 使用 contain 属性并固定高度 */
:deep(.video-card-container) {
  contain: layout;
  /* 关键：防止 grid 项目内容撑开超出容器 */
  min-width: 0;
}

/* 非 adaptive 布局也需要优化 */
.grid-two-columns,
.grid-one-column {
  contain: layout style;
}

.load-more-sentinel {
  width: 100%;
  height: 1px;
}
</style>
