<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabState } from '~/composables/useHomeTabState'
import type { GridLayoutType } from '~/logic'
import type { FollowingLiveResult, List as FollowingLiveItem } from '~/models/live/getFollowingLiveList'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

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

const tabState = useHomeTabState({ retainedFields: [] })
const isLoading = ref<boolean>(false)
const videoList = tabState.ref<VideoElement[]>('videoList', [])
const needToLoginFirst = tabState.ref<boolean>('needToLoginFirst', false)
const page = tabState.ref<number>('page', 1)
const noMoreContent = tabState.ref<boolean>('noMoreContent', false)
const hasLoaded = tabState.ref<boolean>('hasLoaded', false)
const { handleReachBottom, handlePageRefresh } = useBewlyApp()
// 刷新会作废仍在进行的加载更多，避免旧页拼进新列表后重复请求同一页、产生重复卡片。
let requestVersion = 0

onMounted(() => {
  initPageAction()
  if (!tabState.restored)
    void initData()
  else if (!hasLoaded.value)
    void getData()
})

function initPageAction() {
  handleReachBottom.value = reachBottomHandler
  handlePageRefresh.value = refreshHandler
}

async function initData() {
  if (!tabState.isCurrent())
    return

  const version = ++requestVersion
  needToLoginFirst.value = false
  page.value = 1
  videoList.value = []
  noMoreContent.value = false
  hasLoaded.value = false

  await getData(version)
}

function isRequestCurrent(version: number) {
  return tabState.isCurrent() && version === requestVersion
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

async function getData(version = requestVersion) {
  if (!isRequestCurrent(version))
    return

  emit('beforeLoading')
  isLoading.value = true
  let loaded = noMoreContent.value

  try {
    // 初次加载时多加载几批确保有足够内容
    for (let i = 0; i < 3 && !noMoreContent.value; i++) {
      if (!isRequestCurrent(version))
        return

      loaded = await getLiveVideos(version) || loaded
      if (!isRequestCurrent(version))
        return
    }
    if (isRequestCurrent(version) && loaded)
      hasLoaded.value = true
  }
  finally {
    if (isRequestCurrent(version)) {
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

async function reachBottomHandler() {
  if (!tabState.isCurrent() || isLoading.value || noMoreContent.value)
    return

  await handleLoadMore()
}

async function refreshHandler() {
  if (!tabState.isCurrent() || isLoading.value)
    return

  await initData()
}

async function getLiveVideos(version: number): Promise<boolean> {
  if (noMoreContent.value)
    return true

  const requestPage = page.value

  try {
    const response: FollowingLiveResult = await api.live.getFollowingLiveList({
      page: requestPage,
      page_size: 9,
    })

    if (!isRequestCurrent(version))
      return false

    if (response.code === -101) {
      noMoreContent.value = true
      needToLoginFirst.value = true
      return true
    }

    if (response.code !== 0)
      return false

    if (response.data.list.length < 9)
      noMoreContent.value = true

    page.value = requestPage + 1

    // 直播列表按页码翻页且排序随开播状态变化，同一直播间可能出现在相邻两页；卡片 key 必须唯一。
    const seenIds = new Set(videoList.value.map(video => video.uniqueId))
    const newItems = response.data.list.flatMap((item: FollowingLiveItem) => {
      const uniqueId = `${item.roomid}`
      if (seenIds.has(uniqueId))
        return []
      seenIds.add(uniqueId)
      return [{
        uniqueId,
        item,
        displayData: transformLiveVideo({ uniqueId, item }),
      }]
    })

    videoList.value = [...videoList.value, ...newItems]
    return true
  }
  catch {
    // 忽略错误
    return false
  }
}

// 供 VideoCardGrid 预加载调用的函数
async function handleLoadMore() {
  if (!tabState.isCurrent() || isLoading.value || noMoreContent.value)
    return

  const version = requestVersion
  isLoading.value = true
  try {
    const loaded = await getLiveVideos(version)
    if (isRequestCurrent(version) && loaded)
      hasLoaded.value = true
  }
  finally {
    if (isRequestCurrent(version))
      isLoading.value = false
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

onBeforeUnmount(() => {
  if (handleReachBottom.value === reachBottomHandler)
    handleReachBottom.value = undefined
  if (handlePageRefresh.value === refreshHandler)
    handlePageRefresh.value = undefined
})

defineExpose({ initData })
</script>

<template>
  <VideoCardGrid
    :items="videoList"
    :grid-layout="gridLayout"
    :loading="isLoading"
    :no-more-content="noMoreContent"
    :need-to-login-first="needToLoginFirst"
    :transform-item="(item: VideoElement) => item.displayData"
    :get-item-key="(item: VideoElement) => item.uniqueId"
    :show-watcher-later="false"
    show-preview
    @refresh="initData"
    @login="jumpToLoginPage"
    @load-more="handleLoadMore"
  />
</template>
