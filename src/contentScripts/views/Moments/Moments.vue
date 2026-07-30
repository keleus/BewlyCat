<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useToast } from 'vue-toastification'

import Dialog from '~/components/Dialog.vue'
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import Tooltip from '~/components/Tooltip.vue'
import VideoWatchedTag from '~/components/VideoWatchedTag.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useStorageLocal } from '~/composables/useStorageLocal'
import { settings } from '~/logic'
import { momentsWantedUsers } from '~/logic/storage'
import type { DataItem, MomentResult } from '~/models/moment/moment'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF } from '~/utils/main'
import { recordVideoVisit } from '~/utils/videoVisitHistory'

const loadingGifUrl = browser.runtime.getURL('/assets/loading.gif')

interface DisplayMoment {
  id: string
  author: { mid: string, name: string, face: string }
  publishedAt: number
  title: string
  text: string
  richText: DisplayRichTextSegment[]
  images: string[]
  time: string
  likeCount: number
  isLiked: boolean
  isLikeDisabled: boolean
  commentCount: number
  url: string
  isVideo: boolean
  /** 追番追剧类 PGC 动态 */
  isPgc: boolean
  isLive: boolean
  /** 充电专属动态（未解锁时列表可能无正文/图片） */
  isChargeExclusive: boolean
  /** 转发动态：详情不做图片左置分栏，快速直出 */
  isForward: boolean
  /** 专栏动态：详情走专栏布局（可有目录） */
  isArticle: boolean
  /** 是否带有“UP主的推荐”附加信息，用于整条动态过滤 */
  isUpRecommendation: boolean
  /** 是否为视频预约动态，用于整条动态过滤 */
  isVideoReservation: boolean
  /** 是否为直播预约动态，用于整条动态过滤 */
  isLiveReservation: boolean
  chargeBadge?: string
  chargeHint?: string
  chargeCover?: string
  mediaMeta: string
  liveArea: string
  livePopularity: string
  roomId?: number
  duration: string
  videoPlay: string
  videoDanmaku: string
  aid?: number | string
  bvid?: string
  videoUrl?: string
  additional?: DisplayAdditional
  forward?: {
    author: string
    title: string
    text: string
    fallback: string
    video?: DisplayForwardVideo
  }
}

interface DisplayForwardVideo {
  title: string
  cover: string
  duration: string
  play: string
  danmaku: string
  url: string
  aid?: number | string
  bvid?: string
}

interface DisplayAdditional {
  title: string
  desc: string
  cover: string
  action: string
  url: string
  isUpRecommendation: boolean
  isVideoReservation: boolean
  isLiveReservation: boolean
}

interface WatchLaterTarget {
  aid?: number | string
  bvid?: string
}

interface DisplayRichTextSegment {
  type: 'text' | 'emoji' | 'link'
  text: string
  imageUrl?: string
  url?: string
  size?: number
}

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

interface MomentsPortalResult {
  code: number
  data?: {
    my_info?: MomentsPortalUser
    live_users?: {
      count?: number
      items?: MomentsPortalLiveUser[]
    }
  }
}

/** 动态流 features：补齐 opus 图文与充电列表字段 */
const MOMENT_FEED_FEATURES = 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard'
const toast = useToast()
const topBarStore = useTopBarStore()

const moments = ref<DisplayMoment[]>([])
type MomentFilter = 'all' | 'video' | 'pgc' | 'article'
const momentFilters: Array<{ value: MomentFilter, label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'video', label: '视频投稿' },
  { value: 'pgc', label: '追番追剧' },
  { value: 'article', label: '专栏' },
]
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
const momentsFeedCache = useStorageLocal<MomentsFeedCache>('momentsFeedCache', {}, {
  writeDefaults: false,
  onReady: () => resolveMomentsFeedCacheReady?.(),
})
type MomentGroup = 'all' | 'wanted'
const activeMomentGroup = ref<MomentGroup>('all')
const wantedCacheCursor = ref(0)
const portalUser = ref<MomentsPortalUser | null>(null)
const portalLiveUsers = ref<MomentsPortalLiveUser[]>([])
const portalLiveCount = ref(0)
const isPortalLoading = ref(true)
const showMomentsSidebar = ref(true)
const momentColumns = ref<DisplayMoment[][]>([])
const selectedMoment = ref<DisplayMoment | null>(null)
const detailFrameUrl = ref('')
const detailFrameLoaded = ref(false)
const detailIframeRef = ref<HTMLIFrameElement | null>(null)
const detailImageViewerRef = ref<HTMLElement | null>(null)
const detailImageViewerOpen = ref(false)
const detailImageViewerUrls = ref<string[]>([])
const detailImageViewerIndex = ref(0)
const detailImageViewerScale = ref(1)
const detailImageViewerRotation = ref(0)
const detailImageViewerPanX = ref(0)
const detailImageViewerPanY = ref(0)
const detailImageViewerSource = shallowRef<Window | null>(null)
let detailLoadTimer: ReturnType<typeof setTimeout> | null = null
const layoutRef = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)
/** 宽卡信息流最多三列 */
const CARD_MAX_WIDTH = 520
const CARD_MIN_WIDTH = 360
const CARD_COMPACT_MIN_WIDTH = 260
const GRID_GAP = 16
const SIDEBAR_WIDTH = 248
const SIDEBAR_MIN_LAYOUT_WIDTH = SIDEBAR_WIDTH + GRID_GAP + CARD_MIN_WIDTH
const gridColumnCount = ref(1)
const gridCardWidth = ref(CARD_MAX_WIDTH)
let rebalanceTimer: ReturnType<typeof setTimeout> | null = null
const hoveredMediaId = ref('')
const previewUrls = reactive<Record<string, string>>({})
const likingMomentIds = reactive(new Set<string>())
const videoCidCache = new Map<string, number>()
const videoCidRequests = new Map<string, Promise<number | undefined>>()
const videoAspectRatios = reactive<Record<string, number>>({})
const videoAspectRatioRequests = new Map<string, Promise<number | undefined>>()
const cardHeights = reactive<Record<string, number>>({})
const visibleMomentIds = reactive(new Set<string>())
const readyCoverIds = reactive(new Set<string>())
const readyCardIds = reactive(new Set<string>())
const enteringCardIds = reactive(new Set<string>())
const togglingWatchLaterAids = reactive(new Set<number>())
const revealedCardIds = new Set<string>()
const cardEnterTimers = new Map<string, ReturnType<typeof setTimeout>>()
const cardElements = new Map<string, HTMLElement>()
interface VirtualColumn {
  topPad: number
  bottomPad: number
  items: DisplayMoment[]
}
const virtualColumns = ref<VirtualColumn[]>([])
/** 单图宽高比（宽/高），比 1:2 更长的竖图才裁剪 */
const coverRatios = reactive<Record<string, number>>({})
const longImageIds = reactive(new Set<string>())
const MIN_SINGLE_IMAGE_RATIO = 1 / 2
const LONG_IMAGE_DISPLAY_RATIO = 3 / 4
const STACKED_SINGLE_IMAGE_RATIO = 4 / 3
let gridObserver: ResizeObserver | undefined
let liveFlvPlayer: any = null
let liveHlsPlayer: any = null
const isLoading = ref(false)
const isInitialLoading = ref(true)
const noMoreContent = ref(false)
const offset = ref('')
const updateBaseline = ref('')
const { handlePageRefresh, handleReachBottom, mainAppRef, scrollViewportRef } = useBewlyApp()
const OVERSCAN_PX = 1200
const MAX_PREVIEW_CACHE = 12
const MAX_VIDEO_CID_CACHE = 80
const MAX_POST_LOAD_AUTOFILL_PAGES = 3
const WANTED_SCAN_LIMIT = 100
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

