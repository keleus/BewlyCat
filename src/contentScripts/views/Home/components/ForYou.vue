<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import type { Ref } from 'vue'
import { useToast } from 'vue-toastification'

import { UndoForwardState, useBewlyApp } from '~/composables/useAppProvider'
import { FilterType, useFilter } from '~/composables/useFilter'
import { LanguageType } from '~/enums/appEnums'
import type { GridLayoutType } from '~/logic'
import { accessKey, settings } from '~/logic'
import type { AppForYouResult, Item as AppVideoItem } from '~/models/video/appForYou'
import { Type as ThreePointV2Type } from '~/models/video/appForYou'
import type { forYouResult, Item as VideoItem } from '~/models/video/forYou'
import type { AppVideoElement, VideoElement } from '~/stores/forYouStore'
import { useForYouStore } from '~/stores/forYouStore'
import api from '~/utils/api'
import { TVAppKey } from '~/utils/authProvider'
import { isVerticalVideo } from '~/utils/uriParse'

const props = defineProps<{
  gridLayout: GridLayoutType
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const toast = useToast()
const forYouStore = useForYouStore()

const filterFunc = useFilter(
  ['is_followed'],
  [
    FilterType.duration,
    FilterType.viewCount,
    FilterType.title,
    FilterType.user,
    FilterType.user,
    FilterType.likeViewRatio, // 添加点赞播放比例过滤
  ],
  [
    ['duration'],
    ['stat', 'view'],
    ['title'],
    ['owner', 'name'],
    ['owner', 'mid'],
    ['stat', 'view'], // 添加点赞数和播放数的路径
  ],
)

// App模式下的过滤器也需要添加相应的配置
const appFilterFunc = useFilter(
  ['bottom_rcmd_reason'],
  [
    FilterType.filterOutVerticalVideos,
    FilterType.duration,
    FilterType.viewCountStr,
    FilterType.title,
    FilterType.user,
    FilterType.user,
    // App模式下暂不添加点赞播放比例过滤，因为需要确认数据结构
  ],
  [
    ['uri'],
    ['player_args', 'duration'],
    ['cover_left_text_1'],
    ['title'],
    ['mask', 'avatar', 'text'],
    ['mask', 'avatar', 'up_id'],
  ],
)

const gridClass = computed((): string => {
  if (props.gridLayout === 'adaptive')
    return 'grid-adaptive'
  if (props.gridLayout === 'twoColumns')
    return 'grid-two-columns'
  return 'grid-one-column'
})

// Inline grid style for adaptive mode: optional max width and centering
const gridStyle = computed(() => {
  if (props.gridLayout !== 'adaptive')
    return {}
  const style: Record<string, any> = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(var(--bew-home-card-min-width, 280px), 1fr))',
  }
  const baseWidth = Math.max(120, settings.value.homeAdaptiveCardMinWidth || 280)
  style['--bew-home-card-min-width'] = `${baseWidth}px`
  return style
})

const videoList = ref<VideoElement[]>([])
const appVideoList = ref<AppVideoElement[]>([])
const isLoading = ref<boolean>(false)
const needToLoginFirst = ref<boolean>(false)
const containerRef = ref<HTMLElement>() as Ref<HTMLElement>
const refreshIdx = ref<number>(1)
const noMoreContent = ref<boolean>(false)
const { handleReachBottom, handlePageRefresh, haveScrollbar, undoForwardState, handleUndoRefresh, handleForwardRefresh, handleBackToTop } = useBewlyApp()
const activatedAppVideo = ref<AppVideoItem | null>()
const videoCardRef = ref(null)
const showDislikeDialog = ref<boolean>(false)

// 页面可见性状态
const isPageVisible = ref<boolean>(!document.hidden)
const selectedDislikeReason = ref<number>(1)

// 修改缓存数据变量，添加前进状态变量
const cachedVideoList = ref<VideoElement[]>([])
const cachedRefreshIdx = ref<number>(1)

// 添加前进状态变量
const forwardVideoList = ref<VideoElement[]>([])
const forwardRefreshIdx = ref<number>(1)

