<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import type { DataItem as MomentItem, MomentResult } from '~/models/moment/moment'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

// https://github.com/starknt/BewlyBewly/blob/fad999c2e482095dc3840bb291af53d15ff44130/src/contentScripts/views/Home/components/ForYou.vue#L16
interface VideoElement {
  uniqueId: string
  item?: MomentItem
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
const needToLoginFirst = ref<boolean>(false)
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
function transformSubscribedSeriesVideo(item: VideoElement): Video | undefined {
  if (!item.item)
    return undefined

  const momentItem = item.item
  return {
    id: momentItem.modules.module_author.mid,
    title: decodeHtmlEntities(`${momentItem.modules.module_dynamic.major.pgc?.title}`),
    cover: `${momentItem.modules.module_dynamic.major.pgc?.cover}`,
    author: {
      name: decodeHtmlEntities(momentItem.modules.module_author.name),
      authorUrl: momentItem.modules.module_author.jump_url,
      authorFace: momentItem.modules.module_author.face,
      mid: momentItem.modules.module_author.mid,
    },
    viewStr: momentItem.modules.module_dynamic.major.pgc?.stat.play,
    danmakuStr: momentItem.modules.module_dynamic.major.pgc?.stat.danmaku,
    likeStr: momentItem.modules.module_dynamic.major.pgc?.stat.like,
    capsuleText: decodeHtmlEntities(momentItem.modules.module_author.pub_time),
    epid: momentItem.modules.module_dynamic.major.pgc?.epid,
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
    const lastVideoListLength = videoList.value.length
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
          displayData: transformSubscribedSeriesVideo({ uniqueId: `${item.id_str}`, item }),
        }))
      }
      else {
        resData.forEach((item, index) => {
          videoList.value[lastVideoListLength + index] = {
            uniqueId: `${item.id_str}`,
            item,
            displayData: transformSubscribedSeriesVideo({ uniqueId: `${item.id_str}`, item }),
          }
        })
      }

      if (!await haveScrollbar() && !noMoreContent.value)
        getFollowedUsersVideos()
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
    <VideoCardGrid
      :items="videoList"
      :grid-layout="gridLayout"
      :loading="isLoading"
      :no-more-content="noMoreContentWarning"
      :need-to-login-first="needToLoginFirst"
      :transform-item="transformSubscribedSeriesVideo"
      :get-item-key="(item: VideoElement) => item.uniqueId"
      video-type="bangumi"
      :show-watcher-later="false"
      @refresh="initData"
      @login="jumpToLoginPage"
    />
  </div>
</template>
