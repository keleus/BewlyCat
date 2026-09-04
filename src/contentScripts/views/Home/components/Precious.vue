<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabState } from '~/composables/useHomeTabState'
import type { GridLayoutType } from '~/logic'
import type { PreciousItem, PreciousResult } from '~/models/video/precious'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

interface VideoElement {
  uniqueId: string
  item?: PreciousItem
  displayData?: Video
}

defineProps<{
  gridLayout: GridLayoutType
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const tabState = useHomeTabState()
const isLoading = ref<boolean>(false)
const videoList = tabState.ref<VideoElement[]>('videoList', [])
const noMoreContent = tabState.ref<boolean>('noMoreContent', true) // 入站必刷没有分页
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

  videoList.value = []
  hasLoaded.value = false
  await getData()
}

async function getData() {
  if (!tabState.isCurrent())
    return

  emit('beforeLoading')
  isLoading.value = true
  let loaded = false
  try {
    loaded = await getPreciousVideos()
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

function initPageAction() {
  handleReachBottom.value = undefined
  handlePageRefresh.value = refreshHandler
}

async function refreshHandler() {
  if (!tabState.isCurrent() || isLoading.value)
    return

  await initData()
}

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformPreciousVideo(item: PreciousItem): Video {
  return {
    id: Number(item.aid),
    duration: item.duration,
    title: decodeHtmlEntities(item.title),
    desc: decodeHtmlEntities(item.desc),
    cover: item.pic,
    author: item.owner
      ? {
          name: decodeHtmlEntities(item.owner.name),
          authorFace: item.owner.face,
          mid: item.owner.mid,
        }
      : undefined,
    view: item.stat?.view,
    danmaku: item.stat?.danmaku,
    like: item.stat?.like,
    likeStr: item.stat?.like_str ?? item.stat?.like,
    publishedTimestamp: item.pubdate,
    bvid: item.bvid,
    cid: item.cid,
    threePointV2: [],
  }
}

async function getPreciousVideos(): Promise<boolean> {
  try {
    const response: PreciousResult = await api.ranking.getPreciousVideos()

    if (!tabState.isCurrent() || response.code !== 0)
      return false

    const list = Array.isArray((response.data as any)?.list) ? (response.data as any).list as PreciousItem[] : []
    videoList.value = list.map(item => ({
      uniqueId: `${item.aid}`,
      item,
      displayData: transformPreciousVideo(item),
    }))
    return true
  }
  catch {
    return false
  }
  finally {
    if (tabState.isCurrent())
      videoList.value = videoList.value.filter(video => video.item)
  }
}

onBeforeUnmount(() => {
  if (handlePageRefresh.value === refreshHandler)
    handlePageRefresh.value = undefined
})

defineExpose({ initData })
</script>

<template>
  <div>
    <VideoCardGrid
      :items="videoList"
      :grid-layout="gridLayout"
      :loading="isLoading"
      :no-more-content="noMoreContent"
      :transform-item="(item: VideoElement) => item.displayData"
      :get-item-key="(item: VideoElement) => item.uniqueId"
      :is-skeleton-item="(item: VideoElement) => !item.item"
      show-preview
      @refresh="initData"
      @load-more="() => {}"
    />
  </div>
</template>
