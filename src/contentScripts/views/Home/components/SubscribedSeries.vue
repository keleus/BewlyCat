<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import type { DataItem as MomentItem, MomentResult } from '~/models/moment/moment'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

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
const { handleReachBottom, handlePageRefresh } = useBewlyApp()

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
  videoList.value = []
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
    // 初次加载时多加载几批确保有足够内容
    for (let i = 0; i < 3 && !noMoreContent.value; i++)
      await getSubscribedSeriesVideos()
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
    handleLoadMore()
  }
  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    initData()
  }
}

async function getSubscribedSeriesVideos() {
  if (noMoreContent.value)
    return

  if (offset.value === '0') {
    noMoreContent.value = true
    return
  }

  try {
    const response: MomentResult = await api.moment.getMoments({
      type: 'pgc',
      offset: offset.value || undefined,
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

      const newItems = response.data.items.map((item: MomentItem) => ({
        uniqueId: `${item.id_str}`,
        item,
        displayData: transformSubscribedSeriesVideo({ uniqueId: `${item.id_str}`, item }),
      }))

      videoList.value = [...videoList.value, ...newItems]
    }
    else if (response.code === -101) {
      needToLoginFirst.value = true
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
    await getSubscribedSeriesVideos()
  }
  finally {
    isLoading.value = false
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
      :transform-item="(item: VideoElement) => item.displayData"
      :get-item-key="(item: VideoElement) => item.uniqueId"
      video-type="bangumi"
      :show-watcher-later="false"
      @refresh="initData"
      @login="jumpToLoginPage"
      @load-more="handleLoadMore"
    />
  </div>
</template>