// 添加状态标记
const hasBackState = ref<boolean>(false)
const hasForwardState = ref<boolean>(false)

// 添加请求限制相关的变量
const requestThrottleTime = 150 // 请求间隔时间(毫秒) - 从300ms减少到150ms
const lastRequestTime = ref<number>(0)
const PAGE_SIZE = 30

// 添加过滤条件检查相关变量
const lowFilterResultCount = ref<number>(0) // 连续低过滤结果次数
const maxLowFilterCount = 2 // 最大连续低过滤结果次数
const minFilteredVideos = 6 // 最少过滤后视频数量
const minFilteredVideosAfterRetry = 10 // 重试后最少过滤后视频数量
const filterDelayTime = 1000 // 过滤结果不足时的延迟时间(毫秒)
const isFilterBlocked = ref<boolean>(false) // 是否因过滤条件被阻止加载

// 监听页面可见性变化
function handleVisibilityChange() {
  isPageVisible.value = !document.hidden
}

// 添加页面可见性监听器
onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // 如果启用状态保留且store中有数据，则恢复状态
  if (settings.value.preserveForYouState && forYouStore.state.isInitialized) {
    // 恢复关键状态
    const savedState = forYouStore.getCompleteState()
    videoList.value = [...savedState.videoList]
    appVideoList.value = [...savedState.appVideoList]
    refreshIdx.value = savedState.refreshIdx
    noMoreContent.value = savedState.noMoreContent

    // 确保撤销按钮不显示（因为这是状态恢复，不是刷新操作）
    hasBackState.value = false
    hasForwardState.value = false
    undoForwardState.value = UndoForwardState.Hidden

    // 清空所有缓存状态，确保没有历史数据影响
    cachedVideoList.value = []
    cachedRefreshIdx.value = 1
    forwardVideoList.value = []
    forwardRefreshIdx.value = 1

    // 重置请求限制状态
    resetRequestLimit()

    // 延迟初始化页面交互功能，避免立即触发数据加载
    setTimeout(() => {
      initPageAction()
      // 在初始化页面交互功能后，再次确保按钮状态正确
      setTimeout(() => {
        if (settings.value.preserveForYouState && forYouStore.state.isInitialized) {
          undoForwardState.value = UndoForwardState.Hidden
        }
      }, 100)
    }, 1000)
  }
  else {
    // 首次加载或未启用状态保留时，初始化数据
    setTimeout(() => {
      initData()
    }, 200)
    initPageAction()
  }
})

onBeforeUnmount(() => {
  // 如果启用状态保留，保存当前状态到store
  if (settings.value.preserveForYouState) {
    const currentState = {
      videoList: [...videoList.value],
      appVideoList: [...appVideoList.value],
      refreshIdx: refreshIdx.value,
      noMoreContent: noMoreContent.value,
      isInitialized: true,
    }
    forYouStore.saveCompleteState(currentState)
  }
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

onKeyStroke((e: KeyboardEvent) => {
  if (showDislikeDialog.value) {
    const dislikeReasons = activatedAppVideo.value?.three_point_v2?.find(option => option.type === ThreePointV2Type.Dislike)?.reasons || []

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault()
      dislikeReasons.forEach((reason) => {
        if (dislikeReasons[Number(e.key) - 1] && reason.id === dislikeReasons[Number(e.key) - 1].id)
          selectedDislikeReason.value = reason.id
      })
    }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const currentIndex = dislikeReasons.findIndex(reason => selectedDislikeReason.value === reason.id)
      if (currentIndex > 0)
        selectedDislikeReason.value = dislikeReasons[currentIndex - 1].id
    }
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const currentIndex = dislikeReasons.findIndex(reason => selectedDislikeReason.value === reason.id)
      if (currentIndex < dislikeReasons.length - 1)
        selectedDislikeReason.value = dislikeReasons[currentIndex + 1].id
    }
  }
})

