import { settings } from '~/logic'
import { getVideoElement, isPlayerShowingAdvertisement } from '~/utils/player'
import type { VideoIdentity } from '~/utils/videoVisitHistory'
import { getVideoIdentityFromUrl, recordVideoWatchProgress } from '~/utils/videoVisitHistory'

// 实际连续播放达到该秒数才视为「已观看」，避免后台打开或切集时残留帧误记。
const WATCHED_PLAY_THRESHOLD_SECONDS = 3
// 播放中定期落盘的间隔；暂停、结束、离开页面时立即写入。
const PROGRESS_PERSIST_INTERVAL_MS = 15_000
// 两次 timeupdate 之间超过该跨度视为跳转，不计入实际播放时长。
const MAX_PLAYBACK_STEP_SECONDS = 3

interface PlaybackSession {
  identityKey: string
  identity: VideoIdentity
  video: HTMLVideoElement
  src: string
  lastTime: number
  playedSeconds: number
  progress: number
  duration: number
  dirty: boolean
  persistedAt: number
}

function getIdentityKey(identity: VideoIdentity) {
  return `${identity.bvid?.toLowerCase() ?? ''}|${identity.aid ?? ''}`
}

export function setupVideoWatchProgress() {
  let session: PlaybackSession | undefined

  function flush(target = session) {
    if (!target?.dirty || target.playedSeconds < getWatchedThreshold(target.duration))
      return

    target.dirty = false
    target.persistedAt = Date.now()
    recordVideoWatchProgress(target.identity, target.progress, target.duration)
  }

  function getWatchedThreshold(duration: number) {
    return Math.min(WATCHED_PLAY_THRESHOLD_SECONDS, duration / 2)
  }

  function getActiveSession(video: HTMLVideoElement): PlaybackSession | undefined {
    const identity = getVideoIdentityFromUrl(location.href)
    if (!identity)
      return undefined

    const identityKey = getIdentityKey(identity)
    const src = video.currentSrc
    if (session?.identityKey === identityKey && session.video === video && session.src === src)
      return session

    // 地址或媒体源变化即开启新会话，旧会话按其自身标识补写最后进度。
    flush()
    session = {
      identityKey,
      identity,
      video,
      src,
      lastTime: video.currentTime,
      playedSeconds: 0,
      progress: video.currentTime,
      duration: video.duration,
      dirty: false,
      persistedAt: 0,
    }
    return session
  }

  function getTrackedVideo(event: Event) {
    if (!settings.value.showVideoWatchedBadge)
      return undefined

    const video = getVideoElement()
    if (!video || event.target !== video || isPlayerShowingAdvertisement())
      return undefined

    if (!Number.isFinite(video.duration) || video.duration <= 0)
      return undefined

    return video
  }

  window.addEventListener('timeupdate', (event) => {
    const video = getTrackedVideo(event)
    const current = video && getActiveSession(video)
    if (!video || !current)
      return

    const step = video.currentTime - current.lastTime
    current.lastTime = video.currentTime
    if (video.paused || video.seeking || step <= 0 || step > MAX_PLAYBACK_STEP_SECONDS)
      return

    current.playedSeconds += step
    current.progress = video.currentTime
    current.duration = video.duration
    current.dirty = true

    if (!current.persistedAt || Date.now() - current.persistedAt >= PROGRESS_PERSIST_INTERVAL_MS)
      flush(current)
  }, true)

  window.addEventListener('pause', (event) => {
    const video = getTrackedVideo(event)
    if (video && session?.video === video)
      flush()
  }, true)

  window.addEventListener('ended', (event) => {
    const video = getTrackedVideo(event)
    const current = video && getActiveSession(video)
    if (!video || !current || current.playedSeconds <= 0)
      return

    current.progress = video.duration
    current.duration = video.duration
    current.playedSeconds = Math.max(current.playedSeconds, getWatchedThreshold(video.duration))
    current.dirty = true
    flush(current)
  }, true)

  // 播放器复用同一媒体节点切换视频时会先清空媒体源，此时结束当前会话。
  window.addEventListener('emptied', (event) => {
    if (session && event.target === session.video) {
      flush()
      session = undefined
    }
  }, true)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden')
      flush()
  })
  window.addEventListener('pagehide', () => flush())
}
