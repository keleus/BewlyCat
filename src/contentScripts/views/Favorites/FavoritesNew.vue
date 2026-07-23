<script setup lang="ts">
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import type { FavoriteResource } from '~/components/TopBar/types'
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { TOP_BAR_VISIBILITY_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import type { FavoritesResult, Media as FavoriteItem } from '~/models/video/favorite'
import type { FavoritesCategoryResult, List as CategoryItem } from '~/models/video/favoriteCategory'
import type { CollectedFavoriteSeason, CollectedFavoriteSeasonsResult, FavoriteSeasonMedia } from '~/models/video/favoriteSeason'
import api from '~/utils/api'
import {
  FAVORITE_SEASON_PAGE_SIZE,
  fetchFavoriteSeasonPage,
  mergeFavoriteSeasonPage,
  resolveFavoriteSeasonPlayAllUrl,
} from '~/utils/favoriteSeason'
import { getCSRF, getUserID, openLinkToNewTab, removeHttpFromUrl } from '~/utils/main'
import emitter from '~/utils/mitt'

// 新版收藏页支持收藏夹与订阅合集。
const { t } = useI18n()
const toast = useToast()

type FavoriteCategorySource = 'folder' | 'season'
type BatchTransferAction = 'copy' | 'move'
type ViewCategory = CategoryItem & {
  source: FavoriteCategorySource
  cover?: string
  state?: number
  link?: string
}

const favoriteCategories = reactive<CategoryItem[]>([])
const collectedFavoriteSeasons = reactive<CollectedFavoriteSeason[]>([])
const favoriteResources = reactive<FavoriteItem[]>([])
const categoryOptions = reactive<Array<{ value: ViewCategory, label: string }>>([])

const selectedCategory = ref<ViewCategory>()
const activatedCategoryCover = ref<string>('')
const targetCategory = ref<CategoryItem>()

const shouldMoveCtrlBarUp = ref<boolean>(false)
const currentPageNum = ref<number>(1)
const keyword: Ref<string> = ref<string>('')
const searchScope = ref<'current' | 'all'>('current')
const { handlePageRefresh, handleReachBottom, haveScrollbar } = useBewlyApp()
const isLoading = ref<boolean>(false)
const isFullPageLoading = ref<boolean>(true)
const noMoreContent = ref<boolean>(false)
const isBatchManaging = ref<boolean>(false)
const isBatchOperating = ref<boolean>(false)
const isResolvingSeasonPlayAll = ref<boolean>(false)
/** 当前订阅合集的原始 medias（与列表同套分页语义），供播放全部复用 */
const loadedSeasonMedias = ref<FavoriteSeasonMedia[]>([])
const loadedSeasonComplete = ref(false)
const selectedResourceKeys = ref<string[]>([])
const folderSectionExpanded = ref<boolean>(true)
const seasonSectionExpanded = ref<boolean>(true)
const batchTransferDialogVisible = ref<boolean>(false)
const batchTransferAction = ref<BatchTransferAction>('copy')

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

const targetCategoryOptions = computed(() => {
  return favoriteCategories
    .filter(item => item.id !== selectedCategory.value?.id)
    .map(item => ({
      label: item.title,
      value: item,
    }))
})

const canBatchManage = computed(() => {
  return searchScope.value === 'current' && selectedCategory.value?.source === 'folder'
})

const selectedFavoriteResources = computed(() => {
  const selectedKeys = new Set(selectedResourceKeys.value)
  return favoriteResources.filter(item => selectedKeys.has(getFavoriteResourceKey(item)))
})

const selectedCount = computed(() => selectedFavoriteResources.value.length)

const isAllCurrentPageSelected = computed(() => {
  return favoriteResources.length > 0 && favoriteResources.every(item => selectedResourceKeys.value.includes(getFavoriteResourceKey(item)))
})

const selectedCategoryKey = computed(() => selectedCategory.value ? getCategoryKey(selectedCategory.value) : '')

const selectedCategoryCover = computed(() => activatedCategoryCover.value || selectedCategory.value?.cover || '')

const selectedCategoryCount = computed(() => selectedCategory.value?.media_count ?? 0)

const selectedCategoryTypeLabel = computed(() => selectedCategory.value?.source === 'season' ? t('favorites.collected_season_prefix') : t('favorites.folder_section_title'))

const batchTransferDialogTitle = computed(() => {
  return batchTransferAction.value === 'copy'
    ? t('favorites.batch_copy_dialog_title')
    : t('favorites.batch_move_dialog_title')
})

const batchTransferDialogDesc = computed(() => {
  return batchTransferAction.value === 'copy'
    ? t('favorites.batch_copy_dialog_desc', { count: selectedCount.value })
    : t('favorites.batch_move_dialog_desc', { count: selectedCount.value })
})

const contentTopStyle = computed(() => ({
  marginTop: '12px',
  marginBottom: '1.5rem',
}))

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
  await getCollectedFavoriteSeasons()
  if (categoryOptions.length > 0) {
    changeCategory(categoryOptions[0].value)
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

    // 优化：添加延迟执行提高触发成功率
    setTimeout(() => {
      if (!isLoading.value && !noMoreContent.value) {
        if (searchScope.value === 'all') {
          const firstCategoryId = favoriteCategories.length > 0 ? favoriteCategories[0].id : 0
          getFavoriteResources(firstCategoryId, ++currentPageNum.value, keyword.value, 1)
        }
        else if (selectedCategory.value?.source === 'season') {
          getFavoriteSeasonResources(selectedCategory.value.id, ++currentPageNum.value)
        }
        else {
          getFavoriteResources(selectedCategory.value!.id, ++currentPageNum.value, keyword.value, 0)
        }
      }
    }, 50)
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

function toFolderCategory(item: CategoryItem): ViewCategory {
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
    state: item.state,
    link: item.link,
  }
}

function rebuildCategoryOptions() {
  categoryOptions.length = 0
  favoriteCategories.forEach((item) => {
    categoryOptions.push({
      label: item.title,
      value: toFolderCategory(item),
    })
  })
  collectedFavoriteSeasons.forEach((item) => {
    categoryOptions.push({
      label: `${t('favorites.collected_season_prefix')} ${item.title}`,
      value: toSeasonCategory(item),
    })
  })
}

function resetBatchSelection() {
  selectedResourceKeys.value = []
}

function getCategoryKey(category: ViewCategory) {
  return `${category.source}:${category.id}`
}

function closeBatchManage() {
  isBatchManaging.value = false
  resetBatchSelection()
}

function toggleBatchManage() {
  if (isBatchManaging.value) {
    closeBatchManage()
    return
  }

  if (!canBatchManage.value)
    return

  isBatchManaging.value = true
}

function getFavoriteResourceKey(item: FavoriteResource | FavoriteItem) {
  return `${item.id}:${item.type}`
}

function isSelectedFavoriteResource(item: FavoriteResource | FavoriteItem) {
  return selectedResourceKeys.value.includes(getFavoriteResourceKey(item))
}

function toggleFavoriteResourceSelection(item: FavoriteResource | FavoriteItem) {
  const key = getFavoriteResourceKey(item)
  if (selectedResourceKeys.value.includes(key)) {
    selectedResourceKeys.value = selectedResourceKeys.value.filter(itemKey => itemKey !== key)
  }
  else {
    selectedResourceKeys.value = [...selectedResourceKeys.value, key]
  }
}

function handleFavoriteCardClick(item: FavoriteItem, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  toggleFavoriteResourceSelection(item)
}

function toggleSelectAllCurrentPage() {
  if (isAllCurrentPageSelected.value) {
    resetBatchSelection()
    return
  }

  selectedResourceKeys.value = favoriteResources.map(item => getFavoriteResourceKey(item))
}

function getSelectedResourceParam() {
  return selectedFavoriteResources.value.map(item => getFavoriteResourceKey(item)).join(',')
}

function removeSelectedResourcesFromList() {
  const selectedKeys = new Set(selectedResourceKeys.value)
  for (let i = favoriteResources.length - 1; i >= 0; i--) {
    if (selectedKeys.has(getFavoriteResourceKey(favoriteResources[i])))
      favoriteResources.splice(i, 1)
  }
  if (selectedCategory.value) {
    selectedCategory.value.media_count = Math.max(0, selectedCategory.value.media_count - selectedKeys.size)
    const category = favoriteCategories.find(item => item.id === selectedCategory.value?.id)
    if (category)
      category.media_count = Math.max(0, category.media_count - selectedKeys.size)
  }
  resetBatchSelection()
}

function closeBatchTransferDialog() {
  batchTransferDialogVisible.value = false
}

function increaseTargetCategoryCount(count: number) {
  if (!targetCategory.value)
    return

  const category = favoriteCategories.find(item => item.id === targetCategory.value?.id)
  if (category)
    category.media_count += count
}

function openBatchTransferDialog(action: BatchTransferAction) {
  if (selectedCount.value === 0 || targetCategoryOptions.value.length === 0 || isBatchOperating.value)
    return

  batchTransferAction.value = action
  if (!targetCategory.value || targetCategory.value.id === selectedCategory.value?.id)
    targetCategory.value = targetCategoryOptions.value[0]?.value
  batchTransferDialogVisible.value = true
}

async function getFavoriteCategories() {
  await api.favorite.getFavoriteCategories({
    up_mid: getUserID(),
  })
    .then((res: FavoritesCategoryResult) => {
      if (res.code === 0) {
        Object.assign(favoriteCategories, res.data.list)
        rebuildCategoryOptions()
      }
    })
}

async function getCollectedFavoriteSeasons() {
  await api.favorite.getCollectedFavoriteSeasons({
    up_mid: getUserID(),
  })
    .then((res: CollectedFavoriteSeasonsResult) => {
      if (res.code === 0) {
        Object.assign(collectedFavoriteSeasons, res.data.list)
        rebuildCategoryOptions()
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
        favoriteResources.push(...res.data.medias.filter((m: any) => m != null))

      if (!res.data.medias)
        noMoreContent.value = true

      // ✅ 修复：添加 await，因为 haveScrollbar() 是异步函数
      if (!(await haveScrollbar()) && !noMoreContent.value) {
        if (searchScope.value === 'all') {
          const firstCategoryId = favoriteCategories.length > 0 ? favoriteCategories[0].id : 0
          await getFavoriteResources(firstCategoryId, ++currentPageNum.value, keyword, 1)
        }
        else if (selectedCategory.value?.source === 'season') {
          await getFavoriteSeasonResources(selectedCategory.value.id, ++currentPageNum.value)
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

async function getFavoriteSeasonResources(
  season_id: number,
  pn: number,
) {
  if (pn === 1) {
    isFullPageLoading.value = true
    loadedSeasonMedias.value = []
    loadedSeasonComplete.value = false
  }
  isLoading.value = true
  try {
    const page = await fetchFavoriteSeasonPage(season_id, pn, FAVORITE_SEASON_PAGE_SIZE)
    if (!page.ok) {
      noMoreContent.value = true
      loadedSeasonComplete.value = false
      return
    }

    activatedCategoryCover.value = page.cover || selectedCategory.value?.cover || ''

    const merged = mergeFavoriteSeasonPage({
      pn,
      pageMedias: page.pageMedias,
      mediaCount: page.mediaCount,
      previousMedias: loadedSeasonMedias.value,
      pageSize: FAVORITE_SEASON_PAGE_SIZE,
    })

    loadedSeasonMedias.value = merged.medias
    loadedSeasonComplete.value = !merged.hasMore
    noMoreContent.value = !merged.hasMore

    favoriteResources.length = 0
    favoriteResources.push(...merged.medias.map(normalizeSeasonMedia))

    if (!(await haveScrollbar()) && merged.hasMore) {
      currentPageNum.value = pn + 1
      await getFavoriteSeasonResources(season_id, currentPageNum.value)
    }
  }
  finally {
    isLoading.value = false
    isFullPageLoading.value = false
  }
}

function normalizeSeasonMedia(item: FavoriteSeasonMedia): FavoriteItem {
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
    attr: 0,
    cnt_info: {
      ...item.cnt_info,
      play_switch: 0,
      reply: 0,
      view_text_1: '',
    },
    link: item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : '',
    ctime: item.pubtime,
    pubtime: item.pubtime,
    fav_time: item.pubtime,
    bv_id: item.bvid,
    bvid: item.bvid,
    season: null,
    ogv: null,
    ugc: {
      first_cid: 0,
    },
  }
}

async function changeCategory(categoryItem: ViewCategory) {
  if (isLoading.value)
    return
  closeBatchManage()
  currentPageNum.value = 1
  selectedCategory.value = categoryItem
  if (targetCategory.value?.id === categoryItem.id)
    targetCategory.value = undefined
  favoriteResources.length = 0
  loadedSeasonMedias.value = []
  loadedSeasonComplete.value = false
  noMoreContent.value = false

  // 切换收藏夹时，如果是搜索当前收藏夹模式，则立即加载数据
  if (searchScope.value === 'current') {
    activatedCategoryCover.value = categoryItem.source === 'season' ? categoryItem.cover || '' : ''
    if (categoryItem.source === 'season')
      getFavoriteSeasonResources(categoryItem.id, 1)
    else
      getFavoriteResources(categoryItem.id, 1, keyword.value, 0)
  }
  else {
    // 全局搜索模式下，清空封面但不立即搜索
    activatedCategoryCover.value = ''
  }
}

function handleSearch() {
  resetBatchSelection()

  if (selectedCategory.value?.source === 'season' && searchScope.value === 'current') {
    currentPageNum.value = 1
    favoriteResources.length = 0
    noMoreContent.value = false
    getFavoriteSeasonResources(selectedCategory.value.id, currentPageNum.value)
    return
  }

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
  closeBatchManage()

  // 切换搜索范围时，不清空当前结果，保持用户体验的连续性
  // 只重置分页状态，等待用户主动搜索时再更新结果
  currentPageNum.value = 1
  noMoreContent.value = false

  // 如果切换回当前收藏夹模式，且当前没有封面，则重新加载以获取封面
  if (searchScope.value === 'current' && selectedCategory.value && !activatedCategoryCover.value) {
    if (selectedCategory.value.source === 'season')
      getFavoriteSeasonResources(selectedCategory.value.id, 1)
    else
      getFavoriteResources(selectedCategory.value.id, 1, keyword.value, 0)
  }
}

async function handlePlayAll() {
  if (searchScope.value === 'all') {
    return
  }
  if (!selectedCategory.value || isResolvingSeasonPlayAll.value)
    return

  if (selectedCategory.value.source === 'season') {
    isResolvingSeasonPlayAll.value = true
    try {
      const result = await resolveFavoriteSeasonPlayAllUrl({
        seasonId: selectedCategory.value.id,
        link: selectedCategory.value.link,
        mode: settings.value.collectedSeasonPlayAllMode,
        preloaded: {
          medias: loadedSeasonMedias.value,
          complete: loadedSeasonComplete.value,
          expectedCount: selectedCategory.value.media_count,
        },
      })
      if (result.usedFallback && result.reason !== 'beginning')
        toast.warning(t('favorites.season_play_all_fallback'))
      openLinkToNewTab(result.url)
    }
    finally {
      isResolvingSeasonPlayAll.value = false
    }
    return
  }

  openLinkToNewTab(`https://www.bilibili.com/list/ml${selectedCategory.value.id}`)
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

function handleUnfavorite(favoriteResource: FavoriteResource) {
  if (selectedCategory.value?.source === 'season')
    return

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

async function handleBatchDelete() {
  if (!selectedCategory.value || selectedCount.value === 0)
    return

  const result = confirm(t('favorites.batch_unfavorite_confirm', { count: selectedCount.value }))
  if (!result)
    return

  isBatchOperating.value = true
  try {
    const res = await api.favorite.patchDelFavoriteResources({
      resources: getSelectedResourceParam(),
      media_id: selectedCategory.value.id,
      csrf: getCSRF(),
    })
    if (res.code === 0)
      removeSelectedResourcesFromList()
  }
  finally {
    isBatchOperating.value = false
  }
}

async function handleBatchMove() {
  if (!selectedCategory.value || !targetCategory.value || selectedCount.value === 0)
    return

  isBatchOperating.value = true
  try {
    const movedCount = selectedCount.value
    const res = await api.favorite.moveFavoriteResources({
      resources: getSelectedResourceParam(),
      src_media_id: selectedCategory.value.id,
      tar_media_id: targetCategory.value.id,
      mid: getUserID(),
      csrf: getCSRF(),
    })
    if (res.code === 0) {
      increaseTargetCategoryCount(movedCount)
      removeSelectedResourcesFromList()
      closeBatchManage()
      closeBatchTransferDialog()
    }
  }
  finally {
    isBatchOperating.value = false
  }
}

async function handleBatchCopy() {
  if (!selectedCategory.value || !targetCategory.value || selectedCount.value === 0)
    return

  isBatchOperating.value = true
  try {
    const copiedCount = selectedCount.value
    const res = await api.favorite.copyFavoriteResources({
      resources: getSelectedResourceParam(),
      src_media_id: selectedCategory.value.id,
      tar_media_id: targetCategory.value.id,
      mid: getUserID(),
      csrf: getCSRF(),
    })
    if (res.code === 0) {
      increaseTargetCategoryCount(copiedCount)
      resetBatchSelection()
      closeBatchTransferDialog()
    }
  }
  finally {
    isBatchOperating.value = false
  }
}

async function handleBatchTransferConfirm() {
  if (!targetCategory.value)
    return

  if (batchTransferAction.value === 'copy')
    await handleBatchCopy()
  else
    await handleBatchMove()
}

function selectTargetCategory(category: CategoryItem) {
  targetCategory.value = category
}

function isMusic(item: FavoriteResource) {
  return item.link.includes('bilibili://music')
}

// Transform function for VideoCardGrid
function transformFavoriteItem(item: FavoriteItem): Video {
  return {
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
    threePointV2: [],
  }
}
</script>

<template>
  <div v-if="getCSRF()" class="favorites-page">
    <aside class="favorites-sidebar">
      <nav class="favorites-nav-panel">
        <section class="favorites-nav-section" :class="{ collapsed: !folderSectionExpanded }">
          <button
            class="nav-section-header"
            :aria-expanded="folderSectionExpanded"
            @click="folderSectionExpanded = !folderSectionExpanded"
          >
            <span>{{ t('favorites.folder_section_title') }}</span>
            <span class="nav-section-count">{{ favoriteCategories.length }}</span>
            <span class="nav-section-arrow" :class="{ collapsed: !folderSectionExpanded }" i-tabler:chevron-up />
          </button>

          <ul v-show="folderSectionExpanded" class="category-list">
            <li v-for="item in favoriteCategories" :key="`folder:${item.id}`">
              <button
                class="category-nav-item"
                :class="{ active: selectedCategoryKey === `folder:${item.id}` }"
                :disabled="isFullPageLoading"
                @click="changeCategory(toFolderCategory(item))"
              >
                <span class="category-icon" i-tabler:folder />
                <span class="category-title">{{ item.title }}</span>
                <span class="category-count">{{ item.media_count }}</span>
              </button>
            </li>
          </ul>
        </section>

        <section class="favorites-nav-section" :class="{ collapsed: !seasonSectionExpanded }">
          <button
            class="nav-section-header"
            :aria-expanded="seasonSectionExpanded"
            @click="seasonSectionExpanded = !seasonSectionExpanded"
          >
            <span>{{ t('favorites.season_section_title') }}</span>
            <span class="nav-section-count">{{ collectedFavoriteSeasons.length }}</span>
            <span class="nav-section-arrow" :class="{ collapsed: !seasonSectionExpanded }" i-tabler:chevron-up />
          </button>

          <ul v-show="seasonSectionExpanded" class="category-list">
            <li v-for="item in collectedFavoriteSeasons" :key="`season:${item.id}`">
              <button
                class="category-nav-item"
                :class="{ active: selectedCategoryKey === `season:${item.id}` }"
                :disabled="isFullPageLoading"
                @click="changeCategory(toSeasonCategory(item))"
              >
                <span class="category-icon" i-tabler:stack-2 />
                <span class="category-title">{{ item.title }}</span>
                <span class="category-count">{{ item.media_count }}</span>
              </button>
            </li>
          </ul>
        </section>
      </nav>
    </aside>

    <main class="favorites-main">
      <section class="favorites-hero">
        <picture class="favorites-cover">
          <img
            v-if="selectedCategoryCover"
            :src="removeHttpFromUrl(`${selectedCategoryCover}@480w_270h_1c`)"
            :alt="selectedCategory?.title"
          >
          <span v-else i-tabler:folder-star />
        </picture>

        <div class="favorites-hero-content">
          <div>
            <h2>{{ selectedCategory?.title }}</h2>
            <p>
              <span>{{ selectedCategoryTypeLabel }}</span>
              <span>{{ t('favorites.video_count', { count: selectedCategoryCount }) }}</span>
            </p>
          </div>

          <div class="favorites-hero-actions">
            <Button
              type="primary"
              :disabled="searchScope === 'all' || !selectedCategory || isResolvingSeasonPlayAll"
              @click="handlePlayAll"
            >
              <template #left>
                <div i-tabler:player-play-filled />
              </template>
              {{ t('common.play_all') }}
            </Button>
          </div>
        </div>
      </section>

      <div class="favorites-toolbar" :class="{ hide: shouldMoveCtrlBarUp }">
        <div class="toolbar-row">
          <div class="toolbar-search-group">
            <Select v-model="searchScope" w-120px :options="searchScopeOptions" @change="handleSearchScopeChange" />
            <Input
              v-model="keyword"
              class="favorites-search-input"
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

          <div class="toolbar-action-group">
            <Button
              :type="isBatchManaging ? 'tertiary' : 'secondary'"
              :disabled="!canBatchManage || isBatchOperating"
              @click="toggleBatchManage"
            >
              <template #left>
                <div :class="isBatchManaging ? 'i-tabler:x' : 'i-tabler:list-check'" />
              </template>
              {{ isBatchManaging ? t('common.operation.cancel') : t('favorites.batch_manage') }}
            </Button>

            <template v-if="isBatchManaging">
              <Button
                type="secondary"
                :disabled="favoriteResources.length === 0 || isBatchOperating"
                @click="toggleSelectAllCurrentPage"
              >
                <template #left>
                  <div :class="isAllCurrentPageSelected ? 'i-tabler:checkbox' : 'i-tabler:square'" />
                </template>
                {{ isAllCurrentPageSelected ? t('favorites.batch_unselect_all') : t('favorites.batch_select_all') }}
              </Button>
              <span class="batch-selected-count">
                {{ t('favorites.batch_selected_count', { count: selectedCount }) }}
              </span>
              <Button
                type="secondary"
                :disabled="selectedCount === 0 || targetCategoryOptions.length === 0 || isBatchOperating"
                @click="openBatchTransferDialog('copy')"
              >
                <template #left>
                  <div i-tabler:copy />
                </template>
                {{ t('favorites.batch_copy') }}
              </Button>
              <Button
                type="secondary"
                :disabled="selectedCount === 0 || targetCategoryOptions.length === 0 || isBatchOperating"
                @click="openBatchTransferDialog('move')"
              >
                <template #left>
                  <div i-tabler:folder-symlink />
                </template>
                {{ t('favorites.batch_move') }}
              </Button>
              <Button
                type="error"
                :disabled="selectedCount === 0 || isBatchOperating"
                @click="handleBatchDelete"
              >
                <template #left>
                  <div i-tabler:trash />
                </template>
                {{ t('favorites.batch_unfavorite') }}
              </Button>
            </template>
          </div>
        </div>
      </div>

      <Empty
        v-if="searchScope === 'all' && !keyword.trim() && favoriteResources.length === 0 && !isLoading"
        :style="contentTopStyle"
        :description="t('favorites.global_search_hint')"
      />

      <VideoCardGrid
        v-else
        :style="contentTopStyle"
        :items="favoriteResources"
        :transform-item="transformFavoriteItem"
        :get-item-key="(item) => item.id"
        grid-layout="adaptive"
        :loading="isLoading || isFullPageLoading"
        :no-more-content="noMoreContent"
        :empty-description="$t('common.no_more_content')"
        :more-btn="!isBatchManaging"
        :hide-author="searchScope === 'current' && selectedCategory?.source === 'season'"
        :card-click-handler="isBatchManaging ? handleFavoriteCardClick : undefined"
        :cover-top-left-always-visible="isBatchManaging"
        enable-row-padding
        @refresh="() => handlePageRefresh?.()"
      >
        <template v-if="searchScope !== 'current' || selectedCategory?.source !== 'season'" #coverTopLeft="{ item }">
          <button
            v-if="isBatchManaging"
            class="favorite-card-action"
            :class="{ selected: isSelectedFavoriteResource(item) }"
            @click.prevent.stop="toggleFavoriteResourceSelection(item)"
          >
            <Tooltip :content="$t('favorites.batch_select_item')" placement="bottom-left" type="dark">
              <div :class="isSelectedFavoriteResource(item) ? 'i-tabler:checkbox' : 'i-tabler:square'" />
            </Tooltip>
          </button>
          <button
            v-else
            class="favorite-card-action danger"
            @click.prevent.stop="handleUnfavorite(item)"
          >
            <Tooltip :content="$t('favorites.unfavorite')" placement="bottom-left" type="dark">
              <div i-ic-baseline-clear />
            </Tooltip>
          </button>
        </template>
      </VideoCardGrid>

      <Dialog
        v-if="batchTransferDialogVisible"
        :title="batchTransferDialogTitle"
        :desc="batchTransferDialogDesc"
        width="420px"
        content-max-height="420px"
        append-to-bewly-body
        :loading="isBatchOperating"
        @close="closeBatchTransferDialog"
        @confirm="handleBatchTransferConfirm"
      >
        <div class="batch-transfer-dialog">
          <button
            v-for="option in targetCategoryOptions"
            :key="option.value.id"
            class="batch-target-folder"
            :class="{ active: targetCategory?.id === option.value.id }"
            @click="selectTargetCategory(option.value)"
          >
            <span class="batch-target-folder-icon" i-tabler:folder />
            <span class="batch-target-folder-title">{{ option.label }}</span>
            <span class="batch-target-folder-count">{{ option.value.media_count }}</span>
            <span v-if="targetCategory?.id === option.value.id" class="batch-target-folder-check" i-tabler:check />
          </button>
        </div>
      </Dialog>
    </main>
  </div>
  <Empty v-else mt-6 :description="t('common.please_log_in_first')">
    <Button type="primary" @click="jumpToLoginPage()">
      {{ $t('common.login') }}
    </Button>
  </Empty>
</template>

<style lang="scss" scoped>
.favorites-page {
  display: grid;
  grid-template-columns: minmax(200px, 244px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.favorites-sidebar {
  position: sticky;
  top: 104px;
  height: calc(100vh - 128px);
  max-height: calc(100vh - 128px);
  overflow: hidden;
}

.favorites-nav-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 0;
  overflow: overlay;
}

.favorites-nav-section {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--bew-border-color);
}

.favorites-nav-section.collapsed {
  flex: 0 0 auto;
}

.favorites-nav-section:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.nav-section-header,
.category-nav-item {
  width: 100%;
  border: 0;
  color: var(--bew-text-1);
  background: transparent;
  font: inherit;
}

.nav-section-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  min-height: 38px;
  padding: 0 8px 8px;
  font-size: 16px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.nav-section-count {
  color: var(--bew-text-3);
  font-size: 13px;
  font-weight: 600;
}

.nav-section-arrow {
  width: 18px;
  height: 18px;
  color: var(--bew-text-2);
  transition: transform 180ms ease;
}

.nav-section-arrow.collapsed {
  transform: rotate(180deg);
}

.category-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  margin: 0;
  padding: 0 6px 0 0;
  overflow: overlay;
  list-style: none;
}

.category-nav-item {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 38px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--bew-text-2);
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.category-nav-item:hover:not(:disabled) {
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
}

.category-nav-item.active {
  color: #fff;
  background: var(--bew-theme-color);
}

.category-nav-item:disabled {
  cursor: default;
  opacity: 0.56;
}

.category-icon {
  width: 19px;
  height: 19px;
  color: currentcolor;
}

.category-title {
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-count {
  color: currentcolor;
  font-size: 13px;
  opacity: 0.68;
}

.favorites-main {
  min-width: 0;
  min-height: 100vh;
  padding-top: 14px;
}

.favorites-hero {
  display: grid;
  grid-template-columns: minmax(132px, 200px) minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  min-height: 126px;
  padding: 0 0 18px;
  border-bottom: 1px solid var(--bew-border-color);
}

.favorites-cover {
  display: grid;
  place-items: center;
  width: 100%;
  overflow: hidden;
  color: var(--bew-text-3);
  background: var(--bew-fill-2);
  border-radius: 8px;
  aspect-ratio: 16 / 9;
}

.favorites-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.favorites-cover span {
  width: 34px;
  height: 34px;
}

.favorites-hero-content {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  justify-content: space-between;
  min-width: 0;
}

.favorites-hero h2 {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.favorites-hero p {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin: 6px 0 0;
  color: var(--bew-text-3);
  font-size: 13px;
}

.favorites-hero-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 2px;
}

.favorites-toolbar {
  position: sticky;
  top: 84px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding: 0 0 2px;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  transition: transform 260ms ease;
}

.hide {
  transform: translateY(-74px);
}

.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
  justify-content: space-between;
}

.toolbar-search-group {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
}

.toolbar-action-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  flex: 0 0 auto;
}

.favorites-search-input {
  width: min(260px, 100%);
  max-width: 100%;
}

.batch-selected-count {
  color: var(--bew-text-2);
  font-size: 13px;
  white-space: nowrap;
}

.batch-transfer-dialog {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  padding: 2px 0 8px;
}

.batch-target-folder {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto 20px;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 46px;
  padding: 0 14px;
  color: var(--bew-text-1);
  text-align: left;
  background: var(--bew-fill-1);
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.batch-target-folder:hover {
  background: var(--bew-fill-2);
}

.batch-target-folder.active {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
  border-color: var(--bew-theme-color);
}

.batch-target-folder-icon,
.batch-target-folder-check {
  width: 18px;
  height: 18px;
}

.batch-target-folder-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-target-folder-count {
  color: var(--bew-text-3);
  font-size: 13px;
}

.favorite-card-action {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 30px;
  margin: 4px;
  padding: 0 8px;
  color: #fff;
  background: rgba(0, 0, 0, 0.62);
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 160ms ease;
}

.favorite-card-action:hover,
.favorite-card-action.selected {
  background: var(--bew-theme-color);
}

.favorite-card-action.danger:hover {
  background: var(--bew-error-color);
}

.favorites-nav-panel,
.category-list,
.batch-toolbar {
  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--bew-fill-4);
    border-radius: 20px;
  }

  &::-webkit-scrollbar-corner {
    background: transparent;
  }
}

@media (max-width: 900px) {
  .favorites-page {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .favorites-sidebar {
    position: static;
    height: auto;
    max-height: none;
  }

  .favorites-nav-panel {
    max-height: 320px;
    padding: 0;
  }

  .favorites-hero {
    grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
  }

  .favorites-main {
    padding-top: 0;
  }

  .favorites-hero-content {
    flex-direction: column;
  }

  .favorites-hero-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 560px) {
  .favorites-hero {
    grid-template-columns: 1fr;
  }

  .toolbar-row {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-search-group,
  .toolbar-action-group {
    flex-wrap: wrap;
  }

  .favorites-search-input {
    flex: 1 1 180px;
  }
}
</style>
