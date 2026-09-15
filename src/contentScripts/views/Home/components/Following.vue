<script setup lang="ts">
/**
 * Following Component - 正在关注页面
 *
 * ## 功能概述
 * 显示用户关注的UP主列表及其视频动态流。支持两种视图模式：
 * 1. ALL视图：显示所有关注UP主的混合视频流
 * 2. 单UP主视图：显示特定UP主的视频动态，支持通过关键词搜索其视频投稿
 *
 * UP主列表优先使用页面已加载到的历史投稿时间排序，来源包括：
 * 1. ALL视图的关注动态流中实际加载到的视频时间
 * 2. 用户点击某个UP主后实际加载到的视频时间
 * 3. 右上角动态Pop和插件动态页已经加载到的视频时间
 *
 * 没有历史投稿时间时使用关注接口的关注时间兜底，不发起后台逐人请求。
 *
 * ## 缓存策略
 *
 * ### 已读状态 (VIEWED_UPLOADERS_KEY)
 * - 记录用户查看每个UP主的时间戳
 * - 用于判断 hasUpdate 状态（红点提示）
 *
 * ### UP主投稿时间缓存
 * - 通过扩展级共享存储复用上述四类页面已经加载到的最新视频时间
 * - 旧版后台逐人同步产生的缓存不会参与排序
 *
 * ## 排序策略
 *
 * 可按更新时间或关注分组展示，分组内按更新时间排序；没有投稿记录时使用关注时间。
 *
 * ## 布局模式
 *
 * ### 新布局（默认，可在设置中关闭）
 * - 左侧：Sticky侧边栏显示UP主列表
 * - 右侧：全宽视频流，支持全页面滚动
 * - 参考 Ranking.vue 的布局设计
 *
 * ## 性能优化
 * - 扩展级共享缓存减少重复计算
 * - 分页加载，避免一次性加载过多数据
 */
import { useI18n } from 'vue-i18n'

import type { Author, Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useHomeTabState } from '~/composables/useHomeTabState'
import { OVERLAY_SCROLL_BAR_SCROLL } from '~/constants/globalEvents'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import {
  recordUploaderLatestVideoTimes,
  uploaderLatestVideoTimes,
  uploaderLatestVideoTimesReady,
} from '~/logic/uploaderLatestVideoTimes'
import type { FollowingLiveResult, List as FollowingLiveItem } from '~/models/live/getFollowingLiveList'
import type { DataItem as MomentItem, MomentResult } from '~/models/moment/moment'
import { BadgeText } from '~/models/moment/moment'
import type { UserVideo, UserVideosResult } from '~/models/video/userVideos'
import api from '~/utils/api'
import { calcTimeSince, parseStatNumber } from '~/utils/dataFormatter'
import type { FollowingGroup, FollowingGroupsResult, FollowingRelationUser } from '~/utils/followingGroups'
import { getFollowingGroupIds, groupFollowingUploaders } from '~/utils/followingGroups'
import { decodeHtmlEntities } from '~/utils/htmlDecode'
import emitter from '~/utils/mitt'

import FollowingGroupMenu from './FollowingGroupMenu.vue'
import FollowingUploaderMenu from './FollowingUploaderMenu.vue'

interface Props {
  gridLayout?: GridLayoutType
  topBarVisibility?: boolean
}

interface UploaderInfo {
  mid: number
  name: string
  face: string
  hasUpdate: boolean
  hasPostTime: boolean
  lastUpdateTime: number
  groupIds: number[]
}

type UploaderRow
  = | { key: string, type: 'group', id: number, name: string, count: number, expanded: boolean, members: UploaderInfo[] }
    | { key: string, type: 'uploader', uploader: UploaderInfo }

interface VideoElement {
  uniqueId: string
  bvid?: string
  item?: MomentItem
  liveItem?: FollowingLiveItem
  authorList?: Author[]
  displayData?: Video
  isLive?: boolean
}

withDefaults(defineProps<Props>(), {
  gridLayout: 'adaptive',
  topBarVisibility: true,
})

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const { t } = useI18n()
const tabState = useHomeTabState()
const hasLoaded = tabState.ref('hasLoaded', false)
const followingPage = tabState.ref('followingPage', 1)
const followingListLoaded = tabState.ref('followingListLoaded', false)
const uploaderScrollRef = ref<HTMLElement | null>(null)
tabState.capture('uploaderScrollTop', () => uploaderScrollRef.value?.scrollTop ?? 0)

const { scrollViewportRef, handlePageRefresh, handleReachBottom, canRefreshHomeSubPage } = useBewlyApp()
const videoList = tabState.ref<VideoElement[]>('videoList', [])
const uploaderList = tabState.ref<UploaderInfo[]>('uploaderList', [])
const followingGroups = tabState.ref<FollowingGroup[]>('followingGroups', [])
const followingGroupsLoaded = tabState.ref('followingGroupsLoaded', false)
const expandedGroupIds = tabState.ref<number[]>('expandedGroupIds', [-10])
// 用户操作优先于同时在途的列表请求，避免旧响应恢复已移出的成员。
const changedUploaderMids = new Set<number>()
const groupsLoading = ref(false)
const groupsRequestFailed = ref(false)
const uploaderMenuRef = ref<InstanceType<typeof FollowingUploaderMenu>>()
const groupMenuRef = ref<InstanceType<typeof FollowingGroupMenu>>()
const selectedUploader = tabState.ref<number | null>('selectedUploader', null) // null means "All"
const previousSelectedUploader = tabState.ref<number | null>('previousSelectedUploader', null)
const selectionToken = ref<number>(0) // 用于防止竞态条件的令牌
const suppressUploaderAutoLoadMore = ref(false)
const liveListLoaded = tabState.ref<boolean>('liveListLoaded', false) // 标记直播列表是否已加载（防止重复加载）

// Provide selectedUploader to child components for preview loading control
provide('moments-selected-uploader', selectedUploader)
const isLoading = ref<boolean>(false)
const requestFailed = tabState.ref<boolean>('requestFailed', false)
const noMoreContent = tabState.ref<boolean>('noMoreContent', false)
const needToLoginFirst = tabState.ref<boolean>('needToLoginFirst', false)
const isRefreshContextActive = ref<boolean>(false)

// 分别管理ALL和单个UP主的分页状态
const allViewOffset = tabState.ref<string>('allViewOffset', '')
const allViewUpdateBaseline = tabState.ref<string>('allViewUpdateBaseline', '')
const userMomentsOffset = tabState.ref<string>('userMomentsOffset', '')
const videoSearchInput = tabState.ref('videoSearchInput', '')
// 输入与已提交的关键词分开，编辑期间的分页仍使用当前结果的关键词。
const videoSearchKeyword = tabState.ref('videoSearchKeyword', '')
const userVideosPage = tabState.ref('userVideosPage', 1)
const USER_VIDEOS_PAGE_SIZE = 30
// 同一主投稿人可能出现在多条联合投稿中，共用头像请求。
const searchAuthorFaceRequests = new Map<number, Promise<string | undefined>>()
const videoSearchPlaceholder = computed(() => t('home.following_search_videos', {
  name: uploaderList.value.find(uploader => uploader.mid === selectedUploader.value)?.name ?? '',
}))

const currentUserMid = tabState.ref<number>('currentUserMid', 0) // 当前登录用户的mid

function syncRefreshAvailability() {
  canRefreshHomeSubPage.value = isRefreshContextActive.value && selectedUploader.value === null
}

function getFeedStartScrollTop() {
  return settings.value.useSearchPageModeOnHomePage ? 510 : 0
}

function pinFeedScrollToStart() {
  const viewport = scrollViewportRef.value
  if (!viewport)
    return
  const token = selectionToken.value
  const scrollTarget = getFeedStartScrollTop()
  const pinScroll = () => {
    if (tabState.isCurrent() && token === selectionToken.value && scrollViewportRef.value === viewport)
      viewport.scrollTop = scrollTarget
  }
  pinScroll()
  void nextTick(() => {
    pinScroll()
    requestAnimationFrame(pinScroll)
  })
}

