<script setup lang="ts">
import type { Ref } from 'vue'

import type { Video } from '~/components/VideoCard/types'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useGridLayout } from '~/composables/useGridLayout'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import type { FollowingLiveResult, List as FollowingLiveItem } from '~/models/live/getFollowingLiveList'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

// https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L16
interface VideoElement {
  uniqueId: string
  item?: FollowingLiveItem
  displayData?: Video
}

const props = defineProps<{
  gridLayout: GridLayoutType
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

// 使用共享的 Grid 布局 composable，避免重复计算
const { gridClass, gridStyle } = useGridLayout(() => props.gridLayout)

const videoList = ref<VideoElement[]>([])
const isLoading = ref<boolean>(false)
const needToLoginFirst = ref<boolean>(false)
const containerRef = ref<HTMLElement>() as Ref<HTMLElement>
const page = ref<number>(1)
const noMoreContent = ref<boolean>(false)
const { handleReachBottom, handlePageRefresh, haveScrollbar } = useBewlyApp()

onMounted(() => {
  initData()
  initPageAction()
})

onActivated(() => {
  initPageAction()
})

function initPageAction() {
  handleReachBottom.value = async () => {
    if (isLoading.value)
      return
    if (noMoreContent.value)
      return

    getData()
  }
  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    initData()
  }
}

async function initData() {
  page.value = 1
  videoList.value.length = 0
  noMoreContent.value = false

  await getData()
}

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformLiveVideo(item: FollowingLiveItem): Video {
  return {
    id: item.roomid,
    title: decodeHtmlEntities(item.title),
    cover: item.room_cover,
    author: {
      name: decodeHtmlEntities(item.uname),
      authorFace: item.face,
      mid: item.uid,
    },
    viewStr: item.text_small,
    tag: decodeHtmlEntities(item.area_name_v2),
    roomid: item.roomid,
    liveStatus: item.live_status,
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

async function getFollowedUsersVideos() {
  if (noMoreContent.value)
    return

  // if (list.value === '0') {
  //   noMoreContent.value = true
  //   return
  // }

  try {
    let i = 0
    // https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L208
    const pendingVideos: VideoElement[] = Array.from({ length: 30 }, () => ({
      uniqueId: `unique-id-${(videoList.value.length || 0) + i++})}`,
    } satisfies VideoElement))
    let lastVideoListLength = videoList.value.length
    videoList.value.push(...pendingVideos)

    const response: FollowingLiveResult = await api.live.getFollowingLiveList({
      page: page.value,
      page_size: 9,
    })

    if (response.code === -101) {
      noMoreContent.value = true
      needToLoginFirst.value = true
      return
    }

    if (response.code === 0) {
      if (response.data.list.length < 9)
        noMoreContent.value = true

      page.value++

      const resData = [] as FollowingLiveItem[]

      response.data.list.forEach((item: FollowingLiveItem) => {
        resData.push(item)
      })

      // when videoList has length property, it means it is the first time to load
      if (!videoList.value.length) {
        videoList.value = resData.map(item => ({
          uniqueId: `${item.roomid}`,
          item,
          displayData: transformLiveVideo(item),
        }))
      }
      else {
        resData.forEach((item) => {
          videoList.value[lastVideoListLength++] = {
            uniqueId: `${item.roomid}`,
            item,
            displayData: transformLiveVideo(item),
          }
        })
      }

      if (!haveScrollbar() && !noMoreContent.value) {
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
        :video="video.displayData"
        type="live"
        :show-watcher-later="false"
        :show-preview="true"
        :horizontal="gridLayout !== 'adaptive'"
      />
    </div>

    <!-- no more content -->
    <Empty v-if="noMoreContent && !needToLoginFirst" class="pb-4" :description="$t('common.no_more_content')" />
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
