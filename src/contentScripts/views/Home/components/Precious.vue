<script setup lang="ts">
import type { Ref } from 'vue'

import type { Video } from '~/components/VideoCard/types'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import type { PreciousItem, PreciousResult } from '~/models/video/precious'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

interface VideoElement {
  uniqueId: string
  item?: PreciousItem
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
const { handlePageRefresh } = useBewlyApp()

onMounted(() => {
  initData()
  initPageAction()
})

onActivated(() => {
  initPageAction()
})

async function initData() {
  videoList.value.length = 0
  await getData()
}

async function getData() {
  emit('beforeLoading')
  isLoading.value = true
  try {
    await getPreciousVideos()
  }
  finally {
    isLoading.value = false
    emit('afterLoading')
  }
}

function initPageAction() {
  handlePageRefresh.value = async () => {
    initData()
  }
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

async function getPreciousVideos() {
  try {
    const response: PreciousResult = await api.ranking.getPreciousVideos()

    if (response.code === 0) {
      const list = Array.isArray((response.data as any)?.list) ? (response.data as any).list as PreciousItem[] : []
      videoList.value = list.map(item => ({
        uniqueId: `${item.aid}`,
        item,
        displayData: transformPreciousVideo(item),
      }))
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

      <!-- skeleton -->
      <template v-if="isLoading && !videoList.length">
        <VideoCardSkeleton
          v-for="item in 24" :key="item"
          :horizontal="gridLayout !== 'adaptive'"
        />
      </template>
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
