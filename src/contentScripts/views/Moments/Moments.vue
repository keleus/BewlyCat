<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Dialog from '~/components/Dialog.vue'
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import MomentCard from '~/components/MomentCard/MomentCard.vue'
import type { DisplayForwardVideo, DisplayMoment, DisplayRichTextSegment, WatchLaterTarget } from '~/components/MomentCard/types'
import type { MomentLinkKind } from '~/components/MomentCard/utils'
import {
  classifyMomentLink,
  computeMultiImageGalleryHeight,
  formatCount,
  getCardPreviewText,
  getMomentOriginalImageUrl,
  getMomentThumbnailUrl,
  getWatchLaterStateKey,
  isCompactPlainTextMoment,
  isUsableImageRatio,
  LANDSCAPE_SINGLE_IMAGE_MAX_WIDTH,
  shouldUseMomentImageGallery,
} from '~/components/MomentCard/utils'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import type { StorageEventFilter } from '~/composables/useStorageLocal'
import { useStorageLocal } from '~/composables/useStorageLocal'
import { DRAWER_VIDEO_ENTER_PAGE_FULL, DRAWER_VIDEO_EXIT_PAGE_FULL } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { momentsPinnedUsers, momentsWantedUsers } from '~/logic/storage'
import { recordUploaderLatestVideoTimes } from '~/logic/uploaderLatestVideoTimes'
import type { DataItem, MomentResult } from '~/models/moment/moment'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { numFormatter } from '~/utils/dataFormatter'
import { getCSRF } from '~/utils/main'
import { resolvePgcEpisodeVideoIds } from '~/utils/pgcEpisode'
import { openLinkInBackground } from '~/utils/tabs'
import { recordVideoVisit } from '~/utils/videoVisitHistory'

import MomentsHotSearch from './MomentsHotSearch.vue'

const loadingGifUrl = browser.runtime.getURL('/assets/loading.gif')
const { isLayoutEditing } = useLayoutEditMode()

interface MomentsPortalUser {
  mid: string
  name: string
  face: string
  following: string
  follower: string
  dyns: string
  vip?: {
    status?: number
    nickname_color?: string
    label?: {
      text?: string
    }
  }
  level_info?: {
    current_level?: number
  }
}

interface MomentsPortalLiveUser {
  mid: string
  room_id: string
  jump_url: string
  face: string
  uname: string
  title: string
}

interface MomentsPortalUpItem {
  face: string
  has_update: boolean
  is_reserve_recall?: boolean
  mid: string
  uname: string
}

interface MomentsPortalUpListItem {
  face?: string
  has_update?: boolean
  is_reserve_recall?: boolean
  mid?: string | number
  uname?: string
}

interface MomentsPortalUpList {
  has_more?: boolean
  items?: MomentsPortalUpListItem[]
}

interface MomentsPortalResult {
  code: number
  data?: {
    my_info?: MomentsPortalUser
    live_users?: {
      count?: number
      items?: MomentsPortalLiveUser[]
    }
    /** 真实接口为 { has_more, items }；兼容历史数组形态 */
    up_list?: MomentsPortalUpList | MomentsPortalUpListItem[]
  }
}

/** 动态流 features：补齐 opus 图文与充电列表字段 */
const MOMENT_FEED_FEATURES = 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard'
const toast = useToast()
const { t } = useI18n()
const topBarStore = useTopBarStore()

const moments = ref<DisplayMoment[]>([])
type MomentFilter = 'all' | 'video' | 'pgc' | 'article'
const momentFilters = computed<Array<{ value: MomentFilter, label: string }>>(() => [
  { value: 'all', label: t('moments.filter_all') },
  { value: 'video', label: t('moments.filter_video') },
  { value: 'pgc', label: t('moments.filter_pgc') },
  { value: 'article', label: t('moments.filter_article') },
])
const activeMomentFilter = ref<MomentFilter>('all')
interface MomentsFeedCacheEntry {
  items: DisplayMoment[]
  offset: string
  updateBaseline: string
  hasMore: boolean
  updatedAt: number
  continuation?: {
    items: DisplayMoment[]
    offset: string
    updateBaseline: string
    hasMore: boolean
  }
}
type MomentsFeedCache = Partial<Record<MomentFilter, MomentsFeedCacheEntry>>
let resolveMomentsFeedCacheReady: (() => void) | undefined
const momentsFeedCacheReady = new Promise<void>((resolve) => {
  resolveMomentsFeedCacheReady = resolve
})
let momentsCacheWriteTimer: number | undefined
let pendingMomentsCacheWrite: (() => void | Promise<void>) | undefined
const debounceMomentsCacheWrite: StorageEventFilter = (invoke) => {
  pendingMomentsCacheWrite = invoke
  if (momentsCacheWriteTimer !== undefined)
    window.clearTimeout(momentsCacheWriteTimer)
  momentsCacheWriteTimer = window.setTimeout(() => {
    momentsCacheWriteTimer = undefined
    const pendingWrite = pendingMomentsCacheWrite
    pendingMomentsCacheWrite = undefined
    void pendingWrite?.()
  }, 500)
}

function flushMomentsCacheWrite() {
  if (momentsCacheWriteTimer !== undefined)
    window.clearTimeout(momentsCacheWriteTimer)
  momentsCacheWriteTimer = undefined
  const pendingWrite = pendingMomentsCacheWrite
  pendingMomentsCacheWrite = undefined
  void pendingWrite?.()
}

const momentsFeedCache = useStorageLocal<MomentsFeedCache>('momentsFeedCache', {}, {
  deep: false,
  eventFilter: debounceMomentsCacheWrite,
  shallow: true,
  writeDefaults: false,
  onReady: () => resolveMomentsFeedCacheReady?.(),
})
type MomentGroup = 'all' | 'wanted'
const activeMomentGroup = ref<MomentGroup>('all')
const wantedCacheCursor = ref(0)
const portalUser = ref<MomentsPortalUser | null>(null)
const portalLiveUsers = ref<MomentsPortalLiveUser[]>([])
const portalLiveCount = ref(0)
const portalUpList = ref<MomentsPortalUpItem[]>([])
/** 选中的经常访问 UP 主 mid；空字符串表示“全部动态” */
const selectedHostMid = ref('')
const isPortalLoading = ref(true)
const upListScrollerRef = ref<HTMLElement | null>(null)
const canScrollUpListLeft = ref(false)
const canScrollUpListRight = ref(false)
let upListResizeObserver: ResizeObserver | undefined
const showMomentsSidebar = ref(true)
const showMomentsRightbar = ref(true)
const pinnedListExpanded = ref(false)
let pinnedListCollapseTimer = 0
const UP_LIST_ITEM_WIDTH = 64
const UP_LIST_ITEM_GAP = 4
const PINNED_DIVIDER_SPACE = 10
const momentColumns = ref<DisplayMoment[][]>([])
const selectedMoment = ref<DisplayMoment | null>(null)
const detailFrameUrl = ref('')
const detailFrameLoaded = ref(false)
const detailIframeRef = ref<HTMLIFrameElement | null>(null)
const detailPlayerImmersive = ref(false)
const detailImageViewerRef = ref<HTMLElement | null>(null)
const detailImageViewerOpen = ref(false)
const detailImageViewerUrls = ref<string[]>([])
const detailImageViewerIndex = ref(0)
const detailImageViewerScale = ref(1)
const detailImageViewerRotation = ref(0)
const detailImageViewerPanX = ref(0)
const detailImageViewerPanY = ref(0)
const detailImageViewerSource = shallowRef<Window | null>(null)
let detailImageViewerTrigger: HTMLElement | null = null
let detailLoadTimer: ReturnType<typeof setTimeout> | null = null
let detailFocusRetryTimer: ReturnType<typeof setTimeout> | null = null
const layoutRef = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)
/** 与 .moments-grid__column 的 gap 及 CSS 变量联动，虚拟滚动测量按此计算。 */
const GRID_GAP = 20
/** 与 .moments-layout 的 column-gap(--bew-space-6) 一致。 */
const LAYOUT_GAP = 24
const CARD_MAX_WIDTH_BY_COLUMNS = {
  1: 720,
  2: 610,
} as const
const CARD_MIN_WIDTH = 360
const CARD_COMPACT_MIN_WIDTH = 260
const SIDEBAR_WIDTH = 248
const gridColumnCount = ref(1)
const gridCardWidth = ref<number>(CARD_MAX_WIDTH_BY_COLUMNS[1])
let rebalanceTimer: ReturnType<typeof setTimeout> | null = null
const hoveredMediaId = ref('')
const previewUrls = reactive<Record<string, string>>({})
const likingMomentIds = reactive(new Set<string>())
const reservationLoadingMomentIds = reactive(new Set<string>())
const watchLaterMomentIds = reactive(new Set<string>())
const watchLaterLoadingMomentIds = reactive(new Set<string>())
const videoCidCache = new Map<string, number>()
const videoCidRequests = new Map<string, Promise<number | undefined>>()
const videoAspectRatios = reactive<Record<string, number>>({})
const videoAspectRatioRequests = new Map<string, Promise<number | undefined>>()
const cardHeights = reactive<Record<string, number>>({})
const visibleMomentIds = reactive(new Set<string>())
const readyCoverIds = reactive(new Set<string>())
const readyCardIds = reactive(new Set<string>())
const enteringCardIds = reactive(new Set<string>())
const revealedCardIds = new Set<string>()
const cardEnterTimers = new Map<string, ReturnType<typeof setTimeout>>()
const cardElements = new Map<string, HTMLElement>()
interface VirtualColumn {
  topPad: number
  bottomPad: number
  items: DisplayMoment[]
}
const virtualColumns = ref<VirtualColumn[]>([])
/** 单图宽高比（宽/高），用于图文卡片比例和详情视频的封面比例兜底 */
const coverRatios = reactive<Record<string, number>>({})

function getSafeImageRatio(width: number, height: number) {
  const ratio = width / height
  return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined
}
let gridObserver: ResizeObserver | undefined
let liveFlvPlayer: any = null
let liveHlsPlayer: any = null
const isLoading = ref(false)
const isInitialLoading = ref(true)
const noMoreContent = ref(false)
const offset = ref('')
const updateBaseline = ref('')
/** 按 UP 主筛选时 feed/all 的 page，从 1 递增 */
const momentsFeedPage = ref(1)
const { handlePageRefresh, handleReachBottom, mainAppRef, scrollViewportRef } = useBewlyApp()

function resetMomentsScroll() {
  if (scrollViewportRef.value)
    scrollViewportRef.value.scrollTop = 0
}

const OVERSCAN_PX = 1200
const MAX_PREVIEW_CACHE = 12
const MAX_VIDEO_CID_CACHE = 80
/** 首屏最多再补 1 页把视口填满；之后只随滚动请求 */
const MAX_POST_LOAD_AUTOFILL_PAGES = 1
const WANTED_SCAN_LIMIT = 100
/** 开启类型过滤时单次最多请求的原始动态页数 */
const FILTERED_MAX_REQUEST_PAGES = 2
const MOMENTS_CACHE_MAX_ITEMS = 1000
const MOMENTS_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000
/** 虚拟瀑布流需要在全局哨兵进入视口前主动预取，避免高度修正后漏掉相交事件 */
const LOAD_MORE_AHEAD_PX = 640
const DETAIL_DIALOG_MIN_WIDTH = 860
let scrollListenerAttached = false
let cardMeasureObserver: ResizeObserver | undefined
let visibilityObserver: IntersectionObserver | undefined
/** 最近滚动时间，用于避免滚动中重排导致抖动 */
let lastScrollAt = 0
/** 重置后尚未滚动时不自动连刷，避免首屏连打多页才出内容 */
let hasFeedScrollSinceReset = false
let virtualRaf = 0
let feedRequestToken = 0
let portalRequestToken = 0
let suppressBottomRebalanceUntil = 0
const detailImageViewerDragging = ref(false)
let detailImageViewerDragStartX = 0
let detailImageViewerDragStartY = 0
let detailImageViewerDragOriginX = 0
let detailImageViewerDragOriginY = 0
/** 高度已稳定的卡片，避免反复 Resize 微抖动 */
const settledHeights = new Set<string>()

const wantedUserMids = computed(() => new Set(momentsWantedUsers.value.map(user => user.mid)))
const pinnedUserMids = computed(() => new Set(momentsPinnedUsers.value.map(user => user.mid)))
const visiblePortalUpList = computed(() =>
  portalUpList.value.filter(up => !pinnedUserMids.value.has(up.mid)),
)
const showMomentsUpList = computed(() =>
  settings.value.momentsShowUpList
  && (
    isPortalLoading.value
    || portalUpList.value.length > 0
    || momentsPinnedUsers.value.length > 0
    || settings.value.momentsEnableWantedFilter
  ),
)

const pinnedListCount = computed(() => Math.max(1, momentsPinnedUsers.value.length))
const pinnedCollapsedWidth = computed(() => PINNED_DIVIDER_SPACE + UP_LIST_ITEM_WIDTH)
const pinnedExpandedWidth = computed(() => {
  if (!momentsPinnedUsers.value.length)
    return PINNED_DIVIDER_SPACE + 80
  return PINNED_DIVIDER_SPACE
    + pinnedListCount.value * UP_LIST_ITEM_WIDTH
    + Math.max(0, pinnedListCount.value - 1) * UP_LIST_ITEM_GAP
})
const isPinnedListExpanded = computed(() =>
  isLayoutEditing.value
  || pinnedListExpanded.value
  || momentsPinnedUsers.value.length <= 1,
)

function expandPinnedList() {
  if (pinnedListCollapseTimer) {
    clearTimeout(pinnedListCollapseTimer)
    pinnedListCollapseTimer = 0
  }
  pinnedListExpanded.value = true
}

function collapsePinnedList() {
  if (pinnedListCollapseTimer)
    clearTimeout(pinnedListCollapseTimer)
  pinnedListCollapseTimer = window.setTimeout(() => {
    pinnedListExpanded.value = false
    pinnedListCollapseTimer = 0
  }, 120)
}

function handlePinnedListFocusOut(event: FocusEvent) {
  const next = event.relatedTarget
  if (next instanceof Node && (event.currentTarget as Node | null)?.contains(next))
    return
  collapsePinnedList()
}

onBeforeUnmount(() => {
  if (pinnedListCollapseTimer)
    clearTimeout(pinnedListCollapseTimer)
  flushMomentsCacheWrite()
})

function httpsUrl(url = '') {
  return url.replace(/^http:/, 'https:')
}

