<script setup lang="ts">
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { settings } from '~/logic'
import type { CollectedFavoriteSeason, CollectedFavoriteSeasonsResult, FavoriteSeasonMedia } from '~/models/video/favoriteSeason'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import {
  buildFavoriteSeasonEntryUrl,
  FAVORITE_SEASON_PAGE_SIZE,
  fetchFavoriteSeasonPage,
  mergeFavoriteSeasonPage,
  resolveFavoriteSeasonPlayAllUrl,
} from '~/utils/favoriteSeason'
import { getUserID, isHomePage, isInIframe, removeHttpFromUrl, scrollToTop } from '~/utils/main'
import { openLinkInBackground } from '~/utils/tabs'

import type { FavoriteCategory, FavoriteResource } from '../../types'

type FavoriteCategorySource = 'folder' | 'season'
type ViewCategory = FavoriteCategory & {
  source: FavoriteCategorySource
  cover?: string
  link?: string
}

const { t } = useI18n()
const toast = useToast()

const favoriteCategories = reactive<Array<ViewCategory>>([])
const collectedFavoriteSeasons = reactive<Array<CollectedFavoriteSeason>>([])
const favoriteResources = reactive<Array<FavoriteResource>>([])
const loadedSeasonMedias = ref<FavoriteSeasonMedia[]>([])
const loadedSeasonComplete = ref(false)

const activatedMediaId = ref<number>(0)
const activatedCategorySource = ref<FavoriteCategorySource>('folder')
const activatedCategoryLink = ref<string>('')
const activatedCategoryMid = ref<number>(0)
const activatedFavoriteTitle = ref<string>()
const currentPageNum = ref<number>(1)

const isLoading = ref<boolean>(false)
// when noMoreContent is true, the user can't scroll down to load more content
const noMoreContent = ref<boolean>(false)
const favoriteVideosWrap = ref<HTMLElement>() as Ref<HTMLElement>

const viewAllUrl = computed((): string => {
  if (activatedCategorySource.value === 'season') {
    // 「查看全部」进 UP 合集页浏览；「播放全部」按设置起播，职责分开
    if (activatedCategoryMid.value > 0) {
      return `https://space.bilibili.com/${activatedCategoryMid.value}/channel/collectiondetail?sid=${activatedMediaId.value}`
    }
    return buildFavoriteSeasonEntryUrl(activatedMediaId.value, activatedCategoryLink.value)
  }

  return `//space.bilibili.com/${getUserID()}/favlist?fid=${
    activatedMediaId.value
  }&ftype=create`
})

const playAllUrl = computed((): string => {
  // 订阅合集一律走 handleSeasonPlayAll；href 若仍是入口会导致
  // 异步解析打开目标页的同时，浏览器再按 <a> 打开第一期（双开）
  if (activatedCategorySource.value === 'season')
    return ''

  return `https://www.bilibili.com/list/ml${activatedMediaId.value}`
})

const useCustomSeasonPlayAll = computed(() => activatedCategorySource.value === 'season')
/** 订阅合集播放全部均走自定义解析（含 modifier） */
const interceptSeasonPlayAllModifiers = computed(() => useCustomSeasonPlayAll.value)

const isResolvingSeasonPlayAll = ref(false)

function openTopBarLink(url: string) {
  const mode = settings.value.topBarLinkOpenMode
  if (mode === 'background') {
    void openLinkInBackground(url)
    return
  }

  if (mode === 'currentTabIfNotHomepage') {
    if (isInIframe() || isHomePage())
      window.open(url, '_blank')
    else
      window.open(url, '_top')
    return
  }

  if (mode === 'newTab') {
    window.open(url, '_blank')
    return
  }

  window.open(url, '_top')
}

