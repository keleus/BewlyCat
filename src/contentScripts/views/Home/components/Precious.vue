<script setup lang="ts">
import type { Ref } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import type { PreciousItem, PreciousResult } from '~/models/video/precious'
import api from '~/utils/api'

interface VideoElement {
  uniqueId: string
  item?: PreciousItem
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
  const baseWidth = Math.max(120, settings.value.homeAdaptiveCardMinWidth || 280)
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

async function getPreciousVideos() {
  try {
    const response: PreciousResult = await api.ranking.getPreciousVideos()

    if (response.code === 0) {
      const list = Array.isArray((response.data as any)?.list) ? (response.data as any).list as PreciousItem[] : []
      videoList.value = list.map(item => ({ uniqueId: `${item.aid}`, item }))
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
        :skeleton="!video.item"
        :video="video.item ? {
          id: Number(video.item.aid),
          duration: video.item.duration,
          title: video.item.title,
          desc: video.item.desc,
          cover: video.item.pic,
          author: video.item.owner ? {
            name: video.item.owner.name,
            authorFace: video.item.owner.face,
            mid: video.item.owner.mid,
          } : undefined,
          view: video.item.stat?.view,
          danmaku: video.item.stat?.danmaku,
          publishedTimestamp: video.item.pubdate,
          bvid: video.item.bvid,
          cid: video.item.cid,
        } : undefined"
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
.grid-adaptive {
  --uno: "grid gap-5";
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.grid-two-columns {
  --uno: "grid cols-1 xl:cols-2 gap-4";
}

.grid-one-column {
  --uno: "grid cols-1 gap-4";
}
</style>
