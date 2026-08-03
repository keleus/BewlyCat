<script setup lang="ts">
/**
 * Following Component - 正在关注页面
 *
 * ## 功能概述
 * 显示用户关注的UP主列表及其视频动态流。支持两种视图模式：
 * 1. ALL视图：显示所有关注UP主的混合视频流
 * 2. 单UP主视图：显示特定UP主的视频动态
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
 * UP主列表按最新投稿时间降序排列；没有投稿记录时使用关注时间。
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
import api from '~/utils/api'
import { calcTimeSince, parseStatNumber } from '~/utils/dataFormatter'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

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
}

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

useI18n()

const { scrollViewportRef, handlePageRefresh, handleReachBottom, canRefreshHomeSubPage } = useBewlyApp()
const videoList = ref<VideoElement[]>([])
const uploaderList = ref<UploaderInfo[]>([])
const selectedUploader = ref<number | null>(null) // null means "All"
const previousSelectedUploader = ref<number | null>(null)
const selectionToken = ref<number>(0) // 用于防止竞态条件的令牌
const liveListLoaded = ref<boolean>(false) // 标记直播列表是否已加载（防止重复加载）

// Provide selectedUploader to child components for preview loading control
provide('moments-selected-uploader', selectedUploader)
const isLoading = ref<boolean>(false)
const requestFailed = ref<boolean>(false)
const noMoreContent = ref<boolean>(false)
const needToLoginFirst = ref<boolean>(false)
const isRefreshContextActive = ref<boolean>(false)

// 分别管理ALL和单个UP主的分页状态
const allViewOffset = ref<string>('')
const allViewUpdateBaseline = ref<string>('')
const userMomentsOffset = ref<string>('')

const currentUserMid = ref<number>(0) // 当前登录用户的mid

function syncRefreshAvailability() {
  canRefreshHomeSubPage.value = isRefreshContextActive.value && selectedUploader.value === null
}

watch(selectedUploader, syncRefreshAvailability, { immediate: true })

// Track viewed uploaders in localStorage
const VIEWED_UPLOADERS_KEY = 'bewlycat_moments_viewed_uploaders'
// Blacklist for inactive uploaders
const UPLOADER_BLACKLIST_KEY = 'bewlycat_uploader_blacklist'

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

// 获取黑名单
function getBlacklistedUploaders(): Set<number> {
  try {
    const data = localStorage.getItem(UPLOADER_BLACKLIST_KEY)
    return data ? new Set(JSON.parse(data)) : new Set()
  }
  catch {
    return new Set()
  }
}

// 添加到黑名单
function addToBlacklist(mid: number) {
  try {
    const blacklist = getBlacklistedUploaders()
    blacklist.add(mid)
    localStorage.setItem(UPLOADER_BLACKLIST_KEY, JSON.stringify([...blacklist]))
    console.log(`[Following] Added UP ${mid} to blacklist`)
  }
  catch (error) {
    console.error('[Following] Failed to add to blacklist:', error)
  }
}

// 从黑名单移除
function removeFromBlacklist(mid: number) {
  try {
    const blacklist = getBlacklistedUploaders()
    if (blacklist.has(mid)) {
      blacklist.delete(mid)
      localStorage.setItem(UPLOADER_BLACKLIST_KEY, JSON.stringify([...blacklist]))
      console.log(`[Following] Removed UP ${mid} from blacklist`)
    }
  }
  catch (error) {
    console.error('[Following] Failed to remove from blacklist:', error)
  }
}

// 检查UP主是否应该在黑名单（超过指定天数未更新）
function shouldBeBlacklisted(uploader: UploaderInfo): boolean {
  // 如果没有缓存时间，使用 lastUpdateTime（可能是关注时间）
  const inactiveDays = settings.value.followingInactiveDays
  const inactiveThresholdMs = inactiveDays * 24 * 60 * 60 * 1000
  const now = Date.now()

  return (now - uploader.lastUpdateTime) > inactiveThresholdMs
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
  let excludedUploader: UploaderInfo | undefined
  let excludedIndex = -1

  if (excludeMid !== null) {
    excludedIndex = uploaderList.value.findIndex(u => u.mid === excludeMid)
    if (excludedIndex !== -1) {
      excludedUploader = uploaderList.value[excludedIndex]
      uploaderList.value.splice(excludedIndex, 1)
    }
  }

  const blacklist = getBlacklistedUploaders()

  uploaderList.value.sort((a, b) => {
    const aIsBlacklisted = blacklist.has(a.mid)
    const bIsBlacklisted = blacklist.has(b.mid)

    // 1. 黑名单的UP主排在最后
    if (aIsBlacklisted !== bIsBlacklisted)
      return aIsBlacklisted ? 1 : -1

    // 2. 按 lastUpdateTime 降序排序（最新的在前）
    return b.lastUpdateTime - a.lastUpdateTime
  })

  if (excludedUploader && excludedIndex !== -1) {
    uploaderList.value.splice(excludedIndex, 0, excludedUploader)
  }
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
  sortUploaderList(null)
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
const searchKeyword = ref<string>('')

// 显示的UP主列表（包含黑名单，但黑名单排在最后，并支持搜索过滤）
const displayedUploaderList = computed(() => {
  let list = uploaderList.value

  // 如果有搜索关键词，进行过滤
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.trim().toLowerCase()
    list = list.filter(uploader => uploader.name.toLowerCase().includes(keyword))
  }

  return list
})

const gridKey = computed(() => `following-grid-${selectedUploader.value ?? 'all'}`)

// 获取当前用户信息以获取关注列表
async function getCurrentUserInfo() {
  try {
    const response: any = await api.user.getUserInfo()
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

// 加载关注列表（独立API）- 渐进式加载所有关注的UP主
async function loadFollowingList() {
  console.log('[Following] Loading all following list...')

  if (!currentUserMid.value) {
    const mid = await getCurrentUserInfo()
    if (!mid) {
      needToLoginFirst.value = true
      return
    }
  }

  try {
    await uploaderLatestVideoTimesReady

    let currentPage = 1
    const pageSize = 50
    let hasMore = true
    const viewed = getViewedUploaders()
    const recordedTimes = uploaderLatestVideoTimes.value

    // 持续加载所有关注的UP主，每页加载后立即显示
    while (hasMore) {
      console.log(`[Following] Loading following list page ${currentPage}...`)

      const response: any = await api.user.getUserFollowings({
        vmid: currentUserMid.value.toString(),
        ps: pageSize,
        pn: currentPage,
      })

      console.log(`[Following] Following list page ${currentPage} response:`, response.code, 'count:', response.data?.list?.length)

      if (response.code === -101) {
        needToLoginFirst.value = true
        return
      }

      if (response.code === 0 && response.data?.list) {
        const followings = response.data.list

        // 立即处理并追加当前页的UP主到列表
        const newUploaders = followings.map((user: any) => {
          const recordedTime = recordedTimes[String(user.mid)]
          const hasPostTime = Boolean(recordedTime)
          const followedAt = Number(user.mtime || 0) * 1000
          const lastUpdateTime = recordedTime?.time ?? followedAt
          const viewedTime = viewed[user.mid] || 0

          return {
            mid: user.mid,
            name: user.uname,
            face: user.face,
            hasUpdate: hasPostTime && calculateHasUpdate(lastUpdateTime, viewedTime),
            hasPostTime,
            lastUpdateTime,
          }
        })

        // 立即追加到列表并排序
        uploaderList.value = [...uploaderList.value, ...newUploaders]
        updateUploaderStatus()

        console.log(`[Following] Page ${currentPage} loaded. Current total:`, uploaderList.value.length)

        // 检查是否还有更多
        const total = response.data.total
        if (uploaderList.value.length >= total || followings.length < pageSize) {
          hasMore = false
          console.log('[Following] All followings loaded. Total:', uploaderList.value.length)
        }
        else {
          currentPage++
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
      if (liveItems.length > 0) {
        videoList.value = [...liveItems, ...videoList.value]
      }
      // 标记为已加载，无论成功与否都不再重复加载
      liveListLoaded.value = true
    }

    let tempOffset = allViewOffset.value || undefined
    let pageCount = 0

    while (pageCount < maxPages) {
      pageCount++
      console.log(`[Following] Loading ALL view page ${pageCount}...`)

      const response: MomentResult = await api.moment.getMoments({
        type: 'video',
        offset: tempOffset,
        update_baseline: allViewUpdateBaseline.value || undefined,
      })

      // 竞态条件检查：如果当前选择已改变，停止加载
      if (token !== undefined && token !== selectionToken.value) {
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
    if (token !== undefined && token !== selectionToken.value) {
      console.log('[Following] Selection changed during cache update, aborting...')
      return
    }

    // 记录从ALL视图中提取的最新投稿时间
    void recordUploaderLatestVideoTimes(
      Array.from(uploaderLatestTimes, ([mid, time]) => ({ mid, time })),
      'following-all',
    )

    let updatedCount = 0
    let removedFromBlacklistCount = 0
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

        // 如果该UP主在黑名单中，说明他们有新活动，从黑名单移除
        const blacklist = getBlacklistedUploaders()
        if (blacklist.has(mid)) {
          removeFromBlacklist(mid)
          removedFromBlacklistCount++
        }
      }
    })

    if (updatedCount > 0) {
      console.log(`[Following] Updated ${updatedCount} uploader times from ALL view`)
    }
    if (markedAsViewedCount > 0) {
      console.log(`[Following] Marked ${markedAsViewedCount} uploaders as viewed from ALL view`)
    }
    if (removedFromBlacklistCount > 0) {
      console.log(`[Following] Removed ${removedFromBlacklistCount} uploaders from blacklist (found in ALL view)`)
    }
    if (updatedCount > 0 || removedFromBlacklistCount > 0 || markedAsViewedCount > 0) {
      sortUploaderList(selectedUploader.value)
    }

    // 如果一条视频都没加载到，设置 noMoreContent
    if (videoList.value.length === 0) {
      noMoreContent.value = true
    }
  }
  catch (error) {
    console.error('[Following] Failed to load ALL view:', error)
    requestFailed.value = true
    noMoreContent.value = true // 异常时也设置 noMoreContent
  }
  finally {
    // 只有当前 token 仍然有效时才清除加载状态
    if (token === undefined || token === selectionToken.value) {
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

// 加载单个UP主的动态（渐进式加载，每页加载后立即显示）
async function loadUserMoments(mid: number, maxPages: number = 3, token?: number) {
  console.log('[Following] Loading moments for UP', mid, '(max', maxPages, 'pages)...')
  emit('beforeLoading')
  isLoading.value = true
  requestFailed.value = false

  // 收集本次点击后实际加载到的视频时间
  const allVideoTimes: number[] = []

  try {
    let tempOffset = userMomentsOffset.value || undefined
    let pageCount = 0

    while (pageCount < maxPages) {
      pageCount++
      console.log(`[Following] Loading user moments page ${pageCount}...`)

      const response: MomentResult = await api.moment.getUserMoments({
        host_mid: mid.toString(),
        offset: tempOffset,
        features: 'itemOpusStyle',
      })

      // 竞态条件检查：如果当前选择已改变，停止加载
      if (token !== undefined && token !== selectionToken.value) {
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

        if (newOffset === '0' || newOffset === tempOffset || !response.data.items || response.data.items.length === 0) {
          noMoreContent.value = true
          console.log('[Following] No more content for this UP')
          break
        }
        else {
          tempOffset = newOffset
          userMomentsOffset.value = newOffset
        }

        // 收集所有视频动态用于显示
        const allVideoItems: { item: MomentItem, time: number }[] = []

        response.data.items.forEach((item: MomentItem) => {
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
              uniqueId: `user-moment-${item.id_str}`,
              bvid: major.archive?.bvid || major.ugc_season?.bvid,
              item,
              authorList: authors,
              displayData,
            })

            allVideoItems.push({ item, time })
            allVideoTimes.push(time) // 收集所有视频时间
          }
        })

        console.log(`[Following] User moments page ${pageCount} loaded. Total:`, videoList.value.length)
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
      if (token !== undefined && token !== selectionToken.value) {
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

        if (settings.value.enableFollowingInactiveBlacklist && shouldBeBlacklisted(uploader)) {
          addToBlacklist(mid)
        }

        sortUploaderList(selectedUploader.value)

        console.log(`[Following] Updated data for UP ${mid} from selected view: time=${new Date(knownLatestTime).toLocaleString()}`)
      }
    }

    console.log('[Following] User moments loading complete. Total:', videoList.value.length, 'videos')

    // 如果一条视频都没加载到，设置 noMoreContent
    if (videoList.value.length === 0) {
      noMoreContent.value = true
    }
  }
  catch (error) {
    console.error('[Following] Failed to load user moments:', error)
    requestFailed.value = true
    noMoreContent.value = true // 异常时也设置 noMoreContent
  }
  finally {
    // 只有当前 token 仍然有效时才清除加载状态
    if (token === undefined || token === selectionToken.value) {
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

// 切换UP主
function selectUploader(mid: number | null) {
  console.log('[Following] Selecting uploader:', mid === null ? 'All' : mid)

  // 生成新的选择令牌，用于防止竞态条件
  const currentToken = ++selectionToken.value

  // 即时滚动到顶部（或搜索页面模式下的偏移位置）
  const viewport = scrollViewportRef.value
  if (viewport) {
    const scrollTarget = settings.value.useSearchPageModeOnHomePage ? 510 : 0
    viewport.scrollTop = scrollTarget
  }

  // 重置视频列表和分页状态
  videoList.value = []
  noMoreContent.value = false

  if (mid === null) {
    // 切换到ALL视图
    console.log('[Following] Switching to All view')

    if (previousSelectedUploader.value !== null) {
      sortUploaderList(null)
    }

    selectedUploader.value = null
    previousSelectedUploader.value = null

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

    // 用户点击了UP主，如果在黑名单中则移除
    const blacklist = getBlacklistedUploaders()
    if (blacklist.has(mid)) {
      removeFromBlacklist(mid)
    }

    if (previousSelectedUploader.value !== null && previousSelectedUploader.value !== mid) {
      sortUploaderList(mid)
    }

    selectedUploader.value = mid
    previousSelectedUploader.value = mid

    // 重置用户动态分页
    userMomentsOffset.value = ''

    // 加载UP主动态（初始加载3页，每页加载后立即显示）
    loadUserMoments(mid, 3, currentToken)
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
    tag: isCollaboration ? '联合投稿' : undefined,
    threePointV2: [],
  }
}

function transformVideoItem(item: VideoElement): Video | undefined {
  return item.displayData
}

// 加载更多
async function handleLoadMore() {
  if (isLoading.value || noMoreContent.value)
    return

  console.log('[Following] Loading more...')

  if (selectedUploader.value === null) {
    // ALL视图：继续加载视频
    await loadAllViewVideos(1, selectionToken.value)
  }
  else {
    // UP主视图：继续加载动态
    await loadUserMoments(selectedUploader.value, 1, selectionToken.value)
  }
}

// 初始化
function initData() {
  console.log('[Following] Initializing...')

  // 生成新的令牌，确保旧的加载请求被取消
  selectionToken.value++

  // 保存当前选中的UP主
  const currentSelectedUploader = selectedUploader.value

  videoList.value = []
  allViewOffset.value = ''
  allViewUpdateBaseline.value = ''
  userMomentsOffset.value = ''
  noMoreContent.value = false
  needToLoginFirst.value = false
  requestFailed.value = false
  liveListLoaded.value = false // 重置直播加载标志

  // 如果当前已经选中了某个UP主，刷新该UP主的动态
  if (currentSelectedUploader !== null) {
    console.log('[Following] Refreshing moments for UP', currentSelectedUploader)
    loadUserMoments(currentSelectedUploader, 3, selectionToken.value)
  }
  else {
    // 否则，先加载关注列表，然后加载ALL视图
    if (uploaderList.value.length === 0) {
      // 设置加载状态，避免显示"没有数据"
      isLoading.value = true
      emit('beforeLoading')

      loadFollowingList().then(() => {
        console.log('[Following] Following list loaded')
        selectUploader(null)
      }).catch((error) => {
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
  isRefreshContextActive.value = true
  syncRefreshAvailability()
  initData()

  // 确保在 nextTick 中调用，以保证所有依赖都已准备好
  nextTick(() => {
    initPageAction()
  })
})

onActivated(() => {
  isRefreshContextActive.value = true
  syncRefreshAvailability()
  initPageAction()
})

onDeactivated(() => {
  isRefreshContextActive.value = false
  syncRefreshAvailability()
})

onUnmounted(() => {
  isRefreshContextActive.value = false
  syncRefreshAvailability()
})

function initPageAction() {
  // VideoCardGrid owns infinite scrolling. Clear callbacks left by other kept-alive tabs.
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
  <div flex="~ gap-40px">
    <!-- Left Panel: Uploader List -->
    <aside
      pos="sticky top-150px" h="[calc(100vh-140px)]" w-200px shrink-0 duration-300
      ease-in-out
    >
      <div h-inherit p="x-20px b-20px t-8px" m--20px of-y-auto of-x-hidden>
        <!-- Search Box -->
        <div mb-3>
          <input
            v-model="searchKeyword"
            type="text"
            :placeholder="$t('common.search')"
            px-4 py-2 w-full
            rounded="$bew-radius"
            bg="$bew-fill-1"
            border="1 $bew-border-color"
            text="sm $bew-text-1"
            outline-none
            transition="border-color duration-300, background-color duration-300"
            focus:border="$bew-theme-color"
            focus:bg="$bew-fill-2"
            placeholder:text="$bew-text-3"
          >
        </div>

        <TransitionGroup name="list" tag="ul" flex="~ col gap-2">
          <!-- All Uploaders Option -->
          <li key="all-uploaders">
            <a
              :class="{ active: selectedUploader === null }"
              px-4 py-2 hover:bg="$bew-fill-2" w-inherit
              block rounded="$bew-radius" cursor-pointer transition="background-color duration-200, color duration-200, box-shadow duration-200"
              un-text="$bew-text-1"
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
              <div flex-1 overflow-hidden>
                <div font-medium text-sm>
                  {{ $t('topbar.moments_dropdown.tabs.all') }}
                </div>
                <div v-if="unreadUploadersCount > 0" class="secondary-text">
                  {{ $t('home.uploaders_with_updates', { count: unreadUploadersCount }) }}
                </div>
              </div>
            </a>
          </li>

          <!-- Individual Uploaders -->
          <li v-for="uploader in displayedUploaderList" :key="uploader.mid">
            <a
              :class="{ active: selectedUploader === uploader.mid }"
              px-4 py-2 hover:bg="$bew-fill-2" w-inherit
              block rounded="$bew-radius" cursor-pointer transition="background-color duration-200, color duration-200, box-shadow duration-200"
              un-text="$bew-text-1"
              flex="~ items-center gap-3"
              @click="selectUploader(uploader.mid)"
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
                <div font-medium truncate text-sm>
                  {{ uploader.name }}
                </div>
                <div class="secondary-text">
                  {{ calcTimeSince(uploader.lastUpdateTime) }}
                </div>
              </div>
            </a>
          </li>
        </TransitionGroup>
      </div>
    </aside>

    <!-- Right Panel: Video Feed -->
    <div w-full>
      <VideoCardGrid
        :key="gridKey"
        :items="videoList"
        :grid-layout="gridLayout"
        :loading="isLoading"
        :no-more-content="noMoreContent"
        :need-to-login-first="needToLoginFirst"
        :request-failed="requestFailed"
        :transform-item="transformVideoItem"
        :get-item-key="(item: VideoElement) => item.uniqueId"
        :show-watcher-later="false"
        is-following-page
        show-preview
        @refresh="initData"
        @login="jumpToLoginPage"
        @load-more="handleLoadMore"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.secondary-text {
  --uno: "text-xs text-$bew-text-2";
}

.active {
  --uno: "bg-$bew-theme-color-auto text-$bew-text-auto shadow-$bew-shadow-2";

  .secondary-text {
    --uno: "text-$bew-text-auto opacity-85";
  }
}

/* TransitionGroup 列表过渡效果 */
.list-move,
.list-enter-active,
.list-leave-active {
  transition:
    background-color 0.3s ease,
    color 0.3s ease,
    box-shadow 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

/* 确保离开的元素从布局流中移除 */
.list-leave-active {
  position: absolute;
}
</style>
