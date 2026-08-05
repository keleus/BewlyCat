<script setup lang="ts">
import type { CSSProperties, Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import ArticleCard from '~/components/ArticleCard/ArticleCard.vue'
import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import type { FavoriteResource } from '~/components/TopBar/types'
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { settings } from '~/logic'
import type { FavoriteArticle, FavoriteArticlesResult } from '~/models/article/favorite'
import type { FavoritesResult, Media as FavoriteItem } from '~/models/video/favorite'
import type { FavoritesCategoryResult, List as CategoryItem } from '~/models/video/favoriteCategory'
import type { CollectedFavoriteSeason, CollectedFavoriteSeasonsResult, FavoriteSeasonMedia } from '~/models/video/favoriteSeason'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import {
  enrichFavoriteSeasonMediaFaces,
  FAVORITE_SEASON_PAGE_SIZE,
  fetchFavoriteSeasonPage,
  mergeFavoriteSeasonPage,
  resolveFavoriteSeasonPlayAllUrl,
} from '~/utils/favoriteSeason'
import { getCSRF, getUserID, openLinkToNewTab, removeHttpFromUrl } from '~/utils/main'

const { t } = useI18n()
const toast = useToast()
const { confirm: showConfirmDialog } = useConfirmDialog()

const FAVORITE_ARTICLE_PAGE_SIZE = 20
type FavoriteView = 'video' | 'season' | 'article'
type BatchTransferAction = 'copy' | 'move'
type SidebarManageSection = 'folder' | 'season'

const favoriteCategories = reactive<CategoryItem[]>([])
const collectedFavoriteSeasons = reactive<CollectedFavoriteSeason[]>([])
const favoriteResources = reactive<FavoriteItem[]>([])
const favoriteArticles = reactive<FavoriteArticle[]>([])

const favoriteView = ref<FavoriteView>('video')
const selectedCategory = ref<CategoryItem>()
const selectedSeason = ref<CollectedFavoriteSeason>()
const activatedCategoryCover = ref<string>('')

const currentPageNum = ref<number>(1)
const keyword: Ref<string> = ref<string>('')
const searchScope = ref<'current' | 'all'>('current')
const { handlePageRefresh, handleReachBottom, haveScrollbar } = useBewlyApp()
const topBarStore = useTopBarStore()
const isLoading = ref<boolean>(false)
const isFullPageLoading = ref<boolean>(true)
const noMoreContent = ref<boolean>(false)
const loadedSeasonMedias = ref<FavoriteSeasonMedia[]>([])
const loadedSeasonComplete = ref<boolean>(false)
const isResolvingSeasonPlayAll = ref<boolean>(false)
/** 图文收藏总数：官方 polymer 接口无 total，仅在 has_more=false 时等于已加载条数 */
const articleFavoriteCount = ref<number>()
/** 图文收藏下一页 offset（上页最后一条 opus_id） */
const articleFavoriteOffset = ref<string>('')
const isBatchManaging = ref<boolean>(false)
const isBatchOperating = ref<boolean>(false)
const selectedResourceKeys = ref<string[]>([])
const targetCategory = ref<CategoryItem>()
const batchTransferDialogVisible = ref<boolean>(false)
const batchTransferAction = ref<BatchTransferAction>('copy')
const sidebarManageSection = ref<SidebarManageSection | null>(null)
const selectedFolderIds = ref<number[]>([])
const selectedSeasonIds = ref<number[]>([])
const isSidebarOperating = ref<boolean>(false)
const renameDialogVisible = ref<boolean>(false)
const renameFolderId = ref<number>()
const renameFolderTitle = ref<string>('')
const itemMenuTarget = ref<{ type: SidebarManageSection, id: number } | null>(null)
const itemMenuStyles = ref<CSSProperties>({})
let contentRequestVersion = 0

function notifyTopBarFavoritesChanged() {
  void topBarStore.notifyFavoritesChanged().catch((error) => {
    console.error('通知顶栏收藏状态变化失败:', error)
  })
}

const favoriteViewOptions = computed(() => [
  { label: t('favorites.video_section_title'), value: 'video' as const },
  { label: t('favorites.season_section_title'), value: 'season' as const },
  { label: t('favorites.article_section_title'), value: 'article' as const },
])

const selectedContentTitle = computed(() => {
  if (favoriteView.value === 'season')
    return selectedSeason.value?.title || t('favorites.season_section_title')
  if (favoriteView.value === 'article')
    return t('favorites.article_section_title')
  return selectedCategory.value?.title || t('favorites.video_section_title')
})

const selectedContentCount = computed(() => {
  if (favoriteView.value === 'season')
    return selectedSeason.value?.media_count ?? 0
  if (favoriteView.value === 'article')
    return articleFavoriteCount.value ?? favoriteArticles.length
  return selectedCategory.value?.media_count ?? 0
})

const selectedContentCover = computed(() => {
  if (activatedCategoryCover.value)
    return activatedCategoryCover.value
  if (favoriteView.value === 'season')
    return selectedSeason.value?.cover || ''
  if (favoriteView.value === 'article' && favoriteArticles[0])
    return getFavoriteArticleCover(favoriteArticles[0])
  return ''
})

const canBatchManage = computed(() => {
  return favoriteView.value === 'video'
    && searchScope.value === 'current'
    && Boolean(selectedCategory.value)
})

const selectedFavoriteResources = computed(() => {
  const selectedKeys = new Set(selectedResourceKeys.value)
  return favoriteResources.filter(item => selectedKeys.has(getFavoriteResourceKey(item)))
})

const selectedCount = computed(() => selectedFavoriteResources.value.length)

const isAllCurrentPageSelected = computed(() => {
  return favoriteResources.length > 0
    && favoriteResources.every(item => selectedResourceKeys.value.includes(getFavoriteResourceKey(item)))
})

const targetCategoryOptions = computed(() => {
  return favoriteCategories
    .filter(item => item.id !== selectedCategory.value?.id)
    .map(item => ({ label: item.title, value: item }))
})

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

const defaultFolderId = computed(() => favoriteCategories[0]?.id)
const editableFolderIds = computed(() => favoriteCategories.filter(item => item.id !== defaultFolderId.value).map(item => item.id))
const selectedFolderCount = computed(() => selectedFolderIds.value.length)
const selectedSeasonCount = computed(() => selectedSeasonIds.value.length)
const isManagingFolder = computed(() => sidebarManageSection.value === 'folder')
const isManagingSeason = computed(() => sidebarManageSection.value === 'season')
const canRenameSelectedFolder = computed(() => selectedFolderIds.value.length === 1)
const isAllFoldersSelected = computed(() => {
  return editableFolderIds.value.length > 0
    && editableFolderIds.value.every(id => selectedFolderIds.value.includes(id))
})
const isAllSeasonsSelected = computed(() => {
  return collectedFavoriteSeasons.length > 0
    && collectedFavoriteSeasons.every(item => selectedSeasonIds.value.includes(item.id))
})
const itemMenuOptions = computed((): ContextMenuOption[] => {
  if (!itemMenuTarget.value)
    return []

  if (itemMenuTarget.value.type === 'folder') {
    return [
      { value: 'rename', label: t('favorites.rename_folder'), icon: 'i-tabler:edit' },
      { value: 'delete', label: t('common.operation.delete'), icon: 'i-tabler:trash', danger: true },
    ]
  }

  return [{ value: 'unfav', label: t('favorites.unfavorite'), icon: 'i-tabler:star-off', danger: true }]
})

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
  initPageAction()
  initData()
})

