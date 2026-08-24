<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import AppAuthorizationDialog from '~/components/AppAuthorizationDialog.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { UndoForwardState, useBewlyApp } from '~/composables/useAppProvider'
import { FilterType, useFilter } from '~/composables/useFilter'
import { LanguageType } from '~/enums/appEnums'
import type { GridLayoutType } from '~/logic'
import { appAuthTokens, noCookieForYouRecommendationState, settings } from '~/logic'
import type { AppForYouResult, Item as AppVideoItem } from '~/models/video/appForYou'
import { Type as ThreePointV2Type } from '~/models/video/appForYou'
import type { forYouResult, Item as VideoItem } from '~/models/video/forYou'
import type { AppVideoElement, VideoCardDisplayData, VideoElement } from '~/stores/forYouStore'
import { useForYouStore } from '~/stores/forYouStore'
import api from '~/utils/api'
import { ensureFreshAppAccessToken, TVAppKey } from '~/utils/authProvider'
import { isBilibiliRiskControl } from '~/utils/bilibiliApiError'
import { decodeHtmlEntities } from '~/utils/htmlDecode'
import { getCookie } from '~/utils/main'
import { isVerticalVideo } from '~/utils/uriParse'

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
    ['mask', 'avatar', 'text'],
    ['mask', 'avatar', 'up_id'],
  ],
)

const { handleReachBottom, handlePageRefresh, haveScrollbar, undoForwardState, handleUndoRefresh, handleForwardRefresh, handleBackToTop, scrollViewportRef } = useBewlyApp()

// 先声明数据变量
const videoList = ref<VideoElement[]>([])
const appVideoList = ref<AppVideoElement[]>([])

const isWebRecommendationMode = computed(() => settings.value.recommendationMode !== 'app')
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

const isLoading = ref<boolean>(true)
const requestFailed = ref<boolean>(false)
const needToLoginFirst = ref<boolean>(false)
const refreshIdx = ref<number>(1)
const noMoreContent = ref<boolean>(false)
const activatedAppVideo = ref<AppVideoItem | null>()
const showDislikeDialog = ref<boolean>(false)
const showAppAuthorizationDialog = ref<boolean>(false)
const hasInitializedData = ref<boolean>(false)

const selectedDislikeReason = ref<number>(1)

// 修改缓存数据变量，添加前进状态变量
const cachedVideoList = ref<VideoElement[]>([])
const cachedRefreshIdx = ref<number>(1)

// 添加前进状态变量
const forwardVideoList = ref<VideoElement[]>([])
const forwardRefreshIdx = ref<number>(1)

// APP 模式的缓存和前进状态变量
const cachedAppVideoList = ref<AppVideoElement[]>([])
const forwardAppVideoList = ref<AppVideoElement[]>([])

// 添加状态标记
const hasBackState = ref<boolean>(false)
const hasForwardState = ref<boolean>(false)

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
const NO_COOKIE_RECOMMEND_STATE_MAX_SHOWLIST_GROUPS = 3
const WEB_LAST_CLICKLIST_MAX_ITEMS = 50
const MAX_EMPTY_LOADS = 5 // 最大连续空加载次数
const FILTERED_FEED_SAMPLE_SIZE = 100
const FILTERED_FEED_MIN_RETENTION_RATE = 0.6
const FILTERED_FEED_RISK_WARNING_MIN_KEPT = 50
const APP_LOAD_BATCHES = ref<number>(1) // APP模式每次加载的批次数，初始化时为1
const scrollLoadStartLength = ref<number>(0) // 滚动加载开始时的列表长度
const consecutiveEmptyLoads = ref<number>(0) // 连续空加载次数，用于防止无限递归（Web模式）
const appConsecutiveEmptyLoads = ref<number>(0) // APP模式连续空加载次数
// 递归加载锁，防止双重触发
const isRecursiveLoading = ref<boolean>(false)
const webRiskCooldownUntil = ref<number>(0)
let webRiskCooldownToastKey = 0
let webRiskCooldownLevel = 0
const webFetchRow = ref<number>(1)
const webFreshIdx1h = ref<number>(1)
let webFreshIdx1hTimestamp = Date.now()
const webRefreshBrush = ref<number>(0)
const webLoadMoreBrush = ref<number>(1)
let webRecommendationUniqId = createWebRecommendationUniqId()
const webShowlistGroups = ref<string[]>([])
const webLastClicklist = ref<string[]>([])

const cachedWebFetchRow = ref<number>(1)
const cachedWebFreshIdx1h = ref<number>(1)
const cachedWebRefreshBrush = ref<number>(0)
const cachedWebLoadMoreBrush = ref<number>(1)
const cachedWebShowlistGroups = ref<string[]>([])

