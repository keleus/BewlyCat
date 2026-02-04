<script setup lang="ts">
/**
 * Following Component - 正在关注页面
 *
 * ## 功能概述
 * 显示用户关注的UP主列表及其视频动态流。支持两种视图模式：
 * 1. ALL视图：显示所有关注UP主的混合视频流
 * 2. 单UP主视图：显示特定UP主的视频动态
 *
 * ## 数据加载流程
 *
 * ### 1. 初始化 (initData)
 * - 首次进入或刷新时调用
 * - 如果是首次加载，调用 loadFollowingList 加载关注列表
 * - 加载完成后，默认切换到 ALL 视图
 *
 * ### 2. 加载关注列表 (loadFollowingList)
 * - 通过 getUserFollowings API 分页加载所有关注的UP主（每页50个）
 * - 使用 localStorage 缓存机制：
 *   - VIEWED_UPLOADERS_KEY: 记录用户查看过的UP主及查看时间
 *   - UPLOADER_TIMES_CACHE_KEY: 缓存UP主最新视频时间（有效期1天）
 * - 初始排序：有更新的UP主在前，有缓存时间的UP主优先，按最后更新时间降序，最后按关注时间
 * - 完成后，启动后台加载流程更新UP主时间
 *
 * ### 3. 后台更新UP主时间 (startLoadingUploaderTimesInBackground)
 * - 使用并发控制（最多2个并发请求）逐个更新UP主的最新视频时间
 * - 频率控制：平均每分钟最多5次（每12秒一次），用户主动触发时不受限制
 * - 加载优先级：
 *   1. 当前选中的UP主
 *   2. 无缓存的UP主
 *   3. 有缓存的UP主（按时间降序）
 * - 请求间隔：1.2-2秒随机延迟，避免触发风控
 * - 支持失败重试（最多2次）
 * - 时间更新逻辑：比较前两个视频动态，取最新时间（处理置顶视频情况）
 * - **缓存保护**：API失败时保持现有缓存数据不变，不会清空或覆盖
 *
 * ### 4. 加载视频流
 *
 * #### ALL视图 (loadAllViewVideos)
 * - 调用 getMoments API 获取关注动态流
 * - 默认加载3页，支持滚动加载更多
 * - 使用 offset 和 update_baseline 进行分页
 * - 处理合作视频：提取所有作者信息
 * - **智能缓存更新**：提取每个UP主的最新视频时间，更新到缓存（仅当时间更新时）
 * - 缓存更新后自动触发排序优化
 *
 * #### 单UP主视图 (loadUserMoments)
 * - 调用 getUserMoments API 获取特定UP主的动态
 * - 默认加载3页，支持滚动加载更多
 * - 仅显示包含视频的动态
 * - 同时更新该UP主的最新视频时间并缓存
 *
 * ### 5. 切换UP主 (selectUploader)
 * - 重置视频列表和分页状态
 * - 标记UP主为已查看（更新 hasUpdate 状态）
 * - 用户点击UP主时会缓存该UP主的最新更新时间
 * - 如果切换到非选中状态的UP主，重新排序列表（保持当前选中的UP主位置不变）
 * - 加载对应视图的视频流
 *
 * ## 缓存策略
 *
 * ### 已读状态 (VIEWED_UPLOADERS_KEY)
 * - 记录用户查看每个UP主的时间戳
 * - 用于判断 hasUpdate 状态（红点提示）
 *
 * ### UP主时间缓存 (UPLOADER_TIMES_CACHE_KEY)
 * - 缓存每个UP主的最新视频时间（仅缓存时间，不缓存视频内容）
 * - 有效期：1天
 * - 数据来源：
 *   1. ALL视图加载时提取（优先）
 *   2. 用户点击UP主后更新
 *   3. 后台异步加载更新
 * - **缓存保护机制**：
 *   - API失败时保持缓存不变
 *   - 仅当新时间更新时才覆盖缓存
 *   - 避免用旧数据覆盖新缓存
 * - 减少不必要的API请求，提升加载速度
 *
 * ## 排序策略
 *
 * UP主列表排序优先级（从高到低）：
 * 1. **hasUpdate 状态**：有更新的UP主排在前面
 * 2. **缓存状态**：有真实缓存时间的UP主优先于仅有关注时间的
 * 3. **时间排序**：按 lastUpdateTime 降序（缓存时间或关注时间）
 *
 * 这确保了：ALL视图中加载的UP主和用户主动查看的UP主会优先显示
 *
 * ## 布局模式
 *
 * ### 新布局（默认，可在设置中关闭）
 * - 左侧：Sticky侧边栏显示UP主列表
 * - 右侧：全宽视频流，支持全页面滚动
 * - 参考 Ranking.vue 的布局设计
 *
 * ## 性能优化
 * - 后台异步更新UP主时间，不阻塞主流程
 * - 并发控制和随机延迟，避免请求过快
 * - 频率控制避免触发B站风控（平均5次/分钟）
 * - localStorage 缓存减少重复请求
 * - 分页加载，避免一次性加载过多数据
 * - 智能排序减少列表抖动（每10个更新一次，避免加载时排序）
 */