async function initData() {
  await Promise.all([
    getFavoriteCategories(),
    getCollectedFavoriteSeasons(),
  ])

  if (favoriteCategories.length > 0) {
    selectedCategory.value = favoriteCategories[0]
    loadSelectedContent()
  }
  else {
    isFullPageLoading.value = false
    noMoreContent.value = true
  }
}

function initPageAction() {
  handleReachBottom.value = async () => {
    // 视频/合集列表由 VideoCardGrid 自己监听 sentinel；全局哨兵只负责图文收藏。
    if (favoriteView.value !== 'article')
      return

    if (isLoading.value || noMoreContent.value)
      return

    setTimeout(() => {
      if (!isLoading.value && !noMoreContent.value)
        loadNextPage()
    }, 50)
  }

  handlePageRefresh.value = () => {
    if (isLoading.value)
      return

    loadSelectedContent()
  }
}

async function getFavoriteCategories() {
  const res: FavoritesCategoryResult = await api.favorite.getFavoriteCategories({
    up_mid: getUserID(),
  })
  if (res.code === 0)
    favoriteCategories.push(...res.data.list)
}

async function getCollectedFavoriteSeasons() {
  const res: CollectedFavoriteSeasonsResult = await api.favorite.getCollectedFavoriteSeasons({
    up_mid: getUserID(),
  })
  if (res.code === 0)
    collectedFavoriteSeasons.push(...res.data.list)
}

function resetBatchSelection() {
  selectedResourceKeys.value = []
}

function closeBatchTransferDialog() {
  batchTransferDialogVisible.value = false
}

function closeBatchManage() {
  isBatchManaging.value = false
  resetBatchSelection()
  closeBatchTransferDialog()
}

function exitSidebarManage() {
  sidebarManageSection.value = null
  selectedFolderIds.value = []
  selectedSeasonIds.value = []
}

function toggleSidebarManage(section: SidebarManageSection) {
  closeItemMenu()
  if (sidebarManageSection.value === section) {
    exitSidebarManage()
    return
  }

  closeBatchManage()
  exitSidebarManage()
  sidebarManageSection.value = section
}

function toggleCurrentSidebarManage() {
  if (favoriteView.value === 'video')
    toggleSidebarManage('folder')
  else if (favoriteView.value === 'season')
    toggleSidebarManage('season')
}

function toggleFolderSelection(item: CategoryItem) {
  if (item.id === defaultFolderId.value)
    return

  if (selectedFolderIds.value.includes(item.id))
    selectedFolderIds.value = selectedFolderIds.value.filter(id => id !== item.id)
  else
    selectedFolderIds.value = [...selectedFolderIds.value, item.id]
}

function toggleSeasonSelection(item: CollectedFavoriteSeason) {
  if (selectedSeasonIds.value.includes(item.id))
    selectedSeasonIds.value = selectedSeasonIds.value.filter(id => id !== item.id)
  else
    selectedSeasonIds.value = [...selectedSeasonIds.value, item.id]
}

function handleCategoryItemClick(item: CategoryItem) {
  if (isManagingFolder.value) {
    toggleFolderSelection(item)
    return
  }
  changeCategory(item)
}

function handleSeasonItemClick(item: CollectedFavoriteSeason) {
  if (isManagingSeason.value) {
    toggleSeasonSelection(item)
    return
  }
  changeSeason(item)
}

function toggleSelectAllFolders() {
  selectedFolderIds.value = isAllFoldersSelected.value ? [] : [...editableFolderIds.value]
}

function toggleSelectAllSeasons() {
  selectedSeasonIds.value = isAllSeasonsSelected.value ? [] : collectedFavoriteSeasons.map(item => item.id)
}

function openRenameFolderDialog() {
  if (!canRenameSelectedFolder.value || isSidebarOperating.value)
    return

  openSingleRenameFolder(selectedFolderIds.value[0])
}

function openSingleRenameFolder(folderId: number) {
  const folder = favoriteCategories.find(item => item.id === folderId)
  if (!folder)
    return

  renameFolderId.value = folder.id
  renameFolderTitle.value = folder.title
  renameDialogVisible.value = true
}

function openItemMenu(type: SidebarManageSection, id: number, event: MouseEvent) {
  itemMenuTarget.value = { type, id }

  const menuHeight = itemMenuOptions.value.length * 36 + 12
  const bottomSpace = window.innerHeight - event.y
  const offsetTop = bottomSpace > menuHeight + 10 ? 0 : -menuHeight - 8
  itemMenuStyles.value = {
    position: 'absolute',
    top: 0,
    left: 0,
    transform: `translate(${event.x}px, ${event.y + offsetTop}px)`,
  }
}

function closeItemMenu() {
  itemMenuTarget.value = null
}

function closeRenameFolderDialog() {
  renameDialogVisible.value = false
}

async function handleRenameFolderConfirm() {
  const title = renameFolderTitle.value.trim()
  if (!title) {
    toast.warning(t('favorites.rename_folder_empty'))
    return
  }

  const folderId = renameFolderId.value
  if (!folderId)
    return

  isSidebarOperating.value = true
  try {
    const res = await api.favorite.editFavoriteFolder({
      media_id: folderId,
      title,
      csrf: getCSRF(),
    })
    if (res.code !== 0) {
      toast.error(res.message)
      return
    }

    const folder = favoriteCategories.find(item => item.id === folderId)
    if (folder)
      folder.title = title
    closeRenameFolderDialog()
    exitSidebarManage()
    notifyTopBarFavoritesChanged()
  }
  finally {
    isSidebarOperating.value = false
  }
}

