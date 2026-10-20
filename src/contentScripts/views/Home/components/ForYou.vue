<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import AppAuthorizationDialog from '~/components/AppAuthorizationDialog.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { UndoForwardState, useBewlyApp } from '~/composables/useAppProvider'
import { FilterType, useFilter } from '~/composables/useFilter'
import { useHomeTabState } from '~/composables/useHomeTabState'
import { LanguageType } from '~/enums/appEnums'
import type { GridLayoutType } from '~/logic'
import { appAuthTokens, noCookieForYouRecommendationState, settings } from '~/logic'
import type { AppForYouResult, Item as AppVideoItem } from '~/models/video/appForYou'
import { Type as ThreePointV2Type } from '~/models/video/appForYou'
import type { forYouResult, Item as VideoItem } from '~/models/video/forYou'
import type { AppVideoElement, VideoCardDisplayData, VideoElement } from '~/stores/forYouStore'
import { useForYouStore } from '~/stores/forYouStore'
import api from '~/utils/api'
import { ensureFreshAppAccessToken, requestAppClient } from '~/utils/authProvider'
import { isBilibiliRiskControl } from '~/utils/bilibiliApiError'
import { av2bv } from '~/utils/bvid'
import { decodeHtmlEntities } from '~/utils/htmlDecode'
import { getCookie } from '~/utils/main'
import { isVerticalVideo } from '~/utils/uriParse'

import ImmersiveFeed from './ImmersiveFeed/ImmersiveFeed.vue'
import type { ImmersiveFeedItem } from './ImmersiveFeed/types'

const { gridLayout } = defineProps<{
  gridLayout: GridLayoutType
}>()

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

const toast = useToast()
const { t } = useI18n()
const forYouStore = useForYouStore()
const tabState = useHomeTabState()

const filterFunc = useFilter(
  ['is_followed'],
  [
    FilterType.duration,
    FilterType.viewCount,
    FilterType.likeCount,
    FilterType.title,
    FilterType.user,
    FilterType.user,
    FilterType.publishTime,
  ],
  [
    ['duration'],
    ['stat', 'view'],
    ['stat', 'like'],
    ['title'],
    ['owner', 'name'],
    ['owner', 'mid'],
    ['pubdate'],
  ],
)

const appFilterFunc = useFilter(
  ['bottom_rcmd_reason'],
  [
    FilterType.filterOutVerticalVideos,
    FilterType.duration,
    FilterType.viewCountStr,
    FilterType.title,
    FilterType.user,
    FilterType.user,
  ],
  [
    ['uri'],
    ['player_args', 'duration'],
    ['cover_left_text_1'],
    ['title'],
    // HD 接口没有 mask.avatar，UP 主信息在归一化后统一放在 args 中
    ['args', 'up_name'],
    ['args', 'up_id'],
  ],
)

const { handleReachBottom, handlePageRefresh, haveScrollbar, undoForwardState, handleUndoRefresh, handleForwardRefresh, handleBackToTop, scrollViewportRef } = useBewlyApp()

// 先声明数据变量
const videoList = tabState.ref<VideoElement[]>('videoList', [])
const appVideoList = tabState.ref<AppVideoElement[]>('appVideoList', [])

const isWebRecommendationMode = computed(() => settings.value.recommendationMode !== 'app')
// App 推荐的单列 / 双列返回不同卡片，切换任一都需要重新加载推荐流
const recommendationFeedKey = computed(() => settings.value.recommendationMode === 'app'
  ? `app:${settings.value.appRecommendationColumn}`
  : settings.value.recommendationMode)
let requestVersion = 0
type WebRecommendRequestType = 'refresh' | 'loadMore'
type WebRecommendationIdentity = 'web' | 'webNoCookie'

const HOME_LOAD_LOG_PREFIX = '[BewlyCat][首页加载]'
let recommendRequestLogId = 0

interface RecommendRequestLogContext {
  id: number
  mode: string
  requestType: WebRecommendRequestType
  startedAt: number
}

function createRecommendRequestLogContext(
  mode: string,
  requestType: WebRecommendRequestType,
): RecommendRequestLogContext {
  return {
    id: ++recommendRequestLogId,
    mode,
    requestType,
    startedAt: performance.now(),
  }
}

function getRequestDuration(context: RecommendRequestLogContext): number {
  return Math.round((performance.now() - context.startedAt) * 100) / 100
}

function logRecommendRequestFailure(
  context: RecommendRequestLogContext,
  details: Record<string, unknown> = {},
) {
  console.error(`${HOME_LOAD_LOG_PREFIX} 推荐接口请求失败`, {
    time: new Date().toLocaleString(),
    requestId: context.id,
    mode: context.mode,
    requestType: context.requestType,
    durationMs: getRequestDuration(context),
    ...details,
  })
}

function getRecommendErrorLogDetails(error: unknown): Record<string, unknown> {
  const errorRecord = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : undefined

  return {
    error,
    name: error instanceof Error ? error.name : errorRecord?.name,
    message: error instanceof Error ? error.message : errorRecord?.message ?? String(error),
    code: errorRecord?.code,
    isRiskControl: errorRecord?.isRiskControl,
    originalError: errorRecord?.originalError,
  }
}

// 当前使用的视频列表（根据推荐模式）
const currentVideoList = computed(() =>
  isWebRecommendationMode.value ? videoList.value : appVideoList.value,
)

// 沉浸式模式直接消费当前推荐流：只保留普通视频卡片，番剧等无法用 MP4 取流的卡片跳过
const isImmersiveModeOpen = ref<boolean>(false)
const immersiveInitialKey = ref<string>()
const forYouRootRef = ref<HTMLElement | null>(null)
const immersiveItems = computed<ImmersiveFeedItem[]>(() => {
  const seen = new Set<string>()
  const items: ImmersiveFeedItem[] = []
  for (const element of currentVideoList.value) {
    const video = element.displayData
    if (!video || video.goto !== 'av' || seen.has(element.uniqueId))
      continue
    const bvid = video.bvid || (video.id > 0 ? av2bv(video.id) : '')
    if (!bvid)
      continue
    seen.add(element.uniqueId)
    items.push({ key: element.uniqueId, video: bvid === video.bvid ? video : { ...video, bvid } })
  }
  return items
})

const isLoading = ref<boolean>(true)
const requestFailed = tabState.ref<boolean>('requestFailed', false)
const needToLoginFirst = tabState.ref<boolean>('needToLoginFirst', false)
const refreshIdx = tabState.ref<number>('refreshIdx', 1)
const noMoreContent = tabState.ref<boolean>('noMoreContent', false)
const activatedAppVideo = ref<AppVideoItem | null>()
const showDislikeDialog = ref<boolean>(false)
const showAppAuthorizationDialog = ref<boolean>(false)
const hasInitializedData = tabState.ref<boolean>('hasInitializedData', false)

const selectedDislikeReason = ref<number>(1)

// 修改缓存数据变量，添加前进状态变量
const cachedVideoList = tabState.ref<VideoElement[]>('cachedVideoList', [])
const cachedRefreshIdx = tabState.ref<number>('cachedRefreshIdx', 1)

// 添加前进状态变量
const forwardVideoList = tabState.ref<VideoElement[]>('forwardVideoList', [])
const forwardRefreshIdx = tabState.ref<number>('forwardRefreshIdx', 1)

// APP 模式的缓存和前进状态变量
const cachedAppVideoList = tabState.ref<AppVideoElement[]>('cachedAppVideoList', [])
const forwardAppVideoList = tabState.ref<AppVideoElement[]>('forwardAppVideoList', [])
// APP 推荐分页游标：与 PiliPlus 一致，刷新从 0 开始并带 pull=true，之后每次成功请求递增。
// 不再取列表末尾卡片的 idx，避免整批被过滤或去重时反复请求同一页。
const appFeedIdx = tabState.ref<number>('appFeedIdx', 0)
const cachedAppFeedIdx = tabState.ref<number>('cachedAppFeedIdx', 0)
const forwardAppFeedIdx = tabState.ref<number>('forwardAppFeedIdx', 0)
// 之前刷新已展示过的 APP 推荐，刷新后不再重复展示
const appRecentShownKeys = tabState.ref<string[]>('appRecentShownKeys', [])

// 添加状态标记
const hasBackState = tabState.ref<boolean>('hasBackState', false)
const hasForwardState = tabState.ref<boolean>('hasForwardState', false)

