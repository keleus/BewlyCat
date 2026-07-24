<script setup lang="ts">
import { useToast } from 'vue-toastification'

import Dialog from '~/components/Dialog.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import type { DataItem, MomentResult } from '~/models/moment/moment'
import api from '~/utils/api'
import { getCSRF } from '~/utils/main'

interface DisplayMoment {
  id: string
  author: { name: string, face: string }
  title: string
  text: string
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
  chargeBadge?: string
  chargeHint?: string
  chargeCover?: string
  mediaMeta: string
  roomId?: number
  duration: string
  bvid?: string
  videoUrl?: string
  additional?: DisplayAdditional
  forward?: {
    author: string
    title: string
    text: string
    fallback: string
  }
}

interface DisplayAdditional {
  title: string
  desc: string
  cover: string
  action: string
  url: string
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

const moments = ref<DisplayMoment[]>([])
type MomentFilter = 'all' | 'video' | 'pgc' | 'article'
const momentFilters: Array<{ value: MomentFilter, label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'video', label: '视频投稿' },
  { value: 'pgc', label: '追番追剧' },
  { value: 'article', label: '专栏' },
]
const activeMomentFilter = ref<MomentFilter>('all')
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
/** 瀑布流卡片严格最大宽度 */
const CARD_MAX_WIDTH = 280
const CARD_MIN_WIDTH = 200
const GRID_GAP = 12
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
/** 封面宽高比（宽/高），竖图最长按 3:4 裁剪 */
const coverRatios = reactive<Record<string, number>>({})
const MAX_PORTRAIT_RATIO = 3 / 4
const SKELETON_COVER_HEIGHTS = [168, 248, 198, 280, 218, 184]
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

function httpsUrl(url = '') {
  return url.replace(/^http:/, 'https:')
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

function getSkeletonCoverHeight(columnIndex: number, itemIndex: number) {
  return SKELETON_COVER_HEIGHTS[(columnIndex * 2 + itemIndex) % SKELETON_COVER_HEIGHTS.length]
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

  // 充电未解锁：列表往往无 desc/major，用提示文案顶上
  if (!text && isChargeExclusive)
    text = chargeHint || '充电专属动态'

  let additionalView = additional.type
    ? {
        title: pickText(additionalCard.title, additionalCard.head_text, additionalCard.desc?.text),
        desc: pickText(
          typeof additionalCard.desc1 === 'string' ? additionalCard.desc1 : additionalCard.desc1?.text,
          typeof additionalCard.desc2 === 'string' ? additionalCard.desc2 : additionalCard.desc2?.text,
          additionalCard.desc,
        ),
        cover: httpsUrl(additionalCard.cover || additionalCard.icon || ''),
        action: getAdditionalActionText(additionalCard.button),
        url: additionalCard.jump_url || additionalCard.button?.jump_url || '',
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
    }
  }

  return {
    title: pickText(live?.title, opus.title, archive.title, article.title, common.title),
    text,
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
    bvid: archive.bvid || undefined,
    videoUrl: archive.jump_url ? httpsUrl(archive.jump_url.startsWith('//') ? `https:${archive.jump_url}` : archive.jump_url) : undefined,
    mediaMeta: live
      ? `${live.live_status === 1 ? '直播中' : '直播回放'}${live.area_name ? ` · ${live.area_name}` : ''}${live.online ? ` · ${formatCount(Number(live.online))} 人气` : ''}`
      : (isChargeExclusive ? (chargeBadge || '充电专属') : (archive.duration_text || article.label || '')),
    additional: additionalView,
  }
}

