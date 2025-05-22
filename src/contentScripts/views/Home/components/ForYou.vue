<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import type { Ref } from 'vue'
import { useToast } from 'vue-toastification'

import { useBewlyApp } from '~/composables/useAppProvider'
import { FilterType, useFilter } from '~/composables/useFilter'
import { LanguageType } from '~/enums/appEnums'
import type { GridLayoutType } from '~/logic'
import { accessKey, settings } from '~/logic'
import type { AppForYouResult, Item as AppVideoItem } from '~/models/video/appForYou'
import { Type as ThreePointV2Type } from '~/models/video/appForYou'
import type { forYouResult, Item as VideoItem } from '~/models/video/forYou'
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

// https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L16
interface VideoElement {
  uniqueId: string
  item?: VideoItem
}

interface AppVideoElement {
  uniqueId: string
  item?: AppVideoItem
}

const gridClass = computed((): string => {
  if (props.gridLayout === 'adaptive')
    return 'grid-adaptive'
  if (props.gridLayout === 'twoColumns')
    return 'grid-two-columns'
  return 'grid-one-column'
})

const videoList = ref<VideoElement[]>([])
const appVideoList = ref<AppVideoElement[]>([])
const isLoading = ref<boolean>(false)
const needToLoginFirst = ref<boolean>(false)
const containerRef = ref<HTMLElement>() as Ref<HTMLElement>
const refreshIdx = ref<number>(1)
const noMoreContent = ref<boolean>(false)
const { handleReachBottom, handlePageRefresh, haveScrollbar, showUndoButton, handleUndoRefresh, handleForwardRefresh } = useBewlyApp()
const activatedAppVideo = ref<AppVideoItem | null>()
const videoCardRef = ref(null)
const showDislikeDialog = ref<boolean>(false)
const selectedDislikeReason = ref<number>(1)

// 修改缓存数据变量，添加前进状态变量
const cachedVideoList = ref<VideoElement[]>([])
// const cachedAppVideoList = ref<AppVideoElement[]>([])
const cachedRefreshIdx = ref<number>(1)

// 添加前进状态变量
const forwardVideoList = ref<VideoElement[]>([])
// const forwardAppVideoList = ref<AppVideoElement[]>([])
const forwardRefreshIdx = ref<number>(1)

// 添加状态标记
const hasBackState = ref<boolean>(false)
const hasForwardState = ref<boolean>(false)

// 添加请求限制相关的变量
const requestCount = ref<number>(0)
const maxRequestsPerSession = 20 // 每个会话最多请求次数
const requestThrottleTime = 300 // 请求间隔时间(毫秒)
const lastRequestTime = ref<number>(0)
const PAGE_SIZE = 30

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
  forwardVideoList.value = []
  cachedVideoList.value = []

  // 重置前进后退状态
  hasBackState.value = false
  hasForwardState.value = false
  showUndoButton.value = false
  initData()
})

onMounted(() => {
  // Delay by 0.2 seconds to obtain the `settings.value.recommendationMode` value
  // otherwise the `settings.value.recommendationMode` value will be undefined
  // i have no idea to fix that...
  setTimeout(() => {
    initData()
  }, 200)

  initPageAction()
})

onActivated(() => {
  initPageAction()
})

async function initData() {
  videoList.value.length = 0
  appVideoList.value.length = 0
  resetRequestLimit() // 添加重置请求限制
  await getData()
}

// 添加重置请求限制的方法
function resetRequestLimit() {
  requestCount.value = 0
  lastRequestTime.value = 0
}

async function getData() {
  // 检查请求次数限制
  if (requestCount.value >= maxRequestsPerSession) {
    toast.info('已达到本次会话的请求上限，请刷新页面重试')
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
  requestCount.value++

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

    getData()
  }

  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    // 根据当前模式保存数据
    if (settings.value.recommendationMode === 'web') {
      if (hasBackState.value) {
        // 如果当前已经是后退状态，则保存当前数据到前进状态
        forwardVideoList.value = JSON.parse(JSON.stringify(videoList.value))
        forwardRefreshIdx.value = refreshIdx.value
        hasForwardState.value = true
      }
      else {
        // 保存当前数据到后退缓存
        cachedVideoList.value = JSON.parse(JSON.stringify(videoList.value))
        cachedRefreshIdx.value = refreshIdx.value
        hasBackState.value = true

        // 清空前进状态
        forwardVideoList.value = []
        hasForwardState.value = false
      }
      // 显示撤销按钮
      showUndoButton.value = true
    }

    initData()
  }

  // 修改撤销刷新的处理函数
  handleUndoRefresh.value = () => {
    if (hasBackState.value) {
      if (settings.value.recommendationMode === 'web' && cachedVideoList.value.length > 0) {
        // Web模式下的后退操作
        // 保存当前数据到前进状态
        forwardVideoList.value = JSON.parse(JSON.stringify(videoList.value))
        forwardRefreshIdx.value = refreshIdx.value
        hasForwardState.value = true

        // 恢复缓存的数据
        videoList.value = cachedVideoList.value
        refreshIdx.value = cachedRefreshIdx.value

        hasBackState.value = false
        showUndoButton.value = false
      }
    }
  }

  // 添加前进功能
  handleForwardRefresh.value = () => {
    if (hasForwardState.value) {
      if (settings.value.recommendationMode === 'web' && forwardVideoList.value.length > 0) {
        // Web模式下的前进操作
        // 保存当前数据到后退状态
        cachedVideoList.value = JSON.parse(JSON.stringify(videoList.value))
        cachedRefreshIdx.value = refreshIdx.value
        hasBackState.value = true

        // 恢复前进状态的数据
        videoList.value = forwardVideoList.value
        refreshIdx.value = forwardRefreshIdx.value

        // 标记为已经前进
        hasForwardState.value = false
        showUndoButton.value = true
        return true
      }
    }
    return false
  }
}

async function getRecommendVideos() {
  try {
    let i = 0
    if (!filterFunc.value || (videoList.value.length < PAGE_SIZE && filterFunc.value)) {
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
      if (!haveScrollbar() || filledItems.length < PAGE_SIZE || filledItems.length < 1) {
        // 检查请求次数和频率限制
        if (requestCount.value < maxRequestsPerSession && (Date.now() - lastRequestTime.value >= requestThrottleTime)) {
          getRecommendVideos()
        }
        else if (requestCount.value >= maxRequestsPerSession) {
          toast.info('已达到本次会话的请求上限')
        }
      }
    }
  }
}

async function getAppRecommendVideos() {
  try {
    let i = 0
    if (!appFilterFunc.value || (appVideoList.value.length < PAGE_SIZE && appFilterFunc.value)) {
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
      if (!haveScrollbar() || filledItems.length < PAGE_SIZE || filledItems.length < 1) {
        // 检查请求次数和频率限制
        if (requestCount.value < maxRequestsPerSession && (Date.now() - lastRequestTime.value >= requestThrottleTime)) {
          getAppRecommendVideos()
        }
        else if (requestCount.value >= maxRequestsPerSession) {
          toast.info('已达到本次会话的请求上限')
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
            view: video.item.stat.view,
            danmaku: video.item.stat.danmaku,
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
            capsuleText: video.item?.desc?.split('·')[1],
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
  --uno: "grid 2xl:cols-5 xl:cols-4 lg:cols-3 md:cols-2 sm:cols-1 cols-1 gap-5";
}

.grid-two-columns {
  --uno: "grid cols-1 xl:cols-2 gap-4";
}

.grid-one-column {
  --uno: "grid cols-1 gap-4";
}
</style>
