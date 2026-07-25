import { buildKeywordSearchUrl } from '~/utils/searchNavigation'

import type { Author, Video } from './types'

export function getAuthorJumpUrl(author?: Author) {
  if (!author)
    return ''

  return author.authorUrl || (author.mid ? `//space.bilibili.com/${author.mid}` : '')
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

export function getCurrentVideoUrl(video: Video, videoCurrentTime: Ref<number | null>) {
  const baseUrl = `https://www.bilibili.com/video/${video.bvid ?? `av${video.aid}`}`
  const currentTime = videoCurrentTime.value
  return currentTime && currentTime > 5 ? `${baseUrl}/?t=${currentTime}` : `${baseUrl}`
}
