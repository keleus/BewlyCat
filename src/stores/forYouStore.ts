import { defineStore } from 'pinia'

import type { Item as AppVideoItem } from '~/models/video/appForYou'
import type { Item as VideoItem } from '~/models/video/forYou'

// 预处理的显示数据，减少模板中的计算
export interface VideoCardDisplayData {
  id: number
  duration?: number
  durationStr?: string
  title: string
  cover: string
  author: {
    name: string
    authorFace: string
    followed: boolean
    mid: number
  }
  tag?: string
  view?: number
  viewStr?: string
  danmaku?: number
  danmakuStr?: string
  like?: number
  publishedTimestamp?: number
  bvid: string
  cid?: number
  capsuleText?: string
  goto?: string
  url?: string
  type?: 'horizontal' | 'vertical' | 'bangumi'
  threePointV2?: any
}

export interface VideoElement {
  uniqueId: string
  item?: VideoItem
  displayData?: VideoCardDisplayData
}

export interface AppVideoElement {
  uniqueId: string
  item?: AppVideoItem
  displayData?: VideoCardDisplayData
}

export interface ForYouState {
  // 视频列表数据 - 最关键的状态
  videoList: VideoElement[]
  appVideoList: AppVideoElement[]

  // 基础页面状态
  refreshIdx: number
  noMoreContent: boolean

  // 是否已初始化
  isInitialized: boolean
}

export const useForYouStore = defineStore('forYou', () => {
  const state = ref<ForYouState>({
    // 视频列表数据
    videoList: [],
    appVideoList: [],

    // 基础页面状态
    refreshIdx: 1,
    noMoreContent: false,

    // 是否已初始化
    isInitialized: false,
  })

  // 简化的API - 只保存和恢复完整状态
  const saveCompleteState = (newState: ForYouState) => {
    state.value = { ...newState }
  }

  const getCompleteState = (): ForYouState => {
    return { ...state.value }
  }

  // 重置状态
  const resetState = () => {
    state.value = {
      videoList: [],
      appVideoList: [],
      refreshIdx: 1,
      noMoreContent: false,
      isInitialized: false,
    }
  }

  // 标记为已初始化
  const markAsInitialized = () => {
    state.value.isInitialized = true
  }

  return {
    state: readonly(state),
    saveCompleteState,
    getCompleteState,
    resetState,
    markAsInitialized,
  }
})