const PAGE_SIZE = 30
const WEB_REFRESH_PAGE_SIZE = 10
const WEB_LOAD_MORE_PAGE_SIZE = 12
const WEB_REFRESH_FRESH_TYPE = 3
const WEB_LOAD_MORE_FRESH_TYPE = 4
const WEB_LOAD_MORE_Y_NUM = 3
const WEB_LAST_Y_NUM = 4
const WEB_FIVE_COLUMN_MIN_WIDTH = 1400
const WEB_FETCH_ROW_STEP = 3
const WEB_FRESH_IDX_1H_WINDOW_MS = 60 * 60 * 1000
const WEB_LOCATION = 1430650
const WEB_REQUEST_MAX_ATTEMPTS_PER_IDENTITY = 3
const WEB_REQUEST_RETRY_WINDOW_MS = 5_000
const WEB_REQUEST_RETRY_BASE_DELAY_MS = 250
const WEB_RISK_COOLDOWN_STEPS_MS = [5_000, 15_000, 30_000, 60_000] as const
const APP_REQUEST_MAX_ATTEMPTS = 3
const APP_REQUEST_RETRY_WINDOW_MS = 5_000
const APP_REQUEST_RETRY_BASE_DELAY_MS = 250
const APP_RECENT_SHOWN_MAX_KEYS = 600
// 参考 PiliPlus 的 HD 推荐请求参数
const APP_FEED_PARAMS = {
  build: 8430300,
  channel: 'master',
  device: 'phone',
  device_name: 'android',
  device_type: 0,
  disable_rcmd: 0,
  flush: 8,
  fnval: 976,
  fnver: 0,
  force_host: 2,
  fourk: 1,
  guidance: 1,
  https_url_req: 1,
  mobi_app: 'android_i',
  network: 'wifi',
  platform: 'android',
  player_net: 1,
  qn: 32,
  recsys_mode: 0,
  statistics: JSON.stringify({ appId: 1, platform: 3, version: '8.43.0', abtest: '' }),
  voice_balance: 0,
} as const
const APP_FOLLOWED_REASONS = new Set(['已关注', '已關注', '新关注', '新關注'])
const NO_COOKIE_RECOMMEND_STATE_MAX_SHOWLIST_GROUPS = 3
const WEB_LAST_CLICKLIST_MAX_ITEMS = 50
const MAX_EMPTY_LOADS = 5 // 最大连续空加载次数
const FILTERED_FEED_SAMPLE_SIZE = 100
const FILTERED_FEED_MIN_RETENTION_RATE = 0.6
const FILTERED_FEED_RISK_WARNING_MIN_KEPT = 50
const FULLY_FILTERED_LOAD_WARNING_THRESHOLD = 2
const APP_LOAD_BATCHES = tabState.ref<number>('APP_LOAD_BATCHES', 1) // APP模式每次加载的批次数，初始化时为1
const scrollLoadStartLength = tabState.ref<number>('scrollLoadStartLength', 0) // 滚动加载开始时的列表长度
const consecutiveEmptyLoads = tabState.ref<number>('consecutiveEmptyLoads', 0) // 连续空加载次数，用于防止无限递归（Web模式）
const appConsecutiveEmptyLoads = tabState.ref<number>('appConsecutiveEmptyLoads', 0) // APP模式连续空加载次数
// 递归加载锁，防止双重触发
const isRecursiveLoading = ref<boolean>(false)
const webRiskCooldownUntil = tabState.ref<number>('webRiskCooldownUntil', 0)
let webRiskCooldownToastKey = 0
let webRiskCooldownLevel = tabState.read('webRiskCooldownLevel', 0)
tabState.capture('webRiskCooldownLevel', () => webRiskCooldownLevel)
const webFetchRow = tabState.ref<number>('webFetchRow', 1)
const webFreshIdx1h = tabState.ref<number>('webFreshIdx1h', 1)
let webFreshIdx1hTimestamp = tabState.read('webFreshIdx1hTimestamp', Date.now())
tabState.capture('webFreshIdx1hTimestamp', () => webFreshIdx1hTimestamp)
const webRefreshBrush = tabState.ref<number>('webRefreshBrush', 0)
const webLoadMoreBrush = tabState.ref<number>('webLoadMoreBrush', 1)
let webRecommendationUniqId = tabState.read('webRecommendationUniqId', createWebRecommendationUniqId())
tabState.capture('webRecommendationUniqId', () => webRecommendationUniqId)
const webShowlistGroups = tabState.ref<string[]>('webShowlistGroups', [])
const webLastClicklist = tabState.ref<string[]>('webLastClicklist', [])

const cachedWebFetchRow = tabState.ref<number>('cachedWebFetchRow', 1)
const cachedWebFreshIdx1h = tabState.ref<number>('cachedWebFreshIdx1h', 1)
const cachedWebRefreshBrush = tabState.ref<number>('cachedWebRefreshBrush', 0)
const cachedWebLoadMoreBrush = tabState.ref<number>('cachedWebLoadMoreBrush', 1)
const cachedWebShowlistGroups = tabState.ref<string[]>('cachedWebShowlistGroups', [])

const forwardWebFetchRow = tabState.ref<number>('forwardWebFetchRow', 1)
const forwardWebFreshIdx1h = tabState.ref<number>('forwardWebFreshIdx1h', 1)
const forwardWebRefreshBrush = tabState.ref<number>('forwardWebRefreshBrush', 0)
const forwardWebLoadMoreBrush = tabState.ref<number>('forwardWebLoadMoreBrush', 1)
const forwardWebShowlistGroups = tabState.ref<string[]>('forwardWebShowlistGroups', [])

const filteredFeedCandidateCount = tabState.ref('filteredFeedCandidateCount', 0)
const filteredFeedKeptCount = tabState.ref('filteredFeedKeptCount', 0)
const hasShownFilteredFeedRiskWarning = tabState.ref('hasShownFilteredFeedRiskWarning', false)
const hasFilledRecommendationViewport = tabState.ref('hasFilledRecommendationViewport', false)
let consecutiveFullyFilteredLoadCount = tabState.read('consecutiveFullyFilteredLoadCount', 0)
tabState.capture('consecutiveFullyFilteredLoadCount', () => consecutiveFullyFilteredLoadCount)
let consecutiveFullyFilteredCandidateCount = tabState.read('consecutiveFullyFilteredCandidateCount', 0)
tabState.capture('consecutiveFullyFilteredCandidateCount', () => consecutiveFullyFilteredCandidateCount)
let pendingFilteredFeedSampleWarning: { count: number, total: number } | undefined
const hasActiveWebRecommendationFilter = computed(() => settings.value.enableFilterByDuration
  || settings.value.enableFilterByViewCount
  || settings.value.enableFilterByLikeCount
  || settings.value.enableFilterByTitle
  || settings.value.enableFilterByUser
  || settings.value.enableFilterByPublishTime)
const hasActiveAppRecommendationFilter = computed(() => settings.value.filterOutVerticalVideos
  || settings.value.enableFilterByDuration
  || settings.value.enableFilterByViewCount
  || settings.value.enableFilterByTitle
  || settings.value.enableFilterByUser)
const hasActiveRecommendationFilter = computed(() => isWebRecommendationMode.value
  ? hasActiveWebRecommendationFilter.value
  : hasActiveAppRecommendationFilter.value)
const filteredFeedRetentionRate = computed(() => filteredFeedCandidateCount.value > 0
  ? filteredFeedKeptCount.value / filteredFeedCandidateCount.value
  : 1)
const requiresManualFilteredPaging = computed(() => hasActiveRecommendationFilter.value
  && filteredFeedCandidateCount.value >= FILTERED_FEED_SAMPLE_SIZE
  && filteredFeedRetentionRate.value < FILTERED_FEED_MIN_RETENTION_RATE)

const recommendationFilterSettingsSignature = computed(() => JSON.stringify([
  settings.value.disableFilterForFollowedUser,
  settings.value.filterOutVerticalVideos,
  settings.value.enableFilterByDuration,
  settings.value.enableFilterByViewCount,
  settings.value.enableFilterByLikeCount,
  settings.value.enableFilterByTitle,
  settings.value.enableFilterByUser,
  settings.value.enableFilterByPublishTime,
  settings.value.filterByDuration,
  settings.value.filterByViewCount,
  settings.value.filterByLikeCount,
  settings.value.filterByPublishTime,
  settings.value.filterByTitle.map(item => item.keyword),
  settings.value.filterByUser.map(item => item.keyword),
]))

function resetFilteredFeedPagingState() {
  filteredFeedCandidateCount.value = 0
  filteredFeedKeptCount.value = 0
  hasShownFilteredFeedRiskWarning.value = false
  consecutiveFullyFilteredLoadCount = 0
  consecutiveFullyFilteredCandidateCount = 0
  pendingFilteredFeedSampleWarning = undefined
}

function showFilteredFeedRiskWarning(count: number, total: number) {
  if (
    !settings.value.showRecommendationFilterRiskWarning
    || hasShownFilteredFeedRiskWarning.value
    || !hasFilledRecommendationViewport.value
    || total < 1
  ) {
    return
  }

  hasShownFilteredFeedRiskWarning.value = true
  toast.warning(t('home.recommendation_filter_risk_warning', { count, total }))
}

function markRecommendationViewportFilled(hasScrollbar: boolean) {
  if (!hasScrollbar || hasFilledRecommendationViewport.value)
    return

  hasFilledRecommendationViewport.value = true
  if (pendingFilteredFeedSampleWarning) {
    showFilteredFeedRiskWarning(
      pendingFilteredFeedSampleWarning.count,
      pendingFilteredFeedSampleWarning.total,
    )
  }
}

function recordFilteredFeedBatch(candidateCount: number, keptCount: number) {
  const fullyFiltered = candidateCount > 0 && keptCount === 0
  if (
    !hasActiveRecommendationFilter.value
    || !hasFilledRecommendationViewport.value
    || !fullyFiltered
  ) {
    consecutiveFullyFilteredLoadCount = 0
    consecutiveFullyFilteredCandidateCount = 0
    return
  }

  consecutiveFullyFilteredLoadCount++
  consecutiveFullyFilteredCandidateCount += candidateCount
  if (consecutiveFullyFilteredLoadCount >= FULLY_FILTERED_LOAD_WARNING_THRESHOLD)
    showFilteredFeedRiskWarning(0, consecutiveFullyFilteredCandidateCount)
}

function recordFilteredFeedCandidate(kept: boolean) {
  if (!hasActiveRecommendationFilter.value)
    return

  filteredFeedCandidateCount.value++
  if (kept)
    filteredFeedKeptCount.value++

  if (
    filteredFeedCandidateCount.value === FILTERED_FEED_SAMPLE_SIZE
    && filteredFeedKeptCount.value < FILTERED_FEED_RISK_WARNING_MIN_KEPT
  ) {
    pendingFilteredFeedSampleWarning = {
      count: filteredFeedKeptCount.value,
      total: FILTERED_FEED_SAMPLE_SIZE,
    }
    showFilteredFeedRiskWarning(filteredFeedKeptCount.value, FILTERED_FEED_SAMPLE_SIZE)
  }
}

watch(recommendationFilterSettingsSignature, () => {
  resetFilteredFeedPagingState()
  consecutiveEmptyLoads.value = 0
  appConsecutiveEmptyLoads.value = 0
})

function isDocumentVisible(): boolean {
  return document.visibilityState === 'visible'
}

const initTimers = new Set<number>()
const retryTimers = new Map<number, () => void>()
let initialDataPromise: Promise<void> | undefined

function scheduleInitTask(task: () => void, delay: number) {
  const timer = window.setTimeout(() => {
    initTimers.delete(timer)
    if (tabState.isCurrent())
      task()
  }, delay)
  initTimers.add(timer)
}

