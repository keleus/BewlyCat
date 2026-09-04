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

const tabState = useHomeTabState()
const isLoading = ref<boolean>(false)
const videoList = tabState.ref<VideoElement[]>('videoList', [])
const pn = tabState.ref<number>('pn', 1)
const noMoreContent = tabState.ref<boolean>('noMoreContent', false)
const hasLoaded = tabState.ref<boolean>('hasLoaded', false)
const { handleReachBottom, handlePageRefresh } = useBewlyApp()

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

  noMoreContent.value = false
  videoList.value = []
  pn.value = 1
  hasLoaded.value = false
  await getData()
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
    tag: decodeHtmlEntities(videoItem.rcmd_reason.content),
    cid: videoItem.cid,
    threePointV2: [],
  }
}

async function getData() {
  if (!tabState.isCurrent())
    return

  emit('beforeLoading')
  isLoading.value = true
  let loaded = noMoreContent.value
  try {
    loaded = await getTrendingVideos()
    if (tabState.isCurrent() && loaded)
      hasLoaded.value = true
  }
  finally {
    if (tabState.isCurrent()) {
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

async function getTrendingVideos(): Promise<boolean> {
  if (noMoreContent.value)
    return true

  const requestPage = pn.value

  try {
    const response: TrendingResult = await api.video.getPopularVideos({
      pn: requestPage,
      ps: 30,
    })

    if (!tabState.isCurrent() || response.code !== 0)
      return false

    noMoreContent.value = response.data.no_more
    pn.value = requestPage + 1

    const newItems = response.data.list.map((item: VideoItem) => ({
      uniqueId: `${item.aid}`,
      item,
      displayData: transformTrendingVideo({ uniqueId: `${item.aid}`, item }),
    }))

    videoList.value = [...videoList.value, ...newItems]

    // 初次加载且数据不足时继续加载
    if (videoList.value.length < 30 && !noMoreContent.value) {
      if (!tabState.isCurrent())
        return true

      return await getTrendingVideos()
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

  isLoading.value = true
  try {
    const loaded = await getTrendingVideos()
    if (tabState.isCurrent() && loaded)
      hasLoaded.value = true
  }
  finally {
    if (tabState.isCurrent())
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