function getDetailImageUrlKey(url: string) {
  const path = httpsUrl(url.trim())
    .replace(/@[^/?#]*(?=[?#]|$)/, '')
    .split(/[?#]/, 1)[0]
  const isGif = /\.gif$/i.test(path)
  return `${path.replace(/\.(?:avif|webp|gif|jpe?g|png)$/i, '').toLowerCase()}|${isGif ? 'gif' : 'static'}`
}

function isOriginalDetailImageUrl(url: string) {
  return /\.(?:gif|jpe?g|png)$/i.test(url.split(/[?#]/, 1)[0])
}

function normalizeDetailImageViewerPayload(value: unknown, requestedIndex: unknown) {
  const urls: string[] = []
  const urlIndexes = new Map<string, number>()
  const sourceIndexes: number[] = []
  if (Array.isArray(value)) {
    value.forEach((rawUrl, sourceIndex) => {
      if (typeof rawUrl !== 'string' || !rawUrl.trim())
        return
      const url = httpsUrl(rawUrl.trim())
      const key = getDetailImageUrlKey(url)
      const existingIndex = urlIndexes.get(key)
      if (existingIndex !== undefined) {
        sourceIndexes[sourceIndex] = existingIndex
        if (isOriginalDetailImageUrl(url) && !isOriginalDetailImageUrl(urls[existingIndex]))
          urls[existingIndex] = url
        return
      }
      urlIndexes.set(key, urls.length)
      sourceIndexes[sourceIndex] = urls.length
      urls.push(url)
    })
  }

  const limitedUrls = urls.slice(0, 100)
  const sourceIndex = Number(requestedIndex)
  const mappedIndex = Number.isInteger(sourceIndex) ? sourceIndexes[sourceIndex] : undefined
  return {
    index: mappedIndex === undefined
      ? Math.min(limitedUrls.length - 1, Math.max(0, Number(requestedIndex) || 0))
      : Math.min(limitedUrls.length - 1, mappedIndex),
    urls: limitedUrls,
  }
}

function normalizeRichTextJumpUrl(url = '') {
  if (!url)
    return ''

  try {
    const normalized = new URL(url.startsWith('//') ? `https:${url}` : url, 'https://www.bilibili.com')
    return normalized.protocol === 'http:' || normalized.protocol === 'https:'
      ? httpsUrl(normalized.toString())
      : ''
  }
  catch {
    return ''
  }
}

function getSidebarAvatarUrl(url = '', size = 96) {
  const normalized = httpsUrl(url).replace(/@[^/]*$/, '')
  if (!normalized || !/hdslb\.com|biliimg\.com|bilibili\.com/.test(normalized))
    return normalized
  return `${normalized}@${size}w_${size}h_1c.webp`
}

function extractPortalUpListItems(
  upList: MomentsPortalUpList | MomentsPortalUpListItem[] | undefined,
): MomentsPortalUpListItem[] {
  if (!upList)
    return []
  if (Array.isArray(upList))
    return upList
  if (Array.isArray(upList.items))
    return upList.items
  return []
}

function normalizePortalUpList(list: MomentsPortalResult['data'] | undefined): MomentsPortalUpItem[] {
  const rawList = extractPortalUpListItems(list?.up_list)

  return rawList.reduce<MomentsPortalUpItem[]>((items, item) => {
    if (!item || item.mid == null || item.mid === '')
      return items

    const uname = String(item.uname || '').trim()
    if (!uname)
      return items

    items.push({
      face: String(item.face || ''),
      has_update: Boolean(item.has_update),
      is_reserve_recall: Boolean(item.is_reserve_recall),
      mid: String(item.mid),
      uname,
    })
    return items
  }, [])
}

function parseLiveInfo(content?: string) {
  if (!content)
    return null

  try {
    return JSON.parse(content).live_play_info || null
  }
  catch {
    return null
  }
}

function extractImageUrl(image: any) {
  return extractImageMeta(image).url
}

function normalizeImageIdentity(url = '') {
  return httpsUrl(url).replace(/@[^/?#]*/, '').replace(/[?#].*$/, '')
}

function extractImageMeta(image: any): { url: string, width?: number, height?: number } {
  if (!image)
    return { url: '' }
  if (typeof image === 'string')
    return { url: image }

  const width = Number(image.width || image.img_width)
  const height = Number(image.height || image.img_height)
  return {
    url: image.src || image.url || image.img_src || image.live_cover || '',
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    height: Number.isFinite(height) && height > 0 ? height : undefined,
  }
}

function collectContentImages(
  drawItems: any[],
  opus: any,
  articleCovers: any[],
  cover = '',
) {
  const sources = [
    ...drawItems,
    ...(opus?.pics || opus?.images || []),
    ...articleCovers,
  ].map(extractImageMeta).filter(item => item.url)

  const seen = new Set<string>()
  const unique: { url: string, width?: number, height?: number }[] = []
  for (const item of sources) {
    const key = normalizeImageIdentity(item.url)
    if (!key || seen.has(key))
      continue
    seen.add(key)
    unique.push(item)
  }

  if (!unique.length && cover)
    unique.push({ url: cover })

  return unique
}

function pickText(...values: any[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim())
      return value.trim()
    if (value && typeof value === 'object') {
      const nested = value.text || value.summary || value.content
      if (typeof nested === 'string' && nested.trim())
        return nested.trim()
    }
  }
  return ''
}

function normalizeDescText(desc: any) {
  if (!desc)
    return ''
  if (typeof desc === 'string')
    return desc.trim()
  return pickText(desc.text, desc)
}

function extractRichTextSegments(...nodeLists: any[]): DisplayRichTextSegment[] {
  const nodes = nodeLists.find(value => Array.isArray(value) && value.length)
  if (!nodes)
    return []

  return nodes.flatMap((node: any) => {
    const text = typeof node?.text === 'string'
      ? node.text
      : typeof node?.orig_text === 'string'
        ? node.orig_text
        : ''
    const emoji = node?.emoji
    const imageUrl = httpsUrl(emoji?.webp_url || emoji?.gif_url || emoji?.icon_url || '')
    if (node?.type === 'RICH_TEXT_NODE_TYPE_EMOJI' && imageUrl) {
      return [{
        type: 'emoji' as const,
        text: text || emoji?.text || t('moments.emoji'),
        imageUrl,
        size: Number(emoji?.size || 1),
      }]
    }

    const isAtMention = node?.type === 'RICH_TEXT_NODE_TYPE_AT'
    // VOTE：投票节点，jump_url 指向官方投票页
    const isSupportedLink = node?.type === 'RICH_TEXT_NODE_TYPE_TOPIC'
      || node?.type === 'RICH_TEXT_NODE_TYPE_WEB'
      || node?.type === 'RICH_TEXT_NODE_TYPE_VOTE'
      || isAtMention
    const rawJumpUrl = node?.jump_url
      || (isAtMention && node?.rid ? `https://space.bilibili.com/${node.rid}` : '')
    const url = isSupportedLink ? normalizeRichTextJumpUrl(rawJumpUrl) : ''
    if (text && url)
      return [{ type: 'link' as const, text, url }]

    return text ? [{ type: 'text' as const, text }] : []
  })
}

function extractOpusImages(opus: any) {
  const pics = opus?.pics || opus?.images || []
  return pics.map(extractImageUrl).filter(Boolean)
}

function extractBlockedInfo(blocked: any) {
  if (!blocked || typeof blocked !== 'object')
    return null
  const hint = pickText(blocked.hint_message, blocked.title, blocked.desc)
  const button = blocked.button || {}
  return {
    hint,
    cover: httpsUrl(blocked.bg_img?.img_day || blocked.bg_img?.img_dark || blocked.icon?.img_day || blocked.icon?.img_dark || ''),
    buttonText: pickText(button.text, t('moments.charged_unlock')),
    buttonUrl: button.jump_url || '',
  }
}

function getAdditionalActionText(button: any, isReservation = false) {
  if (!button || typeof button !== 'object')
    return t('moments.view')

  // 预约按钮：status 1 为未预约，2 为已预约。仅预约附加卡按此解读 type，
  // 否则投票等 type=1 的普通跳转按钮会被误判成「预约」。
  if (isReservation && (Number(button.type) === 1 || Number(button.type) === 2)) {
    return Number(button.status) === 2
      ? pickText(button.check?.text, t('moments.reserved'))
      : pickText(button.uncheck?.text, t('moments.reserve'))
  }

  return pickText(button.jump_style?.text, button.text, t('moments.view'))
}

function getMomentContent(item: any) {
  const dynamic = item.modules?.module_dynamic || {}
  const major = dynamic.major || {}
  const author = item.modules?.module_author || {}
  const basic = item.basic || {}
  const iconBadge = author.icon_badge || {}
  const isChargeExclusive = Boolean(
    basic.is_only_fans
    || iconBadge.text === '充电专属'
    || major?.type === 'MAJOR_TYPE_BLOCKED'
    || major?.blocked
    || major?.upower_common,
  )

  const drawItems = major.draw?.items || []
  const opusImages = extractOpusImages(major.opus)
  const articleCovers = major.article?.covers || []
  const imageMetas = collectContentImages(drawItems, major.opus, articleCovers)

  const live = parseLiveInfo(major.live_rcmd?.content) || major.live || null
  // ugc_season：合集订阅更新，字段形态接近 archive（bvid/aid/cover/jump_url）
  const ugcSeason = major.ugc_season || null
  const cover = live?.cover
    || major.archive?.cover
    || ugcSeason?.cover
    || major.pgc?.cover
    || major.opus?.cover
    || major.common?.cover
    || major.music?.cover
    || major.upower_common?.cover
  const archive = major.archive || ugcSeason || major.pgc || {}
  const opus = major.opus || {}
  const article = major.article || {}
  const common = major.common || major.upower_common || {}
  const blocked = extractBlockedInfo(major.blocked)
  const additional = dynamic.additional || {}
  const additionalCard = additional.common
    || additional.vote
    || additional.reserve
    || additional.ugc
    || additional.goods
    || additional.match
    || additional.upower_lottery
    || {}
  const liveArea = pickText(live?.area_name, live?.desc_first)
  const livePopularity = live?.online
    ? t('moments.popularity', { count: formatCount(Number(live.online)) })
    : pickText(live?.desc_second)

  const chargeBadge = pickText(iconBadge.text, isChargeExclusive ? t('moments.charging_exclusive') : '')
  const chargeCover = httpsUrl(iconBadge.render_img || iconBadge.icon || blocked?.cover || '')
  const chargeHint = pickText(
    blocked?.hint,
    isChargeExclusive ? t('moments.charging_unlock_hint') : '',
  )

  // 图文/纯文字（itemOpusStyle）正文：major.opus.summary.text
  // 旧结构可能在 module_dynamic.desc.text；视频/专栏等再回落到各自 desc
  let text = pickText(
    opus.summary?.text,
    typeof opus.summary === 'string' ? opus.summary : '',
    normalizeDescText(dynamic.desc),
    archive.desc,
    article.desc,
    common.desc,
  )
  const richText = extractRichTextSegments(
    opus.summary?.rich_text_nodes,
    dynamic.desc?.rich_text_nodes,
  )

  // 充电未解锁：列表往往无 desc/major，用提示文案顶上
  if (!text && isChargeExclusive)
    text = chargeHint || t('moments.charging_exclusive_post')

  const isVoteAdditional = additional.type === 'ADDITIONAL_TYPE_VOTE'
  let additionalView = additional.type
    ? {
        title: pickText(additionalCard.head_text, additionalCard.title, additionalCard.desc?.text),
        desc: pickText(
          typeof additionalCard.desc1 === 'string' ? additionalCard.desc1 : additionalCard.desc1?.text,
          typeof additionalCard.desc2 === 'string' ? additionalCard.desc2 : additionalCard.desc2?.text,
          additionalCard.desc,
        ),
        cover: httpsUrl(additionalCard.cover || additionalCard.icon || ''),
        action: getAdditionalActionText(
          additionalCard.button,
          additional.type === 'ADDITIONAL_TYPE_RESERVE',
        ),
        url: httpsUrl(additionalCard.jump_url || additionalCard.button?.jump_url || ''),
        isUpRecommendation: additional.type === 'ADDITIONAL_TYPE_UP_RCMD'
          || pickText(additionalCard.head_text, additionalCard.title) === 'UP主的推荐',
        isVideoReservation: additional.type === 'ADDITIONAL_TYPE_RESERVE'
          && Number(additionalCard.button?.type) === 1,
        isLiveReservation: additional.type === 'ADDITIONAL_TYPE_RESERVE'
          && Number(additionalCard.button?.type) === 2,
        isVote: isVoteAdditional,
        voteEndTime: isVoteAdditional ? Number(additionalCard.end_time) || 0 : 0,
        reservationId: additional.type === 'ADDITIONAL_TYPE_RESERVE'
          ? String(additionalCard.rid || '')
          : '',
        reservationTotal: Number(additionalCard.reserve_total || 0),
        isReserved: additional.type === 'ADDITIONAL_TYPE_RESERVE'
          && Number(additionalCard.button?.status) === 2,
      }
    : undefined

  // 投票：desc 补充参与状态（接口 desc 通常为「N人参与」）
  if (isVoteAdditional && additionalView) {
    const voteEnded = additionalView.voteEndTime! > 0
      && Date.now() / 1000 > additionalView.voteEndTime!
    additionalView.desc = [additionalView.desc, voteEnded ? t('moments.vote_ended') : t('moments.vote_ongoing')]
      .filter(Boolean)
      .join(' · ')
  }

  // 未解锁充电：构造充电卡片附加区（列表没有 additional 时）
  if (!additionalView && isChargeExclusive && (blocked?.buttonUrl || chargeBadge)) {
    additionalView = {
      title: chargeBadge || t('moments.charging_exclusive'),
      desc: chargeHint,
      // 充电档位区不展示小图标
      cover: '',
      action: blocked?.buttonText || t('moments.go_charge'),
      url: blocked?.buttonUrl || '',
      isUpRecommendation: false,
      isVideoReservation: false,
      isLiveReservation: false,
      isVote: false,
      voteEndTime: 0,
      reservationId: '',
      reservationTotal: 0,
      isReserved: false,
    }
  }

  const isUgcSeason = item.type === 'DYNAMIC_TYPE_UGC_SEASON'
    || major?.type === 'MAJOR_TYPE_UGC_SEASON'
    || Boolean(ugcSeason)
  const isPgc = item.type === 'DYNAMIC_TYPE_PGC_UNION' || Boolean(major.pgc)
  const isRegularVideo = !isUgcSeason && (
    item.type === 'DYNAMIC_TYPE_AV'
    || Boolean(major.archive)
    || isPgc
  )
  // 图文：DRAW / 带图 opus，不含视频、合集、直播与专栏
  const isArticleMajor = item.type === 'DYNAMIC_TYPE_ARTICLE'
    || major?.type === 'MAJOR_TYPE_ARTICLE'
    || Number(basic?.comment_type) === 12
  const isDraw = !isRegularVideo && !isUgcSeason && !live && !isArticleMajor && (
    item.type === 'DYNAMIC_TYPE_DRAW'
    || major?.type === 'MAJOR_TYPE_DRAW'
    || drawItems.length > 0
    || opusImages.length > 0
  )
  const resolvedImageMetas: { url: string, width?: number, height?: number }[] = imageMetas.length
    ? imageMetas
    : (cover ? [{ url: cover }] : [])
  const images = resolvedImageMetas
    .map(item => httpsUrl(item.url))
    .filter(Boolean)
    .filter((url: string, index: number, list: string[]) => list.indexOf(url) === index)
  const imageRatios = images.map((url) => {
    const meta = resolvedImageMetas.find(item => httpsUrl(item.url) === url)
    return getSafeImageRatio(Number(meta?.width || 0), Number(meta?.height || 0))
  })
  const firstImageRatio = imageRatios[0]

  return {
    title: pickText(live?.title, opus.title, archive.title, article.title, common.title),
    text,
    richText,
    images,
    imageRatios,
    firstImageRatio,
    isVideo: isRegularVideo || isUgcSeason,
    isRegularVideo,
    isUgcSeason,
    isDraw,
    isPgc,
    isLive: Boolean(live),
    isChargeExclusive,
    chargeBadge,
    chargeHint,
    chargeCover,
    roomId: live?.room_id ? Number(live.room_id) : undefined,
    duration: archive.duration_text || '',
    aid: archive.aid || undefined,
    bvid: archive.bvid || undefined,
    epid: major.pgc?.epid || undefined,
    videoUrl: archive.jump_url ? httpsUrl(archive.jump_url.startsWith('//') ? `https:${archive.jump_url}` : archive.jump_url) : undefined,
    videoPlay: pickText(archive.stat?.play),
    videoDanmaku: pickText(archive.stat?.danmaku),
    mediaMeta: live
      ? liveArea
      : (isChargeExclusive ? (chargeBadge || t('moments.charging_exclusive')) : (archive.duration_text || article.label || '')),
    liveArea,
    livePopularity,
    additional: additionalView,
  }
}

function resolveVideoUrl(moment: DisplayMoment) {
  if (moment.videoUrl)
    return moment.videoUrl
  if (moment.bvid)
    return `https://www.bilibili.com/video/${moment.bvid}`
  if (moment.aid)
    return `https://www.bilibili.com/video/av${moment.aid}`
  return ''
}

function resolveLiveUrl(moment: DisplayMoment) {
  if (!moment.roomId)
    return ''
  return `https://live.bilibili.com/${moment.roomId}`
}

function resolveDetailUrl(moment: DisplayMoment) {
  if (moment.isLive) {
    const liveUrl = resolveLiveUrl(moment)
    if (liveUrl)
      return liveUrl
  }
  if (moment.isVideo) {
    const videoUrl = resolveVideoUrl(moment)
    if (videoUrl)
      return videoUrl
  }
  // 转发、专栏：通过 query 告知 iframe 布局策略。
  // 转发（含转发图文）一律保持原站单栏并立即打开：
  // 分栏需等待抽取嵌套相册，慢且不稳定，原页本身已完整展示被转发内容。
  if (moment.isForward || moment.isArticle) {
    const usePlainForward = moment.isForward
    try {
      const url = new URL(moment.url)
      if (usePlainForward)
        url.searchParams.set('bewly_opus_plain', '1')
      if (moment.isArticle)
        url.searchParams.set('bewly_opus_article', '1')
      return url.toString()
    }
    catch {
      const join = moment.url.includes('?') ? '&' : '?'
      const params = [
        usePlainForward ? 'bewly_opus_plain=1' : '',
        moment.isArticle ? 'bewly_opus_article=1' : '',
      ].filter(Boolean).join('&')
      return params ? `${moment.url}${join}${params}` : moment.url
    }
  }
  return moment.url
}

function clearDetailLoadTimer() {
  if (detailLoadTimer) {
    clearTimeout(detailLoadTimer)
    detailLoadTimer = null
  }
}

function clearDetailFocusRetryTimer() {
  if (detailFocusRetryTimer) {
    clearTimeout(detailFocusRetryTimer)
    detailFocusRetryTimer = null
  }
}

function focusDetailIframe(retryCount = 3) {
  clearDetailFocusRetryTimer()

  nextTick(() => {
    requestAnimationFrame(() => {
      const iframe = detailIframeRef.value
      if (!iframe || !selectedMoment.value || !detailFrameUrl.value)
        return

      iframe.focus({ preventScroll: true })
      try {
        iframe.contentWindow?.focus()
      }
      catch {
        // 跨域 iframe 可能拒绝直接聚焦 window；此时保留 iframe 元素焦点。
      }

      if (retryCount > 0) {
        detailFocusRetryTimer = setTimeout(() => {
          focusDetailIframe(retryCount - 1)
        }, 120)
      }
    })
  })
}

function isPlayerMoment(moment: DisplayMoment | null | undefined) {
  return Boolean(moment?.isVideo || moment?.isLive)
}

const DETAIL_WEB_FULLSCREEN_BTN_SELECTOR = '.bpx-player-ctrl-web, .bilibili-player-video-web-fullscreen, .squirtle-video-pagefullscreen'
const DETAIL_FULLSCREEN_BTN_SELECTOR = '.bpx-player-ctrl-full, .bilibili-player-video-btn-fullscreen, .squirtle-video-fullscreen'
let stopDetailPlayerModeWatch: (() => void) | null = null

function getDocumentFullscreenElement(doc: Document) {
  return doc.fullscreenElement
    || (doc as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement
    || null
}

function isEnteredControl(el: Element | null) {
  return !!el?.classList.contains('bpx-state-entered')
}

function isIframePlayerImmersive(doc: Document) {
  if (getDocumentFullscreenElement(doc))
    return true
  if (doc.querySelector('[data-screen="web"], [data-screen="full"]'))
    return true
  return isEnteredControl(doc.querySelector(DETAIL_WEB_FULLSCREEN_BTN_SELECTOR))
    || isEnteredControl(doc.querySelector(DETAIL_FULLSCREEN_BTN_SELECTOR))
}

function setDetailPlayerImmersive(value: boolean) {
  detailPlayerImmersive.value = value
}

function syncDetailPlayerImmersiveFromIframe() {
  const iframe = detailIframeRef.value
  if (!iframe || !isPlayerMoment(selectedMoment.value)) {
    setDetailPlayerImmersive(false)
    return
  }

  if (getDocumentFullscreenElement(document) === iframe) {
    setDetailPlayerImmersive(true)
    return
  }

  try {
    const doc = iframe.contentDocument
    if (!doc) {
      setDetailPlayerImmersive(false)
      return
    }
    setDetailPlayerImmersive(isIframePlayerImmersive(doc))
  }
  catch {
    // 跨域直播页无法读取播放器状态，保持现有按钮可见性
  }
}

function clearDetailPlayerModeWatch() {
  stopDetailPlayerModeWatch?.()
  stopDetailPlayerModeWatch = null
}

function startDetailPlayerModeWatch(iframe: HTMLIFrameElement) {
  clearDetailPlayerModeWatch()
  if (!isPlayerMoment(selectedMoment.value)) {
    setDetailPlayerImmersive(false)
    return
  }

  let disposed = false
  let listenersAttached = false
  let retryTimer: ReturnType<typeof setInterval> | null = null
  const observedTargets = new WeakSet<Element>()
  const observer = new MutationObserver(() => {
    if (!disposed)
      syncDetailPlayerImmersiveFromIframe()
  })

  const onFullscreenChange = () => {
    if (!disposed)
      syncDetailPlayerImmersiveFromIframe()
  }

  const observeTarget = (el: Element | null) => {
    if (!el || observedTargets.has(el))
      return
    observedTargets.add(el)
    observer.observe(el, {
      attributes: true,
      attributeFilter: ['class', 'data-screen'],
    })
  }

  const attach = () => {
    if (disposed)
      return true

    try {
      const win = iframe.contentWindow
      const doc = iframe.contentDocument
      if (!win || !doc)
        return false

      if (!listenersAttached) {
        win.addEventListener('fullscreenchange', onFullscreenChange)
        doc.addEventListener('fullscreenchange', onFullscreenChange)
        win.addEventListener('webkitfullscreenchange', onFullscreenChange)
        listenersAttached = true
      }

      observeTarget(doc.querySelector(DETAIL_WEB_FULLSCREEN_BTN_SELECTOR))
      observeTarget(doc.querySelector(DETAIL_FULLSCREEN_BTN_SELECTOR))
      observeTarget(doc.querySelector('.bpx-player-container, #bilibili-player, .bilibili-player, [data-screen]'))
      syncDetailPlayerImmersiveFromIframe()
      return Boolean(
        doc.querySelector(DETAIL_WEB_FULLSCREEN_BTN_SELECTOR)
        || doc.querySelector('.bpx-player-container, #bilibili-player, .bilibili-player'),
      )
    }
    catch {
      return true
    }
  }

  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)

  if (!attach()) {
    let retries = 0
    retryTimer = setInterval(() => {
      retries++
      if ((attach() || retries >= 40) && retryTimer) {
        clearInterval(retryTimer)
        retryTimer = null
      }
    }, 250)
  }

  stopDetailPlayerModeWatch = () => {
    disposed = true
    if (retryTimer) {
      clearInterval(retryTimer)
      retryTimer = null
    }
    observer.disconnect()
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    try {
      const win = iframe.contentWindow
      const doc = iframe.contentDocument
      win?.removeEventListener('fullscreenchange', onFullscreenChange)
      doc?.removeEventListener('fullscreenchange', onFullscreenChange)
      win?.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    }
    catch {
      // iframe 已卸载或跨域时忽略
    }
  }
}

function getDimensionAspectRatio(dimension: any) {
  let width = Number(dimension?.width || 0)
  let height = Number(dimension?.height || 0)
  const rotation = Math.abs(Number(dimension?.rotate || 0)) % 180
  if (rotation === 90)
    [width, height] = [height, width]
  return width > 0 && height > 0 ? width / height : undefined
}

/** 图文保留自己的布局；播放器内容可在 iframe 内滚动。弹窗尺寸只参考 16:9 视口预算，不固定 Dialog 比例。 */
const isOpusDetailMoment = computed(() => Boolean(selectedMoment.value && !isPlayerMoment(selectedMoment.value)))

/** 详情弹窗预留视口四边 32px 安全边距；极矮视口由外层 min() 保证不溢出。 */
const PLAYER_DIALOG_WIDTH_SCALE = 0.92
const DETAIL_VIEWPORT_GUTTER = 64
const DETAIL_SAFE_WIDTH = `calc(100vw - ${DETAIL_VIEWPORT_GUTTER}px)`
const DETAIL_REFERENCE_HEIGHT = 'min(88dvh, 49.5vw)'
const DETAIL_SAFE_HEIGHT = `min(calc(100dvh - ${DETAIL_VIEWPORT_GUTTER}px), max(280px, ${DETAIL_REFERENCE_HEIGHT}))`
const DETAIL_PLAYER_MAX_WIDTH = `min(92vw, calc(${PLAYER_DIALOG_WIDTH_SCALE * 100}dvh * 16 / 9), ${DETAIL_SAFE_WIDTH})`
/** 图文弹窗评论区固定占页宽（小红书 note 详情） */
const OPUS_DETAIL_COMMENT_PAGE_RATIO = 0.29
/** 长图阈值：宽/高 ≤ 1/2 时按 1:2 定弹窗，图宽占满后纵向滚动 */
const OPUS_DETAIL_LONG_IMAGE_RATIO = 0.5
/** 图文弹窗最大宽：与视频共用 92vw / 视口 gutter，不含 16:9 约束 */
const OPUS_DETAIL_MAX_WIDTH = `min(${PLAYER_DIALOG_WIDTH_SCALE * 100}vw, 100vw - ${DETAIL_VIEWPORT_GUTTER}px)`
/** 图文弹窗最大高：可用视口高度内取值，且高不大于宽（宽上限同 OPUS_DETAIL_MAX_WIDTH），避免竖屏下过度拉长 */
const OPUS_DETAIL_MAX_HEIGHT = `min(100dvh - ${DETAIL_VIEWPORT_GUTTER}px, max(280px, 88dvh), ${OPUS_DETAIL_MAX_WIDTH})`
/** 与 Bewly 宽屏模式的完整评论面板宽度一致，避免方形/竖屏视频收窄时挤压评论区。 */
const VIDEO_DETAIL_COMMENT_WIDTH = 'clamp(480px, 32vw, 600px)'
const selectedVideoAspectRatio = computed(() => {
  const moment = selectedMoment.value
  if (!moment?.isVideo || moment.isLive || moment.isPgc)
    return undefined
  return (moment.bvid ? videoAspectRatios[moment.bvid] : undefined)
    || coverRatios[moment.id]
})
const isSelectedSquareOrVerticalVideo = computed(() => {
  const ratio = selectedVideoAspectRatio.value
  return Boolean(ratio && ratio <= 1)
})

/** 图文分栏详情（转发/专栏/纯文字除外）：弹窗尺寸以首图为基准 */
function isOpusSplitDetailMoment(moment: DisplayMoment | null | undefined) {
  if (!moment || isPlayerMoment(moment) || moment.isArticle || moment.isForward)
    return false
  return moment.images.length > 0
}

function getOpusDetailFirstImageRatio(moment: DisplayMoment | null | undefined) {
  if (!moment)
    return undefined
  const fromMeta = moment.imageRatios?.[0]
  if (isUsableImageRatio(fromMeta))
    return fromMeta
  const fromCover = coverRatios[moment.id]
  return isUsableImageRatio(fromCover) ? fromCover : undefined
}

/** 分栏图文首图的布局比例：未知比例按 1:1，长图钳到 1:2 */
function getOpusSplitLayoutRatio(moment: DisplayMoment | null | undefined) {
  const rawRatio = getOpusDetailFirstImageRatio(moment)
  return Math.max(
    isUsableImageRatio(rawRatio) ? rawRatio : 1,
    OPUS_DETAIL_LONG_IMAGE_RATIO,
  )
}

const detailDialogHeight = computed(() => {
  const moment = selectedMoment.value
  if (!isOpusSplitDetailMoment(moment))
    return DETAIL_SAFE_HEIGHT
  // 图文弹窗始终使用正常的视口高度预算。横图若无法同时铺满媒体区宽高，
  // 由 iframe 内的 contain 布局居中完整显示，并在上下保留媒体底色。
  return OPUS_DETAIL_MAX_HEIGHT
})

const detailDialogWidth = computed(() => {
  if (selectedMoment.value?.isLive)
    return DETAIL_PLAYER_MAX_WIDTH
  if (selectedMoment.value?.isVideo) {
    if (isSelectedSquareOrVerticalVideo.value && settings.value.defaultVideoPlayerMode === 'bewlyWidescreen') {
      const ratio = Math.max(0.4, selectedVideoAspectRatio.value || 9 / 16)
      return `min(max(960px, calc(${detailDialogHeight.value} * ${ratio} + ${VIDEO_DETAIL_COMMENT_WIDTH})), ${DETAIL_PLAYER_MAX_WIDTH})`
    }
    return DETAIL_PLAYER_MAX_WIDTH
  }
  const moment = selectedMoment.value
  if (isOpusSplitDetailMoment(moment)) {
    // 宽度按正常高度预算与首图比例计算；评论列由 iframe 固定为视口宽的 29%
    // （经 BEWLY_OPUS_VIEWPORT 同步）。达到最大宽度后，横图由媒体区 contain 居中显示。
    const commentWidth = `${OPUS_DETAIL_COMMENT_PAGE_RATIO * 100}vw`
    return `min(${OPUS_DETAIL_MAX_WIDTH}, calc(${getOpusSplitLayoutRatio(moment)} * ${detailDialogHeight.value} + ${commentWidth}))`
  }
  // 纯文字 / 专栏 / 转发：参考小红书 note-container 1088px
  return `min(1088px, ${DETAIL_SAFE_WIDTH})`
})

const detailContentHeight = computed(() => {
  return detailDialogHeight.value
})

const detailImageViewerUrl = computed(() => detailImageViewerUrls.value[detailImageViewerIndex.value] || '')
const detailImageViewerTransform = computed(() => {
  return `translate3d(${detailImageViewerPanX.value}px, ${detailImageViewerPanY.value}px, 0) scale(${detailImageViewerScale.value}) rotate(${detailImageViewerRotation.value}deg)`
})

function resetDetailImageViewerTransform() {
  detailImageViewerScale.value = 1
  detailImageViewerRotation.value = 0
  detailImageViewerPanX.value = 0
  detailImageViewerPanY.value = 0
}

function setDetailImageViewerScale(scale: number) {
  detailImageViewerScale.value = Math.min(4, Math.max(0.25, scale))
  if (detailImageViewerScale.value <= 1) {
    detailImageViewerPanX.value = 0
    detailImageViewerPanY.value = 0
  }
}

function showDetailImageViewerImage(index: number) {
  const count = detailImageViewerUrls.value.length
  if (!count)
    return
  detailImageViewerIndex.value = ((index % count) + count) % count
  resetDetailImageViewerTransform()
}

function openDetailImageViewer(
  value: unknown,
  requestedIndex: unknown,
  source: Window | null = null,
  trigger: HTMLElement | null = null,
) {
  const { index, urls } = normalizeDetailImageViewerPayload(value, requestedIndex)
  if (!urls.length)
    return false

  detailImageViewerUrls.value = urls
  detailImageViewerIndex.value = index
  detailImageViewerSource.value = source
  detailImageViewerTrigger = trigger?.isConnected ? trigger : null
  detailImageViewerOpen.value = true
  resetDetailImageViewerTransform()
  nextTick(() => detailImageViewerRef.value?.focus({ preventScroll: true }))
  return true
}

function closeDetailImageViewer() {
  if (!detailImageViewerOpen.value)
    return

  const source = detailImageViewerSource.value
  const trigger = detailImageViewerTrigger
  try {
    source?.postMessage({
      type: 'BEWLY_OPUS_IMAGE_VIEWER_CLOSE',
      index: detailImageViewerIndex.value,
    }, '*')
  }
  catch {
    // iframe 已销毁时忽略
  }
  detailImageViewerOpen.value = false
  detailImageViewerUrls.value = []
  detailImageViewerSource.value = null
  detailImageViewerTrigger = null
  detailImageViewerDragging.value = false
  resetDetailImageViewerTransform()
  nextTick(() => {
    if (source) {
      detailIframeRef.value?.focus({ preventScroll: true })
      return
    }
    if (trigger?.isConnected)
      trigger.focus({ preventScroll: true })
  })
}

function handleDetailImageViewerWheel(event: WheelEvent) {
  const delta = event.deltaY || event.deltaX
  if (!delta)
    return
  setDetailImageViewerScale(detailImageViewerScale.value * (delta < 0 ? 1.15 : 0.87))
}

function handleDetailImageViewerPointerDown(event: PointerEvent) {
  if (detailImageViewerScale.value <= 1)
    return
  event.preventDefault()
  detailImageViewerDragging.value = true
  detailImageViewerDragStartX = event.clientX
  detailImageViewerDragStartY = event.clientY
  detailImageViewerDragOriginX = detailImageViewerPanX.value
  detailImageViewerDragOriginY = detailImageViewerPanY.value
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function handleDetailImageViewerPointerMove(event: PointerEvent) {
  if (!detailImageViewerDragging.value)
    return
  detailImageViewerPanX.value = detailImageViewerDragOriginX + event.clientX - detailImageViewerDragStartX
  detailImageViewerPanY.value = detailImageViewerDragOriginY + event.clientY - detailImageViewerDragStartY
}

function handleDetailImageViewerPointerEnd(event: PointerEvent) {
  if (!detailImageViewerDragging.value)
    return
  detailImageViewerDragging.value = false
  try {
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  }
  catch {
    // 指针已经释放时忽略
  }
}

function handleDetailImageViewerDoubleClick() {
  if (detailImageViewerScale.value > 1)
    resetDetailImageViewerTransform()
  else
    setDetailImageViewerScale(2)
}

function handleDetailImageViewerKeydown(event: KeyboardEvent) {
  if (!detailImageViewerOpen.value)
    return

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    closeDetailImageViewer()
  }
  else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    event.stopImmediatePropagation()
    showDetailImageViewerImage(detailImageViewerIndex.value - 1)
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    event.stopImmediatePropagation()
    showDetailImageViewerImage(detailImageViewerIndex.value + 1)
  }
  else if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    event.stopImmediatePropagation()
    setDetailImageViewerScale(detailImageViewerScale.value + 0.25)
  }
  else if (event.key === '-' || event.key === '_') {
    event.preventDefault()
    event.stopImmediatePropagation()
    setDetailImageViewerScale(detailImageViewerScale.value - 0.25)
  }
  else if (event.key === '0') {
    event.preventDefault()
    event.stopImmediatePropagation()
    resetDetailImageViewerTransform()
  }
}

type ResolvedMomentOpenMode = 'dialog' | 'currentTab' | 'newTab' | 'background'

function resolveMomentOpenMode(moment: DisplayMoment): ResolvedMomentOpenMode {
  const videoCardOpenMode = settings.value.momentsVideoCardOpenMode
  if (moment.isVideo && !moment.isPgc && videoCardOpenMode !== 'inherit')
    return videoCardOpenMode

  return settings.value.momentsCardOpenMode
}

function resolveLinkOpenMode(kind: MomentLinkKind): ResolvedMomentOpenMode {
  if (kind === 'video') {
    const videoMode = settings.value.momentsVideoCardOpenMode
    return videoMode === 'inherit' ? settings.value.momentsCardOpenMode : videoMode
  }
  if (kind === 'moment')
    return settings.value.momentsCardOpenMode

  const mode = settings.value.momentsCardOpenMode
  return mode === 'dialog' ? 'newTab' : mode
}

function createLinkMoment(url: string, kind: Extract<MomentLinkKind, 'video' | 'moment'>, video?: DisplayForwardVideo): DisplayMoment {
  const bvid = video?.bvid || url.match(/\/video\/(BV\w+)/i)?.[1]
  const aid = video?.aid || url.match(/\/video\/av(\d+)/i)?.[1]
  return {
    id: `link-${kind}-${bvid || aid || url}`,
    author: { mid: '', name: '', face: '' },
    publishedAt: 0,
    title: video?.title || '',
    text: '',
    richText: [],
    images: video?.cover ? [video.cover] : [],
    time: '',
    likeCount: 0,
    isLiked: false,
    isLikeDisabled: true,
    commentCount: 0,
    url,
    isVideo: kind === 'video',
    isRegularVideo: kind === 'video',
    isUgcSeason: false,
    isDraw: false,
    isPgc: false,
    isLive: false,
    isChargeExclusive: false,
    isForward: false,
    isArticle: false,
    isUpRecommendation: false,
    isVideoReservation: false,
    isLiveReservation: false,
    mediaMeta: video?.duration || '',
    liveArea: '',
    livePopularity: '',
    duration: video?.duration || '',
    videoPlay: video?.play || '',
    videoDanmaku: video?.danmaku || '',
    aid,
    bvid,
    videoUrl: kind === 'video' ? (video?.url || url) : undefined,
  }
}

function shouldOpenMomentExternally(moment: DisplayMoment, openMode: ResolvedMomentOpenMode) {
  return moment.isLive
    || openMode !== 'dialog'
    || window.innerWidth <= DETAIL_DIALOG_MIN_WIDTH
}

function openMomentImagePreview(urls: string[], index: number, trigger: HTMLElement | null) {
  openDetailImageViewer(urls, index, null, trigger)
}

function openMomentExternally(moment: DisplayMoment, openMode: Exclude<ResolvedMomentOpenMode, 'dialog'>) {
  const url = resolveDetailUrl(moment) || moment.url
  if (!url)
    return

  hoveredMediaId.value = ''
  cleanupLivePreviewPlayer()
  if (previewUrls[moment.id])
    delete previewUrls[moment.id]
  if (openMode === 'background')
    void openLinkInBackground(url)
  else if (openMode === 'currentTab')
    window.open(url, '_top')
  else
    window.open(url, '_blank', 'noopener,noreferrer')
}

function openDetailFrameInNewTab() {
  const url = detailFrameUrl.value
  if (!url)
    return

  const popup = window.open('about:blank', '_blank')
  if (!popup)
    return

  try {
    popup.opener = null
    popup.location.replace(url)
    closeMomentDetail()
  }
  catch {
    try {
      popup.close()
    }
    catch {
      // Ignore failures while closing a blocked or already navigated popup.
    }
  }
}

function openMomentDetail(moment: DisplayMoment, forceDialog = false) {
  if (moment.isVideo && !moment.isLive)
    recordVideoVisit(moment)

  const openMode = forceDialog ? 'dialog' : resolveMomentOpenMode(moment)

  // 小屏、直播与外部打开设置：离开详情 Dialog，避免狭窄 Dialog 与跨域直播占用。
  // 弹窗模式在小屏和直播动态上回退为新标签页。
  if (!forceDialog && shouldOpenMomentExternally(moment, openMode)) {
    openMomentExternally(moment, openMode === 'dialog' ? 'newTab' : openMode)
    return
  }

  if (moment.isVideo && !moment.isLive && moment.bvid)
    void loadVideoAspectRatio(moment.bvid)

  // 若已有详情在开，先销毁旧 iframe，避免叠内存
  if (selectedMoment.value || detailFrameUrl.value)
    destroyDetailIframe()

  selectedMoment.value = moment
  detailFrameUrl.value = resolveDetailUrl(moment)
  detailFrameLoaded.value = false
  setDetailPlayerImmersive(false)
  // 打开详情时释放悬停预览资源
  hoveredMediaId.value = ''
  cleanupLivePreviewPlayer()
  clearDetailLoadTimer()
  destroyDetailIframe()
  // 视频/直播、转发（原页直接展示）：load 后即可；图文等待布局 ready 兜底避免遮罩卡住
  const fallbackMs = isPlayerMoment(moment)
    ? 1800
    : moment.isForward
      ? 1200
      : 4500
  detailLoadTimer = setTimeout(() => {
    detailFrameLoaded.value = true
  }, fallbackMs)
}

/** 告知 opus iframe 真实视口宽：跨源时它读不到 window.top，评论列（视口宽 29%）需要以此为准 */
function syncDetailFrameViewport() {
  const win = detailIframeRef.value?.contentWindow
  if (!win || !detailFrameUrl.value)
    return
  try {
    win.postMessage({ type: 'BEWLY_OPUS_VIEWPORT', width: window.innerWidth }, '*')
  }
  catch {
    // iframe 已销毁时忽略
  }
}

function handleDetailIframeLoad(event: Event) {
  clearDetailLoadTimer()
  syncDetailFrameViewport()

  // 与抽屉一致：同域时去掉顶栏占位，并保证视频/直播页可滚动
  const iframe = event.target as HTMLIFrameElement | null
  const win = iframe?.contentWindow
  if (win) {
    try {
      const doc = win.document
      if (doc) {
        doc.documentElement.classList.add('remove-top-bar-without-placeholder')
        doc.documentElement.style.setProperty('overflow-x', 'hidden', 'important')
        doc.documentElement.style.setProperty('overflow-y', 'auto', 'important')
        if (doc.body) {
          doc.body.style.setProperty('overflow-x', 'hidden', 'important')
          doc.body.style.setProperty('overflow-y', 'auto', 'important')
          doc.body.style.setProperty('height', 'auto', 'important')
        }
      }
    }
    catch {
      // 跨域（如 live.bilibili.com）无法注入，依赖 iframe 默认滚动
    }
  }

  // 弹窗打开后把焦点移入 iframe，确保播放器、图集与 ESC 快捷键立即生效。
  focusDetailIframe()

  if (iframe)
    startDetailPlayerModeWatch(iframe)

  // 视频/直播、转发（原页直接展示）：load 后立即显示，不做「整理动态」等待
  if (isPlayerMoment(selectedMoment.value) || selectedMoment.value?.isForward) {
    detailFrameLoaded.value = true
    return
  }

  // 图文/专栏：再给布局一点时间，最终由 BEWLY_OPUS_LAYOUT_READY 解除
  detailLoadTimer = setTimeout(() => {
    detailFrameLoaded.value = true
  }, 2800)
}

/** 关闭详情时销毁 iframe 文档与媒体，避免内存堆积 */
function destroyDetailIframe() {
  clearDetailFocusRetryTimer()
  clearDetailPlayerModeWatch()
  setDetailPlayerImmersive(false)

  const iframe = detailIframeRef.value
  if (!iframe)
    return

  // 通知同域 iframe 内部主动释放观察器/媒体
  try {
    iframe.contentWindow?.postMessage({ type: 'BEWLY_OPUS_DISPOSE' }, '*')
  }
  catch {
    // ignore
  }

  // 同域时尽量停掉播放器并清空文档
  try {
    const win = iframe.contentWindow
    const doc = win?.document
    if (doc) {
      doc.querySelectorAll('video, audio').forEach((el) => {
        const media = el as HTMLMediaElement
        try {
          media.pause()
          media.removeAttribute('src')
          while (media.firstChild)
            media.removeChild(media.firstChild)
          media.load()
        }
        catch {
          // ignore
        }
      })

      // 断开页面脚本与 DOM，促使浏览器回收
      try {
        doc.open()
        doc.write('<!doctype html><title></title>')
        doc.close()
      }
      catch {
        // ignore
      }
    }
  }
  catch {
    // 跨域（直播等）无法访问 contentDocument
  }

  try {
    iframe.src = 'about:blank'
  }
  catch {
    // ignore
  }
  try {
    iframe.removeAttribute('src')
  }
  catch {
    // ignore
  }

  detailIframeRef.value = null
}

function closeMomentDetail() {
  closeDetailImageViewer()
  clearDetailLoadTimer()
  destroyDetailIframe()
  selectedMoment.value = null
  detailFrameUrl.value = ''
  detailFrameLoaded.value = false
}

function collectVideoPublicationTimes(items: DataItem[]) {
  return items.flatMap((item) => {
    if (item.type === 'DYNAMIC_TYPE_FORWARD')
      return []

    const author = item.modules?.module_author
    const major = item.modules?.module_dynamic?.major
    const archive = major?.archive || major?.ugc_season
    const time = Number(author?.pub_ts || 0) * 1000
    if (!archive || time <= 0)
      return []

    const mids = new Set<number | string>()
    if (author?.mid)
      mids.add(author.mid)
    if (Array.isArray(archive.coop_info)) {
      archive.coop_info.forEach((coop: any) => {
        if (coop?.mid)
          mids.add(coop.mid)
      })
    }

    return Array.from(mids, mid => ({ mid, time }))
  })
}

function mapMoment(item: DataItem): DisplayMoment {
  const raw = item
  const author = raw.modules?.module_author || {}
  const dynamic = raw.modules?.module_dynamic || {}
  const isForward = raw.type === 'DYNAMIC_TYPE_FORWARD' && Boolean(raw.orig)
  const contentRaw = isForward && raw.orig ? raw.orig : raw
  const content = getMomentContent(contentRaw)
  // 转发内嵌视频：archive / 合集订阅 ugc_season 均可作为摘要来源
  const forwardedMajor = isForward
    ? contentRaw.modules?.module_dynamic?.major
    : undefined
  const forwardedArchive = forwardedMajor?.archive || forwardedMajor?.ugc_season
  // 转发时作者侧也可能挂充电角标
  const selfContent = isForward ? getMomentContent(raw) : content
  const forwardedAuthor = contentRaw.modules?.module_author || {}
  const id = raw.id_str || raw.id || `${author.mid}-${author.pub_ts}`
  const origId = String(contentRaw.id_str || contentRaw.id || '')
  const text = isForward
    ? (normalizeDescText(dynamic.desc) || t('moments.forwarded_post'))
    : content.text
  const richText = isForward
    ? extractRichTextSegments(dynamic.desc?.rich_text_nodes)
    : content.richText
  const additional = content.additional || selfContent.additional
  const isChargeExclusive = content.isChargeExclusive || selfContent.isChargeExclusive
  const commentInteraction = raw.modules?.module_interaction?.items?.find(
    (interaction: any) => Number(interaction?.type) === 1,
  )?.desc
  const hotCommentText = normalizeDescText(commentInteraction)
  const hotCommentRichText = extractRichTextSegments(commentInteraction?.rich_text_nodes)

  if (content.firstImageRatio && !coverRatios[id])
    coverRatios[id] = content.firstImageRatio

  return {
    id,
    author: {
      mid: String(author.mid || ''),
      name: author.name || t('moments.bilibili_user'),
      face: httpsUrl(author.face || ''),
    },
    publishedAt: Number(author.pub_ts || 0),
    title: content.title,
    text,
    richText,
    // 转发卡片只展示原动态摘要，不能把原动态图片提升为外层卡片媒体。
    images: isForward || (isChargeExclusive && !content.isVideo) ? [] : content.images,
    imageRatios: isForward || (isChargeExclusive && !content.isVideo) ? [] : content.imageRatios,
    time: author.pub_time || '',
    likeCount: Number(raw.modules?.module_stat?.like?.count || 0),
    isLiked: raw.modules?.module_stat?.like?.status === true
      || Number(raw.modules?.module_stat?.like?.status) === 1,
    isLikeDisabled: Boolean(
      raw.modules?.module_stat?.like?.forbidden
      || raw.modules?.module_stat?.like?.disabled,
    ),
    commentCount: Number(raw.modules?.module_stat?.comment?.count || 0),
    hotComment: hotCommentText || hotCommentRichText.length
      ? {
          text: hotCommentText,
          richText: hotCommentRichText,
        }
      : undefined,
    url: `https://www.bilibili.com/opus/${id}`,
    // 转发视频仍然是“转发动态”；原视频由卡片内的独立视频摘要展示。
    isVideo: !isForward && content.isVideo,
    isRegularVideo: !isForward && content.isRegularVideo,
    isUgcSeason: !isForward && content.isUgcSeason,
    isDraw: !isForward && content.isDraw,
    isPgc: content.isPgc,
    isLive: content.isLive,
    isForward,
    isArticle: raw.type === 'DYNAMIC_TYPE_ARTICLE'
      || contentRaw.type === 'DYNAMIC_TYPE_ARTICLE'
      || Number(raw.basic?.comment_type) === 12
      || Number(contentRaw.basic?.comment_type) === 12
      || raw.modules?.module_dynamic?.major?.type === 'MAJOR_TYPE_ARTICLE'
      || contentRaw.modules?.module_dynamic?.major?.type === 'MAJOR_TYPE_ARTICLE',
    isUpRecommendation: Boolean(additional?.isUpRecommendation),
    isVideoReservation: Boolean(additional?.isVideoReservation),
    isLiveReservation: Boolean(additional?.isLiveReservation),
    isChargeExclusive,
    chargeBadge: content.chargeBadge || selfContent.chargeBadge,
    chargeHint: content.chargeHint || selfContent.chargeHint,
    chargeCover: content.chargeCover || selfContent.chargeCover,
    mediaMeta: content.mediaMeta,
    liveArea: content.liveArea,
    livePopularity: content.livePopularity,
    roomId: content.roomId,
    duration: content.duration,
    videoPlay: content.videoPlay,
    videoDanmaku: content.videoDanmaku,
    aid: content.aid,
    bvid: content.bvid,
    videoUrl: content.videoUrl,
    additional,
    forward: isForward
      ? {
          author: forwardedAuthor.name || t('moments.original_author'),
          authorMid: String(forwardedAuthor.mid || ''),
          title: content.title,
          text: content.text,
          fallback: content.isChargeExclusive
            ? (content.chargeBadge || t('moments.charging_exclusive_post'))
            : content.isLive
              ? t('moments.live_post')
              : content.isVideo
                ? t('moments.video_post')
                : content.images.length
                  ? t('moments.image_post')
                  : content.text
                    ? t('moments.text_post')
                    : t('moments.original_post'),
          id: origId,
          url: origId ? `https://www.bilibili.com/opus/${origId}` : '',
          isArticle: contentRaw.type === 'DYNAMIC_TYPE_ARTICLE'
            || Number(contentRaw.basic?.comment_type) === 12
            || contentRaw.modules?.module_dynamic?.major?.type === 'MAJOR_TYPE_ARTICLE',
          // 转发动态的原图只放在嵌套卡片中，避免被提升成外层动态媒体。
          images: !content.isVideo && !content.isLive && !content.isChargeExclusive
            ? content.images
            : [],
          imageRatios: !content.isVideo && !content.isLive && !content.isChargeExclusive
            ? content.imageRatios
            : [],
          video: forwardedArchive
            ? {
                title: pickText(forwardedArchive.title, content.title),
                cover: httpsUrl(forwardedArchive.cover || content.images[0] || ''),
                duration: pickText(forwardedArchive.duration_text, content.duration),
                play: pickText(forwardedArchive.stat?.play, content.videoPlay),
                danmaku: pickText(forwardedArchive.stat?.danmaku, content.videoDanmaku),
                url: content.videoUrl
                  || (content.bvid
                    ? `https://www.bilibili.com/video/${content.bvid}`
                    : content.aid
                      ? `https://www.bilibili.com/video/av${content.aid}`
                      : ''),
                aid: content.aid,
                bvid: content.bvid,
              }
            : undefined,
        }
      : undefined,
  }
}

function estimateCardHeight(moment: DisplayMoment) {
  const columnWidth = Math.max(
    CARD_COMPACT_MIN_WIDTH,
    gridCardWidth.value || CARD_MAX_WIDTH_BY_COLUMNS[gridColumnCount.value as 1 | 2],
  )
  const contentScale = Math.max(1, columnWidth / CARD_MAX_WIDTH_BY_COLUMNS[2])
  const scaledTextBodyExtra = Math.round(230 * (contentScale - 1))
  const interactionHeight = moment.hotComment ? 52 : 0
  const contentWidth = Math.max(1, columnWidth - 32)
  if (isCompactPlainTextMoment(moment)) {
    const charsPerLine = Math.max(12, Math.floor(contentWidth / 14))
    const lineCount = Math.min(7, Math.max(1, (moment.text || '').split('\n').reduce(
      (total, line) => total + Math.max(1, Math.ceil(Array.from(line).length / charsPerLine)),
      0,
    )))
    const additionalHeight = moment.additional ? 68 : 0
    return 118 + lineCount * 21 + additionalHeight + interactionHeight
  }
  if (moment.forward?.images?.length) {
    const introLines = Math.min(7, Math.max(1, Math.ceil((moment.text || '').length / 28)))
    // Forward galleries sit inside the bordered card with 12px side/bottom
    // insets; subtract the 16px main inset and the 2px card border as well.
    const galleryWidth = Math.max(1, columnWidth - 58)
    const useForwardGallery = shouldUseMomentImageGallery(moment.forward.images, {
      imageRatio: moment.forward.imageRatios?.[0] ?? coverRatios[moment.id],
      imageRatios: moment.forward.imageRatios,
    })
    const forwardGalleryWidth = useForwardGallery
      ? galleryWidth
      : Math.min(galleryWidth, LANDSCAPE_SINGLE_IMAGE_MAX_WIDTH)
    const galleryHeight = useForwardGallery
      ? computeMultiImageGalleryHeight(
          forwardGalleryWidth,
          moment.forward.imageRatios?.[0] ? moment.forward.imageRatios : [coverRatios[moment.id]],
        )
      : Math.round(forwardGalleryWidth / Math.max(1, moment.forward.imageRatios?.[0] || coverRatios[moment.id] || 1))
    return 190 + introLines * 21 + galleryHeight + interactionHeight
  }
  if (moment.forward?.video) {
    const introLines = Math.min(7, Math.max(1, Math.ceil((moment.text || '').length / 28)))
    const forwardMediaWidth = Math.max(150, contentWidth * 0.44)
    return 117 + Math.round(forwardMediaWidth * 9 / 16) + introLines * 21 + interactionHeight
  }
  if (moment.isChargeExclusive && !moment.isVideo)
    return 230 + scaledTextBodyExtra + interactionHeight
  if (columnWidth < CARD_MIN_WIDTH) {
    if (moment.isLive)
      return Math.round(columnWidth * 9 / 16) + 210 + interactionHeight
    if (moment.isVideo) {
      const mediaWidth = Math.max(1, contentWidth)
      const charsPerLine = Math.max(12, Math.floor(mediaWidth / 14))
      const titleLines = moment.title
        ? Math.min(2, Math.max(1, Math.ceil(Array.from(moment.title).length / charsPerLine)))
        : 0
      const previewText = getCardPreviewText(moment)
      const descLines = previewText
        ? Math.min(8, Math.max(1, Math.ceil(Array.from(previewText).length / charsPerLine)))
        : 0
      const bodyHeight = titleLines * 22
        + (titleLines && descLines ? 8 : 0)
        + descLines * 24
      return Math.round(mediaWidth * 9 / 16)
        + 126
        + bodyHeight
        + (moment.additional ? 68 : 0)
        + interactionHeight
    }
  }
  if (moment.isLive)
    return Math.round(contentWidth * 9 / 16) + 190 + interactionHeight
  if (moment.isVideo) {
    // 左封面右简介：高度由半宽 16:9 封面决定，标题单独落在底部。
    const innerWidth = contentWidth
    const coverWidth = Math.max(1, Math.floor((innerWidth - 12) / 2))
    const titleCharsPerLine = Math.max(12, Math.floor(innerWidth / 14))
    const titleLines = moment.title
      ? Math.min(2, Math.max(1, Math.ceil(Array.from(moment.title).length / titleCharsPerLine)))
      : 0
    const titleHeight = titleLines ? 12 + titleLines * 22 : 0
    return Math.round(coverWidth * 9 / 16)
      + titleHeight
      + 126
      + (moment.additional ? 68 : 0)
      + interactionHeight
  }
  if (moment.images.length && !moment.isVideo && !moment.isLive) {
    const useGallery = shouldUseMomentImageGallery(moment.images, {
      imageRatio: coverRatios[moment.id],
      imageRatios: moment.imageRatios,
    })
    const galleryWidth = useGallery
      ? contentWidth
      : Math.min(contentWidth, LANDSCAPE_SINGLE_IMAGE_MAX_WIDTH)
    const galleryHeight = useGallery
      ? computeMultiImageGalleryHeight(
          galleryWidth,
          moment.imageRatios?.[0] ? moment.imageRatios : [coverRatios[moment.id]],
        )
      : Math.round(galleryWidth / Math.max(1, coverRatios[moment.id] || 1))
    return galleryHeight + 220 + interactionHeight
  }
  return 230 + scaledTextBodyExtra + interactionHeight
}

function handleMomentFilterChange(filter: MomentFilter) {
  if (activeMomentFilter.value === filter)
    return

  hoveredMediaId.value = ''
  cleanupLivePreviewPlayer()
  Object.keys(previewUrls).forEach(key => delete previewUrls[key])
  visibleMomentIds.clear()
  activeMomentFilter.value = filter
  if (filter !== 'all' && filter !== 'video')
    activeMomentGroup.value = 'all'
  resetMomentsScroll()
  void loadMoments(true)
}

function handleMomentGroupChange(group: MomentGroup) {
  if (
    group === 'wanted'
    && (
      !settings.value.momentsEnableWantedFilter
      || (activeMomentFilter.value !== 'all' && activeMomentFilter.value !== 'video')
    )
  ) {
    return
  }
  if (activeMomentGroup.value === group && (group !== 'wanted' || !selectedHostMid.value))
    return

  prepareMomentListTransition()
  if (group === 'wanted')
    selectedHostMid.value = ''
  activeMomentGroup.value = group
  wantedCacheCursor.value = 0
  void loadMoments(true)
}

function clearUpUpdateDot(mid: string) {
  if (!mid)
    return
  const target = portalUpList.value.find(up => up.mid === mid)
  if (target && target.has_update)
    target.has_update = false
}

function prepareMomentListTransition() {
  hoveredMediaId.value = ''
  cleanupLivePreviewPlayer()
  Object.keys(previewUrls).forEach(key => delete previewUrls[key])
  visibleMomentIds.clear()
  resetMomentsScroll()
}

/** 选择“全部动态”或某个经常访问的 UP 主；切换时 reset 列表与分页 */
function handleUpFilterChange(mid = '') {
  const nextMid = mid ? String(mid) : ''
  if (selectedHostMid.value === nextMid && activeMomentGroup.value === 'all')
    return

  prepareMomentListTransition()
  selectedHostMid.value = nextMid
  activeMomentGroup.value = 'all'
  wantedCacheCursor.value = 0
  if (nextMid)
    clearUpUpdateDot(nextMid)
  void loadMoments(true)
}

function handleUpListWheel(event: WheelEvent) {
  const scroller = event.currentTarget as HTMLElement | null
  if (!scroller || scroller.scrollWidth <= scroller.clientWidth)
    return

  // 将纵向滚轮转为横向滚动，贴近 B 站经常访问列表交互
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX))
    return

  scroller.scrollLeft += event.deltaY
  event.preventDefault()
  updateUpListScrollState()
}

function updateUpListScrollState() {
  const scroller = upListScrollerRef.value
  if (!scroller) {
    canScrollUpListLeft.value = false
    canScrollUpListRight.value = false
    return
  }

  const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth
  canScrollUpListLeft.value = scroller.scrollLeft > 1
  canScrollUpListRight.value = maxScrollLeft > 1 && scroller.scrollLeft < maxScrollLeft - 1
}

function scrollUpListBy(direction: -1 | 1) {
  const scroller = upListScrollerRef.value
  if (!scroller)
    return

  const distance = Math.max(Math.round(scroller.clientWidth * 0.65), 180)
  scroller.scrollBy({ left: distance * direction, behavior: 'smooth' })
}

function setupUpListScrollerObserver() {
  upListResizeObserver?.disconnect()
  upListResizeObserver = undefined
  const scroller = upListScrollerRef.value
  if (!scroller)
    return

  upListResizeObserver = new ResizeObserver(() => {
    updateUpListScrollState()
  })
  upListResizeObserver.observe(scroller)
  updateUpListScrollState()
}

function isFeedRequestCurrent(
  requestToken: number,
  requestType: MomentFilter,
  requestGroup: MomentGroup,
  requestHostMid: string,
) {
  return requestToken === feedRequestToken
    && requestType === activeMomentFilter.value
    && requestGroup === activeMomentGroup.value
    && requestHostMid === selectedHostMid.value
}

function matchesMomentFilter(moment: DisplayMoment) {
  if (activeMomentFilter.value === 'all')
    return true
  if (activeMomentFilter.value === 'video')
    return moment.isVideo && !moment.isPgc
  if (activeMomentFilter.value === 'pgc')
    return moment.isPgc
  return moment.isArticle
}

function getValidMomentsCache(filter: MomentFilter) {
  const entry = momentsFeedCache.value[filter]
  if (!entry)
    return undefined
  const usesCurrentVideoShape = entry.items.every(moment => (
    typeof moment.videoPlay === 'string'
    && typeof moment.videoDanmaku === 'string'
    && !(moment.isForward && moment.isVideo)
  ))
  if (usesCurrentVideoShape && Date.now() - entry.updatedAt < MOMENTS_CACHE_TTL_MS)
    return entry

  const { [filter]: _expired, ...validEntries } = momentsFeedCache.value
  momentsFeedCache.value = validEntries
  return undefined
}

function mergeCachedMoments(primary: DisplayMoment[], secondary: DisplayMoment[]) {
  const result: DisplayMoment[] = []
  const ids = new Set<string>()
  for (const moment of [...primary, ...secondary]) {
    if (ids.has(moment.id))
      continue
    ids.add(moment.id)
    result.push(moment)
    if (result.length >= MOMENTS_CACHE_MAX_ITEMS)
      break
  }
  return result
}

function saveMomentsCache(filter: MomentFilter, entry: MomentsFeedCacheEntry) {
  const items = entry.items.slice(0, MOMENTS_CACHE_MAX_ITEMS)
  const continuationLimit = Math.max(0, MOMENTS_CACHE_MAX_ITEMS - items.length)
  const continuation = entry.continuation && continuationLimit > 0
    ? { ...entry.continuation, items: entry.continuation.items.slice(0, continuationLimit) }
    : undefined
  momentsFeedCache.value = {
    ...momentsFeedCache.value,
    [filter]: {
      ...entry,
      items,
      continuation,
      updatedAt: Date.now(),
    },
  }
}

function cacheRegularMomentPage(
  filter: MomentFilter,
  pageItems: DisplayMoment[],
  pageOffset: string,
  pageUpdateBaseline: string,
  pageHasMore: boolean,
  reset: boolean,
) {
  if ((filter !== 'all' && filter !== 'video') || !pageItems.length)
    return

  const existing = getValidMomentsCache(filter)
  if (!existing) {
    saveMomentsCache(filter, {
      items: pageItems,
      offset: pageOffset,
      updateBaseline: pageUpdateBaseline,
      hasMore: pageHasMore,
      updatedAt: Date.now(),
    })
    return
  }

  const existingIds = new Set(existing.items.map(moment => moment.id))
  const overlapsCache = pageItems.some(moment => existingIds.has(moment.id))
  // 顶部刷新若尚未追上旧缓存，保留旧段，后续按每批 100 条继续寻找衔接点。
  if (reset && !overlapsCache) {
    saveMomentsCache(filter, {
      items: pageItems,
      offset: pageOffset,
      updateBaseline: pageUpdateBaseline,
      hasMore: pageHasMore,
      updatedAt: Date.now(),
      continuation: {
        items: existing.items,
        offset: existing.offset,
        updateBaseline: existing.updateBaseline,
        hasMore: existing.hasMore,
      },
    })
    return
  }

  const continuationIds = new Set(existing.continuation?.items.map(moment => moment.id) || [])
  const reachesContinuation = pageItems.some(moment => continuationIds.has(moment.id))
  if (reachesContinuation && existing.continuation) {
    saveMomentsCache(filter, {
      items: mergeCachedMoments(existing.items, mergeCachedMoments(pageItems, existing.continuation.items))
        .sort((a, b) => b.publishedAt - a.publishedAt),
      offset: existing.continuation.offset,
      updateBaseline: existing.continuation.updateBaseline,
      hasMore: existing.continuation.hasMore,
      updatedAt: Date.now(),
    })
    return
  }

  const existingOldest = Math.min(...existing.items.map(moment => moment.publishedAt || Infinity))
  const pageOldest = Math.min(...pageItems.map(moment => moment.publishedAt || Infinity))
  const extendsCachedTail = pageOldest < existingOldest
  const items = mergeCachedMoments(
    reset ? pageItems : existing.items,
    reset ? existing.items : pageItems,
  )
    .sort((a, b) => b.publishedAt - a.publishedAt)
  saveMomentsCache(filter, {
    items,
    offset: extendsCachedTail ? pageOffset : existing.offset,
    updateBaseline: extendsCachedTail ? pageUpdateBaseline : existing.updateBaseline,
    hasMore: extendsCachedTail ? pageHasMore : existing.hasMore,
    updatedAt: Date.now(),
    continuation: existing.continuation,
  })
}

function loadMoreWantedMoments() {
  void loadMoments(false, 0, true)
}

function loadMoreFilteredMoments() {
  void loadMoments(false, 0, true)
}

const blockedMomentKeywords = computed(() => Array.from(new Set(
  settings.value.momentsBlockedKeywords
    .split(/[\n,，;；]+/)
    .map(keyword => keyword.trim().toLowerCase())
    .filter(Boolean),
)))

function matchesBlockedMomentKeyword(moment: DisplayMoment) {
  if (!settings.value.momentsEnableKeywordFilter || !blockedMomentKeywords.value.length)
    return false

  const searchableText = [
    moment.author.name,
    moment.title,
    moment.text,
    ...moment.richText.map(segment => segment.text),
    moment.additional?.title,
    moment.additional?.desc,
    moment.forward?.author,
    moment.forward?.title,
    moment.forward?.text,
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .toLowerCase()

  return blockedMomentKeywords.value.some(keyword => searchableText.includes(keyword))
}

/** 想看分组和任一动态过滤都只允许通过按钮继续分页。 */
function hasActiveMomentFilters() {
  return settings.value.momentsFilterUpRecommendation
    || settings.value.momentsHideChargeExclusive
    || settings.value.momentsHideVideoReservation
    || settings.value.momentsHideLiveReservation
    || settings.value.momentsHideLiveDynamics
    || settings.value.momentsHideVideoDynamics
    || settings.value.momentsHideDrawDynamics
    || settings.value.momentsHideUgcSeasonDynamics
    || settings.value.momentsHideForwardDynamics
    || settings.value.momentsHidePgcDynamics
    || settings.value.momentsHideArticleDynamics
    || (settings.value.momentsEnableKeywordFilter && blockedMomentKeywords.value.length > 0)
}

/** 过滤后保留率不超过该值、且累计扫描达到该条数时，才改为按钮分页 */
const FILTER_MANUAL_PAGING_KEEP_RATIO = 0.5
const FILTER_MANUAL_PAGING_MIN_RAW = 100
const filterScanRawCount = ref(0)
const filterScanKeptCount = ref(0)

function requiresManualMomentPaging() {
  if (filterScanRawCount.value < FILTER_MANUAL_PAGING_MIN_RAW)
    return false
  return filterScanKeptCount.value / filterScanRawCount.value <= FILTER_MANUAL_PAGING_KEEP_RATIO
}

function passesMomentSettings(moment: DisplayMoment) {
  if (matchesBlockedMomentKeyword(moment))
    return false
  if (settings.value.momentsFilterUpRecommendation && moment.isUpRecommendation)
    return false
  if (settings.value.momentsHideChargeExclusive && moment.isChargeExclusive)
    return false
  if (settings.value.momentsHideVideoReservation && moment.isVideoReservation)
    return false
  if (settings.value.momentsHideLiveReservation && moment.isLiveReservation)
    return false
  if (settings.value.momentsHideLiveDynamics && moment.isLive)
    return false
  // 番剧单独过滤；视频过滤不含 PGC
  if (settings.value.momentsHideVideoDynamics && moment.isRegularVideo && !moment.isPgc)
    return false
  if (settings.value.momentsHideDrawDynamics && moment.isDraw)
    return false
  if (settings.value.momentsHideUgcSeasonDynamics && moment.isUgcSeason)
    return false
  if (settings.value.momentsHideForwardDynamics && moment.isForward)
    return false
  if (settings.value.momentsHidePgcDynamics && moment.isPgc && !moment.isForward)
    return false
  if (settings.value.momentsHideArticleDynamics && moment.isArticle && !moment.isForward)
    return false
  return true
}

function getCardHeight(moment: DisplayMoment) {
  return cardHeights[moment.id] || estimateCardHeight(moment)
}

function getColumnStackHeight(column: DisplayMoment[]) {
  if (!column.length)
    return 0
  return column.reduce((sum, moment, index) => {
    return sum + getCardHeight(moment) + (index > 0 ? GRID_GAP : 0)
  }, 0)
}

function findShortestColumnIndex(columns: DisplayMoment[][], heights?: number[]) {
  let minIdx = 0
  let minHeight = Infinity
  for (let i = 0; i < columns.length; i++) {
    const height = heights ? heights[i] : getColumnStackHeight(columns[i])
    if (height < minHeight) {
      minHeight = height
      minIdx = i
    }
  }
  return minIdx
}

/**
 * 对各列底部做有限次数的跨列补位。
 * 仅从每列靠后的卡片中选择，并且只有能明确缩小列高差时才移动。
 */
function balanceColumnBottoms(columns: DisplayMoment[][]) {
  const next = columns.map(column => [...column])
  if (next.length < 2)
    return { columns: next, changed: false }

  const sourceOrder = new Map(moments.value.map((moment, index) => [moment.id, index]))
  let changed = false
  const maxMoves = Math.min(moments.value.length, 24)

  for (let moveCount = 0; moveCount < maxMoves; moveCount++) {
    const heights = next.map(column => getColumnStackHeight(column))
    const currentSpread = Math.max(...heights) - Math.min(...heights)
    let bestMove: { sourceIndex: number, targetIndex: number, itemIndex: number, spread: number } | null = null

    next.forEach((source, sourceIndex) => {
      if (source.length <= 1)
        return

      // 只调整列尾附近的卡片，避免破坏上方已经阅读过的瀑布流
      const firstCandidateIndex = Math.max(0, source.length - 4)
      for (let itemIndex = firstCandidateIndex; itemIndex < source.length; itemIndex++) {
        const itemHeight = getCardHeight(source[itemIndex])
        next.forEach((target, targetIndex) => {
          if (targetIndex === sourceIndex)
            return

          const candidateHeights = [...heights]
          candidateHeights[sourceIndex] -= itemHeight + GRID_GAP
          candidateHeights[targetIndex] += itemHeight + (target.length ? GRID_GAP : 0)
          const spread = Math.max(...candidateHeights) - Math.min(...candidateHeights)
          if (spread >= currentSpread - 4 || (bestMove && spread >= bestMove.spread))
            return

          bestMove = { sourceIndex, targetIndex, itemIndex, spread }
        })
      }
    })

    if (!bestMove)
      break

    const { sourceIndex, targetIndex, itemIndex } = bestMove
    const [moved] = next[sourceIndex].splice(itemIndex, 1)
    next[targetIndex].push(moved)
    next[targetIndex].sort((a, b) => (sourceOrder.get(a.id) ?? 0) - (sourceOrder.get(b.id) ?? 0))
    changed = true
  }

  return { columns: next, changed }
}

/** 按最短列排布，尽量让各列底部相对平齐 */
function redistributeColumns() {
  const count = Math.max(1, gridColumnCount.value)
  const next = Array.from({ length: count }, () => [] as DisplayMoment[])
  const heights = Array.from({ length: count }, () => 0)

  moments.value.forEach((item) => {
    const columnIndex = findShortestColumnIndex(next, heights)
    next[columnIndex].push(item)
    heights[columnIndex] += (heights[columnIndex] > 0 ? GRID_GAP : 0) + getCardHeight(item)
  })

  momentColumns.value = balanceColumnBottoms(next).columns
  updateVirtualColumns()
}

/** 列宽是上限。设置要求显示左右栏时，先给侧栏留位，再把卡片从上限往下缩。 */
function updateGridColumnCount() {
  const layoutWidth = layoutRef.value?.clientWidth || Math.max(CARD_MAX_WIDTH_BY_COLUMNS[1], window.innerWidth - 220)
  const preferredColumns = Math.min(2, Math.max(1, Number(settings.value.momentsGridColumns) === 1 ? 1 : 2))
  const wantLeft = settings.value.momentsSidebarShowUserCard
    || settings.value.momentsSidebarShowPublish
    || settings.value.momentsSidebarShowLive
  const wantRight = settings.value.momentsSidebarShowHotSearch

  function tryLayout(cols: number, left: boolean, right: boolean) {
    const reserve = (left ? SIDEBAR_WIDTH + LAYOUT_GAP : 0) + (right ? SIDEBAR_WIDTH + LAYOUT_GAP : 0)
    const budget = layoutWidth - reserve
    if (budget < CARD_COMPACT_MIN_WIDTH)
      return null
    const availableCardWidth = Math.floor((budget - GRID_GAP * (cols - 1)) / cols)
    if (availableCardWidth < CARD_COMPACT_MIN_WIDTH)
      return null
    const cardMaxWidth = CARD_MAX_WIDTH_BY_COLUMNS[cols as 1 | 2]
    return {
      cols,
      cardWidth: Math.min(cardMaxWidth, availableCardWidth),
      left,
      right,
    }
  }

  let result = tryLayout(preferredColumns, wantLeft, wantRight)
  if (!result) {
    for (let cols = preferredColumns - 1; cols >= 1 && !result; cols--)
      result = tryLayout(cols, wantLeft, wantRight)
  }
  if (!result && wantRight) {
    for (let cols = preferredColumns; cols >= 1 && !result; cols--)
      result = tryLayout(cols, wantLeft, false)
  }
  if (!result && wantLeft) {
    for (let cols = preferredColumns; cols >= 1 && !result; cols--)
      result = tryLayout(cols, false, false)
  }
  if (!result) {
    for (let cols = preferredColumns; cols >= 1 && !result; cols--)
      result = tryLayout(cols, false, false)
  }

  const nextCols = result?.cols ?? 1
  const nextCardWidth = result?.cardWidth ?? CARD_COMPACT_MIN_WIDTH
  showMomentsSidebar.value = Boolean(result?.left)
  showMomentsRightbar.value = Boolean(result?.right)

  const colsChanged = nextCols !== gridColumnCount.value
  const widthChanged = nextCardWidth !== gridCardWidth.value
  const needInitColumns = momentColumns.value.length !== nextCols

  gridColumnCount.value = nextCols
  gridCardWidth.value = nextCardWidth

  if (colsChanged || needInitColumns)
    redistributeColumns()
  else if (widthChanged)
    updateVirtualColumns()
}

function appendMoments(items: DisplayMoment[]) {
  const wasEmpty = moments.value.length === 0
  if (!momentColumns.value.length)
    momentColumns.value = Array.from({ length: Math.max(1, gridColumnCount.value) }, () => [])

  const existingIds = new Set(moments.value.map(moment => moment.id))
  const columnHeights = momentColumns.value.map(column => getColumnStackHeight(column))

  items.forEach((item) => {
    if (existingIds.has(item.id))
      return

    const columnIndex = findShortestColumnIndex(momentColumns.value, columnHeights)
    moments.value.push(item)
    momentColumns.value[columnIndex].push(item)
    columnHeights[columnIndex] += (columnHeights[columnIndex] > 0 ? GRID_GAP : 0) + getCardHeight(item)
    existingIds.add(item.id)
  })
  // 初始布局可整体平衡；分页只追加，不能搬动用户正在查看的旧卡片
  if (wasEmpty)
    momentColumns.value = balanceColumnBottoms(momentColumns.value).columns
  updateVirtualColumns()
  scheduleBottomRebalance()
}

const momentsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${Math.max(1, gridColumnCount.value)}, ${gridCardWidth.value}px)`,
  justifyContent: 'center',
  gap: `${GRID_GAP}px`,
  width: '100%',
}))

const momentsContentStyle = computed(() => ({
  width: `${Math.max(1, gridColumnCount.value) * gridCardWidth.value + Math.max(0, gridColumnCount.value - 1) * GRID_GAP}px`,
}))

function scheduleBottomRebalance() {
  // 滚动过程中不重排，避免瀑布流突然上下跳动
  if (rebalanceTimer)
    clearTimeout(rebalanceTimer)
  rebalanceTimer = setTimeout(() => {
    rebalanceTimer = null
    if (Date.now() < suppressBottomRebalanceUntil)
      return
    if (Date.now() - lastScrollAt < 480) {
      scheduleBottomRebalance()
      return
    }
    if (momentColumns.value.length < 2 || moments.value.length < 2)
      return
    const viewport = scrollViewportRef.value
    if (viewport) {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      // 分页加载区不再缩短最高列，避免最大 scrollTop 变化把滚动位置向上夹回
      if (distanceFromBottom < viewport.clientHeight * 1.25)
        return
    }
    const heights = momentColumns.value.map(column => getColumnStackHeight(column))
    const maxH = Math.max(...heights)
    const minH = Math.min(...heights)
    // 空闲时对列尾做小范围补位，让追加数据后的底边也保持相对平整
    if (maxH - minH <= Math.max(120, gridCardWidth.value * 0.45))
      return
    const balanced = balanceColumnBottoms(momentColumns.value)
    if (balanced.changed) {
      momentColumns.value = balanced.columns
      updateVirtualColumns()
    }
  }, 720)
}

/** 提交卡片高度；瀑布流各列独立变化，不修正全局 scrollTop */
function commitCardHeight(id: string, next: number, options?: { force?: boolean }) {
  if (next <= 0)
    return false
  const prev = cardHeights[id] || 0
  const threshold = options?.force ? 1 : (settledHeights.has(id) ? 10 : 4)
  if (prev > 0 && Math.abs(prev - next) < threshold)
    return false

  cardHeights[id] = next
  // 连续两次接近的高度视为稳定，后续忽略小幅 Resize 抖动
  if (prev > 0 && Math.abs(next - prev) < 24)
    settledHeights.add(id)
  else if (prev > 0 && settledHeights.has(id) && Math.abs(next - prev) < 48)
    settledHeights.add(id)

  return true
}

function scheduleVirtualUpdate() {
  if (virtualRaf)
    return
  virtualRaf = window.requestAnimationFrame(() => {
    virtualRaf = 0
    updateVirtualColumns()
    maybeLoadMoreNearBottom()
  })
}

/** 全局触底哨兵的本地兜底：滚动到最后一屏附近时直接请求下一页。 */
function maybeLoadMoreNearBottom() {
  const viewport = scrollViewportRef.value
  if (
    !viewport
    || !hasFeedScrollSinceReset
    || isInitialLoading.value
    || isLoading.value
    || noMoreContent.value
    || !moments.value.length
    || requiresManualMomentPaging()
  ) {
    return
  }

  const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
  const threshold = Math.max(LOAD_MORE_AHEAD_PX, viewport.clientHeight * 0.6)
  if (distanceFromBottom <= threshold)
    void loadMoments()
}

function getGridOffsetTop() {
  const grid = gridRef.value
  const viewport = scrollViewportRef.value
  if (!grid || !viewport)
    return 0

  const gridRect = grid.getBoundingClientRect()
  const viewportRect = viewport.getBoundingClientRect()
  return gridRect.top - viewportRect.top + viewport.scrollTop
}

function updateVirtualColumns() {
  if (!momentColumns.value.length) {
    virtualColumns.value = []
    return
  }

  const viewport = scrollViewportRef.value
  const scrollTop = viewport?.scrollTop ?? 0
  const viewportHeight = viewport?.clientHeight ?? window.innerHeight
  const gridOffsetTop = getGridOffsetTop()
  const viewStart = scrollTop - OVERSCAN_PX
  const viewEnd = scrollTop + viewportHeight + OVERSCAN_PX
  const gap = GRID_GAP

  virtualColumns.value = momentColumns.value.map((column) => {
    let y = 0
    let topPad = 0
    let bottomPad = 0
    const items: DisplayMoment[] = []

    column.forEach((moment) => {
      const height = getCardHeight(moment)
      const start = gridOffsetTop + y
      const end = start + height
      if (end < viewStart) {
        topPad += height + gap
      }
      else if (start > viewEnd) {
        bottomPad += height + gap
      }
      else {
        items.push(moment)
      }
      y += height + gap
    })

    // 最后一项不需要 gap，修正 padding 里多加的 gap 边界误差可忽略
    return { topPad, bottomPad, items }
  })

  prunePreviewCache()
}

function prunePreviewCache() {
  const keys = Object.keys(previewUrls)
  if (keys.length <= MAX_PREVIEW_CACHE)
    return

  keys.forEach((id) => {
    if (id === hoveredMediaId.value)
      return
    if (visibleMomentIds.has(id))
      return
    delete previewUrls[id]
  })

  // 仍过多时淘汰更早的非悬停项
  const remain = Object.keys(previewUrls).filter(id => id !== hoveredMediaId.value)
  if (remain.length > MAX_PREVIEW_CACHE) {
    remain.slice(0, remain.length - MAX_PREVIEW_CACHE).forEach((id) => {
      delete previewUrls[id]
    })
  }
}

/** 卡片仅在第一次完成测量时播放入场动画，虚拟列表重新挂载不重复播放 */
function markCardReady(id: string) {
  readyCardIds.add(id)
  if (revealedCardIds.has(id))
    return

  revealedCardIds.add(id)
  enteringCardIds.add(id)
  const previousTimer = cardEnterTimers.get(id)
  if (previousTimer)
    clearTimeout(previousTimer)
  cardEnterTimers.set(id, setTimeout(() => {
    enteringCardIds.delete(id)
    cardEnterTimers.delete(id)
  }, 240))
}

function fitVideoCardDescription(card: HTMLElement) {
  const body = card.querySelector<HTMLElement>('.moment-card__main--video:not(.moment-card__main--live) .moment-card__body')
  const description = body?.querySelector<HTMLElement>('.moment-card__desc')
  if (!body || !description)
    return

  // 先解除上一次测量得到的限制，让纵向卡片也能按当前宽高重新展开。
  body.style.removeProperty('--moment-card-description-lines')

  const bodyStyle = getComputedStyle(body)
  const title = body.querySelector<HTMLElement>('.moment-card__title')
  const titleStyle = title ? getComputedStyle(title) : undefined
  const occupiedHeight = title
    ? title.getBoundingClientRect().height
    + Number.parseFloat(titleStyle?.marginTop || '0')
    + Number.parseFloat(titleStyle?.marginBottom || '0')
    : 0
  const availableHeight = body.clientHeight
    - Number.parseFloat(bodyStyle.paddingTop)
    - Number.parseFloat(bodyStyle.paddingBottom)
    - occupiedHeight
  const lineHeight = Number.parseFloat(getComputedStyle(description).lineHeight)

  if (!Number.isFinite(lineHeight) || lineHeight <= 0)
    return

  const visibleLines = Math.max(1, Math.floor((availableHeight + 0.5) / lineHeight))
  body.style.setProperty('--moment-card-description-lines', String(visibleLines))
}

function bindCardEl(el: Element | null, moment: DisplayMoment) {
  const previous = cardElements.get(moment.id)
  if (!(el instanceof HTMLElement)) {
    if (previous) {
      cardMeasureObserver?.unobserve(previous)
      visibilityObserver?.unobserve(previous)
      cardElements.delete(moment.id)
    }
    visibleMomentIds.delete(moment.id)
    if (hoveredMediaId.value === moment.id) {
      hoveredMediaId.value = ''
      cleanupLivePreviewPlayer()
    }
    if (previewUrls[moment.id])
      delete previewUrls[moment.id]
    return
  }

  if (previous && previous !== el) {
    cardMeasureObserver?.unobserve(previous)
    visibilityObserver?.unobserve(previous)
  }

  cardElements.set(moment.id, el)
  cardMeasureObserver?.observe(el)
  visibilityObserver?.observe(el)
  el.dataset.momentId = moment.id
  fitVideoCardDescription(el)

  // 初次挂载写入实测高度（带阈值，避免反复抖）
  const measured = Math.round(el.getBoundingClientRect().height)
  if (measured > 0) {
    commitCardHeight(moment.id, measured)
    requestAnimationFrame(() => {
      if (cardElements.get(moment.id) === el) {
        fitVideoCardDescription(el)
        markCardReady(moment.id)
      }
    })
  }
  else if (!cardHeights[moment.id]) {
    cardHeights[moment.id] = estimateCardHeight(moment)
  }
}

function setupVirtualObservers() {
  cardMeasureObserver?.disconnect()
  visibilityObserver?.disconnect()

  cardMeasureObserver = new ResizeObserver((entries) => {
    let changed = false
    entries.forEach((entry) => {
      const card = entry.target as HTMLElement
      const id = card.dataset.momentId
      if (!id)
        return
      fitVideoCardDescription(card)
      const next = Math.round(entry.contentRect.height)
      if (commitCardHeight(id, next))
        changed = true
      if (next > 0)
        markCardReady(id)
    })
    if (changed) {
      scheduleVirtualUpdate()
      // 测量变化不再立刻重排整列，避免抖动；仅空闲且列差极大时才 rebalance
      scheduleBottomRebalance()
    }
  })

  visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const id = (entry.target as HTMLElement).dataset.momentId
      if (!id)
        return
      if (entry.isIntersecting)
        visibleMomentIds.add(id)
      else
        visibleMomentIds.delete(id)

      // 离开视口时释放该卡预览资源
      if (!entry.isIntersecting && hoveredMediaId.value !== id && previewUrls[id])
        delete previewUrls[id]
    })
    prunePreviewCache()
  }, {
    root: scrollViewportRef.value,
    rootMargin: '200px 0px',
    threshold: 0.01,
  })

  // 观察器重建后重新绑定当前虚拟窗口内的卡片
  cardElements.forEach((el) => {
    cardMeasureObserver?.observe(el)
    visibilityObserver?.observe(el)
  })
}

function handleViewportScroll() {
  hasFeedScrollSinceReset = true
  lastScrollAt = Date.now()
  scheduleVirtualUpdate()
}

function attachViewportScroll() {
  const viewport = scrollViewportRef.value
  if (!viewport || scrollListenerAttached)
    return
  viewport.addEventListener('scroll', handleViewportScroll, { passive: true })
  scrollListenerAttached = true
}

function detachViewportScroll() {
  const viewport = scrollViewportRef.value
  if (viewport && scrollListenerAttached)
    viewport.removeEventListener('scroll', handleViewportScroll)
  scrollListenerAttached = false
}

function handleCoverLoad(event: Event, momentId: string) {
  const img = event.target as HTMLImageElement
  if (!img.naturalWidth || !img.naturalHeight)
    return

  readyCoverIds.add(momentId)
  const ratio = getSafeImageRatio(img.naturalWidth, img.naturalHeight)
  if (!ratio)
    return
  const moment = moments.value.find(item => item.id === momentId)
  const prevRatio = coverRatios[momentId]
  coverRatios[momentId] = ratio

  // 封面比例变化会改估算高度；若尚未实测稳定，用估算高度更新并补偿滚动
  if (!settledHeights.has(momentId) && (!prevRatio || Math.abs(prevRatio - ratio) > 0.01)) {
    if (moment && !cardHeights[momentId]) {
      commitCardHeight(momentId, estimateCardHeight(moment), { force: true })
      scheduleVirtualUpdate()
    }
  }
}

async function prepareMomentCovers(items: DisplayMoment[], requestToken: number) {
  const imageItems = items.filter(item => item.images[0] || item.forward?.images?.[0])
  await Promise.all(imageItems.map(item => new Promise<void>((resolve) => {
    const image = new Image()
    let finished = false
    let timeout = 0
    const finish = () => {
      if (finished)
        return
      finished = true
      clearTimeout(timeout)
      image.onload = null
      image.onerror = null
      resolve()
    }
    timeout = window.setTimeout(finish, 5000)
    image.decoding = 'async'
    image.onload = async () => {
      if (requestToken === feedRequestToken && image.naturalWidth && image.naturalHeight) {
        const ratio = getSafeImageRatio(image.naturalWidth, image.naturalHeight)
        if (ratio)
          coverRatios[item.id] = ratio
      }
      try {
        await image.decode()
      }
      catch {
        // 浏览器已完成加载但不支持显式解码时继续
      }
      if (requestToken === feedRequestToken)
        readyCoverIds.add(item.id)
      finish()
    }
    image.onerror = finish
    const coverUrl = item.images[0] || item.forward?.images?.[0] || ''
    const isSingleStillImage = (
      item.images.length === 1
      && !item.isVideo
      && !item.isLive
    ) || (
      !item.images.length
      && item.forward?.images?.length === 1
    )
    image.src = isSingleStillImage
      ? getMomentOriginalImageUrl(coverUrl)
      : getMomentThumbnailUrl(coverUrl)
  })))
}

function cleanupLivePreviewPlayer() {
  if (liveHlsPlayer) {
    liveHlsPlayer.destroy()
    liveHlsPlayer = null
  }
  if (liveFlvPlayer) {
    try {
      liveFlvPlayer.pause()
      liveFlvPlayer.unload()
      liveFlvPlayer.detachMediaElement()
      liveFlvPlayer.destroy()
    }
    catch {
      // 预览销毁失败可忽略
    }
    liveFlvPlayer = null
  }
}

async function setupStreamPreview(url: string, videoEl: HTMLVideoElement) {
  cleanupLivePreviewPlayer()
  videoEl.removeAttribute('src')
  videoEl.load()

  if (url.includes('.flv')) {
    try {
      const flvjsModule = await import('flv.js')
      const flvjs = flvjsModule.default
      if (!flvjs.isSupported() || hoveredMediaId.value === '')
        return

      liveFlvPlayer = flvjs.createPlayer({
        type: 'flv',
        url,
        isLive: true,
      }, {
        enableWorker: false,
        enableStashBuffer: false,
        stashInitialSize: 128,
        lazyLoad: false,
      })
      liveFlvPlayer.attachMediaElement(videoEl)
      liveFlvPlayer.load()
      void videoEl.play().catch(() => {})
    }
    catch {
      // 直播预览失败时保留封面
    }
    return
  }

  if (url.includes('m3u8')) {
    try {
      const Hls = (await import('hls.js')).default
      if (Hls.isSupported()) {
        liveHlsPlayer = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 10,
        })
        liveHlsPlayer.loadSource(url)
        liveHlsPlayer.attachMedia(videoEl)
        liveHlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
          void videoEl.play().catch(() => {})
        })
        return
      }
      if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url
        void videoEl.play().catch(() => {})
      }
    }
    catch {
      // 直播预览失败时保留封面
    }
    return
  }

  videoEl.src = url
  void videoEl.play().catch(() => {})
}

function isMomentPreviewEnabled(moment: DisplayMoment) {
  if (moment.isLive)
    return settings.value.momentsEnableLivePreview
  if (moment.isVideo)
    return settings.value.momentsEnableVideoPreview
  return false
}

function cacheVideoCid(bvid: string, cid: number) {
  videoCidCache.delete(bvid)
  videoCidCache.set(bvid, cid)
  while (videoCidCache.size > MAX_VIDEO_CID_CACHE) {
    const oldestBvid = videoCidCache.keys().next().value
    if (!oldestBvid)
      break
    videoCidCache.delete(oldestBvid)
  }
}

function cacheVideoAspectRatio(bvid: string, dimension: any) {
  const ratio = getDimensionAspectRatio(dimension)
  if (ratio)
    videoAspectRatios[bvid] = ratio
  return ratio
}

function loadVideoAspectRatio(bvid: string) {
  if (videoAspectRatios[bvid])
    return Promise.resolve(videoAspectRatios[bvid])

  const pendingRequest = videoAspectRatioRequests.get(bvid)
  if (pendingRequest)
    return pendingRequest

  const request = api.video.getVideoInfo({ bvid })
    .then((response) => {
      if (response.code !== 0)
        return undefined
      return cacheVideoAspectRatio(
        bvid,
        response.data?.dimension || response.data?.pages?.[0]?.dimension,
      )
    })
    .catch(() => undefined)
    .finally(() => videoAspectRatioRequests.delete(bvid))
  videoAspectRatioRequests.set(bvid, request)
  return request
}

async function getVideoCid(bvid: string) {
  const cachedCid = videoCidCache.get(bvid)
  if (cachedCid) {
    cacheVideoCid(bvid, cachedCid)
    return cachedCid
  }

  const pendingRequest = videoCidRequests.get(bvid)
  if (pendingRequest)
    return pendingRequest

  const request = api.video.getVideoPageList({ bvid })
    .then((response) => {
      if (response.code === 0)
        cacheVideoAspectRatio(bvid, response.data?.[0]?.dimension)
      const cid = Number(response.code === 0 ? response.data?.[0]?.cid : 0)
      if (!cid)
        return undefined
      cacheVideoCid(bvid, cid)
      return cid
    })
    .catch(() => undefined)
    .finally(() => videoCidRequests.delete(bvid))
  videoCidRequests.set(bvid, request)
  return request
}

async function handleMediaEnter(moment: DisplayMoment) {
  if (!isMomentPreviewEnabled(moment))
    return

  hoveredMediaId.value = moment.id

  if (previewUrls[moment.id])
    return

  try {
    if (moment.isLive && moment.roomId) {
      const res = await api.live.getLivePlayUrl({
        cid: moment.roomId,
        platform: 'web',
        qn: 80,
      })
      if (hoveredMediaId.value !== moment.id || !isMomentPreviewEnabled(moment))
        return
      if (res.code === 0 && res.data?.durl?.[0]?.url)
        previewUrls[moment.id] = httpsUrl(res.data.durl[0].url)
      return
    }

    if (!moment.isVideo || !moment.bvid)
      return

    const cid = await getVideoCid(moment.bvid)
    if (!cid || hoveredMediaId.value !== moment.id || !isMomentPreviewEnabled(moment))
      return

    const preview = await api.video.getVideoPreview({ bvid: moment.bvid, cid })
    if (
      preview.code === 0
      && preview.data?.durl?.[0]?.url
      && hoveredMediaId.value === moment.id
      && isMomentPreviewEnabled(moment)
    ) {
      previewUrls[moment.id] = httpsUrl(preview.data.durl[0].url)
    }
  }
  catch {
    // 预览加载失败时保留封面
  }
}

function handleMediaLeave(moment: DisplayMoment) {
  if (hoveredMediaId.value !== moment.id)
    return
  hoveredMediaId.value = ''
  cleanupLivePreviewPlayer()
  // 悬停结束即释放预览地址，避免缓存堆积
  if (previewUrls[moment.id])
    delete previewUrls[moment.id]
}

function openClassifiedLink(url: string, kind: MomentLinkKind, video?: DisplayForwardVideo) {
  if (!url)
    return

  if (kind === 'video' && video)
    recordVideoVisit(video)

  const mode = resolveLinkOpenMode(kind)
  if (mode === 'dialog' && kind !== 'other') {
    openMomentDetail(createLinkMoment(url, kind, video))
    return
  }

  hoveredMediaId.value = ''
  cleanupLivePreviewPlayer()
  if (mode === 'background')
    void openLinkInBackground(url)
  else if (mode === 'currentTab')
    window.open(url, '_top')
  else
    window.open(url, '_blank', 'noopener,noreferrer')
}

function handleOpenLink(payload: { url: string, kind: MomentLinkKind, video?: DisplayForwardVideo }) {
  openClassifiedLink(payload.url, payload.kind || classifyMomentLink(payload.url), payload.video)
}

function bindPreviewVideo(el: Element | null, moment: DisplayMoment) {
  if (!(el instanceof HTMLVideoElement))
    return
  const url = previewUrls[moment.id]
  if (!url || hoveredMediaId.value !== moment.id)
    return

  if (moment.isLive || url.includes('.flv') || url.includes('m3u8'))
    void setupStreamPreview(url, el)
  else
    void el.play().catch(() => {})
}

function playPreview(event: Event) {
  const video = event.target as HTMLVideoElement
  void video.play().catch(() => {})
}

async function toggleMomentLike(moment: DisplayMoment) {
  if (likingMomentIds.has(moment.id) || moment.isLikeDisabled)
    return

  const previousLiked = moment.isLiked
  const previousCount = moment.likeCount
  const csrf = getCSRF()
  if (!csrf) {
    toast.warning(t('moments.login_to_like'))
    return
  }

  moment.isLiked = !previousLiked
  moment.likeCount = Math.max(0, previousCount + (moment.isLiked ? 1 : -1))
  likingMomentIds.add(moment.id)

  try {
    const response = await api.moment.setMomentLike({
      dyn_id_str: moment.id,
      up: moment.isLiked ? 1 : 2,
      spmid: '333.1369.0.0',
      from_spmid: '333.999.0.0',
      csrf,
    })
    if (response.code !== 0)
      throw new Error(response.message || t('moments.like_failed'))
  }
  catch (error) {
    // 请求失败时恢复接口返回前的状态，避免界面与服务端不一致
    moment.isLiked = previousLiked
    moment.likeCount = previousCount
    toast.error(error instanceof Error ? error.message : t('moments.like_failed_retry'))
  }
  finally {
    likingMomentIds.delete(moment.id)
  }
}

async function toggleMomentReservation(moment: DisplayMoment) {
  const additional = moment.additional
  const reservationId = additional?.reservationId
  if (!additional || !reservationId || reservationLoadingMomentIds.has(moment.id))
    return

  const csrf = getCSRF()
  if (!csrf) {
    toast.warning(t('moments.login_to_reserve'))
    return
  }

  const wasReserved = Boolean(additional.isReserved)
  reservationLoadingMomentIds.add(moment.id)

  try {
    const response = wasReserved
      ? await api.moment.cancelMomentReservation({ sid: reservationId, csrf })
      : await api.moment.reserveMoment({ sid: reservationId, csrf })
    if (response.code !== 0)
      throw new Error(response.message || (wasReserved ? t('moments.cancel_reserve_failed') : t('moments.reserve_failed')))

    additional.isReserved = !wasReserved
    if (typeof additional.reservationTotal === 'number') {
      additional.reservationTotal = Math.max(
        0,
        additional.reservationTotal + (additional.isReserved ? 1 : -1),
      )
    }
    toast.success(additional.isReserved ? t('moments.reserve_succeeded') : t('moments.reserve_cancelled'))
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('moments.reserve_operation_failed'))
  }
  finally {
    reservationLoadingMomentIds.delete(moment.id)
  }
}

function isWatchLaterAdded(target: WatchLaterTarget) {
  const stateKey = getWatchLaterStateKey(target)
  return Boolean(stateKey && watchLaterMomentIds.has(stateKey))
}

function isWatchLaterLoading(target: WatchLaterTarget) {
  const stateKey = getWatchLaterStateKey(target)
  return Boolean(stateKey && watchLaterLoadingMomentIds.has(stateKey))
}

async function toggleMomentWatchLater(target: WatchLaterTarget) {
  const stateKey = getWatchLaterStateKey(target)
  if (!stateKey || watchLaterLoadingMomentIds.has(stateKey))
    return

  const csrf = getCSRF()
  if (!csrf) {
    toast.warning(t('moments.login_to_watch_later'))
    return
  }

  watchLaterLoadingMomentIds.add(stateKey)
  try {
    let aid = Number(target.aid || 0)
    let bvid = target.bvid
    if (!aid && !bvid && target.epid) {
      const ids = await resolvePgcEpisodeVideoIds(target.epid)
      aid = ids?.aid || 0
      bvid = ids?.bvid
    }

    if (!aid && !bvid) {
      toast.error(t('moments.watch_later_info_failed'))
      return
    }

    const isAdded = watchLaterMomentIds.has(stateKey)
    const response = isAdded
      ? await api.watchlater.removeFromWatchLater({ aid, csrf })
      : await api.watchlater.saveToWatchLater({ aid: aid || undefined, bvid, csrf })

    if (response.code !== 0) {
      toast.error(response.message)
      return
    }

    if (isAdded)
      watchLaterMomentIds.delete(stateKey)
    else
      watchLaterMomentIds.add(stateKey)
    void topBarStore.syncWatchLaterState()
  }
  catch (error) {
    console.error('切换稍后再看状态失败:', error)
    toast.error(error instanceof Error ? error.message : t('moments.watch_later_operation_failed'))
  }
  finally {
    watchLaterLoadingMomentIds.delete(stateKey)
  }
}

async function loadMoments(reset = false, autoFillDepth = 0, manualPaging = false) {
  // “想看”或低保留率类型过滤开启时只允许按钮触发后续批次，避免滚动自动连刷。
  if (!reset && requiresManualMomentPaging() && !manualPaging)
    return
  if ((!reset && isLoading.value) || (!reset && noMoreContent.value))
    return

  if (reset) {
    feedRequestToken += 1
    moments.value = []
    momentColumns.value = []
    virtualColumns.value = []
    Object.keys(cardHeights).forEach(key => delete cardHeights[key])
    Object.keys(previewUrls).forEach(key => delete previewUrls[key])
    Object.keys(coverRatios).forEach(key => delete coverRatios[key])
    readyCoverIds.clear()
    readyCardIds.clear()
    enteringCardIds.clear()
    revealedCardIds.clear()
    cardEnterTimers.forEach(timer => clearTimeout(timer))
    cardEnterTimers.clear()
    settledHeights.clear()
    visibleMomentIds.clear()
    likingMomentIds.clear()
    cleanupLivePreviewPlayer()
    hoveredMediaId.value = ''
    isInitialLoading.value = true
    hasFeedScrollSinceReset = false
    filterScanRawCount.value = 0
    filterScanKeptCount.value = 0
  }
  const requestToken = feedRequestToken
  const requestType = activeMomentFilter.value
  const requestGroup = activeMomentGroup.value
  const requestHostMid = selectedHostMid.value
  let pageApplied = false
  let preservedPaginationScrollTop: number | null = null
  isLoading.value = true
  if (reset) {
    offset.value = ''
    updateBaseline.value = ''
    momentsFeedPage.value = 1
    noMoreContent.value = false
  }

  try {
    let rawItems: DataItem[] = []
    let cachedBatch: DisplayMoment[] | undefined
    let hasMore = false
    let nextOffset = ''
    let nextUpdateBaseline = ''

    if (requestHostMid) {
      // 按 UP 主筛选：走 feed/all + host_mid，不写入全局全部动态缓存
      let nextPage = momentsFeedPage.value
      if (hasActiveMomentFilters()) {
        let scanOffset = offset.value
        let scanUpdateBaseline = updateBaseline.value
        let canContinue = true
        const scanned: DataItem[] = []

        let requestPages = 0
        while (canContinue && requestPages < FILTERED_MAX_REQUEST_PAGES) {
          const response = await api.moment.getMomentsByUp({
            host_mid: requestHostMid,
            type: requestType,
            offset: scanOffset || undefined,
            update_baseline: scanUpdateBaseline || undefined,
            page: nextPage,
            platform: 'web',
            features: MOMENT_FEED_FEATURES,
            web_location: '333.1365',
          }) as MomentResult
          if (
            !isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)
            || response.code !== 0
          ) {
            return
          }

          const pageItems = response.data?.items || []
          scanned.push(...pageItems)
          requestPages += 1
          const responseOffset = response.data?.offset || ''
          scanUpdateBaseline = response.data?.update_baseline || ''
          canContinue = Boolean(response.data?.has_more)
            && pageItems.length > 0
            && responseOffset !== scanOffset
          scanOffset = responseOffset
          nextPage += 1
        }

        rawItems = scanned
        hasMore = canContinue
        nextOffset = scanOffset
        nextUpdateBaseline = scanUpdateBaseline
      }
      else {
        const response = await api.moment.getMomentsByUp({
          host_mid: requestHostMid,
          type: requestType,
          offset: offset.value || undefined,
          update_baseline: updateBaseline.value || undefined,
          page: nextPage,
          platform: 'web',
          features: MOMENT_FEED_FEATURES,
          web_location: '333.1365',
        }) as MomentResult
        if (
          !isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)
          || response.code !== 0
        ) {
          return
        }
        rawItems = response.data?.items || []
        hasMore = Boolean(response.data?.has_more) && rawItems.length > 0
        nextOffset = response.data?.offset || ''
        nextUpdateBaseline = response.data?.update_baseline || ''
        nextPage += 1
      }
      momentsFeedPage.value = nextPage
    }
    else if (requestGroup === 'wanted') {
      await momentsFeedCacheReady
      // 类型过滤开启时，首批缓存刷新与后续填充共用两页请求预算。
      const maxRequestPages = hasActiveMomentFilters() ? FILTERED_MAX_REQUEST_PAGES : Infinity
      let requestPages = 0
      let cacheEntry = getValidMomentsCache(requestType) ?? {
        items: [],
        offset: '',
        updateBaseline: '',
        hasMore: true,
        updatedAt: Date.now(),
      }

      if (!momentsWantedUsers.value.length) {
        wantedCacheCursor.value = 0
        cachedBatch = []
      }
      else {
        let cacheChanged = false
        if (reset) {
          wantedCacheCursor.value = 0
          const existingCache = cacheEntry
          const existingIds = new Set(existingCache.items.map(moment => moment.id))
          const freshItems: DisplayMoment[] = []
          let scanOffset = ''
          let scanUpdateBaseline = ''
          let canContinue = true
          let reachedCache = false

          while (
            canContinue
            && freshItems.length < WANTED_SCAN_LIMIT
            && !reachedCache
            && requestPages < maxRequestPages
          ) {
            const response = await api.moment.getMoments({
              type: requestType,
              offset: scanOffset || undefined,
              update_baseline: scanUpdateBaseline || undefined,
              features: MOMENT_FEED_FEATURES,
            }) as MomentResult
            if (
              !isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)
              || response.code !== 0
            ) {
              return
            }

            const pageItems = (response.data?.items || []).map(mapMoment)
            requestPages += 1
            reachedCache = pageItems.some(moment => existingIds.has(moment.id))
            freshItems.push(...pageItems)
            const responseOffset = response.data?.offset || ''
            scanUpdateBaseline = response.data?.update_baseline || ''
            canContinue = Boolean(response.data?.has_more)
              && pageItems.length > 0
              && responseOffset !== scanOffset
            scanOffset = responseOffset
          }

          cacheEntry = reachedCache
            ? {
                ...existingCache,
                items: mergeCachedMoments(freshItems, existingCache.items),
              }
            : {
                items: mergeCachedMoments(freshItems, []),
                offset: scanOffset,
                updateBaseline: scanUpdateBaseline,
                hasMore: canContinue,
                updatedAt: Date.now(),
                continuation: existingCache.items.length
                  ? {
                      items: existingCache.items,
                      offset: existingCache.offset,
                      updateBaseline: existingCache.updateBaseline,
                      hasMore: existingCache.hasMore,
                    }
                  : undefined,
              }
          cacheChanged = true
        }

        const batchEnd = Math.min(wantedCacheCursor.value + WANTED_SCAN_LIMIT, MOMENTS_CACHE_MAX_ITEMS)
        while (
          cacheEntry.items.length < batchEnd
          && cacheEntry.items.length < MOMENTS_CACHE_MAX_ITEMS
          && cacheEntry.hasMore
          && requestPages < maxRequestPages
        ) {
          const response = await api.moment.getMoments({
            type: requestType,
            offset: cacheEntry.offset || undefined,
            update_baseline: cacheEntry.updateBaseline || undefined,
            features: MOMENT_FEED_FEATURES,
          }) as MomentResult
          if (
            !isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)
            || response.code !== 0
          ) {
            return
          }

          const pageItems = (response.data?.items || []).map(mapMoment)
          requestPages += 1
          const responseOffset = response.data?.offset || ''
          const continuationIds = new Set(cacheEntry.continuation?.items.map(moment => moment.id) || [])
          const reachesContinuation = pageItems.some(moment => continuationIds.has(moment.id))
          if (reachesContinuation && cacheEntry.continuation) {
            cacheEntry = {
              items: mergeCachedMoments(
                cacheEntry.items,
                mergeCachedMoments(pageItems, cacheEntry.continuation.items),
              ),
              offset: cacheEntry.continuation.offset,
              updateBaseline: cacheEntry.continuation.updateBaseline,
              hasMore: cacheEntry.continuation.hasMore,
              updatedAt: Date.now(),
            }
          }
          else {
            cacheEntry = {
              items: mergeCachedMoments(cacheEntry.items, pageItems),
              offset: responseOffset,
              updateBaseline: response.data?.update_baseline || '',
              hasMore: Boolean(response.data?.has_more)
                && pageItems.length > 0
                && responseOffset !== cacheEntry.offset,
              updatedAt: Date.now(),
              continuation: cacheEntry.continuation,
            }
          }
          cacheChanged = true
          if (reachesContinuation)
            break
        }

        if (cacheChanged)
          saveMomentsCache(requestType, cacheEntry)
        // 连续缓存可一次全部展示；存在缺口时仍按 API 原始条数每批推进 100 条。
        const displayEnd = cacheEntry.continuation ? batchEnd : cacheEntry.items.length
        cachedBatch = cacheEntry.items.slice(wantedCacheCursor.value, displayEnd)
        wantedCacheCursor.value += cachedBatch.length
        nextOffset = cacheEntry.offset
        nextUpdateBaseline = cacheEntry.updateBaseline
        hasMore = wantedCacheCursor.value < cacheEntry.items.length
          || Boolean(cacheEntry.continuation)
          || (cacheEntry.hasMore && cacheEntry.items.length < MOMENTS_CACHE_MAX_ITEMS)
      }
    }
    else if (hasActiveMomentFilters()) {
      // 过滤开启：单次最多请求两页原始动态，再交给本地过滤
      let scanOffset = offset.value
      let scanUpdateBaseline = updateBaseline.value
      let canContinue = true
      const scanned: DataItem[] = []
      let requestPages = 0

      while (canContinue && requestPages < FILTERED_MAX_REQUEST_PAGES) {
        const response = await api.moment.getMoments({
          type: requestType,
          offset: scanOffset || undefined,
          update_baseline: scanUpdateBaseline || undefined,
          features: MOMENT_FEED_FEATURES,
        }) as MomentResult
        if (
          !isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)
          || response.code !== 0
        ) {
          return
        }

        const pageItems = response.data?.items || []
        scanned.push(...pageItems)
        requestPages += 1
        const responseOffset = response.data?.offset || ''
        scanUpdateBaseline = response.data?.update_baseline || ''
        canContinue = Boolean(response.data?.has_more)
          && pageItems.length > 0
          && responseOffset !== scanOffset
        scanOffset = responseOffset
      }

      // 以整页推进 offset，本批原始条数取决于服务端单页大小
      rawItems = scanned
      hasMore = canContinue
      nextOffset = scanOffset
      nextUpdateBaseline = scanUpdateBaseline
    }
    else {
      const response = await api.moment.getMoments({
        type: requestType,
        offset: offset.value || undefined,
        update_baseline: updateBaseline.value || undefined,
        features: MOMENT_FEED_FEATURES,
      }) as MomentResult
      if (
        !isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)
        || response.code !== 0
      ) {
        return
      }
      rawItems = response.data?.items || []
      hasMore = Boolean(response.data?.has_more) && rawItems.length > 0
      nextOffset = response.data?.offset || ''
      nextUpdateBaseline = response.data?.update_baseline || ''
    }

    const normalizedItems = cachedBatch ?? rawItems.map(mapMoment)
    void recordUploaderLatestVideoTimes(
      [
        ...collectVideoPublicationTimes(rawItems),
        ...normalizedItems
          .filter(moment => moment.isVideo && !moment.isForward)
          .map(moment => ({
            mid: moment.author.mid,
            time: moment.publishedAt * 1000,
          })),
      ],
      'moments-page',
    )
    // 按 UP 主请求不写入全局全部动态缓存
    if (requestGroup === 'all' && !requestHostMid) {
      cacheRegularMomentPage(
        requestType,
        normalizedItems,
        nextOffset,
        nextUpdateBaseline,
        hasMore,
        reset,
      )
    }
    const items = normalizedItems
      .filter(moment => requestGroup !== 'wanted' || wantedUserMids.value.has(moment.author.mid))
      .filter(moment => requestGroup !== 'wanted' || matchesMomentFilter(moment))
      .filter(passesMomentSettings)
      .sort((a, b) => b.publishedAt - a.publishedAt)
    if (!isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)) {
      return
    }
    filterScanRawCount.value += normalizedItems.length
    filterScanKeptCount.value += items.length
    // 封面预加载不阻塞首屏：卡片先按估算高度渲染，比例随后续 onload 修正
    void prepareMomentCovers(items, requestToken)
    if (!reset)
      preservedPaginationScrollTop = scrollViewportRef.value?.scrollTop ?? null
    if (!reset)
      suppressBottomRebalanceUntil = Date.now() + 1500
    appendMoments(items)
    if (reset) {
      await nextTick()
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    }

    offset.value = nextOffset
    updateBaseline.value = nextUpdateBaseline
    noMoreContent.value = !hasMore
    pageApplied = true
  }
  finally {
    if (isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)) {
      isLoading.value = false
      isInitialLoading.value = false
    }
  }

  if (
    preservedPaginationScrollTop !== null
    && isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)
  ) {
    // 等卡片、虚拟 spacer 和底部加载提示完成更新后，恢复分页前的滚动位置
    await nextTick()
    updateVirtualColumns()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const viewport = scrollViewportRef.value
    if (viewport)
      viewport.scrollTop = preservedPaginationScrollTop
  }

  // 仅首屏在内容未填满视口时再补 1 页；滚动加载不再连环请求
  if (
    !pageApplied
    || !reset
    || noMoreContent.value
    || requiresManualMomentPaging()
    || autoFillDepth >= MAX_POST_LOAD_AUTOFILL_PAGES
    || !isFeedRequestCurrent(requestToken, requestType, requestGroup, requestHostMid)
  ) {
    return
  }

  await nextTick()
  updateVirtualColumns()
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const viewport = scrollViewportRef.value
  if (!viewport)
    return
  const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
  if (distanceFromBottom <= 240)
    void loadMoments(false, autoFillDepth + 1)
}

function clearMomentsPortalState() {
  portalUser.value = null
  portalLiveUsers.value = []
  portalLiveCount.value = 0
  portalUpList.value = []
}

async function loadMomentsPortal() {
  const requestToken = ++portalRequestToken
  isPortalLoading.value = true
  try {
    const response = await api.moment.getMomentsPortal() as MomentsPortalResult
    if (requestToken !== portalRequestToken)
      return

    if (response.code !== 0) {
      clearMomentsPortalState()
      return
    }

    portalUser.value = response.data?.my_info || null
    portalLiveUsers.value = response.data?.live_users?.items || []
    portalLiveCount.value = response.data?.live_users?.count ?? portalLiveUsers.value.length
    portalUpList.value = normalizePortalUpList(response.data)
  }
  catch {
    if (requestToken === portalRequestToken)
      clearMomentsPortalState()
  }
  finally {
    if (requestToken === portalRequestToken)
      isPortalLoading.value = false
  }
}

function refresh() {
  isInitialLoading.value = moments.value.length === 0
  void loadMoments(true)
  void loadMomentsPortal()
}

function handleDetailFrameMessage(event: MessageEvent) {
  const messageType = event.data && typeof event.data === 'object' ? event.data.type : event.data
  if (
    (messageType === DRAWER_VIDEO_ENTER_PAGE_FULL || messageType === DRAWER_VIDEO_EXIT_PAGE_FULL)
    && event.source === detailIframeRef.value?.contentWindow
  ) {
    if (messageType === DRAWER_VIDEO_ENTER_PAGE_FULL)
      setDetailPlayerImmersive(true)
    else
      syncDetailPlayerImmersiveFromIframe()
    return
  }

  const type = event.data?.type
  if (type === 'BEWLY_OPUS_IMAGE_VIEWER_OPEN') {
    if (event.source !== detailIframeRef.value?.contentWindow)
      return
    const source = event.source as Window
    if (!openDetailImageViewer(event.data.urls, event.data.index, source))
      return
    try {
      source.postMessage({ type: 'BEWLY_OPUS_IMAGE_VIEWER_ACK' }, '*')
    }
    catch {
      // iframe 已销毁时忽略
    }
    return
  }
  // 图文详情布局完成后再去掉遮罩
  if (type === 'BEWLY_OPUS_LAYOUT_READY') {
    detailFrameLoaded.value = true
    clearDetailLoadTimer()
    // 布局就绪后补发一次视口宽，覆盖 iframe 监听器晚于 load 的时序
    syncDetailFrameViewport()
    return
  }
  // iframe 内 ESC 会 post 该消息；Dialog 场景下同步关闭详情
  if (type === 'BEWLY_DRAWER_CLOSE_REQUEST' && selectedMoment.value)
    closeMomentDetail()
}

onMounted(() => {
  setupVirtualObservers()
  gridObserver = new ResizeObserver(() => {
    updateGridColumnCount()
    updateVirtualColumns()
  })
  nextTick(() => {
    if (layoutRef.value)
      gridObserver?.observe(layoutRef.value)
    if (gridRef.value)
      gridObserver?.observe(gridRef.value)
    updateGridColumnCount()
    attachViewportScroll()
    setupVirtualObservers()
    updateVirtualColumns()
  })
  window.addEventListener('message', handleDetailFrameMessage)
  window.addEventListener('resize', syncDetailFrameViewport)
  refresh()
  handlePageRefresh.value = refresh
  handleReachBottom.value = () => {
    if (requiresManualMomentPaging() || !hasFeedScrollSinceReset)
      return
    void loadMoments()
  }
})

onBeforeUnmount(() => {
  gridObserver?.disconnect()
  cardMeasureObserver?.disconnect()
  visibilityObserver?.disconnect()
  upListResizeObserver?.disconnect()
  upListResizeObserver = undefined
  detachViewportScroll()
  cleanupLivePreviewPlayer()
  closeMomentDetail()
  Object.keys(previewUrls).forEach(key => delete previewUrls[key])
  videoCidCache.clear()
  videoCidRequests.clear()
  Object.keys(videoAspectRatios).forEach(key => delete videoAspectRatios[key])
  videoAspectRatioRequests.clear()
  visibleMomentIds.clear()
  cardElements.clear()
  cardEnterTimers.forEach(timer => clearTimeout(timer))
  cardEnterTimers.clear()
  clearDetailLoadTimer()
  if (rebalanceTimer) {
    clearTimeout(rebalanceTimer)
    rebalanceTimer = null
  }
  if (virtualRaf) {
    cancelAnimationFrame(virtualRaf)
    virtualRaf = 0
  }
  window.removeEventListener('message', handleDetailFrameMessage)
  window.removeEventListener('resize', syncDetailFrameViewport)
  handlePageRefresh.value = undefined
  handleReachBottom.value = undefined
})

watch(() => scrollViewportRef.value, () => {
  detachViewportScroll()
  attachViewportScroll()
  setupVirtualObservers()
  updateVirtualColumns()
})

// 列表从 skeleton 切到真实网格后补观察，确保列宽/列数及时更新
watch(gridRef, (el, prev) => {
  if (prev && gridObserver)
    gridObserver.unobserve(prev)
  if (el && gridObserver) {
    gridObserver.observe(el)
    updateGridColumnCount()
    updateVirtualColumns()
  }
})

// 骨架屏退出后网格位置会变化，立即按真实位置重算首屏虚拟窗口
watch(isInitialLoading, async (loading) => {
  if (loading)
    return
  await nextTick()
  updateGridColumnCount()
  updateVirtualColumns()
})

watch(
  [
    () => settings.value.momentsSidebarShowUserCard,
    () => settings.value.momentsSidebarShowPublish,
    () => settings.value.momentsSidebarShowLive,
    () => settings.value.momentsSidebarShowHotSearch,
  ],
  async () => {
    await nextTick()
    updateGridColumnCount()
  },
)

watch(
  () => settings.value.momentsGridColumns,
  async () => {
    Object.keys(cardHeights).forEach(key => delete cardHeights[key])
    settledHeights.clear()
    await nextTick()
    updateGridColumnCount()
    updateVirtualColumns()
  },
)

watch(upListScrollerRef, async () => {
  await nextTick()
  setupUpListScrollerObserver()
})

watch(
  [
    () => visiblePortalUpList.value.map(up => up.mid).join(','),
    () => settings.value.momentsEnableWantedFilter,
    () => isPortalLoading.value,
  ],
  async () => {
    await nextTick()
    updateUpListScrollState()
  },
)

watch(
  () => momentsWantedUsers.value.map(user => user.mid).join(','),
  () => {
    if (activeMomentGroup.value === 'wanted')
      void loadMoments(true)
  },
)

watch(
  () => momentsPinnedUsers.value.map(user => user.mid).join(','),
  async () => {
    await nextTick()
    updateUpListScrollState()
  },
)

watch(
  () => settings.value.momentsEnableWantedFilter,
  (enabled) => {
    if (enabled || activeMomentGroup.value !== 'wanted')
      return

    activeMomentGroup.value = 'all'
    wantedCacheCursor.value = 0
    resetMomentsScroll()
    void loadMoments(true)
  },
)

watch(
  [
    () => settings.value.momentsFilterUpRecommendation,
    () => settings.value.momentsHideChargeExclusive,
    () => settings.value.momentsHideVideoReservation,
    () => settings.value.momentsHideLiveReservation,
    () => settings.value.momentsHideLiveDynamics,
    () => settings.value.momentsHideVideoDynamics,
    () => settings.value.momentsHideDrawDynamics,
    () => settings.value.momentsHideUgcSeasonDynamics,
    () => settings.value.momentsHideForwardDynamics,
    () => settings.value.momentsHidePgcDynamics,
    () => settings.value.momentsHideArticleDynamics,
    () => settings.value.momentsEnableKeywordFilter,
    () => settings.value.momentsBlockedKeywords,
  ],
  () => {
    resetMomentsScroll()
    void loadMoments(true)
  },
)

watch(
  [
    () => settings.value.momentsEnableLivePreview,
    () => settings.value.momentsEnableVideoPreview,
  ],
  () => {
    const activeMoment = moments.value.find(moment => moment.id === hoveredMediaId.value)
    if (!activeMoment || isMomentPreviewEnabled(activeMoment))
      return

    hoveredMediaId.value = ''
    cleanupLivePreviewPlayer()
    if (previewUrls[activeMoment.id])
      delete previewUrls[activeMoment.id]
  },
)
</script>

<template>
  <section class="moments-page">
    <div
      ref="layoutRef"
      class="moments-layout"
      :class="{
        'moments-layout--with-sidebar': showMomentsSidebar || isLayoutEditing,
        'moments-layout--with-rightbar': showMomentsRightbar || isLayoutEditing,
      }"
    >
      <aside
        v-if="showMomentsSidebar || isLayoutEditing"
        class="moments-sidebar"
        :aria-label="t('moments.user_info')"
      >
        <div v-if="isPortalLoading && !isLayoutEditing" class="moments-sidebar-skeleton" aria-hidden="true">
          <div v-if="settings.momentsSidebarShowUserCard" class="moments-sidebar-skeleton__profile">
            <span class="moments-sidebar-skeleton__avatar moments-skeleton-block" />
            <span class="moments-sidebar-skeleton__name moments-skeleton-block" />
          </div>
          <div v-if="settings.momentsSidebarShowUserCard" class="moments-sidebar-skeleton__stats">
            <span v-for="index in 3" :key="index" class="moments-skeleton-block" />
          </div>
          <div v-if="settings.momentsSidebarShowPublish" class="moments-sidebar-skeleton__button moments-skeleton-block" />
          <div v-if="settings.momentsSidebarShowLive" class="moments-sidebar-skeleton__live">
            <span v-for="index in 3" :key="index" class="moments-skeleton-block" />
          </div>
        </div>
        <template v-else>
          <article
            v-if="isLayoutEditing || (settings.momentsSidebarShowUserCard && portalUser)"
            class="moments-user-card"
            data-layout-edit-target="moments-sidebar-user-card"
            data-layout-settings-menu="BewlyPages"
            data-layout-settings-page="moments"
            data-layout-settings-title-key="settings.moments_show_user_card"
          >
            <a
              v-if="portalUser"
              class="moments-user-card__profile"
              :href="`https://space.bilibili.com/${portalUser.mid}`"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img :src="getSidebarAvatarUrl(portalUser.face)" :alt="portalUser.name">
              <span class="moments-user-card__identity">
                <strong :style="{ color: portalUser.vip?.nickname_color || undefined }">{{ portalUser.name }}</strong>
                <span class="moments-user-card__badges">
                  <em v-if="portalUser.vip?.status === 1 && portalUser.vip.label?.text">{{ portalUser.vip.label.text }}</em>
                  <i v-if="portalUser.level_info?.current_level">LV{{ portalUser.level_info.current_level }}</i>
                </span>
              </span>
            </a>
            <div v-if="portalUser" class="moments-user-card__stats">
              <a
                class="moments-user-card__stat"
                :href="`https://space.bilibili.com/${portalUser.mid}/fans/follow`"
                :title="`${portalUser.following}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                <strong>{{ numFormatter(portalUser.following) }}</strong>
                <small>{{ t('moments.following') }}</small>
              </a>
              <a
                class="moments-user-card__stat"
                :href="`https://space.bilibili.com/${portalUser.mid}/fans/fans`"
                :title="`${portalUser.follower}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                <strong>{{ numFormatter(portalUser.follower) }}</strong>
                <small>{{ t('moments.followers') }}</small>
              </a>
              <a
                class="moments-user-card__stat"
                :href="`https://space.bilibili.com/${portalUser.mid}/dynamic`"
                :title="`${portalUser.dyns}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                <strong>{{ numFormatter(portalUser.dyns) }}</strong>
                <small>{{ t('moments.posts') }}</small>
              </a>
            </div>
            <div v-else class="moments-sidebar-editor-placeholder">
              {{ $t('settings.moments_show_user_card') }}
            </div>
          </article>

          <a
            v-if="isLayoutEditing || settings.momentsSidebarShowPublish"
            class="moments-publish-link"
            href="https://t.bilibili.com"
            target="_blank"
            rel="noopener noreferrer"
            data-layout-edit-target="moments-sidebar-publish"
            data-layout-settings-menu="BewlyPages"
            data-layout-settings-page="moments"
            data-layout-settings-title-key="settings.moments_show_publish"
          >
            <span i-tabler-edit />
            <span>{{ t('moments.publish') }}</span>
            <span i-tabler-external-link />
          </a>

          <section
            v-if="isLayoutEditing || (settings.momentsSidebarShowLive && portalLiveUsers.length)"
            class="moments-live-card"
            data-layout-edit-target="moments-sidebar-live"
            data-layout-settings-menu="BewlyPages"
            data-layout-settings-page="moments"
            data-layout-settings-title-key="settings.moments_show_live"
          >
            <header>
              <strong>{{ t('moments.live_now') }} <span>{{ portalLiveCount }}</span></strong>
            </header>
            <div v-if="portalLiveUsers.length" class="moments-live-card__list">
              <a
                v-for="liveUser in isLayoutEditing ? portalLiveUsers.slice(0, 1) : portalLiveUsers"
                :key="liveUser.room_id"
                :href="liveUser.jump_url || `https://live.bilibili.com/${liveUser.room_id}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span class="moments-live-card__avatar">
                  <img :src="getSidebarAvatarUrl(liveUser.face, 64)" :alt="liveUser.uname" loading="lazy" decoding="async">
                  <em><span i-tabler-chart-bar />{{ t('moments.live_now') }}</em>
                </span>
                <span class="moments-live-card__info">
                  <strong>{{ liveUser.uname }}</strong>
                  <small>{{ liveUser.title }}</small>
                </span>
              </a>
            </div>
          </section>
        </template>
      </aside>

      <header
        class="moments-filter-header"
        :class="{ 'moments-filter-header--center': settings.momentsTabsPosition === 'center' }"
      >
        <section
          class="moments-filter-panel bew-segment-control bew-segment-control--surface"
          data-layout-edit-target="moments-filter"
          data-layout-settings-menu="BewlyPages"
          data-layout-settings-page="moments"
          data-layout-settings-title-key="settings.moments_tabs_position"
          :class="{
            'bew-segment-control--static': !settings.enableLiquidSegmentIndicator,
            'bew-segment-control--solid': !settings.enableFrostedGlass,
          }"
        >
          <div class="moments-filter-scroll">
            <div class="moments-filter-inside">
              <LiquidSegmentIndicator
                v-if="settings.enableLiquidSegmentIndicator"
                :active-key="activeMomentFilter"
              />
              <button
                v-for="filter in momentFilters"
                :key="filter.value"
                type="button"
                class="moments-filter-button bew-segment-control__item bew-segment-control__item--wide"
                data-segment-item
                :data-active="activeMomentFilter === filter.value ? 'true' : undefined"
                :aria-pressed="activeMomentFilter === filter.value"
                @click="handleMomentFilterChange(filter.value)"
              >
                {{ filter.label }}
              </button>
            </div>
          </div>
        </section>
      </header>

      <div class="moments-center" :style="momentsContentStyle">
        <section
          v-if="isLayoutEditing || showMomentsUpList"
          class="moments-up-list"
          :aria-label="t('moments.posts')"
          data-layout-edit-target="moments-up-list"
          data-layout-settings-menu="BewlyPages"
          data-layout-settings-page="moments"
          data-layout-settings-title-key="settings.moments_show_up_list"
        >
          <div class="moments-up-list__start" role="list" :aria-label="t('moments.group_label')">
            <button
              type="button"
              class="moments-up-list__item"
              :class="{ 'moments-up-list__item--active': !selectedHostMid && activeMomentGroup === 'all' }"
              role="listitem"
              :aria-pressed="!selectedHostMid && activeMomentGroup === 'all'"
              :title="t('moments.all_posts')"
              @click="handleUpFilterChange('')"
            >
              <span class="moments-up-list__avatar moments-up-list__avatar--all" aria-hidden="true">
                <span
                  class="moments-up-list__all-icon"
                  :class="!selectedHostMid && activeMomentGroup === 'all' ? 'i-tabler-windmill-filled' : 'i-tabler-windmill'"
                />
              </span>
              <span class="moments-up-list__name">{{ t('moments.all_posts') }}</span>
            </button>
            <button
              v-if="isLayoutEditing || settings.momentsEnableWantedFilter"
              type="button"
              class="moments-up-list__item"
              data-layout-edit-target="moments-wanted-users"
              data-layout-settings-menu="BewlyPages"
              data-layout-settings-page="moments"
              data-layout-settings-title-key="settings.group_moments_wanted_users"
              :class="{ 'moments-up-list__item--active': activeMomentGroup === 'wanted' }"
              role="listitem"
              :aria-pressed="activeMomentGroup === 'wanted'"
              :disabled="activeMomentFilter !== 'all' && activeMomentFilter !== 'video'"
              :aria-label="activeMomentGroup === 'wanted' ? t('moments.cancel_wanted_only') : t('moments.wanted_only')"
              :title="activeMomentFilter === 'all' || activeMomentFilter === 'video'
                ? (activeMomentGroup === 'wanted' ? t('moments.cancel_wanted_only') : t('moments.wanted_only'))
                : t('moments.wanted_scope_hint')"
              @click="handleMomentGroupChange(activeMomentGroup === 'wanted' ? 'all' : 'wanted')"
            >
              <span class="moments-up-list__avatar moments-up-list__avatar--wanted" aria-hidden="true">
                <span
                  class="moments-up-list__wanted-icon"
                  :class="activeMomentGroup === 'wanted' ? 'i-tabler-star-filled' : 'i-tabler-star'"
                />
              </span>
              <span class="moments-up-list__name">{{ t('moments.wanted') }}</span>
            </button>
          </div>

          <div class="moments-up-list__main">
            <span
              class="moments-up-list__fade moments-up-list__fade--prev"
              :class="{ 'moments-up-list__fade--visible': canScrollUpListLeft }"
              aria-hidden="true"
            />
            <button
              v-show="canScrollUpListLeft"
              type="button"
              class="moments-up-list__arrow moments-up-list__arrow--prev"
              :aria-label="t('moments.scroll_left')"
              :title="t('moments.scroll_left')"
              @click="scrollUpListBy(-1)"
            >
              <span i-tabler-chevron-left aria-hidden="true" />
            </button>
            <button
              v-show="canScrollUpListRight"
              type="button"
              class="moments-up-list__arrow moments-up-list__arrow--next"
              :aria-label="t('moments.scroll_right')"
              :title="t('moments.scroll_right')"
              @click="scrollUpListBy(1)"
            >
              <span i-tabler-chevron-right aria-hidden="true" />
            </button>

            <div
              v-if="isPortalLoading && !portalUpList.length"
              ref="upListScrollerRef"
              class="moments-up-list__scroller"
              aria-hidden="true"
            >
              <div
                v-for="index in 8"
                :key="index"
                class="moments-up-list__item moments-up-list__item--skeleton"
              >
                <span class="moments-up-list__avatar moments-skeleton-block" />
                <span class="moments-up-list__name moments-skeleton-block" />
              </div>
            </div>
            <div
              v-else
              ref="upListScrollerRef"
              class="moments-up-list__scroller"
              role="list"
              :aria-label="t('moments.frequent_uploaders')"
              @scroll="updateUpListScrollState"
              @wheel="handleUpListWheel"
            >
              <button
                v-for="up in visiblePortalUpList"
                :key="up.mid"
                type="button"
                class="moments-up-list__item"
                :class="{ 'moments-up-list__item--active': selectedHostMid === up.mid && activeMomentGroup === 'all' }"
                role="listitem"
                :aria-pressed="selectedHostMid === up.mid && activeMomentGroup === 'all'"
                :title="up.uname"
                @click="handleUpFilterChange(up.mid)"
              >
                <span class="moments-up-list__avatar">
                  <img
                    :src="getSidebarAvatarUrl(up.face, 96)"
                    :alt="up.uname"
                    loading="lazy"
                    decoding="async"
                  >
                  <span
                    v-if="up.has_update"
                    class="moments-up-list__dot"
                    :aria-label="t('moments.has_updates')"
                  />
                </span>
                <span class="moments-up-list__name">{{ up.uname }}</span>
              </button>
            </div>
          </div>

          <div
            v-if="isLayoutEditing || momentsPinnedUsers.length"
            class="moments-up-list__pinned"
            :class="{ 'is-expanded': isPinnedListExpanded }"
            :style="{ width: `${isPinnedListExpanded ? pinnedExpandedWidth : pinnedCollapsedWidth}px` }"
            role="list"
            :aria-label="t('moments.pin_uploader')"
            data-layout-edit-target="moments-pinned-users"
            data-layout-settings-menu="BewlyPages"
            data-layout-settings-page="moments"
            data-layout-settings-title-key="settings.group_moments_pinned_users"
            @mouseenter="expandPinnedList"
            @mouseleave="collapsePinnedList"
            @focusin="expandPinnedList"
            @focusout="handlePinnedListFocusOut"
            @wheel="handleUpListWheel"
          >
            <span class="moments-up-list__divider" aria-hidden="true" />
            <span
              v-if="isLayoutEditing && !momentsPinnedUsers.length"
              class="moments-up-list__editor-placeholder"
            >
              {{ $t('settings.group_moments_pinned_users') }}
            </span>
            <button
              v-for="user in momentsPinnedUsers"
              :key="user.mid"
              type="button"
              class="moments-up-list__item"
              :class="{ 'moments-up-list__item--active': selectedHostMid === user.mid && activeMomentGroup === 'all' }"
              role="listitem"
              :aria-pressed="selectedHostMid === user.mid && activeMomentGroup === 'all'"
              :title="user.name"
              @click="handleUpFilterChange(user.mid)"
            >
              <span class="moments-up-list__avatar">
                <img
                  :src="getSidebarAvatarUrl(user.face, 96)"
                  :alt="user.name"
                  loading="lazy"
                  decoding="async"
                >
              </span>
              <span class="moments-up-list__name">{{ user.name }}</span>
            </button>
          </div>
        </section>
        <div class="moments-feed">
          <div v-if="isInitialLoading" class="moments-page__initial-loading">
            <div class="moments-skeleton-grid" :style="momentsGridStyle">
              <div
                v-for="columnIndex in Math.max(1, gridColumnCount)"
                :key="columnIndex"
                class="moments-skeleton-column"
              >
                <article
                  v-for="itemIndex in 4"
                  :key="itemIndex"
                  class="moments-skeleton-card"
                >
                  <div class="moments-skeleton-card__header">
                    <span class="moments-skeleton-card__avatar moments-skeleton-block" />
                    <span class="moments-skeleton-card__identity">
                      <span class="moments-skeleton-card__author moments-skeleton-block" />
                      <span class="moments-skeleton-card__time moments-skeleton-block" />
                    </span>
                  </div>
                  <div class="moments-skeleton-card__main">
                    <div class="moments-skeleton-card__cover moments-skeleton-block" />
                    <div class="moments-skeleton-card__body">
                      <div class="moments-skeleton-card__title moments-skeleton-block" />
                      <div v-for="lineIndex in 5" :key="lineIndex" class="moments-skeleton-card__line moments-skeleton-block" :class="{ 'moments-skeleton-card__line--short': lineIndex === 5 }" />
                    </div>
                  </div>
                  <div class="moments-skeleton-card__footer">
                    <span v-for="actionIndex in 3" :key="actionIndex" class="moments-skeleton-card__action moments-skeleton-block" />
                  </div>
                </article>
              </div>
            </div>
          </div>
          <div
            v-else-if="moments.length"
            ref="gridRef"
            class="moments-grid"
            :style="momentsGridStyle"
          >
            <div v-for="(column, columnIndex) in virtualColumns" :key="columnIndex" class="moments-grid__column">
              <div v-if="column.topPad" class="moments-grid__spacer" :style="{ height: `${column.topPad}px` }" />
              <MomentCard
                v-for="moment in column.items" :key="moment.id"
                :moment="moment"
                :card-width="gridCardWidth"
                :image-ratio="coverRatios[moment.id]"
                :ready="readyCardIds.has(moment.id)"
                :entering="enteringCardIds.has(moment.id)"
                :preview-active="Boolean(hoveredMediaId === moment.id && previewUrls[moment.id])"
                :preview-url="previewUrls[moment.id]"
                :is-like-loading="likingMomentIds.has(moment.id)"
                :is-reservation-loading="reservationLoadingMomentIds.has(moment.id)"
                :is-watch-later-added="isWatchLaterAdded"
                :is-watch-later-loading="isWatchLaterLoading"
                @card-element="element => bindCardEl(element, moment)"
                @open-detail="openMomentDetail"
                @open-image-preview="openMomentImagePreview"
                @media-enter="handleMediaEnter"
                @media-leave="handleMediaLeave"
                @cover-load="(event, momentId) => handleCoverLoad(event, momentId)"
                @preview-video="bindPreviewVideo"
                @preview-canplay="playPreview"
                @open-link="handleOpenLink"
                @toggle-watch-later="toggleMomentWatchLater"
                @toggle-like="toggleMomentLike"
                @toggle-reservation="toggleMomentReservation"
              />
              <div v-if="column.bottomPad" class="moments-grid__spacer" :style="{ height: `${column.bottomPad}px` }" />
            </div>
          </div>
          <div v-else-if="!isInitialLoading" class="moments-page__empty">
            <span i-tabler-windmill text="size-$bew-icon-size-xl" /><p>{{ activeMomentGroup === 'wanted' ? (momentsWantedUsers.length ? t('moments.no_recent_updates') : t('moments.add_wanted_first')) : t('moments.empty') }}</p><button
              v-if="activeMomentGroup !== 'wanted' || momentsWantedUsers.length"
              :disabled="isLoading"
              @click="requiresManualMomentPaging() && !noMoreContent ? (activeMomentGroup === 'wanted' ? loadMoreWantedMoments() : loadMoreFilteredMoments()) : refresh()"
            >
              {{ isLoading ? t('common.loading') : requiresManualMomentPaging() ? (!noMoreContent ? t('common.load_more') : (activeMomentGroup === 'wanted' ? t('moments.recheck') : t('moments.reload'))) : t('moments.reload') }}
            </button>
          </div>
          <button
            v-if="requiresManualMomentPaging() && moments.length && !isLoading && !noMoreContent"
            type="button"
            class="moments-wanted-load-more"
            @click="activeMomentGroup === 'wanted' ? loadMoreWantedMoments() : loadMoreFilteredMoments()"
          >
            <span i-tabler-arrow-down />
            {{ t('common.load_more') }}
          </button>
          <p
            v-if="!isInitialLoading && moments.length"
            class="moments-page__loading"
            :class="{ 'is-visible': isLoading || noMoreContent }"
            :aria-hidden="!(isLoading || noMoreContent)"
            aria-live="polite"
          >
            <template v-if="isLoading">
              <span i-svg-spinners:ring-resize />
              {{ t('moments.loading_more') }}
            </template>
            <template v-else-if="noMoreContent">
              {{ t('common.no_more_content') }}
            </template>
          </p>
        </div>
      </div>

      <aside
        v-if="showMomentsRightbar || isLayoutEditing"
        class="moments-rightbar"
        :aria-label="t('search_bar.hot_search_title')"
      >
        <MomentsHotSearch
          v-if="settings.momentsSidebarShowHotSearch"
          data-layout-edit-target="moments-sidebar-hot-search"
          data-layout-settings-menu="BewlyPages"
          data-layout-settings-page="moments"
          data-layout-settings-title-key="settings.moments_show_hot_search"
        />
        <div
          v-else
          class="moments-rightbar-placeholder moments-sidebar-editor-placeholder"
          data-layout-edit-target="moments-sidebar-hot-search"
          data-layout-settings-menu="BewlyPages"
          data-layout-settings-page="moments"
          data-layout-settings-title-key="settings.moments_show_hot_search"
        >
          {{ $t('settings.moments_show_hot_search') }}
        </div>
      </aside>
    </div>

    <Dialog
      v-if="selectedMoment && detailFrameUrl"
      append-to-bewly-body
      content-flush
      transition-name="moments-dialog"
      :show-header="false"
      :show-border="false"
      :show-footer="false"
      :frosted-glass="false"
      :title="selectedMoment.isLive ? t('moments.live_room') : selectedMoment.isVideo ? t('moments.video_playback') : selectedMoment.author.name"
      :desc="selectedMoment.isLive || selectedMoment.isVideo ? selectedMoment.title || selectedMoment.author.name : (selectedMoment.time || t('moments.detail'))"
      :width="detailDialogWidth"
      :height="detailDialogHeight"
      :content-height="detailContentHeight"
      :content-max-height="detailContentHeight"
      @close="closeMomentDetail"
    >
      <template #floating-actions>
        <div
          class="moment-detail-actions"
          :style="{
            width: detailDialogWidth,
            height: detailDialogHeight,
          }"
        >
          <div class="moment-detail-actions__bar">
            <a
              class="moment-detail-actions__open"
              :class="{ 'is-hidden': detailPlayerImmersive }"
              :href="detailFrameUrl"
              :aria-hidden="detailPlayerImmersive ? 'true' : undefined"
              :tabindex="detailPlayerImmersive ? -1 : 0"
              target="_blank"
              rel="noopener noreferrer"
              @click.prevent.stop="openDetailFrameInNewTab"
            >
              {{ t('moments.new_tab') }}
              <span i-tabler-external-link />
            </a>
            <button
              type="button"
              class="moment-detail-actions__close"
              :aria-label="t('moments.close')"
              @click="closeMomentDetail"
            >
              <span i-tabler-x />
            </button>
          </div>
        </div>
      </template>
      <div
        class="moment-detail-frame"
        :class="{
          'is-loading': !detailFrameLoaded,
          'moment-detail-frame--player': selectedMoment.isVideo || selectedMoment.isLive,
          'moment-detail-frame--opus': isOpusDetailMoment,
        }"
      >
        <div class="moment-detail-frame__loading" aria-hidden="true">
          <img class="moment-detail-frame__loading-icon" :src="loadingGifUrl" alt="" aria-hidden="true">
          {{ selectedMoment.isLive ? t('moments.opening_live') : selectedMoment.isVideo ? t('moments.opening_video') : selectedMoment.isForward ? t('moments.opening_forward') : t('moments.loading_detail') }}
        </div>
        <iframe
          ref="detailIframeRef"
          :key="detailFrameUrl"
          class="moment-detail-frame__iframe"
          :src="detailFrameUrl"
          :title="t('moments.author_detail', { name: selectedMoment.author.name })"
          referrerpolicy="no-referrer-when-downgrade"
          allow="fullscreen; autoplay; clipboard-write"
          scrolling="yes"
          @load="handleDetailIframeLoad"
        />
      </div>
    </Dialog>

    <Teleport v-if="mainAppRef && detailImageViewerOpen" :to="mainAppRef">
      <div
        ref="detailImageViewerRef"
        class="moment-image-viewer"
        role="dialog"
        aria-modal="true"
        :aria-label="t('moments.image_viewer')"
        tabindex="-1"
        @keydown="handleDetailImageViewerKeydown"
        @wheel.prevent.stop="handleDetailImageViewerWheel"
      >
        <button
          type="button"
          class="moment-image-viewer__close"
          :aria-label="t('moments.close_image_viewer')"
          @click="closeDetailImageViewer"
        >
          <span i-tabler-x />
        </button>
        <div class="moment-image-viewer__stage" @click.self="closeDetailImageViewer">
          <img
            :src="detailImageViewerUrl"
            :alt="t('moments.enlarged_image')"
            class="moment-image-viewer__image"
            :class="{
              'is-zoomed': detailImageViewerScale > 1,
              'is-dragging': detailImageViewerDragging,
            }"
            :style="{ transform: detailImageViewerTransform }"
            draggable="false"
            @dblclick.prevent.stop="handleDetailImageViewerDoubleClick"
            @pointerdown="handleDetailImageViewerPointerDown"
            @pointermove="handleDetailImageViewerPointerMove"
            @pointerup="handleDetailImageViewerPointerEnd"
            @pointercancel="handleDetailImageViewerPointerEnd"
          >
        </div>
        <button
          v-if="detailImageViewerUrls.length > 1"
          type="button"
          class="moment-image-viewer__nav moment-image-viewer__nav--prev"
          :aria-label="t('moments.previous_image')"
          @click="showDetailImageViewerImage(detailImageViewerIndex - 1)"
        >
          <span i-tabler-chevron-left />
        </button>
        <button
          v-if="detailImageViewerUrls.length > 1"
          type="button"
          class="moment-image-viewer__nav moment-image-viewer__nav--next"
          :aria-label="t('moments.next_image')"
          @click="showDetailImageViewerImage(detailImageViewerIndex + 1)"
        >
          <span i-tabler-chevron-right />
        </button>
        <div class="moment-image-viewer__toolbar">
          <span class="moment-image-viewer__counter">
            {{ detailImageViewerIndex + 1 }}/{{ detailImageViewerUrls.length }}
          </span>
          <span class="moment-image-viewer__divider" />
          <button type="button" :aria-label="t('moments.zoom_out')" :title="t('moments.zoom_out')" @click="setDetailImageViewerScale(detailImageViewerScale - 0.25)">
            −
          </button>
          <span class="moment-image-viewer__zoom">{{ Math.round(detailImageViewerScale * 100) }}%</span>
          <button type="button" :aria-label="t('moments.zoom_in')" :title="t('moments.zoom_in')" @click="setDetailImageViewerScale(detailImageViewerScale + 0.25)">
            +
          </button>
          <button type="button" :aria-label="t('moments.fit_window')" :title="t('moments.fit_window')" @click="resetDetailImageViewerTransform">
            1:1
          </button>
          <button
            type="button"
            :aria-label="t('moments.rotate_clockwise')"
            :title="t('moments.rotate_clockwise')"
            @click="detailImageViewerRotation = (detailImageViewerRotation + 90) % 360"
          >
            ↻
          </button>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped lang="scss">