function handleFeedScroll(scrollTop: number) {
  if (!tabState.isCurrent() || isLoading.value)
    return
  if (scrollTop > getFeedStartScrollTop() + 1)
    suppressUploaderAutoLoadMore.value = false
}

watch(selectedUploader, syncRefreshAvailability, { immediate: true })

// Track viewed uploaders in localStorage
const VIEWED_UPLOADERS_KEY = 'bewlycat_moments_viewed_uploaders'

// 获取已查看的UP主记录（存储用户实际看到的最新投稿时间）
function getViewedUploaders(): Record<number, number> {
  try {
    const data = localStorage.getItem(VIEWED_UPLOADERS_KEY)
    return data ? JSON.parse(data) : {}
  }
  catch {
    return {}
  }
}

// 计算UP主是否有更新（需要显示小红点）
// 规则：有新内容 且 更新时间在3天内
function calculateHasUpdate(lastUpdateTime: number, viewedTime: number): boolean {
  const now = Date.now()
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000

  // 必须满足两个条件：1. 有新内容（lastUpdateTime > viewedTime） 2. 更新在3天内
  return lastUpdateTime > viewedTime && (now - lastUpdateTime <= THREE_DAYS)
}

// 标记UP主为已查看（记录用户看到的最新投稿时间）
function markUploaderAsViewed(mid: number, updateTime?: number) {
  const viewed = getViewedUploaders()
  // 如果提供了updateTime，使用它；否则使用当前UP主的lastUpdateTime
  const uploader = uploaderList.value.find(u => u.mid === mid)
  const timeToMark = updateTime || (uploader?.lastUpdateTime) || Date.now()

  viewed[mid] = timeToMark
  localStorage.setItem(VIEWED_UPLOADERS_KEY, JSON.stringify(viewed))

  if (uploader) {
    uploader.hasUpdate = false
  }

  console.log(`[Following] Marked UP ${mid} as viewed at ${new Date(timeToMark).toLocaleString()}`)
}

// 检查视频是否为充电专属视频
function isChargingVideo(item: MomentItem): boolean {
  const major = item.modules?.module_dynamic?.major
  const badgeText = major?.archive?.badge?.text || major?.ugc_season?.badge?.text
  return badgeText === BadgeText.充电专属
}

// 检查视频是否为动态视频
function isDynamicVideo(item: MomentItem): boolean {
  const major = item.modules?.module_dynamic?.major
  const badgeText = major?.archive?.badge?.text || major?.ugc_season?.badge?.text
  return badgeText === BadgeText.动态视频
}

// 判断视频是否应该被过滤
function shouldFilterVideo(item: MomentItem): boolean {
  // 如果开启了过滤充电视频设置，且该视频是充电专属视频，则返回 true（表示应该过滤）
  if (settings.value.followingFilterChargingVideos && isChargingVideo(item)) {
    return true
  }
  // 如果开启了过滤动态视频设置，且该视频是动态视频，则返回 true（表示应该过滤）
  if (settings.value.followingFilterDynamicVideos && isDynamicVideo(item)) {
    return true
  }
  return false
}

function sortUploaderList(excludeMid: number | null = null) {
  // 浏览单个 UP 时保持整张列表的顺序，避免分组内其他成员重排牵动点击位置。
  if (excludeMid !== null)
    return

  uploaderList.value.sort((a, b) => {
    // 按 lastUpdateTime 降序排序（最新的在前）
    return b.lastUpdateTime - a.lastUpdateTime
  })
}

function updateUploaderStatus() {
  const viewed = getViewedUploaders()
  uploaderList.value = uploaderList.value.map((uploader) => {
    const viewedTime = viewed[uploader.mid] || 0
    return {
      ...uploader,
      hasUpdate: uploader.hasPostTime
        ? calculateHasUpdate(uploader.lastUpdateTime, viewedTime)
        : false,
    }
  })

  // 使用统一的排序逻辑
  sortUploaderList(selectedUploader.value)
}

function applyRecordedUploaderTimes() {
  let changed = false

  uploaderList.value.forEach((uploader) => {
    const recorded = uploaderLatestVideoTimes.value[String(uploader.mid)]
    if (!recorded || (uploader.hasPostTime && uploader.lastUpdateTime >= recorded.time))
      return

    uploader.lastUpdateTime = recorded.time
    uploader.hasPostTime = true
    changed = true
  })

  if (changed)
    updateUploaderStatus()
}

watch(uploaderLatestVideoTimes, applyRecordedUploaderTimes, { deep: true })

const unreadUploadersCount = computed(() => {
  return uploaderList.value.filter(uploader => uploader.hasUpdate).length
})

// 搜索关键词
const searchKeyword = tabState.ref<string>('searchKeyword', '')

// 显示的UP主列表（支持搜索过滤）
const displayedUploaderList = computed(() => {
  let list = uploaderList.value

  // 如果有搜索关键词，进行过滤
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.trim().toLowerCase()
    list = list.filter(uploader => uploader.name.toLowerCase().includes(keyword))
  }

  return list
})

const uploaderRows = computed<UploaderRow[]>(() => {
  if (settings.value.followingUploaderSort !== 'group' || !followingGroupsLoaded.value) {
    return displayedUploaderList.value.map(uploader => ({
      key: `uploader-${uploader.mid}`,
      type: 'uploader',
      uploader,
    }))
  }

  // 先保留完整的分组结构，再过滤成员，以区分空分组与没有搜索命中的分组。
  const groups = groupFollowingUploaders(uploaderList.value, followingGroups.value, (id) => {
    if (id === 0)
      return t('home.following_default_group')
    if (id === -10)
      return t('home.following_special_group')
    return t('home.following_group_name', { id })
  })
  const keyword = searchKeyword.value.trim().toLowerCase()
  const searching = Boolean(keyword)
  return groups.flatMap((group): UploaderRow[] => {
    const members = searching
      ? group.uploaders.filter(uploader => uploader.name.toLowerCase().includes(keyword))
      : group.uploaders
    // 真正的空分组始终显示，便于新建后立即看到并管理。
    if (searching && group.uploaders.length > 0 && members.length === 0)
      return []
    const expanded = searching || expandedGroupIds.value.includes(group.tagid)
    return [
      {
        key: `group-${group.tagid}`,
        type: 'group',
        id: group.tagid,
        name: group.name,
        count: members.length,
        expanded,
        members,
      },
    ]
  })
})

function toggleGroup(id: number) {
  expandedGroupIds.value = expandedGroupIds.value.includes(id)
    ? expandedGroupIds.value.filter(groupId => groupId !== id)
    : [...expandedGroupIds.value, id]
}

function handleUploaderUnfollowed(mid: number) {
  changedUploaderMids.add(mid)
  uploaderList.value = uploaderList.value.filter(uploader => uploader.mid !== mid)
  if (selectedUploader.value === mid)
    selectUploader(null)
}

function handleUploaderGroupsChanged(mid: number, groupIds: number[]) {
  changedUploaderMids.add(mid)
  const uploader = uploaderList.value.find(uploader => uploader.mid === mid)
  const addedGroupIds = groupIds.filter(id => !uploader?.groupIds.includes(id))
  if (uploader)
    uploader.groupIds = groupIds
  // 只展开新加入的分组；设置特别关注不应同时展开原有的普通分组。
  expandedGroupIds.value = [...new Set([...expandedGroupIds.value, ...addedGroupIds])]
}

function handleFollowingGroupsLoaded(groups: FollowingGroup[]) {
  followingGroups.value = groups
  followingGroupsLoaded.value = true
  groupsRequestFailed.value = false
}

function handleGroupCreated(group: FollowingGroup) {
  followingGroups.value.push(group)
}