async function deleteFolders(ids: number[]) {
  try {
    const res = await api.favorite.delFavoriteFolder({
      media_ids: ids.join(','),
      csrf: getCSRF(),
    })
    if (res.code !== 0) {
      toast.error(res.message || t('favorites.delete_folders_failed'))
      return false
    }
  }
  catch {
    toast.error(t('favorites.delete_folders_failed'))
    return false
  }

  for (let index = favoriteCategories.length - 1; index >= 0; index--) {
    if (ids.includes(favoriteCategories[index].id))
      favoriteCategories.splice(index, 1)
  }

  if (selectedCategory.value && ids.includes(selectedCategory.value.id)) {
    selectedCategory.value = favoriteCategories[0]
    if (favoriteView.value === 'video')
      loadSelectedContent()
  }
  notifyTopBarFavoritesChanged()
  return true
}

async function unfavSeasons(ids: number[]) {
  const failedIds: number[] = []
  for (const seasonId of ids) {
    try {
      const res = await api.favorite.unfavFavoriteSeason({
        season_id: seasonId,
        csrf: getCSRF(),
      })
      if (res.code !== 0)
        failedIds.push(seasonId)
    }
    catch {
      failedIds.push(seasonId)
    }
  }

  const removedIds = ids.filter(id => !failedIds.includes(id))
  for (let index = collectedFavoriteSeasons.length - 1; index >= 0; index--) {
    if (removedIds.includes(collectedFavoriteSeasons[index].id))
      collectedFavoriteSeasons.splice(index, 1)
  }

  if (selectedSeason.value && removedIds.includes(selectedSeason.value.id)) {
    selectedSeason.value = collectedFavoriteSeasons[0]
    if (favoriteView.value === 'season')
      loadSelectedContent()
  }

  if (failedIds.length > 0)
    toast.error(t('favorites.unfav_seasons_failed', { count: failedIds.length }))
  if (removedIds.length > 0)
    notifyTopBarFavoritesChanged()
  return failedIds
}

async function handleBatchDeleteFolders() {
  if (selectedFolderCount.value === 0 || isSidebarOperating.value)
    return

  const result = await showConfirmDialog(t('favorites.delete_folders_confirm', { count: selectedFolderCount.value }))
  if (!result)
    return

  isSidebarOperating.value = true
  try {
    if (await deleteFolders([...selectedFolderIds.value]))
      exitSidebarManage()
  }
  finally {
    isSidebarOperating.value = false
  }
}

async function handleBatchUnfavSeasons() {
  if (selectedSeasonCount.value === 0 || isSidebarOperating.value)
    return

  const result = await showConfirmDialog(t('favorites.unfav_seasons_confirm', { count: selectedSeasonCount.value }))
  if (!result)
    return

  isSidebarOperating.value = true
  try {
    const failedIds = await unfavSeasons([...selectedSeasonIds.value])
    if (failedIds.length === 0)
      exitSidebarManage()
    else
      selectedSeasonIds.value = failedIds
  }
  finally {
    isSidebarOperating.value = false
  }
}

async function handleItemMenuSelect(value: string | number) {
  const target = itemMenuTarget.value
  if (!target || isSidebarOperating.value)
    return

  // Capture target then close menu before any await, so a later closeItemMenu
  // from ContextMenu cannot race with the confirm dialog lifecycle.
  closeItemMenu()

  if (target.type === 'folder') {
    if (value === 'rename') {
      openSingleRenameFolder(target.id)
      return
    }

    const result = await showConfirmDialog(t('favorites.delete_folders_confirm', { count: 1 }))
    if (!result)
      return

    isSidebarOperating.value = true
    try {
      await deleteFolders([target.id])
    }
    finally {
      isSidebarOperating.value = false
    }
    return
  }

  const result = await showConfirmDialog(t('favorites.unfav_seasons_confirm', { count: 1 }))
  if (!result)
    return

  isSidebarOperating.value = true
  try {
    await unfavSeasons([target.id])
  }
  finally {
    isSidebarOperating.value = false
  }
}

function getFavoriteResourceKey(item: FavoriteResource | FavoriteItem) {
  return `${item.id}:${item.type}`
}

function isSelectedFavoriteResource(item: FavoriteResource | FavoriteItem) {
  return selectedResourceKeys.value.includes(getFavoriteResourceKey(item))
}

function toggleFavoriteResourceSelection(item: FavoriteResource | FavoriteItem) {
  const key = getFavoriteResourceKey(item)
  if (selectedResourceKeys.value.includes(key))
    selectedResourceKeys.value = selectedResourceKeys.value.filter(itemKey => itemKey !== key)
  else
    selectedResourceKeys.value = [...selectedResourceKeys.value, key]
}

function handleFavoriteCardClick(item: FavoriteItem, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  toggleFavoriteResourceSelection(item)
}

function toggleSelectAllCurrentPage() {
  selectedResourceKeys.value = isAllCurrentPageSelected.value
    ? []
    : favoriteResources.map(item => getFavoriteResourceKey(item))
}

function toggleBatchManage() {
  if (isBatchManaging.value) {
    closeBatchManage()
    return
  }
  if (!canBatchManage.value)
    return

  exitSidebarManage()
  closeItemMenu()
  isBatchManaging.value = true
}

function getSelectedResourceParam() {
  return selectedFavoriteResources.value.map(item => getFavoriteResourceKey(item)).join(',')
}

function removeSelectedResourcesFromList() {
  const selectedKeys = new Set(selectedResourceKeys.value)
  for (let index = favoriteResources.length - 1; index >= 0; index--) {
    if (selectedKeys.has(getFavoriteResourceKey(favoriteResources[index])))
      favoriteResources.splice(index, 1)
  }
  if (selectedCategory.value)
    selectedCategory.value.media_count = Math.max(0, selectedCategory.value.media_count - selectedKeys.size)
  resetBatchSelection()
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

function selectTargetCategory(category: CategoryItem) {
  targetCategory.value = category
}

async function handleBatchDelete() {
  if (!selectedCategory.value || selectedCount.value === 0)
    return
  const result = await showConfirmDialog(t('favorites.batch_unfavorite_confirm', { count: selectedCount.value }))
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
    if (res.code === 0)
      notifyTopBarFavoritesChanged()
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
      notifyTopBarFavoritesChanged()
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
      notifyTopBarFavoritesChanged()
    }
  }
  finally {
    isBatchOperating.value = false
  }
}