async function handleSeasonPlayAll() {
  if (isResolvingSeasonPlayAll.value)
    return

  isResolvingSeasonPlayAll.value = true
  try {
    const result = await resolveFavoriteSeasonPlayAllUrl({
      seasonId: activatedMediaId.value,
      link: activatedCategoryLink.value,
      mode: settings.value.collectedSeasonPlayAllMode,
      preloaded: {
        medias: loadedSeasonMedias.value,
        complete: loadedSeasonComplete.value,
        expectedCount: favoriteCategories.find(
          item => item.source === 'season' && item.id === activatedMediaId.value,
        )?.media_count,
      },
    })
    if (result.usedFallback && result.reason !== 'beginning')
      toast.warning(t('favorites.season_play_all_fallback'))
    openTopBarLink(result.url)
  }
  finally {
    isResolvingSeasonPlayAll.value = false
  }
}

watch([activatedMediaId, activatedCategorySource], ([newId, newSource], [oldId, oldSource]) => {
  if (newId === oldId && newSource === oldSource)
    return

  favoriteResources.length = 0
  loadedSeasonMedias.value = []
  loadedSeasonComplete.value = false
  if (favoriteVideosWrap.value)
    scrollToTop(favoriteVideosWrap.value)

  currentPageNum.value = 1
  noMoreContent.value = false
  getFavoriteResources()
})

onMounted(() => {
  initData()
})

// 使用 useOptimizedScroll 处理滚动加载
function handleReachBottom() {
  if (isLoading.value || noMoreContent.value || favoriteResources.length === 0)
    return

  if (activatedMediaId.value) {
    currentPageNum.value++
    getFavoriteResources()
  }
}

useOptimizedScroll(
  favoriteVideosWrap,
  { onReachBottom: handleReachBottom },
  { bottomThreshold: 400, throttleDelay: 100 },
)

async function initData() {
  await getFavoriteCategories()
  await getCollectedFavoriteSeasons()
  if (favoriteCategories.length > 0)
    changeCategory(favoriteCategories[0])
}

async function getFavoriteCategories() {
  await api.favorite.getFavoriteCategories({
    up_mid: getUserID(),
  })
    .then((res) => {
      if (res.code === 0) {
        favoriteCategories.length = 0
        favoriteCategories.push(...res.data.list.map(toFolderCategory))
        favoriteCategories.push(...collectedFavoriteSeasons.map(toSeasonCategory))
        noMoreContent.value = false
      }
      isLoading.value = false
    })
}

async function getCollectedFavoriteSeasons() {
  await api.favorite.getCollectedFavoriteSeasons({
    up_mid: getUserID(),
  })
    .then((res: CollectedFavoriteSeasonsResult) => {
      if (res.code === 0) {
        collectedFavoriteSeasons.length = 0
        collectedFavoriteSeasons.push(...res.data.list)
        favoriteCategories.push(...collectedFavoriteSeasons.map(toSeasonCategory))
      }
    })
}

function toFolderCategory(item: FavoriteCategory): ViewCategory {
  return {
    ...item,
    source: 'folder',
  }
}

function toSeasonCategory(item: CollectedFavoriteSeason): ViewCategory {
  return {
    id: item.id,
    fid: item.fid,
    mid: item.mid,
    attr: item.attr,
    title: item.title,
    fav_state: item.fav_state,
    media_count: item.media_count,
    source: 'season',
    cover: item.cover,
    link: item.link,
  }
}

/**
 * Get favorite video resources
 */
async function getFavoriteResources() {
  if (isLoading.value)
    return

  isLoading.value = true

  try {
    if (activatedCategorySource.value === 'season') {
      await getFavoriteSeasonResources()
      return
    }

    const res = await api.favorite.getFavoriteResources({
      media_id: activatedMediaId.value,
      pn: currentPageNum.value,
      keyword: '',
    })

    const { code, data } = res
    if (code === 0) {
      // 检查是否还有更多内容
      if (data && 'has_more' in data && !data.has_more) {
        noMoreContent.value = true
      }
      else {
        noMoreContent.value = false
      }

      // 添加数据到列表
      if (data && 'medias' in data && Array.isArray(data.medias) && data.medias.length > 0) {
        favoriteResources.push(...data.medias.filter((m: any) => m != null))
      }
      else if (!data || !data.medias || data.medias.length === 0) {
        // 如果没有数据返回，也标记为没有更多内容
        noMoreContent.value = true
      }
    }
  }
  catch (error) {
    console.error('Failed to load favorite resources:', error)
  }
  finally {
    isLoading.value = false
  }
}