.moments-page {
  padding: var(--bew-space-2) var(--bew-space-5) var(--bew-space-12);
}
.moments-layout {
  display: grid;
  justify-content: center;
  align-items: start;
  column-gap: var(--bew-space-6);
  row-gap: var(--bew-space-6);
  width: 100%;
  grid-template-columns: auto;
  grid-template-areas:
    "header"
    "center";
}
.moments-layout--with-sidebar {
  grid-template-columns: 248px auto;
  grid-template-areas:
    ". header"
    "sidebar center";
}
.moments-layout--with-rightbar {
  grid-template-columns: auto 248px;
  grid-template-areas:
    "header ."
    "center rightbar";
}
.moments-layout--with-sidebar.moments-layout--with-rightbar {
  grid-template-columns: 248px auto 248px;
  grid-template-areas:
    ". header ."
    "sidebar center rightbar";
}
.moments-center {
  grid-area: center;
  min-width: 0;
}
.moments-feed {
  min-width: 0;
}
.moments-up-list {
  display: flex;
  align-items: stretch;
  gap: 0;
  margin-bottom: var(--bew-space-4);
  padding: var(--bew-space-4);
  border-radius: var(--bew-card-radius);
  background: var(--bew-elevated);
  box-shadow: none;
}
.moments-up-list__main {
  position: relative;
  min-width: 64px;
  flex: 1 1 0;
}
.moments-up-list__start {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--bew-space-1);
  margin-right: var(--bew-space-2);
}
.moments-up-list__scroller {
  display: flex;
  gap: var(--bew-space-1);
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.moments-up-list__scroller::-webkit-scrollbar {
  display: none;
}
.moments-up-list__fade {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 1;
  width: 32px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}
.moments-up-list__fade--prev {
  left: 0;
  background: linear-gradient(90deg, var(--bew-elevated), transparent);
}
.moments-up-list__fade--visible {
  opacity: 1;
}
.moments-up-list__arrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: grid;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  color: var(--bew-text-1);
  background: color-mix(in oklab, var(--bew-elevated-solid, var(--bew-elevated)) 88%, var(--bew-text-1) 12%);
  box-shadow: var(--bew-shadow-1, 0 2px 8px rgb(0 0 0 / 12%));
  opacity: 0;
  place-items: center;
  pointer-events: none;
  transform: translateY(-50%);
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
  cursor: pointer;
}
.moments-up-list__arrow--prev {
  left: 4px;
}
.moments-up-list__arrow--next {
  right: 4px;
}
.moments-up-list:hover .moments-up-list__arrow,
.moments-up-list:focus-within .moments-up-list__arrow {
  opacity: 1;
  pointer-events: auto;
}
.moments-up-list__arrow:hover {
  background: color-mix(in oklab, var(--bew-elevated-solid, var(--bew-elevated)) 78%, var(--bew-text-1) 22%);
}
.moments-up-list__arrow:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 2px;
  opacity: 1;
  pointer-events: auto;
}
.moments-up-list__pinned {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--bew-space-1);
  overflow: hidden;
  background: transparent;
  transition: width var(--bew-duration-moderate) var(--bew-ease-standard);
}
.moments-up-list__editor-placeholder {
  display: inline-flex;
  min-width: 80px;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  padding: 0 var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  white-space: nowrap;
}
.moments-up-list__divider {
  flex: 0 0 auto;
  width: 2px;
  height: 28px;
  margin: 0 var(--bew-space-1);
  border-radius: var(--bew-radius-full);
  background: color-mix(in oklab, var(--bew-border-color), transparent 24%);
}
.moments-up-list__item {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: var(--bew-space-1);
  // 72px：48px 头像 + 上下留白后内容区 64px
  width: 72px;
  min-width: 72px;
  padding: var(--bew-space-1);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-decoration: none;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);
}
.moments-up-list__item:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 2px;
}
// hover 即选中态：光环与名称变色复用 active 样式，移开时平滑过渡
@mixin up-item-selected {
  .moments-up-list__name {
    color: var(--bew-theme-color);
  }

  .moments-up-list__avatar > img,
  .moments-up-list__avatar--all,
  .moments-up-list__avatar--wanted {
    box-shadow:
      0 0 0 2px var(--bew-elevated),
      0 0 0 4px var(--bew-theme-color);
  }

  .moments-up-list__avatar--all,
  .moments-up-list__avatar--wanted {
    border-color: var(--bew-theme-color);
    color: #fff;
    background: var(--bew-theme-color);
  }
}