async function handleBatchTransferConfirm() {
  if (batchTransferAction.value === 'copy')
    await handleBatchCopy()
  else
    await handleBatchMove()
}

function resetContentState() {
  contentRequestVersion += 1
  resetBatchSelection()
  currentPageNum.value = 1
  favoriteResources.length = 0
  favoriteArticles.length = 0
  articleFavoriteOffset.value = ''
  if (favoriteView.value === 'article')
    articleFavoriteCount.value = undefined
  loadedSeasonMedias.value = []
  loadedSeasonComplete.value = false
  activatedCategoryCover.value = favoriteView.value === 'season' ? selectedSeason.value?.cover || '' : ''
  noMoreContent.value = false
  isLoading.value = false
  isFullPageLoading.value = true
  return contentRequestVersion
}

function loadSelectedContent() {
  const requestVersion = resetContentState()

  if (
    (favoriteView.value === 'video' && !selectedCategory.value)
    || (favoriteView.value === 'season' && !selectedSeason.value)
  ) {
    isFullPageLoading.value = false
    noMoreContent.value = true
    return
  }

  if (favoriteView.value === 'video' && searchScope.value === 'all' && !keyword.value.trim()) {
    isFullPageLoading.value = false
    return
  }

  void loadActiveContent(1, requestVersion)
}

function loadNextPage() {
  if (isLoading.value || noMoreContent.value)
    return

  currentPageNum.value += 1
  void loadActiveContent(currentPageNum.value, contentRequestVersion)
}

async function loadActiveContent(pn: number, requestVersion: number) {
  if (requestVersion !== contentRequestVersion)
    return

  if (pn === 1)
    isFullPageLoading.value = true
  isLoading.value = true

  try {
    if (favoriteView.value === 'article') {
      await getFavoriteArticles(pn, requestVersion)
    }
    else if (favoriteView.value === 'season') {
      await getFavoriteSeasonResources(selectedSeason.value!.id, pn, requestVersion)
    }
    else {
      const mediaId = searchScope.value === 'all'
        ? favoriteCategories[0]?.id ?? selectedCategory.value!.id
        : selectedCategory.value!.id
      await getFavoriteResources(mediaId, pn, keyword.value, searchScope.value === 'all' ? 1 : 0, requestVersion)
    }
  }
  catch {
    if (requestVersion === contentRequestVersion)
      noMoreContent.value = true
  }
  finally {
    if (requestVersion === contentRequestVersion) {
      isLoading.value = false
      isFullPageLoading.value = false
    }
  }

  if (requestVersion !== contentRequestVersion || noMoreContent.value)
    return

  if (!(await haveScrollbar())) {
    currentPageNum.value = pn + 1
    await loadActiveContent(currentPageNum.value, requestVersion)
  }
}

/**
 * 获取收藏夹视频
 * @param media_id 收藏夹 ID
 * @param pn 页码
 * @param keyword 搜索关键词
 * @param type 搜索类型：0-特定收藏夹，1-全部收藏夹
 */
async function getFavoriteResources(
  media_id: number,
  pn: number,
  keyword = '' as string,
  type = 0 as number,
  requestVersion = contentRequestVersion,
) {
  const res: FavoritesResult = await api.favorite.getFavoriteResources({
    media_id,
    pn,
    keyword,
    type,
  })

  if (requestVersion !== contentRequestVersion)
    return

  if (res.code !== 0) {
    noMoreContent.value = true
    return
  }

  const pageItems = Array.isArray(res.data.medias)
    ? res.data.medias.filter((item): item is FavoriteItem => item != null)
    : []
  if (searchScope.value === 'current')
    activatedCategoryCover.value = res.data.info.cover
  favoriteResources.push(...pageItems)
  noMoreContent.value = !res.data.has_more || pageItems.length === 0
}

async function getFavoriteSeasonResources(
  seasonId: number,
  pn: number,
  requestVersion = contentRequestVersion,
) {
  const page = await fetchFavoriteSeasonPage(seasonId, pn, FAVORITE_SEASON_PAGE_SIZE)
  if (requestVersion !== contentRequestVersion)
    return

  if (!page.ok) {
    noMoreContent.value = true
    loadedSeasonComplete.value = false
    return
  }

  const merged = mergeFavoriteSeasonPage({
    pn,
    pageMedias: page.pageMedias,
    mediaCount: page.mediaCount,
    previousMedias: loadedSeasonMedias.value,
    pageSize: FAVORITE_SEASON_PAGE_SIZE,
  })

  loadedSeasonMedias.value = await enrichFavoriteSeasonMediaFaces(merged.medias)
  if (requestVersion !== contentRequestVersion)
    return

  loadedSeasonComplete.value = !merged.hasMore
  noMoreContent.value = !merged.hasMore
  activatedCategoryCover.value = page.cover || selectedSeason.value?.cover || ''
  favoriteResources.length = 0
  favoriteResources.push(...loadedSeasonMedias.value.map(normalizeSeasonMedia))
}

async function getFavoriteArticles(
  pn: number,
  requestVersion = contentRequestVersion,
) {
  try {
    const res: FavoriteArticlesResult = await api.favorite.getFavoriteArticles({
      page: pn,
      page_size: FAVORITE_ARTICLE_PAGE_SIZE,
      offset: pn === 1 ? '' : articleFavoriteOffset.value,
      timezone_offset: new Date().getTimezoneOffset(),
      web_location: '333.1387',
    })

    if (requestVersion !== contentRequestVersion)
      return

    if (res.code !== 0) {
      noMoreContent.value = true
      toast.error(res.message || t('favorites.article_load_failed'))
      return
    }

    const pageArticles = Array.isArray(res.data?.items)
      ? res.data.items.filter((item): item is FavoriteArticle => item != null && Boolean(item.opus_id))
      : []
    favoriteArticles.push(...pageArticles)

    const nextOffset = res.data?.offset
    articleFavoriteOffset.value = nextOffset != null && nextOffset !== ''
      ? String(nextOffset)
      : (pageArticles.at(-1)?.opus_id ?? '')

    const hasMore = Boolean(res.data?.has_more) && pageArticles.length > 0
    // polymer 接口无 total，仅在没有更多时用已加载条数作为总数
    if (!hasMore)
      articleFavoriteCount.value = favoriteArticles.length

    if (favoriteArticles[0])
      activatedCategoryCover.value = getFavoriteArticleCover(favoriteArticles[0])

    noMoreContent.value = !hasMore
  }
  catch {
    if (requestVersion !== contentRequestVersion)
      return
    noMoreContent.value = true
    toast.error(t('favorites.article_load_failed'))
  }
}

