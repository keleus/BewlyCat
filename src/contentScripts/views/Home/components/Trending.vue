<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
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

const videoList = ref<VideoElement[]>([])
const isLoading = ref<boolean>(false)
const pn = ref<number>(1)
const noMoreContent = ref<boolean>(false)
const { handleReachBottom, handlePageRefresh } = useBewlyApp()

onMounted(() => {
  initData()
  initPageAction()
})

onActivated(() => {
  initPageAction()
})

async function initData() {
  noMoreContent.value = false
  videoList.value = []
  pn.value = 1
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
  emit('beforeLoading')
  isLoading.value = true
  try {
    await getTrendingVideos()
  }
  finally {
    isLoading.value = false
    emit('afterLoading')
  }
}

function initPageAction() {
  handleReachBottom.value = async () => {
    if (!isLoading.value && !noMoreContent.value)
      handleLoadMore()
  }

  handlePageRefresh.value = async () => {
    initData()
  }
}

async function getTrendingVideos() {
  if (noMoreContent.value)
    return

  try {
    const response: TrendingResult = await api.video.getPopularVideos({
      pn: pn.value++,
      ps: 30,
    })

    if (response.code === 0) {
      noMoreContent.value = response.data.no_more

      const newItems = response.data.list.map((item: VideoItem) => ({
        uniqueId: `${item.aid}`,
        item,
        displayData: transformTrendingVideo({ uniqueId: `${item.aid}`, item }),
      }))

      videoList.value = [...videoList.value, ...newItems]

      // 初次加载且数据不足时继续加载
      if (videoList.value.length < 30 && !noMoreContent.value) {
        await getTrendingVideos()
      }
    }
  }
  catch {
    // 忽略错误
  }
}

// 供 VideoCardGrid 预加载调用的函数
async function handleLoadMore() {
  if (isLoading.value || noMoreContent.value)
    return

  isLoading.value = true
  try {
    await getTrendingVideos()
  }
  finally {
    isLoading.value = false
  }
}

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