.moments-up-list__item--active,
.moments-up-list__item:hover:not(:disabled) {
  @include up-item-selected;
}
.moments-up-list__item--skeleton {
  pointer-events: none;
}
.moments-up-list__avatar {
  position: relative;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
}
.moments-up-list__avatar > img,
.moments-up-list__item--skeleton .moments-up-list__avatar {
  display: block;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bew-fill-1);
  transition: box-shadow var(--bew-duration-fast) var(--bew-ease-standard);
}
.moments-up-list__avatar--all,
.moments-up-list__avatar--wanted {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  box-sizing: border-box;
  border: 2px solid transparent;
  border-radius: 50%;
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-20);
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    border-color var(--bew-duration-fast) var(--bew-ease-standard),
    box-shadow var(--bew-duration-fast) var(--bew-ease-standard);
}
.moments-up-list__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.moments-up-list__all-icon,
.moments-up-list__wanted-icon {
  display: block;
  width: 22px;
  height: 22px;
  line-height: 1;
}
.moments-up-list__dot {
  position: absolute;
  top: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border: 2px solid var(--bew-elevated);
  border-radius: 50%;
  background: var(--bew-bili-pink);
  box-sizing: border-box;
}
.moments-up-list__name {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);
}
.moments-up-list__item--skeleton .moments-up-list__name {
  width: 40px;
  height: 12px;
  border-radius: var(--bew-radius-sm);
}
.moments-sidebar,
.moments-rightbar {
  position: sticky;
  top: calc(var(--bew-top-bar-height, 64px) + var(--bew-space-3));
  z-index: 7;
  display: flex;
  width: 248px;
  max-width: 100%;
  max-height: calc(100dvh - var(--bew-top-bar-height, 64px) - var(--bew-space-6));
  flex-direction: column;
  gap: var(--bew-space-5);
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.moments-sidebar {
  grid-area: sidebar;
}
.moments-rightbar {
  grid-area: rightbar;
}
.moments-rightbar-placeholder {
  min-height: 160px;
  border-radius: var(--bew-panel-radius);
  background: var(--bew-elevated);
}
.moments-user-card,
.moments-live-card,
.moments-sidebar-skeleton {
  overflow: hidden;
  border: 0;
  border-radius: var(--bew-panel-radius);
  background: var(--bew-elevated);
  box-shadow: none;
}
.moments-user-card {
  padding: var(--bew-space-4);
}
.moments-sidebar-editor-placeholder {
  display: flex;
  min-height: 72px;
  align-items: center;
  justify-content: center;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-align: center;
}
.moments-user-card__profile {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  color: inherit;
  text-decoration: none;
}
.moments-user-card__profile > img {
  flex: 0 0 auto;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: var(--bew-fill-1);
  object-fit: cover;
}
.moments-user-card__identity {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-2);
}
.moments-user-card__identity > strong {
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moments-user-card__badges {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
}
.moments-user-card__badges em,
.moments-user-card__badges i {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 var(--bew-space-1);
  border-radius: var(--bew-radius-half);
  font-size: var(--bew-font-size-caption);
  font-style: normal;
  font-weight: var(--bew-font-weight-bold);
  line-height: var(--bew-line-height-caption);
}
.moments-user-card__badges em {
  color: #fff;
  background: #fb7299;
}
.moments-user-card__badges i {
  color: #fb7299;
  border: 1px solid currentcolor;
}
// 统计区对齐 UserPanelPop 的 channel-info-item：竖线分隔、hover 变主题色、可跳转
.moments-user-card__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-4);
}
.moments-user-card__stat {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: var(--bew-space-1);
  color: inherit;
  text-decoration: none;
}
.moments-user-card__stat:hover strong,
.moments-user-card__stat:hover small {
  color: var(--bew-theme-color);
}
.moments-user-card__stat strong {
  overflow: hidden;
  max-width: 100%;
  color: var(--bew-text-1);
  // 与 UserPanelPop .num text-xl (18px) 对齐
  font-size: 18px;
  font-weight: var(--bew-font-weight-semibold);
  text-overflow: ellipsis;
  transition: color var(--bew-duration-normal) var(--bew-ease-standard);
}
.moments-user-card__stat small {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-caption);
  transition: color var(--bew-duration-normal) var(--bew-ease-standard);
}
.moments-publish-link {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: 44px;
  padding: 0 var(--bew-space-4);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  background: var(--bew-elevated);
  box-shadow: none;
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-body);
  text-decoration: none;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background-color 0.2s ease;
}
.moments-publish-link > :last-child {
  margin-left: auto;
  color: var(--bew-text-3);
}
.moments-publish-link:hover {
  color: var(--bew-text-1);
  background: color-mix(in oklab, var(--bew-elevated-solid) 92%, var(--bew-text-1) 8%);
}
.moments-live-card {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  padding: var(--bew-space-4) 0 var(--bew-space-3);
}
.moments-live-card > header {
  padding: 0 var(--bew-space-4) var(--bew-space-2);
}
.moments-live-card > header strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}
.moments-live-card > header span {
  color: var(--bew-text-3);
  font-weight: var(--bew-font-weight-medium);
}
.moments-live-card__list {
  display: flex;
  /* 五个 72px 直播项加四个 4px 间距，超出后在卡片内滚动。 */
  max-height: 376px;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-1);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-inline: var(--bew-space-4);
}
.moments-live-card__list > a {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  height: 72px;
  min-width: 0;
  flex: 0 0 72px;
  padding: var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  color: inherit;
  text-decoration: none;
  transition: background-color 0.18s ease;
}
.moments-live-card__list > a:hover {
  background: var(--bew-fill-1);
}
.moments-live-card__avatar {
  position: relative;
  flex: 0 0 auto;
  width: 48px;
  height: 54px;
}
.moments-live-card__avatar img {
  display: block;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--bew-fill-1);
  object-fit: cover;
}
.moments-live-card__avatar em {
  position: absolute;
  left: 50%;
  bottom: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-0-5);
  height: 17px;
  padding: 0 var(--bew-space-1);
  border-radius: var(--bew-radius-full);
  color: #fff;
  background: #fb7299;
  font-size: var(--bew-font-size-caption);
  font-style: normal;
  line-height: var(--bew-line-height-caption);
  transform: translateX(-50%);
  white-space: nowrap;
}
.moments-live-card__avatar em::after {
  position: absolute;
  inset: -3px;
  border: 1px solid #fb7299;
  border-radius: inherit;
  content: "";
  pointer-events: none;
  animation: moments-live-pulse 1.05s ease-out infinite;
}
.moments-live-card__info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-1);
}
.moments-live-card__info strong,
.moments-live-card__info small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moments-live-card__info strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-body);
}
.moments-live-card__info small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.moments-sidebar-skeleton {
  padding: var(--bew-space-4);
}
.moments-sidebar-skeleton__profile {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
}
.moments-sidebar-skeleton__avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
}
.moments-sidebar-skeleton__name {
  width: 104px;
  height: 17px;
  border-radius: var(--bew-radius-half);
}
.moments-sidebar-skeleton__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--bew-space-4);
  margin-top: var(--bew-space-5);
}
.moments-sidebar-skeleton__stats > span {
  height: 34px;
  border-radius: var(--bew-radius-md);
}
.moments-sidebar-skeleton__button {
  display: block;
  height: 44px;
  margin-top: var(--bew-space-4);
  border-radius: var(--bew-radius-lg);
}
.moments-sidebar-skeleton__live {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-4);
}
.moments-sidebar-skeleton__live > span {
  height: 54px;
  border-radius: var(--bew-radius-lg);
}
@keyframes moments-live-pulse {
  0% {
    opacity: 0.75;
    transform: scale(0.94);
  }
  70%,
  100% {
    opacity: 0;
    transform: scale(1.14);
  }
}
.moments-page__initial-loading {
  position: relative;
  min-height: calc(100dvh - var(--bew-top-bar-height) - 90px);
}
.moments-skeleton-grid {
  display: grid;
  align-items: start;
  justify-content: center;
  width: 100%;
}
.moments-skeleton-column {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-5);
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.moments-skeleton-card {
  container-type: inline-size;
  min-height: 316px;
  overflow: hidden;
  border-radius: var(--bew-card-radius);
  background: color-mix(in oklab, var(--bew-elevated), transparent 42%);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bew-border-color), transparent 72%);
}
.moments-skeleton-block {
  background: linear-gradient(
    100deg,
    color-mix(in oklab, var(--bew-fill-1), transparent 24%) 25%,
    color-mix(in oklab, var(--bew-fill-2), transparent 14%) 38%,
    color-mix(in oklab, var(--bew-fill-1), transparent 24%) 63%
  );
  background-size: 400% 100%;
  animation: moment-shimmer 1.5s ease infinite;
}
.moments-skeleton-card__header {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  padding: var(--bew-space-3) var(--bew-space-4);
}
.moments-skeleton-card__identity {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}
.moments-skeleton-card__main {
  display: grid;
  grid-template-columns: minmax(170px, 1fr) minmax(0, 1fr);
  gap: var(--bew-space-3);
  min-height: 0;
  padding: 0 var(--bew-space-4) var(--bew-space-4);
}
.moments-skeleton-card__cover {
  width: 100%;
  min-height: 0;
  border-radius: var(--bew-media-radius);
  aspect-ratio: 16 / 9;
  opacity: 0.68;
}
.moments-skeleton-card__body {
  padding: var(--bew-space-1) 0 0;
}
.moments-skeleton-card__title {
  width: 72%;
  height: 16px;
  border-radius: var(--bew-radius-half);
}
.moments-skeleton-card__line {
  width: 94%;
  height: 11px;
  margin-top: var(--bew-space-3);
  border-radius: var(--bew-radius-sm);
}
.moments-skeleton-card__line--short {
  width: 58%;
  margin-top: var(--bew-space-2);
}
.moments-skeleton-card__footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  gap: var(--bew-space-6);
  height: 42px;
  padding: 0 34px;
  border-top: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 72%);
}
.moments-skeleton-card__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
}
.moments-skeleton-card__author {
  display: block;
  width: 92px;
  height: 12px;
  border-radius: var(--bew-radius-sm);
}
.moments-skeleton-card__time {
  display: block;
  width: 58px;
  height: 8px;
  border-radius: var(--bew-radius-sm);
}
.moments-skeleton-card__action {
  height: 11px;
  border-radius: var(--bew-radius-sm);
}
.moments-filter-header {
  position: relative;
  grid-area: header;
  display: grid;
  grid-template-columns: minmax(0, max-content);
  justify-content: start;
  justify-self: start;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.moments-filter-header--center {
  justify-content: center;
}

.moments-filter-panel {
  max-width: 100%;
}
.moments-filter-scroll {
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.moments-filter-scroll::-webkit-scrollbar {
  display: none;
}
.moments-filter-inside {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--bew-control-gap);
  width: max-content;
  height: 100%;
  box-sizing: border-box;
}
@media (max-width: 1000px) {
  .moments-filter-panel {
    max-width: 100%;
  }
}
@media (max-width: 600px) {
  .moments-filter-header {
    grid-template-columns: minmax(0, 1fr);
  }
}
.moments-page__empty button {
  border: 1px solid var(--bew-border-color);
  min-height: var(--bew-control-height);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-elevated);
  color: var(--bew-text-1);
  padding: 0 var(--bew-space-4);
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-normal) var(--bew-ease-standard);
}
.moments-page__empty button:hover {
  color: #fff;
  background: var(--bew-theme-color);
  border-color: var(--bew-theme-color);
}
.moments-page__empty button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.moments-grid {
  display: grid;
  width: 100%;
  justify-content: center;
  justify-items: stretch;
  /* 虚拟 spacer 会持续变化，禁用浏览器自动锚定以免与滚动输入互相拉扯 */
  overflow-anchor: none;
}
.moments-grid__column {
  display: flex;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  flex-direction: column;
  /* 与 JS 的 GRID_GAP 一致 */
  gap: var(--bew-space-5);
}
.moments-grid :deep(.moment-card) {
  width: 100%;
  max-width: 100%;
}
.moments-grid__spacer {
  flex: 0 0 auto;
  width: 100%;
  pointer-events: none;
}

