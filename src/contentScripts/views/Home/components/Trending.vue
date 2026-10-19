<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabState } from '~/composables/useHomeTabState'
import type { GridLayoutType } from '~/logic'
import type { List as VideoItem, TrendingResult } from '~/models/video/trending'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

interface VideoElement {
  uniqueId: string
  item?: VideoItem
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
const pn = tabState.ref<number>('pn', 1)
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

async function initData() {
  if (!tabState.isCurrent())
    return

  const version = ++requestVersion
  noMoreContent.value = false
  videoList.value = []
  pn.value = 1
  hasLoaded.value = false
  await getData(version)
}

function isRequestCurrent(version: number) {
  return tabState.isCurrent() && version === requestVersion
}

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformTrendingVideo(item: VideoElement): Video | undefined {
  if (!item.item)
    return undefined

  const videoItem = item.item
  return {
    id: Number(videoItem.aid),
    duration: videoItem.duration,
    title: decodeHtmlEntities(videoItem.title),
    desc: decodeHtmlEntities(videoItem.desc),
    cover: videoItem.pic,
    author: {
      name: decodeHtmlEntities(videoItem.owner.name),
      authorFace: videoItem.owner.face,
      mid: videoItem.owner.mid,
    },
    view: typeof videoItem.stat.view === 'number' ? videoItem.stat.view : Number(videoItem.stat.view),
    danmaku: typeof videoItem.stat.danmaku === 'number' ? videoItem.stat.danmaku : Number(videoItem.stat.danmaku),
    like: typeof videoItem.stat.like === 'number' ? videoItem.stat.like : Number(videoItem.stat.like),
    likeStr: (videoItem.stat as any)?.like_str ?? videoItem.stat.like,
    publishedTimestamp: videoItem.pubdate,
    bvid: videoItem.bvid,
    category: videoItem.tname || undefined,
    tag: decodeHtmlEntities(videoItem.rcmd_reason.content),
    cid: videoItem.cid,
    threePointV2: [],
  }
}

async function getData(version = requestVersion) {
  if (!isRequestCurrent(version))
    return

  emit('beforeLoading')
  isLoading.value = true
  try {
    const loaded = await getTrendingVideos(version)
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
  await initData()
}

function initPageAction() {
  handleReachBottom.value = reachBottomHandler
  handlePageRefresh.value = refreshHandler
}

async function getTrendingVideos(version: number): Promise<boolean> {
  if (noMoreContent.value)
    return true

  const requestPage = pn.value

  try {
    const response: TrendingResult = await api.video.getPopularVideos({
      pn: requestPage,
      ps: 30,
    })

    if (!isRequestCurrent(version) || response.code !== 0)
      return false

    noMoreContent.value = response.data.no_more
    pn.value = requestPage + 1

    // 热门榜单在翻页间会变动，同一视频可能出现在相邻两页；卡片 key 必须唯一。
    const seenIds = new Set(videoList.value.map(video => video.uniqueId))
    const newItems = response.data.list.flatMap((item: VideoItem) => {
      const uniqueId = `${item.aid}`
      if (seenIds.has(uniqueId))
        return []
      seenIds.add(uniqueId)
      return [{
        uniqueId,
        item,
        displayData: transformTrendingVideo({ uniqueId, item }),
      }]
    })

    videoList.value = [...videoList.value, ...newItems]

    // 初次加载且数据不足时继续加载
    if (videoList.value.length < 30 && !noMoreContent.value) {
      if (!isRequestCurrent(version))
        return true

      return await getTrendingVideos(version)
    }

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
    const loaded = await getTrendingVideos(version)
    if (isRequestCurrent(version) && loaded)
      hasLoaded.value = true
  }
  finally {
    if (isRequestCurrent(version))
      isLoading.value = false
  }
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
    :transform-item="(item: VideoElement) => item.displayData"
    :get-item-key="(item: VideoElement) => item.uniqueId"
    show-preview
    @refresh="initData"
    @load-more="handleLoadMore"
  />
</template>
