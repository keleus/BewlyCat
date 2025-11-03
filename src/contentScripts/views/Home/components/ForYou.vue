<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import type { Ref } from 'vue'
import { useToast } from 'vue-toastification'

import SmoothLoading from '~/components/SmoothLoading.vue'
import { UndoForwardState, useBewlyApp } from '~/composables/useAppProvider'
import { FilterType, useFilter } from '~/composables/useFilter'
import { LanguageType } from '~/enums/appEnums'
import type { GridLayoutType } from '~/logic'
import { appAuthTokens, settings } from '~/logic'
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
  ],
  [
    ['duration'],
    ['stat', 'view'],
    ['title'],
    ['owner', 'name'],
    ['owner', 'mid'],
  ],
)

const appFilterFunc = useFilter(
  ['bottom_rcmd_reason'],
  [
    FilterType.filterOutVerticalVideos,
    FilterType.duration,
    FilterType.viewCountStr,
    FilterType.title,
    FilterType.user,
    FilterType.user,
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
  const baseWidth = Math.max(160, settings.value.homeAdaptiveCardMinWidth || 280)
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
const appAccessToken = computed(() => appAuthTokens.value.accessToken)
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

// APP 模式的缓存和前进状态变量
const cachedAppVideoList = ref<AppVideoElement[]>([])
const forwardAppVideoList = ref<AppVideoElement[]>([])

// 添加状态标记
const hasBackState = ref<boolean>(false)
const hasForwardState = ref<boolean>(false)

const PAGE_SIZE = 30
const APP_LOAD_BATCHES = ref<number>(1) // APP模式每次加载的批次数，初始化时为1
const scrollLoadStartLength = ref<number>(0) // 滚动加载开始时的列表长度
const consecutiveEmptyLoads = ref<number>(0) // 连续空加载次数，用于防止无限递归
const MAX_EMPTY_LOADS = 5 // 最大连续空加载次数

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
  consecutiveEmptyLoads.value = 0 // 重置空加载计数器

  videoList.value = []
  appVideoList.value = []
  forwardVideoList.value = []
  cachedVideoList.value = []
  forwardAppVideoList.value = []
  cachedAppVideoList.value = []

  // 重置前进后退状态
  hasBackState.value = false
  hasForwardState.value = false
  undoForwardState.value = UndoForwardState.Hidden

  // 重置store状态
  forYouStore.resetState()

  initData()
})

async function initData() {
  videoList.value.length = 0
  appVideoList.value.length = 0
  APP_LOAD_BATCHES.value = 1 // 初始化时只加载1批
  consecutiveEmptyLoads.value = 0 // 重置空加载计数器
  await getData()
}

