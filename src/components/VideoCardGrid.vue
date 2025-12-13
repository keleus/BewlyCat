<script setup lang="ts" generic="T = any">
import { useDebounceFn } from '@vueuse/core'

import type { Video } from '~/components/VideoCard/types'
import { useGridLayout } from '~/composables/useGridLayout'
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
})

const emit = defineEmits<{
  (e: 'loadMore'): void
  (e: 'refresh'): void
  (e: 'login'): void
}>()

// 使用共享的 Grid 布局 composable
const { gridClass, gridStyle } = useGridLayout(() => props.gridLayout)

// Grid 容器 ref
const gridContainerRef = ref<HTMLElement | null>(null)

// 检查是否可以加载更多
function canLoadMore(): boolean {
  return !props.loading && !props.noMoreContent && !props.needToLoginFirst && props.items.length > 0
}

// 触发加载更多
function triggerLoadMore() {
  if (canLoadMore()) {
    emit('loadMore')
  }
}

// 检查是否需要预加载
function checkShouldPreload() {
  if (!canLoadMore())
    return

  const container = gridContainerRef.value
  if (!container)
    return

  const rect = container.getBoundingClientRect()

  // grid 底部到视口底部的距离（剩余未显示的内容高度）
  const remainingHeight = rect.bottom - window.innerHeight

  // 如果剩余高度不足一个视口高度（一页），触发预加载
  if (remainingHeight < window.innerHeight) {
    triggerLoadMore()
  }
}

// 防抖的滚动检查
const debouncedCheck = useDebounceFn(checkShouldPreload, 100)

// 监听滚动
function handleScroll() {
  debouncedCheck()
}

// 设置滚动监听
function setupScrollListeners() {
  // 首页使用 OverlayScrollbars，监听自定义事件
  if (isHomePage() && !settings.value.useOriginalBilibiliHomepage) {
    emitter.on(OVERLAY_SCROLL_BAR_SCROLL, handleScroll)
  }
  // 其他页面监听 window scroll
  window.addEventListener('scroll', handleScroll, { passive: true })
}

// 清理滚动监听
function cleanupScrollListeners() {
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, handleScroll)
  window.removeEventListener('scroll', handleScroll)
}

// 监听 loading 结束后检查是否需要继续加载
watch(() => props.loading, (newLoading, oldLoading) => {
  if (oldLoading && !newLoading) {
    // 加载完成后，延迟检查是否需要继续加载
    nextTick(() => {
      checkShouldPreload()
    })
  }
})

// 监听 items 变化后检查（处理初次加载不足的情况）
watch(() => props.items.length, () => {
  nextTick(() => {
    checkShouldPreload()
  })
})

onMounted(() => {
  setupScrollListeners()
  // 初始检查
  nextTick(() => {
    checkShouldPreload()
  })
})

onUnmounted(() => {
  cleanupScrollListeners()
})

// 计算是否横向布局（根据 gridLayout 自动决定）
const isHorizontal = computed(() => {
  // adaptive: 纵向布局（图片在上，信息在下）
  // twoColumns/oneColumn: 横向布局（图片在左，信息在右）
  return props.gridLayout !== 'adaptive'
})

// 是否显示初始骨架屏（只在首次加载且没有数据时）
const showInitialSkeleton = computed(() => {
  return props.loading && props.items.length === 0
})

// 生成初始骨架屏数据（仅用于首次加载）
const initialSkeletonItems = computed(() => {
  if (!showInitialSkeleton.value)
    return []

  return Array.from({ length: props.initialSkeletonCount }, (_, i) => ({
    _isSkeleton: true,
    _skeletonId: `skeleton-init-${i}`,
  })) as T[]
})

// 判断是否应该显示空状态
const showEmptyState = computed(() => {
  return !props.loading && props.items.length === 0 && !props.needToLoginFirst
})

// 判断是否为骨架屏项
function isSkeleton(item: T): boolean {
  // 1. 检查是否为自动生成的骨架屏占位
  if ((item as any)?._isSkeleton)
    return true

  // 2. 使用自定义判断函数
  if (props.isSkeletonItem)
    return props.isSkeletonItem(item)

  // 3. 默认：检查 item 是否为空或没有有效数据
  return !item || !props.transformItem(item)
}

// 智能推断视频类型
function inferVideoType(item: T): 'rcmd' | 'appRcmd' | 'bangumi' | 'common' {
  // 如果是骨架屏，返回默认类型
  if (isSkeleton(item))
    return props.videoType || 'common'

  try {
    const video = props.transformItem(item)
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
function getUniqueKey(item: T): string | number {
  // 如果是骨架屏占位，使用骨架屏 ID
  if ((item as any)?._skeletonId)
    return (item as any)._skeletonId

  // 如果 item 为空或无效，返回一个临时 key
  if (!item)
    return `empty-${Math.random()}`

  try {
    // 否则使用正常的 key
    return props.getItemKey(item)
  }
  catch {
    // 如果获取 key 失败，返回一个临时 key
    return `error-${Math.random()}`
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

    <!-- 初始加载骨架屏 -->
    <div
      v-else-if="showInitialSkeleton"
      m="b-0 t-0" relative w-full
    >
      <div :class="gridClass" :style="gridStyle">
        <VideoCard
          v-for="item in initialSkeletonItems"
          :key="(item as any)._skeletonId"
          skeleton
          :horizontal="isHorizontal"
        />
      </div>
    </div>

    <!-- Grid 内容 -->
    <div
      v-else
      ref="gridContainerRef"
      m="b-0 t-0" relative w-full
    >
      <div :class="gridClass" :style="gridStyle">
        <VideoCard
          v-for="item in items"
          :key="getUniqueKey(item)"
          v-memo="[getUniqueKey(item), isHorizontal]"
          :skeleton="isSkeleton(item)"
          :type="inferVideoType(item)"
          :video="transformItem(item)"
          :show-preview="showPreview"
          :show-watcher-later="showWatchLater"
          :horizontal="isHorizontal"
          :more-btn="moreBtn"
        />
      </div>
    </div>

    <!-- 无更多内容提示 -->
    <Empty v-if="noMoreContent && !needToLoginFirst" class="pb-4" :description="$t('common.no_more_content')" />
  </div>
</template>

<style lang="scss" scoped>
/* Grid 样式类定义 */
.grid-two-columns {
  --uno: "grid cols-1 xl:cols-2 gap-4";
}

.grid-one-column {
  --uno: "grid cols-1 gap-4";
}

/**
 * Adaptive Grid - 列数由 JS 根据断点配置控制
 * gridStyle 会设置 display: grid, grid-template-columns, gap
 */
.grid-adaptive {
  contain: layout style;
}

/* 优化性能：使用 content-visibility 跳过不可见卡片的渲染 */
:deep(.video-card-container) {
  content-visibility: auto;
  contain-intrinsic-block-size: 280px;
  /* 关键：防止 grid 项目内容撑开超出容器 */
  min-width: 0;
}

/* 非 adaptive 布局也需要优化 */
.grid-two-columns,
.grid-one-column {
  contain: layout style;
}
</style>