function handleFavoriteViewChange(view: FavoriteView) {
  closeBatchManage()
  exitSidebarManage()
  closeItemMenu()
  favoriteView.value = view
  searchScope.value = 'current'

  if (view === 'video' && !selectedCategory.value)
    selectedCategory.value = favoriteCategories[0]
  else if (view === 'season' && !selectedSeason.value)
    selectedSeason.value = collectedFavoriteSeasons[0]

  loadSelectedContent()
}

function changeCategory(categoryItem: CategoryItem) {
  closeBatchManage()
  exitSidebarManage()
  closeItemMenu()
  favoriteView.value = 'video'
  searchScope.value = 'current'
  selectedCategory.value = categoryItem
  loadSelectedContent()
}

function changeSeason(seasonItem: CollectedFavoriteSeason) {
  closeBatchManage()
  exitSidebarManage()
  closeItemMenu()
  favoriteView.value = 'season'
  searchScope.value = 'current'
  selectedSeason.value = seasonItem
  loadSelectedContent()
}

function handleSearch() {
  if (favoriteView.value !== 'video')
    return

  closeBatchManage()
  exitSidebarManage()
  closeItemMenu()
  loadSelectedContent()
}

function handleSearchScopeChange() {
  handleSearch()
}

async function handlePlayAll() {
  if (favoriteView.value === 'article' || searchScope.value === 'all' || isResolvingSeasonPlayAll.value)
    return

  if (favoriteView.value === 'season') {
    if (!selectedSeason.value)
      return

    isResolvingSeasonPlayAll.value = true
    try {
      const result = await resolveFavoriteSeasonPlayAllUrl({
        seasonId: selectedSeason.value.id,
        link: selectedSeason.value.link,
        bvid: selectedSeason.value.bvid,
        mode: settings.value.collectedSeasonPlayAllMode,
        preloaded: {
          medias: loadedSeasonMedias.value,
          complete: loadedSeasonComplete.value,
          expectedCount: selectedSeason.value.media_count,
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

  if (selectedCategory.value)
    openLinkToNewTab(`https://www.bilibili.com/list/ml${selectedCategory.value.id}`)
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

async function handleUnfavorite(favoriteResource: FavoriteResource) {
  const result = await showConfirmDialog(
    t('favorites.unfavorite_confirm'),
  )
  if (result) {
    api.favorite.patchDelFavoriteResources({
      resources: `${favoriteResource.id}:${favoriteResource.type}`,
      media_id: selectedCategory.value?.id,
      csrf: getCSRF(),
    }).then((res) => {
      if (res.code === 0) {
        const resourceIndex = favoriteResources.indexOf(favoriteResource as FavoriteItem)
        if (resourceIndex >= 0)
          favoriteResources.splice(resourceIndex, 1)
        if (selectedCategory.value)
          selectedCategory.value.media_count = Math.max(0, selectedCategory.value.media_count - 1)
        notifyTopBarFavoritesChanged()
      }
    })
  }
}

function isMusic(item: FavoriteResource) {
  return item.link.includes('bilibili://music')
}

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
      mid: item.upper.mid,
      name: item.upper.name,
      face: item.upper.face || '',
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

function getFavoriteArticleCover(item: FavoriteArticle) {
  return item.cover?.url || ''
}

function normalizeFavoriteArticleUrl(url: string) {
  if (url.startsWith('//'))
    return `https:${url}`
  if (url.startsWith('/'))
    return `https://www.bilibili.com${url}`
  return url
}

function getFavoriteArticleUrl(item: FavoriteArticle) {
  if (item.jump_url)
    return normalizeFavoriteArticleUrl(item.jump_url)
  return `https://www.bilibili.com/opus/${item.opus_id}`
}

function transformFavoriteArticle(item: FavoriteArticle) {
  const mid = item.author?.mid
  return {
    id: item.opus_id,
    url: getFavoriteArticleUrl(item),
    title: item.content || '',
    cover: getFavoriteArticleCover(item),
    author: item.author?.name || '',
    authorMid: mid != null && mid !== '' ? Number(mid) : undefined,
    view: item.stat?.view || undefined,
    like: item.stat?.like || undefined,
    publishTime: item.pub_time || undefined,
  }
}
</script>

<template>
  <div v-if="getCSRF()" class="favorites-old-page">
    <main class="favorites-old-main">
      <h3 class="bew-page-heading favorites-main-heading">
        {{ selectedContentTitle }} ({{ selectedContentCount }})
      </h3>

      <div
        v-if="favoriteView === 'video'"
        class="favorites-toolbar"
      >
        <div class="toolbar-search-group">
          <Select v-model="searchScope" class="search-scope-select" :options="searchScopeOptions" @change="handleSearchScopeChange" />
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

        <div v-if="canBatchManage" class="toolbar-action-group">
          <Button
            v-if="canBatchManage"
            :type="isBatchManaging ? 'tertiary' : 'secondary'"
            :disabled="isBatchOperating"
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

      <template v-if="favoriteView === 'article'">
        <div v-if="favoriteArticles.length > 0" class="article-favorites-content">
          <div class="article-favorites-grid">
            <ArticleCard
              v-for="article in favoriteArticles"
              :key="article.opus_id"
              v-bind="transformFavoriteArticle(article)"
            />
          </div>
          <div v-if="isLoading" class="content-loading">
            <Loading />
          </div>
          <Empty v-else-if="noMoreContent" :description="t('common.no_more_content')" />
        </div>
        <div v-else-if="isLoading || isFullPageLoading" class="content-loading content-loading--initial">
          <Loading />
        </div>
        <Empty v-else :description="t('common.no_data')" />
      </template>

      <template v-else>
        <Empty
          v-if="favoriteView === 'video' && searchScope === 'all' && !keyword.trim() && favoriteResources.length === 0 && !isLoading"
          :description="t('favorites.global_search_hint')"
        />

        <VideoCardGrid
          v-else
          :items="favoriteResources"
          :transform-item="transformFavoriteItem"
          :get-item-key="item => item.id"
          grid-layout="adaptive"
          :initial-skeleton-count="favoriteView === 'season' ? FAVORITE_SEASON_PAGE_SIZE : 20"
          disable-content-visibility
          :loading="isLoading || isFullPageLoading"
          :no-more-content="noMoreContent"
          :empty-description="$t('common.no_more_content')"
          :more-btn="favoriteView === 'video' && !isBatchManaging"
          :hide-author="favoriteView === 'season'"
          :card-click-handler="isBatchManaging ? handleFavoriteCardClick : undefined"
          :cover-top-left-always-visible="isBatchManaging"
          enable-row-padding
          @refresh="() => handlePageRefresh?.()"
          @load-more="loadNextPage"
        >
          <template v-if="favoriteView === 'video'" #coverTopLeft="{ item }">
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
            <button v-else class="favorite-card-action danger" @click.prevent.stop="handleUnfavorite(item)">
              <Tooltip :content="$t('favorites.unfavorite')" placement="bottom-left" type="dark">
                <div i-ic-baseline-clear />
              </Tooltip>
            </button>
          </template>
        </VideoCardGrid>
      </template>

      <Dialog
        v-if="renameDialogVisible"
        :title="t('favorites.rename_folder_dialog_title')"
        width="420px"
        append-to-bewly-body
        :loading="isSidebarOperating"
        @close="closeRenameFolderDialog"
        @confirm="handleRenameFolderConfirm"
      >
        <Input
          v-model="renameFolderTitle"
          :placeholder="t('favorites.rename_folder_placeholder')"
          @enter="handleRenameFolderConfirm"
        />
      </Dialog>

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

    <aside class="favorites-old-sidebar">
      <div class="favorites-sidebar-panel">
        <div class="favorites-sidebar-background">
          <div />
          <img
            v-if="selectedContentCover"
            :src="removeHttpFromUrl(`${selectedContentCover}@480w_270h_1c`)"
            alt=""
          >
        </div>

        <div class="favorites-sidebar-content">
          <picture class="favorites-sidebar-cover">
            <img
              v-if="selectedContentCover"
              :src="removeHttpFromUrl(`${selectedContentCover}@480w_270h_1c`)"
              :alt="selectedContentTitle"
            >
            <span v-else :class="favoriteView === 'article' ? 'i-tabler:article' : 'i-tabler:folder-star'" />
          </picture>

          <div class="favorites-sidebar-title">
            <h3 class="bew-page-heading">
              {{ selectedContentTitle }}
            </h3>
            <p>
              {{ favoriteView === 'article'
                ? t('favorites.article_count', { count: selectedContentCount })
                : t('favorites.video_count', { count: selectedContentCount }) }}
            </p>
          </div>

          <div class="sidebar-mode-row">
            <Select
              v-model="favoriteView"
              class="favorite-view-select"
              :options="favoriteViewOptions"
              @change="handleFavoriteViewChange"
            />
            <Tooltip v-if="favoriteView !== 'article'" :content="t('favorites.sidebar_manage')" placement="left" type="dark">
              <button
                class="sidebar-manage-toggle"
                :class="{ active: sidebarManageSection !== null }"
                :aria-label="t('favorites.sidebar_manage')"
                @click="toggleCurrentSidebarManage"
              >
                <span :class="sidebarManageSection ? 'i-tabler:x' : 'i-tabler:adjustments-horizontal'" />
              </button>
            </Tooltip>
          </div>

          <div v-if="isManagingFolder" class="sidebar-manage-bar">
            <button class="sidebar-manage-select" @click="toggleSelectAllFolders">
              <span :class="isAllFoldersSelected ? 'i-tabler:checkbox' : 'i-tabler:square'" />
              {{ isAllFoldersSelected ? t('favorites.unselect_all') : t('favorites.select_all') }}
            </button>
            <span class="sidebar-selected-count">{{ selectedFolderCount }}</span>
            <Tooltip :content="t('favorites.rename_folder')" placement="left" type="dark">
              <button
                class="sidebar-manage-action"
                :disabled="!canRenameSelectedFolder || isSidebarOperating"
                :aria-label="t('favorites.rename_folder')"
                @click="openRenameFolderDialog"
              >
                <span i-tabler:edit />
              </button>
            </Tooltip>
            <Tooltip :content="t('common.operation.delete')" placement="left" type="dark">
              <button
                class="sidebar-manage-action danger"
                :disabled="selectedFolderCount === 0 || isSidebarOperating"
                :aria-label="t('common.operation.delete')"
                @click="handleBatchDeleteFolders"
              >
                <span i-tabler:trash />
              </button>
            </Tooltip>
          </div>

          <div v-else-if="isManagingSeason" class="sidebar-manage-bar">
            <button class="sidebar-manage-select" @click="toggleSelectAllSeasons">
              <span :class="isAllSeasonsSelected ? 'i-tabler:checkbox' : 'i-tabler:square'" />
              {{ isAllSeasonsSelected ? t('favorites.unselect_all') : t('favorites.select_all') }}
            </button>
            <span class="sidebar-selected-count">{{ selectedSeasonCount }}</span>
            <Tooltip :content="t('favorites.unfavorite')" placement="left" type="dark">
              <button
                class="sidebar-manage-action danger"
                :disabled="selectedSeasonCount === 0 || isSidebarOperating"
                :aria-label="t('favorites.unfavorite')"
                @click="handleBatchUnfavSeasons"
              >
                <span i-tabler:star-off />
              </button>
            </Tooltip>
          </div>

          <Button
            v-else-if="favoriteView !== 'article'"
            color="rgba(255,255,255,.35)"
            block
            text-color="white"
            strong
            :disabled="searchScope === 'all' || isResolvingSeasonPlayAll"
            @click="handlePlayAll"
          >
            <template #left>
              <div i-tabler:player-play />
            </template>
            {{ t('common.play_all') }}
          </Button>

          <nav class="favorites-old-nav" :aria-label="selectedContentTitle">
            <ul v-if="favoriteView === 'video'" class="category-list">
              <li
                v-for="item in favoriteCategories"
                :key="`video:${item.id}`"
                class="category-item"
                :class="{
                  'row-active': !isManagingFolder && selectedCategory?.id === item.id,
                  'row-selected': isManagingFolder && selectedFolderIds.includes(item.id),
                  'row-disabled': isFullPageLoading,
                }"
              >
                <button
                  class="category-nav-item"
                  :class="{
                    active: !isManagingFolder && selectedCategory?.id === item.id,
                    selected: isManagingFolder && selectedFolderIds.includes(item.id),
                    locked: isManagingFolder && item.id === defaultFolderId,
                  }"
                  :disabled="isFullPageLoading"
                  @click="handleCategoryItemClick(item)"
                >
                  <span
                    v-if="isManagingFolder"
                    class="category-icon"
                    :class="item.id === defaultFolderId
                      ? 'i-tabler:lock'
                      : (selectedFolderIds.includes(item.id) ? 'i-tabler:checkbox' : 'i-tabler:square')"
                  />
                  <span v-else class="category-icon" i-tabler:folder />
                  <span class="category-title">{{ item.title }}</span>
                  <span class="category-count">{{ item.media_count }}</span>
                </button>
                <button
                  v-if="!isManagingFolder && item.id !== defaultFolderId"
                  class="item-more-btn"
                  :disabled="isFullPageLoading"
                  :aria-label="t('favorites.sidebar_manage')"
                  @click.prevent.stop="openItemMenu('folder', item.id, $event)"
                >
                  <span i-mingcute:more-2-line />
                </button>
                <span
                  v-else-if="!isManagingFolder"
                  class="item-more-placeholder"
                  aria-hidden="true"
                />
              </li>
            </ul>

            <ul v-else-if="favoriteView === 'season'" class="category-list">
              <li
                v-for="item in collectedFavoriteSeasons"
                :key="`season:${item.id}`"
                class="category-item"
                :class="{
                  'row-active': !isManagingSeason && selectedSeason?.id === item.id,
                  'row-selected': isManagingSeason && selectedSeasonIds.includes(item.id),
                  'row-disabled': isFullPageLoading,
                }"
              >
                <button
                  class="category-nav-item"
                  :class="{
                    active: !isManagingSeason && selectedSeason?.id === item.id,
                    selected: isManagingSeason && selectedSeasonIds.includes(item.id),
                  }"
                  :disabled="isFullPageLoading"
                  @click="handleSeasonItemClick(item)"
                >
                  <span
                    v-if="isManagingSeason"
                    class="category-icon"
                    :class="selectedSeasonIds.includes(item.id) ? 'i-tabler:checkbox' : 'i-tabler:square'"
                  />
                  <span v-else class="category-icon" i-tabler:stack-2 />
                  <span class="category-title">{{ item.title }}</span>
                  <span class="category-count">{{ item.media_count }}</span>
                </button>
                <button
                  v-if="!isManagingSeason"
                  class="item-more-btn"
                  :disabled="isFullPageLoading"
                  :aria-label="t('favorites.sidebar_manage')"
                  @click.prevent.stop="openItemMenu('season', item.id, $event)"
                >
                  <span i-mingcute:more-2-line />
                </button>
              </li>
            </ul>

            <div v-else class="article-nav-item">
              <span class="category-icon" i-tabler:article />
              <span class="category-title">{{ t('favorites.article_section_title') }}</span>
              <span class="category-count">{{ selectedContentCount }}</span>
            </div>
          </nav>

          <ContextMenu
            v-if="itemMenuTarget"
            :options="itemMenuOptions"
            :menu-styles="itemMenuStyles"
            @select="handleItemMenuSelect"
            @close="closeItemMenu"
          />
        </div>
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
.favorites-old-page {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  // Keep the page's containing block as tall as the main list; the desktop
  // sidebar can then stay pinned independently of grid height recalculation.
  align-items: stretch;
}

.favorites-old-main {
  order: 2;
  width: 100%;
  min-width: 0;
  min-height: 100vh;
  margin-bottom: var(--bew-space-6);
}

.favorites-main-heading {
  margin: 0 0 var(--bew-space-6);
  color: var(--bew-text-1);
}

.favorites-old-sidebar {
  position: relative;
  order: 1;
  width: 100%;
  align-self: stretch;
}

.favorites-sidebar-panel {
  position: relative;
  width: 100%;
  height: 230px;
  margin: var(--bew-space-10) 0;
  overflow: hidden;
  border-radius: var(--bew-panel-radius);
}

.favorites-sidebar-background {
  position: absolute;
  z-index: 0;
  inset: 0;
}

.favorites-sidebar-background div {
  position: absolute;
  z-index: 1;
  background: var(--bew-fill-4);
  inset: 0;
}

.favorites-sidebar-background img {
  position: absolute;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(40px);
  transform: scale(1.12);
}

.favorites-sidebar-content {
  position: absolute;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  padding: var(--bew-space-6);
  overflow: auto;
  overscroll-behavior: contain;
  inset: 0;
}

.favorites-sidebar-cover {
  display: none;
  place-items: center;
  flex: 0 0 auto;
  width: 100%;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.72);
  background: var(--bew-skeleton);
  border-radius: var(--bew-media-radius);
  box-shadow: 0 16px 24px -12px rgba(0, 0, 0, 0.36);
  aspect-ratio: 16 / 9;
}

.favorites-sidebar-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.favorites-sidebar-cover span {
  width: var(--bew-icon-size-xl);
  height: var(--bew-icon-size-xl);
}

.favorites-sidebar-title h3,
.favorites-sidebar-title p {
  margin: 0;
  color: #fff;
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.3);
}

