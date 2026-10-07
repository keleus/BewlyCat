import { watch } from 'vue'

import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'
import { ensureListenVideoModeSynced, isListenVideoModeActive, toggleListenVideoMode } from '~/utils/listenVideoMode'
import { isVideoOrBangumiPage, isVideoPlaybackPage } from '~/utils/main'

import { schedulePlayerControlFit } from './playerControlFit'

const PLAYER_CONTROL_BAR_SELECTOR = '.bpx-player-control-bottom-right'
const BUTTON_CLASS = 'bewly-listen-video-control'
const TOOLTIP_CLASS = 'bewly-player-tooltip'
const CONTROL_DISCOVERY_TIMEOUT = 15_000
const CONTROL_DISCOVERY_RETRY_INTERVAL = 500
// 快捷键切换后由 listenVideoMode 派发，用于刷新按钮激活态
const LISTEN_CHANGE_EVENT = 'bewly-listen-video-change'
// SPA 跳转后页面标题更新有延迟，稍后再刷新一次听视频元信息
const META_REFRESH_DELAY = 1200

// 与原生控制栏 Lottie 图标同为 88 网格面性图形：头梁环宽 13、耳罩 20×28、圆角 9
const listenIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" style="width: 100%; height: 100%;">
  <path d="M44 14C28.5 14 18 25.5 18 42v6h13v-6c0-9.5 5-15 13-15s13 5.5 13 15v6h13v-6c0-16.5-10.5-28-26-28Z" fill="currentColor"/>
  <rect x="14" y="46" width="20" height="28" rx="9" fill="currentColor"/>
  <rect x="54" y="46" width="20" height="28" rx="9" fill="currentColor"/>
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

function getButtonLabel(active = isListenVideoModeActive()) {
  return translate(active
    ? 'player_listen.exit'
    : 'player_listen.enter')
}

function findPlayerControlBar(): HTMLElement | null {
  return document.querySelector<HTMLElement>(PLAYER_CONTROL_BAR_SELECTOR)
}

function findPlayerRoot(controlBar?: HTMLElement | null): HTMLElement | null {
  return controlBar?.closest<HTMLElement>('#playerWrap, #bilibili-player, #bilibiliPlayer')
    ?? controlBar?.closest<HTMLElement>('.bpx-player-container, .bilibili-player')
    ?? document.querySelector<HTMLElement>('#playerWrap, #bilibili-player, #bilibiliPlayer, .bpx-player-container, .bilibili-player')
}

function shouldManageControl() {
  return settings.value.showListenVideoButton
    && (isVideoPlaybackPage() || isVideoOrBangumiPage())
}

function updateControlState(button = controlContainer) {
  if (!button)
    return

  const active = isListenVideoModeActive()
  const label = getButtonLabel(active)

  // 相同状态不重复写 DOM，避免触发原生播放器观察器。
  if (button.getAttribute('aria-label') === label
    && button.classList.contains('bpx-state-entered') === active) {
    return
  }

  button.setAttribute('aria-label', label)
  const tooltip = button.querySelector<HTMLElement>(`.${TOOLTIP_CLASS}`)
  if (tooltip)
    tooltip.textContent = label
  button.classList.toggle('bpx-state-entered', active)
}

function createControlContainer(): HTMLElement {
  const label = getButtonLabel()
  const container = document.createElement('div')
  container.className = `bpx-player-ctrl-btn ${BUTTON_CLASS}`
  container.setAttribute('role', 'button')
  container.setAttribute('aria-label', label)
  container.setAttribute('tabindex', '0')

  const tooltip = document.createElement('span')
  tooltip.className = TOOLTIP_CLASS
  tooltip.setAttribute('role', 'tooltip')
  tooltip.textContent = label

  const icon = document.createElement('div')
  icon.className = 'bpx-player-ctrl-btn-icon bewly-listen-video-icon'

  const iconWrapper = document.createElement('span')
  iconWrapper.className = 'bpx-common-svg-icon'
  iconWrapper.innerHTML = listenIcon
  icon.appendChild(iconWrapper)
  container.append(icon, tooltip)

  // 鼠标点击不聚焦按钮：否则焦点残留，之后按空格/回车会再次触发切换
  container.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })
  container.addEventListener('click', () => {
    toggleListenVideoMode()
    updateControlState(container)
  })
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ')
      return

    event.preventDefault()
    event.stopPropagation()
    if (event.repeat)
      return
    toggleListenVideoMode()
    updateControlState(container)
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
  document.querySelectorAll<HTMLElement>(`.${BUTTON_CLASS}`).forEach(control => control.remove())
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

  // 按钮关闭但听视频仍在进行时（快捷键切换），也要保证覆盖层与播放器状态同步
  ensureListenVideoModeSynced()

  if (controlContainer?.isConnected) {
    updateControlState()
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

  const existingControl = controlBar.querySelector<HTMLElement>(`.${BUTTON_CLASS}`)
  if (existingControl) {
    controlContainer = existingControl
    updateControlState()
    schedulePlayerControlFit(existingControl)
    stopControlDiscovery()
    return
  }

  // 跟在截图按钮之后保持扩展按钮成组，缺少截图按钮时退回音量按钮
  const anchor = controlBar.querySelector<HTMLElement>('.bewly-video-screenshot-control')
    ?? controlBar.querySelector<HTMLElement>('.bpx-player-ctrl-volume')
  if (!anchor?.querySelector('.bpx-player-ctrl-btn-icon')) {
    scheduleControlDiscoveryRetry()
    return
  }

  controlContainer = createControlContainer()
  anchor.insertAdjacentElement('afterend', controlContainer)
  updateControlState()
  schedulePlayerControlFit(controlContainer)
  stopControlDiscovery()
}

export function initListenVideoControl() {
  if (hasInitialized || location.hostname === 'live.bilibili.com')
    return

  hasInitialized = true

  // 快捷键切换听视频后刷新按钮激活态
  window.addEventListener(LISTEN_CHANGE_EVENT, () => updateControlState())

  watch(
    [() => settings.value.showListenVideoButton, () => settings.value.language],
    ([enabled]) => {
      if (enabled)
        restartControlDiscovery()
      else
        stopManagingControl()
    },
    { immediate: true },
  )

  const handlePageLifecycleChange = () => {
    restartControlDiscovery()
    ensureListenVideoModeSynced()
    setTimeout(ensureListenVideoModeSynced, META_REFRESH_DELAY)
  }
  window.addEventListener('pushstate', handlePageLifecycleChange)
  window.addEventListener('replacestate', handlePageLifecycleChange)
  window.addEventListener('popstate', handlePageLifecycleChange)
  window.addEventListener('hashchange', handlePageLifecycleChange)
  window.addEventListener('pageshow', handlePageLifecycleChange)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && settings.value.showListenVideoButton)
      restartControlDiscovery()
  })
}
