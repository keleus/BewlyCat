<script setup lang="ts">
import type { Ref } from 'vue'

import type { Video } from '~/components/VideoCard/types'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import type { DataItem as MomentItem, MomentResult } from '~/models/moment/moment'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

// https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L16
interface VideoElement {
  uniqueId: string
  item?: MomentItem
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
const needToLoginFirst = ref<boolean>(false)
const containerRef = ref<HTMLElement>() as Ref<HTMLElement>
const offset = ref<string>('')
const updateBaseline = ref<string>('')
const noMoreContent = ref<boolean>(false)
const noMoreContentWarning = ref<boolean>(false)
const { handleReachBottom, handlePageRefresh, haveScrollbar } = useBewlyApp()

onMounted(() => {
  initData()
  initPageAction()
})

onActivated(() => {
  initPageAction()
})

async function initData() {
  offset.value = ''
  updateBaseline.value = ''
  videoList.value.length = 0
  noMoreContent.value = false
  noMoreContentWarning.value = false

  await getData()
}

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformSubscribedSeriesVideo(item: MomentItem): Video {
  return {
    id: item.modules.module_author.mid,
    title: decodeHtmlEntities(`${item.modules.module_dynamic.major.pgc?.title}`),
    cover: `${item.modules.module_dynamic.major.pgc?.cover}`,
    author: {
      name: decodeHtmlEntities(item.modules.module_author.name),
      authorUrl: item.modules.module_author.jump_url,
      authorFace: item.modules.module_author.face,
      mid: item.modules.module_author.mid,
    },
    viewStr: item.modules.module_dynamic.major.pgc?.stat.play,
    danmakuStr: item.modules.module_dynamic.major.pgc?.stat.danmaku,
    likeStr: item.modules.module_dynamic.major.pgc?.stat.like,
    capsuleText: decodeHtmlEntities(item.modules.module_author.pub_time),
    epid: item.modules.module_dynamic.major.pgc?.epid,
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

function initPageAction() {
  handleReachBottom.value = async () => {
    if (isLoading.value)
      return
    if (noMoreContent.value) {
      noMoreContentWarning.value = true
      return
    }
    getData()
  }
  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    initData()
  }
}

async function getFollowedUsersVideos() {
  if (noMoreContent.value)
    return

  if (offset.value === '0') {
    noMoreContent.value = true
    return
  }

  try {
    let i = 0
    // https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L208
    const pendingVideos: VideoElement[] = Array.from({ length: 30 }, () => ({
      uniqueId: `unique-id-${(videoList.value.length || 0) + i++})}`,
    } satisfies VideoElement))
    let lastVideoListLength = videoList.value.length
    videoList.value.push(...pendingVideos)

    const response: MomentResult = await api.moment.getMoments({
      type: 'pgc',
      offset: Number(offset.value),
      update_baseline: updateBaseline.value,
    })

    if (response.code === -101) {
      noMoreContent.value = true
      needToLoginFirst.value = true
      return
    }

    if (response.code === 0) {
      offset.value = response.data.offset
      updateBaseline.value = response.data.update_baseline

      const resData = [] as MomentItem[]

      response.data.items.forEach((item: MomentItem) => {
        resData.push(item)
      })

      // when videoList has length property, it means it is the first time to load
      if (!videoList.value.length) {
        videoList.value = resData.map(item => ({
          uniqueId: `${item.id_str}`,
          item,
          displayData: transformSubscribedSeriesVideo(item),
        }))
      }
      else {
        resData.forEach((item) => {
          videoList.value[lastVideoListLength++] = {
            uniqueId: `${item.id_str}`,
            item,
            displayData: transformSubscribedSeriesVideo(item),
          }
        })
      }

      if (!await haveScrollbar() && !noMoreContent.value) {
        getFollowedUsersVideos()
      }
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
  <div>
    <Empty v-if="needToLoginFirst" mt-6 :description="$t('common.please_log_in_first')">
      <Button type="primary" @click="jumpToLoginPage()">
        {{ $t('common.login') }}
      </Button>
    </Empty>
    <Empty v-if="videoList.length === 0 && !needToLoginFirst" mt-6 :description="$t('common.no_more_content')">
      <Button type="primary" @click="initData()">
        {{ $t('common.operation.refresh') }}
      </Button>
    </Empty>
    <div
      v-else
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
        type="bangumi"
        :video="video.displayData"
        :show-watcher-later="false"
        :horizontal="gridLayout !== 'adaptive'"
      />
    </div>

    <!-- no more content -->
    <Empty v-if="noMoreContentWarning" class="pb-4" :description="$t('common.no_more_content')" />
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