function clearInitTimers() {
  initTimers.forEach(timer => window.clearTimeout(timer))
  initTimers.clear()
  for (const [timer, resolve] of retryTimers) {
    window.clearTimeout(timer)
    resolve()
  }
  retryTimers.clear()
}

function ensureInitialData() {
  if (hasInitializedData.value || initialDataPromise)
    return

  // 首次请求不能依赖可能在卸载时被清理的延迟定时器，否则快速的
  // 页面切换可能留下永久骨架屏，且不会真正发起推荐接口请求。
  initialDataPromise = initData().finally(() => {
    initialDataPromise = undefined
  })
}

tabState.capture('appAuthorized', () => Boolean(appAuthTokens.value.accessToken))

onMounted(() => {
  if (!tabState.isCurrent())
    return
  if (tabState.restored) {
    forYouStore.resetState()
    isLoading.value = false
    initPageAction()
    const authorizationChanged = settings.value.recommendationMode === 'app'
      && tabState.read('appAuthorized', false) !== Boolean(appAuthTokens.value.accessToken)
    if (authorizationChanged)
      hasInitializedData.value = false
    else if (currentVideoList.value.length > 0)
      hasInitializedData.value = true
    ensureInitialData()
    return
  }
  const preservedModeHasItems = settings.value.recommendationMode === 'app'
    ? forYouStore.state.appVideoList.length > 0
    : forYouStore.state.videoList.length > 0

  // 如果启用状态保留且store中有数据，则恢复状态
  if (
    settings.value.preserveForYouState
    && forYouStore.state.isInitialized
    && forYouStore.state.recommendationMode === settings.value.recommendationMode
    && (settings.value.recommendationMode !== 'app' || forYouStore.state.appRecommendationColumn === settings.value.appRecommendationColumn)
    && preservedModeHasItems
  ) {
    // 恢复关键状态
    const savedState = forYouStore.getCompleteState()
    videoList.value = [...savedState.videoList]
    appVideoList.value = [...savedState.appVideoList]
    appFeedIdx.value = savedState.appFeedIdx ?? 0
    appRecentShownKeys.value = savedState.appRecentShownKeys?.slice(-APP_RECENT_SHOWN_MAX_KEYS) || []
    refreshIdx.value = savedState.refreshIdx
    webFreshIdx1h.value = savedState.webFreshIdx1h ?? 1
    webFreshIdx1hTimestamp = savedState.webFreshIdx1hTimestamp ?? Date.now()
    webFetchRow.value = savedState.webFetchRow ?? 1
    webRefreshBrush.value = savedState.webRefreshBrush ?? 0
    webLoadMoreBrush.value = savedState.webLoadMoreBrush ?? 1
    webRecommendationUniqId = savedState.webUniqId || createWebRecommendationUniqId()
    webLastClicklist.value = savedState.webLastClicklist?.slice(-WEB_LAST_CLICKLIST_MAX_ITEMS) || []
    noMoreContent.value = savedState.noMoreContent
    if (savedState.webShowlistGroups?.length)
      webShowlistGroups.value = savedState.webShowlistGroups.filter(Boolean).slice(-1)
    else
      rebuildShowlistGroupsFromList(videoList.value)
    hasInitializedData.value = true
    isLoading.value = false
    void nextTick(async () => {
      const hasScrollbar = await haveScrollbar()
      if (tabState.isCurrent())
        markRecommendationViewportFilled(hasScrollbar)
    })

    // Store 只负责跨卸载恢复。数据已交还给当前组件后立即释放快照，
    // 避免 活动列表与 Pinia 同时各持有一整份推荐数据。
    forYouStore.resetState()

    // 确保撤销按钮不显示（因为这是状态恢复，不是刷新操作）
    hasBackState.value = false
    hasForwardState.value = false
    undoForwardState.value = UndoForwardState.Hidden

    // 清空所有缓存状态，确保没有历史数据影响
    cachedVideoList.value = []
    cachedRefreshIdx.value = 1
    cachedWebFetchRow.value = 1
    cachedWebFreshIdx1h.value = 1
    cachedWebRefreshBrush.value = 0
    cachedWebLoadMoreBrush.value = 1
    forwardVideoList.value = []
    forwardRefreshIdx.value = 1
    forwardWebFetchRow.value = 1
    forwardWebFreshIdx1h.value = 1
    forwardWebRefreshBrush.value = 0
    forwardWebLoadMoreBrush.value = 1

    // 恢复滚动位置
    if (savedState.scrollTop) {
      nextTick(() => {
        const viewport = scrollViewportRef.value
        if (tabState.isCurrent() && viewport)
          viewport.scrollTop = savedState.scrollTop || 0
      })
    }

    // 延迟初始化页面交互功能，避免立即触发数据加载
    scheduleInitTask(() => {
      initPageAction()
      // 在初始化页面交互功能后，再次确保按钮状态正确
      scheduleInitTask(() => {
        if (settings.value.preserveForYouState) {
          undoForwardState.value = UndoForwardState.Hidden
        }
      }, 100)
    }, 1000)
  }
  else {
    // 首次加载或未启用状态保留时，初始化数据
    initPageAction()
    ensureInitialData()
  }
})

onBeforeUnmount(() => {
  // Ignore pending responses and stop recursive viewport filling after eviction.
  requestVersion++
  clearInitTimers()
  // 如果启用状态保留，保存当前状态到store
  if (settings.value.preserveForYouState && tabState.isActiveTab()) {
    // 获取当前滚动位置
    const scrollTop = scrollViewportRef.value?.scrollTop || 0

    const currentState = {
      videoList: [...videoList.value],
      appVideoList: [...appVideoList.value],
      appFeedIdx: appFeedIdx.value,
      appRecentShownKeys: [...appRecentShownKeys.value],
      refreshIdx: refreshIdx.value,
      webFreshIdx1h: webFreshIdx1h.value,
      webFreshIdx1hTimestamp,
      webFetchRow: webFetchRow.value,
      webRefreshBrush: webRefreshBrush.value,
      webLoadMoreBrush: webLoadMoreBrush.value,
      webUniqId: webRecommendationUniqId,
      webShowlistGroups: [...webShowlistGroups.value],
      webLastClicklist: [...webLastClicklist.value],
      noMoreContent: noMoreContent.value,
      isInitialized: true,
      recommendationMode: settings.value.recommendationMode,
      appRecommendationColumn: settings.value.appRecommendationColumn,
      scrollTop, // 保存滚动位置
    }
    forYouStore.saveCompleteState(currentState)
  }
})

onKeyStroke((e: KeyboardEvent) => {
  if (showDislikeDialog.value) {
    const dislikeReasons = activatedAppVideo.value?.three_point_v2?.find(option => option.type === ThreePointV2Type.Dislike)?.reasons || []

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault()
      dislikeReasons.forEach((reason) => {
        if (dislikeReasons[Number(e.key) - 1] && reason.id === dislikeReasons[Number(e.key) - 1].id)
          selectedDislikeReason.value = reason.id
      })
    }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const currentIndex = dislikeReasons.findIndex(reason => selectedDislikeReason.value === reason.id)
      if (currentIndex > 0)
        selectedDislikeReason.value = dislikeReasons[currentIndex - 1].id
    }
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const currentIndex = dislikeReasons.findIndex(reason => selectedDislikeReason.value === reason.id)
      if (currentIndex < dislikeReasons.length - 1)
        selectedDislikeReason.value = dislikeReasons[currentIndex + 1].id
    }
  }
})

// 数据转换函数：将原始数据转换为 VideoCard 所需的显示格式
// 这样可以避免在模板中进行大量计算，提高渲染性能
function transformWebVideo(item: VideoItem): VideoCardDisplayData {
  return {
    id: item.id,
    duration: item.duration,
    title: decodeHtmlEntities(item.title),
    cover: item.pic,
    author: {
      name: decodeHtmlEntities(item.owner?.name || ''),
      authorFace: item.owner?.face || '',
      followed: !!item.is_followed,
      mid: item.owner?.mid || 0,
    },
    tag: decodeHtmlEntities(item?.rcmd_reason?.content),
    view: item.stat?.view || 0,
    danmaku: item.stat?.danmaku || 0,
    like: item.stat?.like,
    publishedTimestamp: item.pubdate,
    bvid: item.bvid,
    cid: item.cid,
    goto: item.goto,
    trackId: item.track_id,
    threePointV2: [],
  }
}

// 推荐理由可能以「|」组合多项，如「1万点赞 | 竖屏」
function getAppRcmdReasons(item: AppVideoItem): string[] {
  const reason = item.rcmd_reason
  const text = typeof reason === 'string' ? reason : reason?.content
  return text?.split('|').map(part => part.trim()).filter(Boolean) ?? []
}

const APP_CHANNEL_REASON_PREFIX = '频道:'

function getAppChannelNames(item: AppVideoItem): string[] {
  const reasons = item.three_point_v2?.find(option => option.type === ThreePointV2Type.Dislike)?.reasons ?? []
  return reasons.flatMap(({ name }) =>
    name?.startsWith(APP_CHANNEL_REASON_PREFIX) ? [name.slice(APP_CHANNEL_REASON_PREFIX.length).trim()] : [],
  ).filter(Boolean)
}

function isAppVerticalVideo(item: AppVideoItem): boolean {
  return getAppRcmdReasons(item).includes('竖屏') || (!!item.uri && isVerticalVideo(item.uri))
}