.favorites-sidebar-title p {
  margin-top: var(--bew-space-1);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  opacity: 0.76;
}

.favorite-view-select {
  flex: 1 1 auto;
  min-width: 0;
}

.favorite-view-select :deep(.select-trigger) {
  box-sizing: border-box;
  height: var(--bew-control-height);
  padding: 0 0 0 var(--bew-space-3);
  overflow: hidden;
  color: #fff;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  background: rgba(255, 255, 255, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.32);
  backdrop-filter: var(--bew-filter-glass-1);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.24);
}

.favorite-view-select :deep(.select-trigger:hover) {
  background: rgba(255, 255, 255, 0.36);
}

.favorite-view-select :deep(.select-arrow-slot) {
  align-self: stretch;
  width: var(--bew-control-height);
  margin-left: var(--bew-space-2);
}

.favorite-view-select :deep(.select-arrow) {
  border-color: #fff;
}

.sidebar-mode-row {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-2);
  align-items: center;
}

.sidebar-manage-toggle,
.sidebar-manage-action {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  color: #fff;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: rgba(255, 255, 255, 0.35);
  backdrop-filter: var(--bew-filter-glass-1);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.sidebar-manage-toggle {
  width: var(--bew-control-height);
  height: var(--bew-control-height);
}

.sidebar-manage-toggle:hover,
.sidebar-manage-toggle.active,
.sidebar-manage-action:hover:not(:disabled) {
  color: #fff;
  background: rgba(255, 255, 255, 0.42);
}

.sidebar-manage-action.danger:hover:not(:disabled) {
  background: var(--bew-error-color);
}

.sidebar-manage-toggle span,
.sidebar-manage-action span,
.sidebar-manage-select span {
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
}

.sidebar-manage-action:disabled {
  cursor: default;
  opacity: 0.4;
}

.sidebar-manage-bar {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-1);
  align-items: center;
  min-height: var(--bew-control-height);
}

