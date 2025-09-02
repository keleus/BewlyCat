<script setup lang="ts">
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { FavoriteCategory, FavoriteResource } from '~/components/TopBar/types'
import { useBewlyApp } from '~/composables/useAppProvider'
import { TOP_BAR_VISIBILITY_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import type { FavoritesResult, Media as FavoriteItem } from '~/models/video/favorite'
import type { FavoritesCategoryResult, List as CategoryItem } from '~/models/video/favoriteCategory'
import api from '~/utils/api'
import { getCSRF, getUserID, openLinkToNewTab, removeHttpFromUrl } from '~/utils/main'
import emitter from '~/utils/mitt'

const { t } = useI18n()

const favoriteCategories = reactive<CategoryItem[]>([])
const favoriteResources = reactive<FavoriteItem[]>([])
const categoryOptions = reactive<Array<{ value: FavoriteCategory, label: string }>>([])

const selectedCategory = ref<FavoriteCategory>()
const activatedCategoryCover = ref<string>('')

const shouldMoveCtrlBarUp = ref<boolean>(false)
const currentPageNum = ref<number>(1)
const keyword: Ref<string> = ref<string>('')
const searchScope = ref<'current' | 'all'>('current')
const { handlePageRefresh, handleReachBottom, haveScrollbar } = useBewlyApp()
const isLoading = ref<boolean>(false)
const isFullPageLoading = ref<boolean>(true)
const noMoreContent = ref<boolean>(false)

// 搜索范围选项
const searchScopeOptions = computed(() => [
  {
    label: t('favorites.search_current_folder'),
    value: 'current' as const,
  },
  {
    label: t('favorites.search_all_folders'),
    value: 'all' as const,
  },
])

onMounted(() => {
  emitter.off(TOP_BAR_VISIBILITY_CHANGE)
  emitter.on(TOP_BAR_VISIBILITY_CHANGE, (val) => {
    shouldMoveCtrlBarUp.value = false

    if (settings.value.autoHideTopBar && settings.value.showTopBar) {
      if (val)
        shouldMoveCtrlBarUp.value = false

      else
        shouldMoveCtrlBarUp.value = true
    }
  })

  initPageAction()
  initData()
})

async function initData() {
  await getFavoriteCategories()
  if (favoriteCategories.length > 0) {
    changeCategory(favoriteCategories[0])
  }
}

onUnmounted(() => {
  emitter.off(TOP_BAR_VISIBILITY_CHANGE)
})

function initPageAction() {
  handleReachBottom.value = async () => {
    if (isLoading.value)
      return
    if (noMoreContent.value)
      return

    if (searchScope.value === 'all') {
      const firstCategoryId = favoriteCategories.length > 0 ? favoriteCategories[0].id : 0
      await getFavoriteResources(firstCategoryId, ++currentPageNum.value, keyword.value, 1)
    }
    else {
      await getFavoriteResources(selectedCategory.value!.id, ++currentPageNum.value, keyword.value, 0)
    }
  }

  handlePageRefresh.value = () => {
    if (isLoading.value)
      return
    favoriteResources.length = 0
    currentPageNum.value = 1
    noMoreContent.value = false
    handleSearch()
  }
}

async function getFavoriteCategories() {
  await api.favorite.getFavoriteCategories({
    up_mid: getUserID(),
  })
    .then((res: FavoritesCategoryResult) => {
      if (res.code === 0) {
        Object.assign(favoriteCategories, res.data.list)

        categoryOptions.length = 0
        favoriteCategories.forEach((item) => {
          categoryOptions.push({
            label: item.title,
            value: item,
          })
        })
      }
    })
}

/**
 * Get favorite video resources
 * @param media_id
 * @param pn
 * @param keyword
 * @param type 搜索类型：0-特定收藏夹，1-全部收藏夹
 */
async function getFavoriteResources(
  media_id: number,
  pn: number,
  keyword = '' as string,
  type = 0 as number,
) {
  if (pn === 1)
    isFullPageLoading.value = true
  isLoading.value = true
  try {
    const res: FavoritesResult = await api.favorite.getFavoriteResources({
      media_id,
      pn,
      keyword,
      type,
    })

    if (res.code === 0) {
      if (searchScope.value === 'current') {
        activatedCategoryCover.value = res.data.info.cover
      }

      if (Array.isArray(res.data.medias) && res.data.medias.length > 0)
        favoriteResources.push(...res.data.medias)

      if (!res.data.medias)
        noMoreContent.value = true

      if (!haveScrollbar() && !noMoreContent.value) {
        if (searchScope.value === 'all') {
          const firstCategoryId = favoriteCategories.length > 0 ? favoriteCategories[0].id : 0
          await getFavoriteResources(firstCategoryId, ++currentPageNum.value, keyword, 1)
        }
        else {
          await getFavoriteResources(selectedCategory.value!.id, ++currentPageNum.value, keyword, 0)
        }
      }
    }
  }
  finally {
    isLoading.value = false
    isFullPageLoading.value = false
  }
}

async function changeCategory(categoryItem: FavoriteCategory) {
  if (isLoading.value)
    return
  currentPageNum.value = 1
  selectedCategory.value = categoryItem
  favoriteResources.length = 0
  noMoreContent.value = false

  // 切换收藏夹时，如果是搜索当前收藏夹模式，则立即加载数据
  if (searchScope.value === 'current') {
    activatedCategoryCover.value = ''
    getFavoriteResources(categoryItem.id, 1, keyword.value, 0)
  }
  else {
    // 全局搜索模式下，清空封面但不立即搜索
    activatedCategoryCover.value = ''
  }
}

function handleSearch() {
  if (searchScope.value === 'all' && !keyword.value.trim()) {
    return
  }

  currentPageNum.value = 1
  favoriteResources.length = 0
  noMoreContent.value = false

  if (searchScope.value === 'all') {
    const firstCategoryId = favoriteCategories.length > 0 ? favoriteCategories[0].id : 0
    getFavoriteResources(firstCategoryId, currentPageNum.value, keyword.value, 1)
  }
  else {
    if (selectedCategory.value) {
      getFavoriteResources(selectedCategory.value.id, currentPageNum.value, keyword.value, 0)
    }
  }
}

function handleSearchScopeChange() {
  // 切换搜索范围时，不清空当前结果，保持用户体验的连续性
  // 只重置分页状态，等待用户主动搜索时再更新结果
  currentPageNum.value = 1
  noMoreContent.value = false

  // 如果切换回当前收藏夹模式，且当前没有封面，则重新加载以获取封面
  if (searchScope.value === 'current' && selectedCategory.value && !activatedCategoryCover.value) {
    getFavoriteResources(selectedCategory.value.id, 1, keyword.value, 0)
  }
}

function handlePlayAll() {
  if (searchScope.value === 'all') {
    return
  }
  openLinkToNewTab(`https://www.bilibili.com/list/ml${selectedCategory.value?.id}`)
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

function handleUnfavorite(favoriteResource: FavoriteResource) {
  const result = confirm(
    t('favorites.unfavorite_confirm'),
  )
  if (result) {
    api.favorite.patchDelFavoriteResources({
      resources: `${favoriteResource.id}:${favoriteResource.type}`,
      media_id: selectedCategory.value?.id,
      csrf: getCSRF(),
    }).then((res) => {
      if (res.code === 0)
        favoriteResources.splice(favoriteResources.indexOf(favoriteResource as FavoriteItem), 1)
    })
  }
}

function isMusic(item: FavoriteResource) {
  return item.link.includes('bilibili://music')
}
</script>

<template>
  <div v-if="getCSRF()" flex="~ col md:row lg:row" gap-6>
    <main w="full md:60% lg:70% xl:75%" order="2 md:1 lg:1" relative>
      <div
        fixed z-10 absolute p-2 flex="~ gap-2"
        items-center
        bg="$bew-elevated-solid" rounded="$bew-radius" shadow="$bew-shadow-2" mt--2 transition="all 300 ease-in-out"
        :class="{ hide: shouldMoveCtrlBarUp }"
      >
        <Select v-model="selectedCategory" w-150px :options="categoryOptions" @change="(val: FavoriteCategory) => changeCategory(val)" />
        <Select v-model="searchScope" w-120px :options="searchScopeOptions" @change="handleSearchScopeChange" />
        <Input
          v-model="keyword"
          w-250px
          :placeholder="searchScope === 'all' ? t('favorites.global_search_placeholder') : t('favorites.search_placeholder')"
          @enter="handleSearch"
        />
        <Button
          type="primary"
          :disabled="searchScope === 'all' && !keyword.trim()"
          @click="handleSearch"
        >
          <template #left>
            <div i-tabler:search />
          </template>
        </Button>
      </div>

      <div v-if="searchScope === 'all' && !keyword.trim() && favoriteResources.length === 0 && !isLoading" m="t-55px b-6">
        <Empty :description="t('favorites.global_search_hint')" />
      </div>

      <Empty v-else-if="favoriteResources.length === 0 && !isLoading && !isFullPageLoading" m="t-55px b-6" />
      <template v-else>
        <Transition name="fade">
          <Loading v-if="isFullPageLoading" w-full h-screen pos="absolute top-0 left-0" mt--50px />
        </Transition>
        <div grid="~ 2xl:cols-4 xl:cols-3 lg:cols-2 md:cols-1 sm:cols-1 cols-1 gap-5" m="t-55px b-6">
          <TransitionGroup name="list">
            <VideoCard
              v-for="item in favoriteResources"
              :key="item.id"
              :video="{
                id: item.id,
                duration: item.duration,
                title: item.title,
                cover: item.cover,
                author: {
                  name: item.upper.name,
                  authorFace: item.upper.face,
                  mid: item.upper.mid,
                },
                view: item.cnt_info.play,
                danmaku: item.cnt_info.danmaku,
                publishedTimestamp: item.pubtime,
                bvid: isMusic(item) ? undefined : item.bvid,
                url: isMusic(item) ? `https://www.bilibili.com/audio/au${item.id}` : undefined,
              }"
              group
            >
              <template #coverTopLeft>
                <button
                  p="x-2 y-1" m="1"
                  rounded="$bew-radius"
                  text="!white xl"
                  bg="black opacity-60 hover:$bew-error-color-80"
                  @click.prevent.stop="handleUnfavorite(item)"
                >
                  <Tooltip :content="$t('favorites.unfavorite')" placement="bottom" type="dark">
                    <div i-ic-baseline-clear />
                  </Tooltip>
                </button>
              </template>
            </VideoCard>
          </TransitionGroup>
        </div>

        <Empty v-if="noMoreContent" class="py-4" :description="$t('common.no_more_content')" />

        <Transition name="fade">
          <Loading
            v-if="isLoading && favoriteResources.length !== 0 && !noMoreContent"
            m="-t-4"
          />
        </Transition>
      </template>
    </main>

    <aside relative w="full md:40% lg:30% xl:25%" class="hidden md:block" order="1 md:2 lg:2">
      <div
        pos="sticky top-120px"
        w-full h="auto md:[calc(100vh-160px)]"
        my-10
        rounded="$bew-radius"
        overflow-hidden
      >
        <div
          pos="absolute top-0 left-0" w-full h-full
          z--1
        >
          <div
            absolute w-full h-full
            bg="$bew-fill-4"
          />
          <img
            v-if="activatedCategoryCover"
            :src="removeHttpFromUrl(`${activatedCategoryCover}@480w_270h_1c`)"
            w-full h-full object="cover center" blur-40px
            relative z--1
          >
        </div>

        <main
          pos="absolute top-0 left-0"
          w-full h-full
          overflow-overlay
          flex="~ col gap-4 justify-start"
          p-6
        >
          <picture
            rounded="$bew-radius" style="box-shadow: 0 16px 24px -12px rgba(0, 0, 0, .36)"
            aspect-video mb-4 bg="$bew-skeleton"
          >
            <img
              v-if="activatedCategoryCover" :src="removeHttpFromUrl(`${activatedCategoryCover}@480w_270h_1c`)"
              rounded="$bew-radius" aspect-video w-full object-cover
            >
            <div v-else aspect-video w-full />
          </picture>

          <h3 text="3xl white" fw-600 style="text-shadow: 0 0 12px rgba(0,0,0,.3)">
            {{ selectedCategory?.title }}
          </h3>

          <p flex="~ col" gap-4>
            <Button
              color="rgba(255,255,255,.35)" block text-color="white" strong flex-1
              @click="handlePlayAll"
            >
              <template #left>
                <div i-tabler:player-play />
              </template>
              {{ t('common.play_all') }}
            </Button>
          </p>

          <ul
            class="category-list" h-full min-h-200px
            overflow-overlay
            border="1 color-[rgba(255,255,255,.2)]"
            rounded="$bew-radius"
          >
            <li
              v-for="item in categoryOptions" :key="item.value.id"
              border-b="1 color-[rgba(255,255,255,.2)]"
              lh-30px px-4 cursor-pointer hover:bg="[rgba(255,255,255,.35)]"
              duration-300 color-white flex justify-between
              :style="{ background: item.value.id === selectedCategory?.id ? 'rgba(255,255,255,.35)' : '', pointerEvents: isFullPageLoading ? 'none' : 'auto' }"
              @click="changeCategory(item.value)"
            >
              <span>{{ item.label }}</span>
              <span v-if="item.value.id !== -1" ml-2 color-white color-opacity-60>{{ item.value.media_count }}</span>
            </li>
          </ul>
        </main>
      </div>
    </aside>
  </div>
  <Empty v-else mt-6 :description="t('common.please_log_in_first')">
    <Button type="primary" @click="jumpToLoginPage()">
      {{ $t('common.login') }}
    </Button>
  </Empty>
</template>

<style lang="scss" scoped>
.hide {
  transform: translateY(-70px);
}

.category-list {
  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.35);
    border-radius: 20px;
  }

  &::-webkit-scrollbar-corner {
    background: transparent;
  }
}
</style>
