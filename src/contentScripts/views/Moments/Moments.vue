<script setup lang="ts">
import Dialog from '~/components/Dialog.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { DataItem, MomentResult } from '~/models/moment/moment'
import api from '~/utils/api'

interface DisplayMoment {
  id: string
  author: { name: string, face: string }
  title: string
  text: string
  images: string[]
  time: string
  likeCount: number
  commentCount: number
  url: string
  isVideo: boolean
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
  /** 列表缺正文时是否已尝试详情补全 */
  contentEnriched?: boolean
}

interface DisplayAdditional {
  title: string
  desc: string
  cover: string
  action: string
  url: string
}

/** 动态流 features：补齐 opus 图文与充电列表字段 */
const MOMENT_FEED_FEATURES = 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard'
const MOMENT_DETAIL_FEATURES = 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,htmlNewStyle'

const moments = ref<DisplayMoment[]>([])
const momentColumns = ref<DisplayMoment[][]>([])
const selectedMoment = ref<DisplayMoment | null>(null)
const detailFrameUrl = ref('')
const detailFrameLoaded = ref(false)
const detailIframeRef = ref<HTMLIFrameElement | null>(null)
let detailLoadTimer: ReturnType<typeof setTimeout> | null = null
const gridRef = ref<HTMLElement | null>(null)
/** 瀑布流卡片严格最大宽度 */
const CARD_MAX_WIDTH = 280
const CARD_MIN_WIDTH = 200
const GRID_GAP = 12
const gridColumnCount = ref(1)
const gridCardWidth = ref(CARD_MAX_WIDTH)
let rebalanceTimer: ReturnType<typeof setTimeout> | null = null
const hoveredMediaId = ref('')
const previewUrls = reactive<Record<string, string>>({})
const cardHeights = reactive<Record<string, number>>({})
const visibleMomentIds = reactive(new Set<string>())
interface VirtualColumn {
  topPad: number
  bottomPad: number
  items: DisplayMoment[]
}
const virtualColumns = ref<VirtualColumn[]>([])
/** 封面宽高比（宽/高），竖图最长按 3:4 裁剪 */
const coverRatios = reactive<Record<string, number>>({})
const MAX_PORTRAIT_RATIO = 3 / 4
let gridObserver: ResizeObserver | undefined
let liveFlvPlayer: any = null
let liveHlsPlayer: any = null
const isLoading = ref(false)
const isInitialLoading = ref(true)
const noMoreContent = ref(false)
const offset = ref('')
const updateBaseline = ref('')
const { handlePageRefresh, handleReachBottom, scrollViewportRef } = useBewlyApp()
const OVERSCAN_PX = 1200
const MAX_PREVIEW_CACHE = 12
let scrollListenerAttached = false
let cardMeasureObserver: ResizeObserver | undefined
let visibilityObserver: IntersectionObserver | undefined
/** 最近滚动时间，用于避免滚动中重排导致抖动 */
let lastScrollAt = 0
let virtualRaf = 0
/** 高度已稳定的卡片，避免反复 Resize 微抖动 */
const settledHeights = new Set<string>()

function httpsUrl(url = '') {
  return url.replace(/^http:/, 'https:')
}

function formatCount(value: number) {
  return value > 9999 ? `${(value / 10000).toFixed(1)}万` : value || 0
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
        action: pickText(additionalCard.button?.jump_style?.text, additionalCard.button?.check?.text, additionalCard.button?.text, '查看'),
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
    // 内容区 = 等比高度 - header 70px
    return `calc(${PLAYER_DIALOG_SCALE * 100}dvh - 70px)`
  }
  // 外层 calc(100dvh - 64px) 减去 header 70px
  return 'calc(100dvh - 64px - 70px)'
})

function openMomentDetail(moment: DisplayMoment) {
  // 图文 / 视频 / 直播统一用 Dialog + iframe 打开，避免抽屉跨域跳新标签。
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
    commentCount: Number(raw.modules?.module_stat?.comment?.count || 0),
    url: `https://www.bilibili.com/opus/${id}`,
    isVideo: content.isVideo,
    isLive: content.isLive,
    isForward,
    isArticle: raw.type === 'DYNAMIC_TYPE_ARTICLE' || contentRaw.type === 'DYNAMIC_TYPE_ARTICLE',
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
    contentEnriched: false,
  }
}

