<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import type { FollowingLiveResult, List as FollowingLiveItem } from '~/models/live/getFollowingLiveList'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

// https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L16
interface VideoElement {
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
const isLoading = ref<boolean>(false)
const needToLoginFirst = ref<boolean>(false)
const page = ref<number>(1)
const noMoreContent = ref<boolean>(false)
const { handleReachBottom, handlePageRefresh, haveScrollbar } = useBewlyApp()

onMounted(() => {
  initData()
  initPageAction()
})

onActivated(() => {
  initPageAction()
})

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

    initData()
  }
}

async function initData() {
  page.value = 1
  videoList.value.length = 0
  noMoreContent.value = false

  await getData()
}

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformLiveVideo(item: VideoElement): Video | undefined {
  if (!item.item)
    return undefined

  const liveItem = item.item
  return {
    id: liveItem.roomid,
    title: decodeHtmlEntities(liveItem.title),
    cover: liveItem.room_cover,
    author: {
      name: decodeHtmlEntities(liveItem.uname),
      authorFace: liveItem.face,
      mid: liveItem.uid,
    },
    viewStr: liveItem.text_small,
    tag: decodeHtmlEntities(liveItem.area_name_v2),
    roomid: liveItem.roomid,
    liveStatus: liveItem.live_status,
    threePointV2: [],
  }
}

async function getData() {
  emit('beforeLoading')
  isLoading.value = true

  try {
    for (let i = 0; i < 3; i++)
      await getFollowedUsersVideos()
  }
  finally {
    isLoading.value = false
    emit('afterLoading')
  }
}

async function getFollowedUsersVideos() {
  if (noMoreContent.value)
    return

  try {
    let i = 0
    // https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L208
    const pendingVideos: VideoElement[] = Array.from({ length: 30 }, () => ({
      uniqueId: `unique-id-${(videoList.value.length || 0) + i++})}`,
    } satisfies VideoElement))
    const lastVideoListLength = videoList.value.length
    videoList.value.push(...pendingVideos)

    const response: FollowingLiveResult = await api.live.getFollowingLiveList({
      page: page.value,
      page_size: 9,
    })

    if (response.code === -101) {
      noMoreContent.value = true
      needToLoginFirst.value = true
      return
    }

    if (response.code === 0) {
      if (response.data.list.length < 9)
        noMoreContent.value = true

      page.value++

      const resData = [] as FollowingLiveItem[]

      response.data.list.forEach((item: FollowingLiveItem) => {
        resData.push(item)
      })

      // when videoList has length property, it means it is the first time to load
      if (!videoList.value.length) {
        videoList.value = resData.map(item => ({
          uniqueId: `${item.roomid}`,
          item,
          displayData: transformLiveVideo({ uniqueId: `${item.roomid}`, item }),
        }))
      }
      else {
        resData.forEach((item, index) => {
          videoList.value[lastVideoListLength + index] = {
            uniqueId: `${item.roomid}`,
            item,
            displayData: transformLiveVideo({ uniqueId: `${item.roomid}`, item }),
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
    videoList.value = videoList.value.filter(video => video.item)
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

defineExpose({ initData })
</script>

<template>
  <VideoCardGrid
    :items="videoList"
    :grid-layout="gridLayout"
    :loading="isLoading"
    :no-more-content="noMoreContent"
    :need-to-login-first="needToLoginFirst"
    :transform-item="transformLiveVideo"
    :get-item-key="(item: VideoElement) => item.uniqueId"
    :show-watcher-later="false"
    show-preview
    @refresh="initData"
    @login="jumpToLoginPage"
  />
</template>