function handleGroupRenamed(id: number, name: string) {
  const group = followingGroups.value.find(group => group.tagid === id)
  if (group)
    group.name = name
}

function handleGroupDeleted(id: number) {
  followingGroups.value = followingGroups.value.filter(group => group.tagid !== id)
  expandedGroupIds.value = expandedGroupIds.value.filter(groupId => groupId !== id)
  for (const uploader of uploaderList.value) {
    if (uploader.groupIds.includes(id))
      uploader.groupIds = getFollowingGroupIds(uploader.groupIds.filter(groupId => groupId !== id), 0)
  }
}

async function loadFollowingGroups(force = false) {
  if (!tabState.isCurrent() || groupsLoading.value || (followingGroupsLoaded.value && !force))
    return
  groupsLoading.value = true
  groupsRequestFailed.value = false
  try {
    const response: FollowingGroupsResult = await api.user.getFollowingGroups()
    if (!tabState.isCurrent())
      return
    if (response.code !== 0 || !Array.isArray(response.data))
      throw new Error(response.message || 'Failed to load following groups')
    followingGroups.value = response.data
    followingGroupsLoaded.value = true
  }
  catch (error) {
    if (tabState.isCurrent())
      groupsRequestFailed.value = true
    console.error('[Following] Failed to load following groups:', error)
  }
  finally {
    groupsLoading.value = false
  }
}

watch(() => settings.value.followingUploaderSort, (sort) => {
  if (sort === 'group')
    void loadFollowingGroups(true)
})

const gridKey = computed(() => `following-grid-${selectedUploader.value ?? 'all'}-${videoSearchKeyword.value}`)

// 获取当前用户信息以获取关注列表
async function getCurrentUserInfo() {
  try {
    const response: any = await api.user.getUserInfo()
    if (!tabState.isCurrent())
      return 0
    if (response.code === 0 && response.data?.mid) {
      currentUserMid.value = response.data.mid
      return response.data.mid
    }
  }
  catch (error) {
    console.error('[Following] Failed to get current user info:', error)
  }
  return 0
}

function mapFollowingUploader(user: FollowingRelationUser): UploaderInfo {
  const recordedTime = uploaderLatestVideoTimes.value[String(user.mid)]
  const hasPostTime = Boolean(recordedTime)
  const lastUpdateTime = recordedTime?.time ?? Number(user.mtime || 0) * 1000
  return {
    mid: user.mid,
    name: user.uname,
    face: user.face,
    hasUpdate: false, // 合并后由 updateUploaderStatus 统一计算已读状态。
    hasPostTime,
    lastUpdateTime,
    groupIds: getFollowingGroupIds(user.tag, user.special),
  }
}

// 加载关注列表（独立API）- 渐进式加载所有关注的UP主
async function loadFollowingList() {
  if (!tabState.isCurrent())
    return
  console.log('[Following] Loading all following list...')

  if (!currentUserMid.value) {
    const mid = await getCurrentUserInfo()
    if (!tabState.isCurrent())
      return
    if (!mid) {
      needToLoginFirst.value = true
      return
    }
  }

  try {
    await uploaderLatestVideoTimesReady
    if (!tabState.isCurrent())
      return
    const pageSize = 50
    let hasMore = true
    const recordedTimes = uploaderLatestVideoTimes.value

    // 持续加载所有关注的UP主，每页加载后立即显示
    while (hasMore && tabState.isCurrent()) {
      console.log(`[Following] Loading following list page ${followingPage.value}...`)

      const response: any = await api.user.getUserFollowings({
        vmid: currentUserMid.value.toString(),
        ps: pageSize,
        pn: followingPage.value,
      })
      if (!tabState.isCurrent())
        return

      console.log(`[Following] Following list page ${followingPage.value} response:`, response.code, 'count:', response.data?.list?.length)

      if (response.code === -101) {
        needToLoginFirst.value = true
        return
      }

      if (response.code === 0 && response.data?.list) {
        const followings = response.data.list

        // 立即处理并追加当前页的UP主到列表
        const existingMids = new Set(uploaderList.value.map(uploader => uploader.mid))
        const newUploaders = followings
          .filter((user: FollowingRelationUser) => !existingMids.has(user.mid) && !changedUploaderMids.has(user.mid))
          .map((user: FollowingRelationUser) => mapFollowingUploader(user))

        uploaderList.value = [...uploaderList.value, ...newUploaders]
        updateUploaderStatus()

        console.log(`[Following] Page ${followingPage.value} loaded. Current total:`, uploaderList.value.length)

        // 检查是否还有更多
        const total = response.data.total
        if (followingPage.value * pageSize >= total || followings.length < pageSize) {
          hasMore = false
          followingListLoaded.value = true
          console.log('[Following] All followings loaded. Total:', uploaderList.value.length)
        }
        else {
          followingPage.value++
        }
      }
      else {
        hasMore = false
        console.log('[Following] API returned error code:', response.code)
      }
    }

    if (uploaderList.value.length > 0) {
      console.log('[Following] Successfully loaded', uploaderList.value.length, 'followings')
      console.log('[Following] Loaded recorded uploader times:', Object.keys(recordedTimes).length)
    }
  }
  catch (error) {
    console.error('[Following] Failed to load following list:', error)
  }
}

// 加载关注的直播列表（仅加载正在直播的）
const OFFLINE_LIVE_TEXT = /未开播|休息|离线|下播|轮播|回放/

function isLiveStreamingItem(liveItem: FollowingLiveItem): boolean {
  const liveStatus = Number(liveItem.live_status)
  if (liveStatus !== 1)
    return false

  const statusText = (liveItem.text_small ?? '').trim()
  if (statusText && OFFLINE_LIVE_TEXT.test(statusText))
    return false

  return true
}

async function loadFollowingLiveList(): Promise<VideoElement[]> {
  if (!settings.value.followingTabShowLivestreamingVideos) {
    return []
  }

  try {
    console.log('[Following] Loading following live list...')
    const response: FollowingLiveResult = await api.live.getFollowingLiveList({
      page: 1,
      page_size: 30,
    })
    if (!tabState.isCurrent())
      return []

    if (response.code === 0 && response.data.list) {
      // 只保留正在直播的（live_status === 1）
      const liveItems = response.data.list
        .filter((liveItem: FollowingLiveItem) => isLiveStreamingItem(liveItem))
        .map((liveItem: FollowingLiveItem) => ({
          uniqueId: `live-${liveItem.roomid}`,
          liveItem,
          displayData: mapLiveItemToVideo(liveItem),
          isLive: true,
        }))
      console.log(`[Following] Loaded ${liveItems.length} live streams (filtered from ${response.data.list.length} total)`)
      return liveItems
    }
  }
  catch (error) {
    console.error('[Following] Failed to load live list:', error)
  }

  return []
}