watch(() => settings.value.recommendationMode, () => {
  noMoreContent.value = false
  refreshIdx.value = 1

  videoList.value = []
  appVideoList.value = []
  forwardVideoList.value = []
  cachedVideoList.value = []

  // 重置前进后退状态
  hasBackState.value = false
  hasForwardState.value = false
  undoForwardState.value = UndoForwardState.Hidden

  // 重置过滤相关状态
  resetRequestLimit()

  // 重置store状态
  forYouStore.resetState()

  initData()
})

async function initData() {
  videoList.value.length = 0
  appVideoList.value.length = 0
  resetRequestLimit() // 添加重置请求限制
  await getData()
}

// 添加重置请求限制的方法
function resetRequestLimit() {
  lastRequestTime.value = 0
  lowFilterResultCount.value = 0
  isFilterBlocked.value = false
}

async function getData() {
  // 检查是否因过滤条件被阻止
  if (isFilterBlocked.value) {
    toast.warning('过滤条件过于严格，请调整过滤设置后刷新页面')
    return
  }

  // 检查请求频率限制
  const now = Date.now()
  if (now - lastRequestTime.value < requestThrottleTime) {
    toast.info('请求过于频繁，请稍后再试')
    return
  }

  emit('beforeLoading')
  isLoading.value = true
  lastRequestTime.value = now

  try {
    if (settings.value.recommendationMode === 'web') {
      await getRecommendVideos()
    }
    else {
      try {
        // 限制一次最多请求次数
        await getAppRecommendVideos()
      }
      catch (error) {
        console.error('App recommendation failed:', error)
        // 切换到 web 模式并提示用户
        settings.value.recommendationMode = 'web'
        toast.warning('App 推荐数据加载失败，已自动切换至 Web 模式')
        await getRecommendVideos()
      }
    }
  }
  finally {
    isLoading.value = false
    emit('afterLoading')
  }
}

function initPageAction() {
  handleReachBottom.value = async () => {
    if (isLoading.value)
      return
    if (noMoreContent.value)
      return
    if (isFilterBlocked.value)
      return

    // 优化频率限制：允许滚动结束后的立即检查
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime.value
    if (timeSinceLastRequest < requestThrottleTime) {
      // 如果距离上次请求时间很短，延迟执行而不是直接返回
      const remainingTime = requestThrottleTime - timeSinceLastRequest
      setTimeout(() => {
        if (!isLoading.value && !noMoreContent.value && !isFilterBlocked.value) {
          getData()
        }
      }, remainingTime)
      return
    }

    getData()
  }

  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    // 根据当前模式保存数据
    if (settings.value.recommendationMode === 'web') {
      // 总是保存刷新前的当前状态到后退缓存
      cachedVideoList.value = JSON.parse(JSON.stringify(videoList.value))
      cachedRefreshIdx.value = refreshIdx.value
      hasBackState.value = true

      // 清空前进状态（因为刷新会产生新的分支）
      forwardVideoList.value = []
      hasForwardState.value = false

      // 显示撤销按钮
      undoForwardState.value = UndoForwardState.ShowUndo
    }

    initData()
  }

  // 修改撤销刷新的处理函数
  handleUndoRefresh.value = () => {
    if (hasBackState.value) {
      if (settings.value.recommendationMode === 'web' && cachedVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // Web模式下的后退操作
        // 保存当前数据到前进状态
        forwardVideoList.value = JSON.parse(JSON.stringify(videoList.value))
        forwardRefreshIdx.value = refreshIdx.value
        hasForwardState.value = true

        // 恢复缓存的数据
        videoList.value = JSON.parse(JSON.stringify(cachedVideoList.value))
        refreshIdx.value = cachedRefreshIdx.value

        hasBackState.value = false
        undoForwardState.value = UndoForwardState.Hidden
      }
    }
  }

  // 添加前进功能
  handleForwardRefresh.value = () => {
    if (hasForwardState.value) {
      if (settings.value.recommendationMode === 'web' && forwardVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // Web模式下的前进操作
        // 保存当前数据到后退状态
        cachedVideoList.value = JSON.parse(JSON.stringify(videoList.value))
        cachedRefreshIdx.value = refreshIdx.value
        hasBackState.value = true

        // 恢复前进状态的数据
        videoList.value = JSON.parse(JSON.stringify(forwardVideoList.value))
        refreshIdx.value = forwardRefreshIdx.value

        // 标记为已经前进
        hasForwardState.value = false
        undoForwardState.value = UndoForwardState.ShowUndo
        return true
      }
    }
    return false
  }
}