async function getFavoriteSeasonResources() {
  if (currentPageNum.value === 1) {
    loadedSeasonMedias.value = []
    loadedSeasonComplete.value = false
  }

  const page = await fetchFavoriteSeasonPage(
    activatedMediaId.value,
    currentPageNum.value,
    FAVORITE_SEASON_PAGE_SIZE,
  )

  if (!page.ok) {
    noMoreContent.value = true
    loadedSeasonComplete.value = false
    return
  }

  const merged = mergeFavoriteSeasonPage({
    pn: currentPageNum.value,
    pageMedias: page.pageMedias,
    mediaCount: page.mediaCount,
    previousMedias: loadedSeasonMedias.value,
    pageSize: FAVORITE_SEASON_PAGE_SIZE,
  })

  loadedSeasonMedias.value = merged.medias
  loadedSeasonComplete.value = !merged.hasMore
  noMoreContent.value = !merged.hasMore

  // 顶栏是滚动追加：首页替换，后续页只追加本页增量
  if (currentPageNum.value === 1) {
    favoriteResources.length = 0
    favoriteResources.push(...merged.medias.map(normalizeSeasonMedia))
  }
  else {
    const previousCount = favoriteResources.length
    favoriteResources.push(...merged.medias.slice(previousCount).map(normalizeSeasonMedia))
  }
}

function normalizeSeasonMedia(item: FavoriteSeasonMedia): FavoriteResource {
  return {
    id: item.id,
    type: 2,
    title: item.title,
    cover: item.cover,
    intro: '',
    page: 1,
    duration: item.duration,
    upper: {
      ...item.upper,
      face: '',
    },
    cnt_info: {
      collect: item.cnt_info.collect,
      play: item.cnt_info.play,
      danmaku: item.cnt_info.danmaku,
    },
    link: item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : '',
    ctime: item.pubtime,
    pubtime: item.pubtime,
    fav_time: item.pubtime,
    bv_id: item.bvid,
    bvid: item.bvid,
  }
}

function refreshFavoriteResources() {
  favoriteResources.length = 0
  currentPageNum.value = 1
  getFavoriteResources()
}

function changeCategory(categoryItem: ViewCategory) {
  activatedMediaId.value = categoryItem.id
  activatedCategorySource.value = categoryItem.source
  activatedCategoryLink.value = categoryItem.link || ''
  activatedCategoryMid.value = categoryItem.mid || 0
  activatedFavoriteTitle.value = categoryItem.title
}

function isMusic(item: FavoriteResource) {
  return item.link.includes('bilibili://music')
}

