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

function isSupportedPage(): boolean {
  return isVideoPlaybackPage()
    || isVideoOrBangumiPage()
    || isWatchLaterListPage(location.href)
}

function isFeatureActive(): boolean {
  return settings.value.ambilightEnabled && isSupportedPage()
}

function findTargetVideo(): HTMLVideoElement | null {
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

  const playerContainer = document.querySelector<HTMLElement>(
    '.bpx-player-container, #playerWrap',
  )
  if (playerContainer) {
    const screen = playerContainer.getAttribute('data-screen')
    if (screen === 'mini')
      return { mode: 'mini', container: playerContainer }
    if (screen === 'full' || screen === 'web'
      || playerContainer.classList.contains('web-fullscreen')
      || playerContainer.classList.contains('fullscreen')
      || document.documentElement.classList.contains('fullscreen-fix')) {
      return { mode: 'fullscreen', container: playerContainer }
    }
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
    return
  }

  const target = findTargetVideo()
  if (!target) {
    document.documentElement.removeAttribute('data-bewly-ambilight')
    return
  }

  document.documentElement.setAttribute('data-bewly-ambilight', '')

  if (!engine) {
    engine = new AmbilightEngine({
      enabled: settings.value.ambilightEnabled,
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
  engine.invalidate(true)

  const playerContainer = container || document.querySelector<HTMLElement>(
    '.bpx-player-container, #playerWrap',
  )
  if (playerContainer && playerContainer !== observedPlayerContainer) {
    playerObserver?.disconnect()
    observedPlayerContainer = playerContainer
    playerObserver = new MutationObserver(() => {
      if (engine) {
        const currentMode = resolveDisplayMode()
        engine.setDisplayMode(currentMode.mode, currentMode.container)
        engine.invalidate()
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

    const scheduleLayoutUpdate = () => {
      if (engine) {
        const { mode, container } = resolveDisplayMode()
        engine.setDisplayMode(mode, container)
        engine.invalidate()
      }
    }

    // 窗口尺寸变化
    window.addEventListener('resize', scheduleLayoutUpdate, { passive: true })

    // 页面滚动监听（由 invalidate 内部 RAF 合并调度）
    window.addEventListener('scroll', scheduleLayoutUpdate, { passive: true })

    // 定时心跳自愈：每秒兜底核对视频状态与激活帧循环，避免切集/缓冲后失活
    setInterval(() => {
      if (isFeatureActive()) {
        const target = findTargetVideo()
        if (target !== currentVideo) {
          scheduleSync()
        }
        else if (engine && target && !target.paused) {
          engine.startLoop()
        }
      }
    }, 1000)

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
