<script setup lang="ts">
import type { Ref } from 'vue'

import type { Author } from '~/components/VideoCard/types'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import type { FollowingLiveResult, List as FollowingLiveItem } from '~/models/live/getFollowingLiveList'
import type { DataItem as MomentItem, MomentResult } from '~/models/moment/moment'
import api from '~/utils/api'

// https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L16
interface VideoElement {
  uniqueId: string // 用于标识一条视频（无法用来区分UP主联合投稿）
  bvid?: string // 用于标识UP主联合投稿视频
  item?: MomentItem
  authorList?: Author[]
}

interface LiveVideoElement {
  uniqueId: string
  item?: FollowingLiveItem
}

const props = defineProps<{
  gridLayout: GridLayoutType
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const gridClass = computed((): string => {
  if (props.gridLayout === 'adaptive')
    return 'grid-adaptive'
  if (props.gridLayout === 'twoColumns')
    return 'grid-two-columns'
  return 'grid-one-column'
})

const videoList = ref<VideoElement[]>([])
/**
 * Get all livestreaming videos of followed users
 */
const livePage = ref<number>(1)
const liveVideoList = ref<LiveVideoElement[]>([])
const isLoading = ref<boolean>(false)
const needToLoginFirst = ref<boolean>(false)
const containerRef = ref<HTMLElement>() as Ref<HTMLElement>
const recursionDepth = ref<number>(0) // 递归深度计数器
const isPageVisible = ref<boolean>(true) // 页面可见性状态
const offset = ref<string>('')
const updateBaseline = ref<string>('')
const noMoreContent = ref<boolean>(false)
const isInitialized = ref<boolean>(false)
const { handleReachBottom, handlePageRefresh, haveScrollbar } = useBewlyApp()

// 页面可见性变化处理函数
function handleVisibilityChange() {
  const wasVisible = isPageVisible.value
  isPageVisible.value = !document.hidden

  // 如果从不可见变为可见，且需要加载更多数据，则触发加载
  if (!wasVisible && isPageVisible.value && !noMoreContent.value && !isLoading.value) {
    if (!haveScrollbar() || videoList.value.length < 30) {
      setTimeout(() => {
        if (isPageVisible.value && !isLoading.value && !noMoreContent.value) {
          getFollowedUsersVideos()
        }
      }, 200)
    }
  }
}

onMounted(() => {
  initData()
  initPageAction()
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // 初始化页面可见性状态
  isPageVisible.value = !document.hidden
})

onUnmounted(() => {
  // 清理页面可见性监听器
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

onActivated(() => {
  initPageAction()
  // 组件激活时重新检查页面可见性
  isPageVisible.value = !document.hidden
})

onDeactivated(() => {
  // 组件失活时设置为不可见
  isPageVisible.value = false
})

function initPageAction() {
  handleReachBottom.value = async () => {
    if (isLoading.value)
      return
    if (noMoreContent.value)
      return

    // 优化：添加延迟执行而不是直接阻止
    setTimeout(() => {
      if (!isLoading.value && !noMoreContent.value) {
        getData()
      }
    }, 50) // 短暂延迟确保滚动结束
  }
  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    initData()
  }
}

async function initData() {
  isInitialized.value = false
  offset.value = ''
  updateBaseline.value = ''
  liveVideoList.value.length = 0
  livePage.value = 1
  videoList.value.length = 0
  noMoreContent.value = false
  recursionDepth.value = 0

  if (settings.value.followingTabShowLivestreamingVideos)
    getLiveVideoList()
  await getData()
  isInitialized.value = true
}

async function getData() {
  emit('beforeLoading')
  isLoading.value = true

  try {
    await getFollowedUsersVideos()
  }
  finally {
    isLoading.value = false
    emit('afterLoading')
  }
}

async function getLiveVideoList() {
  // 检查页面是否可见，如果不可见则不进行请求
  if (!isPageVisible.value) {
    return
  }

  let lastLiveVideoListLength = liveVideoList.value.length
  try {
    const response: FollowingLiveResult = await api.live.getFollowingLiveList({
      page: livePage.value,
      page_size: 9,
    })

    if (response.code === -101) {
      noMoreContent.value = true
      needToLoginFirst.value = true
      return
    }

    if (response.code === 0) {
      // 如果返回的数据少于9条，说明没有更多数据了
      if (response.data.list.length < 9) {
        noMoreContent.value = true
      }

      livePage.value++

      const resData = [] as FollowingLiveItem[]

      response.data.list.forEach((item: FollowingLiveItem) => {
        // 只保留正在直播的
        if (item.live_status === 1)
          resData.push(item)
      })

      // when videoList has length property, it means it is the first time to load
      if (!liveVideoList.value.length) {
        liveVideoList.value = resData.map(item => ({ uniqueId: `${item.roomid}`, item }))
      }
      else {
        resData.forEach((item) => {
          liveVideoList.value[lastLiveVideoListLength++] = {
            uniqueId: `${item.roomid}`,
            item,
          }
        })
      }

      // 只有在获取到新的直播数据且还有更多数据且页面可见时才继续递归
      if (resData.length > 0
        && !noMoreContent.value
        && liveVideoList.value.length < 50
        && isPageVisible.value) {
        setTimeout(() => {
          if (!isLoading.value && isPageVisible.value) {
            getLiveVideoList()
          }
        }, 500)
      }
    }
  }
  catch (error) {
    console.error('获取直播列表失败:', error)
  }
}

async function getFollowedUsersVideos() {
  if (noMoreContent.value)
    return

  if (offset.value === '0') {
    noMoreContent.value = true
    return
  }

  // 检查页面是否可见，如果不可见则限制加载次数
  if (!isPageVisible.value && recursionDepth.value >= 3) {
    return
  }

  // 限制递归深度，避免无限递归
  if (recursionDepth.value >= 10) {
    return
  }
  recursionDepth.value++

  try {
    // 如果 videoList 不是空的，获取最后一个真实视频的 uniqueId 和 bvid
    let lastVideo: VideoElement | null = videoList.value.length > 0 ? videoList.value.slice(-1)[0] : null
    const lastUniqueId = lastVideo ? lastVideo.uniqueId : ''
    let lastBvid = lastVideo ? lastVideo.bvid : ''

    // 只在首次加载时添加占位视频，避免闪屏
    const isFirstLoad = videoList.value.length === 0
    let pendingVideos: VideoElement[] = []
    let lastVideoListLength = videoList.value.length

    if (isFirstLoad) {
      let i = 0
      pendingVideos = Array.from({ length: 30 }, () => ({
        uniqueId: `unique-id-${i++}`,
      } satisfies VideoElement))
      videoList.value.push(...pendingVideos)
    }

    const response: MomentResult = await api.moment.getMoments({
      type: 'video',
      offset: Number(offset.value),
      update_baseline: updateBaseline.value,
    })

    if (response.code === -101) {
      noMoreContent.value = true
      needToLoginFirst.value = true
      return
    }

    if (response.code === 0) {
      offset.value = response.data.offset
      updateBaseline.value = response.data.update_baseline

      const resData = [] as MomentItem[]

      response.data.items.forEach((item: MomentItem) => {
        resData.push(item)
      })

      // 使用isFirstLoad来判断是否是首次加载
      if (isFirstLoad) {
        videoList.value = resData.map((item) => {
          const author: Author = {
            name: item.modules.module_author.name,
            authorFace: item.modules.module_author.face,
            mid: item.modules.module_author.mid,
          }
          return {
            uniqueId: `${item.id_str}`,
            bvid: item.modules.module_dynamic.major.archive?.bvid,
            item,
            authorList: [author],
          }
        })
      }
      else {
        resData.forEach((item, index) => {
          const currentUniqueId = `${item.id_str}`
          const currentBvid = item.modules.module_dynamic.major.archive?.bvid
          const author: Author = {
            name: item.modules.module_author.name,
            authorFace: item.modules.module_author.face,
            mid: item.modules.module_author.mid,
          }
          const currentVideo: VideoElement = {
            uniqueId: currentUniqueId,
            bvid: currentBvid,
            item,
            authorList: [author],
          }

          if (index === 0 && currentUniqueId === lastUniqueId) {
            // 重复视频
            return
          }
          else if (currentBvid === lastBvid) {
            // UP主联合投稿视频

            // 当联合投稿的数据是分两次获取时，有概率会出现多个重复内容
            // 遍历authorList里面每个up的mid值，如果不存在再添加up信息
            if (!lastVideo?.authorList?.some(existingAuthor => existingAuthor.mid === author.mid)) {
              lastVideo?.authorList?.push(author)
            }
            return
          }
          else {
            // UP主个人投稿视频
            videoList.value[lastVideoListLength++] = currentVideo
          }

          lastVideo = currentVideo
          lastBvid = currentBvid
        })
      }

      // 只有在未被阻止的情况下才继续加载
      if (!noMoreContent.value) {
        if (!await haveScrollbar() || videoList.value.length < 30) {
          // 添加延迟避免无限递归调用
          setTimeout(() => {
            if (!isLoading.value && !noMoreContent.value) {
              getFollowedUsersVideos()
            }
          }, 200)
        }
        else {
          // 重置递归深度计数器
          recursionDepth.value = 0
        }
      }
      else {
        // 重置递归深度计数器
        recursionDepth.value = 0
      }
    }
    else if (response.code === -101) {
      needToLoginFirst.value = true
    }
  }
  catch {
    // 出错时重置递归深度计数器
    recursionDepth.value = 0
  }
  finally {
    // 只在首次加载时过滤占位视频，避免后续加载时的闪屏
    if (videoList.value.some(video => !video.item)) {
      videoList.value = videoList.value.filter(video => video.item)
    }
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

defineExpose({ initData })
</script>

<template>
  <div>
    <Empty v-if="needToLoginFirst" mt-6 :description="$t('common.please_log_in_first')">
      <Button type="primary" @click="jumpToLoginPage()">
        {{ $t('common.login') }}
      </Button>
    </Empty>
    <div
      v-else-if="isInitialized"
      ref="containerRef"
      m="b-0 t-0" relative w-full h-full
      :class="gridClass"
    >
      <template v-if="settings.followingTabShowLivestreamingVideos">
        <VideoCard
          v-for="video in liveVideoList"
          :key="video.uniqueId"
          :skeleton="!video.item"
          :video="video.item ? {
            // id: Number(video.item.modules.module_dynamic.major.archive?.aid),
            title: `${video.item.title}`,
            cover: `${video.item.room_cover}`,
            author: {
              name: video.item.uname,
              authorFace: video.item.face,
              mid: video.item.uid,
            },
            viewStr: video.item.text_small,
            tag: video.item.area_name_v2,
            roomid: video.item.roomid,
            liveStatus: video.item.live_status,
          } : undefined"
          type="live"
          :show-watcher-later="false"
          :horizontal="gridLayout !== 'adaptive'"
        />
      </template>

      <VideoCard
        v-for="video in videoList"
        :key="video.uniqueId"
        :skeleton="!video.item"
        :video="video.item ? {
          id: Number(video.item.modules.module_dynamic.major.archive?.aid),
          durationStr: video.item.modules.module_dynamic.major.archive?.duration_text,
          title: `${video.item.modules.module_dynamic.major.archive?.title}`,
          cover: `${video.item.modules.module_dynamic.major.archive?.cover}`,
          author: video.authorList,
          viewStr: video.item.modules.module_dynamic.major.archive?.stat.play,
          danmakuStr: video.item.modules.module_dynamic.major.archive?.stat.danmaku,
          capsuleText: video.item.modules.module_author.pub_time,
          bvid: video.item.modules.module_dynamic.major.archive?.bvid,
          badge: video.item.modules.module_dynamic.major.archive?.badge.text !== '投稿视频' ? {
            bgColor: video.item.modules.module_dynamic.major.archive?.badge.bg_color,
            color: video.item.modules.module_dynamic.major.archive?.badge.color,
            iconUrl: video.item.modules.module_dynamic.major.archive?.badge.icon_url,
            text: video.item.modules.module_dynamic.major.archive?.badge.text,
          } : undefined,
        } : undefined"
        show-preview
        :horizontal="gridLayout !== 'adaptive'"
      />
    </div>

    <!-- loading state for initial load -->
    <div v-else-if="!isInitialized && !needToLoginFirst" class="grid gap-4" :class="gridClass">
      <VideoCard
        v-for="i in 12"
        :key="`skeleton-${i}`"
        :skeleton="true"
        :horizontal="gridLayout !== 'adaptive'"
      />
    </div>

    <!-- no more content -->
    <Empty v-if="noMoreContent && !needToLoginFirst && isInitialized" class="pb-4" :description="$t('common.no_more_content')" />
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