import { useI18n } from 'vue-i18n'

import type { Author, Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
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

const props = withDefaults(defineProps<Props>(), {
  gridLayout: 'adaptive',
  topBarVisibility: true,
})

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

useI18n()

const { scrollViewportRef, handlePageRefresh } = useBewlyApp()
const videoList = ref<VideoElement[]>([])
const uploaderList = ref<UploaderInfo[]>([])
const selectedUploader = ref<number | null>(null) // null means "All"
const previousSelectedUploader = ref<number | null>(null)
const isLoadingUploaderTimes = ref<boolean>(false) // 是否正在后台加载UP主时间
const loadedUploaderTimesCount = ref<number>(0) // 已加载时间的UP主数量
const selectionToken = ref<number>(0) // 用于防止竞态条件的令牌
const liveListLoaded = ref<boolean>(false) // 标记直播列表是否已加载（防止重复加载）

// Provide selectedUploader to child components for preview loading control
provide('moments-selected-uploader', selectedUploader)
const isLoading = ref<boolean>(false)
const noMoreContent = ref<boolean>(false)
const needToLoginFirst = ref<boolean>(false)
const shouldMoveAsideUp = ref<boolean>(false)

// 分别管理ALL和单个UP主的分页状态
const allViewOffset = ref<string>('')
const allViewUpdateBaseline = ref<string>('')
const userMomentsOffset = ref<string>('')

const currentUserMid = ref<number>(0) // 当前登录用户的mid

// Watch topBarVisibility to control aside position
watch(() => props.topBarVisibility, () => {
  shouldMoveAsideUp.value = false

  // Allow moving tabs up only when the top bar is not hidden & is set to auto-hide
  if (settings.value.autoHideTopBar && settings.value.showTopBar) {
    if (props.topBarVisibility)
      shouldMoveAsideUp.value = false
    else
      shouldMoveAsideUp.value = true
  }
})

// Track viewed uploaders in localStorage
const VIEWED_UPLOADERS_KEY = 'bewlycat_moments_viewed_uploaders'
// Cache uploader latest times in localStorage
const UPLOADER_TIMES_CACHE_KEY = 'bewlycat_uploader_latest_times'
const CACHE_EXPIRY_DAYS = 1 // 缓存1天后过期
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

// UP主缓存数据接口
interface UploaderCache {
  time: number // 最后投稿时间
  cachedAt: number // 缓存时间
  updateInterval?: number // 平均投稿间隔(ms)
  predictedNextUpdate?: number // 预计下次投稿时间
  lastSyncTime?: number // 最后同步时间
  lastViewedTime?: number // 最后主动查看时间（从ALL或单人页面）
}

// 获取缓存的UP主时间
function getCachedUploaderTimes(): Record<number, UploaderCache> {
  try {
    const data = localStorage.getItem(UPLOADER_TIMES_CACHE_KEY)
    if (!data)
      return {}

    const cache = JSON.parse(data)
    const now = Date.now()
    const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000

    // 过滤过期的缓存
    const validCache: Record<number, UploaderCache> = {}
    for (const [mid, value] of Object.entries(cache)) {
      if (now - (value as any).cachedAt < expiryMs) {
        validCache[Number(mid)] = value as any
      }
    }

    return validCache
  }
  catch {
    return {}
  }
}

// 保存完整的UP主缓存数据
function cacheUploaderData(mid: number, data: Partial<UploaderCache>) {
  try {
    const cache = getCachedUploaderTimes()
    cache[mid] = {
      ...(cache[mid] || {}),
      ...data,
      cachedAt: Date.now(),
      lastSyncTime: Date.now(),
    }
    localStorage.setItem(UPLOADER_TIMES_CACHE_KEY, JSON.stringify(cache))
  }
  catch (error) {
    console.error('[Following] Failed to cache uploader data:', error)
  }
}

// 计算视频更新间隔（基于视频列表）
function calculateUpdateInterval(videoTimes: number[]): number | undefined {
  if (videoTimes.length < 2)
    return undefined

  // 计算相邻视频间的时间间隔
  const intervals: number[] = []
  for (let i = 1; i < Math.min(videoTimes.length, 10); i++) {
    const interval = videoTimes[i - 1] - videoTimes[i]
    if (interval > 0) {
      intervals.push(interval)
    }
  }

  if (intervals.length === 0)
    return undefined

  // 使用中位数来避免异常值的影响
  intervals.sort((a, b) => a - b)
  const mid = Math.floor(intervals.length / 2)
  return intervals.length % 2 === 0
    ? (intervals[mid - 1] + intervals[mid]) / 2
    : intervals[mid]
}

// 根据更新间隔计算同步策略
function calculateSyncInterval(updateInterval: number): number {
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR
  const WEEK = 7 * DAY
  const MONTH = 30 * DAY

  // 日更型（≤1天）：每小时同步
  if (updateInterval <= DAY)
    return HOUR

  // 周更型（≤7天）：每天同步
  if (updateInterval <= WEEK)
    return DAY

  // 月更型（≤30天）：每周同步
  if (updateInterval <= MONTH)
    return WEEK

  // 低频型（>30天）：每2周同步
  return 2 * WEEK
}

// 检查是否需要同步（基于智能策略）
function shouldSync(cache: UploaderCache | undefined, now: number): boolean {
  if (!cache)
    return true // 无缓存，需要同步

  // 如果有预测的下次更新时间
  if (cache.predictedNextUpdate && cache.updateInterval) {
    const timeUntilPredicted = cache.predictedNextUpdate - now
    const window = cache.updateInterval * 0.2 // ±20%窗口

    // 在预测时间窗口内，积极同步
    if (Math.abs(timeUntilPredicted) <= window) {
      const lastSync = cache.lastSyncTime || cache.cachedAt
      const timeSinceSync = now - lastSync
      // 窗口期内每小时同步一次
      return timeSinceSync > 60 * 60 * 1000
    }
  }

  // 根据更新间隔决定同步频率
  if (cache.updateInterval) {
    const syncInterval = calculateSyncInterval(cache.updateInterval)
    const lastSync = cache.lastSyncTime || cache.cachedAt
    const timeSinceSync = now - lastSync
    return timeSinceSync > syncInterval
  }

  // 默认：超过12小时未同步则同步
  const lastSync = cache.lastSyncTime || cache.cachedAt
  return (now - lastSync) > 12 * 60 * 60 * 1000
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
  const badgeText = item.modules?.module_dynamic?.major?.archive?.badge?.text
  return badgeText === BadgeText.充电专属
}

// 检查视频是否为动态视频
function isDynamicVideo(item: MomentItem): boolean {
  const badgeText = item.modules?.module_dynamic?.major?.archive?.badge?.text
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
      hasUpdate: calculateHasUpdate(uploader.lastUpdateTime, viewedTime),
    }
  })

  // 使用统一的排序逻辑
  sortUploaderList(null)
}

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
    let currentPage = 1
    const pageSize = 50
    let hasMore = true
    const viewed = getViewedUploaders()
    const cachedTimes = getCachedUploaderTimes()

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
          const cachedTime = cachedTimes[user.mid]
          const lastUpdateTime = cachedTime ? cachedTime.time : user.mtime * 1000
          const viewedTime = viewed[user.mid] || 0

          return {
            mid: user.mid,
            name: user.uname,
            face: user.face,
            hasUpdate: calculateHasUpdate(lastUpdateTime, viewedTime),
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
      console.log('[Following] Loaded from cache:', Object.keys(cachedTimes).length, 'uploader times')

      // 后台逐个加载UP主最新视频时间（使用并发控制和频率限制）
      startLoadingUploaderTimesInBackground(false) // false = 非用户主动触发
    }
  }
  catch (error) {
    console.error('[Following] Failed to load following list:', error)
  }
}