defineExpose({
  refreshFavoriteResources,
})
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1);"
    h="[calc(100vh-100px)]" max-h-500px important-overflow-y-overlay
    bg="$bew-elevated"
    w="450px"
    rounded="$bew-radius"
    pos="relative"
    shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-3)]"
    border="1 $bew-border-color"
    class="favorites-pop"
  >
    <!-- top bar -->
    <header
      flex="~" items-center justify-between
      p="x-6"
      pos="sticky top-0 left-0"
      w="full"
      h-50px
      z="2"
    >
      <h3 cursor="pointer" font-600 @click="scrollToTop(favoriteVideosWrap)">
        {{ activatedFavoriteTitle }}
      </h3>

      <div flex="~ gap-4">
        <ALink
          :href="playAllUrl"
          type="topBar"
          flex="~" items="center"
          :custom-click-event="useCustomSeasonPlayAll"
          :custom-click-event-includes-modifiers="interceptSeasonPlayAllModifiers"
          @click="handleSeasonPlayAll"
        >
          <span text="sm">{{ $t('common.play_all') }}</span>
        </ALink>
        <ALink
          :href="viewAllUrl"
          type="topBar"
          flex="~" items="center"
        >
          <span text="sm">{{ $t('common.view_all') }}</span>
        </ALink>
      </div>
    </header>

    <main flex="~" h="[calc(100%-50px)]" rounded="$bew-radius">
      <aside
        pos="sticky top-50px left-0"
        w="140px" h-full overflow="y-auto"
        flex="shrink-0" bg="$bew-fill-1"
      >
        <ul grid="~ cols-1">
          <li
            v-for="item in favoriteCategories"
            :key="`${item.source}-${item.id}`"
            :class="activatedMediaId === item.id && activatedCategorySource === item.source ? 'activated-category' : ''"
            p="y-2 x-6"
            cursor="pointer"
            transition="~ duration-300"
            @click="changeCategory(item)"
          >
            {{ item.source === 'season' ? `${$t('favorites.collected_season_prefix')} ${item.title}` : item.title }}
          </li>
        </ul>
      </aside>

      <!-- Favorite videos wrapper -->
      <div
        ref="favoriteVideosWrap"
        flex="~ col gap-2 1"
        overflow="y-auto"
        p="x-4"
        pos="relative"
        h-full
      >
        <!-- loading -->
        <Loading
          v-if="isLoading && favoriteResources.length === 0"
          pos="absolute left-0"
          bg="$bew-content"
          z="1"
          w="full"
          h="full"
          flex="~"
          items="center"
          rounded="$bew-radius"
        />

        <!-- empty -->
        <Empty
          v-if="!isLoading && favoriteResources.length === 0"
          w="full" h="full"
          rounded="$bew-radius-half"
        />

        <!-- favorites -->
        <TransitionGroup name="list">
          <ALink
            v-for="item in favoriteResources"
            :key="item.id"
            :href="isMusic(item) ? `https://www.bilibili.com/audio/au${item.id}` : `//www.bilibili.com/video/${item.bvid}`"
            type="topBar"
            hover:bg="$bew-fill-2"
            rounded="$bew-radius"
            m="last:b-4" p="2"
            class="group"
            transition="~ duration-300"
          >
            <section flex="~ gap-4" item-start>
              <div
                bg="$bew-skeleton"
                w="120px"
                flex="shrink-0"
                rounded="$bew-radius-half"
                overflow="hidden"
              >
                <div pos="relative">
                  <img
                    w="120px"
                    class="aspect-video"
                    :src="`${removeHttpFromUrl(item.cover)}@256w_144h_1c`"
                    :alt="item.title"
                    bg="contain"
                  >
                  <div
                    pos="absolute bottom-0 right-0"
                    bg="black opacity-60"
                    m="1"
                    p="x-2 y-1"
                    text="white xs"
                    rounded-full
                  >
                    {{ calcCurrentTime(item.duration) }}
                  </div>
                </div>
              </div>

              <!-- Description -->
              <div>
                <h3
                  class="keep-two-lines"
                >
                  {{ item.title }}
                </h3>
                <div
                  text="$bew-text-2 sm"
                  m="t-2"
                  flex="~"
                  items-center
                >
                  <ALink
                    :href="`https://space.bilibili.com/${item.upper.mid}`"
                    type="topBar"
                    :stop-propagation="true"
                  >
                    {{ item.upper.name }}
                  </ALink>
                </div>
              </div>
            </section>
          </ALink>
        </TransitionGroup>

        <!-- loading -->
        <Transition name="fade">
          <Loading v-if="isLoading && favoriteResources.length !== 0" m="b-4" />
        </Transition>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.activated-category {
  --uno: "bg-$bew-theme-color text-white";
}
</style>