// 加载ALL视图的动态流（渐进式加载，每页加载后立即显示）
async function loadAllViewVideos(maxPages: number = 3, token?: number) {
  if (!tabState.isCurrent())
    return
  console.log('[Following] Loading ALL view videos (max', maxPages, 'pages)...')
  emit('beforeLoading')
  isLoading.value = true
  requestFailed.value = false

  // 追踪每个UP主在ALL视图中的最新视频时间
  const uploaderLatestTimes = new Map<number, number>()

  try {
    // 只在首次加载且未加载过直播列表时，才加载直播列表（防止重复加载）
    if (!allViewOffset.value && !liveListLoaded.value && settings.value.followingTabShowLivestreamingVideos) {
      const liveItems = await loadFollowingLiveList()
      if (!tabState.isCurrent() || (token !== undefined && token !== selectionToken.value))
        return
      if (liveItems.length > 0) {
        videoList.value = [...liveItems, ...videoList.value]
      }
      // 标记为已加载，无论成功与否都不再重复加载
      liveListLoaded.value = true
    }

    let tempOffset = allViewOffset.value || undefined
    let pageCount = 0

    while (pageCount < maxPages && tabState.isCurrent()) {
      pageCount++
      console.log(`[Following] Loading ALL view page ${pageCount}...`)

      const response: MomentResult = await api.moment.getMoments({
        type: 'video',
        offset: tempOffset,
        update_baseline: allViewUpdateBaseline.value || undefined,
      })

      // 竞态条件检查：如果当前选择已改变，停止加载
      if (!tabState.isCurrent() || (token !== undefined && token !== selectionToken.value)) {
        console.log('[Following] Selection changed during load, aborting...')
        return
      }

      if (response.code === -101) {
        needToLoginFirst.value = true
        console.log('[Following] Need to login first')
        return
      }

      if (response.code === 0) {
        const newOffset = response.data.offset
        allViewUpdateBaseline.value = response.data.update_baseline

        // 检查是否有数据
        if (!response.data.items || response.data.items.length === 0) {
          noMoreContent.value = true
          console.log('[Following] No items returned in ALL view')
          break
        }

        if (newOffset === '0' || newOffset === tempOffset) {
          noMoreContent.value = true
          console.log('[Following] No more content in ALL view')
          break
        }
        else {
          tempOffset = newOffset
          allViewOffset.value = newOffset
        }

        response.data.items.forEach((item: MomentItem) => {
          // 如果应该过滤该视频（充电专属视频），则跳过
          if (shouldFilterVideo(item)) {
            return
          }

          const authors: Author[] = []

          if ((item.modules?.module_dynamic?.major?.archive?.stat as any)?.coop_num) {
            (item.modules.module_dynamic.major.archive as any).coop_info?.forEach((coop: any) => {
              authors.push({
                name: coop.name,
                authorFace: coop.face,
                mid: coop.mid,
              })
            })
          }
          else {
            authors.push({
              name: item.modules?.module_author?.name,
              authorFace: item.modules?.module_author?.face,
              mid: item.modules?.module_author?.mid,
            })
          }

          // 提取视频发布时间，更新UP主最新时间
          const pubTs = item.modules?.module_author?.pub_ts
          if (pubTs) {
            const videoTime = pubTs * 1000
            authors.forEach((author) => {
              if (author.mid) {
                const currentLatest = uploaderLatestTimes.get(author.mid) || 0
                if (videoTime > currentLatest) {
                  uploaderLatestTimes.set(author.mid, videoTime)
                }
              }
            })
          }

          const major = item.modules?.module_dynamic?.major
          videoList.value.push({
            uniqueId: `following-all-${item.id_str}`,
            bvid: major?.archive?.bvid || major?.ugc_season?.bvid,
            item,
            authorList: authors,
            displayData: mapMomentItemToVideo(item, authors),
          })
        })

        console.log(`[Following] ALL view page ${pageCount} loaded. Total videos:`, videoList.value.length)
      }
      else {
        console.error('[Following] API returned error code:', response.code)
        requestFailed.value = true
        noMoreContent.value = true // 出错时也设置 noMoreContent
        break
      }
    }

    console.log('[Following] ALL view loading complete. Total:', videoList.value.length, 'videos')

    // 再次检查 token，防止在处理缓存更新期间选择改变
    if (!tabState.isCurrent() || (token !== undefined && token !== selectionToken.value)) {
      console.log('[Following] Selection changed during cache update, aborting...')
      return
    }

    // 记录从ALL视图中提取的最新投稿时间
    void recordUploaderLatestVideoTimes(
      Array.from(uploaderLatestTimes, ([mid, time]) => ({ mid, time })),
      'following-all',
    )

    let updatedCount = 0
    let markedAsViewedCount = 0
    uploaderLatestTimes.forEach((time, mid) => {
      const uploader = uploaderList.value.find(u => u.mid === mid)
      if (uploader) {
        const knownPostTime = uploader.hasPostTime ? uploader.lastUpdateTime : 0

        if (time > knownPostTime) {
          uploader.lastUpdateTime = time
          uploader.hasPostTime = true
          updatedCount++
          console.log(`[Following] Updated time for UP ${mid} from ALL view: ${new Date(time).toLocaleString()}`)
        }

        // 用户在ALL视图中看到了该UP主的投稿，标记为已查看
        // 使用该UP主在ALL视图中的最新投稿时间作为已查看时间
        const viewed = getViewedUploaders()
        const lastViewedTime = viewed[mid] || 0

        // 如果当前看到的时间等于或晚于已知的最新时间，更新已查看时间
        if (time >= uploader.lastUpdateTime && time > lastViewedTime) {
          markUploaderAsViewed(mid, time)
          markedAsViewedCount++
        }
        else {
          // 即使不标记为已查看，也需要重新计算hasUpdate
          uploader.hasUpdate = calculateHasUpdate(uploader.lastUpdateTime, lastViewedTime)
        }
      }
    })

    if (updatedCount > 0) {
      console.log(`[Following] Updated ${updatedCount} uploader times from ALL view`)
    }
    if (markedAsViewedCount > 0) {
      console.log(`[Following] Marked ${markedAsViewedCount} uploaders as viewed from ALL view`)
    }
    if (updatedCount > 0 || markedAsViewedCount > 0) {
      sortUploaderList(selectedUploader.value)
    }

    // 如果一条视频都没加载到，设置 noMoreContent
    if (videoList.value.length === 0) {
      noMoreContent.value = true
    }
  }
  catch (error) {
    if (!tabState.isCurrent() || (token !== undefined && token !== selectionToken.value))
      return
    console.error('[Following] Failed to load ALL view:', error)
    requestFailed.value = true
    noMoreContent.value = true // 异常时也设置 noMoreContent
  }
  finally {
    // 只有当前 token 仍然有效时才清除加载状态
    if (tabState.isCurrent() && (token === undefined || token === selectionToken.value)) {
      hasLoaded.value = true
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

// 加载单个UP主的动态（渐进式加载，每页加载后立即显示）
async function loadUserMoments(mid: number, maxPages: number = 3, token?: number) {
  if (!tabState.isCurrent())
    return
  console.log('[Following] Loading moments for UP', mid, '(max', maxPages, 'pages)...')
  emit('beforeLoading')
  isLoading.value = true
  requestFailed.value = false
  const pinScrollToStart = videoList.value.length === 0

  // 收集本次点击后实际加载到的视频时间
  const allVideoTimes: number[] = []
  const loadedIds = new Set(videoList.value.map(video => video.uniqueId))

  try {
    let tempOffset = userMomentsOffset.value || undefined
    let pageCount = 0

    while (pageCount < maxPages && tabState.isCurrent()) {
      pageCount++
      console.log(`[Following] Loading user moments page ${pageCount}...`)

      const response: MomentResult = await api.moment.getUserMoments({
        host_mid: mid.toString(),
        offset: tempOffset,
        features: 'itemOpusStyle',
      })

      // 竞态条件检查：如果当前选择已改变，停止加载
      if (!tabState.isCurrent() || (token !== undefined && token !== selectionToken.value)) {
        console.log('[Following] Selection changed during load, aborting...')
        return
      }

      console.log('[Following] API Response:', response)

      if (response.code === -101) {
        needToLoginFirst.value = true
        console.log('[Following] Need to login first')
        return
      }

      if (response.code === 0) {
        const newOffset = response.data.offset
        const items = response.data.items || []
        // 末页仍可能包含视频，先消费数据再结束分页；不能仅靠 offset 判断。
        const reachedEnd = !response.data.has_more || !newOffset || newOffset === '0'
          || newOffset === tempOffset || items.length === 0

        items.forEach((item: MomentItem) => {
          const uniqueId = `user-moment-${item.id_str}`
          // 置顶或分页重叠可能重复返回动态，重复 key 会破坏卡片窗口的滚动锚点。
          if (loadedIds.has(uniqueId))
            return
          // 只处理包含视频的动态（投稿 archive / 合集订阅 ugc_season）
          const major = item.modules?.module_dynamic?.major
          if (!major?.archive && !major?.ugc_season) {
            return
          }

          // 如果应该过滤该视频（充电专属视频），则跳过
          if (shouldFilterVideo(item)) {
            return
          }

          const authors: Author[] = []

          if ((major.archive?.stat as any)?.coop_num) {
            (major.archive as any).coop_info?.forEach((coop: any) => {
              authors.push({
                name: coop.name,
                authorFace: coop.face,
                mid: coop.mid,
              })
            })
          }
          else {
            authors.push({
              name: item.modules?.module_author?.name,
              authorFace: item.modules?.module_author?.face,
              mid: item.modules?.module_author?.mid,
            })
          }

          const displayData = mapMomentItemToVideo(item, authors)
          if (displayData) {
            const time = item.modules.module_author.pub_ts * 1000

            videoList.value.push({
              uniqueId,
              bvid: major.archive?.bvid || major.ugc_season?.bvid,
              item,
              authorList: authors,
              displayData,
            })

            loadedIds.add(uniqueId)
            allVideoTimes.push(time) // 收集所有视频时间
          }
        })

        console.log(`[Following] User moments page ${pageCount} loaded. Total:`, videoList.value.length)
        if (pinScrollToStart)
          pinFeedScrollToStart()
        if (reachedEnd) {
          noMoreContent.value = true
          break
        }
        tempOffset = newOffset
        userMomentsOffset.value = newOffset
      }
      else {
        console.error('[Following] API returned error code:', response.code)
        requestFailed.value = true
        noMoreContent.value = true // 出错时也设置 noMoreContent
        break
      }
    }

    // 加载完成后，用点击后实际取得的最新投稿时间更新排序
    if (allVideoTimes.length > 0) {
      // 再次检查 token，防止在处理缓存更新期间选择改变
      if (!tabState.isCurrent() || (token !== undefined && token !== selectionToken.value)) {
        console.log('[Following] Selection changed during cache update, aborting...')
        return
      }

      const uploader = uploaderList.value.find(u => u.mid === mid)
      if (uploader) {
        // 排序视频时间（降序）
        allVideoTimes.sort((a, b) => b - a)

        // 计算最新视频时间（考虑置顶）
        const latestTime = allVideoTimes.length === 1
          ? allVideoTimes[0]
          : Math.max(allVideoTimes[0], allVideoTimes[1])

        const knownLatestTime = uploader.hasPostTime
          ? Math.max(uploader.lastUpdateTime, latestTime)
          : latestTime
        uploader.lastUpdateTime = knownLatestTime
        uploader.hasPostTime = true
        void recordUploaderLatestVideoTimes(
          [{ mid, time: knownLatestTime }],
          'following-selected',
        )

        // 用户主动点击TAB查看，标记为已查看
        markUploaderAsViewed(mid, knownLatestTime)

        sortUploaderList(selectedUploader.value)

        console.log(`[Following] Updated data for UP ${mid} from selected view: time=${new Date(knownLatestTime).toLocaleString()}`)
      }
    }

    console.log('[Following] User moments loading complete. Total:', videoList.value.length, 'videos')

    // 初始加载后如果没有任何视频，结束分页，避免空列表触底把全部历史刷完。
    if (videoList.value.length === 0)
      noMoreContent.value = true
  }
  catch (error) {
    if (!tabState.isCurrent() || (token !== undefined && token !== selectionToken.value))
      return
    console.error('[Following] Failed to load user moments:', error)
    requestFailed.value = true
    noMoreContent.value = true // 异常时也设置 noMoreContent
  }
  finally {
    // 只有当前 token 仍然有效时才清除加载状态
    if (tabState.isCurrent() && (token === undefined || token === selectionToken.value)) {
      hasLoaded.value = true
      isLoading.value = false
      emit('afterLoading')
      if (pinScrollToStart)
        pinFeedScrollToStart()
    }
  }
}

// 搜索使用投稿接口；不能用已加载的动态做本地关键词过滤。
async function loadUserVideoSearch(mid: number, token: number) {
  const keyword = videoSearchKeyword.value
  if (!tabState.isCurrent() || !keyword)
    return

  const page = userVideosPage.value
  const pinScrollToStart = videoList.value.length === 0
  emit('beforeLoading')
  isLoading.value = true
  requestFailed.value = false

  try {
    const response: UserVideosResult = await api.user.getUserVideos({
      mid: String(mid),
      keyword,
      pn: page,
      ps: USER_VIDEOS_PAGE_SIZE,
      order: 'pubdate',
    })
    if (!tabState.isCurrent() || token !== selectionToken.value)
      return

    if (response.code === -101) {
      needToLoginFirst.value = true
      return
    }

    const data = response.data
    // 风控可能返回 code=0，不能将校验响应显示成“没有结果”。
    if (response.code !== 0 || data?.is_risk || data?.gaia_res_type
      || !Array.isArray(data?.list?.vlist) || !Number.isFinite(data?.page?.count)
      || !(data?.page?.ps > 0)) {
      throw new Error(response.message || 'Failed to search uploader videos')
    }

    const loadedIds = new Set(videoList.value.map(video => video.uniqueId))
    for (const item of data.list.vlist) {
      const uniqueId = `user-video-${item.aid}`
      if (loadedIds.has(uniqueId))
        continue
      if (settings.value.followingFilterChargingVideos && (item.is_charging_arc || item.elec_arc_type === 1))
        continue
      videoList.value.push({
        uniqueId,
        bvid: item.bvid,
        displayData: mapUserVideoToVideo(item),
      })
      loadedIds.add(uniqueId)
    }

    // 按接口的原始数量分页，过滤充电视频或去重不应提前结束搜索。
    userVideosPage.value = page + 1
    noMoreContent.value = data.list.vlist.length === 0 || page * data.page.ps >= data.page.count
    void fillSearchAuthorFaces(token)
  }
  catch (error) {
    if (!tabState.isCurrent() || token !== selectionToken.value)
      return
    console.error('[Following] Failed to search uploader videos:', error)
    requestFailed.value = true
  }
  finally {
    if (tabState.isCurrent() && token === selectionToken.value) {
      hasLoaded.value = true
      isLoading.value = false
      emit('afterLoading')
      if (pinScrollToStart)
        pinFeedScrollToStart()
    }
  }
}

function loadSelectedUploaderVideos(mid: number, maxPages: number, token: number) {
  return videoSearchKeyword.value
    ? loadUserVideoSearch(mid, token)
    : loadUserMoments(mid, maxPages, token)
}

function searchUploaderVideos() {
  if (!tabState.isCurrent() || selectedUploader.value === null)
    return
  const keyword = videoSearchInput.value.trim()
  videoSearchInput.value = keyword
  if (keyword === videoSearchKeyword.value && !requestFailed.value)
    return
  videoSearchKeyword.value = keyword
  initData()
}

function clearVideoSearch() {
  videoSearchInput.value = ''
  searchUploaderVideos()
}

watch(videoSearchInput, (value) => {
  if (!value.trim() && videoSearchKeyword.value)
    clearVideoSearch()
})

function loadMoreSearchVideos() {
  if (selectedUploader.value === null || isLoading.value || noMoreContent.value || needToLoginFirst.value)
    return
  void loadUserVideoSearch(selectedUploader.value, selectionToken.value)
}

// 切换UP主
function selectUploader(mid: number | null) {
  if (!tabState.isCurrent())
    return
  hasLoaded.value = false
  console.log('[Following] Selecting uploader:', mid === null ? 'All' : mid)

  // 生成新的选择令牌，用于防止竞态条件
  const currentToken = ++selectionToken.value

  // 停留在信息流起始位置加载，避免短列表持续触底把视口带到底部。
  pinFeedScrollToStart()

  // 重置视频列表和分页状态
  videoList.value = []
  noMoreContent.value = false
  needToLoginFirst.value = false
  videoSearchInput.value = ''
  videoSearchKeyword.value = ''
  userVideosPage.value = 1

  if (mid === null) {
    // 切换到ALL视图
    console.log('[Following] Switching to All view')

    if (previousSelectedUploader.value !== null) {
      sortUploaderList(null)
    }

    selectedUploader.value = null
    previousSelectedUploader.value = null
    suppressUploaderAutoLoadMore.value = false

    // 重置ALL视图分页和直播加载标志
    allViewOffset.value = ''
    allViewUpdateBaseline.value = ''
    liveListLoaded.value = false // 重置直播加载标志，允许重新加载

    // 加载ALL视图（初始加载3页，每页加载后立即显示）
    loadAllViewVideos(3, currentToken)
  }
  else {
    // 切换到具体UP主
    console.log('[Following] Selecting uploader:', mid)

    markUploaderAsViewed(mid)

    if (previousSelectedUploader.value !== null && previousSelectedUploader.value !== mid) {
      sortUploaderList(mid)
    }

    selectedUploader.value = mid
    previousSelectedUploader.value = mid
    suppressUploaderAutoLoadMore.value = true

    // 重置用户动态分页
    userMomentsOffset.value = ''

    // 加载UP主动态（初始加载3页，每页加载后立即显示）
    loadUserMoments(mid, 3, currentToken)
  }
}

function getSearchAuthorFace(mid: number): Promise<string | undefined> {
  const cached = searchAuthorFaceRequests.get(mid)
  if (cached)
    return cached

  const request = (async () => {
    try {
      const response = await api.user.getUserCard({ mid: String(mid) })
      const card = response?.data?.card
      if (response?.code === 0 && Number(card?.mid) === mid && typeof card.face === 'string' && card.face)
        return card.face as string
    }
    catch {
      // 头像补取失败不应影响搜索结果；后续加载时可以重试。
    }
    return undefined
  })()
  searchAuthorFaceRequests.set(mid, request)
  void request.then((face) => {
    if (!face)
      searchAuthorFaceRequests.delete(mid)
    // 限制长时间浏览时的缓存体积。
    if (searchAuthorFaceRequests.size > 100)
      searchAuthorFaceRequests.delete(searchAuthorFaceRequests.keys().next().value!)
  })
  return request
}

async function fillSearchAuthorFaces(token: number) {
  const missingAuthors = new Map<number, Author[]>()
  for (const video of videoList.value) {
    const author = video.displayData?.author
    if (!author || Array.isArray(author) || author.authorFace || !author.mid)
      continue
    const authors = missingAuthors.get(author.mid) ?? []
    authors.push(author)
    missingAuthors.set(author.mid, authors)
  }

  // 逐个作者补取，避免联合投稿较多时同时发起大量请求。
  for (const [mid, authors] of missingAuthors) {
    if (!tabState.isCurrent() || token !== selectionToken.value)
      return
    const face = await getSearchAuthorFace(mid)
    if (!tabState.isCurrent() || token !== selectionToken.value)
      return
    if (face) {
      for (const author of authors)
        author.authorFace = face
    }
  }
}

function mapUserVideoToVideo(item: UserVideo): Video {
  const uploader = uploaderList.value.find(uploader => uploader.mid === item.mid)
  return {
    id: item.aid,
    bvid: item.bvid,
    sourceUploaderMid: selectedUploader.value ?? undefined,
    title: decodeHtmlEntities(item.title.replace(/<\/?em\b[^>]*>/gi, '')),
    desc: decodeHtmlEntities(item.description),
    cover: item.pic,
    durationStr: item.length,
    author: {
      name: decodeHtmlEntities(item.author),
      mid: item.mid,
      authorFace: uploader?.face ?? '',
    },
    view: parseStatNumber(item.play),
    danmaku: item.video_review,
    publishedTimestamp: item.created,
    capsuleText: calcTimeSince(item.created * 1000),
    tag: item.is_union_video ? t('home.collaboration') : undefined,
    threePointV2: [],
  }
}

// 将直播item转换为Video格式
function mapLiveItemToVideo(liveItem: FollowingLiveItem): Video {
  return {
    id: liveItem.roomid,
    title: decodeHtmlEntities(liveItem.title),
    cover: liveItem.room_cover,
    author: {
      name: decodeHtmlEntities(liveItem.uname),
      authorFace: liveItem.face,
      mid: liveItem.uid,
    },
    viewStr: liveItem.text_small,
    tag: decodeHtmlEntities(liveItem.area_name_v2),
    roomid: liveItem.roomid,
    liveStatus: liveItem.live_status,
    threePointV2: [],
  }
}

// 将moment item转换为Video格式（含合集订阅 ugc_season）
function mapMomentItemToVideo(item?: MomentItem, authors?: Author[]): Video | undefined {
  if (!item)
    return undefined

  const major = item.modules?.module_dynamic?.major
  const archive = major?.archive || major?.ugc_season
  if (!archive)
    return undefined

  const stat = archive.stat
  const likeCount = item.modules?.module_stat?.like?.count

  const decodedAuthors = authors?.map(author => ({
    ...author,
    name: decodeHtmlEntities(author.name),
  }))

  const authorValue = decodedAuthors && decodedAuthors.length > 0
    ? (decodedAuthors.length === 1 ? decodedAuthors[0] : decodedAuthors)
    : undefined

  const isCollaboration = authors && authors.length > 1

  const badge = archive.badge?.text && archive.badge.text !== '投稿视频'
    ? {
        bgColor: archive.badge.bg_color,
        color: archive.badge.color,
        iconUrl: archive.badge.icon_url || undefined,
        text: decodeHtmlEntities(archive.badge.text),
      }
    : undefined

  const id = Number.parseInt(archive.aid, 10)

  return {
    id: Number.isNaN(id) ? 0 : id,
    durationStr: archive.duration_text,
    title: decodeHtmlEntities(archive.title),
    desc: decodeHtmlEntities(archive.desc),
    cover: archive.cover,
    author: authorValue,
    view: parseStatNumber(stat?.play),
    viewStr: stat?.play,
    danmaku: parseStatNumber(stat?.danmaku),
    danmakuStr: stat?.danmaku,
    like: typeof likeCount === 'number' ? likeCount : parseStatNumber(stat?.like),
    likeStr: stat?.like_str ?? stat?.like,
    capsuleText: decodeHtmlEntities(item.modules?.module_author?.pub_time?.trim() || undefined),
    publishedTimestamp: item.modules?.module_author?.pub_ts,
    bvid: archive.bvid,
    badge,
    tag: isCollaboration ? t('home.collaboration') : undefined,
    threePointV2: [],
  }
}

function transformVideoItem(item: VideoElement): Video | undefined {
  return item.displayData
}

// 加载更多
async function handleLoadMore() {
  if (!tabState.isCurrent())
    return
  if (isLoading.value || noMoreContent.value)
    return
  if (videoSearchKeyword.value && (requestFailed.value || needToLoginFirst.value))
    return
  if (suppressUploaderAutoLoadMore.value && selectedUploader.value !== null)
    return

  console.log('[Following] Loading more...')

  if (selectedUploader.value === null) {
    // ALL视图：继续加载视频
    await loadAllViewVideos(1, selectionToken.value)
  }
  else {
    await loadSelectedUploaderVideos(selectedUploader.value, 1, selectionToken.value)
  }
}

// 初始化
function initData() {
  if (!tabState.isCurrent())
    return
  hasLoaded.value = false
  console.log('[Following] Initializing...')

  // 生成新的令牌，确保旧的加载请求被取消
  const token = ++selectionToken.value

  // 保存当前选中的UP主
  const currentSelectedUploader = selectedUploader.value

  videoList.value = []
  allViewOffset.value = ''
  allViewUpdateBaseline.value = ''
  userMomentsOffset.value = ''
  userVideosPage.value = 1
  noMoreContent.value = false
  needToLoginFirst.value = false
  requestFailed.value = false
  liveListLoaded.value = false // 重置直播加载标志

  // 如果当前已经选中了某个UP主，刷新该UP主的动态
  if (currentSelectedUploader !== null) {
    console.log('[Following] Refreshing moments for UP', currentSelectedUploader)
    suppressUploaderAutoLoadMore.value = true
    pinFeedScrollToStart()
    loadSelectedUploaderVideos(currentSelectedUploader, 3, selectionToken.value)
  }
  else {
    // 否则，先加载关注列表，然后加载ALL视图
    if (!followingListLoaded.value) {
      // 设置加载状态，避免显示"没有数据"
      isLoading.value = true
      emit('beforeLoading')

      loadFollowingList().then(() => {
        if (!tabState.isCurrent() || token !== selectionToken.value)
          return
        console.log('[Following] Following list loaded')
        // 初始化“全部”只加载数据；主动切换 UP 主时才滚动到信息流起点。
        loadAllViewVideos(3, token)
      }).catch((error) => {
        if (!tabState.isCurrent() || token !== selectionToken.value)
          return
        console.error('[Following] Failed to initialize:', error)
        isLoading.value = false
        emit('afterLoading')
      })
    }
    else {
      // 如果关注列表已经加载过，直接刷新ALL视图
      console.log('[Following] Refreshing ALL view')
      loadAllViewVideos(3, selectionToken.value)
    }
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

onMounted(() => {
  emitter.on(OVERLAY_SCROLL_BAR_SCROLL, handleFeedScroll)
  if (!tabState.isCurrent())
    return
  if (settings.value.followingUploaderSort === 'group')
    void loadFollowingGroups(true)
  if (uploaderScrollRef.value)
    uploaderScrollRef.value.scrollTop = tabState.read('uploaderScrollTop', 0)
  isRefreshContextActive.value = true
  syncRefreshAvailability()
  initPageAction()
  if (!tabState.restored) {
    initData()
    return
  }
  if (!followingListLoaded.value && !needToLoginFirst.value)
    void loadFollowingList()
  if (selectedUploader.value !== null)
    suppressUploaderAutoLoadMore.value = true
  if (videoSearchKeyword.value && videoList.value.length > 0)
    void fillSearchAuthorFaces(selectionToken.value)
  if (!hasLoaded.value && videoList.value.length === 0) {
    if (selectedUploader.value === null) {
      void loadAllViewVideos(3, selectionToken.value)
    }
    else {
      pinFeedScrollToStart()
      void loadSelectedUploaderVideos(selectedUploader.value, 3, selectionToken.value)
    }
  }
})

onBeforeUnmount(() => {
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, handleFeedScroll)
  selectionToken.value++
  isRefreshContextActive.value = false
  if (tabState.isActiveTab())
    syncRefreshAvailability()
})

function initPageAction() {
  if (!tabState.isCurrent())
    return
  // VideoCardGrid owns infinite scrolling. Clear callbacks left by the previous tab.
  handleReachBottom.value = undefined

  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    initData()
  }
}

defineExpose({ initData })
</script>

<template>
  <div class="following-layout" flex="~ gap-40px">
    <!-- Left Panel: Uploader List -->
    <aside class="uploader-sidebar" w-200px shrink-0>
      <div class="uploader-scroll bew-page-sidebar">
        <div class="following-display-toggle bew-segment-control bew-segment-control--static" role="group" :aria-label="$t('settings.following_sort')">
          <button
            v-for="mode in (['updated', 'group'] as const)"
            :key="mode"
            type="button"
            class="bew-segment-control__item"
            :data-active="settings.followingUploaderSort === mode"
            :aria-pressed="settings.followingUploaderSort === mode"
            @click="settings.followingUploaderSort = mode"
          >
            {{ $t(mode === 'group' ? 'home.following_display_grouped' : 'home.following_display_flat') }}
          </button>
        </div>
        <!-- Search Box -->
        <div class="bew-toolbar-controls" mb-3>
          <Input
            v-model="searchKeyword"
            type="text"
            :placeholder="$t('common.search')"
            :aria-label="$t('common.search')"
          />
        </div>

        <div
          v-if="settings.followingUploaderSort === 'group' && (groupsLoading || groupsRequestFailed)"
          class="group-status"
          aria-live="polite"
        >
          <span v-if="groupsLoading">{{ $t('common.loading') }}</span>
          <template v-else-if="groupsRequestFailed">
            <span>{{ $t('home.following_groups_load_failed') }}</span>
            <button type="button" class="group-retry" @click="loadFollowingGroups(true)">
              {{ $t('home.following_groups_retry') }}
            </button>
          </template>
        </div>

        <!-- 分组一次可能移除数百个成员，直接更新列表，避免退出动画的绝对定位行覆盖其他按钮。 -->
        <ul ref="uploaderScrollRef" class="uploader-list" flex="~ col gap-2">
          <!-- All Uploaders Option -->
          <li key="all-uploaders">
            <button
              type="button"
              class="uploader-button bew-page-nav-item"
              :aria-pressed="selectedUploader === null"
              :data-active="selectedUploader === null"
              flex="~ items-center gap-3"
              @click="selectUploader(null)"
            >
              <div
                w-30px h-30px rounded-full
                bg="$bew-fill-2" flex="~ items-center justify-center"
                shrink-0
              >
                <div i-mingcute:classify-2-fill text-lg />
              </div>
              <div class="all-uploader-labels" flex-1 overflow-hidden>
                <div font-medium>
                  {{ $t('topbar.moments_dropdown.tabs.all') }}
                </div>
                <div
                  v-if="unreadUploadersCount > 0"
                  class="secondary-text"
                >
                  {{ $t('home.uploaders_with_updates', { count: unreadUploadersCount }) }}
                </div>
              </div>
            </button>
          </li>

          <!-- 分组标题和成员随搜索框下方的列表整体滚动。 -->
          <li
            v-for="row in uploaderRows" :key="row.key"
            :class="{ 'uploader-group': row.type === 'group' }"
          >
            <button
              v-if="row.type === 'group'"
              type="button"
              class="uploader-group-heading"
              aria-haspopup="menu"
              :aria-expanded="row.expanded"
              :disabled="Boolean(searchKeyword.trim())"
              :title="row.name"
              @click="toggleGroup(row.id)"
              @contextmenu.prevent.stop="groupMenuRef?.open($event, row.id, row.name)"
            >
              <span :class="row.expanded ? 'i-mingcute:down-line' : 'i-mingcute:right-line'" aria-hidden="true" />
              <span class="group-name">{{ row.name }}</span>
              <span class="group-count">{{ row.count }}</span>
            </button>
            <ul
              v-if="row.type === 'uploader' || row.expanded"
              :class="{ 'group-members': row.type === 'group' }"
              :aria-label="row.type === 'group' ? row.name : undefined"
            >
              <li v-for="uploader in row.type === 'group' ? row.members : [row.uploader]" :key="uploader.mid">
                <button
                  type="button"
                  class="uploader-button bew-page-nav-item"
                  aria-haspopup="menu"
                  :aria-pressed="selectedUploader === uploader.mid"
                  :data-active="selectedUploader === uploader.mid"
                  flex="~ items-center gap-3"
                  @click="selectUploader(uploader.mid)"
                  @contextmenu.prevent.stop="uploaderMenuRef?.open($event, uploader)"
                >
                  <div pos="relative" shrink-0>
                    <img
                      :src="`${uploader.face}@50w_50h`"
                      w-30px h-30px rounded-full object-cover
                      loading="lazy"
                      alt="Avatar"
                    >
                    <!-- Red dot for new updates -->
                    <div
                      v-if="uploader.hasUpdate"
                      pos="absolute top-0 right-0"
                      w-8px h-8px rounded-full
                      bg="red-500" border="2 $bew-elevated"
                    />
                  </div>
                  <div flex-1 overflow-hidden>
                    <div font-medium truncate>
                      {{ uploader.name }}
                    </div>
                    <div class="secondary-text">
                      {{ calcTimeSince(uploader.lastUpdateTime) }}
                    </div>
                  </div>
                </button>
              </li>
            </ul>
          </li>
          <li v-if="settings.followingUploaderSort === 'group'" key="create-group">
            <button
              type="button"
              class="uploader-group-heading create-group-button"
              :disabled="!followingGroupsLoaded || groupsLoading"
              @click="groupMenuRef?.create()"
            >
              <span class="i-mingcute:folder-add-line" aria-hidden="true" />
              <span class="group-name">{{ $t('home.following_create_group') }}</span>
            </button>
          </li>
        </ul>
        <p v-if="searchKeyword.trim() && displayedUploaderList.length === 0" class="group-status" role="status">
          {{ $t('common.no_data') }}
        </p>
      </div>
    </aside>

    <!-- Right Panel: Video Feed -->
    <div w-full min-w-0>
      <form
        v-if="selectedUploader !== null"
        class="video-search bew-toolbar-controls"
        role="search"
        :aria-label="videoSearchPlaceholder"
        @submit.prevent="searchUploaderVideos"
      >
        <Input
          v-model="videoSearchInput"
          class="video-search-field"
          type="text"
          :placeholder="videoSearchPlaceholder"
          :aria-label="videoSearchPlaceholder"
        >
          <template #suffix>
            <button
              v-if="videoSearchInput || videoSearchKeyword"
              type="button"
              class="video-search-clear"
              :aria-label="$t('home.following_clear_video_search')"
              :title="$t('home.following_clear_video_search')"
              @click="clearVideoSearch"
            >
              <span i-mingcute:close-line aria-hidden="true" />
            </button>
          </template>
        </Input>
        <Button type="secondary">
          <template #left>
            <span i-mingcute:search-line aria-hidden="true" />
          </template>
          {{ $t('common.search') }}
        </Button>
      </form>
      <VideoCardGrid
        :key="gridKey"
        :items="videoList"
        :grid-layout="gridLayout"
        :loading="isLoading"
        :no-more-content="noMoreContent"
        :need-to-login-first="needToLoginFirst"
        :request-failed="requestFailed"
        :empty-description="videoSearchKeyword ? (requestFailed ? $t('search.search_failed') : $t('home.following_no_search_results')) : undefined"
        :show-loading-more-skeleton="selectedUploader === null"
        :transform-item="transformVideoItem"
        :get-item-key="(item: VideoElement) => item.uniqueId"
        :show-watcher-later="false"
        is-following-page
        show-preview
        @refresh="initData"
        @login="jumpToLoginPage"
        @load-more="handleLoadMore"
      />
      <div
        v-if="videoSearchKeyword && !noMoreContent && !needToLoginFirst && !isLoading"
        class="video-search-pagination"
      >
        <p v-if="requestFailed && videoList.length > 0" role="status">
          {{ $t('search.search_failed') }}
        </p>
        <Button v-if="videoList.length > 0 || !requestFailed" type="secondary" @click="loadMoreSearchVideos">
          {{ requestFailed ? $t('home.following_groups_retry') : $t('common.load_more') }}
        </Button>
      </div>
    </div>
    <FollowingUploaderMenu
      ref="uploaderMenuRef"
      @unfollowed="handleUploaderUnfollowed"
      @groups-changed="handleUploaderGroupsChanged"
      @groups-loaded="handleFollowingGroupsLoaded"
    />
    <FollowingGroupMenu
      ref="groupMenuRef"
      @created="handleGroupCreated"
      @renamed="handleGroupRenamed"
      @deleted="handleGroupDeleted"
    />
  </div>
</template>

<style lang="scss" scoped>
.video-search {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin-bottom: var(--bew-space-6);
}

.video-search-field {
  flex: 1;
  min-width: 0;
}

.video-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--bew-control-item-height);
  height: var(--bew-control-item-height);
  color: var(--bew-text-2);
  font-size: var(--bew-icon-size-sm);
  border-radius: var(--bew-interactive-radius);
  cursor: pointer;

  &:hover {
    color: var(--bew-text-1);
    background: var(--bew-fill-2);
  }

  &:active {
    background: var(--bew-fill-3);
  }
}

.video-search-pagination {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bew-space-3);
  padding-block: var(--bew-space-4);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.following-layout {
  // 切换 UP 时视频网格会短暂清空。父容器仍需容纳侧栏高度与 sticky 顶部偏移，
  // 否则 sticky 会被父容器底边推回文档流位置，造成整个侧栏先上移再下移。
  min-height: calc(100vh - var(--bew-space-2));
}

.uploader-sidebar {
  // sticky 顶部偏移与高度使用同一基准，避免侧栏底部越出视口后被回顶/焦点滚动纠正。
  // 与首页固定标签栏的 10px 顶部偏移一致，并在标签栏下保留标准区块间距。
  --following-sidebar-top: calc(var(--bew-top-bar-height) + 10px + var(--bew-control-height) + var(--bew-space-4));
  position: sticky;
  top: var(--following-sidebar-top);
  align-self: flex-start;
  height: calc(100vh - var(--following-sidebar-top) - var(--bew-space-2));
}

.uploader-scroll {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 0 var(--bew-space-2) var(--bew-space-2);

  > :not(.uploader-list) {
    flex-shrink: 0;
  }
  // 点击后的状态变化不应触发浏览器滚动锚定，滚动到边缘也不穿透到右侧信息流。
  overflow-anchor: none;
  overscroll-behavior-y: contain;
}

.following-display-toggle {
  width: 100%;
  margin-bottom: var(--bew-space-3);

  .bew-segment-control__item {
    flex: 1;
    min-width: 0;
    padding-inline: var(--bew-space-1);
  }
}

.uploader-list {
  flex: 1;
  min-height: 0;
  overflow: hidden auto;
  // 始终预留空间，避免滚动条出现时改变侧栏内容宽度。
  scrollbar-gutter: stable;
  overscroll-behavior-y: contain;

  > li {
    flex-shrink: 0;
  }
}

.uploader-group {
  display: flex;
  flex-direction: column;

  > .uploader-group-heading {
    flex-shrink: 0;
  }
}

.group-members {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);

  > li {
    flex-shrink: 0;
  }
}