/** 列表接口偶发缺正文/图片（纯文字 DRAW 等），用详情接口补全 */
function needsContentEnrichment(moment: DisplayMoment) {
  if (moment.contentEnriched)
    return false
  if (moment.isVideo || moment.isLive)
    return false
  // 充电未解锁：列表用 icon_badge 即可展示；正文/解锁态交给详情 iframe
  if (moment.isChargeExclusive)
    return false
  const hasPreview = Boolean(moment.text?.trim() || moment.title?.trim() || moment.images.length)
  return !hasPreview
}

async function enrichMomentContent(moment: DisplayMoment) {
  if (!needsContentEnrichment(moment))
    return moment

  try {
    const response = await api.moment.getMomentDetail({
      id: moment.id,
      features: MOMENT_DETAIL_FEATURES,
    }) as any
    if (response?.code !== 0)
      return { ...moment, contentEnriched: true }

    const item = response.data?.item || response.data?.detail || response.data
    if (!item || typeof item !== 'object')
      return { ...moment, contentEnriched: true }

    const enriched = mapMoment(item as DataItem)
    return {
      ...moment,
      title: moment.title || enriched.title,
      text: moment.text || enriched.text,
      images: moment.images.length ? moment.images : enriched.images,
      isVideo: moment.isVideo || enriched.isVideo,
      isLive: moment.isLive || enriched.isLive,
      isForward: moment.isForward || enriched.isForward,
      isArticle: moment.isArticle || enriched.isArticle,
      isChargeExclusive: moment.isChargeExclusive || enriched.isChargeExclusive,
      chargeBadge: moment.chargeBadge || enriched.chargeBadge,
      chargeHint: moment.chargeHint || enriched.chargeHint,
      chargeCover: moment.chargeCover || enriched.chargeCover,
      mediaMeta: moment.mediaMeta || enriched.mediaMeta,
      roomId: moment.roomId || enriched.roomId,
      duration: moment.duration || enriched.duration,
      bvid: moment.bvid || enriched.bvid,
      videoUrl: moment.videoUrl || enriched.videoUrl,
      additional: moment.additional || enriched.additional,
      forward: moment.forward || enriched.forward,
      contentEnriched: true,
    }
  }
  catch {
    return { ...moment, contentEnriched: true }
  }
}

async function enrichMoments(list: DisplayMoment[]) {
  const targets = list.filter(needsContentEnrichment)
  if (!targets.length)
    return list

  // 控制并发，避免详情接口打爆
  const concurrency = 3
  const resultMap = new Map<string, DisplayMoment>()
  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency)
    const settled = await Promise.all(batch.map(item => enrichMomentContent(item)))
    settled.forEach(item => resultMap.set(item.id, item))
  }

  return list.map(item => resultMap.get(item.id) || item)
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

  momentColumns.value = next
  updateVirtualColumns()
}

/**
 * 列数：按卡片最大宽 280 + gap 计算。
 * 不够再开一列时保持 280 并居中留白；容器小于 280 时才缩小卡片。
 */