async function getRecommendVideos() {
  try {
    let i = 0
    if (!filterFunc.value || videoList.value.length < PAGE_SIZE) {
      const pendingVideos: VideoElement[] = Array.from({
        length: videoList.value.length < PAGE_SIZE ? PAGE_SIZE - videoList.value.length : PAGE_SIZE,
      }, () => ({
        uniqueId: `unique-id-${(videoList.value.length || 0) + i++})}`,
      } satisfies VideoElement))

      videoList.value.push(...pendingVideos)
    }

    const response: forYouResult = await api.video.getRecommendVideos({
      fresh_idx: refreshIdx.value++,
      ps: PAGE_SIZE,
    })

    if (!response.data) {
      noMoreContent.value = true
      return
    }

    if (response.code === 0) {
      const resData = [] as VideoItem[]

      response.data.item.forEach((item: VideoItem) => {
        if (!filterFunc.value || filterFunc.value(item))
          resData.push(item)
      })

      // when videoList has length property, it means it is the first time to load
      if (!videoList.value.length) {
        videoList.value = resData.map(item => ({ uniqueId: `${item.id}`, item }))
      }
      else {
        resData.forEach((item) => {
          // If the `filterFunc` is unset, indicating that the user hasn't specified the filter,
          // skep the `findFirstEmptyItemIndex` check to enhance the performance
          if (!filterFunc.value) {
            videoList.value.push({
              uniqueId: `${item.id}`,
              item,
            })
          }
          else {
            const findFirstEmptyItemIndex = videoList.value.findIndex(video => !video.item)
            if (findFirstEmptyItemIndex !== -1) {
              videoList.value[findFirstEmptyItemIndex] = {
                uniqueId: `${item.id}`,
                item,
              }
            }
            else {
              videoList.value.push({
                uniqueId: `${item.id}`,
                item,
              })
            }
          }
        })
      }
    }
    else if (response.code === 62011) {
      needToLoginFirst.value = true
    }
  }
  finally {
    const filledItems = videoList.value.filter(video => video.item)
    videoList.value = filledItems

    if (!needToLoginFirst.value) {
      await nextTick()

      // 检查过滤后的视频数量
      const currentFilteredCount = filledItems.length
      const shouldCheckFilter = filterFunc.value && currentFilteredCount > 0

      if (shouldCheckFilter) {
        // 检查是否符合最低过滤要求
        const minRequired = lowFilterResultCount.value > 0 ? minFilteredVideosAfterRetry : minFilteredVideos

        if (currentFilteredCount < minRequired) {
          lowFilterResultCount.value++

          if (lowFilterResultCount.value >= maxLowFilterCount) {
            // 达到最大重试次数，停止加载
            isFilterBlocked.value = true
            toast.error(`过滤条件过于严格，连续${maxLowFilterCount}次加载的符合条件视频少于${minRequired}个，请调整过滤设置`)
          }
          else {
            setTimeout(() => {
              if (!isLoading.value && !isFilterBlocked.value && isPageVisible.value) {
                getRecommendVideos()
              }
            }, filterDelayTime)
          }
        }
        else {
          // 过滤结果符合要求，重置计数器
          lowFilterResultCount.value = 0
        }
      }

      // 只有在未被阻止且需要继续加载的情况下才继续加载
      if (!isFilterBlocked.value && (!haveScrollbar() || filledItems.length < PAGE_SIZE || filledItems.length < 1)) {
        // 检查请求频率限制和页面可见性
        if (Date.now() - lastRequestTime.value >= requestThrottleTime && isPageVisible.value) {
          // 使用 setTimeout 避免直接递归调用
          setTimeout(() => {
            if (!isLoading.value && !isFilterBlocked.value && isPageVisible.value) {
              getRecommendVideos()
            }
          }, 100)
        }
      }
    }
  }
}