function resolveVideoUrl(moment: DisplayMoment) {
  if (moment.videoUrl)
    return moment.videoUrl
  if (moment.bvid)
    return `https://www.bilibili.com/video/${moment.bvid}`
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

/** 图文：小红书 note 风格固定宽高；视频/直播：按视口比例缩放 */
const isOpusDetailMoment = computed(() => Boolean(selectedMoment.value && !isPlayerMoment(selectedMoment.value)))

/** 视频/直播 dialog 相对视口等比缩放（宽高同一比例，保持与网页可视区域一致） */
const PLAYER_DIALOG_SCALE = 0.92

const detailDialogWidth = computed(() => {
  if (isPlayerMoment(selectedMoment.value))
    return `${PLAYER_DIALOG_SCALE * 100}vw`
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
  // 小屏与直播直接使用新标签页，避免狭窄 Dialog 和跨域直播页占用资源
  if (shouldOpenMomentInNewTab(moment)) {
    openMomentInNewTab(moment)
    return
  }

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
  // 转发时作者侧也可能挂充电角标
  const selfContent = isForward ? getMomentContent(raw) : content
  const forwardedAuthor = contentRaw.modules?.module_author || {}
  const id = raw.id_str || raw.id || `${author.mid}-${author.pub_ts}`
  const text = isForward
    ? (normalizeDescText(dynamic.desc) || '转发了动态')
    : content.text

  return {
    id,
    author: { name: author.name || 'B站用户', face: httpsUrl(author.face || '') },
    title: content.title,
    text,
    images: content.images,
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
    isVideo: content.isVideo,
    isPgc: content.isPgc,
    isLive: content.isLive,
    isForward,
    isArticle: raw.type === 'DYNAMIC_TYPE_ARTICLE'
      || contentRaw.type === 'DYNAMIC_TYPE_ARTICLE'
      || Number(raw.basic?.comment_type) === 12
      || Number(contentRaw.basic?.comment_type) === 12
      || raw.modules?.module_dynamic?.major?.type === 'MAJOR_TYPE_ARTICLE'
      || contentRaw.modules?.module_dynamic?.major?.type === 'MAJOR_TYPE_ARTICLE',
    isChargeExclusive: content.isChargeExclusive || selfContent.isChargeExclusive,
    chargeBadge: content.chargeBadge || selfContent.chargeBadge,
    chargeHint: content.chargeHint || selfContent.chargeHint,
    chargeCover: content.chargeCover || selfContent.chargeCover,
    mediaMeta: content.mediaMeta,
    roomId: content.roomId,
    duration: content.duration,
    bvid: content.bvid,
    videoUrl: content.videoUrl,
    additional: content.additional || selfContent.additional,
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
        }
      : undefined,
  }
}

function estimateCardHeight(moment: DisplayMoment) {
  const columnWidth = Math.max(CARD_MIN_WIDTH, gridCardWidth.value || CARD_MAX_WIDTH)
  if (moment.isVideo || moment.isLive)
    return Math.round(columnWidth * 9 / 16) + 132
  if (moment.images.length) {
    const ratio = coverRatios[moment.id] || MAX_PORTRAIT_RATIO
    return Math.round(columnWidth / ratio) + 128
  }
  return 268
}

function handleMomentFilterChange(filter: MomentFilter) {
  if (activeMomentFilter.value === filter)
    return

  hoveredMediaId.value = ''
  cleanupLivePreviewPlayer()
  Object.keys(previewUrls).forEach(key => delete previewUrls[key])
  visibleMomentIds.clear()
  activeMomentFilter.value = filter
  if (scrollViewportRef.value)
    scrollViewportRef.value.scrollTop = 0
  void loadMoments(true)
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

/**
 * 列数：按卡片最大宽 280 + gap 计算。
 * 不够再开一列时保持 280 并居中留白；容器小于 280 时才缩小卡片。
 */
function updateGridColumnCount() {
  const layoutWidth = layoutRef.value?.clientWidth || Math.max(CARD_MAX_WIDTH, window.innerWidth - 220)
  const hasSidebarContent = settings.value.momentsSidebarShowUserCard
    || settings.value.momentsSidebarShowPublish
    || settings.value.momentsSidebarShowLive
  showMomentsSidebar.value = hasSidebarContent && layoutWidth >= SIDEBAR_MIN_LAYOUT_WIDTH
  const sidebarSpace = showMomentsSidebar.value ? SIDEBAR_WIDTH + GRID_GAP : 0
  const containerWidth = Math.max(CARD_MIN_WIDTH, layoutWidth - sidebarSpace)

  let nextCols = 1
  let nextCardWidth = CARD_MAX_WIDTH

  if (containerWidth < CARD_MAX_WIDTH) {
    nextCols = 1
    nextCardWidth = Math.max(CARD_MIN_WIDTH, Math.floor(containerWidth))
  }
  else {
    nextCols = Math.max(1, Math.floor((containerWidth + GRID_GAP) / (CARD_MAX_WIDTH + GRID_GAP)))
    nextCardWidth = CARD_MAX_WIDTH
  }

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
  })
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
  }, 440))
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

  // 初次挂载写入实测高度（带阈值，避免反复抖）
  const measured = Math.round(el.getBoundingClientRect().height)
  if (measured > 0) {
    commitCardHeight(moment.id, measured)
    requestAnimationFrame(() => {
      if (cardElements.get(moment.id) === el)
        markCardReady(moment.id)
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
      const id = (entry.target as HTMLElement).dataset.momentId
      if (!id)
        return
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
  // 横向占满；竖图保留原比例，超过 3:4 再纵向裁剪
  const nextRatio = Math.max(ratio, MAX_PORTRAIT_RATIO)
  const prevRatio = coverRatios[momentId]
  coverRatios[momentId] = nextRatio

  // 封面比例变化会改估算高度；若尚未实测稳定，用估算高度更新并补偿滚动
  if (!settledHeights.has(momentId) && (!prevRatio || Math.abs(prevRatio - nextRatio) > 0.01)) {
    const moment = moments.value.find(item => item.id === momentId)
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
        coverRatios[item.id] = Math.max(ratio, MAX_PORTRAIT_RATIO)
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

function getCoverStyle(momentId: string) {
  const ratio = coverRatios[momentId]
  if (!ratio)
    return undefined
  return { aspectRatio: String(ratio) }
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

async function loadMoments(reset = false, autoFillDepth = 0) {
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
  }
  const requestToken = feedRequestToken
  const requestType = activeMomentFilter.value
  let pageApplied = false
  let preservedPaginationScrollTop: number | null = null
  isLoading.value = true
  if (reset) {
    offset.value = ''
    updateBaseline.value = ''
    noMoreContent.value = false
  }

  try {
    const response = await api.moment.getMoments({
      type: requestType,
      offset: offset.value || undefined,
      update_baseline: updateBaseline.value || undefined,
      features: MOMENT_FEED_FEATURES,
    }) as MomentResult
    if (requestToken !== feedRequestToken || requestType !== activeMomentFilter.value || response.code !== 0)
      return

    const items = (response.data?.items || []).map(mapMoment)
    await prepareMomentCovers(items, requestToken)
    if (requestToken !== feedRequestToken || requestType !== activeMomentFilter.value)
      return
    if (!reset)
      preservedPaginationScrollTop = scrollViewportRef.value?.scrollTop ?? null
    if (!reset)
      suppressBottomRebalanceUntil = Date.now() + 1500
    appendMoments(items)
    if (reset) {
      await nextTick()
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    }

    offset.value = response.data?.offset || ''
    updateBaseline.value = response.data?.update_baseline || ''
    noMoreContent.value = !response.data?.has_more || items.length === 0
    pageApplied = true
  }
  finally {
    if (requestToken === feedRequestToken && requestType === activeMomentFilter.value) {
      isLoading.value = false
      isInitialLoading.value = false
    }
  }

  if (
    preservedPaginationScrollTop !== null
    && requestToken === feedRequestToken
    && requestType === activeMomentFilter.value
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
        <section class="moments-filter-panel">
          <div class="moments-filter-scroll">
            <div class="moments-filter-inside">
              <button
                v-for="filter in momentFilters"
                :key="filter.value"
                type="button"
                class="moments-filter-button"
                :class="{ 'is-active': activeMomentFilter === filter.value }"
                :aria-pressed="activeMomentFilter === filter.value"
                @click="handleMomentFilterChange(filter.value)"
              >
                {{ filter.label }}
              </button>
            </div>
          </div>
        </section>
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
                v-for="itemIndex in 5"
                :key="itemIndex"
                class="moments-skeleton-card"
              >
                <div
                  class="moments-skeleton-card__cover moments-skeleton-block"
                  :style="{ height: `${getSkeletonCoverHeight(columnIndex, itemIndex)}px` }"
                />
                <div class="moments-skeleton-card__body">
                  <div class="moments-skeleton-card__title moments-skeleton-block" />
                  <div class="moments-skeleton-card__line moments-skeleton-block" />
                  <div class="moments-skeleton-card__line moments-skeleton-card__line--short moments-skeleton-block" />
                  <div class="moments-skeleton-card__footer">
                    <span class="moments-skeleton-card__avatar moments-skeleton-block" />
                    <span class="moments-skeleton-card__author moments-skeleton-block" />
                    <span class="moments-skeleton-card__count moments-skeleton-block" />
                  </div>
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
                'moment-card--text': !moment.images.length && !moment.isVideo && !moment.isLive && !moment.isChargeExclusive,
                'moment-card--charge': moment.isChargeExclusive,
                'moment-card--preparing': !readyCardIds.has(moment.id),
                'moment-card--entering': enteringCardIds.has(moment.id),
              }"
              tabindex="0"
              role="button"
              @click="openMomentDetail(moment)" @keydown.enter="openMomentDetail(moment)"
            >
              <div
                v-if="moment.images.length && (moment.isVideo || moment.isLive)"
                class="moment-card__cover moment-card__cover--media"
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
                <span v-if="moment.isVideo" class="moment-card__video-mark"><span i-tabler-player-play-filled /> {{ moment.duration || '视频' }}</span>
                <span v-if="moment.isLive" class="moment-card__live-mark"><span i-tabler-live-photo /> {{ moment.mediaMeta || '直播' }}</span>
                <span v-if="moment.isChargeExclusive" class="moment-card__charge-badge">
                  {{ moment.chargeBadge || '充电专属' }}
                </span>
              </div>
              <div
                v-else-if="moment.images.length"
                class="moment-card__cover"
                :class="{ 'moment-card__cover--sized': !!coverRatios[moment.id] }"
                :style="getCoverStyle(moment.id)"
              >
                <img
                  :src="getMomentThumbnailUrl(moment.images[0])"
                  :alt="moment.text"
                  :class="{ 'is-ready': readyCoverIds.has(moment.id) }"
                  loading="lazy"
                  decoding="async"
                  @load="handleCoverLoad($event, moment.id)"
                >
                <span v-if="moment.images.length > 1" class="moment-card__image-count"><span i-tabler-photo /> {{ moment.images.length }}</span>
                <span v-if="moment.isChargeExclusive" class="moment-card__charge-badge">
                  {{ moment.chargeBadge || '充电专属' }}
                </span>
              </div>
              <div v-else-if="moment.isChargeExclusive" class="moment-card__text-cover moment-card__text-cover--charge">
                <strong>{{ moment.chargeBadge || '充电专属' }}</strong>
              </div>
              <div v-else-if="moment.isVideo" class="moment-card__text-cover moment-card__text-cover--video">
                <span v-if="moment.isVideo" i-tabler-player-play-filled class="moment-card__text-cover-icon" />
                <span>{{ moment.isVideo ? '视频动态' : '发布了新动态' }}</span>
              </div>
              <div class="moment-card__body">
                <p v-if="moment.title" class="moment-card__title">
                  {{ moment.title }}
                </p>
                <p v-if="moment.mediaMeta && !moment.isLive && !moment.isChargeExclusive" class="moment-card__media-meta">
                  {{ moment.mediaMeta }}
                </p>
                <p v-if="getCardPreviewText(moment)" class="moment-card__desc">
                  {{ getCardPreviewText(moment) }}
                </p>
                <div v-if="moment.forward" class="moment-card__forward">
                  <strong>@{{ moment.forward.author }}</strong>
                  <p>{{ moment.forward.title || moment.forward.text || moment.forward.fallback }}</p>
                </div>
                <a
                  v-if="moment.additional"
                  :href="moment.additional.url || undefined"
                  class="moment-card__additional"
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
                  <span><strong>{{ moment.additional.title || '附加内容' }}</strong><small>{{ moment.additional.desc }}</small></span>
                  <em>{{ moment.additional.action }}</em>
                </a>
                <footer class="moment-card__footer">
                  <img :src="getAvatarThumbnailUrl(moment.author.face)" :alt="moment.author.name" class="moment-card__avatar" loading="lazy" decoding="async">
                  <span class="moment-card__author">{{ moment.author.name }}</span>
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
              </div>
            </article>
            <div v-if="column.bottomPad" class="moments-grid__spacer" :style="{ height: `${column.bottomPad}px` }" />
          </div>
        </div>
        <div v-else-if="!isInitialLoading" class="moments-page__empty">
          <span i-tabler-windmill text-4xl /><p>暂时没有可展示的动态</p><button @click="refresh">
            重新加载
          </button>
        </div>
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
          <span i-svg-spinners:ring-resize />
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
  padding: 8px 0 48px;
}
.moments-layout {
  display: grid;
  grid-template-columns: 248px auto;
  align-items: start;
  justify-content: center;
  gap: 12px;
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
  top: calc(var(--bew-top-bar-height, 64px) + 10px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.moments-user-card,
.moments-live-card,
.moments-sidebar-skeleton {
  overflow: hidden;
  border: 0;
  border-radius: 16px;
  background: var(--bew-elevated);
  box-shadow: none;
}
.moments-user-card {
  padding: 18px 16px 16px;
}
.moments-user-card__profile {
  display: flex;
  align-items: center;
  gap: 12px;
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
  gap: 7px;
}
.moments-user-card__identity > strong {
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: 18px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moments-user-card__badges {
  display: flex;
  align-items: center;
  gap: 6px;
}
.moments-user-card__badges em,
.moments-user-card__badges i {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 5px;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  line-height: 1;
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
  margin-top: 18px;
}
.moments-user-card__stats > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.moments-user-card__stats strong {
  overflow: hidden;
  max-width: 100%;
  color: var(--bew-text-1);
  font-size: 19px;
  font-weight: 650;
  text-overflow: ellipsis;
}
.moments-user-card__stats small {
  color: var(--bew-text-3);
  font-size: 13px;
}
.moments-publish-link {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 14px;
  color: var(--bew-text-1);
  background: var(--bew-elevated);
  box-shadow: none;
  font-size: 14px;
  font-weight: 600;
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
  padding: 16px 12px 12px;
}
.moments-live-card > header {
  padding: 0 5px 10px;
}
.moments-live-card > header strong {
  color: var(--bew-text-1);
  font-size: 17px;
}
.moments-live-card > header span {
  color: var(--bew-text-3);
  font-weight: 500;
}
.moments-live-card__list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.moments-live-card__list > a {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  padding: 7px 5px;
  border-radius: 12px;
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
  gap: 2px;
  height: 17px;
  padding: 0 5px;
  border-radius: 999px;
  color: #fff;
  background: #fb7299;
  font-size: 9px;
  font-style: normal;
  line-height: 1;
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
  font-size: 14px;
  font-weight: 600;
}
.moments-live-card__info small {
  color: var(--bew-text-3);
  font-size: 12px;
}
.moments-sidebar-skeleton {
  padding: 18px 16px 16px;
}
.moments-sidebar-skeleton__profile {
  display: flex;
  align-items: center;
  gap: 12px;
}
.moments-sidebar-skeleton__avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
}
.moments-sidebar-skeleton__name {
  width: 104px;
  height: 17px;
  border-radius: 5px;
}
.moments-sidebar-skeleton__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-top: 20px;
}
.moments-sidebar-skeleton__stats > span {
  height: 34px;
  border-radius: 7px;
}
.moments-sidebar-skeleton__button {
  display: block;
  height: 44px;
  margin-top: 16px;
  border-radius: 12px;
}
.moments-sidebar-skeleton__live {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}
.moments-sidebar-skeleton__live > span {
  height: 54px;
  border-radius: 12px;
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
  gap: 7px;
  height: 32px;
  margin-bottom: 10px;
  color: var(--bew-text-3);
  font-size: 13px;
  pointer-events: none;
}
.moments-skeleton-grid {
  display: grid;
  align-items: start;
  justify-content: center;
  gap: 12px;
  width: 100%;
}
.moments-skeleton-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 280px;
  min-width: 0;
}
.moments-skeleton-card {
  overflow: hidden;
  border-radius: 16px;
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
.moments-skeleton-card__cover {
  width: 100%;
  opacity: 0.68;
}
.moments-skeleton-card__body {
  padding: 13px 14px 12px;
}
.moments-skeleton-card__title {
  width: 72%;
  height: 16px;
  border-radius: 5px;
}
.moments-skeleton-card__line {
  width: 94%;
  height: 11px;
  margin-top: 10px;
  border-radius: 4px;
}
.moments-skeleton-card__line--short {
  width: 58%;
  margin-top: 7px;
}
.moments-skeleton-card__footer {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 15px;
}
.moments-skeleton-card__avatar {
  width: 21px;
  height: 21px;
  border-radius: 50%;
}
.moments-skeleton-card__author {
  width: 72px;
  height: 10px;
  border-radius: 4px;
}
.moments-skeleton-card__count {
  width: 38px;
  height: 10px;
  margin-left: auto;
  border-radius: 4px;
}
.moments-filter-header {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  width: 100%;
  margin-bottom: 8px;
}
.moments-filter-panel {
  height: 40px;
  max-width: calc(100vw - 320px);
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 9999px;
  background: transparent;
  box-sizing: border-box;
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
  display: flex;
  align-items: center;
  gap: 4px;
  width: max-content;
  height: 100%;
  padding: 2px;
  box-sizing: border-box;
}
.moments-filter-button {
  position: relative;
  flex: 0 0 auto;
  height: 100%;
  padding: 0 16px;
  border: 0;
  border-radius: 9999px;
  color: var(--bew-text-2);
  background: transparent;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.15s ease;
}
.moments-filter-button:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
}
.moments-filter-button.is-active {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-20);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 8%),
    0 2px 6px var(--bew-theme-color-10);
  transform: translateY(-0.5px);
}
@media (max-width: 1000px) {
  .moments-filter-panel {
    max-width: 100%;
  }
}
.moments-page__empty button {
  border: 1px solid var(--bew-border-color);
  border-radius: 999px;
  background: var(--bew-elevated);
  color: var(--bew-text-1);
  padding: 10px 15px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: 0.2s ease;
}
.moments-page__empty button:hover {
  color: #fff;
  background: var(--bew-theme-color);
  border-color: var(--bew-theme-color);
}
.moments-grid {
  display: grid;
  gap: 12px;
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
  will-change: clip-path, opacity, transform;
  animation: moment-card-enter 0.4s cubic-bezier(0.22, 0.72, 0.32, 1) both;
}
.moments-grid__column {
  display: flex;
  width: 100%;
  max-width: 280px;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
}
.moments-grid .moment-card {
  width: 100%;
  max-width: 280px;
}
.moments-grid__spacer {
  flex: 0 0 auto;
  width: 100%;
  pointer-events: none;
}
.moment-card {
  break-inside: avoid;
  margin: 0;
  overflow: hidden;
  border: 0;
  border-radius: 16px;
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
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 8%);
  outline: none;
}
@keyframes moment-card-enter {
  from {
    opacity: 0;
    clip-path: inset(0 0 100% 0 round 16px);
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    clip-path: inset(0 0 0 0 round 16px);
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .moment-card--entering {
    animation-duration: 0.01ms;
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
/* 已拿到尺寸后按比例定高，超长竖图被限制并裁剪 */
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
  bottom: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  color: #fff;
  background: rgba(0, 0, 0, 0.58);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 3px;
}
.moment-card__image-count {
  right: 10px;
}
.moment-card__video-mark {
  left: 10px;
}
.moment-card__live-mark {
  left: 10px;
  background: rgb(251 114 153 / 88%);
}
.moment-card__charge-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  color: #fff;
  background: linear-gradient(135deg, #ff8eb4, #fb7299);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  box-shadow: 0 2px 8px rgb(251 114 153 / 35%);
}
.moment-card__text-cover {
  min-height: 152px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
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
  font-size: 15px;
  font-weight: 700;
}
.moment-card__text-cover--charge small {
  max-width: 90%;
  color: rgb(255 255 255 / 92%);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
}
.moment-card--charge .moment-card__additional em {
  color: #fb7299;
}
.moment-card__text-cover-icon {
  font-size: 32px;
}
.moment-card__body {
  padding: 13px 14px 12px;
}
.moment-card--text .moment-card__body {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  padding-top: 18px;
}
.moment-card--text .moment-card__desc {
  -webkit-line-clamp: 10;
  flex: 1 1 auto;
}
.moment-card__title {
  margin: 0 0 7px;
  font-weight: 700;
  line-height: 1.45;
}
.moment-card__media-meta {
  margin: 0 0 7px;
  color: var(--bew-text-2);
  font-size: 12px;
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
  gap: 7px;
  margin-top: 13px;
  color: var(--bew-text-2);
  font-size: 12px;
}
.moment-card__forward {
  margin-top: 11px;
  padding: 9px 10px;
  border-radius: 10px;
  background: var(--bew-fill-1);
  color: var(--bew-text-2);
  font-size: 12px;
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
  gap: 8px;
  margin-top: 11px;
  padding: 8px;
  border-radius: 10px;
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
  border-radius: 7px;
  object-fit: cover;
}
.moment-card__additional span {
  min-width: 0;
}
.moment-card__additional strong,
.moment-card__additional small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moment-card__additional small {
  margin-top: 3px;
  color: var(--bew-text-2);
  font-size: 11px;
}
.moment-card__additional em {
  color: var(--bew-theme-color);
  font-size: 12px;
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
  gap: 3px;
  padding: 3px 6px;
  border: 0;
  border-radius: 7px;
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
.moments-page__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 32px;
  margin: 18px 0 0;
  color: var(--bew-text-2);
  text-align: center;
  font-size: 13px;
  visibility: hidden;
  opacity: 0;
  overflow-anchor: none;
  transition: opacity 0.16s ease;
}
.moments-page__loading.is-visible {
  visibility: visible;
  opacity: 1;
}
.moments-page__empty {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 13px;
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
  border-radius: var(--bew-radius);
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
  gap: 8px;
  color: var(--bew-text-2);
  background: color-mix(in oklab, var(--bew-bg) 92%, transparent);
  backdrop-filter: blur(3px);
  font-size: 13px;
  pointer-events: auto;
  opacity: 1;
  transition: opacity 0.18s ease;
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
  gap: 4px;
  padding: 8px 12px;
  border: 0;
  border-radius: 999px;
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-shadow: var(--bew-shadow-2);
  text-decoration: none;
  font-size: 12px;
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
  font-size: 24px;
}
.moment-image-viewer__nav {
  position: absolute;
  top: 50%;
  z-index: 4;
  width: 44px;
  height: 56px;
  border-radius: 10px;
  transform: translateY(-50%);
  font-size: 32px;
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
  gap: 6px;
  padding: 8px 12px;
  border: 0;
  border-radius: 999px;
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
  font-size: 18px;
}
.moment-image-viewer__counter,
.moment-image-viewer__zoom {
  min-width: 48px;
  text-align: center;
  font-size: 13px;
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