// 并发控制器：后台逐个加载UP主最新视频时间（使用智能同步策略）
// isUserTriggered: true 表示用户主动点击触发，强制同步所有
async function startLoadingUploaderTimesInBackground(isUserTriggered: boolean = false) {
  if (isLoadingUploaderTimes.value) {
    return
  }

  isLoadingUploaderTimes.value = true
  loadedUploaderTimesCount.value = 0

  // 初始延迟：等待页面稳定后再开始（避免页面刚加载就触发风控）
  const INITIAL_DELAY = 2000 + Math.random() * 1000 // 2-3秒随机延迟
  console.log(`[Following] Will start smart sync in ${Math.round(INITIAL_DELAY / 1000)}s...`)
  await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY))

  console.log('[Following] Starting smart background sync...')

  const cachedTimes = getCachedUploaderTimes()
  const blacklist = getBlacklistedUploaders()
  const now = Date.now()

  // 构建同步队列，按优先级排序
  interface SyncItem {
    mid: number
    priority: number // 数值越大优先级越高
    reason: string
  }

  const syncQueue: SyncItem[] = []

  // 1. 当前选中的UP主（最高优先级）
  if (selectedUploader.value !== null && !blacklist.has(selectedUploader.value)) {
    syncQueue.push({
      mid: selectedUploader.value,
      priority: 1000,
      reason: 'selected',
    })
  }

  // 2. 分析所有UP主，计算优先级
  for (const uploader of uploaderList.value) {
    if (uploader.mid === selectedUploader.value)
      continue
    if (blacklist.has(uploader.mid))
      continue

    const cache = cachedTimes[uploader.mid]

    // 用户触发时强制同步所有
    if (isUserTriggered) {
      syncQueue.push({
        mid: uploader.mid,
        priority: 500,
        reason: 'user-triggered',
      })
      continue
    }

    // 使用智能策略判断是否需要同步
    if (!shouldSync(cache, now)) {
      continue
    }

    // 计算优先级
    let priority = 100
    let reason = 'need-sync'

    // 无缓存：高优先级
    if (!cache) {
      priority = 800
      reason = 'no-cache'
    }
    // 在预测时间窗口内：最高优先级
    else if (cache.predictedNextUpdate && cache.updateInterval) {
      const timeUntilPredicted = cache.predictedNextUpdate - now
      const window = cache.updateInterval * 0.2

      if (Math.abs(timeUntilPredicted) <= window) {
        priority = 900
        reason = 'prediction-window'
      }
    }

    syncQueue.push({ mid: uploader.mid, priority, reason })
  }

  // 按优先级降序排序
  syncQueue.sort((a, b) => b.priority - a.priority)

  console.log(`[Following] Smart sync queue: ${syncQueue.length} uploaders`, {
    selected: syncQueue.filter(i => i.reason === 'selected').length,
    predictionWindow: syncQueue.filter(i => i.reason === 'prediction-window').length,
    noCache: syncQueue.filter(i => i.reason === 'no-cache').length,
    needSync: syncQueue.filter(i => i.reason === 'need-sync').length,
    userTriggered: syncQueue.filter(i => i.reason === 'user-triggered').length,
  })

  // 并发控制参数
  const MAX_CONCURRENT = 2 // 同时最多2个请求
  const MIN_DELAY = 1200 // 最小间隔1200ms（增加到1.2秒）
  const MAX_DELAY = 2000 // 最大间隔2000ms（增加到2秒）

  let activeRequests = 0
  let queueIndex = 0

  // 随机延迟函数
  const randomDelay = () => {
    const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY)
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  // 处理队列
  const processQueue = async () => {
    while (queueIndex < syncQueue.length) {
      // 等待有空闲槽位
      // eslint-disable-next-line no-unmodified-loop-condition
      while (activeRequests >= MAX_CONCURRENT) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const item = syncQueue[queueIndex++]
      activeRequests++

      // 异步执行请求
      loadSingleUploaderTime(item.mid).finally(() => {
        activeRequests--
      })

      // 随机延迟，避免被检测为机器行为
      await randomDelay()
    }

    // 等待所有请求完成
    // eslint-disable-next-line no-unmodified-loop-condition
    while (activeRequests > 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  await processQueue()

  // 后台加载完成后，最后排序一次确保顺序正确（无论是否在加载中）
  sortUploaderList(selectedUploader.value)

  isLoadingUploaderTimes.value = false
  console.log('[Following] Finished loading all uploader times')
}

// 加载单个UP主的最新视频时间（只获取时间，不加载视频列表）
// 重要：如果API失败，保持现有的缓存数据不变，不会清空或覆盖
async function loadSingleUploaderTime(mid: number, retryCount: number = 0) {
  const MAX_RETRIES = 2

  try {
    const response: MomentResult = await api.moment.getUserMoments({
      host_mid: mid.toString(),
      offset: '',
      features: 'itemOpusStyle',
    })

    if (response.code === 0 && response.data.items) {
      // 收集前两个视频动态（考虑置顶的情况）
      const videoItems: { item: MomentItem, time: number }[] = []

      for (const item of response.data.items) {
        if (item.modules?.module_dynamic?.major?.archive && item.modules?.module_author?.pub_ts) {
          videoItems.push({
            item,
            time: item.modules.module_author.pub_ts * 1000,
          })

          // 收集前10个视频用于计算更新间隔
          if (videoItems.length >= 10) {
            break
          }
        }
      }

      // 只有在成功获取到视频数据时才更新缓存
      if (videoItems.length > 0) {
        const uploader = uploaderList.value.find(u => u.mid === mid)
        if (uploader) {
          // 提取所有视频时间
          const videoTimes = videoItems.map(v => v.time)

          // 计算最新视频时间（考虑置顶）
          const latestTime = videoItems.length === 1
            ? videoItems[0].time
            : Math.max(videoItems[0].time, videoItems[1].time)

          // 只有当新时间更新时才更新（避免用旧数据覆盖新缓存）
          const cachedTimes = getCachedUploaderTimes()
          const cachedTime = cachedTimes[mid]?.time || 0

          if (latestTime >= cachedTime) {
            uploader.lastUpdateTime = latestTime
            loadedUploaderTimesCount.value++

            // 计算更新间隔和预测下次更新时间
            const updateInterval = calculateUpdateInterval(videoTimes)
            const predictedNextUpdate = updateInterval ? latestTime + updateInterval : undefined

            // 保存完整数据到缓存
            cacheUploaderData(mid, {
              time: latestTime,
              updateInterval,
              predictedNextUpdate,
            })

            // 后台同步更新了lastUpdateTime，需要重新计算hasUpdate
            const viewed = getViewedUploaders()
            const viewedTime = viewed[mid] || 0
            uploader.hasUpdate = calculateHasUpdate(uploader.lastUpdateTime, viewedTime)

            console.log(`[Following] Updated time for UP ${mid} (${loadedUploaderTimesCount.value}/${uploaderList.value.length})${updateInterval ? `, interval: ${Math.round(updateInterval / (24 * 60 * 60 * 1000))}d` : ''}`)

            // 检查是否应该加入黑名单（超过指定天数未更新）
            if (shouldBeBlacklisted(uploader)) {
              addToBlacklist(mid)
            }

            // 每次更新后重新排序
            sortUploaderList(selectedUploader.value)
          }
          else {
            console.log(`[Following] Skipped updating UP ${mid}: cached time is newer (cached: ${new Date(cachedTime).toLocaleString()}, fetched: ${new Date(latestTime).toLocaleString()})`)
          }
        }
      }
      else {
        // API返回成功但没有视频数据，该UP主完全没有投稿，添加到黑名单
        const uploader = uploaderList.value.find(u => u.mid === mid)
        if (uploader) {
          addToBlacklist(mid)
          console.log(`[Following] No video data for UP ${mid}, added to blacklist`)
        }
      }
    }
    else if (response.code !== 0) {
      // API返回错误码，保持现有缓存不变
      console.log(`[Following] API error (code ${response.code}) for UP ${mid}, keeping cached data`)
    }
  }
  catch (error) {
    // 如果是风控错误且未超过重试次数，等待后重试
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('风控') && retryCount < MAX_RETRIES) {
      const retryDelay = (retryCount + 1) * 3000 // 3秒、6秒递增
      console.warn(`[Following] Rate limited for UP ${mid}, retrying in ${retryDelay / 1000}s... (${retryCount + 1}/${MAX_RETRIES})`)
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      return loadSingleUploaderTime(mid, retryCount + 1)
    }

    // 请求失败，保持现有缓存数据不变（不会清空或覆盖）
    console.error(`[Following] Failed to load time for UP ${mid}:`, error, '- keeping cached data')
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

          videoList.value.push({
            uniqueId: `following-all-${item.id_str}`,
            bvid: item.modules?.module_dynamic?.major?.archive?.bvid,
            item,
            authorList: authors,
            displayData: mapMomentItemToVideo(item, authors),
          })
        })

        console.log(`[Following] ALL view page ${pageCount} loaded. Total videos:`, videoList.value.length)
      }
      else {
        console.error('[Following] API returned error code:', response.code)
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

    // 更新缓存：从ALL视图中提取的最新时间
    let updatedCount = 0
    let removedFromBlacklistCount = 0
    let markedAsViewedCount = 0
    uploaderLatestTimes.forEach((time, mid) => {
      const uploader = uploaderList.value.find(u => u.mid === mid)
      if (uploader) {
        const cachedTimes = getCachedUploaderTimes()
        const cachedTime = cachedTimes[mid]?.time || 0

        // 只有当ALL视图中的时间更新时才更新缓存
        if (time > cachedTime) {
          uploader.lastUpdateTime = time
          // 在ALL视图中，用户看到了该UP主的视频，更新时间和查看时间
          cacheUploaderData(mid, {
            time,
            lastViewedTime: Date.now(),
          })
          updatedCount++
          console.log(`[Following] Updated cache for UP ${mid} from ALL view: ${new Date(time).toLocaleString()}`)
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
      // 重新排序，但避免在加载中排序
      if (!isLoadingUploaderTimes.value) {
        sortUploaderList(selectedUploader.value)
      }
    }

    // 如果一条视频都没加载到，设置 noMoreContent
    if (videoList.value.length === 0) {
      noMoreContent.value = true
    }
  }
  catch (error) {
    console.error('[Following] Failed to load ALL view:', error)
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

  // 收集所有视频时间用于计算更新间隔
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
          // 只处理包含视频的动态
          if (!item.modules?.module_dynamic?.major?.archive) {
            return
          }

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

          const displayData = mapMomentItemToVideo(item, authors)
          if (displayData) {
            const time = item.modules.module_author.pub_ts * 1000

            videoList.value.push({
              uniqueId: `user-moment-${item.id_str}`,
              bvid: item.modules?.module_dynamic?.major?.archive?.bvid,
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
        noMoreContent.value = true // 出错时也设置 noMoreContent
        break
      }
    }

    // 加载完成后，计算更新间隔和预测下次更新时间
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

        uploader.lastUpdateTime = latestTime

        // 计算更新间隔和预测下次更新时间
        const updateInterval = calculateUpdateInterval(allVideoTimes)
        const predictedNextUpdate = updateInterval ? latestTime + updateInterval : undefined

        // 保存完整数据到缓存
        cacheUploaderData(mid, {
          time: latestTime,
          updateInterval,
          predictedNextUpdate,
          lastViewedTime: Date.now(), // 用户主动查看该UP主
        })

        // 用户主动点击TAB查看，标记为已查看
        markUploaderAsViewed(mid, latestTime)

        console.log(`[Following] Updated data for UP ${mid}: time=${new Date(latestTime).toLocaleString()}${updateInterval ? `, interval=${Math.round(updateInterval / (24 * 60 * 60 * 1000))}d` : ''}`)
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

    // 优先加载当前UP主的时间（如果还未加载）
    const uploader = uploaderList.value.find(u => u.mid === mid)
    if (uploader && uploader.lastUpdateTime && uploader.lastUpdateTime < Date.now() - 365 * 24 * 60 * 60 * 1000) {
      // 如果时间看起来是旧的关注时间（超过1年），优先更新
      loadSingleUploaderTime(mid)
    }

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

// 将moment item转换为Video格式
function mapMomentItemToVideo(item?: MomentItem, authors?: Author[]): Video | undefined {
  if (!item)
    return undefined

  const archive = item.modules?.module_dynamic?.major?.archive
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
  initData()

  // 确保在 nextTick 中调用，以保证所有依赖都已准备好
  nextTick(() => {
    initPageAction()
  })
})

onActivated(() => {
  initPageAction()
})

function initPageAction() {
  // 滚动加载完全由 VideoCardGrid 组件处理（通过 @load-more 事件）
  // 移除 handleReachBottom 注册以避免与 VideoCardGrid 的内置滚动监听冲突

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
      :class="{ hide: shouldMoveAsideUp }"
    >
      <div h-inherit p="x-20px b-20px t-8px" m--20px of-y-auto of-x-hidden>
        <!-- Search Box -->
        <div mb-3>
          <input
            v-model="searchKeyword"
            type="text"
            :placeholder="$t('common.search')"
            px-4 py-2 w-full
            rounded-lg
            bg="$bew-fill-1"
            border="1 $bew-border-color"
            text="sm $bew-text-1"
            outline-none
            transition="all 300"
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
              block rounded-lg cursor-pointer transition="all 300 ease-out"
              hover:scale-105 un-text="$bew-text-1"
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
              block rounded-lg cursor-pointer transition="all 300 ease-out"
              hover:scale-105 un-text="$bew-text-1"
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

.hide {
  --uno: "h-[calc(100vh-70px)] translate-y--70px";
}

/* TransitionGroup 列表过渡效果 */
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.5s ease;
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