function getAppBangumiUrl(uri?: string): string {
  if (!uri)
    return ''
  if (/^https?:\/\//.test(uri))
    return uri

  // bilibili://pgc/season/ep/123456 或 bilibili://pgc/season/123456
  const match = uri.match(/^bilibili:\/\/pgc\/season\/(ep\/)?(\d+)/)
  if (!match)
    return ''
  return `https://www.bilibili.com/bangumi/play/${match[1] ? 'ep' : 'ss'}${match[2]}`
}

/**
 * 将 HD 接口的卡片归一化为原有字段：HD 接口不返回 bvid 与 mask.avatar，
 * UP 主信息位于 args / desc_button，关注状态位于字符串形式的 rcmd_reason。
 */
function normalizeAppVideoItem(item: AppVideoItem): AppVideoItem {
  const paramAid = item.card_goto === 'av' ? Number(item.param) : 0
  const aid = item.player_args?.aid || item.args?.aid || (Number.isSafeInteger(paramAid) && paramAid > 0 ? paramAid : undefined)
  const followedReason = getAppRcmdReasons(item).find(reason => APP_FOLLOWED_REASONS.has(reason))

  return {
    ...item,
    bvid: item.bvid?.trim() || (item.card_goto === 'av' && aid ? av2bv(aid) : undefined),
    args: {
      ...item.args,
      aid,
      up_id: item.args?.up_id || item.mask?.avatar?.up_id,
      up_name: item.args?.up_name || item.mask?.avatar?.text || item.desc_button?.text,
    },
    // 单列接口没有「已关注」推荐理由，改用 is_atten 标记
    bottom_rcmd_reason: item.bottom_rcmd_reason || followedReason || (item.is_atten ? '已关注' : undefined),
  }
}

function transformAppVideo(item: AppVideoItem): VideoCardDisplayData {
  // 预先计算 followed 状态，避免多次 trim 和比较
  const bottomReason = item?.bottom_rcmd_reason?.trim()
  const followed = !!bottomReason && APP_FOLLOWED_REASONS.has(bottomReason)

  // 预先计算 capsuleText，提取复杂逻辑
  // 单列接口的 desc 为「UP 主 · 发布时间」，联合投稿时 multiply_desc.extra 为「等N人联合创作 · 发布时间」
  const descPart = (item.multiply_desc?.extra || item.desc)?.split('·')?.[1]?.trim()
  const capsuleText = descPart || (followed ? bottomReason : undefined)

  // HD 接口的推荐理由（如「1万点赞」）；竖屏已有类型图标，关注状态已由 followed 体现
  // 之后追加「我不想看」中的频道名（如「频道:二次元」），作为视频所属频道标签显示
  const tags = [...new Set([
    ...getAppRcmdReasons(item).filter(reason => reason !== '竖屏' && !APP_FOLLOWED_REASONS.has(reason)),
    ...getAppChannelNames(item),
  ])].map(reason => decodeHtmlEntities(reason))

  // 预先计算 type，避免在模板中调用函数
  let type: 'horizontal' | 'vertical' | 'bangumi' = 'horizontal'
  if (item.card_goto === 'bangumi') {
    type = 'bangumi'
  }
  else if (isAppVerticalVideo(item)) {
    type = 'vertical'
  }

  return {
    // 注意：aid 可能为 0 或 undefined，但只要有 bvid 就是有效视频
    // VideoCardGrid 的骨架屏判断已优化为同时检查 id 和 bvid
    id: item.args?.aid ?? 0,
    durationStr: item.cover_right_text,
    title: decodeHtmlEntities(item.title),
    cover: item.cover || '',
    author: {
      name: decodeHtmlEntities(item.args?.up_name || ''),
      // 单列接口在 avatar 中返回头像，双列接口不返回，留空时卡片隐藏头像
      authorFace: item?.mask?.avatar?.cover || item?.avatar?.cover || '',
      followed,
      mid: item.args?.up_id || 0,
    },
    // App 推荐的 rname 为分区名，tname 为话题标签
    category: decodeHtmlEntities(item.args?.rname) || undefined,
    tag: tags.length > 0 ? tags : undefined,
    capsuleText: decodeHtmlEntities(capsuleText),
    bvid: item.bvid || '',
    viewStr: item.cover_left_text_1,
    danmakuStr: item.cover_left_text_2,
    like: item.like_button?.count,
    cid: item?.player_args?.cid,
    // 与 PiliPlus 一致，不感兴趣接口的 goto 取 card_goto
    goto: item.card_goto,
    param: item?.param,
    trackId: item?.track_id,
    url: item.card_goto === 'bangumi' ? getAppBangumiUrl(item.uri) : '',
    type,
    threePointV2: item?.three_point_v2 || [],
  }
}

function getWebVideoKey(item: VideoItem): string {
  const bvid = item.bvid?.trim()
  if (bvid)
    return bvid
  return `${item.id}`
}

function isValidWebRecommendationVideo(item: VideoItem): boolean {
  return item.goto === 'av' && (!!item.bvid?.trim() || item.id > 0)
}

function getAppVideoKeys(item: AppVideoItem): string[] {
  const keys: string[] = []
  const bvid = item.bvid?.trim()
  if (bvid)
    keys.push(`bvid:${bvid}`)

  const aid = item.args?.aid
  if (aid && aid > 0)
    keys.push(`aid:${aid}`)

  // 番剧等卡片可能没有 aid，用卡片类型与 param 兜底
  const param = `${item.param ?? ''}`.trim()
  if (param && item.card_goto !== 'av')
    keys.push(`${item.card_goto}:${param}`)
  return keys
}

function isAppAdItem(item: AppVideoItem): boolean {
  return item.card_type?.includes('banner')
    || item.card_type === 'cm_v1'
    || item.card_goto === 'ad_av'
    || item.card_goto === 'ad_web_s'
    || !!item.ad_info
}

function isValidAppRecommendationVideo(item: AppVideoItem): boolean {
  return (item.card_goto === 'av' || item.card_goto === 'bangumi')
    && !isAppAdItem(item)
    && getAppVideoKeys(item).length > 0
}

function rememberAppRecentShown(list: AppVideoElement[]) {
  const listKeys = list.flatMap(video => video.item ? getAppVideoKeys(video.item) : [])
  if (!listKeys.length)
    return

  // 重新出现的记录移到末尾，超出上限时优先淘汰最早展示的
  const listKeySet = new Set(listKeys)
  appRecentShownKeys.value = [
    ...appRecentShownKeys.value.filter(key => !listKeySet.has(key)),
    ...listKeySet,
  ].slice(-APP_RECENT_SHOWN_MAX_KEYS)
}

function getWebShowlistEntry(item: VideoItem, exposed = false): string | undefined {
  const goto = `${item.goto || ''}`.trim()
  if (!goto)
    return undefined

  const sourceId = item.id || item.business_info?.src_id || 'undefined'
  const archiveAid = goto === 'ad' ? item.business_info?.archive?.aid : undefined
  const exposureMarker = exposed ? '' : 'n_'
  return `${goto}_${exposureMarker}${sourceId}${archiveAid ? `_${archiveAid}` : ''}`
}

function buildLastShowlistGroup(items: VideoItem[]): string {
  return items
    .map(item => getWebShowlistEntry(item))
    .filter((entry): entry is string => !!entry)
    .join(',')
}

function getLastShowlistFromGroups(): string {
  return webShowlistGroups.value.filter(Boolean).join(';')
}

function getNoCookieStoredLastShowlist(): string {
  if (!settings.value.rememberNoCookieRecommendationState)
    return ''

  return noCookieForYouRecommendationState.value.showlistGroups
    .filter(Boolean)
    .slice(-NO_COOKIE_RECOMMEND_STATE_MAX_SHOWLIST_GROUPS)
    .join(';')
}

function getNoCookieNextFreshIdx(): number {
  if (!settings.value.rememberNoCookieRecommendationState)
    return refreshIdx.value

  const nextFreshIdx = noCookieForYouRecommendationState.value.nextFreshIdx
  return Number.isFinite(nextFreshIdx) && nextFreshIdx > 0 ? Math.floor(nextFreshIdx) : 1
}

function saveNoCookieRecommendationState(group: string, recommendationMode: string, nextFreshIdx?: number) {
  if (recommendationMode !== 'webNoCookie' || !settings.value.rememberNoCookieRecommendationState)
    return
  if (!group && nextFreshIdx === undefined)
    return

  const groups = noCookieForYouRecommendationState.value.showlistGroups
    .filter(storedGroup => storedGroup && storedGroup !== group)

  if (group)
    groups.push(group)

  noCookieForYouRecommendationState.value = {
    showlistGroups: groups.slice(-NO_COOKIE_RECOMMEND_STATE_MAX_SHOWLIST_GROUPS),
    nextFreshIdx: nextFreshIdx ?? noCookieForYouRecommendationState.value.nextFreshIdx,
  }
}

function rebuildShowlistGroupsFromList(list: VideoElement[]) {
  const items = list
    .slice(-WEB_LOAD_MORE_PAGE_SIZE)
    .map(video => video.item)
    .filter((item): item is VideoItem => !!item)
  const group = buildLastShowlistGroup(items)
  webShowlistGroups.value = group ? [group] : []
}

function createWebRecommendationUniqId(): string {
  return `${Math.floor(10_000_000_000 + Math.random() * 90_000_000_000)}`
}

function getWebRecommendationDevice(): 'win' | 'mac' | 'linux' | 'unknown' {
  const userAgent = navigator.userAgent
  if (/windows|win32|win64|wow32|wow64/i.test(userAgent))
    return 'win'
  if (/macintosh|macintel|macppc|mac68k|macos/i.test(userAgent))
    return 'mac'
  if ((/linux/i.test(userAgent) && !/android/i.test(userAgent)) || /x11/i.test(userAgent))
    return 'linux'
  return 'unknown'
}

function getWebRecommendationScreen(): string {
  return getCookie('browser_resolution') || `${window.innerWidth}-${window.innerHeight}`
}

function getWebRecommendationRefreshYNum(): number {
  return window.innerWidth < WEB_FIVE_COLUMN_MIN_WIDTH ? 4 : 5
}

function getWebRecommendationLastYNum(): number {
  const storedColumnCount = Number(getCookie('home_feed_column'))
  return Number.isFinite(storedColumnCount) && storedColumnCount > 0
    ? storedColumnCount
    : WEB_LAST_Y_NUM
}

function getCurrentWebFreshIdx1h(): number {
  const now = Date.now()
  if (now - webFreshIdx1hTimestamp > WEB_FRESH_IDX_1H_WINDOW_MS) {
    webFreshIdx1h.value = 1
    webFreshIdx1hTimestamp = now
  }
  return webFreshIdx1h.value
}

function resetWebRecommendState() {
  refreshIdx.value = 1
  webFreshIdx1h.value = 1
  webFreshIdx1hTimestamp = Date.now()
  webFetchRow.value = 1
  webRefreshBrush.value = 0
  webLoadMoreBrush.value = 1
  webRecommendationUniqId = createWebRecommendationUniqId()
  webShowlistGroups.value = []
  webLastClicklist.value = []
}

function markWebRecommendationExposed(element: VideoElement | AppVideoElement) {
  if (!isWebRecommendationMode.value || !element.item)
    return

  const item = element.item as VideoItem
  const pendingEntry = getWebShowlistEntry(item)
  const exposedEntry = getWebShowlistEntry(item, true)
  if (!pendingEntry || !exposedEntry)
    return

  webShowlistGroups.value = webShowlistGroups.value.map(group => group
    .split(',')
    .map(entry => entry === pendingEntry ? exposedEntry : entry)
    .join(','))
}

function recordWebRecommendationClick(element: VideoElement | AppVideoElement) {
  if (!isWebRecommendationMode.value || !element.item)
    return

  const item = element.item as VideoItem
  const goto = `${item.goto || ''}`.trim()
  if (!goto || !item.id)
    return

  webLastClicklist.value.push(`${goto}_${item.id}`)
  if (webLastClicklist.value.length > WEB_LAST_CLICKLIST_MAX_ITEMS)
    webLastClicklist.value = webLastClicklist.value.slice(-WEB_LAST_CLICKLIST_MAX_ITEMS)
}

function waitForRecommendRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      retryTimers.delete(timer)
      resolve()
    }, delayMs)
    retryTimers.set(timer, resolve)
  })
}