function updateGridColumnCount() {
  const containerWidth = gridRef.value?.clientWidth || Math.max(CARD_MAX_WIDTH, window.innerWidth - 220)

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

function appendMoments(items: DisplayMoment[], reset: boolean) {
  if (reset) {
    moments.value = []
    momentColumns.value = []
    Object.keys(cardHeights).forEach(key => delete cardHeights[key])
    Object.keys(previewUrls).forEach(key => delete previewUrls[key])
    Object.keys(coverRatios).forEach(key => delete coverRatios[key])
    settledHeights.clear()
    visibleMomentIds.clear()
    cleanupLivePreviewPlayer()
    hoveredMediaId.value = ''
    updateGridColumnCount()
  }

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
  updateVirtualColumns()
}

const momentsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${Math.max(1, gridColumnCount.value)}, ${gridCardWidth.value}px)`,
  justifyContent: 'center',
  gap: `${GRID_GAP}px`,
  width: '100%',
}))

function scheduleBottomRebalance() {
  // 滚动过程中不重排，避免瀑布流突然上下跳动
  if (rebalanceTimer)
    clearTimeout(rebalanceTimer)
  rebalanceTimer = setTimeout(() => {
    rebalanceTimer = null
    if (Date.now() - lastScrollAt < 480) {
      scheduleBottomRebalance()
      return
    }
    if (momentColumns.value.length < 2 || moments.value.length < 2)
      return
    const heights = momentColumns.value.map(column => getColumnStackHeight(column))
    const maxH = Math.max(...heights)
    const minH = Math.min(...heights)
    // 仅在列高差极大且空闲时重排
    if (maxH - minH > Math.max(360, gridCardWidth.value * 1.6))
      redistributeColumns()
  }, 720)
}

/** 计算某卡片在网格坐标系中的顶部位置 */
function findMomentOffset(momentId: string): { top: number, height: number } | null {
  const gridOffsetTop = getGridOffsetTop()
  for (const column of momentColumns.value) {
    let y = 0
    for (const moment of column) {
      const height = getCardHeight(moment)
      if (moment.id === momentId)
        return { top: gridOffsetTop + y, height }
      y += height + GRID_GAP
    }
  }
  return null
}

/**
 * 提交卡片高度。若该卡在视口上方，补偿 scrollTop，避免虚拟列表 spacer 变化导致跳动。
 */
function commitCardHeight(id: string, next: number, options?: { force?: boolean }) {
  if (next <= 0)
    return false
  const prev = cardHeights[id] || 0
  const threshold = options?.force ? 1 : (settledHeights.has(id) ? 10 : 4)
  if (prev > 0 && Math.abs(prev - next) < threshold)
    return false

  const viewport = scrollViewportRef.value
  const scrollTop = viewport?.scrollTop ?? 0
  const layout = findMomentOffset(id)
  // 卡片整体在视口上方时，高度变化会改变 topPad，需要同步滚动位置
  const prevH = prev || layout?.height || next
  const aboveViewport = !!layout && (layout.top + prevH) <= (scrollTop + 2)

  cardHeights[id] = next
  // 连续两次接近的高度视为稳定，后续忽略小幅 Resize 抖动
  if (prev > 0 && Math.abs(next - prev) < 24)
    settledHeights.add(id)
  else if (prev > 0 && settledHeights.has(id) && Math.abs(next - prev) < 48)
    settledHeights.add(id)

  if (aboveViewport && viewport && prev > 0)
    viewport.scrollTop = scrollTop + (next - prev)

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

function bindCardEl(el: Element | null, moment: DisplayMoment) {
  if (!(el instanceof HTMLElement))
    return

  cardMeasureObserver?.observe(el)
  visibilityObserver?.observe(el)
  el.dataset.momentId = moment.id

  // 初次挂载写入实测高度（带阈值，避免反复抖）
  const measured = Math.round(el.getBoundingClientRect().height)
  if (measured > 0)
    commitCardHeight(moment.id, measured)
  else if (!cardHeights[moment.id])
    cardHeights[moment.id] = estimateCardHeight(moment)
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

async function handleMediaEnter(moment: DisplayMoment) {
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
      if (hoveredMediaId.value !== moment.id)
        return
      if (res.code === 0 && res.data?.durl?.[0]?.url)
        previewUrls[moment.id] = httpsUrl(res.data.durl[0].url)
      return
    }

    if (!moment.isVideo || !moment.bvid)
      return

    const info = await api.video.getVideoInfo({ bvid: moment.bvid })
    const cid = info.code === 0 ? info.data?.cid : undefined
    if (!cid || hoveredMediaId.value !== moment.id)
      return

    const preview = await api.video.getVideoPreview({ bvid: moment.bvid, cid })
    if (preview.code === 0 && preview.data?.durl?.[0]?.url && hoveredMediaId.value === moment.id)
      previewUrls[moment.id] = httpsUrl(preview.data.durl[0].url)
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

async function loadMoments(reset = false) {
  if (isLoading.value || (!reset && noMoreContent.value))
    return

  isLoading.value = true
  if (reset) {
    offset.value = ''
    updateBaseline.value = ''
    noMoreContent.value = false
  }

  try {
    const response = await api.moment.getMoments({
      type: 'all',
      offset: offset.value || undefined,
      update_baseline: updateBaseline.value || undefined,
      features: MOMENT_FEED_FEATURES,
    }) as MomentResult
    if (response.code !== 0)
      return

    const mapped = (response.data?.items || []).map(mapMoment)
    const items = await enrichMoments(mapped)
    appendMoments(items, reset)

    offset.value = response.data?.offset || ''
    updateBaseline.value = response.data?.update_baseline || ''
    noMoreContent.value = !response.data?.has_more || items.length === 0
  }
  finally {
    isLoading.value = false
    isInitialLoading.value = false
  }
}

function refresh() {
  isInitialLoading.value = moments.value.length === 0
  void loadMoments(true)
}

function handleDetailFrameMessage(event: MessageEvent) {
  const type = event.data?.type
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
    if (gridRef.value)
      gridObserver?.observe(gridRef.value)
    updateGridColumnCount()
    attachViewportScroll()
    setupVirtualObservers()
    updateVirtualColumns()
  })
  window.addEventListener('message', handleDetailFrameMessage)
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
</script>

<template>
  <section class="moments-page">
    <div v-if="isInitialLoading" class="moments-grid moments-grid--skeleton" :style="momentsGridStyle">
      <div v-for="index in 8" :key="index" class="moment-card moment-card--skeleton" />
    </div>
    <div v-else-if="moments.length" ref="gridRef" class="moments-grid" :style="momentsGridStyle">
      <div v-for="(column, columnIndex) in virtualColumns" :key="columnIndex" class="moments-grid__column">
        <div v-if="column.topPad" class="moments-grid__spacer" :style="{ height: `${column.topPad}px` }" />
        <article
          v-for="moment in column.items" :key="moment.id"
          :ref="(el) => bindCardEl(el as Element | null, moment)"
          class="moment-card"
          :class="{
            'moment-card--text': !moment.images.length && !moment.isVideo && !moment.isLive && !moment.isChargeExclusive,
            'moment-card--charge': moment.isChargeExclusive,
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
            <img :src="moment.images[0]" :alt="moment.title" loading="lazy">
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
              :src="moment.images[0]"
              :alt="moment.text"
              loading="lazy"
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
              <img v-if="moment.additional.cover && !moment.isChargeExclusive" :src="moment.additional.cover" alt="">
              <span><strong>{{ moment.additional.title || '附加内容' }}</strong><small>{{ moment.additional.desc }}</small></span>
              <em>{{ moment.additional.action }}</em>
            </a>
            <footer class="moment-card__footer">
              <img :src="moment.author.face" :alt="moment.author.name" class="moment-card__avatar">
              <span class="moment-card__author">{{ moment.author.name }}</span>
              <span class="moment-card__likes"><span i-tabler-heart /> {{ formatCount(moment.likeCount) }}</span>
            </footer>
          </div>
        </article>
        <div v-if="column.bottomPad" class="moments-grid__spacer" :style="{ height: `${column.bottomPad}px` }" />
      </div>
    </div>
    <div v-else class="moments-page__empty">
      <span i-tabler-windmill text-4xl /><p>暂时没有可展示的动态</p><button @click="refresh">
        重新加载
      </button>
    </div>
    <p v-if="isLoading && !isInitialLoading" class="moments-page__loading">
      正在加载更多动态…
    </p>
    <p v-else-if="noMoreContent && moments.length" class="moments-page__loading">
      已经到底啦
    </p>

    <Dialog
      v-if="selectedMoment && detailFrameUrl"
      append-to-bewly-body
      content-flush
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
          在新标签打开
          <span i-tabler-external-link />
        </a>
      </div>
    </Dialog>
  </section>
</template>

<style scoped lang="scss">
.moments-page {
  padding: 8px 0 48px;
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
  object-fit: cover;
  object-position: center top;
  background: var(--bew-fill-1);
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
  white-space: nowrap;
}
.moments-page__loading {
  margin: 18px 0 0;
  color: var(--bew-text-2);
  text-align: center;
  font-size: 13px;
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
.moment-card--skeleton {
  height: 280px;
  background: linear-gradient(100deg, var(--bew-fill-1) 25%, var(--bew-fill-2) 37%, var(--bew-fill-1) 63%);
  background-size: 400% 100%;
  animation: moment-shimmer 1.3s ease infinite;
}
.moment-detail-frame {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 0 0 var(--bew-radius) var(--bew-radius);
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
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
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
@keyframes moment-shimmer {
  to {
    background-position: -400% 0;
  }
}
</style>
