import { settings } from '~/logic'
import { applyBewlyWidescreen, exitBewlyWidescreen, isBewlyWidescreenActive, showBewlyWidescreenSwitchHint } from '~/utils/bewlyWidescreen'
import { i18n } from '~/utils/i18n'
import { isVideoOrBangumiPage } from '~/utils/main'

const PLAYER_CONTROL_BAR_SELECTOR = '.bpx-player-control-bottom-right'
const PLAYER_ROOT_SELECTOR = '#playerWrap, #bilibili-player, #bilibiliPlayer, .bpx-player-container, .bilibili-player'
const PLAYER_MODE_BUTTON_SELECTOR = '.bpx-player-ctrl-web, .bilibili-player-video-web-fullscreen'
const BUTTON_CLASS = 'bewly-widescreen-control'
const TOOLTIP_CLASS = 'bewly-widescreen-tooltip'
const CONTROL_DISCOVERY_TIMEOUT = 15_000
const CONTROL_DISCOVERY_RETRY_INTERVAL = 500
const APPLY_TIMEOUT = 30_000

const widescreenIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" style="width: 100%; height: 100%;">
  <rect x="15" y="20" width="58" height="48" rx="5" fill="none" stroke="currentColor" stroke-width="5"/>
  <path d="M29 32h12M29 32v10M59 32H47M59 32v10M29 56h12M29 56V46M59 56H47M59 56V46" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
