import { watch } from 'vue'

import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'
import { isVideoOrBangumiPage, isVideoPlaybackPage } from '~/utils/main'
import { showState } from '~/utils/player'

const PLAYER_CONTROL_BAR_SELECTOR = '.bpx-player-control-bottom-right'
const PLAYER_ROOT_SELECTOR = '#playerWrap, #bilibili-player, #bilibiliPlayer, .bpx-player-container, .bilibili-player'
const CONTROL_DISCOVERY_TIMEOUT = 15_000
const CONTROL_DISCOVERY_RETRY_INTERVAL = 500

const screenshotIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" style="width: 100%; height: 100%;">
  <path d="M25 29h9l4-6h12l4 6h9a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H25a6 6 0 0 1-6-6V35a6 6 0 0 1 6-6Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="44" cy="48" r="11" fill="none" stroke="#fff" stroke-width="5"/>
</svg>`

let controlContainer: HTMLElement | null = null
let hasInitialized = false
let isCapturing = false
let observedPlayerRoot: HTMLElement | null = null
let observedControlBar: HTMLElement | null = null
let playerStructureObserver: MutationObserver | null = null
let discoveryRetryTimer: ReturnType<typeof setTimeout> | null = null
let discoveryRetryDeadline = 0
let controlSyncQueued = false

function translate(key: string): string {
  return String(i18n.global.t(key, settings.value.language))
}

function findPlayerControlBar(): HTMLElement | null {
  return document.querySelector<HTMLElement>(PLAYER_CONTROL_BAR_SELECTOR)
}

function findPlayerRoot(controlBar?: HTMLElement | null): HTMLElement | null {
  return controlBar?.closest<HTMLElement>('#playerWrap, #bilibili-player, #bilibiliPlayer')
    ?? controlBar?.closest<HTMLElement>('.bpx-player-container, .bilibili-player')
    ?? document.querySelector<HTMLElement>(PLAYER_ROOT_SELECTOR)
}

function shouldManageControl() {
  return settings.value.showVideoScreenshotButton
    && (isVideoPlaybackPage() || isVideoOrBangumiPage())
}

function findCurrentVideo(trigger: HTMLElement): HTMLVideoElement | null {
  const player = trigger.closest('.bpx-player-container, #bilibili-player, .bilibili-player')
  const videos = Array.from((player || document).querySelectorAll<HTMLVideoElement>('video'))
    .filter(video => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0)

  return videos.find(video => !video.paused && !video.ended)
    || videos.find(video => video.getClientRects().length > 0)
    || videos[0]
    || null
}

function getVideoTitle(): string {
  const titleElement = document.querySelector<HTMLElement>('h1.video-title, .video-title, #player-title, .season-info .title')
  const title = titleElement?.getAttribute('title')
    || titleElement?.textContent
    || document.querySelector<HTMLMetaElement>('meta[itemprop="name"], meta[property="og:title"]')?.content
    || document.title
  const titleWithoutControlCharacters = Array.from(title, character => character.charCodeAt(0) < 32 ? '_' : character).join('')

  return titleWithoutControlCharacters
    .replace(/_哔哩哔哩_bilibili$/, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/g, '')
    .slice(0, 120)
    || 'bilibili-video'
}

function formatFrameTime(currentTime: number): string {
  const totalMilliseconds = Number.isFinite(currentTime)
    ? Math.max(0, Math.floor(currentTime * 1000))
    : 0
  const milliseconds = totalMilliseconds % 1000
  const totalSeconds = Math.floor(totalMilliseconds / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, '0'))
    .join('-')
    .concat(`-${String(milliseconds).padStart(3, '0')}`)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob)
        resolve(blob)
      else
        reject(new Error('Canvas conversion returned an empty image'))
    }, 'image/png')
  })
}

async function captureCurrentFrame(trigger: HTMLElement) {
  if (isCapturing)
    return

  const video = findCurrentVideo(trigger)
  if (!video) {
    showState(translate('player_screenshot.video_unavailable'))
    return
  }

  isCapturing = true
  trigger.setAttribute('aria-busy', 'true')
  trigger.style.opacity = '0.5'

  try {
    const capturedTime = video.currentTime
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('Canvas 2D context is unavailable')

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToBlob(canvas)
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `${getVideoTitle()}_${formatFrameTime(capturedTime)}.png`
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)

    showState(translate('player_screenshot.saved'))
  }
  catch (error) {
    console.error('[BewlyCat] 视频帧截图失败', error)
    showState(translate('player_screenshot.failed'))
  }
  finally {
    isCapturing = false
    trigger.removeAttribute('aria-busy')
    trigger.style.removeProperty('opacity')
  }
}

function createControlContainer(): HTMLElement {
  const container = document.createElement('div')
  const label = translate('player_screenshot.capture')
  container.className = 'bpx-player-ctrl-btn bewly-video-screenshot-control'
  container.setAttribute('role', 'button')
  container.setAttribute('aria-label', label)
  container.setAttribute('tabindex', '0')
  container.title = label

  const icon = document.createElement('div')
  icon.className = 'bpx-player-ctrl-btn-icon bewly-video-screenshot-icon'

  const iconWrapper = document.createElement('span')
  iconWrapper.className = 'bpx-common-svg-icon'
  iconWrapper.innerHTML = screenshotIcon
  icon.appendChild(iconWrapper)
  container.appendChild(icon)

  container.addEventListener('click', () => {
    void captureCurrentFrame(container)
  })
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ')
      return

    event.preventDefault()
    void captureCurrentFrame(container)
  })

  return container
}

function stopControlDiscovery() {
  if (discoveryRetryTimer) {
    clearTimeout(discoveryRetryTimer)
    discoveryRetryTimer = null
  }
  discoveryRetryDeadline = 0
}

function stopPlayerObservers() {
  playerStructureObserver?.disconnect()
  playerStructureObserver = null
  observedPlayerRoot = null
  observedControlBar = null
}

function removeControl() {
  controlContainer?.remove()
  controlContainer = null
  document.querySelectorAll<HTMLElement>('.bewly-video-screenshot-control').forEach(control => control.remove())
}

function stopManagingControl(remove = true) {
  stopControlDiscovery()
  stopPlayerObservers()
  controlSyncQueued = false
  if (remove)
    removeControl()
}

function scheduleControlSync() {
  if (controlSyncQueued)
    return

  controlSyncQueued = true
  queueMicrotask(() => {
    controlSyncQueued = false
    syncControl()
  })
}

function restartControlDiscovery() {
  stopControlDiscovery()
  discoveryRetryDeadline = Date.now() + CONTROL_DISCOVERY_TIMEOUT
  scheduleControlSync()
}

function scheduleControlDiscoveryRetry() {
  if (discoveryRetryTimer || !shouldManageControl())
    return

  if (!discoveryRetryDeadline)
    discoveryRetryDeadline = Date.now() + CONTROL_DISCOVERY_TIMEOUT
  if (Date.now() >= discoveryRetryDeadline)
    return

  discoveryRetryTimer = setTimeout(() => {
    discoveryRetryTimer = null
    scheduleControlSync()
  }, CONTROL_DISCOVERY_RETRY_INTERVAL)
}

function observePlayerStructure(playerRoot: HTMLElement, controlBar: HTMLElement) {
  if (observedPlayerRoot === playerRoot
    && observedControlBar === controlBar
    && playerStructureObserver) {
    return
  }

  stopPlayerObservers()
  observedPlayerRoot = playerRoot
  observedControlBar = controlBar

  const handlePlayerMutation = () => {
    if (!shouldManageControl()) {
      stopManagingControl()
      return
    }

    if (!playerRoot.isConnected) {
      stopPlayerObservers()
      restartControlDiscovery()
      return
    }

    if (!controlContainer?.isConnected)
      restartControlDiscovery()
  }

  playerStructureObserver = new MutationObserver(handlePlayerMutation)
  let current: HTMLElement | null = controlBar
  while (current) {
    playerStructureObserver.observe(current, { childList: true })
    if (current === playerRoot)
      break
    current = current.parentElement
  }

  const playerParent = playerRoot.parentElement
  if (playerParent && playerParent !== current)
    playerStructureObserver.observe(playerParent, { childList: true })
}

function syncControl() {
  if (!shouldManageControl()) {
    stopManagingControl()
    return
  }

  if (controlContainer?.isConnected) {
    const controlBar = controlContainer.closest<HTMLElement>(PLAYER_CONTROL_BAR_SELECTOR)
    const playerRoot = findPlayerRoot(controlBar)
    if (controlBar)
      observePlayerStructure(playerRoot ?? controlBar.parentElement ?? controlBar, controlBar)
    stopControlDiscovery()
    return
  }

  controlContainer = null
  const controlBar = findPlayerControlBar()
  const playerRoot = findPlayerRoot(controlBar)

  if (!controlBar) {
    scheduleControlDiscoveryRetry()
    return
  }

  observePlayerStructure(playerRoot ?? controlBar.parentElement ?? controlBar, controlBar)

  const existingControl = controlBar.querySelector<HTMLElement>('.bewly-video-screenshot-control')
  if (existingControl) {
    controlContainer = existingControl
    stopControlDiscovery()
    return
  }

  const anchor = controlBar.querySelector('.bpx-player-ctrl-volume')
  if (!anchor?.querySelector('.bpx-player-ctrl-btn-icon')) {
    scheduleControlDiscoveryRetry()
    return
  }

  controlContainer = createControlContainer()
  anchor.insertAdjacentElement('afterend', controlContainer)
  stopControlDiscovery()
}

export function initVideoScreenshotControl() {
  if (hasInitialized || location.hostname === 'live.bilibili.com')
    return

  hasInitialized = true
  watch(
    () => settings.value.showVideoScreenshotButton,
    (enabled) => {
      if (enabled)
        restartControlDiscovery()
      else
        stopManagingControl()
    },
    { immediate: true },
  )

  const handlePageLifecycleChange = () => restartControlDiscovery()
  window.addEventListener('pushstate', handlePageLifecycleChange)
  window.addEventListener('replacestate', handlePageLifecycleChange)
  window.addEventListener('popstate', handlePageLifecycleChange)
  window.addEventListener('hashchange', handlePageLifecycleChange)
  window.addEventListener('pageshow', handlePageLifecycleChange)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && settings.value.showVideoScreenshotButton)
      restartControlDiscovery()
  })
}
