<script setup lang="ts" generic="T = any">
import type { Ref } from 'vue'

import type { Video } from '~/components/VideoCard/types'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useGridLayout } from '~/composables/useGridLayout'
import { useVirtualGrid } from '~/composables/useVirtualGrid'
import type { GridLayoutType } from '~/logic'

/**
 * 统一的 VideoCard Grid 组件
 * 支持虚拟滚动和分页模式
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
   * 是否启用虚拟滚动
   * @default true
   */
  enableVirtualScroll?: boolean

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
   * 是否横向布局
   * @default false（自动根据 gridLayout 计算）
   */
  horizontal?: boolean

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
   * 虚拟滚动的 overscan 行数
   * @default 5
   */
  overscan?: number

  /**
   * 初始加载时的骨架屏数量
   * 当 loading=true 且 items 为空时，自动生成骨架屏占位
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
  enableVirtualScroll: true,
  loading: false,
  noMoreContent: false,
  needToLoginFirst: false,
  showPreview: false,
  showWatchLater: true,
  moreBtn: false,
  overscan: 5,
  initialSkeletonCount: 30,
  isSkeletonItem: undefined,
})

const emit = defineEmits<{
  (e: 'loadMore'): void
  (e: 'refresh'): void
  (e: 'login'): void
}>()

// 使用共享的 Grid 布局 composable
const { gridClass } = useGridLayout(() => props.gridLayout)

// 容器引用
const containerRef = ref<HTMLElement>() as Ref<HTMLElement>
const { scrollbarRef } = useBewlyApp()

// 计算是否横向布局
const isHorizontal = computed(() => {
  if (props.horizontal !== undefined)
    return props.horizontal
  return props.gridLayout !== 'adaptive'
})

// 生成骨架屏占位项
const skeletonItems = computed(() => {
  // 当 loading=true 时才生成骨架屏
  if (!props.loading)
    return []

  if (props.items.length === 0) {
    // 完全空列表，生成完整的骨架屏
    return Array.from({ length: props.initialSkeletonCount }, (_, i) => ({
      _isSkeleton: true,
      _skeletonId: `skeleton-${i}`,
    })) as T[]
  }

  if (props.items.length < props.initialSkeletonCount && props.items.length > 0) {
    // 列表有少量数据（可能是直播列表或首次加载），补充骨架屏到设定数量
    const needCount = Math.max(0, props.initialSkeletonCount - props.items.length)
    return Array.from({ length: needCount }, (_, i) => ({
      _isSkeleton: true,
      _skeletonId: `skeleton-extra-${i}`,
    })) as T[]
  }

  return []
})

// 实际用于渲染的数据列表（包含骨架屏）
const displayItems = computed(() => {
  if (skeletonItems.value.length > 0) {
    // 如果有骨架屏，需要看是完全替代还是追加
    if (props.items.length === 0) {
      // 没有真实数据，完全使用骨架屏
      return skeletonItems.value
    }
    else {
      // 有少量数据（如直播列表），追加骨架屏
      return [...props.items, ...skeletonItems.value]
    }
  }
  return props.items
})

// 预加载回调处理
function handleLoadMore() {
  if (props.loading || props.noMoreContent)
    return
  emit('loadMore')
}

// 虚拟滚动模式
const {
  virtualItems,
  totalSize,
  virtualGridStyle,
  getItemsForRow,
  virtualizer,
  remeasure,
} = useVirtualGrid<T>({
  items: displayItems, // 使用包含骨架屏的列表
  gridLayout: () => props.gridLayout,
  containerRef,
  scrollbarRef,
  overscan: props.overscan,
  onLoadMore: props.enableVirtualScroll ? handleLoadMore : undefined, // 只在虚拟滚动模式下启用预加载
  loadMoreThreshold: 15, // 剩余 15 行时触发加载，非常提前的预加载
})

// 初始化虚拟滚动器 - 轮询等待 viewport 准备好
onMounted(() => {
  if (props.enableVirtualScroll) {
    const checkViewport = () => {
      const osInstance = scrollbarRef.value?.osInstance()
      const viewport = osInstance?.elements().viewport
      if (viewport && viewport.clientHeight > 0) {
        virtualizer.value.measure()
      }
      else {
        const retries = (checkViewport as any).retries || 0
        if (retries < 10) {
          (checkViewport as any).retries = retries + 1
          setTimeout(checkViewport, 100)
        }
      }
    }

    setTimeout(checkViewport, 100)
  }
})

// 组件激活时重新测量
onActivated(() => {
  if (props.enableVirtualScroll)
    remeasure()
})

// 监听 displayItems 变化，确保虚拟滚动器及时更新
watch(displayItems, () => {
  if (props.enableVirtualScroll) {
    nextTick(() => {
      virtualizer.value?.measure()
    })
  }
}, { flush: 'post' })

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

// 生成唯一 key（支持骨架屏）
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
      v-else-if="displayItems.length === 0 && !loading"
      mt-6
      :description="emptyDescription || $t('common.no_more_content')"
    >
      <Button type="primary" @click="handleRefresh">
        {{ refreshButtonText || $t('common.operation.refresh') }}
      </Button>
    </Empty>

    <!-- 虚拟滚动模式 -->
    <div
      v-else-if="enableVirtualScroll"
      ref="containerRef"
      m="b-0 t-0" relative w-full
    >
      <!-- 虚拟滚动容器 -->
      <div
        :style="{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }"
      >
        <!-- 虚拟化的行 -->
        <div
          v-for="virtualRow in virtualItems"
          :key="String(virtualRow.key)"
          :data-row-index="virtualRow.index"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${virtualRow.size}px`,
            transform: `translateY(${virtualRow.start}px)`,
          }"
        >
          <!-- Grid 行 -->
          <div :class="gridClass" :style="virtualGridStyle">
            <VideoCard
              v-for="item in getItemsForRow(virtualRow.index)"
              :key="getUniqueKey(item)"
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
      </div>
    </div>

    <!-- 传统 Grid 模式（分页） -->
    <div
      v-else
      ref="containerRef"
      m="b-0 t-0" relative w-full
    >
      <div :class="gridClass" :style="virtualGridStyle">
        <VideoCard
          v-for="item in displayItems"
          :key="getUniqueKey(item)"
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
/* 由 gridClass 和 virtualGridStyle 提供样式 */
</style>