async function getData() {
  emit('beforeLoading')
  isLoading.value = true

  try {
    if (settings.value.recommendationMode === 'web') {
      await getRecommendVideos()
    }
    else {
      try {
        await getAppRecommendVideos()
      }
      catch (error) {
        console.error('App recommendation failed:', error)

        // 检查是否启用自动切换
        if (settings.value.autoSwitchRecommendationMode) {
          // 切换到 web 模式并提示用户
          settings.value.recommendationMode = 'web'
          toast.warning('App 推荐数据加载失败，已自动切换至 Web 模式')
          await getRecommendVideos()
        }
        else {
          toast.error('App 推荐数据加载失败，请手动切换至 Web 模式或稍后重试')
        }
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

    // 滚动加载时，APP模式记录开始长度，触发持续加载
    if (settings.value.recommendationMode === 'app') {
      APP_LOAD_BATCHES.value = 1
      scrollLoadStartLength.value = appVideoList.value.length
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
    else if (settings.value.recommendationMode === 'app') {
      // APP 模式下保存刷新前的当前状态到后退缓存
      cachedAppVideoList.value = JSON.parse(JSON.stringify(appVideoList.value))
      hasBackState.value = true

      // 清空前进状态（因为刷新会产生新的分支）
      forwardAppVideoList.value = []
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
        consecutiveEmptyLoads.value = 0 // 重置空加载计数器
      }
      else if (settings.value.recommendationMode === 'app' && cachedAppVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // APP模式下的后退操作
        // 保存当前数据到前进状态
        forwardAppVideoList.value = JSON.parse(JSON.stringify(appVideoList.value))
        hasForwardState.value = true

        // 恢复缓存的数据
        appVideoList.value = JSON.parse(JSON.stringify(cachedAppVideoList.value))

        hasBackState.value = false
        undoForwardState.value = UndoForwardState.Hidden
        consecutiveEmptyLoads.value = 0 // 重置空加载计数器
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
        consecutiveEmptyLoads.value = 0 // 重置空加载计数器
        return true
      }
      else if (settings.value.recommendationMode === 'app' && forwardAppVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // APP模式下的前进操作
        // 保存当前数据到后退状态
        cachedAppVideoList.value = JSON.parse(JSON.stringify(appVideoList.value))
        hasBackState.value = true

        // 恢复前进状态的数据
        appVideoList.value = JSON.parse(JSON.stringify(forwardAppVideoList.value))

        // 标记为已经前进
        hasForwardState.value = false
        undoForwardState.value = UndoForwardState.ShowUndo
        consecutiveEmptyLoads.value = 0 // 重置空加载计数器
        return true
      }
    }
    return false
  }
}

async function getRecommendVideos() {
  try {
    // 检查是否达到最大空加载次数，防止无限递归
    if (consecutiveEmptyLoads.value >= MAX_EMPTY_LOADS) {
      console.warn('达到最大连续空加载次数，停止加载')
      noMoreContent.value = true
      return
    }

    const beforeLoadCount = videoList.value.filter(video => video.item).length
    let i = 0

    // 只在初次加载或列表长度不足时添加占位视频
    if (videoList.value.length < PAGE_SIZE) {
      const pendingVideos: VideoElement[] = Array.from({
        length: PAGE_SIZE - videoList.value.length,
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

      // 检查是否成功添加了新内容
      const afterLoadCount = videoList.value.filter(video => video.item).length
      if (afterLoadCount > beforeLoadCount) {
        // 成功加载了新内容，重置空加载计数器
        consecutiveEmptyLoads.value = 0
      }
      else {
        // 没有加载到新内容，增加空加载计数器
        consecutiveEmptyLoads.value++
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

      // 如果需要更多内容，继续加载
      if (!haveScrollbar() || filledItems.length < PAGE_SIZE || filledItems.length < 1) {
        // 检查页面可见性和空加载计数器
        if (isPageVisible.value && consecutiveEmptyLoads.value < MAX_EMPTY_LOADS) {
          getRecommendVideos()
        }
        else if (consecutiveEmptyLoads.value >= MAX_EMPTY_LOADS) {
          noMoreContent.value = true
        }
      }
    }
  }
}

async function getAppRecommendVideos() {
  const batchesToLoad = APP_LOAD_BATCHES.value

  // 加载多个批次
  for (let batch = 0; batch < batchesToLoad; batch++) {
    try {
      // 获取最后一个视频的idx用于请求下一批
      const lastIdx = appVideoList.value.length > 0 && appVideoList.value[appVideoList.value.length - 1].item
        ? appVideoList.value[appVideoList.value.length - 1].item!.idx
        : 1

      const response: AppForYouResult = await api.video.getAppRecommendVideos({
        access_key: appAccessToken.value,
        s_locale: settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese ? 'zh-Hant_TW' : 'zh-Hans_CN',
        c_locate: settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese ? 'zh-Hant_TW' : 'zh-Hans_CN',
        appkey: TVAppKey.appkey,
        idx: lastIdx,
      })

      if (response.code === 0) {
        response.data.items.forEach((item: AppVideoItem) => {
          // Remove banner & ad cards
          if (item.card_type.includes('banner') || item.card_type === 'cm_v1')
            return

          // 应用过滤函数
          if (appFilterFunc.value && !appFilterFunc.value(item))
            return

          // 检查是否已经存在该视频，避免重复
          const isDuplicate = appVideoList.value.some(video => video.item && video.item.idx === item.idx)
          if (isDuplicate)
            return

          appVideoList.value.push({
            uniqueId: `${item.idx}`,
            item,
          })
        })
      }
      else if (response.code === 62011) {
        needToLoginFirst.value = true
        break
      }
    }
    catch (error) {
      console.error('Failed to load batch', batch, error)
      break
    }
  }

  if (!needToLoginFirst.value) {
    await nextTick()

    // 判断是否需要继续加载
    let shouldContinue = false

    // 初始化加载：没有滚动条或数据量不足时继续
    if (!haveScrollbar() || appVideoList.value.length < PAGE_SIZE) {
      shouldContinue = true
    }
    // 滚动加载：检查是否已加载足够内容（至少 PAGE_SIZE 个新视频）
    else if (scrollLoadStartLength.value > 0) {
      const loadedCount = appVideoList.value.length - scrollLoadStartLength.value
      if (loadedCount < PAGE_SIZE) {
        shouldContinue = true
      }
      else {
        // 已加载足够内容，重置标记
        scrollLoadStartLength.value = 0
      }
    }

    if (shouldContinue && isPageVisible.value) {
      getAppRecommendVideos()
    }
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

// 修改 defineExpose，暴露重置方法和撤销方法
defineExpose({
  initData,
  undoRefresh: () => {
    handleUndoRefresh.value?.()
  },
  goForward: () => {
    handleForwardRefresh.value?.()
  },
  canGoBack: () => {
    if (settings.value.recommendationMode === 'web')
      return hasBackState.value && cachedVideoList.value.length > 0
    else if (settings.value.recommendationMode === 'app')
      return hasBackState.value && cachedAppVideoList.value.length > 0
    return false
  },
  canGoForward: () => {
    if (settings.value.recommendationMode === 'web')
      return hasForwardState.value && forwardVideoList.value.length > 0
    else if (settings.value.recommendationMode === 'app')
      return hasForwardState.value && forwardAppVideoList.value.length > 0
    return false
  },
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

    <SmoothLoading :show="isLoading" />
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