.sidebar-manage-select {
  display: flex;
  flex: 1 1 auto;
  gap: var(--bew-space-1);
  align-items: center;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.82);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  white-space: nowrap;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.sidebar-manage-select:hover {
  color: #fff;
}

.sidebar-selected-count {
  color: rgba(255, 255, 255, 0.72);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.favorites-old-nav {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
  height: 100%;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.category-item {
  display: flex;
  align-items: center;
  width: 100%;
  border-radius: var(--bew-interactive-radius);
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.category-item .category-nav-item {
  flex: 1 1 auto;
  min-width: 0;
}

.category-item:hover:not(.row-disabled):not(.row-active) {
  background: rgba(255, 255, 255, 0.16);
}

.category-item.row-active {
  background: rgba(255, 255, 255, 0.35);
}

.category-item.row-selected {
  background: color-mix(in oklab, var(--bew-theme-color), transparent 52%);
}

.item-more-btn,
.item-more-placeholder {
  flex: 0 0 auto;
  width: var(--bew-control-item-height);
  height: var(--bew-control-item-height);
  margin-right: var(--bew-space-1);
}

.item-more-btn {
  display: grid;
  place-items: center;
  padding: 0;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.72);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: transparent;
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.item-more-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.16);
}

.item-more-btn span {
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
}

.category-nav-item,
.article-nav-item {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: var(--bew-space-2);
  align-items: center;
  width: 100%;
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: rgba(255, 255, 255, 0.82);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  text-align: left;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: transparent;
}

.category-nav-item {
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.category-item:hover .category-nav-item:not(:disabled):not(.active) {
  color: #fff;
  background: transparent;
}

.category-nav-item.active {
  color: #fff;
  background: transparent;
}

.category-nav-item.selected {
  color: #fff;
  background: transparent;
}

.article-nav-item {
  color: #fff;
  background: rgba(255, 255, 255, 0.35);
}

.category-nav-item.locked {
  cursor: default;
  opacity: 0.5;
}

.category-nav-item:disabled {
  cursor: default;
  opacity: 0.56;
}

.category-icon {
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
}

.category-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-count {
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  opacity: 0.72;
}

.favorites-toolbar {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  width: 100%;
  max-width: 100%;
  margin: var(--bew-space-3) 0;
  padding: 0;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}

.toolbar-search-group,
.toolbar-action-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  align-items: center;
}

.toolbar-search-group {
  flex: 1 1 auto;
  min-width: 0;
}

.toolbar-action-group {
  flex: 0 0 auto;
}

.batch-selected-count {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  white-space: nowrap;
}

.search-scope-select {
  flex: 0 0 120px;
}

.favorites-search-input {
  width: min(250px, 100%);
}

.article-favorites-content,
.article-favorites-grid {
  width: 100%;
}

.article-favorites-content,
.favorites-old-main > :deep(.video-card-grid-root) {
  margin-top: var(--bew-space-3);
}

.article-favorites-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-space-4);
}

