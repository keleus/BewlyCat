import { watch } from 'vue'

import { settings, settingsReady } from '~/logic'
import { AmbilightEngine } from '~/utils/ambilight/ambilightEngine'
import type { AmbilightDisplayMode, AmbilightEngineOptions } from '~/utils/ambilight/types'
import { isVideoOrBangumiPage, isVideoPlaybackPage, isWatchLaterListPage } from '~/utils/main'
import { getVideoElement } from '~/utils/player'

let initialized = false
let engine: AmbilightEngine | null = null
let currentVideo: HTMLVideoElement | null = null
let playerObserver: MutationObserver | null = null
let observedPlayerContainer: HTMLElement | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
// 功能开启期间的视频发现监听；关闭时整体撤销，不在页面上保留任何监听
let discoveryLifetime: AbortController | null = null
// 引擎存在期间的布局与可见性监听
let engineLifetime: AbortController | null = null

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

// data-screen 位于 .bpx-player-container；#playerWrap 是其外层，需排在后面兜底
function findPlayerContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.bpx-player-container')
    || document.querySelector<HTMLElement>('#playerWrap')
}

function resolveDisplayMode(): {
  mode: AmbilightDisplayMode
  container: HTMLElement | null
} {
  const nativeFs = document.fullscreenElement as HTMLElement | null
  if (nativeFs)
    return { mode: 'fullscreen', container: nativeFs }

  const playerContainer = findPlayerContainer()
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

function getEngineOptions(): AmbilightEngineOptions {
  return {
    enabled: settings.value.ambilightEnabled,
    enableFullscreen: settings.value.ambilightEnableFullscreen,
    strength: settings.value.ambilightStrength,
    spread: settings.value.ambilightSpread,
    smoothing: settings.value.ambilightSmoothing,
    blur: settings.value.ambilightBlur,
    saturation: settings.value.ambilightSaturation,
    fps: settings.value.ambilightFps,
  }
}

function updateLayout() {
  if (!engine)
    return
  const { mode, container } = resolveDisplayMode()
  engine.setDisplayMode(mode, container)
  engine.invalidate()
}

function scheduleSync() {
  if (syncTimer)
    clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    sync()
  }, 250)
}

function attachDiscoveryListeners() {
  if (discoveryLifetime)
    return
  discoveryLifetime = new AbortController()
  const { signal } = discoveryLifetime

  // 换 P、切集、单页导航：URL 变化或新视频开始加载时重新核对目标视频
  for (const name of ['pushstate', 'replacestate', 'popstate', 'hashchange'])
    window.addEventListener(name, scheduleSync, { signal })
  for (const name of ['loadedmetadata', 'play'])
    document.addEventListener(name, scheduleSync, { capture: true, signal })
}

function detachDiscoveryListeners() {
  discoveryLifetime?.abort()
  discoveryLifetime = null
  if (syncTimer) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
}

function attachEngineListeners() {
  if (engineLifetime)
    return
  engineLifetime = new AbortController()
  const { signal } = engineLifetime

  document.addEventListener('fullscreenchange', updateLayout, { signal })
  document.addEventListener('visibilitychange', () => {
    engine?.setHidden(document.hidden)
  }, { signal })
  // 滚动与尺寸变化由 invalidate 内部 RAF 合并调度
  window.addEventListener('resize', updateLayout, { passive: true, signal })
  window.addEventListener('scroll', updateLayout, { passive: true, signal })
}

function teardownEngine() {
  engineLifetime?.abort()
  engineLifetime = null
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
}

function sync() {
  if (!isFeatureActive()) {
    teardownEngine()
    return
  }

  const target = findTargetVideo()
  if (!target) {
    document.documentElement.removeAttribute('data-bewly-ambilight')
    return
  }

  document.documentElement.setAttribute('data-bewly-ambilight', '')

  if (!engine) {
    engine = new AmbilightEngine(getEngineOptions())
    attachEngineListeners()
    if (document.hidden)
      engine.setHidden(true)
  }
  else {
    engine.updateOptions(getEngineOptions())
  }

  if (currentVideo !== target) {
    currentVideo = target
    engine.bindVideo(target)
  }

  const { mode, container } = resolveDisplayMode()
  engine.setDisplayMode(mode, container)
  engine.invalidate(true)

  const playerContainer = findPlayerContainer()
  if (playerContainer && playerContainer !== observedPlayerContainer) {
    playerObserver?.disconnect()
    observedPlayerContainer = playerContainer
    playerObserver = new MutationObserver(updateLayout)
    playerObserver.observe(playerContainer, {
      attributes: true,
      attributeFilter: ['data-screen', 'class'],
    })
  }
}

export function initAmbilightControl() {
  if (initialized)
    return
  initialized = true

  void settingsReady.then(() => {
    watch(
      () => settings.value.ambilightEnabled,
      (enabled) => {
        if (enabled) {
          attachDiscoveryListeners()
        }
        else {
          detachDiscoveryListeners()
          teardownEngine()
        }
      },
      { immediate: true },
    )

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
        if (settings.value.ambilightEnabled)
          sync()
      },
      { immediate: true },
    )
  })
}
