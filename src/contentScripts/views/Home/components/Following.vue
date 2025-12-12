<script setup lang="ts">
import type { Author, Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import type { FollowingLiveResult, List as FollowingLiveItem } from '~/models/live/getFollowingLiveList'
import type { DataItem as MomentItem, MomentResult } from '~/models/moment/moment'
import api from '~/utils/api'
import { parseStatNumber } from '~/utils/dataFormatter'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

// https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L16
interface VideoElement {
  uniqueId: string // 用于标识一条视频（无法用来区分UP主联合投稿）
  bvid?: string // 用于标识UP主联合投稿视频
  item?: MomentItem
  authorList?: Author[]
  displayData?: Video
}

interface LiveVideoElement {
  uniqueId: string
  item?: FollowingLiveItem
  displayData?: Video
}

const { gridLayout } = defineProps<{
  gridLayout: GridLayoutType
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const videoList = ref<VideoElement[]>([])
/**
 * Get all livestreaming videos of followed users
 */
const livePage = ref<number>(1)
const liveVideoList = ref<LiveVideoElement[]>([])
const isLoading = ref<boolean>(false)
const needToLoginFirst = ref<boolean>(false)
const recursionDepth = ref<number>(0) // 递归深度计数器
const isPageVisible = ref<boolean>(true) // 页面可见性状态
const offset = ref<string>('')
const updateBaseline = ref<string>('')
const noMoreContent = ref<boolean>(false)
const isInitialized = ref<boolean>(false)
const { handleReachBottom, handlePageRefresh, haveScrollbar } = useBewlyApp()

// 合并直播和视频列表用于虚拟滚动
const combinedVideoList = computed(() => {
  if (settings.value.followingTabShowLivestreamingVideos)
    return [...liveVideoList.value, ...videoList.value] as Array<VideoElement | LiveVideoElement>

  return videoList.value as Array<VideoElement | LiveVideoElement>
})

// 页面可见性变化处理函数
async function handleVisibilityChange() {
  const wasVisible = isPageVisible.value
  isPageVisible.value = !document.hidden

  // 如果从不可见变为可见，且需要加载更多数据，则触发加载
  if (!wasVisible && isPageVisible.value && !noMoreContent.value && !isLoading.value) {
    if (!await haveScrollbar() || videoList.value.length < 30) {
      setTimeout(() => {
        if (isPageVisible.value && !isLoading.value && !noMoreContent.value)
          getFollowedUsersVideos()
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
      if (!isLoading.value && !noMoreContent.value)
        getData()
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
  if (!isPageVisible.value)
    return

  const lastLiveVideoListLength = liveVideoList.value.length
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
      if (response.data.list.length < 9)
        noMoreContent.value = true

      livePage.value++

      const resData = [] as FollowingLiveItem[]

      response.data.list.forEach((item: FollowingLiveItem) => {
        // 只保留正在直播的
        if (item.live_status === 1)
          resData.push(item)
      })

      // when videoList has length property, it means it is the first time to load
      if (!liveVideoList.value.length) {
        liveVideoList.value = resData.map(item => ({
          uniqueId: `${item.roomid}`,
          item,
          displayData: mapLiveItemToVideo(item),
        }))
      }
      else {
        resData.forEach((item, index) => {
          liveVideoList.value[lastLiveVideoListLength + index] = {
            uniqueId: `${item.roomid}`,
            item,
            displayData: mapLiveItemToVideo(item),
          }
        })
      }
    }
    else if (response.code === -101) {
      needToLoginFirst.value = true
    }
  }
  catch {
    // 忽略错误
  }
}

async function getFollowedUsersVideos() {
  if (noMoreContent.value)
    return

  if (offset.value === '0') {
    noMoreContent.value = true
    return
  }

  // 检查页面是否可见，如果不可见则不进行请求
  if (!isPageVisible.value)
    return

  // 限制递归深度，防止无限递归
  if (recursionDepth.value >= 10) {
    noMoreContent.value = true
    return
  }

  recursionDepth.value++

  try {
    const lastVideoListLength = videoList.value.length

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

      const resData = [] as VideoElement[]

      response.data.items.forEach((item: MomentItem) => {
        const authors: Author[] = []

        // 检查是否有联合投稿信息
        if ((item.modules?.module_dynamic?.major?.archive?.stat as any)?.coop_num) {
          (item.modules.module_dynamic.major.archive as any).coop_info?.forEach((coop: any) => {
            authors.push({
              name: coop.name,
              authorFace: coop.face,
              mid: coop.mid,
            })
          })
        }
        else {
          // 单人投稿
          authors.push({
            name: item.modules?.module_author?.name,
            authorFace: item.modules?.module_author?.face,
            mid: item.modules?.module_author?.mid,
          })
        }

        resData.push({
          uniqueId: `${item.id_str}`,
          bvid: item.modules?.module_dynamic?.major?.archive?.bvid,
          item,
          authorList: authors,
        })
      })

      // when videoList has length property, it means it is the first time to load
      if (!videoList.value.length) {
        videoList.value = resData.map(video => ({
          ...video,
          displayData: mapMomentItemToVideo(video.item, video.authorList),
        }))
      }
      else {
        resData.forEach((video, index) => {
          videoList.value[lastVideoListLength + index] = {
            ...video,
            displayData: mapMomentItemToVideo(video.item, video.authorList),
          }
        })
      }

      if (!await haveScrollbar() && !noMoreContent.value)
        getFollowedUsersVideos()
    }
    else if (response.code === -101) {
      needToLoginFirst.value = true
    }
  }
  finally {
    recursionDepth.value--
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

function mapLiveItemToVideo(item?: FollowingLiveItem): Video | undefined {
  if (!item)
    return undefined

  const tag = item.area_name_v2?.trim() || item.area_name?.trim() || undefined

  return {
    id: item.roomid,
    title: decodeHtmlEntities(item.title),
    cover: item.room_cover,
    author: {
      name: decodeHtmlEntities(item.uname),
      authorFace: item.face,
      mid: item.uid,
    },
    view: parseStatNumber(item.text_small),
    viewStr: item.text_small,
    tag: decodeHtmlEntities(tag),
    roomid: item.roomid,
    liveStatus: item.live_status,
    threePointV2: [],
  }
}

function mapMomentItemToVideo(item?: MomentItem, authors?: Author[]): Video | undefined {
  if (!item)
    return undefined

  const archive = item.modules?.module_dynamic?.major?.archive
  if (!archive)
    return undefined

  const stat = archive.stat
  const likeCount = item.modules?.module_stat?.like?.count

  // Decode author names
  const decodedAuthors = authors?.map(author => ({
    ...author,
    name: decodeHtmlEntities(author.name),
  }))

  const authorValue = decodedAuthors && decodedAuthors.length > 0
    ? (decodedAuthors.length === 1 ? decodedAuthors[0] : decodedAuthors)
    : undefined

  // 判断是否为联合投稿（有多个作者）
  const isCollaboration = authors && authors.length > 1

  const badge = archive.badge?.text && archive.badge.text !== '投稿视频'
    ? {
        bgColor: archive.badge.bg_color,
        color: archive.badge.color,
        iconUrl: archive.badge.icon_url || undefined,
        text: decodeHtmlEntities(archive.badge.text),
      }
    : undefined

  const id = Number.parseInt(archive.aid, 10)

  return {
    id: Number.isNaN(id) ? 0 : id,
    durationStr: archive.duration_text,
    title: decodeHtmlEntities(archive.title),
    desc: decodeHtmlEntities(archive.desc),
    cover: archive.cover,
    author: authorValue,
    view: parseStatNumber(stat?.play),
    viewStr: stat?.play,
    danmaku: parseStatNumber(stat?.danmaku),
    danmakuStr: stat?.danmaku,
    like: typeof likeCount === 'number' ? likeCount : parseStatNumber(stat?.like),
    likeStr: stat?.like_str ?? stat?.like,
    capsuleText: decodeHtmlEntities(item.modules?.module_author?.pub_time?.trim() || undefined),
    publishedTimestamp: item.modules?.module_author?.pub_ts,
    bvid: archive.bvid,
    badge,
    tag: isCollaboration ? '联合投稿' : undefined,
    threePointV2: [],
  }
}

// 通用转换函数：处理两种类型的项目
function transformCombinedItem(item: VideoElement | LiveVideoElement): Video | undefined {
  if (!item.item)
    return undefined

  // 判断是直播还是视频
  if ('roomid' in item.item) {
    // 直播项
    return item.displayData
  }
  else {
    // 视频项
    return item.displayData
  }
}

defineExpose({ initData })
</script>

<template>
  <div>
    <VideoCardGrid
      :items="combinedVideoList"
      :grid-layout="gridLayout"
      :loading="isLoading"
      :no-more-content="noMoreContent"
      :need-to-login-first="needToLoginFirst"
      :transform-item="transformCombinedItem"
      :get-item-key="(item: VideoElement | LiveVideoElement) => item.uniqueId"
      :show-watcher-later="false"
      show-preview
      @refresh="initData"
      @login="jumpToLoginPage"
    />
  </div>
</template>
