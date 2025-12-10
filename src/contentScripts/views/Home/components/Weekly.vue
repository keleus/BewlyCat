<script setup lang="ts">
import type { Video } from '~/components/VideoCard/types'
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

const isLoading = ref<boolean>(false)
const shouldMoveAsideUp = ref<boolean>(false)

const seriesList = ref<PopularSeriesItem[]>([])
const activatedSeries = ref<PopularSeriesItem | null>(null)
const videoList = ref<VideoElement[]>([])

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
      <OverlayScrollbarsComponent h-inherit p-20px m--20px defer>
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

    <main w-full :class="gridClass" :style="gridStyle">
      <VideoCard
        v-for="(video, index) in videoList"
        :key="`${video.aid}-${index}`"
        v-memo="[video.aid, video.displayData, settings.videoCardLayout]"
        :video="video.displayData"
        show-preview
        :horizontal="gridLayout !== 'adaptive'"
        w-full
      />

      <!-- skeleton -->
      <template v-if="isLoading">
        <VideoCardSkeleton
          v-for="item in 30" :key="item"
          :horizontal="gridLayout !== 'adaptive'"
        />
      </template>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.active {
  --uno: "scale-110 bg-$bew-theme-color-auto text-$bew-text-auto shadow-$bew-shadow-2";
}

.hide {
  --uno: "h-[calc(100vh-70)] translate-y--70px";
}

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
.issue-label {
  --uno: "text-13px truncate";
}
</style>
