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

defineProps<{
  gridLayout: GridLayoutType
  topBarVisibility: boolean
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const { handleBackToTop, handlePageRefresh, mainAppRef } = useBewlyApp()

const isLoading = ref<boolean>(false)

const seriesList = ref<PopularSeriesItem[]>([])
const activatedSeries = ref<PopularSeriesItem | null>(null)
const videoList = ref<VideoElement[]>([])
const noMoreContent = ref<boolean>(true) // 每周必看没有分页

// 下拉选择器相关
const searchQuery = ref<string>('')
const showDropdown = ref<boolean>(false)
const containerRef = ref<HTMLElement | null>(null)
const dropdownPosition = ref({ top: 0, left: 0, width: 0 })

const filteredSeriesList = computed(() => {
  if (!searchQuery.value.trim()) {
    return seriesList.value
  }
  const query = searchQuery.value.toLowerCase()
  return seriesList.value.filter(item =>
    (item.name || `第${item.number}期`).toLowerCase().includes(query)
    || String(item.number).includes(query),
  )
})

function calculatePosition() {
  if (!containerRef.value)
    return
  const rect = containerRef.value.getBoundingClientRect()
  dropdownPosition.value = {
    top: rect.bottom + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
  }
}

watchEffect(() => {
  if (showDropdown.value)
    calculatePosition()
}, { flush: 'pre' })

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

onMounted(() => {
  initData()
  initPageAction()
  window.addEventListener('resize', calculatePosition)
})

onActivated(() => {
  initPageAction()
})

onUnmounted(() => {
  window.removeEventListener('resize', calculatePosition)
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

function selectSeries(item: PopularSeriesItem) {
  activatedSeries.value = item
  showDropdown.value = false
  searchQuery.value = ''
}

function closeDropdown() {
  showDropdown.value = false
  searchQuery.value = ''
}

function onMouseLeave() {
  window.addEventListener('click', closeDropdown)
}

function onMouseEnter() {
  window.removeEventListener('click', closeDropdown)
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
  <div flex="~ col" w-full>
    <!-- 期号选择器 -->
    <div
      ref="containerRef"
      pos="relative" mb-20px w-280px
      @mouseleave="onMouseLeave"
      @mouseenter="onMouseEnter"
    >
      <div
        p="x-4 y-2"
        bg="$bew-fill-1"
        rounded="$bew-radius"
        text="$bew-text-1"
        cursor="pointer"
        flex="~"
        justify="between"
        items="center"
        :ring="showDropdown ? '2px $bew-theme-color' : ''"
        duration-300
        @click="showDropdown = !showDropdown"
      >
        <span v-if="activatedSeries" truncate mr-2>
          {{ activatedSeries.name || `第${activatedSeries.number}期` }}
        </span>
        <span v-else text="$bew-text-3" truncate mr-2>选择期号</span>
        <!-- arrow -->
        <div
          border="~ solid t-0 l-0 r-2 b-2"
          :border-color="showDropdown ? '$bew-theme-color' : '$bew-fill-4'"
          p="3px"
          ml-2
          display="inline-block"
          :transform="`~ ${!showDropdown ? 'rotate-45 -translate-y-1/4' : 'rotate-225 translate-y-1/4'}`"
          transition="all duration-300"
        />
      </div>

      <Teleport :to="mainAppRef">
        <Transition name="dropdown">
          <div
            v-if="showDropdown"
            :style="{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
              backdropFilter: 'var(--bew-filter-glass-1)',
            }"
            pos="absolute" bg="$bew-elevated" shadow="$bew-shadow-2"
            mt-2 rounded="$bew-radius" z="10004"
            max-h-400px of-hidden
            @mouseenter="onMouseEnter"
            @mouseleave="onMouseLeave"
          >
            <!-- 搜索框 -->
            <div p-3 border-b="1px solid $bew-border-color">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="搜索期号..."
                w-full px-3 py-2 rounded="$bew-radius"
                bg="$bew-fill-2" border="1px solid transparent"
                text="$bew-text-1" outline-none
                transition="all duration-300"
                focus:border="$bew-theme-color"
              >
            </div>

            <!-- 列表 -->
            <div of-y-auto max-h-320px p-2 flex="~ col gap-1">
              <div
                v-for="item in filteredSeriesList"
                :key="item.number"
                :class="{ active: activatedSeries?.number === item.number }"
                class="series-item"
                p="x-2 y-2"
                rounded="$bew-radius"
                cursor-pointer
                transition="all duration-300"
                bg="hover:$bew-fill-2"
                @click="selectSeries(item)"
              >
                {{ item.name || `第${item.number}期` }}
              </div>
              <div
                v-if="filteredSeriesList.length === 0"
                p="x-2 y-4" text="center $bew-text-3"
              >
                未找到匹配的期号
              </div>
            </div>
          </div>
        </Transition>

        <!-- 遮罩 外部滚动时关闭下拉菜单 -->
        <div
          v-if="showDropdown"
          pos="fixed top-0 left-0" w-full h-full
          z="10003"
          @wheel="closeDropdown"
        />
      </Teleport>
    </div>

    <!-- 视频网格 -->
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
.series-item.active {
  --uno: "bg-$bew-theme-color-auto text-$bew-text-auto font-600";
}

// 下拉动画
.dropdown-enter-active {
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
}

.dropdown-leave-active {
  transition:
    opacity 0.15s ease-out,
    transform 0.15s ease-out;
}

.dropdown-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