function httpsUrl(url = '') {
  return url.replace(/^http:/, 'https:')
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

function getMomentThumbnailUrl(url = '', width = 560) {
  const normalized = httpsUrl(url).replace(/@[^/]*$/, '')
  if (!normalized || !/hdslb\.com|biliimg\.com|bilivideo\.com|bilibili\.com/.test(normalized))
    return normalized
  return `${normalized}@${width}w.webp`
}

function getAvatarThumbnailUrl(url = '') {
  const normalized = httpsUrl(url).replace(/@[^/]*$/, '')
  if (!normalized || !/hdslb\.com|biliimg\.com|bilibili\.com/.test(normalized))
    return normalized
  return `${normalized}@48w_48h_1c.webp`
}

function getSidebarAvatarUrl(url = '', size = 96) {
  const normalized = httpsUrl(url).replace(/@[^/]*$/, '')
  if (!normalized || !/hdslb\.com|biliimg\.com|bilibili\.com/.test(normalized))
    return normalized
  return `${normalized}@${size}w_${size}h_1c.webp`
}

function formatCount(value: number) {
  return value > 9999 ? `${(value / 10000).toFixed(1)}万` : value || 0
}

function getWatchLaterAid(target: WatchLaterTarget) {
  const aid = Number(target.aid)
  return Number.isFinite(aid) && aid > 0 ? aid : undefined
}

function isInWatchLater(target: WatchLaterTarget) {
  const aid = getWatchLaterAid(target)
  return aid ? topBarStore.addedWatchLaterList.includes(aid) : false
}

function isWatchLaterToggling(target: WatchLaterTarget) {
  const aid = getWatchLaterAid(target)
  return aid ? togglingWatchLaterAids.has(aid) : false
}

function setMomentWatchLaterState(aid: number, added: boolean) {
  const index = topBarStore.addedWatchLaterList.indexOf(aid)

  if (added && index === -1) {
    topBarStore.addedWatchLaterList.push(aid)
    return
  }

  if (!added && index !== -1)
    topBarStore.addedWatchLaterList.splice(index, 1)
}

async function toggleWatchLater(target: WatchLaterTarget) {
  const aid = getWatchLaterAid(target)
  if (!aid || togglingWatchLaterAids.has(aid))
    return

  const isAdded = isInWatchLater(target)
  togglingWatchLaterAids.add(aid)

  try {
    const res = isAdded
      ? await api.watchlater.removeFromWatchLater({ aid, csrf: getCSRF() })
      : await api.watchlater.saveToWatchLater({
          ...(target.bvid ? { bvid: target.bvid } : { aid }),
          csrf: getCSRF(),
        })

    if (res.code === 0) {
      setMomentWatchLaterState(aid, !isAdded)
      void topBarStore.syncWatchLaterState()
    }
    else {
      toast.error(res.message)
    }
  }
  finally {
    togglingWatchLaterAids.delete(aid)
  }
}

/** 卡片文字预览：展示正文开头，不出现“点击查看详情”类占位 */
function getCardPreviewText(moment: DisplayMoment) {
  const text = (moment.text || '').trim()
  if (text)
    return text

  if (moment.isChargeExclusive) {
    const chargeText = (moment.chargeHint || moment.chargeBadge || '充电专属动态').trim()
    if (chargeText)
      return chargeText
  }

  // 纯文字/无封面时，尽量用转发原文顶上预览
  if (!moment.images.length && !moment.isVideo && !moment.isLive) {
    const forwardText = (moment.forward?.text || moment.forward?.title || '').trim()
    if (forwardText)
      return forwardText
  }

  return ''
}

function isLandscapeSingleImage(moment: DisplayMoment) {
  return !moment.isVideo
    && !moment.isLive
    && moment.images.length === 1
    && (coverRatios[moment.id] || 0) > STACKED_SINGLE_IMAGE_RATIO
}

function isCompactPlainTextMoment(moment: DisplayMoment) {
  return !moment.images.length
    && !moment.isVideo
    && !moment.isLive
    && !moment.isChargeExclusive
    && !moment.title
    && !moment.forward
    && !moment.additional
}

function isLongSingleImage(moment: DisplayMoment) {
  return !moment.isVideo
    && !moment.isLive
    && moment.images.length === 1
    && longImageIds.has(moment.id)
}

function getSingleImageDisplayRatio(moment: DisplayMoment) {
  return isLongSingleImage(moment)
    ? LONG_IMAGE_DISPLAY_RATIO
    : (coverRatios[moment.id] || MIN_SINGLE_IMAGE_RATIO)
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
  if (!image)
    return ''
  if (typeof image === 'string')
    return image
  return image.src || image.url || image.img_src || image.live_cover || ''
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
        text: text || emoji?.text || '表情',
        imageUrl,
        size: Number(emoji?.size || 1),
      }]
    }

    const isSupportedLink = node?.type === 'RICH_TEXT_NODE_TYPE_TOPIC'
      || node?.type === 'RICH_TEXT_NODE_TYPE_WEB'
    const url = isSupportedLink ? normalizeRichTextJumpUrl(node?.jump_url) : ''
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
    buttonText: pickText(button.text, '充电解锁'),
    buttonUrl: button.jump_url || '',
  }
}

