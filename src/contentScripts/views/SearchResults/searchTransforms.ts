import type { Video } from '~/components/VideoCard/types'
import { parseStatNumber } from '~/utils/dataFormatter'

export function formatNumber(num?: number): string {
  if (!num)
    return '0'
  if (num >= 10000)
    return `${(num / 10000).toFixed(1)}万`
  return num.toString()
}

export function removeHighlight(text?: string): string {
  if (typeof text !== 'string')
    return ''
  return text.replace(/<em class="keyword">/g, '').replace(/<\/em>/g, '')
}

/**
 * 检查视频是否是广告
 */
export function isAdVideo(video: any): boolean {
  if (!video)
    return false
  const type = video.type || ''
  return typeof type === 'string' && type.toLowerCase().includes('ad')
}

function splitTagValue(value: string): string[] {
  return value.split(/[\s,，、/|#；;]+/g).filter(Boolean)
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}:${`${remainingMinutes}`.padStart(2, '0')}:${`${remainingSeconds}`.padStart(2, '0')}`
  }
  return `${minutes}:${`${remainingSeconds}`.padStart(2, '0')}`
}

export function convertVideoData(video: any): Video {
  const cover = video.pic || video.cover
  const normalizedCover = typeof cover === 'string' && cover.startsWith('//')
    ? `https:${cover}`
    : cover

  const durationSeconds = parseDurationToSeconds(video.duration)
    ?? parseDurationToSeconds(video.duration_seconds)
    ?? parseDurationToSeconds(video.duration_ms ? Number(video.duration_ms) / 1000 : undefined)

  const durationStr = typeof video.duration === 'string'
    ? video.duration
    : typeof video.durationStr === 'string'
      ? video.durationStr
      : durationSeconds ? formatDuration(durationSeconds) : undefined

  const tags = extractVideoTags(video)
  const capsuleText = removeHighlight(video.typename || '').trim()

  return {
    id: video.aid || video.id,
    duration: durationSeconds,
    durationStr,
    title: removeHighlight(video.title),
    cover: normalizedCover || '',
    author: {
      name: removeHighlight(video.author || video.owner?.name),
      mid: video.mid || video.owner?.mid,
      authorFace: video.upic || video.owner?.face || '',
    },
    view: video.play || video.stat?.view,
    danmaku: video.danmaku || video.video_review || video.stat?.danmaku,
    publishedTimestamp: video.pubdate,
    bvid: video.bvid,
    aid: video.aid,
    cid: video.cid,
    threePointV2: [],
    tag: tags.length ? tags : undefined,
    capsuleText: capsuleText || undefined,
  }
}

export function convertBangumiCardData(item: any) {
  const cover = item.cover || item.square_cover || item.vertical_cover || item.horizontal_cover
  const sanitizedCover = typeof cover === 'string' && cover.startsWith('//') ? `https:${cover}` : cover
  const url = item.url
    || (item.season_id ? `https://www.bilibili.com/bangumi/play/ss${item.season_id}` : undefined)
    || (item.media_id ? `https://www.bilibili.com/bangumi/media/md${item.media_id}` : undefined)
    || ''

  const styles = Array.isArray(item.styles)
    ? item.styles
    : Array.isArray(item.style)
      ? item.style
      : []

  const evaluate = typeof item.evaluate === 'string' ? removeHighlight(item.evaluate) : ''
  const descText = typeof item.desc === 'string' ? removeHighlight(item.desc) : ''

  const tags = styles
    .map((style: any) => {
      if (typeof style === 'string')
        return removeHighlight(style)
      if (typeof style?.style_name === 'string')
        return removeHighlight(style.style_name)
      if (typeof style?.name === 'string')
        return removeHighlight(style.name)
      return null
    })
    .filter(Boolean) as string[]

  return {
    url,
    cover: sanitizedCover,
    title: removeHighlight(item.title),
    desc: sanitizeBangumiDescription(evaluate || descText),
    evaluate,
    tags,
    capsuleText: removeHighlight(item.badge || item.badge_info?.text || item.season_type_name || ''),
    view: item.play || item.stat?.view,
    follow: item.follow,
    badge: item.badge || item.badge_info?.text
      ? {
          text: removeHighlight(item.badge || item.badge_info?.text),
          bgColor: item.badge_info?.bg_color || '#FB7299',
          bgColorDark: item.badge_info?.bg_color_night || '#FB7299',
        }
      : undefined,
  }
}

export function convertBangumiHighlight(item: any) {
  const id = item.season_id || item.media_id || item.id
  const base = convertBangumiCardData(item)
  const score = Number(item.media_score?.score ?? item.score)
  const bizTips = Array.isArray(item.styles)
    ? item.styles.map((style: any) => (typeof style === 'string' ? removeHighlight(style) : style?.style_name ?? style?.name)).filter(Boolean)
    : []
  const publishTimestamp = Number(item.pubtime || item.publish_time || item.ctime)
  const publishDateFormatted = formatPublishDate(publishTimestamp)
  const description = typeof base.desc === 'string' ? base.desc.slice(0, 140) : ''
  const episodes = extractBangumiEpisodes(item)
  const episodeCount = resolveBangumiEpisodeCount(item, episodes)
  return {
    id,
    ...base,
    url: base.url,
    score: Number.isFinite(score) ? score : undefined,
    seasonType: removeHighlight(item.season_type_name || item.season_title || ''),
    areas: Array.isArray(item.areas) ? item.areas.map((area: any) => removeHighlight(typeof area === 'string' ? area : area?.name)).filter(Boolean).join(' / ') : '',
    publishDate: publishTimestamp,
    publishDateFormatted,
    episodeCount,
    tags: bizTips.filter(Boolean).slice(0, 4),
    buttonText: removeHighlight(item.button_text || '立即观看'),
    desc: sanitizeBangumiDescription(description || base.desc || ''),
    episodes,
  }
}

export interface BangumiEpisode {
  id: string
  title: string
  longTitle?: string
  cover?: string
  url?: string
  badge?: string
  number?: number
}

export function convertUserCardData(user: any) {
  const verifyInfo = user.official_verify?.desc || user.verify_info || ''
  // 兼容live_user数据结构：uid->mid, uface->face
  const mid = user.mid || user.uid
  const face = user.upic || user.face || user.uface || ''
  return {
    mid,
    name: removeHighlight(user.uname),
    face,
    sign: removeHighlight(user.usign || user.sign),
    fans: user.fans || user.attentions,
    videos: user.videos,
    level: user.level,
    gender: user.gender, // 0:保密, 1:男, 2:女
    isVerified: Boolean(user.official_verify?.type === 0 || user.is_verify),
    verifyInfo: removeHighlight(verifyInfo),
    samples: convertUserSamples(user, 7),
    isFollowed: user.is_follow || 0,
    showFollowButton: true,
    liveStatus: user.live_status,
    roomid: user.roomid || user.room_id,
  }
}

export function convertUserHighlight(user: any) {
  const base = convertUserCardData(user)
  return {
    ...base,
    face: base.face,
    name: base.name,
    fans: user.fans,
    videos: user.videos,
    desc: removeHighlight(user.usign || user.sign || ''),
    level: user.level,
    gender: user.gender, // 0:保密, 1:男, 2:女
    officialVerify: removeHighlight(user.official_verify?.title || user.official_verify?.desc || ''),
    url: `https://space.bilibili.com/${user.mid}`,
    samples: convertUserSamples(user, 7),
  }
}

export function convertArticleCardData(article: any) {
  const cover = (Array.isArray(article.image_urls) && article.image_urls[0])
    || article.pic
    || article.cover

  const tags = Array.isArray(article.tags)
    ? article.tags
      .map((tag: any) => {
        if (typeof tag === 'string')
          return { name: removeHighlight(tag) }
        if (typeof tag?.name === 'string')
          return { name: removeHighlight(tag.name) }
        if (typeof tag?.tag_name === 'string')
          return { name: removeHighlight(tag.tag_name) }
        return null
      })
      .filter(Boolean) as Array<{ name: string }>
    : undefined

  return {
    id: article.id,
    title: removeHighlight(article.title),
    desc: removeHighlight(article.desc),
    cover,
    author: removeHighlight(article.author_name),
    authorMid: article.mid,
    view: article.view,
    like: article.like,
    reply: article.reply,
    publishTime: article.pub_time || article.publish_time || article.ctime,
    categoryName: removeHighlight(article.category_name),
    tags,
  }
}

export function convertMediaFtData(item: any) {
  const cover = item.cover || item.square_cover || item.vertical_cover || item.horizontal_cover
  const url = item.url
    || (item.season_id ? `https://www.bilibili.com/bangumi/play/ss${item.season_id}` : undefined)
    || (item.media_id ? `https://www.bilibili.com/bangumi/media/md${item.media_id}` : undefined)
    || ''

  const rawYear = item.release_date || item.pubtime || item.year
  const year = typeof rawYear === 'string'
    ? rawYear.slice(0, 4)
    : rawYear

  const areaSource = item.areas
  const area = Array.isArray(areaSource)
    ? areaSource.map((n: any) => removeHighlight(typeof n === 'string' ? n : n?.name)).filter(Boolean).join(' / ')
    : removeHighlight(areaSource || '')

  const stylesSource = Array.isArray(item.styles) ? item.styles : Array.isArray(item.style) ? item.style : []
  const tags = stylesSource
    .map((style: any) => {
      if (typeof style === 'string')
        return removeHighlight(style)
      if (typeof style?.style_name === 'string')
        return removeHighlight(style.style_name)
      if (typeof style?.name === 'string')
        return removeHighlight(style.name)
      return null
    })
    .filter(Boolean) as string[]

  return {
    id: item.season_id || item.media_id || item.id,
    title: removeHighlight(item.title),
    url,
    cover,
    typeName: removeHighlight(item.media_type_name || item.season_type_name || item.badge || ''),
    area,
    year,
    score: typeof item.media_score?.score === 'number' ? item.media_score.score : Number(item.media_score?.score) || undefined,
    desc: removeHighlight(item.evaluate || item.desc || ''),
    tags,
  }
}

export function convertMediaFtHighlight(item: any) {
  const cover = item.cover || item.square_cover || item.vertical_cover || item.horizontal_cover
  const url = item.url
    || item.goto_url
    || (item.season_id ? `https://www.bilibili.com/bangumi/play/ss${item.season_id}` : undefined)
    || (item.media_id ? `https://www.bilibili.com/bangumi/media/md${item.media_id}` : undefined)
    || ''

  const badge = Array.isArray(item.badges) && item.badges.length > 0
    ? removeHighlight(item.badges[0].text)
    : removeHighlight(item.badge || '')

  const areas = typeof item.areas === 'string' ? item.areas : ''
  const styles = typeof item.styles === 'string' ? item.styles : ''
  const indexShow = typeof item.index_show === 'string' ? item.index_show : ''

  const episodes = Array.isArray(item.eps)
    ? item.eps.map((ep: any) => ({
        id: ep.id,
        title: ep.title || ep.index,
        url: ep.url,
        cover: ep.cover,
        badge: ep.badges?.[0]?.text,
      }))
    : []

  return {
    id: item.season_id || item.media_id || item.id,
    title: removeHighlight(item.title),
    url,
    cover,
    badge,
    score: typeof item.media_score?.score === 'number' ? item.media_score.score : undefined,
    areas,
    styles,
    indexShow,
    desc: removeHighlight(item.desc || ''),
    episodes,
  }
}

export function convertActivityData(item: any) {
  const cover = typeof item.cover === 'string'
    ? item.cover.startsWith('//') ? `https:${item.cover}` : item.cover
    : undefined
  const url = item.url || item.link || ''

  const rawId = item.id || item.card_value || item.pos || item.title || item.url

  return {
    id: String(rawId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    title: removeHighlight(item.title),
    desc: removeHighlight(item.desc),
    cover,
    url,
    badge: removeHighlight(item.corner),
  }
}

export function removeUnusedActivityCard(item: any) {
  return item.card_type !== 2
}

export function convertLiveRoomData(live: any): Video {
  const cover = live.cover || live.user_cover || live.pic
  const sanitizedCover = typeof cover === 'string' && cover.startsWith('//')
    ? `https:${cover}`
    : cover

  // uface 可能也需要补全 https
  const authorFace = live.uface || live.face || ''
  const sanitizedAuthorFace = typeof authorFace === 'string' && authorFace.startsWith('//')
    ? `https:${authorFace}`
    : authorFace

  const tag = removeHighlight(live.cate_name?.trim() || live.area_name_v2?.trim() || live.area_name?.trim() || '')

  return {
    id: live.roomid,
    title: removeHighlight(live.title),
    cover: sanitizedCover || '',
    author: {
      name: removeHighlight(live.uname),
      authorFace: sanitizedAuthorFace || '',
      mid: live.uid,
    },
    view: parseStatNumber(live.online),
    viewStr: String(live.online || ''),
    tag,
    roomid: live.roomid,
    liveStatus: live.live_status,
    threePointV2: [],
  }
}

export function isMediaFtItem(item: any): boolean {
  return item?.type === 'media_ft'
    || item?.result_type === 'media_ft'
    || item?.season_type === 4
    || item?.media_type === 2
}

function extractBangumiEpisodes(item: any): BangumiEpisode[] {
  const foundEpisodes: BangumiEpisode[] = []
  const seenEpisodeIds = new Set<string>()

  const pushEpisode = (episode: any) => {
    if (!episode)
      return
    const url = episode.url || episode.link || (episode.id ? `https://www.bilibili.com/bangumi/play/ep${episode.id}` : '')
    const title = removeHighlight(episode.title || episode.index_title || episode.long_title || episode.name || '')
    if (!title)
      return
    let cover = episode.cover || episode.pic || episode.square_cover
    if (typeof cover === 'string' && cover.startsWith('//'))
      cover = `https:${cover}`
    const badge = episode.badge || episode.badges?.[0]?.text
    const longTitle = removeHighlight(episode.long_title || episode.index_title || '')
    const id = String(episode.id || episode.ep_id || episode.cid || title)
    if (seenEpisodeIds.has(id))
      return
    seenEpisodeIds.add(id)
    const number = resolveEpisodeNumber(episode, title)
    foundEpisodes.push({
      id,
      title,
      longTitle,
      cover,
      url,
      badge,
      number,
    })
  }

  const collectFromArray = (arr: any[]) => {
    arr.forEach((entry) => {
      if (!entry)
        return
      if (Array.isArray(entry)) {
        collectFromArray(entry)
        return
      }
      if (typeof entry === 'object') {
        if ('title' in entry || 'index_title' in entry || 'long_title' in entry)
          pushEpisode(entry)

        ;['episodes', 'items', 'data', 'modules'].forEach((key) => {
          const value = entry[key]
          if (Array.isArray(value))
            collectFromArray(value)
        })
      }
    })
  }

  const candidates = [
    item?.episodes,
    item?.ep_list,
    item?.module_info?.episodes,
    item?.module_info?.modules,
    item?.modules,
    item?.season?.episodes,
  ]

  candidates.forEach((candidate) => {
    if (Array.isArray(candidate))
      collectFromArray(candidate)
  })

  if (foundEpisodes.length === 0 && Array.isArray(item?.new_ep?.index_show))
    collectFromArray(item.new_ep.index_show)

  return foundEpisodes
}

function resolveEpisodeNumber(source: any, fallbackTitle: string): number | undefined {
  const values: Array<string | number | undefined> = [
    source?.order,
    source?.episode,
    source?.index,
    source?.index_title,
    source?.title,
    source?.long_title,
    source?.episode_index,
    source?.ep_index,
    source?.ep_title,
    fallbackTitle,
  ]

  for (const value of values) {
    if (typeof value === 'number') {
      const parsed = Number.parseInt(String(value), 10)
      if (Number.isFinite(parsed) && parsed > 0)
        return parsed
    }
    else if (typeof value === 'string') {
      const match = value.match(/(\d+)/)
      if (match) {
        const parsed = Number.parseInt(match[1], 10)
        if (Number.isFinite(parsed) && parsed > 0)
          return parsed
      }
    }
  }

  return undefined
}

function convertUserSamples(source: any, limit = 6): any[] {
  const list = Array.isArray(source?.res) ? source.res : []
  const samples: any[] = []

  for (let index = 0; index < list.length; index += 1) {
    const item = list[index]
    if (!item)
      continue
    const id = String(item.bvid || item.aid || item.id || item.arcurl || index)
    const title = removeHighlight(item.title || item.long_title || `稿件 ${index + 1}`)
    const cover = normalizeMediaCover(item.pic || item.cover)
    const url = resolveUserSampleUrl(item)
    const play = parseCountNumber(item.play)
    const durationStr = normalizeDuration(item.duration)
    const duration = durationStr ? parseDurationToSeconds(durationStr) : undefined
    samples.push({
      id,
      title,
      cover,
      url,
      duration,
      durationStr,
      play,
    })
    if (samples.length >= limit)
      break
  }

  return samples
}

function normalizeMediaCover(value: any): string | undefined {
  if (typeof value !== 'string' || !value)
    return undefined
  if (value.startsWith('//'))
    return `https:${value}`
  return value
}

function resolveUserSampleUrl(sample: any): string | undefined {
  if (typeof sample?.arcurl === 'string' && sample.arcurl)
    return sample.arcurl
  if (typeof sample?.bvid === 'string' && sample.bvid)
    return `https://www.bilibili.com/video/${sample.bvid}`
  if (typeof sample?.aid === 'number' && Number.isFinite(sample.aid))
    return `https://www.bilibili.com/video/av${sample.aid}`
  return undefined
}

function parseCountNumber(value: any): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value))
    return value
  if (typeof value === 'string') {
    const sanitized = value.trim()
    if (!sanitized || sanitized === '--')
      return undefined
    if (sanitized.endsWith('万')) {
      const parsed = Number.parseFloat(sanitized.slice(0, -1))
      if (Number.isFinite(parsed))
        return Math.round(parsed * 10000)
      return undefined
    }
    const numeric = Number.parseFloat(sanitized.replace(/,/g, ''))
    if (Number.isFinite(numeric))
      return Math.round(numeric)
  }
  return undefined
}

