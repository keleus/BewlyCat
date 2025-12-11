<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { Video } from '~/components/VideoCard/types'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useGridLayout } from '~/composables/useGridLayout'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import type { List as RankingVideoItem, RankingResult } from '~/models/video/ranking'
import type { List as RankingPgcItem, RankingPgcResult } from '~/models/video/rankingPgc'
import api from '~/utils/api'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

import type { RankingType } from '../types'

// 扩展 RankingVideoItem 以包含预处理的显示数据
interface RankingVideoElement extends RankingVideoItem {
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

const { t } = useI18n()
const { handleBackToTop, handlePageRefresh } = useBewlyApp()

// 为 gridStyle 获取 useGridLayout 的结果
const { gridStyle } = useGridLayout(() => props.gridLayout)

const gridClass = computed((): string => {
  if (props.gridLayout === 'adaptive') {
    // eslint-disable-next-line ts/no-use-before-define
    if (!activatedRankingType.value.seasonType)
      return 'grid-adaptive-video'
    else
      return 'grid-adaptive-bangumi'
  }

  if (props.gridLayout === 'twoColumns')
    return 'grid-two-columns'
  return 'grid-one-column'
})

const rankingTypes = computed((): RankingType[] => {
  return [
    { id: 1, name: t('ranking.all'), rid: 0 },
    { id: 2, name: t('topbar.logo_dropdown.anime'), seasonType: 1 },
    { id: 3, name: t('topbar.logo_dropdown.chinese_anime'), seasonType: 4 },
    { id: 5, name: t('topbar.logo_dropdown.documentary_films'), seasonType: 3 },
    { id: 6, name: t('topbar.logo_dropdown.animations'), rid: 1005 },
    { id: 7, name: t('topbar.logo_dropdown.music'), rid: 1003 },
    { id: 8, name: t('topbar.logo_dropdown.dance'), rid: 1004 },
    { id: 9, name: t('topbar.logo_dropdown.gaming'), rid: 1008 },
    { id: 10, name: t('topbar.logo_dropdown.knowledge'), rid: 1010 },
    { id: 11, name: t('topbar.logo_dropdown.technology'), rid: 1012 },
    { id: 12, name: t('topbar.logo_dropdown.sports'), rid: 1018 },
    { id: 13, name: t('topbar.logo_dropdown.cars'), rid: 1013 },
    { id: 15, name: t('topbar.logo_dropdown.foods'), rid: 1020 },
    { id: 16, name: t('topbar.logo_dropdown.animals'), rid: 1024 },
    { id: 17, name: t('topbar.logo_dropdown.kichiku'), rid: 1007 },
    { id: 18, name: t('topbar.logo_dropdown.fashion'), rid: 1014 },
    { id: 19, name: t('topbar.logo_dropdown.showbiz'), rid: 1002 },
    { id: 20, name: t('topbar.logo_dropdown.cinephile'), rid: 1001 },
    { id: 21, name: t('topbar.logo_dropdown.movies'), seasonType: 2 },
    { id: 22, name: t('topbar.logo_dropdown.tv_shows'), seasonType: 5 },
    { id: 23, name: t('topbar.logo_dropdown.variety_shows'), seasonType: 7 },
    { id: 24, name: t('ranking.original_content'), rid: 0, type: 'origin' },
    { id: 25, name: t('ranking.debut_work'), rid: 0, type: 'rookie' },
  ]
})

const isLoading = ref<boolean>(false)
const activatedRankingType = ref<RankingType>({ ...rankingTypes.value[0] })
const videoList = reactive<RankingVideoElement[]>([])
const PgcList = reactive<RankingPgcItem[]>([])
const shouldMoveAsideUp = ref<boolean>(false)

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
function transformRankingVideo(item: RankingVideoItem, rank: number): Video {
  return {
    id: Number(item.aid),
    duration: item.duration,
    title: decodeHtmlEntities(item.title),
    desc: decodeHtmlEntities(item.desc),
    cover: item.pic,
    author: {
      name: decodeHtmlEntities(item.owner.name),
      authorFace: item.owner.face,
      mid: item.owner.mid,
    },
    view: item.stat.view,
    danmaku: item.stat.danmaku,
    like: item.stat.like,
    likeStr: (item.stat as any)?.like_str ?? item.stat.like,
    publishedTimestamp: item.pubdate,
    bvid: item.bvid,
    rank,
    cid: item.cid,
    threePointV2: [],
  }
}

watch(() => activatedRankingType.value.id, () => {
  handleBackToTop(settings.value.useSearchPageModeOnHomePage ? 510 : 0)

  initData()
})

watch(() => props.topBarVisibility, () => {
  shouldMoveAsideUp.value = false

  // Allow moving tabs up only when the top bar is not hidden & is set to auto-hide
  // This feature is primarily designed to compatible with the Bilibili Evolved's top bar
  // Even when the BewlyBewly top bar is hidden, the Bilibili Evolved top bar still exists, so not moving up
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
  videoList.length = 0
  PgcList.length = 0
  getData()
}

function getData() {
  if ('seasonType' in activatedRankingType.value)
    getRankingPgc()
  else
    getRankingVideos()
}

// onBeforeUnmount(() => {
//   emitter.off(TOP_BAR_VISIBILITY_CHANGE)
// })

function getRankingVideos() {
  videoList.length = 0
  emit('beforeLoading')
  isLoading.value = true
  api.ranking.getRankingVideos({
    rid: activatedRankingType.value.rid,
    type: 'type' in activatedRankingType.value ? activatedRankingType.value.type : 'all',
  }).then((response: RankingResult) => {
    if (response.code === 0) {
      const { list } = response.data
      // 添加 displayData 预处理
      const processedList = list.map((item, index) => ({
        ...item,
        displayData: transformRankingVideo(item, index + 1),
      }))
      Object.assign(videoList, processedList)
    }
  }).finally(() => {
    isLoading.value = false
    emit('afterLoading')
  })
}

function getRankingPgc() {
  PgcList.length = 0
  isLoading.value = true
  api.ranking.getRankingPgc({
    season_type: activatedRankingType.value.seasonType,
  }).then((response: RankingPgcResult) => {
    if (response.code === 0)
      Object.assign(PgcList, response.data.list)
  }).finally(() => isLoading.value = false)
}

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
          <li v-for="rankingType in rankingTypes" :key="rankingType.id">
            <a
              :class="{ active: activatedRankingType.id === rankingType.id }"
              px-4 lh-30px h-30px hover:bg="$bew-fill-2" w-inherit
              block rounded="$bew-radius" cursor-pointer transition="all 300 ease-out"
              hover:scale-105 un-text="$bew-text-1"
              @click="activatedRankingType = rankingType"
            >{{ rankingType.name }}</a>
          </li>
        </ul>
      </OverlayScrollbarsComponent>
    </aside>

    <main w-full :class="gridClass" :style="gridStyle">
      <template v-if="!('seasonType' in activatedRankingType)">
        <VideoCard
          v-for="video in videoList"
          :key="video.aid"
          v-memo="[video.aid, video.displayData, settings.videoCardLayout]"
          :video="video.displayData"
          show-preview
          :horizontal="gridLayout !== 'adaptive'"
          w-full
        />
      </template>
      <template v-else>
        <BangumiCard
          v-for="pgc in PgcList"
          :key="pgc.url"
          :bangumi="{
            url: pgc.url,
            cover: pgc.cover,
            title: pgc.title,
            desc: pgc.new_ep.index_show,
            view: pgc.stat.view,
            follow: pgc.stat.follow,
            rank: pgc.rank,
            capsuleText: pgc.rating.replace('分', ''),
            badge: {
              text: pgc.badge_info.text || '',
              bgColor: pgc.badge_info.bg_color || '',
              bgColorDark: pgc.badge_info.bg_color_night || '',
            },
          }"
          :horizontal="gridLayout !== 'adaptive'"
        />
      </template>

      <!-- skeleton -->
      <template v-if="isLoading">
        <template v-if="!('seasonType' in activatedRankingType)">
          <VideoCardSkeleton
            v-for="item in 30" :key="item"
            :horizontal="gridLayout !== 'adaptive'"
          />
        </template>
        <template v-else>
          <BangumiCardSkeleton
            v-for="item in 30" :key="item"
            :horizontal="gridLayout !== 'adaptive'"
          />
        </template>
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
.grid-adaptive-video {
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

.grid-adaptive-bangumi {
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
