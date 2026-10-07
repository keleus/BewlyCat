import { watch } from 'vue'

import { settings, settingsReady } from '~/logic'
import { AmbilightEngine } from '~/utils/ambilight/ambilightEngine'
import type { AmbilightDisplayMode } from '~/utils/ambilight/types'
import { isVideoOrBangumiPage, isVideoPlaybackPage, isWatchLaterListPage } from '~/utils/main'
import { getVideoElement } from '~/utils/player'

let initialized = false
let engine: AmbilightEngine | null = null
let currentVideo: HTMLVideoElement | null = null
let observer: MutationObserver | null = null
let playerObserver: MutationObserver | null = null
let observedPlayerContainer: HTMLElement | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null

function isLiveRoomPage(): boolean {
  return location.hostname === 'live.bilibili.com'
    && /^\/(?:blanc\/)?[1-9]\d*\/?$/.test(location.pathname)
}

function isSupportedPage(): boolean {
  return isVideoPlaybackPage()
    || isVideoOrBangumiPage()
    || isWatchLaterListPage(location.href)
    || isLiveRoomPage()
}

function isFeatureActive(): boolean {
  if (!settings.value.ambilightEnabled || !isSupportedPage())
    return false

  if (isLiveRoomPage())
    return settings.value.ambilightEnableInLive

  return true
}

function findTargetVideo(): HTMLVideoElement | null {
  if (isLiveRoomPage()) {
    const liveVideo = document.querySelector<HTMLVideoElement>('#live-player video')
    if (liveVideo && liveVideo.isConnected)
      return liveVideo
    return null
  }

  const video = getVideoElement()
  if (video && video.isConnected)
    return video

  return null
}

function resolveDisplayMode(): {
  mode: AmbilightDisplayMode
  container: HTMLElement | null
} {
  const nativeFs = document.fullscreenElement as HTMLElement | null
  if (nativeFs)
    return { mode: 'fullscreen', container: nativeFs }

  const playerContainer = document.querySelector<HTMLElement>('.bpx-player-container, #playerWrap, #live-player')
  if (playerContainer) {
    const screen = playerContainer.getAttribute('data-screen')
    if (screen === 'mini')
      return { mode: 'mini', container: playerContainer }
    if (screen === 'full' || screen === 'web')
      return { mode: 'fullscreen', container: playerContainer }
    if (screen === 'wide')
      return { mode: 'theater', container: playerContainer }
  }

  return { mode: 'normal', container: null }
}

function sync() {
  if (!isFeatureActive()) {
    if (engine) {
      engine.destroy()
      engine = null
      currentVideo = null
    }
    if (playerObserver) {
      playerObserver.disconnect()
      playerObserver = null
      observedPlayerContainer = null
    }
    document.documentElement.removeAttribute('data-bewly-ambilight')
    document.documentElement.removeAttribute('data-bewly-ambilight-live')
    return
  }

  const target = findTargetVideo()
  if (!target) {
    document.documentElement.removeAttribute('data-bewly-ambilight')
    document.documentElement.removeAttribute('data-bewly-ambilight-live')
    return
  }

  document.documentElement.setAttribute('data-bewly-ambilight', '')
  if (isLiveRoomPage())
    document.documentElement.setAttribute('data-bewly-ambilight-live', '')
  else
    document.documentElement.removeAttribute('data-bewly-ambilight-live')

  if (!engine) {
    engine = new AmbilightEngine({
      enabled: settings.value.ambilightEnabled,
      enableInLive: settings.value.ambilightEnableInLive,
      enableFullscreen: settings.value.ambilightEnableFullscreen,
      strength: settings.value.ambilightStrength,
      spread: settings.value.ambilightSpread,
      smoothing: settings.value.ambilightSmoothing,
      blur: settings.value.ambilightBlur,
      saturation: settings.value.ambilightSaturation,
      fps: settings.value.ambilightFps,
    })
  }
  else {
    engine.updateOptions({
      enabled: settings.value.ambilightEnabled,
      enableInLive: settings.value.ambilightEnableInLive,
      enableFullscreen: settings.value.ambilightEnableFullscreen,
      strength: settings.value.ambilightStrength,
      spread: settings.value.ambilightSpread,
      smoothing: settings.value.ambilightSmoothing,
      blur: settings.value.ambilightBlur,
      saturation: settings.value.ambilightSaturation,
      fps: settings.value.ambilightFps,
    })
  }

  if (currentVideo !== target) {
    currentVideo = target
    engine.bindVideo(target)
  }

  const { mode, container } = resolveDisplayMode()
  engine.setDisplayMode(mode, container)

  const playerContainer = container || document.querySelector<HTMLElement>('.bpx-player-container, #playerWrap, #live-player')
  if (playerContainer && playerContainer !== observedPlayerContainer) {
    playerObserver?.disconnect()
    observedPlayerContainer = playerContainer
    playerObserver = new MutationObserver(() => {
      if (engine) {
        const currentMode = resolveDisplayMode()
        engine.setDisplayMode(currentMode.mode, currentMode.container)
      }
    })
    playerObserver.observe(playerContainer, {
      attributes: true,
      attributeFilter: ['data-screen', 'class'],
    })
  }
}

function scheduleSync() {
  if (pollTimer)
    clearTimeout(pollTimer)
  pollTimer = setTimeout(sync, 250)
}

export function initAmbilightControl() {
  if (initialized)
    return
  initialized = true

  void settingsReady.then(() => {
    sync()

    watch(
      () => [
        settings.value.ambilightEnabled,
        settings.value.ambilightEnableInLive,
        settings.value.ambilightEnableFullscreen,
        settings.value.ambilightStrength,
        settings.value.ambilightSpread,
        settings.value.ambilightSmoothing,
        settings.value.ambilightBlur,
        settings.value.ambilightSaturation,
        settings.value.ambilightFps,
      ],
      () => {
        sync()
      },
      { deep: true },
    )

    // 全屏事件监听
    document.addEventListener('fullscreenchange', () => {
      if (engine) {
        const { mode, container } = resolveDisplayMode()
        engine.setDisplayMode(mode, container)
      }
    })

    // 页面可见性监听
    document.addEventListener('visibilitychange', () => {
      if (engine)
        engine.setHidden(document.hidden)
    })

    // 节流调度，防止滚动与尺寸变动触发主线程布局抖动
    let layoutRafId: number | null = null
    const scheduleLayoutUpdate = () => {
      if (layoutRafId !== null)
        return
      layoutRafId = requestAnimationFrame(() => {
        layoutRafId = null
        if (engine) {
          const { mode, container } = resolveDisplayMode()
          engine.setDisplayMode(mode, container)
          engine.updatePosition()
        }
      })
    }

    // 窗口尺寸变化
    window.addEventListener('resize', scheduleLayoutUpdate)

    // 页面滚动监听（RAF 节流调度，确保中键平滑滚动和滚轮满帧无粘滞）
    window.addEventListener('scroll', scheduleLayoutUpdate, { passive: true })

    // 观察 DOM 变化（换 P、切集、单页应用导航）
    observer = new MutationObserver(() => {
      const active = isFeatureActive()
      if (!active) {
        if (engine)
          sync()
        return
      }

      const target = findTargetVideo()
      if (target !== currentVideo)
        scheduleSync()
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  })
}