</svg>`

let controlContainer: HTMLElement | null = null
let observedPlayerRoot: HTMLElement | null = null
let observedControlBar: HTMLElement | null = null
let playerStructureObserver: MutationObserver | null = null
let pageObserver: MutationObserver | null = null
let discoveryRetryTimer: ReturnType<typeof setTimeout> | null = null
let discoveryRetryDeadline = 0
let applyFallbackTimer: ReturnType<typeof setTimeout> | null = null
let controlSyncQueued = false
let isApplying = false
let hasInitialized = false

function translate(key: string): string {
  return String(i18n.global.t(key, settings.value.language))
}

function getButtonLabel(active = isBewlyWidescreenActive()) {
  return translate(active
    ? 'settings.video_player_mode.exit_bewly_widescreen'
    : 'settings.video_player_mode.bewly_widescreen')
}

function findPlayerControlBar(): HTMLElement | null {
  return document.querySelector<HTMLElement>(PLAYER_CONTROL_BAR_SELECTOR)
}

function findPlayerRoot(controlBar?: HTMLElement | null): HTMLElement | null {
  return controlBar?.closest<HTMLElement>('#playerWrap, #bilibili-player, #bilibiliPlayer')
    ?? controlBar?.closest<HTMLElement>('.bpx-player-container, .bilibili-player')
    ?? document.querySelector<HTMLElement>(PLAYER_ROOT_SELECTOR)
}

function isBrowserFullscreen() {
  return !!(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement)
}

function isWebFullscreen() {
  return Array.from(document.querySelectorAll<HTMLElement>(PLAYER_MODE_BUTTON_SELECTOR))
    .some(button => button.classList.contains('bpx-state-entered'))
}

function isControlUnavailable() {
  return isBrowserFullscreen() || isWebFullscreen()
}

function shouldManageControl() {
  return isVideoOrBangumiPage()
}

function updateControlState(button = controlContainer) {
  if (!button)
    return

  const active = isBewlyWidescreenActive()
  const unavailable = isControlUnavailable()
  const hidden = isBrowserFullscreen() || isWebFullscreen()
  const label = getButtonLabel(active)

  button.hidden = hidden
  button.setAttribute('aria-label', label)
  const tooltip = button.querySelector<HTMLElement>(`.${TOOLTIP_CLASS}`)
  if (tooltip)
    tooltip.textContent = label
  button.setAttribute('aria-disabled', String(unavailable || isApplying))
  button.setAttribute('aria-busy', String(isApplying))
  button.setAttribute('tabindex', hidden || unavailable || isApplying ? '-1' : '0')
  button.classList.toggle('is-disabled', unavailable || isApplying)
  button.classList.toggle('bpx-state-entered', active)
}

function clearApplyFallbackTimer() {
  if (applyFallbackTimer) {
    clearTimeout(applyFallbackTimer)
    applyFallbackTimer = null
  }
}

function finishApplying() {
  clearApplyFallbackTimer()
  isApplying = false
  updateControlState()
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
  icon.className = 'bpx-player-ctrl-btn-icon bewly-widescreen-icon'

  const iconWrapper = document.createElement('span')
  iconWrapper.className = 'bpx-common-svg-icon'
  iconWrapper.innerHTML = widescreenIcon
  icon.appendChild(iconWrapper)
  container.append(icon, tooltip)

  container.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void handleControlClick(container)
  })
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ')
      return

    event.preventDefault()
    event.stopPropagation()
    void handleControlClick(container)
  })

  return container
}

async function handleControlClick(button: HTMLElement) {
  if (isApplying || !shouldManageControl())
    return

  if (isBewlyWidescreenActive()) {
    exitBewlyWidescreen()
    updateControlState(button)
    return
  }

  if (isControlUnavailable())
    return

  isApplying = true
  updateControlState(button)
  showBewlyWidescreenSwitchHint(translate('settings.video_player_mode.switching_to_bewly_widescreen'))
  clearApplyFallbackTimer()
  applyFallbackTimer = setTimeout(() => {
    if (!isBewlyWidescreenActive())
      finishApplying()
  }, APPLY_TIMEOUT)

  try {
    applyBewlyWidescreen(settings.value.bewlyWidescreenSidebarPosition || 'right', false)
  }
  catch (error) {
    console.error('[BewlyCat] 切换 Bewly 宽屏失败', error)
    finishApplying()
  }
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
  if (isApplying)
    finishApplying()
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

    updateControlState()
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

  // Web fullscreen is represented by a class on the native control. Watching
  // that small set of nodes keeps the custom control unavailable while it is
  // active without observing the entire page for attribute mutations.
  const modeButtons = Array.from(controlBar.querySelectorAll<HTMLElement>(PLAYER_MODE_BUTTON_SELECTOR))
  for (const modeButton of modeButtons) {
    playerStructureObserver.observe(modeButton, {
      attributes: true,
      attributeFilter: ['class'],
    })
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
    stopControlDiscovery()
    return
  }

  // Keep the switch next to Bilibili's own wide-screen control. Fall back to
  // volume for player variants that omit the wide-screen control.
  const wideButton = controlBar.querySelector<HTMLElement>('.bpx-player-ctrl-wide')
  const volumeButton = controlBar.querySelector<HTMLElement>('.bpx-player-ctrl-volume')
  const anchor = wideButton ?? volumeButton
  if (!anchor?.querySelector('.bpx-player-ctrl-btn-icon')) {
    scheduleControlDiscoveryRetry()
    return
  }

  controlContainer = createControlContainer()
  anchor.insertAdjacentElement('afterend', controlContainer)
  updateControlState()
  stopControlDiscovery()
}

function setupPageObserver() {
  if (pageObserver || !document.body)
    return

  pageObserver = new MutationObserver(() => {
    if (isApplying && (isBewlyWidescreenActive()
      || !document.getElementById('bewly-widescreen-loading'))) {
      finishApplying()
    }

    if (controlContainer)
      updateControlState()
    else if (shouldManageControl())
      scheduleControlSync()
  })
  pageObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
  })
}

export function initBewlyWidescreenControl() {
  if (hasInitialized)
    return

  hasInitialized = true
  setupPageObserver()

  const handlePageLifecycleChange = () => restartControlDiscovery()
  window.addEventListener('pushstate', handlePageLifecycleChange)
  window.addEventListener('replacestate', handlePageLifecycleChange)
  window.addEventListener('popstate', handlePageLifecycleChange)
  window.addEventListener('hashchange', handlePageLifecycleChange)
  window.addEventListener('pageshow', handlePageLifecycleChange)
  window.addEventListener('fullscreenchange', () => updateControlState())
  window.addEventListener('webkitfullscreenchange', () => updateControlState())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      restartControlDiscovery()
  })

  restartControlDiscovery()
}
