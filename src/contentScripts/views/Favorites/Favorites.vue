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
const searchAll = ref<boolean>(false)
const { handlePageRefresh, handleReachBottom, haveScrollbar } = useBewlyApp()
const isLoading = ref<boolean>(false)
const isFullPageLoading = ref<boolean>(false)
const noMoreContent = ref<boolean>(false)

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

    if (searchAll.value === true) {
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
  isLoading.value = true
  try {
    const res: FavoritesResult = await api.favorite.getFavoriteResources({
      media_id,
      pn,
      keyword,
      type,
    })

    if (res.code === 0) {
      if (searchAll.value === false) {
        activatedCategoryCover.value = res.data.info.cover
      }

      if (Array.isArray(res.data.medias) && res.data.medias.length > 0)
        favoriteResources.push(...res.data.medias)

      if (!res.data.medias)
        noMoreContent.value = true

      if (!haveScrollbar() && !noMoreContent.value) {
        if (searchAll.value === true) {
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
  }
}

async function changeCategory(categoryItem: FavoriteCategory) {
  if (isLoading.value)
    return
  currentPageNum.value = 1
  selectedCategory.value = categoryItem
  favoriteResources.length = 0
  noMoreContent.value = false

  // 切换收藏夹时，关闭搜索全部收藏夹模式
  searchAll.value = false
  activatedCategoryCover.value = ''
  getFavoriteResources(categoryItem.id, 1, keyword.value, 0)
}

function handleSearch() {
  if (searchAll.value === true && !keyword.value.trim()) {
    searchAll.value = false
  }

  currentPageNum.value = 1
  favoriteResources.length = 0
  noMoreContent.value = false

  if (searchAll.value === true) {
    const firstCategoryId = favoriteCategories.length > 0 ? favoriteCategories[0].id : 0
    getFavoriteResources(firstCategoryId, currentPageNum.value, keyword.value, 1)
  }
  else {
    if (selectedCategory.value) {
      getFavoriteResources(selectedCategory.value.id, currentPageNum.value, keyword.value, 0)
    }
  }
}

function handlePlayAll() {
  if (searchAll.value === true) {
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
      <div v-if="searchAll === true && !keyword.trim() && favoriteResources.length === 0 && !isLoading" m="t-55px b-6">
        <Empty :description="t('favorites.global_search_hint')" />
      </div>

      <Empty v-else-if="favoriteResources.length === 0 && !isLoading" m="t-55px b-6" />
      <template v-else>
        <Transition name="fade">
          <Loading v-if="isFullPageLoading" w-full h-full pos="absolute top-0 left-0" mt--50px />
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

          <input
            v-model="keyword"
            w-full
            rounded="$bew-radius"
            px-4 lh-30px
            bg="transparent" text="white"
            border="1 color-[rgba(255,255,255,.2)]"
            outline-none
            :placeholder="searchAll === true ? t('favorites.global_search_placeholder') : t('favorites.search_placeholder')"
            @keyup.enter="handleSearch"
          >

          <Transition name="search-all">
            <button
              v-show="keyword.trim()"
              lh-30px px-4 cursor-pointer hover:bg="[rgba(255,255,255,.35)]"
              duration-300 color-white flex justify-between
              :style="{ background: searchAll === true ? 'rgba(255,255,255,.35)' : '' }"
              border="1 color-[rgba(255,255,255,.2)]"
              rounded="$bew-radius"

              @click="searchAll = true; handleSearch()"
            >
              {{ t('favorites.search_all_folders') }}
            </button>
          </Transition>

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
              :style="{ background: !searchAll && item.value.id === selectedCategory?.id ? 'rgba(255,255,255,.35)' : '', pointerEvents: isFullPageLoading ? 'none' : 'auto' }"
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

.search-all-enter-active,
.search-all-leave-active {
  --uno: "transition-all duration-300 transform-gpu";
}
.search-all-leave-to,
.search-all-enter-from {
  // mt: gap + lh + 2border 取反
  --uno: "transform mt-[calc(-1rem-30px-2px)] opacity-0";
}
</style>