function getAdditionalActionText(button: any) {
  if (!button || typeof button !== 'object')
    return '查看'

  // 直播预约：1 为未预约，2 为已预约，必须按状态选择对应文案
  if (Number(button.type) === 2) {
    return Number(button.status) === 2
      ? pickText(button.check?.text, '已预约')
      : pickText(button.uncheck?.text, '预约')
  }

  return pickText(button.jump_style?.text, button.text, '查看')
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
  const images = [...drawItems, ...opusImages, ...articleCovers]
    .map(extractImageUrl)
    .filter(Boolean)
    .filter((url: string, index: number, list: string[]) => list.indexOf(url) === index)

  const live = parseLiveInfo(major.live_rcmd?.content) || major.live || null
  const cover = live?.cover
    || major.archive?.cover
    || major.pgc?.cover
    || major.opus?.cover
    || major.common?.cover
    || major.music?.cover
    || major.upower_common?.cover
  const archive = major.archive || major.pgc || {}
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
    ? `${formatCount(Number(live.online))} 人气`
    : pickText(live?.desc_second)

  const chargeBadge = pickText(iconBadge.text, isChargeExclusive ? '充电专属' : '')
  const chargeCover = httpsUrl(iconBadge.render_img || iconBadge.icon || blocked?.cover || '')
  const chargeHint = pickText(
    blocked?.hint,
    isChargeExclusive ? '加入当前 UP 主的充电即可解锁观看' : '',
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
    text = chargeHint || '充电专属动态'

  let additionalView = additional.type
    ? {
        title: pickText(additionalCard.head_text, additionalCard.title, additionalCard.desc?.text),
        desc: pickText(
          typeof additionalCard.desc1 === 'string' ? additionalCard.desc1 : additionalCard.desc1?.text,
          typeof additionalCard.desc2 === 'string' ? additionalCard.desc2 : additionalCard.desc2?.text,
          additionalCard.desc,
        ),
        cover: httpsUrl(additionalCard.cover || additionalCard.icon || ''),
        action: getAdditionalActionText(additionalCard.button),
        url: additionalCard.jump_url || additionalCard.button?.jump_url || '',
        isUpRecommendation: additional.type === 'ADDITIONAL_TYPE_UP_RCMD'
          || pickText(additionalCard.head_text, additionalCard.title) === 'UP主的推荐',
        isVideoReservation: additional.type === 'ADDITIONAL_TYPE_RESERVE'
          && Number(additionalCard.button?.type) === 1,
        isLiveReservation: additional.type === 'ADDITIONAL_TYPE_RESERVE'
          && Number(additionalCard.button?.type) === 2,
      }
    : undefined

  // 未解锁充电：构造充电卡片附加区（列表没有 additional 时）
  if (!additionalView && isChargeExclusive && (blocked?.buttonUrl || chargeBadge)) {
    additionalView = {
      title: chargeBadge || '充电专属',
      desc: chargeHint,
      // 充电档位区不展示小图标
      cover: '',
      action: blocked?.buttonText || '去充电',
      url: blocked?.buttonUrl || '',
      isUpRecommendation: false,
      isVideoReservation: false,
      isLiveReservation: false,
    }
  }

  return {
    title: pickText(live?.title, opus.title, archive.title, article.title, common.title),
    text,
    richText,
    images: [...images, ...(cover ? [cover] : [])].map(httpsUrl).filter(Boolean).filter((url: string, index: number, list: string[]) => list.indexOf(url) === index),
    isVideo: item.type === 'DYNAMIC_TYPE_AV' || Boolean(major.archive || major.pgc),
    isPgc: item.type === 'DYNAMIC_TYPE_PGC_UNION' || Boolean(major.pgc),
    isLive: Boolean(live),
    isChargeExclusive,
    chargeBadge,
    chargeHint,
    chargeCover,
    roomId: live?.room_id ? Number(live.room_id) : undefined,
    duration: archive.duration_text || '',
    aid: archive.aid || undefined,
    bvid: archive.bvid || undefined,
    videoUrl: archive.jump_url ? httpsUrl(archive.jump_url.startsWith('//') ? `https:${archive.jump_url}` : archive.jump_url) : undefined,
    videoPlay: pickText(archive.stat?.play),
    videoDanmaku: pickText(archive.stat?.danmaku),
    mediaMeta: live
      ? liveArea
      : (isChargeExclusive ? (chargeBadge || '充电专属') : (archive.duration_text || article.label || '')),
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
  // 转发 / 专栏：通过 query 告知 iframe 布局策略
  if (moment.isForward || moment.isArticle) {
    try {
      const url = new URL(moment.url)
      if (moment.isForward)
        url.searchParams.set('bewly_opus_plain', '1')
      if (moment.isArticle)
        url.searchParams.set('bewly_opus_article', '1')
      return url.toString()
    }
    catch {
      const join = moment.url.includes('?') ? '&' : '?'
      const params = [
        moment.isForward ? 'bewly_opus_plain=1' : '',
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

function isPlayerMoment(moment: DisplayMoment | null | undefined) {
  return Boolean(moment?.isVideo || moment?.isLive)
}

function getDimensionAspectRatio(dimension: any) {
  let width = Number(dimension?.width || 0)
  let height = Number(dimension?.height || 0)
  const rotation = Math.abs(Number(dimension?.rotate || 0)) % 180
  if (rotation === 90)
    [width, height] = [height, width]
  return width > 0 && height > 0 ? width / height : undefined
}

/** 图文：小红书 note 风格固定宽高；视频/直播：按视口比例缩放 */
const isOpusDetailMoment = computed(() => Boolean(selectedMoment.value && !isPlayerMoment(selectedMoment.value)))

/** 播放器弹窗保持现有高度；横屏按 17:9 收窄，竖屏额外预留右侧页面布局宽度。 */
const PLAYER_DIALOG_SCALE = 0.92
const selectedVideoAspectRatio = computed(() => {
  const moment = selectedMoment.value
  if (!moment?.isVideo || moment.isLive || moment.isPgc)
    return undefined
  return (moment.bvid ? videoAspectRatios[moment.bvid] : undefined)
    || coverRatios[moment.id]
})
const isSelectedVerticalVideo = computed(() => {
  const ratio = selectedVideoAspectRatio.value
  return Boolean(ratio && ratio < 0.9)
})

const detailDialogWidth = computed(() => {
  if (selectedMoment.value?.isLive)
    return `${PLAYER_DIALOG_SCALE * 100}vw`
  if (selectedMoment.value?.isVideo) {
    if (isSelectedVerticalVideo.value) {
      const ratio = Math.max(0.4, selectedVideoAspectRatio.value || 9 / 16)
      return `min(max(960px, calc(${PLAYER_DIALOG_SCALE * 100}dvh * ${ratio} + 420px)), calc(100vw - 32px))`
    }
    return `min(calc(${PLAYER_DIALOG_SCALE * 100}dvh * 17 / 9), calc(100vw - 32px))`
  }
  // 参考小红书 note-container: 1088px
  return 'min(1088px, calc(100vw - 64px))'
})

const detailDialogHeight = computed(() => {
  if (isPlayerMoment(selectedMoment.value))
    // 与宽度使用同一缩放比例，整体接近原网页可视区域比例
    return `${PLAYER_DIALOG_SCALE * 100}dvh`
  // 上下各 32px：height: calc(100% - 2 * 32px)
  return 'calc(100dvh - 64px)'
})

const detailDialogTopOffset = computed(() => {
  if (isPlayerMoment(selectedMoment.value))
    return undefined
  return 32
})

const detailContentHeight = computed(() => {
  if (isPlayerMoment(selectedMoment.value)) {
    return `${PLAYER_DIALOG_SCALE * 100}dvh`
  }
  return 'calc(100dvh - 64px)'
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

function closeDetailImageViewer() {
  if (!detailImageViewerOpen.value)
    return

  try {
    detailImageViewerSource.value?.postMessage({
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
  detailImageViewerDragging.value = false
  resetDetailImageViewerTransform()
  nextTick(() => detailIframeRef.value?.focus())
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

function shouldOpenMomentInNewTab(moment: DisplayMoment) {
  return moment.isLive
    || settings.value.momentsCardOpenMode === 'newTab'
    || window.innerWidth <= DETAIL_DIALOG_MIN_WIDTH
}

function openMomentInNewTab(moment: DisplayMoment) {
  const url = resolveDetailUrl(moment) || moment.url
  if (!url)
    return

  hoveredMediaId.value = ''
  cleanupLivePreviewPlayer()
  if (previewUrls[moment.id])
    delete previewUrls[moment.id]
  window.open(url, '_blank', 'noopener,noreferrer')
}

function openMomentDetail(moment: DisplayMoment) {
  if (moment.isVideo && !moment.isLive)
    recordVideoVisit(moment)

  // 小屏与直播直接使用新标签页，避免狭窄 Dialog 和跨域直播页占用资源
  if (shouldOpenMomentInNewTab(moment)) {
    openMomentInNewTab(moment)
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
  // 打开详情时释放悬停预览资源
  hoveredMediaId.value = ''
  cleanupLivePreviewPlayer()
  clearDetailLoadTimer()
  destroyDetailIframe()
  // 视频/直播、转发：load 后即可；图文等待布局 ready
  // 兜底避免遮罩卡住
  const fallbackMs = isPlayerMoment(moment)
    ? 1800
    : moment.isForward
      ? 1200
      : 4500
  detailLoadTimer = setTimeout(() => {
    detailFrameLoaded.value = true
  }, fallbackMs)
}

function handleDetailIframeLoad(event: Event) {
  clearDetailLoadTimer()

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

  // 视频/直播、转发：load 后立即显示，不做「整理动态」等待
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

function mapMoment(item: DataItem): DisplayMoment {
  const raw = item as any
  const author = raw.modules?.module_author || {}
  const dynamic = raw.modules?.module_dynamic || {}
  const isForward = raw.type === 'DYNAMIC_TYPE_FORWARD' && raw.orig
  const contentRaw = isForward ? raw.orig : raw
  const content = getMomentContent(contentRaw)
  const forwardedArchive = isForward
    ? contentRaw.modules?.module_dynamic?.major?.archive
    : undefined
  // 转发时作者侧也可能挂充电角标
  const selfContent = isForward ? getMomentContent(raw) : content
  const forwardedAuthor = contentRaw.modules?.module_author || {}
  const id = raw.id_str || raw.id || `${author.mid}-${author.pub_ts}`
  const text = isForward
    ? (normalizeDescText(dynamic.desc) || '转发了动态')
    : content.text
  const richText = isForward
    ? extractRichTextSegments(dynamic.desc?.rich_text_nodes)
    : content.richText
  const additional = content.additional || selfContent.additional
  const isChargeExclusive = content.isChargeExclusive || selfContent.isChargeExclusive

  return {
    id,
    author: {
      mid: String(author.mid || ''),
      name: author.name || 'B站用户',
      face: httpsUrl(author.face || ''),
    },
    publishedAt: Number(author.pub_ts || 0),
    title: content.title,
    text,
    richText,
    // 转发卡片只展示原动态摘要，不能把原动态图片提升为外层卡片媒体。
    images: isForward || (isChargeExclusive && !content.isVideo) ? [] : content.images,
    time: author.pub_time || '',
    likeCount: Number(raw.modules?.module_stat?.like?.count || 0),
    isLiked: raw.modules?.module_stat?.like?.status === true
      || Number(raw.modules?.module_stat?.like?.status) === 1,
    isLikeDisabled: Boolean(
      raw.modules?.module_stat?.like?.forbidden
      || raw.modules?.module_stat?.like?.disabled,
    ),
    commentCount: Number(raw.modules?.module_stat?.comment?.count || 0),
    url: `https://www.bilibili.com/opus/${id}`,
    // 转发视频仍然是“转发动态”；原视频由卡片内的独立视频摘要展示。
    isVideo: !isForward && content.isVideo,
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
          author: forwardedAuthor.name || '原作者',
          title: content.title,
          text: content.text,
          fallback: content.isChargeExclusive
            ? (content.chargeBadge || '充电专属动态')
            : content.isLive
              ? '直播动态'
              : content.isVideo
                ? '视频动态'
                : content.images.length
                  ? '图文动态'
                  : content.text
                    ? '纯文字动态'
                    : '原动态',
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
  const columnWidth = Math.max(CARD_COMPACT_MIN_WIDTH, gridCardWidth.value || CARD_MAX_WIDTH)
  if (isCompactPlainTextMoment(moment)) {
    const charsPerLine = Math.max(12, Math.floor((columnWidth - 32) / 14))
    const lineCount = Math.min(7, Math.max(1, (moment.text || '').split('\n').reduce(
      (total, line) => total + Math.max(1, Math.ceil(Array.from(line).length / charsPerLine)),
      0,
    )))
    return 118 + lineCount * 21
  }
  if (moment.forward?.video) {
    const introLines = Math.min(7, Math.max(1, Math.ceil((moment.text || '').length / 28)))
    return 238 + introLines * 21
  }
  if (moment.isChargeExclusive && !moment.isVideo)
    return 230
  if (columnWidth < CARD_MIN_WIDTH) {
    if (moment.isVideo || moment.isLive)
      return Math.round(columnWidth * 9 / 16) + 210
    if (moment.images.length)
      return Math.round(columnWidth / getSingleImageDisplayRatio(moment)) + 210
  }
  if (moment.isLive)
    return Math.round((columnWidth - 32) * 9 / 16) + 190
  if (moment.isVideo) {
    const mediaWidth = Math.max(170, (columnWidth - 32) * 0.44)
    return Math.round(mediaWidth * 9 / 16) + 120 + (moment.additional ? 68 : 0)
  }
  if (moment.images.length === 1) {
    const contentWidth = Math.max(0, columnWidth - 32)
    if (isLandscapeSingleImage(moment))
      return Math.round(contentWidth / (coverRatios[moment.id] || 1)) + 230
    const mediaWidth = Math.max(170, (contentWidth - 14) * 0.44)
    return Math.round(mediaWidth / getSingleImageDisplayRatio(moment)) + 120
  }
  if (moment.images.length > 1) {
    const galleryRatio = moment.images.length <= 3
      ? moment.images.length
      : moment.images.length <= 4
        ? 1
        : moment.images.length <= 6
          ? 3 / 2
          : 1
    return Math.round((columnWidth - 32) / galleryRatio) + 220
  }
  return 230
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
  if (scrollViewportRef.value)
    scrollViewportRef.value.scrollTop = 0
  void loadMoments(true)
}

function handleMomentGroupChange(group: MomentGroup) {
  if (group === 'wanted' && activeMomentFilter.value !== 'all' && activeMomentFilter.value !== 'video')
    return
  if (activeMomentGroup.value === group)
    return

  activeMomentGroup.value = group
  if (scrollViewportRef.value)
    scrollViewportRef.value.scrollTop = 0
  void loadMoments(true)
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

function passesMomentSettings(moment: DisplayMoment) {
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

/** 按宽卡的最小可读宽度计算列数，空间足够时展示三列，最多三列。 */
function updateGridColumnCount() {
  const layoutWidth = layoutRef.value?.clientWidth || Math.max(CARD_MAX_WIDTH, window.innerWidth - 220)
  const hasSidebarContent = settings.value.momentsSidebarShowUserCard
    || settings.value.momentsSidebarShowPublish
    || settings.value.momentsSidebarShowLive
  showMomentsSidebar.value = hasSidebarContent && layoutWidth >= SIDEBAR_MIN_LAYOUT_WIDTH
  const sidebarSpace = showMomentsSidebar.value ? SIDEBAR_WIDTH + GRID_GAP : 0
  const containerWidth = Math.max(CARD_COMPACT_MIN_WIDTH, layoutWidth - sidebarSpace)
  const maxColumns = 3
  const nextCols = Math.min(
    maxColumns,
    Math.max(1, Math.floor((containerWidth + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP))),
  )
  const availableCardWidth = Math.floor((containerWidth - GRID_GAP * (nextCols - 1)) / nextCols)
  const nextCardWidth = Math.max(CARD_COMPACT_MIN_WIDTH, Math.min(CARD_MAX_WIDTH, availableCardWidth))

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
  if (!viewport || isInitialLoading.value || isLoading.value || noMoreContent.value || !moments.value.length)
    return

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
  const ratio = img.naturalWidth / img.naturalHeight
  const moment = moments.value.find(item => item.id === momentId)
  if (moment && !moment.isVideo && !moment.isLive && moment.images.length === 1)
    longImageIds[ratio < MIN_SINGLE_IMAGE_RATIO ? 'add' : 'delete'](momentId)
  // 普通单图保持完整比例；超过 1:2 的长图在卡片上按 3:4 裁切展示
  const nextRatio = Math.max(ratio, MIN_SINGLE_IMAGE_RATIO)
  const prevRatio = coverRatios[momentId]
  coverRatios[momentId] = nextRatio

  // 封面比例变化会改估算高度；若尚未实测稳定，用估算高度更新并补偿滚动
  if (!settledHeights.has(momentId) && (!prevRatio || Math.abs(prevRatio - nextRatio) > 0.01)) {
    if (moment && !cardHeights[momentId]) {
      commitCardHeight(momentId, estimateCardHeight(moment), { force: true })
      scheduleVirtualUpdate()
    }
  }
}

async function prepareMomentCovers(items: DisplayMoment[], requestToken: number) {
  const imageItems = items.filter(item => item.images[0])
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
        const ratio = image.naturalWidth / image.naturalHeight
        coverRatios[item.id] = Math.max(ratio, MIN_SINGLE_IMAGE_RATIO)
        if (!item.isVideo && !item.isLive && item.images.length === 1)
          longImageIds[ratio < MIN_SINGLE_IMAGE_RATIO ? 'add' : 'delete'](item.id)
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
    image.src = getMomentThumbnailUrl(item.images[0])
  })))
}

function getCoverStyle(moment: DisplayMoment) {
  const ratio = coverRatios[moment.id]
  if (!ratio)
    return undefined
  return { aspectRatio: String(getSingleImageDisplayRatio(moment)) }
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

function handleForwardVideoClick(video: DisplayForwardVideo) {
  recordVideoVisit(video)
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
    toast.warning('登录后才能点赞动态')
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
      throw new Error(response.message || '动态点赞失败')
  }
  catch (error) {
    // 请求失败时恢复接口返回前的状态，避免界面与服务端不一致
    moment.isLiked = previousLiked
    moment.likeCount = previousCount
    toast.error(error instanceof Error ? error.message : '动态点赞失败，请稍后重试')
  }
  finally {
    likingMomentIds.delete(moment.id)
  }
}

async function loadMoments(reset = false, autoFillDepth = 0, wantedManual = false) {
  // “想看”只允许按钮触发后续批次，避免滚动到底自动扫描下一组 100 条。
  if (!reset && activeMomentGroup.value === 'wanted' && !wantedManual)
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
    longImageIds.clear()
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
  }
  const requestToken = feedRequestToken
  const requestType = activeMomentFilter.value
  const requestGroup = activeMomentGroup.value
  let pageApplied = false
  let preservedPaginationScrollTop: number | null = null
  isLoading.value = true
  if (reset) {
    offset.value = ''
    updateBaseline.value = ''
    noMoreContent.value = false
  }

  try {
    let rawItems: DataItem[] = []
    let cachedBatch: DisplayMoment[] | undefined
    let hasMore = false
    let nextOffset = ''
    let nextUpdateBaseline = ''

    if (requestGroup === 'wanted') {
      await momentsFeedCacheReady
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

          while (canContinue && freshItems.length < WANTED_SCAN_LIMIT && !reachedCache) {
            const response = await api.moment.getMoments({
              type: requestType,
              offset: scanOffset || undefined,
              update_baseline: scanUpdateBaseline || undefined,
              features: MOMENT_FEED_FEATURES,
            }) as MomentResult
            if (
              requestToken !== feedRequestToken
              || requestType !== activeMomentFilter.value
              || requestGroup !== activeMomentGroup.value
              || response.code !== 0
            ) {
              return
            }

            const pageItems = (response.data?.items || []).map(mapMoment)
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
        ) {
          const response = await api.moment.getMoments({
            type: requestType,
            offset: cacheEntry.offset || undefined,
            update_baseline: cacheEntry.updateBaseline || undefined,
            features: MOMENT_FEED_FEATURES,
          }) as MomentResult
          if (
            requestToken !== feedRequestToken
            || requestType !== activeMomentFilter.value
            || requestGroup !== activeMomentGroup.value
            || response.code !== 0
          ) {
            return
          }

          const pageItems = (response.data?.items || []).map(mapMoment)
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
    else {
      const response = await api.moment.getMoments({
        type: requestType,
        offset: offset.value || undefined,
        update_baseline: updateBaseline.value || undefined,
        features: MOMENT_FEED_FEATURES,
      }) as MomentResult
      if (
        requestToken !== feedRequestToken
        || requestType !== activeMomentFilter.value
        || requestGroup !== activeMomentGroup.value
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
    if (requestGroup === 'all') {
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
    await prepareMomentCovers(items, requestToken)
    if (
      requestToken !== feedRequestToken
      || requestType !== activeMomentFilter.value
      || requestGroup !== activeMomentGroup.value
    ) {
      return
    }
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
    if (
      requestToken === feedRequestToken
      && requestType === activeMomentFilter.value
      && requestGroup === activeMomentGroup.value
    ) {
      isLoading.value = false
      isInitialLoading.value = false
    }
  }

  if (
    preservedPaginationScrollTop !== null
    && requestToken === feedRequestToken
    && requestType === activeMomentFilter.value
    && requestGroup === activeMomentGroup.value
  ) {
    // 等卡片、虚拟 spacer 和底部加载提示完成更新后，恢复分页前的滚动位置
    await nextTick()
    updateVirtualColumns()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const viewport = scrollViewportRef.value
    if (viewport)
      viewport.scrollTop = preservedPaginationScrollTop
  }

  if (
    !pageApplied
    || noMoreContent.value
    || autoFillDepth >= MAX_POST_LOAD_AUTOFILL_PAGES
    || requestToken !== feedRequestToken
    || requestType !== activeMomentFilter.value
    || requestGroup !== activeMomentGroup.value
  ) {
    return
  }

  // 哨兵分页后可能始终停留在视口内，不会再次触发进入事件；布局稳定后主动补载
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

async function loadMomentsPortal() {
  const requestToken = ++portalRequestToken
  isPortalLoading.value = true
  try {
    const response = await api.moment.getMomentsPortal() as MomentsPortalResult
    if (requestToken !== portalRequestToken || response.code !== 0)
      return

    portalUser.value = response.data?.my_info || null
    portalLiveUsers.value = response.data?.live_users?.items || []
    portalLiveCount.value = response.data?.live_users?.count ?? portalLiveUsers.value.length
  }
  catch {
    if (requestToken === portalRequestToken) {
      portalUser.value = null
      portalLiveUsers.value = []
      portalLiveCount.value = 0
    }
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
  const type = event.data?.type
  if (type === 'BEWLY_OPUS_IMAGE_VIEWER_OPEN') {
    if (event.source !== detailIframeRef.value?.contentWindow)
      return
    const urls = Array.isArray(event.data.urls)
      ? event.data.urls.filter((url: unknown): url is string => typeof url === 'string' && !!url).slice(0, 100)
      : []
    if (!urls.length)
      return

    detailImageViewerUrls.value = urls
    detailImageViewerIndex.value = Math.min(urls.length - 1, Math.max(0, Number(event.data.index) || 0))
    detailImageViewerSource.value = event.source as Window
    detailImageViewerOpen.value = true
    resetDetailImageViewerTransform()
    nextTick(() => detailImageViewerRef.value?.focus({ preventScroll: true }))
    try {
      detailImageViewerSource.value.postMessage({ type: 'BEWLY_OPUS_IMAGE_VIEWER_ACK' }, '*')
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
  window.addEventListener('keydown', handleDetailImageViewerKeydown, true)
  refresh()
  handlePageRefresh.value = refresh
  handleReachBottom.value = () => void loadMoments()
})

onBeforeUnmount(() => {
  gridObserver?.disconnect()
  cardMeasureObserver?.disconnect()
  visibilityObserver?.disconnect()
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
  window.removeEventListener('keydown', handleDetailImageViewerKeydown, true)
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
  () => [
    settings.value.momentsSidebarShowUserCard,
    settings.value.momentsSidebarShowPublish,
    settings.value.momentsSidebarShowLive,
  ],
  async () => {
    await nextTick()
    updateGridColumnCount()
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
  () => [
    settings.value.momentsFilterUpRecommendation,
    settings.value.momentsHideChargeExclusive,
    settings.value.momentsHideVideoReservation,
    settings.value.momentsHideLiveReservation,
    settings.value.momentsHideLiveDynamics,
  ],
  () => {
    if (scrollViewportRef.value)
      scrollViewportRef.value.scrollTop = 0
    void loadMoments(true)
  },
)

watch(
  () => [
    settings.value.momentsEnableLivePreview,
    settings.value.momentsEnableVideoPreview,
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
      :class="{ 'moments-layout--without-sidebar': !showMomentsSidebar }"
    >
      <header class="moments-filter-header">
        <section class="moments-filter-panel bew-segment-control bew-segment-control--surface">
          <div class="moments-filter-scroll">
            <div class="moments-filter-inside">
              <LiquidSegmentIndicator :active-key="activeMomentFilter" />
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
        <div
          class="moments-group-controls bew-segment-control bew-segment-control--surface bew-segment-control--static"
          aria-label="动态分组"
        >
          <button
            type="button"
            class="bew-segment-control__item"
            :data-active="activeMomentGroup === 'all' ? 'true' : undefined"
            :aria-pressed="activeMomentGroup === 'all'"
            @click="handleMomentGroupChange('all')"
          >
            全部动态
          </button>
          <button
            type="button"
            class="bew-segment-control__item"
            :data-active="activeMomentGroup === 'wanted' ? 'true' : undefined"
            :disabled="activeMomentFilter !== 'all' && activeMomentFilter !== 'video'"
            :aria-pressed="activeMomentGroup === 'wanted'"
            @click="handleMomentGroupChange('wanted')"
          >
            想看 <span v-if="momentsWantedUsers.length">{{ momentsWantedUsers.length }}</span>
          </button>
        </div>
      </header>

      <aside v-if="showMomentsSidebar" class="moments-sidebar" aria-label="动态用户信息">
        <div v-if="isPortalLoading" class="moments-sidebar-skeleton" aria-hidden="true">
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
          <article v-if="settings.momentsSidebarShowUserCard && portalUser" class="moments-user-card">
            <a
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
            <div class="moments-user-card__stats">
              <span><strong>{{ portalUser.following }}</strong><small>关注</small></span>
              <span><strong>{{ portalUser.follower }}</strong><small>粉丝</small></span>
              <span><strong>{{ portalUser.dyns }}</strong><small>动态</small></span>
            </div>
          </article>

          <a
            v-if="settings.momentsSidebarShowPublish"
            class="moments-publish-link"
            href="https://t.bilibili.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span i-tabler-edit />
            <span>发布动态</span>
            <span i-tabler-external-link />
          </a>

          <section v-if="settings.momentsSidebarShowLive && portalLiveUsers.length" class="moments-live-card">
            <header>
              <strong>正在直播 <span>{{ portalLiveCount }}</span></strong>
            </header>
            <div class="moments-live-card__list">
              <a
                v-for="liveUser in portalLiveUsers"
                :key="liveUser.room_id"
                :href="liveUser.jump_url || `https://live.bilibili.com/${liveUser.room_id}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span class="moments-live-card__avatar">
                  <img :src="getSidebarAvatarUrl(liveUser.face, 64)" :alt="liveUser.uname" loading="lazy" decoding="async">
                  <em><span i-tabler-chart-bar />直播中</em>
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

      <main class="moments-content" :style="momentsContentStyle">
        <div v-if="isInitialLoading" class="moments-page__initial-loading">
          <div class="moments-skeleton__status">
            <span i-svg-spinners:ring-resize />
            正在准备动态和图片…
          </div>
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
            <article
              v-for="moment in column.items" :key="moment.id"
              :ref="(el) => bindCardEl(el as Element | null, moment)"
              class="moment-card"
              :class="{
                'moment-card--text': !moment.images.length && !moment.isVideo && !moment.isLive && !moment.isChargeExclusive && !moment.forward?.video,
                'moment-card--compact-text': isCompactPlainTextMoment(moment),
                'moment-card--forward-video': !!moment.forward?.video,
                'moment-card--charge': moment.isChargeExclusive,
                'moment-card--preparing': !readyCardIds.has(moment.id),
                'moment-card--entering': enteringCardIds.has(moment.id),
              }"
              tabindex="0"
              role="button"
              @click="openMomentDetail(moment)" @keydown.enter="openMomentDetail(moment)"
            >
              <header class="moment-card__header">
                <img :src="getAvatarThumbnailUrl(moment.author.face)" :alt="moment.author.name" class="moment-card__avatar" loading="lazy" decoding="async">
                <span class="moment-card__identity">
                  <strong>{{ moment.author.name }}</strong>
                  <small>{{ moment.time || '刚刚' }}</small>
                </span>
              </header>

              <div
                class="moment-card__main"
                :class="{
                  'moment-card__main--has-media': (!moment.isChargeExclusive || moment.isVideo) && (
                    (moment.images.length > 0 && (moment.isVideo || moment.isLive))
                    || moment.images.length === 1
                    || (!moment.images.length && (moment.isVideo || moment.isLive))
                  ),
                  'moment-card__main--video': moment.isVideo || (!moment.isChargeExclusive && moment.isLive),
                  'moment-card__main--live': !moment.isChargeExclusive && moment.isLive,
                  'moment-card__main--single-landscape': isLandscapeSingleImage(moment),
                }"
              >
                <div
                  v-if="moment.images.length && (moment.isVideo || moment.isLive)"
                  class="moment-card__media moment-card__cover moment-card__cover--media"
                  @mouseenter="handleMediaEnter(moment)"
                  @mouseleave="handleMediaLeave(moment)"
                >
                  <img
                    :src="getMomentThumbnailUrl(moment.images[0])"
                    :alt="moment.title"
                    :class="{ 'is-ready': readyCoverIds.has(moment.id) }"
                    loading="lazy"
                    decoding="async"
                    @load="handleCoverLoad($event, moment.id)"
                  >
                  <video
                    v-if="hoveredMediaId === moment.id && previewUrls[moment.id]"
                    :ref="(el) => bindPreviewVideo(el as Element | null, moment)"
                    :src="moment.isLive ? undefined : previewUrls[moment.id]"
                    autoplay
                    muted
                    :loop="!moment.isLive"
                    playsinline
                    @canplay="playPreview"
                  />
                  <span
                    v-if="moment.isVideo && (
                      (settings.showVideoCardViewCount && moment.videoPlay)
                      || (settings.showVideoCardDanmakuCount && moment.videoDanmaku)
                      || (settings.showVideoCardDuration && moment.duration)
                    )"
                    class="moment-card__video-stats"
                  >
                    <span class="moment-card__video-stat-group">
                      <span v-if="settings.showVideoCardViewCount && moment.videoPlay">
                        <span i-tabler-player-play aria-hidden="true" />
                        {{ moment.videoPlay }}
                      </span>
                      <span v-if="settings.showVideoCardDanmakuCount && moment.videoDanmaku">
                        <span i-tabler-message-circle aria-hidden="true" />
                        {{ moment.videoDanmaku }}
                      </span>
                    </span>
                    <span v-if="settings.showVideoCardDuration && moment.duration">
                      {{ moment.duration }}
                    </span>
                  </span>
                  <span v-if="moment.isLive" class="moment-card__live-mark">
                    LIVE
                    <span i-svg-spinners:pulse-3 aria-hidden="true" />
                  </span>
                  <span v-if="moment.isChargeExclusive" class="moment-card__charge-badge">
                    {{ moment.chargeBadge || '充电专属' }}
                  </span>
                  <button
                    v-if="moment.isVideo && getWatchLaterAid(moment)"
                    type="button"
                    class="moment-card__watch-later"
                    :class="{ 'is-added': isInWatchLater(moment) }"
                    :disabled="isWatchLaterToggling(moment)"
                    :aria-label="isInWatchLater(moment) ? $t('common.added') : $t('common.save_to_watch_later')"
                    :aria-pressed="isInWatchLater(moment)"
                    @click.stop.prevent="toggleWatchLater(moment)"
                  >
                    <Tooltip v-if="!isInWatchLater(moment)" :content="$t('common.save_to_watch_later')" placement="bottom-right" type="dark">
                      <span i-mingcute:carplay-line aria-hidden="true" />
                    </Tooltip>
                    <Tooltip v-else :content="$t('common.added')" placement="bottom-right" type="dark">
                      <Icon icon="line-md:confirm" aria-hidden="true" />
                    </Tooltip>
                  </button>
                </div>
                <div
                  v-else-if="moment.images.length === 1"
                  class="moment-card__media moment-card__cover moment-card__cover--single"
                  :class="{ 'moment-card__cover--sized': !!coverRatios[moment.id] }"
                  :style="getCoverStyle(moment)"
                >
                  <img
                    :src="getMomentThumbnailUrl(moment.images[0])"
                    :alt="moment.text"
                    :class="{ 'is-ready': readyCoverIds.has(moment.id) }"
                    loading="lazy"
                    decoding="async"
                    @load="handleCoverLoad($event, moment.id)"
                  >
                  <span v-if="isLongSingleImage(moment)" class="moment-card__long-image-mark">长图</span>
                  <span v-if="moment.isChargeExclusive" class="moment-card__charge-badge">
                    {{ moment.chargeBadge || '充电专属' }}
                  </span>
                </div>
                <div v-else-if="(moment.isVideo || moment.isLive) && (!moment.isChargeExclusive || moment.isVideo)" class="moment-card__media moment-card__text-cover moment-card__text-cover--video">
                  <span v-if="moment.isLive" i-tabler-live-photo class="moment-card__text-cover-icon" />
                  <span v-else i-tabler-player-play-filled class="moment-card__text-cover-icon" />
                  <span>{{ moment.isLive ? '直播动态' : '视频动态' }}</span>
                  <button
                    v-if="moment.isVideo && getWatchLaterAid(moment)"
                    type="button"
                    class="moment-card__watch-later"
                    :class="{ 'is-added': isInWatchLater(moment) }"
                    :disabled="isWatchLaterToggling(moment)"
                    :aria-label="isInWatchLater(moment) ? $t('common.added') : $t('common.save_to_watch_later')"
                    :aria-pressed="isInWatchLater(moment)"
                    @click.stop.prevent="toggleWatchLater(moment)"
                  >
                    <Tooltip v-if="!isInWatchLater(moment)" :content="$t('common.save_to_watch_later')" placement="bottom-right" type="dark">
                      <span i-mingcute:carplay-line aria-hidden="true" />
                    </Tooltip>
                    <Tooltip v-else :content="$t('common.added')" placement="bottom-right" type="dark">
                      <Icon icon="line-md:confirm" aria-hidden="true" />
                    </Tooltip>
                  </button>
                </div>

                <div class="moment-card__body">
                  <p v-if="moment.title && !moment.forward?.video" class="moment-card__title">
                    <VideoWatchedTag
                      v-if="moment.isVideo"
                      :aid="moment.aid"
                      :bvid="moment.bvid"
                    />
                    {{ moment.title }}
                  </p>
                  <p
                    v-if="moment.mediaMeta && !moment.isChargeExclusive && (!moment.isVideo || moment.isLive)"
                    class="moment-card__media-meta"
                    :class="{ 'moment-card__media-meta--live': moment.isLive }"
                  >
                    {{ moment.mediaMeta }}
                  </p>
                  <p v-if="!moment.isLive && (moment.richText.length || getCardPreviewText(moment))" class="moment-card__desc">
                    <template v-if="moment.richText.length">
                      <template v-for="(segment, segmentIndex) in moment.richText" :key="`${moment.id}-${segmentIndex}`">
                        <img
                          v-if="segment.type === 'emoji' && segment.imageUrl"
                          :src="segment.imageUrl"
                          :alt="segment.text"
                          :title="segment.text"
                          class="moment-card__emoji"
                          :class="{ 'moment-card__emoji--large': segment.size === 2 }"
                          loading="lazy"
                          decoding="async"
                        >
                        <a
                          v-else-if="segment.type === 'link' && segment.url"
                          :href="segment.url"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="moment-card__rich-link"
                          @click.stop
                        >
                          {{ segment.text }}
                        </a>
                        <template v-else>
                          {{ segment.text }}
                        </template>
                      </template>
                    </template>
                    <template v-else>
                      {{ getCardPreviewText(moment) }}
                    </template>
                  </p>
                  <a
                    v-if="moment.forward?.video"
                    :href="moment.forward.video.url || undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="moment-card__forward-video"
                    :aria-label="`打开原视频：${moment.forward.video.title}`"
                    @click.stop="handleForwardVideoClick(moment.forward.video)"
                  >
                    <span class="moment-card__forward-video-cover">
                      <img
                        :src="getMomentThumbnailUrl(moment.forward.video.cover)"
                        :alt="moment.forward.video.title"
                        loading="lazy"
                        decoding="async"
                      >
                      <span
                        v-if="(settings.showVideoCardViewCount && moment.forward.video.play)
                          || (settings.showVideoCardDanmakuCount && moment.forward.video.danmaku)
                          || (settings.showVideoCardDuration && moment.forward.video.duration)"
                        class="moment-card__video-stats"
                      >
                        <span class="moment-card__video-stat-group">
                          <span v-if="settings.showVideoCardViewCount && moment.forward.video.play">
                            <span i-tabler-player-play aria-hidden="true" />
                            {{ moment.forward.video.play }}
                          </span>
                          <span v-if="settings.showVideoCardDanmakuCount && moment.forward.video.danmaku">
                            <span i-tabler-message-circle aria-hidden="true" />
                            {{ moment.forward.video.danmaku }}
                          </span>
                        </span>
                        <span v-if="settings.showVideoCardDuration && moment.forward.video.duration">
                          {{ moment.forward.video.duration }}
                        </span>
                      </span>
                      <span
                        v-if="getWatchLaterAid(moment.forward.video)"
                        role="button"
                        tabindex="0"
                        class="moment-card__watch-later"
                        :class="{ 'is-added': isInWatchLater(moment.forward.video), 'is-disabled': isWatchLaterToggling(moment.forward.video) }"
                        :aria-disabled="isWatchLaterToggling(moment.forward.video)"
                        :aria-label="isInWatchLater(moment.forward.video) ? $t('common.added') : $t('common.save_to_watch_later')"
                        :aria-pressed="isInWatchLater(moment.forward.video)"
                        @click.stop.prevent="toggleWatchLater(moment.forward.video)"
                        @keydown.enter.stop.prevent="toggleWatchLater(moment.forward.video)"
                        @keydown.space.stop.prevent="toggleWatchLater(moment.forward.video)"
                      >
                        <Tooltip v-if="!isInWatchLater(moment.forward.video)" :content="$t('common.save_to_watch_later')" placement="bottom-right" type="dark">
                          <span i-mingcute:carplay-line aria-hidden="true" />
                        </Tooltip>
                        <Tooltip v-else :content="$t('common.added')" placement="bottom-right" type="dark">
                          <Icon icon="line-md:confirm" aria-hidden="true" />
                        </Tooltip>
                      </span>
                    </span>
                    <span class="moment-card__forward-video-info">
                      <strong>
                        <VideoWatchedTag
                          :aid="moment.forward.video.aid"
                          :bvid="moment.forward.video.bvid"
                        />
                        {{ moment.forward.video.title || moment.forward.fallback }}
                      </strong>
                      <small><span i-tabler-user aria-hidden="true" />{{ moment.forward.author }}</small>
                    </span>
                  </a>
                  <div v-else-if="moment.forward" class="moment-card__forward">
                    <strong>@{{ moment.forward.author }}</strong>
                    <p>{{ moment.forward.title || moment.forward.text || moment.forward.fallback }}</p>
                  </div>
                </div>

                <div
                  v-if="moment.images.length > 1 && !moment.isVideo && !moment.isLive"
                  class="moment-card__gallery"
                  :class="`moment-card__gallery--${Math.min(moment.images.length, 9)}`"
                >
                  <img
                    v-for="(image, imageIndex) in moment.images.slice(0, 9)"
                    :key="image"
                    :src="getMomentThumbnailUrl(image, 360)"
                    :alt="`${moment.author.name} 的动态图片 ${imageIndex + 1}`"
                    loading="lazy"
                    decoding="async"
                    @load="handleCoverLoad($event, moment.id)"
                  >
                  <span v-if="moment.images.length > 9" class="moment-card__image-count">+{{ moment.images.length - 9 }}</span>
                  <span v-if="moment.isChargeExclusive" class="moment-card__charge-badge">
                    {{ moment.chargeBadge || '充电专属' }}
                  </span>
                </div>
              </div>

              <a
                v-if="moment.additional"
                :href="moment.additional.url || undefined"
                class="moment-card__additional moment-card__additional--footer"
                :class="{ 'moment-card__additional--no-cover': moment.isChargeExclusive || !moment.additional.cover }"
                @click.stop
              >
                <img
                  v-if="moment.additional.cover && !moment.isChargeExclusive"
                  :src="getMomentThumbnailUrl(moment.additional.cover, 80)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                >
                <span><strong>{{ moment.additional.title || '附加内容' }}</strong><small v-if="moment.additional.desc">{{ moment.additional.desc }}</small></span>
                <em>{{ moment.additional.action }}</em>
              </a>

              <footer class="moment-card__footer">
                <a :href="moment.url" target="_blank" rel="noopener noreferrer" aria-label="新建标签页打开动态" @click.stop>
                  <span i-tabler-external-link />
                  <span class="moment-card__open-label">新标签页打开</span>
                </a>
                <button v-if="!moment.isLive" type="button" aria-label="查看评论" @click.stop="openMomentDetail(moment)">
                  <span i-tabler-message-circle />
                  {{ formatCount(moment.commentCount) }}
                </button>
                <span v-else class="moment-card__footer-stat" :aria-label="`直播人气 ${moment.livePopularity || '暂无数据'}`">
                  <span i-tabler-users />
                  {{ moment.livePopularity || '直播中' }}
                </span>
                <button
                  type="button"
                  class="moment-card__likes"
                  :class="{ 'is-liked': moment.isLiked, 'is-unavailable': moment.isLikeDisabled }"
                  :disabled="likingMomentIds.has(moment.id) || moment.isLikeDisabled"
                  :aria-label="moment.isLikeDisabled ? '该动态暂不支持点赞' : moment.isLiked ? '取消点赞' : '点赞'"
                  :aria-pressed="moment.isLiked"
                  :title="moment.isLikeDisabled ? '该动态暂不支持点赞' : moment.isLiked ? '取消点赞' : '点赞'"
                  @click.stop="toggleMomentLike(moment)"
                  @keydown.enter.stop
                >
                  <span v-if="moment.isLiked" i-tabler-heart-filled />
                  <span v-else i-tabler-heart />
                  {{ formatCount(moment.likeCount) }}
                </button>
              </footer>
            </article>
            <div v-if="column.bottomPad" class="moments-grid__spacer" :style="{ height: `${column.bottomPad}px` }" />
          </div>
        </div>
        <div v-else-if="!isInitialLoading" class="moments-page__empty">
          <span i-tabler-windmill text="size-$bew-icon-size-xl" /><p>{{ activeMomentGroup === 'wanted' ? (momentsWantedUsers.length ? '近期无更新' : '请先在设置中添加想看的 UP 主') : '暂时没有可展示的动态' }}</p><button
            v-if="activeMomentGroup !== 'wanted' || momentsWantedUsers.length"
            :disabled="isLoading"
            @click="activeMomentGroup === 'wanted' && !noMoreContent ? loadMoreWantedMoments() : refresh()"
          >
            {{ isLoading ? '正在加载…' : activeMomentGroup === 'wanted' ? (!noMoreContent ? '加载更多' : '重新检查') : '重新加载' }}
          </button>
        </div>
        <button
          v-if="activeMomentGroup === 'wanted' && moments.length && !isLoading && !noMoreContent"
          type="button"
          class="moments-wanted-load-more"
          @click="loadMoreWantedMoments"
        >
          <span i-tabler-arrow-down />
          加载更多
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
            正在加载并准备更多动态…
          </template>
          <template v-else-if="noMoreContent">
            已经到底啦
          </template>
        </p>
      </main>
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
      :title="selectedMoment.isLive ? '直播间' : selectedMoment.isVideo ? '视频播放' : selectedMoment.author.name"
      :desc="selectedMoment.isLive || selectedMoment.isVideo ? selectedMoment.title || selectedMoment.author.name : (selectedMoment.time || '动态详情')"
      :width="detailDialogWidth"
      :height="detailDialogHeight"
      :top-offset="detailDialogTopOffset"
      :content-height="detailContentHeight"
      :content-max-height="detailContentHeight"
      @close="closeMomentDetail"
    >
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
          {{ selectedMoment.isLive ? '正在打开直播间…' : selectedMoment.isVideo ? '正在打开视频…' : selectedMoment.isForward ? '正在打开转发动态…' : '正在加载动态详情…' }}
        </div>
        <iframe
          ref="detailIframeRef"
          :key="detailFrameUrl"
          class="moment-detail-frame__iframe"
          :src="detailFrameUrl"
          :title="`${selectedMoment.author.name} 的详情`"
          referrerpolicy="no-referrer-when-downgrade"
          allow="fullscreen; autoplay; clipboard-write"
          scrolling="yes"
          @load="handleDetailIframeLoad"
        />
        <a
          class="moment-detail-frame__open"
          :href="detailFrameUrl"
          target="_blank"
          rel="noopener noreferrer"
          @click.stop
        >
          新建标签页打开
          <span i-tabler-external-link />
        </a>
      </div>
    </Dialog>

    <Teleport v-if="mainAppRef && detailImageViewerOpen" :to="mainAppRef">
      <div
        ref="detailImageViewerRef"
        class="moment-image-viewer"
        role="dialog"
        aria-modal="true"
        aria-label="动态图片查看器"
        tabindex="-1"
        @wheel.prevent.stop="handleDetailImageViewerWheel"
      >
        <button
          type="button"
          class="moment-image-viewer__close"
          aria-label="关闭图片查看器"
          @click="closeDetailImageViewer"
        >
          <span i-tabler-x />
        </button>
        <div class="moment-image-viewer__stage" @click.self="closeDetailImageViewer">
          <img
            :src="detailImageViewerUrl"
            alt="动态图片大图"
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
          aria-label="上一张"
          @click="showDetailImageViewerImage(detailImageViewerIndex - 1)"
        >
          <span i-tabler-chevron-left />
        </button>
        <button
          v-if="detailImageViewerUrls.length > 1"
          type="button"
          class="moment-image-viewer__nav moment-image-viewer__nav--next"
          aria-label="下一张"
          @click="showDetailImageViewerImage(detailImageViewerIndex + 1)"
        >
          <span i-tabler-chevron-right />
        </button>
        <div class="moment-image-viewer__toolbar">
          <span class="moment-image-viewer__counter">
            {{ detailImageViewerIndex + 1 }}/{{ detailImageViewerUrls.length }}
          </span>
          <span class="moment-image-viewer__divider" />
          <button type="button" aria-label="缩小" title="缩小" @click="setDetailImageViewerScale(detailImageViewerScale - 0.25)">
            −
          </button>
          <span class="moment-image-viewer__zoom">{{ Math.round(detailImageViewerScale * 100) }}%</span>
          <button type="button" aria-label="放大" title="放大" @click="setDetailImageViewerScale(detailImageViewerScale + 0.25)">
            +
          </button>
          <button type="button" aria-label="适应窗口" title="适应窗口" @click="resetDetailImageViewerTransform">
            1:1
          </button>
          <button
            type="button"
            aria-label="顺时针旋转"
            title="顺时针旋转"
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
  padding: var(--bew-space-2) var(--bew-space-3) var(--bew-space-12);
}
.moments-layout {
  display: grid;
  grid-template-columns: 248px auto;
  align-items: start;
  justify-content: center;
  gap: var(--bew-space-4);
  width: 100%;
}
.moments-layout--without-sidebar {
  grid-template-columns: auto;
}
.moments-content {
  min-width: 0;
}
.moments-sidebar {
  position: sticky;
  top: calc(var(--bew-top-bar-height, 64px) + var(--bew-space-3));
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  min-width: 0;
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
  font-weight: var(--bew-font-weight-semibold);
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
  padding: 0 6px;
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
.moments-user-card__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: var(--bew-space-5);
}
.moments-user-card__stats > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: var(--bew-space-1);
}
.moments-user-card__stats strong {
  overflow: hidden;
  max-width: 100%;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-semibold);
  text-overflow: ellipsis;
}
.moments-user-card__stats small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
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
  padding: var(--bew-space-4) var(--bew-space-3) var(--bew-space-3);
}
.moments-live-card > header {
  padding: 0 var(--bew-space-1) var(--bew-space-2);
}
.moments-live-card > header strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  line-height: var(--bew-line-height-title);
}
.moments-live-card > header span {
  color: var(--bew-text-3);
  font-weight: var(--bew-font-weight-medium);
}
.moments-live-card__list {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
}
.moments-live-card__list > a {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  min-width: 0;
  padding: var(--bew-space-2) var(--bew-space-1);
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
  gap: 4px;
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
.moments-skeleton__status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  height: 32px;
  margin-bottom: var(--bew-space-3);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  pointer-events: none;
}
.moments-skeleton-grid {
  display: grid;
  align-items: start;
  justify-content: center;
  gap: var(--bew-space-4);
  width: 100%;
}
.moments-skeleton-column {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  width: 100%;
  max-width: 520px;
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
  grid-template-columns: minmax(170px, 44%) minmax(0, 1fr);
  gap: var(--bew-space-4);
  min-height: 202px;
  padding: 0 var(--bew-space-4) var(--bew-space-4);
}
.moments-skeleton-card__cover {
  width: 100%;
  min-height: 202px;
  border-radius: var(--bew-media-radius);
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
  z-index: 8;
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, max-content) max-content;
  justify-content: center;
  align-items: center;
  gap: var(--bew-space-3);
  width: 100%;
  margin-bottom: 2px;
}
.moments-group-controls {
  width: max-content;
}
.moments-group-controls button > span:not([class*="i-tabler"]) {
  min-width: 18px;
  padding: var(--bew-space-0-5) var(--bew-space-1);
  border-radius: var(--bew-radius-full);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
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
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: var(--bew-space-1);
  }
  .moments-group-controls {
    --bew-control-item-padding-x: 8px;
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
  gap: var(--bew-space-4);
  width: 100%;
  justify-content: center;
  justify-items: stretch;
  /* 虚拟 spacer 会持续变化，禁用浏览器自动锚定以免与滚动输入互相拉扯 */
  overflow-anchor: none;
}
.moment-card--preparing {
  visibility: hidden;
}
.moment-card--entering {
  will-change: opacity;
  animation: moment-card-enter 0.2s ease both;
}
.moments-grid__column {
  display: flex;
  width: 100%;
  max-width: 520px;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-4);
}
.moments-grid .moment-card {
  width: 100%;
  max-width: 520px;
}
.moments-grid__spacer {
  flex: 0 0 auto;
  width: 100%;
  pointer-events: none;
}
.moment-card {
  container-type: inline-size;
  break-inside: avoid;
  margin: 0;
  overflow: hidden;
  border: 0;
  border-radius: var(--bew-card-radius);
  background: var(--bew-elevated);
  cursor: pointer;
  box-shadow: none;
  /* 虚拟列表下避免 content-visibility 引发高度回算抖动 */
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
.moment-card:hover,
.moment-card:focus-visible {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 8%);
  outline: none;
}
@keyframes moment-card-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .moment-card--entering {
    animation: none;
  }
}
.moment-card__cover {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--bew-fill-1);
}
.moment-card__cover > img {
  display: block;
  width: 100%;
  height: auto;
  opacity: 0;
  object-fit: cover;
  object-position: center top;
  background: var(--bew-fill-1);
  transition: opacity 0.12s ease;
}
.moment-card__cover > img.is-ready {
  opacity: 1;
}
/* 已拿到尺寸后按比例定高，超过 1:2 的长图会按 3:4 裁剪 */
.moment-card__cover--sized > img {
  position: absolute;
  inset: 0;
  height: 100%;
}
.moment-card__cover--media {
  aspect-ratio: 16 / 9;
  background: #111;
}
.moment-card__cover--media > img,
.moment-card__cover--media > video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.moment-card__cover--media > video {
  z-index: 1;
}
.moment-card__image-count,
.moment-card__video-mark,
.moment-card__live-mark {
  position: absolute;
  bottom: var(--bew-space-2);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-radius-full);
  color: #fff;
  background: rgba(0, 0, 0, 0.58);
  font-size: var(--bew-font-size-control);
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
}
.moment-card__image-count {
  right: var(--bew-space-2);
}
.moment-card__video-mark {
  left: var(--bew-space-2);
}
.moment-card__live-mark {
  top: 8px;
  left: 8px;
  bottom: auto;
  z-index: 2;
  border-radius: var(--bew-badge-radius);
  background: var(--bew-theme-color);
  font-weight: var(--bew-font-weight-bold);
  letter-spacing: 0.02em;
}
.moment-card__long-image-mark {
  position: absolute;
  top: var(--bew-space-2);
  right: var(--bew-space-2);
  z-index: 2;
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-badge-radius);
  color: #fff;
  background: rgb(0 0 0 / 62%);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}
.moment-card__charge-badge {
  position: absolute;
  top: var(--bew-space-2);
  left: var(--bew-space-2);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-radius-full);
  color: #fff;
  background: linear-gradient(135deg, #ff8eb4, #fb7299);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  box-shadow: 0 2px 8px rgb(251 114 153 / 35%);
}
.moment-card__text-cover {
  position: relative;
  min-height: 152px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-3);
  color: var(--bew-text-2);
  background: linear-gradient(145deg, var(--bew-theme-color-20), var(--bew-fill-1));
}
.moment-card__text-cover--video {
  color: #fff;
  background: linear-gradient(145deg, #394e74, #141b2d);
}
.moment-card__text-cover--charge {
  color: #fff;
  padding: 20px 16px;
  text-align: center;
  background:
    radial-gradient(circle at 20% 20%, rgb(255 255 255 / 18%), transparent 40%),
    linear-gradient(145deg, #ff9ec0, #fb7299 55%, #e85a8a);
}
.moment-card__text-cover--charge strong {
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-bold);
  line-height: var(--bew-line-height-title);
}
.moment-card__text-cover--charge small {
  max-width: 90%;
  color: rgb(255 255 255 / 92%);
  font-size: var(--bew-font-size-control);
  line-height: 1.45;
  white-space: pre-wrap;
}
.moment-card--charge .moment-card__additional em {
  color: #fb7299;
}
.moment-card__text-cover-icon {
  font-size: var(--bew-icon-size-xl);
}
.moment-card__body {
  padding: var(--bew-space-3);
}
.moment-card--text .moment-card__body {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  padding-top: var(--bew-space-4);
}
.moment-card--text .moment-card__desc {
  -webkit-line-clamp: 10;
  flex: 1 1 auto;
}
.moment-card__title {
  margin: 0 0 var(--bew-space-2);
  font-weight: var(--bew-font-weight-bold);
  line-height: 1.45;
}
.moment-card__media-meta {
  margin: 0 0 var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}
.moment-card__media-meta--live {
  align-self: flex-start;
  padding: 4px 8px;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
  line-height: 1.35;
}
.moment-card__desc {
  margin: 0;
  color: var(--bew-text-1);
  line-height: 1.55;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  white-space: pre-wrap;
  word-break: break-word;
}
.moment-card__footer {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}
.moment-card__forward {
  margin-top: var(--bew-space-3);
  padding: var(--bew-space-2) var(--bew-space-3);
  border-radius: var(--bew-radius-md);
  background: var(--bew-fill-1);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: 1.45;
}
.moment-card__forward strong {
  color: var(--bew-text-1);
}
.moment-card__forward p {
  margin: 4px 0 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.moment-card__additional {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  margin-top: var(--bew-space-3);
  padding: 12px 16px;
  border-radius: var(--bew-interactive-radius);
  color: inherit;
  background: var(--bew-fill-1);
  text-decoration: none;
}
.moment-card__additional--no-cover {
  grid-template-columns: minmax(0, 1fr) auto;
}
.moment-card__additional img {
  width: 40px;
  height: 40px;
  border-radius: var(--bew-radius-md);
  object-fit: cover;
}
.moment-card__additional span {
  display: flex;
  min-width: 0;
  min-height: 40px;
  flex-direction: column;
  justify-content: center;
}
.moment-card__additional strong,
.moment-card__additional small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moment-card__additional small {
  margin-top: var(--bew-space-1);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
}
.moment-card__additional em {
  margin-left: 12px;
  padding-right: 4px;
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  font-style: normal;
}
.moment-card__avatar {
  width: 21px;
  height: 21px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bew-fill-1);
}
.moment-card__author {
  overflow: hidden;
  max-width: 130px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moment-card__likes {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-radius-md);
  color: var(--bew-text-2);
  background: transparent;
  cursor: pointer;
  font: inherit;
  white-space: nowrap;
  transition:
    color 0.16s ease,
    background-color 0.16s ease,
    transform 0.16s ease;
}
.moment-card__likes:hover {
  color: var(--bew-theme-color);
  background: color-mix(in srgb, var(--bew-theme-color) 10%, transparent);
}
.moment-card__likes:active {
  transform: scale(0.94);
}
.moment-card__likes.is-liked {
  color: var(--bew-theme-color);
}
.moment-card__likes:disabled {
  cursor: wait;
  opacity: 0.65;
}
.moment-card__likes.is-unavailable {
  cursor: not-allowed;
}

/* 宽卡信息流：作者在上、内容居中、操作在下，媒体与正文优先横向排布。 */
.moment-card__header {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  padding: var(--bew-space-3);
}
.moment-card__header .moment-card__avatar {
  width: 36px;
  height: 36px;
}
.moment-card__identity {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-1);
}
.moment-card__identity strong,
.moment-card__identity small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moment-card__identity strong {
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
}
.moment-card__identity small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
}
.moment-card__main {
  padding: 0 var(--bew-space-4) var(--bew-space-3);
}
.moment-card__main--has-media {
  display: grid;
  grid-template-columns: minmax(170px, 44%) minmax(0, 1fr);
  align-items: start;
  gap: var(--bew-space-3);
}
.moment-card__main--live {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
}
.moment-card__main--live .moment-card__body {
  order: 1;
  height: auto;
  max-height: none;
}
.moment-card__main--live .moment-card__media {
  order: 2;
  width: 100%;
}
.moment-card__main--live .moment-card__cover--media {
  aspect-ratio: 16 / 9;
}
.moment-card__main--single-landscape {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
}
.moment-card__main--single-landscape .moment-card__body {
  order: 1;
}
.moment-card__main--single-landscape .moment-card__body:empty {
  display: none;
}
.moment-card__main--single-landscape .moment-card__cover--single {
  order: 2;
  width: 100%;
}
.moment-card__media {
  min-width: 0;
  overflow: hidden;
  border-radius: var(--bew-media-radius);
}
.moment-card__cover--media {
  aspect-ratio: 16 / 9;
}
.moment-card__cover--single {
  max-height: none;
}
.moment-card__gallery {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: var(--bew-space-1);
  margin-top: var(--bew-space-3);
  overflow: hidden;
  border-radius: var(--bew-media-radius);
  aspect-ratio: 1;
  background: var(--bew-fill-1);
}
.moment-card__gallery--2,
.moment-card__gallery--4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.moment-card__gallery--2 {
  aspect-ratio: 2 / 1;
}
.moment-card__gallery--3 {
  aspect-ratio: 3 / 1;
}
.moment-card__gallery--5,
.moment-card__gallery--6 {
  aspect-ratio: 3 / 2;
}
.moment-card__gallery > img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: cover;
  background: var(--bew-fill-1);
}
.moment-card__gallery .moment-card__image-count {
  right: 8px;
  bottom: 8px;
}
.moment-card__text-cover {
  min-height: 176px;
  box-sizing: border-box;
}
.moment-card__body {
  min-width: 0;
  padding: 0;
}
.moment-card__main--video .moment-card__body {
  display: flex;
  height: max(95.625px, calc((100cqw - 32px) * 0.2475));
  flex-direction: column;
  overflow: hidden;
}
.moment-card__main--video.moment-card__main--live .moment-card__body {
  height: auto;
  max-height: none;
}
.moment-card__main--video .moment-card__desc {
  min-height: 0;
  flex: 1 1 auto;
  -webkit-line-clamp: var(--moment-card-description-lines, unset);
  text-overflow: ellipsis;
}
.moment-card__main--video:not(.moment-card__main--live) .moment-card__title {
  display: -webkit-box;
  flex: 0 0 auto;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  text-overflow: ellipsis;
}
.moment-card--text .moment-card__body {
  min-height: 120px;
  padding-top: 0;
}
.moment-card--text .moment-card__desc {
  -webkit-line-clamp: 7;
}
.moment-card--compact-text .moment-card__body {
  min-height: 0;
}
.moment-card__title {
  margin-bottom: var(--bew-space-2);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  line-height: var(--bew-line-height-title);
}
.moment-card__desc {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  -webkit-line-clamp: 7;
}
.moment-card__emoji {
  display: inline-block;
  width: 1.35em;
  height: 1.35em;
  margin: 0 0.08em;
  vertical-align: -0.28em;
  object-fit: contain;
}
.moment-card__emoji--large {
  width: 1.6em;
  height: 1.6em;
  vertical-align: -0.4em;
}
.moment-card__rich-link {
  color: var(--bew-theme-color);
  text-decoration: none;
  text-underline-offset: 0.15em;
}
.moment-card__rich-link:hover {
  text-decoration: underline;
}
.moment-card__forward {
  margin-top: var(--bew-space-3);
}
.moment-card--forward-video .moment-card__desc {
  -webkit-line-clamp: 7;
}
.moment-card__forward-video {
  display: grid;
  grid-template-columns: minmax(150px, 44%) minmax(0, 1fr);
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 58%);
  border-radius: var(--bew-interactive-radius);
  color: inherit;
  background: var(--bew-fill-1);
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}
.moment-card__forward-video:hover,
.moment-card__forward-video:focus-visible {
  border-color: color-mix(in oklab, var(--bew-theme-color), transparent 48%);
  background: color-mix(in oklab, var(--bew-theme-color) 7%, var(--bew-fill-1));
  outline: none;
}
.moment-card__forward-video-cover {
  position: relative;
  display: block;
  min-width: 0;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: #111;
}
.moment-card__forward-video-cover > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.moment-card__video-stats {
  position: absolute;
  inset: auto 0 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-2);
  min-height: 28px;
  padding: 12px 8px 4px;
  color: #fff;
  background: linear-gradient(to bottom, transparent, rgb(0 0 0 / 72%));
  box-sizing: border-box;
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-shadow: 0 1px 2px rgb(0 0 0 / 65%);
}
.moment-card__watch-later {
  position: absolute;
  top: var(--bew-space-2);
  right: var(--bew-space-2);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: #fff;
  background: rgb(0 0 0 / 60%);
  box-shadow: 0 4px 12px rgb(0 0 0 / 24%);
  cursor: pointer;
  opacity: 0;
  transform: scale(0.72);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease,
    background-color 0.16s ease;
}
.moment-card__watch-later > * {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--bew-icon-size-lg);
}
.moment-card__watch-later:hover,
.moment-card__watch-later.is-added {
  background: rgb(0 0 0 / 72%);
}
.moment-card__watch-later:disabled,
.moment-card__watch-later.is-disabled {
  cursor: wait;
}
.moment-card__watch-later:focus-visible,
.moment-card__media:hover .moment-card__watch-later,
.moment-card__media:focus-within .moment-card__watch-later,
.moment-card__forward-video-cover:hover .moment-card__watch-later,
.moment-card__forward-video-cover:focus-within .moment-card__watch-later {
  opacity: 1;
  transform: scale(1);
}
.moment-card__video-stat-group,
.moment-card__video-stat-group > span {
  display: inline-flex;
  min-width: 0;
  align-items: center;
}
.moment-card__video-stat-group {
  gap: var(--bew-space-2);
}
.moment-card__video-stat-group > span {
  gap: var(--bew-space-1);
}
.moment-card__forward-video-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2) var(--bew-space-3);
}
.moment-card__forward-video-info strong {
  display: -webkit-box;
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.moment-card__forward-video-info small {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moment-card__additional--footer {
  margin: 0 var(--bew-space-4) var(--bew-space-3);
}
.moment-card__footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  gap: 0;
  min-height: 42px;
  margin: 0;
  border-top: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 64%);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}
.moment-card__footer > a,
.moment-card__footer > button,
.moment-card__footer > .moment-card__footer-stat {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  color: inherit;
  background: transparent;
  box-sizing: border-box;
  font: inherit;
  text-decoration: none;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background-color 0.16s ease;
}
.moment-card__footer-stat {
  cursor: default;
}
.moment-card__footer > a:hover,
.moment-card__footer > button:hover {
  color: var(--bew-theme-color);
  background: color-mix(in srgb, var(--bew-theme-color) 8%, transparent);
}
.moment-card__footer > :not(:first-child) {
  border-left: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 72%);
}
.moment-card__footer .moment-card__likes:active {
  transform: none;
}
.moment-card__footer .moment-card__likes:disabled {
  cursor: wait;
  opacity: 0.65;
}

@container (max-width: 359px) {
  .moment-card__main--has-media {
    display: flex;
    flex-direction: column;
  }
  .moment-card__media {
    width: 100%;
  }
  .moment-card__cover--single {
    max-height: none;
  }
  .moment-card__main--video .moment-card__body {
    height: auto;
    max-height: 220px;
  }
  .moment-card--text .moment-card__body {
    min-height: 0;
  }
  .moments-skeleton-card__main {
    display: block;
  }
  .moments-skeleton-card__cover {
    min-height: 240px;
  }
  .moments-skeleton-card__body {
    padding-top: 16px;
  }
}

@container (max-width: 379px) {
  .moment-card__open-label {
    display: none;
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
  margin: var(--bew-space-5) auto 0;
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
  // 视频/直播：按视口/16:9 区域展示，内部页面可滚动
  overflow: hidden;
  background: #000;
  min-height: 280px;
}
.moment-detail-frame--opus {
  // 图文：小红书 note 高容器，利于竖图展示
  min-height: 0;
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
.moment-detail-frame__open {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 4;
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
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.moment-detail-frame__open:hover {
  opacity: 1;
  transform: translateY(-1px);
}
.moment-image-viewer {
  position: fixed;
  inset: 0;
  z-index: 10010;
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
  margin: 0 4px;
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