@container (max-width: 359px) {
  .moments-skeleton-card__main {
    display: block;
  }

  .moments-skeleton-card__cover {
    min-height: 0;
  }

  .moments-skeleton-card__body {
    padding-top: 16px;
  }
}

@media (max-width: 720px) {
  .moments-page {
    padding-right: 8px;
    padding-left: 8px;
  }
}
.moments-page__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  height: 32px;
  margin: var(--bew-space-5) 0 0;
  color: var(--bew-text-2);
  text-align: center;
  font-size: var(--bew-font-size-control);
  visibility: hidden;
  opacity: 0;
  overflow-anchor: none;
  transition: opacity 0.16s ease;
}
.moments-page__loading.is-visible {
  visibility: visible;
  opacity: 1;
}
.moments-wanted-load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  min-width: 124px;
  height: var(--bew-control-height);
  margin: var(--bew-space-5) auto var(--bew-space-12);
  padding: 0 var(--bew-space-4);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius-full);
  color: var(--bew-text-1);
  background: var(--bew-elevated);
  font: inherit;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-normal) var(--bew-ease-standard);
}
.moments-wanted-load-more:hover {
  color: #fff;
  border-color: var(--bew-theme-color);
  background: var(--bew-theme-color);
}
.moments-page__empty {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-3);
  color: var(--bew-text-2);
}
.moments-page__empty p {
  margin: 0;
}
.moment-detail-frame {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: var(--bew-panel-radius);
  overflow: hidden;
  background: var(--bew-bg);
}
.moment-detail-frame--player {
  // 响应式 Dialog 约束高度，视频/直播详情在 iframe 内部滚动
  overflow: hidden;
  background: #000;
  min-height: 0;
  max-height: 100%;
}
.moment-detail-frame--opus {
  // 与 Dialog 共用圆角裁切，避免内层再套一层圆角挤出白边
  min-height: 0;
  border-radius: inherit;
  background: var(--bew-bg);
}
.moment-detail-frame__loading {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  color: var(--bew-text-2);
  background: var(--bew-bg);
  font-size: var(--bew-font-size-control);
  pointer-events: auto;
  opacity: 1;
  transition: opacity 0.18s ease;
}
.moment-detail-frame__loading-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex-shrink: 0;
}
.moment-detail-frame:not(.is-loading) .moment-detail-frame__loading {
  opacity: 0;
  pointer-events: none;
}
.moment-detail-frame__iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--bew-bg);
  // 允许 iframe 文档内部滚动（视频评论区、直播简介等）
  overflow: auto;
}
.moment-detail-actions {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
.moment-detail-actions__bar {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  pointer-events: auto;
  transform: translateY(calc(100% + var(--bew-space-3)));
}
.moment-detail-actions__close {
  display: grid;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--bew-radius-full);
  place-items: center;
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-shadow: var(--bew-shadow-2);
  cursor: pointer;
  font-size: var(--bew-icon-size-md);
}
.moment-detail-actions__close:hover {
  background: var(--bew-elevated-solid-hover);
}
.moment-detail-actions__close:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 2px;
}
.moment-detail-actions__open {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-radius-full);
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-shadow: var(--bew-shadow-2);
  text-decoration: none;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  opacity: 0.92;
  transition: opacity 0.2s ease;
}
.moment-detail-actions__open:hover {
  opacity: 1;
}
.moment-detail-actions__open.is-hidden {
  display: none;
}
.moment-image-viewer {
  position: fixed;
  inset: 0;
  z-index: var(--bew-z-image-viewer);
  overflow: hidden;
  color: #fff;
  background: rgb(18 18 18 / 76%);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  touch-action: none;
}
.moment-image-viewer__stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 24px 72px 96px;
  overflow: hidden;
}
.moment-image-viewer__image {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  border: 0 !important;
  outline: 0 !important;
  border-radius: 0;
  box-shadow: none !important;
  object-fit: contain;
  transform-origin: center center;
  transition: transform 0.12s ease-out;
  user-select: none;
  -webkit-user-drag: none;
  cursor: zoom-in;
}
.moment-image-viewer__image.is-zoomed {
  cursor: grab;
}
.moment-image-viewer__image.is-dragging {
  cursor: grabbing;
  transition: none;
}
.moment-image-viewer__close,
.moment-image-viewer__nav,
.moment-image-viewer__toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;
  border: 0 !important;
  outline: 0;
  color: #fff;
  background: rgb(0 0 0 / 48%);
  box-shadow: none !important;
  font-family: inherit;
  cursor: pointer;
}
.moment-image-viewer__close:hover,
.moment-image-viewer__nav:hover,
.moment-image-viewer__toolbar button:hover {
  background: rgb(0 0 0 / 72%);
}
.moment-image-viewer__close {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 4;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  font-size: var(--bew-icon-size-lg);
}
.moment-image-viewer__nav {
  position: absolute;
  top: 50%;
  z-index: 4;
  width: 44px;
  height: 56px;
  border-radius: var(--bew-radius-md);
  transform: translateY(-50%);
  font-size: var(--bew-icon-size-xl);
  line-height: 1;
}
.moment-image-viewer__nav--prev {
  left: 16px;
}
.moment-image-viewer__nav--next {
  right: 16px;
}
.moment-image-viewer__toolbar {
  position: absolute;
  left: 50%;
  bottom: 24px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2) var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-radius-full);
  background: rgb(0 0 0 / 58%);
  box-shadow: 0 8px 30px rgb(0 0 0 / 28%);
  transform: translateX(-50%);
  white-space: nowrap;
}
.moment-image-viewer__toolbar button {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: transparent;
  font-size: var(--bew-icon-size-md);
}
.moment-image-viewer__counter,
.moment-image-viewer__zoom {
  min-width: 48px;
  text-align: center;
  font-size: var(--bew-font-size-control);
  font-variant-numeric: tabular-nums;
}
.moment-image-viewer__divider {
  width: 1px;
  height: 24px;
  margin: 0 var(--bew-space-1);
  background: rgb(255 255 255 / 24%);
}
@media (max-width: 640px) {
  .moment-image-viewer__stage {
    padding: 68px 12px 92px;
  }
  .moment-image-viewer__nav {
    top: auto;
    bottom: 24px;
    width: 36px;
    height: 42px;
    transform: none;
  }
}
@keyframes moment-shimmer {
  to {
    background-position: -400% 0;
  }
}
</style>
