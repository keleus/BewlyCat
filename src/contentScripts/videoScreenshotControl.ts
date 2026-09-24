import { watch } from 'vue'

import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'
import { isVideoOrBangumiPage, isVideoPlaybackPage } from '~/utils/main'
import { captureVideoScreenshot } from '~/utils/videoScreenshot'

const PLAYER_CONTROL_BAR_SELECTOR = '.bpx-player-control-bottom-right'
const PLAYER_ROOT_SELECTOR = '#playerWrap, #bilibili-player, #bilibiliPlayer, .bpx-player-container, .bilibili-player'
const TOOLTIP_CLASS = 'bewly-player-tooltip'
const CONTROL_DISCOVERY_TIMEOUT = 15_000
const CONTROL_DISCOVERY_RETRY_INTERVAL = 500

// 与原生控制栏 Lottie 图标同为 88 网格面性图形：主体 72×56、圆角 8、镂空宽 8
const screenshotIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" style="width: 100%; height: 100%;">
  <path d="M16 24h12l4.2-6.3A4 4 0 0 1 35.5 16h17a4 4 0 0 1 3.3 1.7L60 24h12a8 8 0 0 1 8 8v32a8 8 0 0 1-8 8H16a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8ZM29 48a15 15 0 1 0 30 0a15 15 0 1 0 -30 0ZM37 48a7 7 0 1 0 14 0a7 7 0 1 0 -14 0Z" fill="#fff" fill-rule="evenodd"/>
</svg>`

let controlContainer: HTMLElement | null = null
let hasInitialized = false
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

function createControlContainer(): HTMLElement {
  const container = document.createElement('div')
  const label = translate('player_screenshot.capture')
  container.className = 'bpx-player-ctrl-btn bewly-video-screenshot-control'
  container.setAttribute('role', 'button')
  container.setAttribute('aria-label', label)
  container.setAttribute('tabindex', '0')

  const tooltip = document.createElement('span')
  tooltip.className = TOOLTIP_CLASS
  tooltip.setAttribute('role', 'tooltip')
  tooltip.textContent = label

  const icon = document.createElement('div')
  icon.className = 'bpx-player-ctrl-btn-icon bewly-video-screenshot-icon'

  const iconWrapper = document.createElement('span')
  iconWrapper.className = 'bpx-common-svg-icon'
  iconWrapper.innerHTML = screenshotIcon
  icon.appendChild(iconWrapper)
  container.append(icon, tooltip)

  // 鼠标点击不聚焦按钮：否则焦点残留，之后按空格/回车会再次触发截图
  container.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })
  container.addEventListener('click', () => {
    void captureVideoScreenshot(container)
  })
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ')
      return

    event.preventDefault()
    void captureVideoScreenshot(container)
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
