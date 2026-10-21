import { buildKeywordSearchUrl } from '~/utils/searchNavigation'

import type { Author, Video } from './types'

export function getAuthorJumpUrl(author?: Author) {
  if (!author)
    return ''

  return author.authorUrl || (author.mid ? `//space.bilibili.com/${author.mid}` : '')
}

/** 接口未返回头像（如 APP HD 推荐）时，卡片不显示头像占位 */
export function hasAuthorAvatar(author?: Author | Author[]) {
  if (!author)
    return false

  return Array.isArray(author)
    ? author.some(item => Boolean(item.authorFace))
    : Boolean(author.authorFace)
}

/** 番剧、课程等 PGC 卡片 */
export function isBangumiVideo(video: Video) {
  return Boolean(video.epid) || video.goto === 'bangumi' || video.type === 'bangumi'
}

/** 标签点击跳转搜索页（复用统一的搜索链接构建入口） */
export function getTagSearchUrl(tag: string) {
  return buildKeywordSearchUrl(tag)
}

export function getCurrentTime(videoElement: Ref<HTMLVideoElement | null>) {
  if (videoElement.value) {
    return videoElement.value.currentTime
  }
  return null
}

export function getCurrentVideoUrl(video: Video, currentTime: number | null) {
  const baseUrl = video.url || `https://www.bilibili.com/video/${video.bvid ?? `av${video.aid}`}`
  if (!currentTime || !Number.isFinite(currentTime) || currentTime < 1 || video.roomid)
    return baseUrl

  try {
    const url = new URL(baseUrl)
    if (url.hostname === 'www.bilibili.com' && /^\/(?:video\/|bangumi\/play\/)/.test(url.pathname))
      url.searchParams.set('t', String(Math.floor(currentTime)))
    return url.toString()
  }
  catch {
    return baseUrl
  }
}