.content-loading {
  display: grid;
  place-items: center;
  min-height: 64px;
  padding: var(--bew-space-4);
}

.content-loading--initial {
  min-height: 240px;
}

.favorite-card-action {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 30px;
  margin: var(--bew-space-1);
  padding: 0 var(--bew-space-2);
  color: #fff;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: rgba(0, 0, 0, 0.62);
  cursor: pointer;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.favorite-card-action:hover {
  background: var(--bew-theme-color);
}

.favorite-card-action.selected {
  background: var(--bew-theme-color);
}

.favorite-card-action.danger:hover {
  background: var(--bew-error-color);
}

.batch-transfer-dialog {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--bew-space-2);
  padding: var(--bew-space-0-5) 0 var(--bew-space-2);
}

.batch-target-folder {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto 20px;
  gap: var(--bew-space-3);
  align-items: center;
  width: 100%;
  min-height: 46px;
  padding: 0 var(--bew-space-4);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-body);
  text-align: left;
  border: 1px solid transparent;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-1);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    border-color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.batch-target-folder:hover {
  background: var(--bew-fill-2);
}

.batch-target-folder.active {
  color: var(--bew-theme-color);
  border-color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
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
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
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
    border-radius: var(--bew-radius-full);
  }

  &::-webkit-scrollbar-corner {
    background: transparent;
  }
}

@media (min-width: 768px) {
  .favorites-old-page {
    flex-direction: row;
  }

  .favorites-old-main {
    order: 1;
    width: 60%;
  }

  .favorites-old-sidebar {
    position: sticky;
    top: calc(var(--bew-top-bar-height, 64px) + var(--bew-space-4));
    order: 2;
    width: 40%;
    align-self: flex-start;
  }

  .favorites-sidebar-panel {
    height: calc(100vh - 160px);
  }

  .favorites-sidebar-cover {
    display: grid;
  }
}

@media (min-width: 1024px) {
  .favorites-old-main {
    width: 70%;
  }

  .favorites-old-sidebar {
    width: 30%;
  }
}

@media (min-width: 1280px) {
  .favorites-old-main {
    width: 75%;
  }

  .favorites-old-sidebar {
    width: 25%;
  }
}

@media (max-width: 767px) {
  .favorites-toolbar {
    flex-wrap: wrap;
    width: 100%;
  }

  .favorites-search-input {
    flex: 1 1 200px;
  }
}

@media (max-width: 640px) {
  .article-favorites-grid {
    grid-template-columns: 1fr;
  }
}
</style>
