import { watch } from 'vue'

import { settings } from '~/logic'
import { adjustVolume, getVideoElement } from '~/utils/player'
import { normalizeWheelVolumeStep } from '~/utils/wheelVolume'

// 鼠标一格通常为 100px 或 1-3 行；触控板的小幅滚动累积到该距离再算一格。
const WHEEL_NOTCH_PX = 40
const WHEEL_IDLE_RESET_MS = 200

const WHEEL_LISTENER_OPTIONS = { capture: true, passive: false } as const

let initialized = false
let wheelListenerActive = false
let accumulatedDelta = 0
let lastWheelTime = 0

function getFullscreenVideo() {
  const fullscreenElement = document.fullscreenElement
  if (!fullscreenElement)
    return null
  const video = getVideoElement()
  return video && fullscreenElement.contains(video) ? video : null
}

// 全屏下的设置面板、选集列表等可滚动区域保留原生滚动。
function isInsideScrollable(target: EventTarget | null, boundary: Element) {
  let element = target instanceof Element ? target : null
  while (element && element !== boundary) {
    const { overflowY } = getComputedStyle(element)
    if ((overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight)
      return true
    element = element.parentElement
  }
  return false
}

function handleWheel(event: WheelEvent) {
  if (!settings.value.customFullscreenWheelVolume || event.ctrlKey || !event.deltaY)
    return
  const fullscreenElement = document.fullscreenElement
  if (!fullscreenElement || !getFullscreenVideo() || isInsideScrollable(event.target, fullscreenElement))
    return

  // 阻止 B 站原生全屏滚轮调音，避免两套幅度叠加。
  event.preventDefault()
  event.stopImmediatePropagation()

  const now = performance.now()
  if (now - lastWheelTime > WHEEL_IDLE_RESET_MS || Math.sign(event.deltaY) !== Math.sign(accumulatedDelta))
    accumulatedDelta = 0
  lastWheelTime = now

  const delta = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : Math.sign(event.deltaY) * WHEEL_NOTCH_PX
  accumulatedDelta += delta
  if (Math.abs(accumulatedDelta) < WHEEL_NOTCH_PX)
    return

  // 每次事件最多调节一格，避免高精度滚轮单格数值偏大导致跳档。
  const direction = accumulatedDelta < 0 ? 1 : -1
  accumulatedDelta = 0
  adjustVolume(direction * normalizeWheelVolumeStep(settings.value.fullscreenWheelVolumeStep))
}

// A non-passive wheel listener makes every scroll wait for the main thread, so
// it only exists while the feature is on and something is fullscreen.
function syncWheelListener() {
  const shouldListen = settings.value.customFullscreenWheelVolume && !!document.fullscreenElement
  if (shouldListen === wheelListenerActive)
    return

  wheelListenerActive = shouldListen
  if (shouldListen) {
    window.addEventListener('wheel', handleWheel, WHEEL_LISTENER_OPTIONS)
  }
  else {
    window.removeEventListener('wheel', handleWheel, WHEEL_LISTENER_OPTIONS)
    accumulatedDelta = 0
  }
}

export function initFullscreenWheelVolume() {
  if (initialized)
    return
  initialized = true
  document.addEventListener('fullscreenchange', syncWheelListener)
  watch(() => settings.value.customFullscreenWheelVolume, syncWheelListener, { immediate: true })
}