function getRecommendRetryDelay(attempt: number, baseDelayMs: number, remainingWindowMs: number): number {
  return Math.max(0, Math.min(baseDelayMs * 2 ** Math.max(0, attempt - 1), remainingWindowMs))
}

function getWebRiskCooldownRemainingMs(): number {
  return Math.max(0, webRiskCooldownUntil.value - Date.now())
}

function isWebRiskCooldownActive(): boolean {
  if (getWebRiskCooldownRemainingMs() > 0)
    return true

  webRiskCooldownUntil.value = 0
  webRiskCooldownToastKey = 0
  return false
}

function startWebRiskCooldown() {
  const cooldownIndex = Math.min(webRiskCooldownLevel, WEB_RISK_COOLDOWN_STEPS_MS.length - 1)
  const cooldownMs = WEB_RISK_COOLDOWN_STEPS_MS[cooldownIndex]
  webRiskCooldownLevel = Math.min(webRiskCooldownLevel + 1, WEB_RISK_COOLDOWN_STEPS_MS.length - 1)
  webRiskCooldownUntil.value = Date.now() + cooldownMs
  webRiskCooldownToastKey = 0

  noMoreContent.value = true
}

function clearActiveWebRiskCooldown() {
  webRiskCooldownUntil.value = 0
  webRiskCooldownToastKey = 0
}

function resetWebRiskRecoveryState() {
  clearActiveWebRiskCooldown()
  webRiskCooldownLevel = 0
}

function notifyWebRiskCooldown() {
  if (!isWebRiskCooldownActive())
    return

  if (webRiskCooldownToastKey === webRiskCooldownUntil.value)
    return

  webRiskCooldownToastKey = webRiskCooldownUntil.value
  const remainingSeconds = Math.max(1, Math.ceil(getWebRiskCooldownRemainingMs() / 1000))
  toast.error(t('home.risk_control_paused', { seconds: remainingSeconds }))
}

function stopWebRecommendationForRisk() {
  startWebRiskCooldown()
  requestFailed.value = true
  noMoreContent.value = true
  notifyWebRiskCooldown()
}

watch(recommendationFeedKey, () => {
  if (!tabState.isCurrent())
    return
  requestVersion++
  noMoreContent.value = false
  resetWebRiskRecoveryState()
  resetWebRecommendState()
  resetFilteredFeedPagingState()
  hasFilledRecommendationViewport.value = false
  consecutiveEmptyLoads.value = 0 // 重置空加载计数器
  appConsecutiveEmptyLoads.value = 0 // 重置APP模式空加载计数器

  videoList.value = []
  appVideoList.value = []
  forwardVideoList.value = []
  cachedVideoList.value = []
  forwardAppVideoList.value = []
  cachedAppVideoList.value = []
  cachedAppFeedIdx.value = 0
  forwardAppFeedIdx.value = 0
  cachedWebFetchRow.value = 1
  cachedWebFreshIdx1h.value = 1
  cachedWebRefreshBrush.value = 0
  cachedWebLoadMoreBrush.value = 1
  cachedWebShowlistGroups.value = []
  forwardWebFetchRow.value = 1
  forwardWebFreshIdx1h.value = 1
  forwardWebRefreshBrush.value = 0
  forwardWebLoadMoreBrush.value = 1
  forwardWebShowlistGroups.value = []

  // 重置前进后退状态
  hasBackState.value = false
  hasForwardState.value = false
  undoForwardState.value = UndoForwardState.Hidden

  // 重置store状态
  forYouStore.resetState()

  initData()
})

// APP 扫码授权只会更新本地 access token，不会改变网页 Cookie 登录态。
// 仅监听「有无 token」的变化，避免后台例行轮换 token 时打断当前推荐流。
watch(() => Boolean(appAuthTokens.value.accessToken), () => {
  if (tabState.isCurrent() && settings.value.recommendationMode === 'app')
    void initData()
})

async function initData() {
  if (!tabState.isCurrent())
    return
  requestVersion++
  // 当前组件即将持有最新列表，旧的跨卸载快照不再有保留价值。
  forYouStore.resetState()
  // 用户主动刷新必须重新获得一次完整请求机会；成功后才重置递增冷却等级。
  clearActiveWebRiskCooldown()
  hasInitializedData.value = false
  // 刷新前展示过的 APP 推荐记入最近展示，新一轮推荐中不再重复出现
  rememberAppRecentShown(appVideoList.value)
  appFeedIdx.value = 0
  // 直接清空列表，骨架屏由 VideoCardGrid 自动处理
  videoList.value = []
  appVideoList.value = []
  noMoreContent.value = false

  APP_LOAD_BATCHES.value = 1 // 初始化时只加载1批
  resetFilteredFeedPagingState()
  hasFilledRecommendationViewport.value = false
  consecutiveEmptyLoads.value = 0 // 重置空加载计数器
  appConsecutiveEmptyLoads.value = 0 // 重置APP模式空加载计数器
  requestFailed.value = false // 重置请求失败状态
  needToLoginFirst.value = false
  try {
    await getData('refresh')
  }
  finally {
    if (tabState.isCurrent())
      hasInitializedData.value = true
  }
}

