import type { DataItem } from '~/models/moment/moment'
import { ThreePointItemType } from '~/models/moment/moment'
import { i18n } from '~/utils/i18n'

import { isMomentLotteryUrl } from './lottery'
import type { DisplayMoment, DisplayRichTextSegment } from './types'
import { formatCount, getMomentVideoUrl, getSafeImageRatio, httpsUrl, shouldUseMomentImageGrid } from './utils'

const { t } = i18n.global

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

function extractRichTextSegments(momentId: string, ...nodeLists: any[]): DisplayRichTextSegment[] {
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

    const isLottery = node?.type === 'RICH_TEXT_NODE_TYPE_LOTTERY'
    const isAtMention = node?.type === 'RICH_TEXT_NODE_TYPE_AT'
    const isSupportedLink = node?.type === 'RICH_TEXT_NODE_TYPE_TOPIC'
      || node?.type === 'RICH_TEXT_NODE_TYPE_WEB'
      || isAtMention
      || isLottery
    const rawJumpUrl = node?.jump_url
      || (isLottery && /^\d+$/.test(momentId) ? `https://www.bilibili.com/h5/lottery/result?business_id=${momentId}&business_type=1&isWeb=1` : '')
      || (isAtMention && node?.rid ? `https://space.bilibili.com/${node.rid}` : '')
    const url = isSupportedLink || isMomentLotteryUrl(rawJumpUrl || '') ? normalizeRichTextJumpUrl(rawJumpUrl) : ''
    if (text && url)
      return [{ type: 'link' as const, text, url, isLottery: isLottery || isMomentLotteryUrl(url) }]

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
  // 视频动态的 module_dynamic.desc 是简介副本，归入继承来源，避免被当成本人正文
  const isVideoMajor = Boolean(major.archive || major.ugc_season || major.pgc)
  const selfText = pickText(
    opus.summary?.text,
    typeof opus.summary === 'string' ? opus.summary : '',
    isVideoMajor ? '' : normalizeDescText(dynamic.desc),
    common.desc,
  )
  const inheritedText = pickText(
    isVideoMajor ? normalizeDescText(dynamic.desc) : '',
    archive.desc,
    article.desc,
  )
  let text = pickText(selfText, inheritedText)
  /** 简介继承自视频/专栏元数据时标记，卡片内做弱化展示 */
  const descInherited = !selfText && Boolean(inheritedText)
  const richText = extractRichTextSegments(
    String(item.id_str || item.id || ''),
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
        url: isVoteAdditional
          ? ''
          : httpsUrl(additionalCard.jump_url || additionalCard.button?.jump_url || ''),
        isUpRecommendation: additional.type === 'ADDITIONAL_TYPE_UP_RCMD'
          || pickText(additionalCard.head_text, additionalCard.title) === 'UP主的推荐',
        isVideoReservation: additional.type === 'ADDITIONAL_TYPE_RESERVE'
          && Number(additionalCard.button?.type) === 1,
        isLiveReservation: additional.type === 'ADDITIONAL_TYPE_RESERVE'
          && Number(additionalCard.button?.type) === 2,
        isVote: isVoteAdditional,
        voteId: isVoteAdditional ? String(additionalCard.vote_id || '') : '',
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
      voteId: '',
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
  const isNineGrid = shouldUseMomentImageGrid(images, major?.type === 'MAJOR_TYPE_DRAW')

  return {
    title: pickText(live?.title, opus.title, archive.title, article.title, common.title),
    text,
    descInherited,
    richText,
    images,
    imageRatios,
    isNineGrid,
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

export interface MappedMoment {
  moment: DisplayMoment
  /** 接口给出的首图宽高比（转发时为原动态首图），供列表在封面加载前预估卡片高度 */
  firstImageRatio?: number
}

/** 将动态接口条目规整为卡片展示数据，不依赖页面状态，可供任意动态列表复用。 */
export function mapMoment(item: DataItem): MappedMoment {
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
    ? extractRichTextSegments(String(id), dynamic.desc?.rich_text_nodes)
    : content.richText
  const additional = content.additional || selfContent.additional
  const isChargeExclusive = content.isChargeExclusive || selfContent.isChargeExclusive
  const commentInteraction = raw.modules?.module_interaction?.items?.find(
    (interaction: any) => Number(interaction?.type) === 1,
  )?.desc
  const hotCommentText = normalizeDescText(commentInteraction)
  const hotCommentRichText = extractRichTextSegments(String(id), commentInteraction?.rich_text_nodes)
  const threePointItems = raw.modules?.module_more?.three_point_items || []
  const deleteItem = threePointItems.find(item => item?.type === ThreePointItemType.ThreePointDelete)

  const moment: DisplayMoment = {
    id,
    author: {
      mid: String(author.mid || ''),
      name: author.name || t('moments.bilibili_user'),
      face: httpsUrl(author.face || ''),
    },
    publishedAt: Number(author.pub_ts || 0),
    title: content.title,
    text,
    descInherited: !isForward && Boolean(content.descInherited),
    richText,
    // 转发卡片只展示原动态摘要，不能把原动态图片提升为外层卡片媒体。
    images: isForward || (isChargeExclusive && !content.isVideo) ? [] : content.images,
    imageRatios: isForward || (isChargeExclusive && !content.isVideo) ? [] : content.imageRatios,
    isNineGrid: !isForward && !isChargeExclusive && content.isNineGrid,
    time: author.pub_time || '',
    likeCount: Number(raw.modules?.module_stat?.like?.count || 0),
    isLiked: raw.modules?.module_stat?.like?.status === true
      || Number(raw.modules?.module_stat?.like?.status) === 1,
    isLikeDisabled: Boolean(
      raw.modules?.module_stat?.like?.forbidden
      || raw.modules?.module_stat?.like?.disabled,
    ),
    forwardCount: Number(raw.modules?.module_stat?.forward?.count || 0),
    isForwardDisabled: Boolean(raw.modules?.module_stat?.forward?.forbidden),
    commentCount: Number(raw.modules?.module_stat?.comment?.count || 0),
    canDelete: Boolean(deleteItem),
    deleteParams: deleteItem?.params,
    canReport: threePointItems.some(item => item?.type === ThreePointItemType.ThreePointReport),
    commentTarget: raw.basic?.comment_id_str && Number(raw.basic.comment_type) > 0
      ? { oid: raw.basic.comment_id_str, type: Number(raw.basic.comment_type) }
      : undefined,
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
    mediaMeta: isForward ? '' : content.mediaMeta,
    liveArea: content.liveArea,
    livePopularity: content.livePopularity,
    roomId: content.roomId,
    duration: content.duration,
    videoPlay: content.videoPlay,
    videoDanmaku: content.videoDanmaku,
    aid: content.aid,
    bvid: content.bvid,
    epid: content.epid,
    videoUrl: content.videoUrl,
    additional,
    forward: isForward
      ? {
          author: forwardedAuthor.name || t('moments.original_author'),
          authorMid: String(forwardedAuthor.mid || ''),
          authorFace: httpsUrl(forwardedAuthor.face || ''),
          authorAction: forwardedAuthor.pub_action || '',
          title: content.title,
          text: content.text,
          richText: content.richText,
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
          isNineGrid: !content.isVideo && !content.isLive && !content.isChargeExclusive
            ? content.isNineGrid
            : false,
          video: forwardedArchive
            ? {
                title: pickText(forwardedArchive.title, content.title),
                desc: pickText(forwardedArchive.desc),
                cover: httpsUrl(forwardedArchive.cover || content.images[0] || ''),
                duration: pickText(forwardedArchive.duration_text, content.duration),
                play: pickText(forwardedArchive.stat?.play, content.videoPlay),
                danmaku: pickText(forwardedArchive.stat?.danmaku, content.videoDanmaku),
                url: getMomentVideoUrl(content),
                aid: content.aid,
                bvid: content.bvid,
              }
            : undefined,
        }
      : undefined,
  }

  return { moment, firstImageRatio: content.firstImageRatio }
}
