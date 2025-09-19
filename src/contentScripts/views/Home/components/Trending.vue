<script setup lang="ts">
import type { Ref } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import type { List as VideoItem, TrendingResult } from '~/models/video/trending'
import api from '~/utils/api'

// https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L16
interface VideoElement {
  uniqueId: string
  item?: VideoItem
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
        videoList.value = resData.map(item => ({ uniqueId: `${item.aid}`, item }))
      }
      else {
        resData.forEach((item) => {
          videoList.value[lastVideoListLength++] = {
            uniqueId: `${item.aid}`,
            item,
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
        :skeleton="!video.item"
        :video="video.item ? {
          id: Number(video.item.aid),
          duration: video.item.duration,
          title: video.item.title,
          desc: video.item.desc,
          cover: video.item.pic,
          author: {
            name: video.item.owner.name,
            authorFace: video.item.owner.face,
            mid: video.item.owner.mid,
          },
          view: video.item.stat.view,
          danmaku: video.item.stat.danmaku,
          like: video.item.stat.like,
          likeStr: (video.item.stat as any)?.like_str ?? video.item.stat.like,
          publishedTimestamp: video.item.pubdate,
          bvid: video.item.bvid,
          tag: video.item.rcmd_reason.content,
          cid: video.item.cid,
        } : undefined"
        show-preview
        :horizontal="gridLayout !== 'adaptive'"
      />
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