async function getData(webRequestType: WebRecommendRequestType = 'refresh') {
  if (!tabState.isCurrent())
    return
  const version = requestVersion
  if (isWebRecommendationMode.value && isWebRiskCooldownActive()) {
    noMoreContent.value = true
    notifyWebRiskCooldown()
    return
  }

  emit('beforeLoading')
  isLoading.value = true
  requestFailed.value = false

  try {
    if (isWebRecommendationMode.value) {
      await getRecommendVideos(version, webRequestType)
    }
    else {
      try {
        await getAppRecommendVideos(version, webRequestType)
      }
      catch (error) {
        if (!tabState.isCurrent() || version !== requestVersion || settings.value.recommendationMode !== 'app')
          return

        console.error('App recommendation failed:', error)

        // 检查是否启用自动切换
        if (settings.value.autoSwitchRecommendationMode) {
          // 切换到 web 模式并提示用户
          settings.value.recommendationMode = 'web'
          toast.warning(t('home.app_fallback_web'))
        }
        else {
          requestFailed.value = true
          noMoreContent.value = true
          toast.error(t('home.app_retry_web'))
        }
      }
    }
  }
  catch (error) {
    if (tabState.isCurrent() && version === requestVersion) {
      console.error(`${HOME_LOAD_LOG_PREFIX} 推荐接口请求失败`, {
        time: new Date().toLocaleString(),
        mode: settings.value.recommendationMode,
        requestType: webRequestType,
        phase: 'load-flow',
        ...getRecommendErrorLogDetails(error),
      })
      requestFailed.value = true
      noMoreContent.value = true
    }
  }
  finally {
    if (tabState.isCurrent() && version === requestVersion) {
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

function loadMore(manual = false) {
  if (!tabState.isCurrent())
    return
  if (isWebRecommendationMode.value && isWebRiskCooldownActive()) {
    noMoreContent.value = true
    notifyWebRiskCooldown()
    return
  }

  // 如果正在递归加载中，跳过外部触发的加载请求
  if (
    !hasInitializedData.value
    || isLoading.value
    || noMoreContent.value
    || isRecursiveLoading.value
    || (!manual && requiresManualFilteredPaging.value)
    || (!manual && !isDocumentVisible())
  ) {
    return
  }

  // 滚动加载时，APP模式记录开始长度，触发持续加载
  if (settings.value.recommendationMode === 'app') {
    APP_LOAD_BATCHES.value = 1
    scrollLoadStartLength.value = appVideoList.value.length
  }

  void getData('loadMore')
}

// 供 VideoCardGrid 预加载调用的函数
function handleLoadMore() {
  loadMore()
}

function handleManualLoadMore() {
  loadMore(true)
}

function initPageAction() {
  if (!tabState.isCurrent())
    return
  undoForwardState.value = hasBackState.value
    ? UndoForwardState.ShowUndo
    : hasForwardState.value ? UndoForwardState.ShowForward : UndoForwardState.Hidden

  // VideoCardGrid owns infinite scrolling. Clear callbacks left by other kept-alive tabs.
  handleReachBottom.value = undefined

  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    // 根据当前模式保存数据
    if (isWebRecommendationMode.value) {
      // 总是保存刷新前的当前状态到后退缓存
      cachedVideoList.value = [...videoList.value]
      cachedRefreshIdx.value = refreshIdx.value
      cachedWebFetchRow.value = webFetchRow.value
      cachedWebFreshIdx1h.value = webFreshIdx1h.value
      cachedWebRefreshBrush.value = webRefreshBrush.value
      cachedWebLoadMoreBrush.value = webLoadMoreBrush.value
      cachedWebShowlistGroups.value = [...webShowlistGroups.value]
      hasBackState.value = true

      // 清空前进状态（因为刷新会产生新的分支）
      forwardVideoList.value = []
      forwardWebFetchRow.value = 1
      forwardWebFreshIdx1h.value = 1
      forwardWebRefreshBrush.value = 0
      forwardWebLoadMoreBrush.value = 1
      forwardWebShowlistGroups.value = []
      hasForwardState.value = false

      // 显示撤销按钮
      undoForwardState.value = UndoForwardState.ShowUndo
    }
    else if (settings.value.recommendationMode === 'app') {
      // APP 模式下保存刷新前的当前状态到后退缓存
      cachedAppVideoList.value = [...appVideoList.value]
      cachedAppFeedIdx.value = appFeedIdx.value
      hasBackState.value = true

      // 清空前进状态（因为刷新会产生新的分支）
      forwardAppVideoList.value = []
      forwardAppFeedIdx.value = 0
      hasForwardState.value = false

      // 显示撤销按钮
      undoForwardState.value = UndoForwardState.ShowUndo
    }

    initData()
  }

  // 修改撤销刷新的处理函数
  handleUndoRefresh.value = () => {
    if (hasBackState.value) {
      if (isWebRecommendationMode.value && cachedVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // Web模式下的后退操作
        // 保存当前数据到前进状态
        forwardVideoList.value = videoList.value
        forwardRefreshIdx.value = refreshIdx.value
        forwardWebFetchRow.value = webFetchRow.value
        forwardWebFreshIdx1h.value = webFreshIdx1h.value
        forwardWebRefreshBrush.value = webRefreshBrush.value
        forwardWebLoadMoreBrush.value = webLoadMoreBrush.value
        forwardWebShowlistGroups.value = [...webShowlistGroups.value]
        hasForwardState.value = true

        // 恢复缓存的数据
        videoList.value = cachedVideoList.value
        cachedVideoList.value = []
        refreshIdx.value = cachedRefreshIdx.value
        webFetchRow.value = cachedWebFetchRow.value
        webFreshIdx1h.value = cachedWebFreshIdx1h.value
        webRefreshBrush.value = cachedWebRefreshBrush.value
        webLoadMoreBrush.value = cachedWebLoadMoreBrush.value
        webShowlistGroups.value = [...cachedWebShowlistGroups.value]

        hasBackState.value = false
        undoForwardState.value = UndoForwardState.Hidden
        resetFilteredFeedPagingState()
        consecutiveEmptyLoads.value = 0 // 重置空加载计数器
      }
      else if (settings.value.recommendationMode === 'app' && cachedAppVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // APP模式下的后退操作
        // 保存当前数据到前进状态
        forwardAppVideoList.value = appVideoList.value
        forwardAppFeedIdx.value = appFeedIdx.value
        hasForwardState.value = true

        // 恢复缓存的数据
        appVideoList.value = cachedAppVideoList.value
        appFeedIdx.value = cachedAppFeedIdx.value
        cachedAppVideoList.value = []

        hasBackState.value = false
        undoForwardState.value = UndoForwardState.Hidden
        resetFilteredFeedPagingState()
        appConsecutiveEmptyLoads.value = 0 // 重置APP模式空加载计数器
      }
    }
  }

  // 添加前进功能
  handleForwardRefresh.value = () => {
    if (hasForwardState.value) {
      if (isWebRecommendationMode.value && forwardVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // Web模式下的前进操作
        // 保存当前数据到后退状态
        cachedVideoList.value = videoList.value
        cachedRefreshIdx.value = refreshIdx.value
        cachedWebFetchRow.value = webFetchRow.value
        cachedWebFreshIdx1h.value = webFreshIdx1h.value
        cachedWebRefreshBrush.value = webRefreshBrush.value
        cachedWebLoadMoreBrush.value = webLoadMoreBrush.value
        cachedWebShowlistGroups.value = [...webShowlistGroups.value]
        hasBackState.value = true

        // 恢复前进状态的数据
        videoList.value = forwardVideoList.value
        forwardVideoList.value = []
        refreshIdx.value = forwardRefreshIdx.value
        webFetchRow.value = forwardWebFetchRow.value
        webFreshIdx1h.value = forwardWebFreshIdx1h.value
        webRefreshBrush.value = forwardWebRefreshBrush.value
        webLoadMoreBrush.value = forwardWebLoadMoreBrush.value
        webShowlistGroups.value = [...forwardWebShowlistGroups.value]

        // 标记为已经前进
        hasForwardState.value = false
        undoForwardState.value = UndoForwardState.ShowUndo
        resetFilteredFeedPagingState()
        consecutiveEmptyLoads.value = 0 // 重置空加载计数器
        return true
      }
      else if (settings.value.recommendationMode === 'app' && forwardAppVideoList.value.length > 0) {
        // 滚动到页面顶部
        handleBackToTop()

        // APP模式下的前进操作
        // 保存当前数据到后退状态
        cachedAppVideoList.value = appVideoList.value
        cachedAppFeedIdx.value = appFeedIdx.value
        hasBackState.value = true

        // 恢复前进状态的数据
        appVideoList.value = forwardAppVideoList.value
        appFeedIdx.value = forwardAppFeedIdx.value
        forwardAppVideoList.value = []

        // 标记为已经前进
        hasForwardState.value = false
        undoForwardState.value = UndoForwardState.ShowUndo
        resetFilteredFeedPagingState()
        appConsecutiveEmptyLoads.value = 0 // 重置APP模式空加载计数器
        return true
      }
    }
    return false
  }
}

async function getRecommendVideos(version = requestVersion, requestType: WebRecommendRequestType = 'refresh') {
  if (!tabState.isCurrent() || version !== requestVersion)
    return

  const recommendationMode = settings.value.recommendationMode
  let canFillViewport = false

  try {
    if (recommendationMode !== 'app' && isWebRiskCooldownActive()) {
      noMoreContent.value = true
      notifyWebRiskCooldown()
      return
    }

    // 检查是否达到最大空加载次数，防止无限递归
    if (!hasActiveRecommendationFilter.value && consecutiveEmptyLoads.value >= MAX_EMPTY_LOADS) {
      console.warn('达到最大连续空加载次数，停止加载')
      noMoreContent.value = true
      return
    }

    const beforeLoadCount = videoList.value.filter(video => video.item).length

    // 使用当前的 refreshIdx，只在成功时才递增
    const isLoadMoreRequest = requestType === 'loadMore'
    const shouldUseNoCookieStoredFreshIdx = !isLoadMoreRequest && recommendationMode === 'webNoCookie' && settings.value.rememberNoCookieRecommendationState
    const currentRefreshIdx = shouldUseNoCookieStoredFreshIdx ? getNoCookieNextFreshIdx() : refreshIdx.value
    const currentFreshIdx1h = getCurrentWebFreshIdx1h()
    const pageSize = isLoadMoreRequest ? WEB_LOAD_MORE_PAGE_SIZE : WEB_REFRESH_PAGE_SIZE
    const fetchRow = isLoadMoreRequest ? webFetchRow.value + WEB_FETCH_ROW_STEP : 1
    const currentLastShowlist = getLastShowlistFromGroups()
    const lastShowlist = currentLastShowlist || (!isLoadMoreRequest && recommendationMode === 'webNoCookie' ? getNoCookieStoredLastShowlist() : '')

    const requestOptions = {
      web_location: WEB_LOCATION,
      y_num: isLoadMoreRequest ? WEB_LOAD_MORE_Y_NUM : getWebRecommendationRefreshYNum(),
      fresh_type: isLoadMoreRequest ? WEB_LOAD_MORE_FRESH_TYPE : WEB_REFRESH_FRESH_TYPE,
      fresh_idx: currentRefreshIdx,
      fresh_idx_1h: currentFreshIdx1h,
      ps: pageSize,
      fetch_row: fetchRow,
      brush: isLoadMoreRequest ? webLoadMoreBrush.value : webRefreshBrush.value,
      device: getWebRecommendationDevice(),
      last_y_num: getWebRecommendationLastYNum(),
      screen: getWebRecommendationScreen(),
      uniq_id: webRecommendationUniqId,
      last_showlist: lastShowlist || undefined,
      last_clicklist: webLastClicklist.value.join(',') || undefined,
    }

    const primaryIdentity: WebRecommendationIdentity = recommendationMode === 'webNoCookie' ? 'webNoCookie' : 'web'
    // Web 模式可以在带 Cookie 请求失败后降级为匿名推荐；无 Cookie 模式
    // 必须保持用户选择，不能反向携带登录 Cookie。
    const requestIdentities: readonly WebRecommendationIdentity[] = primaryIdentity === 'web'
      ? ['web', 'webNoCookie']
      : ['webNoCookie']
    let requestLog: RecommendRequestLogContext | undefined
    let response: forYouResult | undefined
    let successfulIdentity: WebRecommendationIdentity | undefined
    let hadRiskControlFailure = false

    for (const [identityIndex, identity] of requestIdentities.entries()) {
      const phase = identityIndex === 0 ? 'primary' : 'fallback'
      const retryDeadline = Date.now() + WEB_REQUEST_RETRY_WINDOW_MS
      const requestRecommendVideos = identity === 'webNoCookie'
        ? api.video.getNoCookieRecommendVideos
        : api.video.getRecommendVideos

      for (let attempt = 1; attempt <= WEB_REQUEST_MAX_ATTEMPTS_PER_IDENTITY; attempt++) {
        requestLog = createRecommendRequestLogContext(
          `${identity}${phase === 'fallback' ? '(fallback)' : ''}`,
          requestType,
        )

        try {
          response = await requestRecommendVideos(requestOptions)
        }
        catch (error) {
          hadRiskControlFailure ||= isBilibiliRiskControl(error)
          logRecommendRequestFailure(requestLog, {
            ...getRecommendErrorLogDetails(error),
            phase,
            attempt,
          })
          response = undefined
        }

        if (!tabState.isCurrent() || version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
          return

        const hasItems = response?.code === 0
          && response.data
          && Array.isArray(response.data.item)
          && response.data.item.length > 0

        if (hasItems) {
          successfulIdentity = identity
          break
        }

        if (response) {
          const isRiskResponse = isBilibiliRiskControl(response)
          // 部分风控会伪装成 code=0 的空列表，同样按风控失败计数。
          const isSuspiciousEmptyResponse = response.code === 0
            && (!response.data || !Array.isArray(response.data.item) || response.data.item.length === 0)
          hadRiskControlFailure ||= isRiskResponse || isSuspiciousEmptyResponse
          logRecommendRequestFailure(requestLog, {
            code: response.code,
            message: response.message,
            phase,
            attempt,
            reason: isRiskResponse
              ? '风控响应'
              : isSuspiciousEmptyResponse
                ? '推荐数据为空'
                : '接口返回非零响应',
          })
        }

        if (attempt >= WEB_REQUEST_MAX_ATTEMPTS_PER_IDENTITY || response?.code === 62011)
          break

        const remainingWindowMs = retryDeadline - Date.now()
        const retryDelayMs = getRecommendRetryDelay(attempt, WEB_REQUEST_RETRY_BASE_DELAY_MS, remainingWindowMs)
        if (retryDelayMs <= 0)
          break
        await waitForRecommendRetry(retryDelayMs)
        if (!tabState.isCurrent() || version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
          return
      }

      if (successfulIdentity)
        break
    }

    if (!tabState.isCurrent() || version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
      return

    if (!response || !requestLog || !successfulIdentity) {
      if (response?.code === 62011) {
        needToLoginFirst.value = true
        return
      }

      requestFailed.value = true
      noMoreContent.value = true
      if (hadRiskControlFailure) {
        stopWebRecommendationForRisk()
      }
      else {
        toast.error(t('home.recommendations_retry'))
      }
      return
    }

    resetWebRiskRecoveryState()
    requestFailed.value = false
    noMoreContent.value = false

    if (response.code === 0) {
      // 原生首页的 fresh_idx / fresh_idx_1h / brush 只向后推进。
      refreshIdx.value = currentRefreshIdx + 1
      webFreshIdx1h.value = currentFreshIdx1h + 1
      if (isLoadMoreRequest) {
        webFetchRow.value = fetchRow
        webLoadMoreBrush.value++
      }
      else {
        webRefreshBrush.value++
      }

      const resData = [] as VideoItem[]
      const existingIds = new Set<string>()
      const activeWebFilter = hasActiveWebRecommendationFilter.value ? filterFunc.value : null
      let filteredBatchCandidateCount = 0
      let filteredBatchKeptCount = 0

      videoList.value.forEach((video) => {
        if (video.item)
          existingIds.add(getWebVideoKey(video.item))
      })

      response.data.item.forEach((item: VideoItem) => {
        // 过滤掉广告卡片
        if (item.goto === 'ad')
          return

        // 过滤掉缺少必要字段的数据（owner 或 stat 为 null）
        if (!item.owner || !item.stat)
          return

        const passesSettingsFilter = !activeWebFilter || activeWebFilter(item)
        if (activeWebFilter && isValidWebRecommendationVideo(item)) {
          filteredBatchCandidateCount++
          if (passesSettingsFilter)
            filteredBatchKeptCount++
          recordFilteredFeedCandidate(passesSettingsFilter)
        }

        const itemKey = getWebVideoKey(item)
        if (existingIds.has(itemKey))
          return

        existingIds.add(itemKey)
        if (!passesSettingsFilter)
          return

        resData.push(item)
      })

      recordFilteredFeedBatch(filteredBatchCandidateCount, filteredBatchKeptCount)

      // 原生首页从接口的完整下发结果生成 showlist，包含广告和未展示卡片；
      // 下一批到达后只保留最近一批，避免签名 URL 随滚动无限增长。
      const showlistGroup = buildLastShowlistGroup(response.data.item)
      webShowlistGroups.value = showlistGroup ? [showlistGroup] : []

      // when videoList has length property, it means it is the first time to load
      if (!beforeLoadCount) {
        videoList.value = resData.map(item => ({
          uniqueId: getWebVideoKey(item),
          item,
          displayData: transformWebVideo(item),
        }))
      }
      else {
        resData.forEach((item) => {
          // If the `filterFunc` is unset, indicating that the user hasn't specified the filter,
          // skep the `findFirstEmptyItemIndex` check to enhance the performance
          if (!filterFunc.value) {
            videoList.value.push({
              uniqueId: getWebVideoKey(item),
              item,
              displayData: transformWebVideo(item),
            })
          }
          else {
            const findFirstEmptyItemIndex = videoList.value.findIndex(video => !video.item)
            if (findFirstEmptyItemIndex !== -1) {
              videoList.value[findFirstEmptyItemIndex] = {
                uniqueId: getWebVideoKey(item),
                item,
                displayData: transformWebVideo(item),
              }
            }
            else {
              videoList.value.push({
                uniqueId: getWebVideoKey(item),
                item,
                displayData: transformWebVideo(item),
              })
            }
          }
        })
      }

      saveNoCookieRecommendationState(
        showlistGroup,
        successfulIdentity,
        shouldUseNoCookieStoredFreshIdx ? currentRefreshIdx + 1 : undefined,
      )

      // 检查是否成功添加了新内容
      const afterLoadCount = videoList.value.filter(video => video.item).length
      if (afterLoadCount > beforeLoadCount) {
        // 成功加载了新内容，重置空加载计数器
        consecutiveEmptyLoads.value = 0
      }
      else {
        // 没有加载到新内容，增加空加载计数器
        consecutiveEmptyLoads.value++
      }
      canFillViewport = true
    }
    else if (response.code === 62011) {
      logRecommendRequestFailure(requestLog, {
        code: response.code,
        message: response.message,
      })
      needToLoginFirst.value = true
    }
    else {
      // 其他错误码也应该停止加载，避免无限重试
      logRecommendRequestFailure(requestLog, {
        code: response.code,
        message: response.message,
      })
      requestFailed.value = true
      noMoreContent.value = true
    }
  }
  finally {
    if (tabState.isCurrent() && canFillViewport && version === requestVersion && recommendationMode === settings.value.recommendationMode) {
      const filledItems = videoList.value.filter(video => video.item)
      videoList.value = filledItems

      if (!needToLoginFirst.value && !noMoreContent.value) {
        await nextTick()

        const hasScrollbar = await haveScrollbar()
        if (tabState.isCurrent() && version === requestVersion) {
          markRecommendationViewportFilled(hasScrollbar)
          if (!hasScrollbar || filledItems.length < PAGE_SIZE || filledItems.length < 1) {
            if (
              !hasActiveRecommendationFilter.value
              && isDocumentVisible()
              && consecutiveEmptyLoads.value < MAX_EMPTY_LOADS
            ) {
              // 设置递归加载锁，防止 VideoCardGrid 触发额外的 loadMore
              isRecursiveLoading.value = true
              try {
                await getRecommendVideos(version, 'loadMore')
              }
              finally {
                isRecursiveLoading.value = false
              }
            }
            else if (!hasActiveRecommendationFilter.value && consecutiveEmptyLoads.value >= MAX_EMPTY_LOADS) {
              noMoreContent.value = true
            }
          }
        }
      }
    }
  }
}

async function getAppRecommendVideos(
  version = requestVersion,
  requestType: WebRecommendRequestType = 'refresh',
) {
  if (!tabState.isCurrent() || version !== requestVersion)
    return

  const recommendationMode = settings.value.recommendationMode

  // 检查是否达到最大空加载次数，防止无限递归
  if (!hasActiveRecommendationFilter.value && appConsecutiveEmptyLoads.value >= MAX_EMPTY_LOADS) {
    console.warn('APP模式达到最大连续空加载次数，停止加载')
    noMoreContent.value = true
    return
  }

  // 检查是否有有效的 access token
  if (!appAuthTokens.value.accessToken) {
    console.error(`${HOME_LOAD_LOG_PREFIX} 推荐接口请求失败`, {
      time: new Date().toLocaleString(),
      mode: recommendationMode,
      requestType,
      reason: '缺少 access token',
    })
    needToLoginFirst.value = true
    return
  }

  if (!await ensureFreshAppAccessToken()) {
    console.error(`${HOME_LOAD_LOG_PREFIX} 推荐接口请求失败`, {
      time: new Date().toLocaleString(),
      mode: recommendationMode,
      requestType,
      reason: 'access token 已过期且刷新失败',
    })
    needToLoginFirst.value = true
    return
  }

  if (!tabState.isCurrent() || version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
    return

  const batchesToLoad = APP_LOAD_BATCHES.value
  const beforeLoadCount = appVideoList.value.length
  let filteredBatchCandidateCount = 0
  let filteredBatchKeptCount = 0
  // 当前列表与之前刷新展示过的推荐都视为已出现，避免同一视频重复展示
  const seenCandidateIds = new Set([
    ...appRecentShownKeys.value,
    ...appVideoList.value.flatMap(video => video.item ? getAppVideoKeys(video.item) : []),
  ])
  const locale = settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese
    ? 'zh-Hant_TW'
    : 'zh-Hans_CN'

  // 加载多个批次
  for (let batch = 0; batch < batchesToLoad; batch++) {
    try {
      const idx = appFeedIdx.value
      const retryDeadline = Date.now() + APP_REQUEST_RETRY_WINDOW_MS
      let requestLog: RecommendRequestLogContext | undefined
      let response: AppForYouResult | undefined

      for (let attempt = 1; attempt <= APP_REQUEST_MAX_ATTEMPTS; attempt++) {
        requestLog = createRecommendRequestLogContext(recommendationMode, requestType)
        try {
          response = await requestAppClient('feedIndex', {
            ...APP_FEED_PARAMS,
            column: settings.value.appRecommendationColumn === 'double' ? 2 : 1,
            access_key: appAuthTokens.value.accessToken,
            c_locale: locale,
            s_locale: locale,
            idx,
            pull: idx === 0,
          })
        }
        catch (error) {
          logRecommendRequestFailure(requestLog, { error, attempt })
          response = undefined
        }

        if (!tabState.isCurrent() || version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
          return

        const hasItems = response?.code === 0
          && response.data
          && Array.isArray(response.data.items)
          && response.data.items.length > 0

        if (hasItems || response?.code === 62011)
          break

        if (response) {
          logRecommendRequestFailure(requestLog, {
            code: response.code,
            message: response.message,
            attempt,
            reason: response.code === 0 ? '推荐数据为空' : '接口返回非零响应',
          })
        }

        if (attempt >= APP_REQUEST_MAX_ATTEMPTS)
          break

        const remainingWindowMs = retryDeadline - Date.now()
        const retryDelayMs = getRecommendRetryDelay(attempt, APP_REQUEST_RETRY_BASE_DELAY_MS, remainingWindowMs)
        if (retryDelayMs <= 0)
          break
        await waitForRecommendRetry(retryDelayMs)
        if (!tabState.isCurrent() || version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
          return
      }

      if (!tabState.isCurrent() || version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
        return

      if (!response || !requestLog)
        throw new Error('App 推荐接口连续请求失败')

      if (response.code === 0 && (!response.data || !Array.isArray(response.data.items) || response.data.items.length === 0))
        throw new Error('App 推荐接口连续返回空数据')

      if (response.code === 0) {
        // 无论本批是否有可展示的卡片，都推进游标，下次请求下一页
        appFeedIdx.value = idx + 1
        const activeAppFilter = hasActiveAppRecommendationFilter.value ? appFilterFunc.value : null

        response.data.items.forEach((rawItem: AppVideoItem) => {
          const item = normalizeAppVideoItem(rawItem)
          // 移除横幅、广告与无效卡片
          if (!isValidAppRecommendationVideo(item))
            return

          const videoKeys = getAppVideoKeys(item)
          if (videoKeys.some(key => seenCandidateIds.has(key)))
            return
          videoKeys.forEach(key => seenCandidateIds.add(key))

          if (activeAppFilter) {
            // 推荐理由标为「竖屏」但 uri 尺寸未体现竖屏的视频，同样按竖屏视频过滤
            const passesSettingsFilter = activeAppFilter(item)
              && !(settings.value.filterOutVerticalVideos && isAppVerticalVideo(item))
            filteredBatchCandidateCount++
            if (passesSettingsFilter)
              filteredBatchKeptCount++
            recordFilteredFeedCandidate(passesSettingsFilter)
            if (!passesSettingsFilter)
              return
          }

          appVideoList.value.push({
            uniqueId: videoKeys[0],
            item,
            displayData: transformAppVideo(item),
          })
        })
      }
      else if (response.code === 62011) {
        logRecommendRequestFailure(requestLog, {
          code: response.code,
          message: response.message,
        })
        needToLoginFirst.value = true
        break
      }
      else {
        logRecommendRequestFailure(requestLog, {
          code: response.code,
          message: response.message,
        })
        throw new Error(`App 推荐接口返回错误：${response.code} ${response.message || ''}`.trim())
      }
    }
    catch (error) {
      if (!tabState.isCurrent() || version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
        return

      requestFailed.value = true
      throw error
    }
  }

  // 检查是否成功添加了新内容
  if (!tabState.isCurrent() || version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
    return

  recordFilteredFeedBatch(filteredBatchCandidateCount, filteredBatchKeptCount)

  const afterLoadCount = appVideoList.value.length
  if (afterLoadCount > beforeLoadCount) {
    // 成功加载了新内容，重置空加载计数器
    appConsecutiveEmptyLoads.value = 0
  }
  else {
    // 没有加载到新内容，增加空加载计数器
    appConsecutiveEmptyLoads.value++
  }

  if (!needToLoginFirst.value) {
    await nextTick()

    let shouldContinue = false
    const hasScrollbar = await haveScrollbar()
    if (!tabState.isCurrent() || version !== requestVersion)
      return
    markRecommendationViewportFilled(hasScrollbar)

    if (!hasScrollbar || appVideoList.value.length < PAGE_SIZE) {
      shouldContinue = true
    }
    else if (scrollLoadStartLength.value > 0) {
      const loadedCount = appVideoList.value.length - scrollLoadStartLength.value
      if (loadedCount < PAGE_SIZE) {
        shouldContinue = true
      }
      else {
        scrollLoadStartLength.value = 0
      }
    }

    if (
      shouldContinue
      && !hasActiveRecommendationFilter.value
      && isDocumentVisible()
      && appConsecutiveEmptyLoads.value < MAX_EMPTY_LOADS
    ) {
      // 设置递归加载锁，防止 VideoCardGrid 触发额外的 loadMore
      isRecursiveLoading.value = true
      try {
        await getAppRecommendVideos(version, requestType)
      }
      finally {
        isRecursiveLoading.value = false
      }
    }
    else if (!hasActiveRecommendationFilter.value && appConsecutiveEmptyLoads.value >= MAX_EMPTY_LOADS) {
      noMoreContent.value = true
    }
  }
}

// 从视口内第一张可播放的卡片开始，避免重复播放已经滑过的推荐
function getFirstVisibleImmersiveKey(): string | undefined {
  const playableKeys = new Set(immersiveItems.value.map(item => item.key))
  const viewportHeight = window.innerHeight
  const slots = Array.from(forYouRootRef.value?.querySelectorAll<HTMLElement>('.video-card-slot[data-index]') ?? [])
  const visibleIndexes = slots
    .filter((slot) => {
      const rect = slot.getBoundingClientRect()
      return rect.bottom > 0 && rect.top < viewportHeight
    })
    .map(slot => Number(slot.dataset.index))
    .filter(Number.isInteger)
  if (!visibleIndexes.length)
    return undefined

  const list = currentVideoList.value
  for (let index = Math.min(...visibleIndexes); index < list.length; index++) {
    const key = list[index]?.uniqueId
    if (key && playableKeys.has(key))
      return key
  }
  return undefined
}

function openImmersiveMode() {
  if (isImmersiveModeOpen.value)
    return
  immersiveInitialKey.value = getFirstVisibleImmersiveKey()
  isImmersiveModeOpen.value = true
  if (!hasInitializedData.value && !isLoading.value)
    void initData()
}

function closeImmersiveMode() {
  isImmersiveModeOpen.value = false
}

function handleImmersiveLoadMore() {
  // 沉浸式由用户逐条切换驱动，等同手动加载，不受过滤分页与可见性限制
  loadMore(true)
}

function handleImmersivePlay(key: string) {
  const element = currentVideoList.value.find(item => item.uniqueId === key)
  if (!element)
    return
  markWebRecommendationExposed(element)
  recordWebRecommendationClick(element)
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

// 修改 defineExpose，暴露重置方法和撤销方法
defineExpose({
  initData,
  openImmersiveMode,
  undoRefresh: () => {
    handleUndoRefresh.value?.()
  },
  goForward: () => {
    handleForwardRefresh.value?.()
  },
  canGoBack: () => {
    if (isWebRecommendationMode.value)
      return hasBackState.value && cachedVideoList.value.length > 0
    else if (settings.value.recommendationMode === 'app')
      return hasBackState.value && cachedAppVideoList.value.length > 0
    return false
  },
  canGoForward: () => {
    if (isWebRecommendationMode.value)
      return hasForwardState.value && forwardVideoList.value.length > 0
    else if (settings.value.recommendationMode === 'app')
      return hasForwardState.value && forwardAppVideoList.value.length > 0
    return false
  },
})
</script>

<template>
  <div ref="forYouRootRef">
    <VideoCardGrid
      v-if="!needToLoginFirst"
      :items="currentVideoList"
      :grid-layout="gridLayout"
      :loading="isLoading"
      :no-more-content="noMoreContent"
      :need-to-login-first="needToLoginFirst"
      :request-failed="requestFailed"
      :transform-item="(item: VideoElement | AppVideoElement) => item.displayData"
      :get-item-key="(item: VideoElement | AppVideoElement, index?: number) => `${item.uniqueId}-${index ?? 0}`"
      :video-type="isWebRecommendationMode ? 'rcmd' : 'appRcmd'"
      :card-exposure-handler="markWebRecommendationExposed"
      :card-click-observer="recordWebRecommendationClick"
      show-preview
      more-btn
      @refresh="initData"
      @login="jumpToLoginPage"
      @load-more="handleLoadMore"
    />

    <div
      v-if="requiresManualFilteredPaging && !isLoading && !noMoreContent"
      class="filtered-feed-load-more"
    >
      <Button type="secondary" @click="handleManualLoadMore">
        <template #left>
          <span i-tabler-arrow-down />
        </template>
        {{ $t('common.load_more') }}
      </Button>
    </div>

    <Empty
      v-if="needToLoginFirst"
      mt-6
      :description="$t(isWebRecommendationMode ? 'common.please_log_in_first' : 'home.app_authorization_required')"
    >
      <Button
        type="primary"
        @click="isWebRecommendationMode ? jumpToLoginPage() : showAppAuthorizationDialog = true"
      >
        {{ $t(isWebRecommendationMode ? 'common.login' : 'home.reauthorize_app') }}
      </Button>
    </Empty>

    <AppAuthorizationDialog
      v-if="showAppAuthorizationDialog"
      @close="showAppAuthorizationDialog = false"
    />

    <ImmersiveFeed
      v-if="isImmersiveModeOpen"
      :items="immersiveItems"
      :initial-key="immersiveInitialKey"
      :loading="isLoading"
      :no-more-content="noMoreContent"
      @close="closeImmersiveMode"
      @load-more="handleImmersiveLoadMore"
      @play="handleImmersivePlay"
    />
  </div>
</template>

<style lang="scss" scoped>
.filtered-feed-load-more {
  display: flex;
  justify-content: center;
  padding: var(--bew-space-6) 0 var(--bew-space-4);
}
</style>