async function getAppRecommendVideos() {
  try {
    let i = 0
    if (!appFilterFunc.value || appVideoList.value.length < PAGE_SIZE) {
      const pendingVideos: AppVideoElement[] = Array.from({
        length: appVideoList.value.length < PAGE_SIZE ? PAGE_SIZE - appVideoList.value.length : PAGE_SIZE,
      }, () => ({
        uniqueId: `unique-id-${(appVideoList.value.length || 0) + i++})}`,
      } satisfies AppVideoElement))

      appVideoList.value.push(...pendingVideos)
    }

    const response: AppForYouResult = await api.video.getAppRecommendVideos({
      access_key: accessKey.value,
      s_locale: settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese ? 'zh-Hant_TW' : 'zh-Hans_CN',
      c_locate: settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese ? 'zh-Hant_TW' : 'zh-Hans_CN',
      appkey: TVAppKey.appkey,
      idx: appVideoList.value.length > 0 ? appVideoList.value[appVideoList.value.length - 1].item?.idx : 1,
    })

    if (response.code === 0) {
      const resData = [] as AppVideoItem[]

      response.data.items.forEach((item: AppVideoItem) => {
        // Remove banner & ad cards
        if (!item.card_type.includes('banner') && item.card_type !== 'cm_v1' && (!appFilterFunc.value || appFilterFunc.value(item)))
          resData.push(item)
      })

      // when videoList has length property, it means it is the first time to load
      if (!appVideoList.value.length) {
        appVideoList.value = resData.map(item => ({ uniqueId: `${item.idx}`, item }))
      }
      else {
        resData.forEach((item) => {
          // If the `appFilterFunc` is unset, indicating that the user hasn't specified the filter,
          // skep the `findFirstEmptyItemIndex` check to enhance the performance
          if (!appFilterFunc.value) {
            appVideoList.value.push({
              uniqueId: `${item.idx}`,
              item,
            })
          }
          else {
            const findFirstEmptyItemIndex = appVideoList.value.findIndex(video => !video.item)
            if (findFirstEmptyItemIndex !== -1) {
              appVideoList.value[findFirstEmptyItemIndex] = {
                uniqueId: `${item.idx}`,
                item,
              }
            }
            else {
              appVideoList.value.push({
                uniqueId: `${item.idx}`,
                item,
              })
            }
          }
        })
      }
    }
    else if (response.code === 62011) {
      needToLoginFirst.value = true
    }
  }
  finally {
    const filledItems = appVideoList.value.filter(video => video.item)
    appVideoList.value = filledItems

    if (!needToLoginFirst.value) {
      await nextTick()

      // 检查过滤后的视频数量
      const currentFilteredCount = filledItems.length
      const shouldCheckFilter = appFilterFunc.value && currentFilteredCount > 0

      if (shouldCheckFilter) {
        // 检查是否符合最低过滤要求
        const minRequired = lowFilterResultCount.value > 0 ? minFilteredVideosAfterRetry : minFilteredVideos

        if (currentFilteredCount < minRequired) {
          lowFilterResultCount.value++

          if (lowFilterResultCount.value >= maxLowFilterCount) {
            // 达到最大重试次数，停止加载
            isFilterBlocked.value = true
            toast.error(`过滤条件过于严格，连续${maxLowFilterCount}次加载的符合条件视频少于${minRequired}个，请调整过滤设置`)
          }
          else {
            setTimeout(() => {
              if (!isLoading.value && !isFilterBlocked.value && isPageVisible.value) {
                getAppRecommendVideos()
              }
            }, filterDelayTime)
          }
        }
        else {
          // 过滤结果符合要求，重置计数器
          lowFilterResultCount.value = 0
        }
      }

      // 只有在未被阻止的情况下才继续加载
      if (!isFilterBlocked.value && (!haveScrollbar() || filledItems.length < PAGE_SIZE || filledItems.length < 1)) {
        // 检查请求频率限制
        if (Date.now() - lastRequestTime.value >= requestThrottleTime) {
          getAppRecommendVideos()
        }
      }
    }
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

// 修改 defineExpose，暴露重置方法和撤销方法
defineExpose({
  initData,
  resetRequestLimit,
  undoRefresh: () => {
    handleUndoRefresh.value?.()
  },
  goForward: () => {
    handleForwardRefresh.value?.()
  },
  canGoBack: () => settings.value.recommendationMode === 'web' && hasBackState.value && cachedVideoList.value.length > 0,
  canGoForward: () => settings.value.recommendationMode === 'web' && hasForwardState.value && forwardVideoList.value.length > 0,
})
</script>

<template>
  <div>
    <Empty v-if="needToLoginFirst" mt-6 :description="$t('common.please_log_in_first')">
      <Button type="primary" @click="jumpToLoginPage()">
        {{ $t('common.login') }}
      </Button>
    </Empty>

    <div
      v-else
      ref="containerRef"
      m="b-0 t-0" relative w-full h-full
      :class="gridClass"
      :style="gridStyle"
    >
      <template v-if="settings.recommendationMode === 'web'">
        <VideoCard
          v-for="video in videoList"
          :key="video.uniqueId"
          :skeleton="!video.item"
          type="rcmd"
          :video="video.item ? {
            id: video.item.id,
            duration: video.item.duration,
            title: video.item.title,
            cover: video.item.pic,
            author: {
              name: video.item.owner.name,
              authorFace: video.item.owner.face,
              followed: !!video.item.is_followed,
              mid: video.item.owner.mid,
            },
            tag: video.item?.rcmd_reason?.content,
            view: video.item.stat.view,
            danmaku: video.item.stat.danmaku,
            like: video.item.stat.like,
            publishedTimestamp: video.item.pubdate,
            bvid: video.item.bvid,
            cid: video.item.cid,
          } : undefined"
          show-preview
          :horizontal="gridLayout !== 'adaptive'"
          more-btn
        />
      </template>
      <template v-else>
        <VideoCard
          v-for="video in appVideoList"
          :key="video.uniqueId"
          ref="videoCardRef"
          :skeleton="!video.item"
          type="appRcmd"
          :video="video.item ? {
            id: video.item.args.aid ?? 0,
            durationStr: video.item.cover_right_text,
            title: `${video.item.title}`,
            cover: `${video.item.cover}`,
            author: {
              name: video.item?.mask?.avatar.text,
              authorFace: video.item?.mask?.avatar.cover || video.item?.avatar?.cover,
              followed: video.item?.bottom_rcmd_reason === '已关注' || video.item?.bottom_rcmd_reason === '已關注',
              mid: video.item?.mask?.avatar.up_id,
            },
            capsuleText:
              video.item?.desc?.split('·')?.[1]?.trim()
              || ((video.item?.bottom_rcmd_reason?.trim() === '已关注' || video.item?.bottom_rcmd_reason?.trim() === '已關注')
                ? video.item?.bottom_rcmd_reason?.trim()
                : undefined),
            bvid: video.item.bvid,
            viewStr: video.item.cover_left_text_1,
            danmakuStr: video.item.cover_left_text_2,
            cid: video.item?.player_args?.cid,
            goto: video.item?.goto,
            url: video.item?.goto === 'bangumi' ? video.item.uri : '',
            type: video.item.card_goto === 'bangumi' ? 'bangumi' : isVerticalVideo(video.item.uri!) ? 'vertical' : 'horizontal',
            threePointV2: video.item?.three_point_v2,
          } : undefined"
          show-preview
          :horizontal="gridLayout !== 'adaptive'"
          more-btn
        />
        <!-- :more-options="video.three_point_v2" -->
      </template>
    </div>

    <Loading v-show="isLoading" />
    <!-- no more content -->
    <Empty v-if="noMoreContent" class="pb-4" :description="$t('common.no_more_content')" />
  </div>
</template>

<style lang="scss" scoped>
.grid-adaptive {
  --uno: "grid gap-5";
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.grid-two-columns {
  --uno: "grid cols-1 xl:cols-2 gap-4";
}

.grid-one-column {
  --uno: "grid cols-1 gap-4";
}
</style>
