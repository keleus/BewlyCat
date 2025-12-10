<script setup lang="ts">
import type { Ref } from 'vue'

import type { Video } from '~/components/VideoCard/types'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import type { List as VideoItem, TrendingResult } from '~/models/video/trending'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

// https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L16
interface VideoElement {
  uniqueId: string
  item?: VideoItem
  displayData?: Video
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
const isLoading = ref<boolean>(false)
const containerRef = ref<HTMLElement>() as Ref<HTMLElement>
const pn = ref<number>(1)
const noMoreContent = ref<boolean>(false)
const { handleReachBottom, handlePageRefresh, haveScrollbar } = useBewlyApp()

onMounted(() => {
  initData()
  initPageAction()
})

onActivated(() => {
  initPageAction()
})

async function initData() {
  noMoreContent.value = false
  videoList.value.length = 0
  pn.value = 1
  await getData()
}

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformTrendingVideo(item: VideoItem): Video {
  return {
    id: Number(item.aid),
    duration: item.duration,
    title: decodeHtmlEntities(item.title),
    desc: decodeHtmlEntities(item.desc),
    cover: item.pic,
    author: {
      name: decodeHtmlEntities(item.owner.name),
      authorFace: item.owner.face,
      mid: item.owner.mid,
    },
    view: item.stat.view,
    danmaku: item.stat.danmaku,
    like: item.stat.like,
    likeStr: (item.stat as any)?.like_str ?? item.stat.like,
    publishedTimestamp: item.pubdate,
    bvid: item.bvid,
    tag: decodeHtmlEntities(item.rcmd_reason.content),
    cid: item.cid,
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
    if (!isLoading.value)
      await getData()
  }

  handlePageRefresh.value = async () => {
    initData()
  }
}

async function getTrendingVideos() {
  if (noMoreContent.value)
    return

  try {
    let i = 0
    // https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L208
    const pendingVideos: VideoElement[] = Array.from({ length: 30 }, () => ({
      uniqueId: `unique-id-${(videoList.value.length || 0) + i++})}`,
    } satisfies VideoElement))
    let lastVideoListLength = videoList.value.length
    videoList.value.push(...pendingVideos)

    const response: TrendingResult = await api.video.getPopularVideos({
      pn: pn.value++,
      ps: 30,
    })

    if (response.code === 0) {
      noMoreContent.value = response.data.no_more

      const resData = [] as VideoItem[]

      response.data.list.forEach((item: VideoItem) => {
        resData.push(item)
      })

      // when videoList has length property, it means it is the first time to load
      if (!videoList.value.length) {
        videoList.value = resData.map(item => ({
          uniqueId: `${item.aid}`,
          item,
          displayData: transformTrendingVideo(item),
        }))
      }
      else {
        resData.forEach((item) => {
          videoList.value[lastVideoListLength++] = {
            uniqueId: `${item.aid}`,
            item,
            displayData: transformTrendingVideo(item),
          }
        })
      }

      if (!haveScrollbar() && !noMoreContent.value) {
        getTrendingVideos()
      }
    }
  }
  finally {
    videoList.value = videoList.value.filter(video => video.item)
  }
}

defineExpose({ initData })
</script>

<template>
  <div>
    <div
      ref="containerRef"
      m="b-0 t-0" relative w-full h-full
      :class="gridClass"
      :style="gridStyle"
    >
      <VideoCard
        v-for="video in videoList"
        :key="video.uniqueId"
        v-memo="[video.uniqueId, video.item, settings.videoCardLayout]"
        :skeleton="!video.item"
        :video="video.displayData"
        show-preview
        :horizontal="gridLayout !== 'adaptive'"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 优化性能：使用响应式列数替代 auto-fill */
.grid-adaptive {
  --uno: "grid gap-5";
  grid-template-columns: repeat(1, 1fr);

  @media (min-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (min-width: 1280px) {
    grid-template-columns: repeat(4, 1fr);
  }

  @media (min-width: 1536px) {
    grid-template-columns: repeat(5, 1fr);
  }
}

.grid-two-columns {
  --uno: "grid cols-1 xl:cols-2 gap-4";
}

.grid-one-column {
  --uno: "grid cols-1 gap-4";
}
</style>