function normalizeDuration(value: any): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalSeconds = Math.max(0, Math.round(value))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${`${seconds}`.padStart(2, '0')}`
  }
  return undefined
}

function extractVideoTags(video: any): string[] {
  const rawValues: string[] = []

  const pushValue = (value: any) => {
    if (typeof value === 'string')
      rawValues.push(value)
  }

  if (Array.isArray(video.tag))
    rawValues.push(...video.tag)
  else
    pushValue(video.tag)

  if (Array.isArray(video.tags)) {
    for (const tag of video.tags) {
      if (typeof tag === 'string')
        rawValues.push(tag)
      else if (typeof tag?.tag_name === 'string')
        rawValues.push(tag.tag_name)
      else if (typeof tag?.name === 'string')
        rawValues.push(tag.name)
    }
  }

  const candidates = rawValues
    .flatMap(value => splitTagValue(value))
    .map(item => removeHighlight(item).replace(/\s+/g, ''))
    .filter(Boolean)

  const result: string[] = []
  const seen = new Set<string>()

  for (const tag of candidates) {
    if (Array.from(tag).length >= 4)
      continue
    if (seen.has(tag))
      continue
    seen.add(tag)
    result.push(tag)
    if (result.length >= 3)
      break
  }

  return result
}

function parseDurationToSeconds(raw: any): number | undefined {
  if (raw === null || raw === undefined)
    return undefined

  if (typeof raw === 'number' && Number.isFinite(raw))
    return raw > 0 ? raw : undefined

  if (typeof raw === 'string') {
    const parts = raw.split(':').map(part => Number(part))
    if (parts.some(part => Number.isNaN(part)))
      return undefined

    let total = 0
    let multiplier = 1
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      total += parts[i] * multiplier
      multiplier *= 60
    }
    return total
  }

  return undefined
}

function sanitizeBangumiDescription(desc: string): string {
  if (!desc)
    return ''
  if (desc.includes('[{') || desc.includes('{"')) {
    const index = desc.indexOf('[{')
    if (index > -1)
      return desc.slice(0, index).trim()
  }
  return desc.trim()
}

function formatPublishDate(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp) || timestamp <= 0)
    return ''
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime()))
    return ''
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function resolveBangumiEpisodeCount(item: any, episodes: BangumiEpisode[]): number | undefined {
  const normalizeNumber = (value: any) => {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? number : undefined
  }

  const totalCount = normalizeNumber(item.total_count ?? item.total_count_show)
  if (totalCount)
    return totalCount

  if (Array.isArray(item.eps)) {
    if (item.eps.length > 0)
      return item.eps.length
  }
  else {
    const epsNumber = normalizeNumber(item.eps)
    if (epsNumber)
      return epsNumber
  }

  const moduleEpisodes = Array.isArray(item.module_info?.episodes)
    ? item.module_info.episodes.length
    : undefined
  if (moduleEpisodes)
    return moduleEpisodes

  if (Array.isArray(item.episodes) && item.episodes.length > 0)
    return item.episodes.length

  const indexShow = item.new_ep?.index_show || item.new_ep?.show || item.index_show
  if (typeof indexShow === 'string') {
    const match = indexShow.match(/(\d+)\s*$/)
    if (match) {
      const parsed = normalizeNumber(match[1])
      if (parsed)
        return parsed
    }
  }

  if (episodes.length > 0)
    return episodes.length

  return undefined
}

/**
 * 转换游戏卡片数据
 */
export function convertWebGameData(game: any) {
  const cover = typeof game.game_icon === 'string'
    ? game.game_icon.startsWith('//') ? `https:${game.game_icon}` : game.game_icon
    : undefined

  const url = game.game_link || ''

  return {
    id: String(game.game_base_id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    title: removeHighlight(game.game_name || game.game_name_v2),
    desc: removeHighlight(game.summary || game.notice),
    cover,
    url,
    badge: game.recommend_reason,
    tags: game.game_tags,
    rating: game.grade,
    downloads: game.download_num,
    platform: game.platform,
  }
}
