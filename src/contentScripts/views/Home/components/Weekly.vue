<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import type { PopularSeriesItem, PopularSeriesListResult, PopularSeriesOneResult, PopularSeriesVideoItem } from '~/models/video/popularSeries'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

interface VideoElement extends PopularSeriesVideoItem {
  displayData?: Video
}

const props = defineProps<{
  gridLayout: GridLayoutType
  topBarVisibility: boolean
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const { handleBackToTop, handlePageRefresh } = useBewlyApp()

const isLoading = ref<boolean>(false)
const shouldMoveAsideUp = ref<boolean>(false)

const seriesList = ref<PopularSeriesItem[]>([])
const activatedSeries = ref<PopularSeriesItem | null>(null)
const videoList = ref<VideoElement[]>([])
const noMoreContent = ref<boolean>(true) // 每周必看没有分页

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformWeeklyVideo(item: PopularSeriesVideoItem, rank: number): Video {
  return {
    id: Number(item.aid),
    duration: item.duration,
    title: decodeHtmlEntities(item.title),
    desc: decodeHtmlEntities(item.desc),
    cover: item.pic,
    author: {
      name: decodeHtmlEntities(item.owner?.name),
      authorFace: item.owner?.face,
      mid: item.owner?.mid,
    },
    view: item.stat?.view,
    danmaku: item.stat?.danmaku,
    like: item.stat?.like,
    likeStr: item.stat?.like_str ?? item.stat?.like,
    publishedTimestamp: item.pubdate,
    bvid: item.bvid,
    cid: item.cid,
    rank,
    threePointV2: [],
  }
}

watch(() => props.topBarVisibility, () => {
  shouldMoveAsideUp.value = false

  if (settings.value.autoHideTopBar && settings.value.showTopBar) {
    if (props.topBarVisibility)
      shouldMoveAsideUp.value = false
    else
      shouldMoveAsideUp.value = true
  }
})

onMounted(() => {
  initData()
  initPageAction()
})

onActivated(() => {
  initPageAction()
})

function initPageAction() {
  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return
    initData()
  }
}

function initData() {
  videoList.value.length = 0
  seriesList.value.length = 0
  activatedSeries.value = null
  getSeriesList()
}

function getSeriesList() {
  api.ranking.getPopularSeriesList()
    .then((res: PopularSeriesListResult) => {
      if (res && res.code === 0 && res.data && Array.isArray(res.data.list)) {
        // sort by number desc (latest first) if available
        seriesList.value = [...res.data.list].sort((a, b) => (b.number || 0) - (a.number || 0))
        if (seriesList.value.length) {
          // 默认选择第一期（通常为最新期）
          activatedSeries.value = seriesList.value[0]
          handleBackToTop(settings.value.useSearchPageModeOnHomePage ? 510 : 0)
          getSeriesOne()
        }
      }
    })
}

function getSeriesOne() {
  if (!activatedSeries.value)
    return
  emit('beforeLoading')
  isLoading.value = true
  videoList.value.length = 0
  api.ranking.getPopularSeriesOne({
    number: (activatedSeries.value as PopularSeriesItem).number,
  }).then((res: PopularSeriesOneResult) => {
    if (res && res.code === 0 && res.data && Array.isArray(res.data.list)) {
      videoList.value = res.data.list.map((item, index) => ({
        ...item,
        displayData: transformWeeklyVideo(item, index + 1),
      }))
    }
  }).finally(() => {
    isLoading.value = false
    emit('afterLoading')
  })
}

watch(() => activatedSeries.value?.number, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal) {
    handleBackToTop(settings.value.useSearchPageModeOnHomePage ? 510 : 0)
    getSeriesOne()
  }
})

defineExpose({ initData })
</script>

<template>
  <div flex="~ gap-40px">
    <aside
      pos="sticky top-150px" h="[calc(100vh-140px)]" w-200px shrink-0 duration-300
      ease-in-out
      :class="{ hide: shouldMoveAsideUp }"
    >
      <OverlayScrollbarsComponent
        h-inherit p-20px m--20px defer
        :options="{
          update: {
            debounce: {
              mutations: [100, 100],
              resizes: [100, 100],
              events: [100, 100],
              environmental: [100, 100],
            },
          },
        }"
      >
        <ul flex="~ col gap-2">
          <li v-for="item in seriesList" :key="item.number">
            <a
              :class="{ active: activatedSeries?.number === item.number }"
              px-4 lh-30px h-30px hover:bg="$bew-fill-2" w-inherit
              block rounded="$bew-radius" cursor-pointer transition="all 300 ease-out"
              hover:scale-105 un-text="$bew-text-1"
              @click="activatedSeries = item"
            >
              <span class="issue-label">{{ item.name || `第${item.number}期` }}</span>
            </a>
          </li>
        </ul>
      </OverlayScrollbarsComponent>
    </aside>

    <div w-full>
      <VideoCardGrid
        :items="videoList"
        :grid-layout="gridLayout"
        :loading="isLoading"
        :no-more-content="noMoreContent"
        :transform-item="(item: VideoElement) => item.displayData"
        :get-item-key="(item: VideoElement) => item.aid"
        show-preview
        @refresh="initData"
        @load-more="() => {}"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.active {
  --uno: "scale-110 bg-$bew-theme-color-auto text-$bew-text-auto shadow-$bew-shadow-2";
}

.hide {
  --uno: "h-[calc(100vh-70)] translate-y--70px";
}

.issue-label {
  --uno: "text-13px truncate";
}
</style>