const forwardWebFetchRow = ref<number>(1)
const forwardWebFreshIdx1h = ref<number>(1)
const forwardWebRefreshBrush = ref<number>(0)
const forwardWebLoadMoreBrush = ref<number>(1)
const forwardWebShowlistGroups = ref<string[]>([])

const filteredFeedCandidateCount = ref(0)
const filteredFeedKeptCount = ref(0)
const hasShownFilteredFeedRiskWarning = ref(false)
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
}

function recordFilteredFeedCandidate(kept: boolean) {
  if (!hasActiveRecommendationFilter.value)
    return

  filteredFeedCandidateCount.value++
  if (kept)
    filteredFeedKeptCount.value++

  if (
    settings.value.showRecommendationFilterRiskWarning
    && !hasShownFilteredFeedRiskWarning.value
    && filteredFeedCandidateCount.value === FILTERED_FEED_SAMPLE_SIZE
    && filteredFeedKeptCount.value < FILTERED_FEED_RISK_WARNING_MIN_KEPT
  ) {
    hasShownFilteredFeedRiskWarning.value = true
    toast.warning(t('home.recommendation_filter_risk_warning', {
      count: filteredFeedKeptCount.value,
    }))
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
let initialDataStarted = false

function scheduleInitTask(task: () => void, delay: number) {
  const timer = window.setTimeout(() => {
    initTimers.delete(timer)
    task()
  }, delay)
  initTimers.add(timer)
}

function clearInitTimers() {
  initTimers.forEach(timer => window.clearTimeout(timer))
  initTimers.clear()
}

onMounted(() => {
  const preservedModeHasItems = settings.value.recommendationMode === 'app'
    ? forYouStore.state.appVideoList.length > 0
    : forYouStore.state.videoList.length > 0

  // 如果启用状态保留且store中有数据，则恢复状态
  if (
    settings.value.preserveForYouState
    && forYouStore.state.isInitialized
    && forYouStore.state.recommendationMode === settings.value.recommendationMode
    && preservedModeHasItems
  ) {
    // 恢复关键状态
    const savedState = forYouStore.getCompleteState()
    videoList.value = [...savedState.videoList]
    appVideoList.value = [...savedState.appVideoList]
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

    // Store 只负责跨卸载恢复。数据已交还给当前组件后立即释放快照，
    // 避免 KeepAlive 中的活动列表与 Pinia 同时各持有一整份推荐数据。
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
        if (viewport)
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
    scheduleInitTask(() => {
      initialDataStarted = true
      initData()
    }, 200)
    initPageAction()
  }
})

onActivated(() => {
  initPageAction()
  if (!hasInitializedData.value && !initialDataStarted && initTimers.size === 0) {
    scheduleInitTask(() => {
      initialDataStarted = true
      initData()
    }, 200)
  }
})

onDeactivated(clearInitTimers)

onBeforeUnmount(() => {
  clearInitTimers()
  // 如果启用状态保留，保存当前状态到store
  if (settings.value.preserveForYouState) {
    // 获取当前滚动位置
    const scrollTop = scrollViewportRef.value?.scrollTop || 0

    const currentState = {
      videoList: [...videoList.value],
      appVideoList: [...appVideoList.value],
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

function transformAppVideo(item: AppVideoItem): VideoCardDisplayData {
  // 预先计算 followed 状态，避免多次 trim 和比较
  const bottomReason = item?.bottom_rcmd_reason?.trim()
  const followed = bottomReason === '已关注' || bottomReason === '已關注'

  // 预先计算 capsuleText，提取复杂逻辑
  const descPart = item?.desc?.split('·')?.[1]?.trim()
  const capsuleText = descPart || (followed ? bottomReason : undefined)

  // 预先计算 type，避免在模板中调用函数
  let type: 'horizontal' | 'vertical' | 'bangumi' = 'horizontal'
  if (item.card_goto === 'bangumi') {
    type = 'bangumi'
  }
  else if (item.uri && isVerticalVideo(item.uri)) {
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
      name: decodeHtmlEntities(item?.mask?.avatar?.text || ''),
      authorFace: item?.mask?.avatar?.cover || item?.avatar?.cover || '',
      followed,
      mid: item?.mask?.avatar?.up_id || 0,
    },
    capsuleText: decodeHtmlEntities(capsuleText),
    bvid: item.bvid || '',
    viewStr: item.cover_left_text_1,
    danmakuStr: item.cover_left_text_2,
    cid: item?.player_args?.cid,
    goto: item?.goto,
    param: item?.param,
    trackId: item?.track_id,
    url: item?.goto === 'bangumi' ? item.uri : '',
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

function getAppVideoKeys(item: AppVideoItem): string[] {
  const keys: string[] = []
  const bvid = item.bvid?.trim()
  if (bvid)
    keys.push(`bvid:${bvid}`)

  const aid = item.args?.aid
  if (aid && aid > 0)
    keys.push(`aid:${aid}`)
  return keys
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
  return new Promise(resolve => window.setTimeout(resolve, delayMs))
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

watch(() => settings.value.recommendationMode, () => {
  requestVersion++
  noMoreContent.value = false
  resetWebRiskRecoveryState()
  resetWebRecommendState()
  resetFilteredFeedPagingState()
  consecutiveEmptyLoads.value = 0 // 重置空加载计数器
  appConsecutiveEmptyLoads.value = 0 // 重置APP模式空加载计数器

  videoList.value = []
  appVideoList.value = []
  forwardVideoList.value = []
  cachedVideoList.value = []
  forwardAppVideoList.value = []
  cachedAppVideoList.value = []
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
  if (settings.value.recommendationMode === 'app')
    void initData()
})

async function initData() {
  requestVersion++
  // 当前组件即将持有最新列表，旧的跨卸载快照不再有保留价值。
  forYouStore.resetState()
  // 用户主动刷新必须重新获得一次完整请求机会；成功后才重置递增冷却等级。
  clearActiveWebRiskCooldown()
  hasInitializedData.value = false
  // 直接清空列表，骨架屏由 VideoCardGrid 自动处理
  videoList.value = []
  appVideoList.value = []
  noMoreContent.value = false

  APP_LOAD_BATCHES.value = 1 // 初始化时只加载1批
  resetFilteredFeedPagingState()
  consecutiveEmptyLoads.value = 0 // 重置空加载计数器
  appConsecutiveEmptyLoads.value = 0 // 重置APP模式空加载计数器
  requestFailed.value = false // 重置请求失败状态
  needToLoginFirst.value = false
  try {
    await getData('refresh')
  }
  finally {
    hasInitializedData.value = true
  }
}

async function getData(webRequestType: WebRecommendRequestType = 'refresh') {
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
        if (version !== requestVersion || settings.value.recommendationMode !== 'app')
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
    if (version === requestVersion) {
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
    if (version === requestVersion) {
      isLoading.value = false
      emit('afterLoading')
    }
  }
}

function loadMore(manual = false) {
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
  // VideoCardGrid owns infinite scrolling. Clear callbacks left by other kept-alive tabs.
  handleReachBottom.value = undefined

  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    // 根据当前模式保存数据
    if (isWebRecommendationMode.value) {
      // 总是保存刷新前的当前状态到后退缓存
      cachedVideoList.value = JSON.parse(JSON.stringify(videoList.value))
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
      cachedAppVideoList.value = JSON.parse(JSON.stringify(appVideoList.value))
      hasBackState.value = true

      // 清空前进状态（因为刷新会产生新的分支）
      forwardAppVideoList.value = []
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
        forwardVideoList.value = JSON.parse(JSON.stringify(videoList.value))
        forwardRefreshIdx.value = refreshIdx.value
        forwardWebFetchRow.value = webFetchRow.value
        forwardWebFreshIdx1h.value = webFreshIdx1h.value
        forwardWebRefreshBrush.value = webRefreshBrush.value
        forwardWebLoadMoreBrush.value = webLoadMoreBrush.value
        forwardWebShowlistGroups.value = [...webShowlistGroups.value]
        hasForwardState.value = true

        // 恢复缓存的数据
        videoList.value = JSON.parse(JSON.stringify(cachedVideoList.value))
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
        forwardAppVideoList.value = JSON.parse(JSON.stringify(appVideoList.value))
        hasForwardState.value = true

        // 恢复缓存的数据
        appVideoList.value = JSON.parse(JSON.stringify(cachedAppVideoList.value))

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
        cachedVideoList.value = JSON.parse(JSON.stringify(videoList.value))
        cachedRefreshIdx.value = refreshIdx.value
        cachedWebFetchRow.value = webFetchRow.value
        cachedWebFreshIdx1h.value = webFreshIdx1h.value
        cachedWebRefreshBrush.value = webRefreshBrush.value
        cachedWebLoadMoreBrush.value = webLoadMoreBrush.value
        cachedWebShowlistGroups.value = [...webShowlistGroups.value]
        hasBackState.value = true

        // 恢复前进状态的数据
        videoList.value = JSON.parse(JSON.stringify(forwardVideoList.value))
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
        cachedAppVideoList.value = JSON.parse(JSON.stringify(appVideoList.value))
        hasBackState.value = true

        // 恢复前进状态的数据
        appVideoList.value = JSON.parse(JSON.stringify(forwardAppVideoList.value))

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

        if (version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
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
      }

      if (successfulIdentity)
        break
    }

    if (version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
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
        if (activeWebFilter)
          recordFilteredFeedCandidate(passesSettingsFilter)

        const itemKey = getWebVideoKey(item)
        if (existingIds.has(itemKey))
          return

        existingIds.add(itemKey)
        if (!passesSettingsFilter)
          return

        resData.push(item)
      })

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
    if (canFillViewport && version === requestVersion && recommendationMode === settings.value.recommendationMode) {
      const filledItems = videoList.value.filter(video => video.item)
      videoList.value = filledItems

      if (!needToLoginFirst.value && !noMoreContent.value) {
        await nextTick()

        const hasScrollbar = await haveScrollbar()
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

async function getAppRecommendVideos(
  version = requestVersion,
  requestType: WebRecommendRequestType = 'refresh',
) {
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

  if (version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
    return

  const batchesToLoad = APP_LOAD_BATCHES.value
  const beforeLoadCount = appVideoList.value.length
  const seenCandidateIds = new Set(
    appVideoList.value
      .flatMap(video => video.item ? getAppVideoKeys(video.item) : []),
  )

  // 加载多个批次
  for (let batch = 0; batch < batchesToLoad; batch++) {
    try {
      // 获取最后一个视频的idx用于请求下一批
      const lastIdx = appVideoList.value.length > 0 && appVideoList.value[appVideoList.value.length - 1].item
        ? appVideoList.value[appVideoList.value.length - 1].item!.idx
        : 1
      const retryDeadline = Date.now() + APP_REQUEST_RETRY_WINDOW_MS
      let requestLog: RecommendRequestLogContext | undefined
      let response: AppForYouResult | undefined

      for (let attempt = 1; attempt <= APP_REQUEST_MAX_ATTEMPTS; attempt++) {
        requestLog = createRecommendRequestLogContext(recommendationMode, requestType)
        try {
          response = await api.video.getAppRecommendVideos({
            access_key: appAuthTokens.value.accessToken,
            s_locale: settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese ? 'zh-Hant_TW' : 'zh-Hans_CN',
            c_locate: settings.value.language === LanguageType.Mandarin_TW || settings.value.language === LanguageType.Cantonese ? 'zh-Hant_TW' : 'zh-Hans_CN',
            appkey: TVAppKey.appkey,
            idx: lastIdx,
          })
        }
        catch (error) {
          logRecommendRequestFailure(requestLog, { error, attempt })
          response = undefined
        }

        if (version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
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
      }

      if (version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
        return

      if (!response || !requestLog)
        throw new Error('App 推荐接口连续请求失败')

      if (response.code === 0 && (!response.data || !Array.isArray(response.data.items) || response.data.items.length === 0))
        throw new Error('App 推荐接口连续返回空数据')

      if (response.code === 0) {
        const activeAppFilter = hasActiveAppRecommendationFilter.value ? appFilterFunc.value : null

        response.data.items.forEach((item: AppVideoItem) => {
          // Remove banner & ad cards
          if (item.card_type.includes('banner') || item.card_type === 'cm_v1')
            return

          // 过滤掉没有有效 ID 的视频（既没有 aid 也没有 bvid）
          const hasValidId = (item.args?.aid && item.args.aid > 0) || (item.bvid && item.bvid.trim() !== '')
          if (!hasValidId)
            return

          const passesSettingsFilter = !activeAppFilter || activeAppFilter(item)
          if (activeAppFilter)
            recordFilteredFeedCandidate(passesSettingsFilter)

          if (activeAppFilter) {
            const videoKeys = getAppVideoKeys(item)
            if (!videoKeys.length || videoKeys.some(key => seenCandidateIds.has(key)))
              return

            videoKeys.forEach(key => seenCandidateIds.add(key))
            if (!passesSettingsFilter)
              return
          }
          else {
            // Keep the unfiltered recommendation path's existing duplicate semantics.
            const isDuplicate = appVideoList.value.some(video =>
              video.item && (video.item.args?.aid === item.args?.aid || video.item.bvid === item.bvid),
            )
            if (isDuplicate)
              return
          }

          const videoId = item.args?.aid || item.bvid
          appVideoList.value.push({
            uniqueId: `${videoId || item.idx}`,
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
      if (version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
        return

      requestFailed.value = true
      throw error
    }
  }

  // 检查是否成功添加了新内容
  if (version !== requestVersion || recommendationMode !== settings.value.recommendationMode)
    return

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

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

// 修改 defineExpose，暴露重置方法和撤销方法
defineExpose({
  initData,
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
  <div>
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
  </div>
</template>

<style lang="scss" scoped>
.filtered-feed-load-more {
  display: flex;
  justify-content: center;
  padding: var(--bew-space-6) 0 var(--bew-space-4);
}
</style>