.group-status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--bew-space-2);
  color: var(--bew-control-surface-muted);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);

  &:not(:empty) {
    margin-bottom: var(--bew-space-3);
  }
}

.uploader-button {
  width: 100%;
  text-align: start;
}

.all-uploader-labels {
  display: flex;
  flex-direction: column;
  justify-content: center;
  // 保持双行高度；没有更新提示时让单行标题居中，避免列表上下跳动。
  min-height: calc(var(--bew-line-height-control) + var(--bew-line-height-caption));
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.uploader-group-heading,
.group-retry {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: var(--bew-control-height);
  padding: var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-control-surface-muted);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--bew-fill-2);
    color: var(--bew-text-1);
  }

  &:active:not(:disabled) {
    background: var(--bew-fill-3);
  }

  &:disabled {
    cursor: default;
  }
}

.create-group-button {
  border: 1px dashed var(--bew-border-color);

  &:hover:not(:disabled) {
    border-color: var(--bew-theme-color);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.uploader-group-heading {
  width: 100%;
  text-align: start;

  > :first-child {
    flex-shrink: 0;
    font-size: var(--bew-icon-size-sm);
  }
}

.group-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  flex-shrink: 0;
}

.secondary-text {
  color: var(--bew-control-surface-muted);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.uploader-button[data-active="true"] .secondary-text {
  color: var(--bew-text-auto);
  opacity: 0.85;
}
</style>
