import { watch } from 'vue'

import { settings } from '~/logic'
import { isVideoPlaybackPage } from '~/utils/main'
import { calculateRelativeSeekTime } from '~/utils/touchGesture'

const ROOT_CLASS = 'bewly-touch-player-gestures'
const STYLE_ID = 'bewly-touch-player-gestures-style'
const HUD_CLASS = 'bewly-touch-player-gesture-hud'
const PLAYER_SELECTOR = '.bpx-player-container, #bilibili-player, .bilibili-player, .squirtle-video-wrap'
const VIDEO_AREA_SELECTOR = '.bpx-player-video-area, .bilibili-player-video-wrap, .squirtle-video-wrap'
const INTERACTIVE_SELECTOR = [
  '.bpx-player-control-wrap',
  '.bpx-player-control-bottom',
  '.bilibili-player-video-control',
  '.squirtle-controller',
  'button',
  'input',
  'a',
  '[role="button"]',
].join(', ')

const DOUBLE_TAP_DELAY_MS = 350
const DOUBLE_TAP_DISTANCE_PX = 48
const GESTURE_START_DISTANCE_PX = 10
const EDGE_ZONE_RATIO = 0.25
const DOUBLE_TAP_EDGE_RATIO = 0.35
const DOUBLE_TAP_SEEK_SECONDS = 10

type GestureMode = 'seek' | 'volume' | 'ignored' | null
type TapZone = 'left' | 'center' | 'right'

interface PlayerContext {
  area: HTMLElement
  player: HTMLElement
  video: HTMLVideoElement
  rect: DOMRect
}

interface GestureSession extends PlayerContext {
  pointerId: number
  startX: number
  startY: number
  startTime: number
  startPlaybackTime: number
  startVolume: number
  volumeGesture: boolean
  mode: GestureMode
}

interface LastTap {
  player: HTMLElement
  zone: TapZone
  wasPaused: boolean
  x: number
  y: number
  time: number
}

let initialized = false
let gesture: GestureSession | null = null
let lastTap: LastTap | null = null
let suppressNativeDoubleClickUntil = 0
let suppressClickUntil = 0
let hudHideTimeout: number | null = null

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor(safeSeconds % 3600 / 60)
  const remainingSeconds = safeSeconds % 60
  const minuteText = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  const baseTime = `${minuteText}:${String(remainingSeconds).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${baseTime}` : baseTime
}

function isTouchPointer(event: PointerEvent) {
  return event.isPrimary && (event.pointerType === 'touch' || event.pointerType === 'pen')
}

function getActiveVideo(player: HTMLElement): HTMLVideoElement | null {
  const videos = Array.from(player.querySelectorAll<HTMLVideoElement>('video'))
    .filter(video => video.readyState !== HTMLMediaElement.HAVE_NOTHING && video.getClientRects().length > 0)

  return videos.sort((first, second) => {
    const firstRect = first.getBoundingClientRect()
    const secondRect = second.getBoundingClientRect()
    return secondRect.width * secondRect.height - firstRect.width * firstRect.height
  })[0] ?? null
}

function getPlayerContext(target: EventTarget | null, clientY?: number): PlayerContext | null {
  if (!(target instanceof Element))
    return null
  if (target.closest(INTERACTIVE_SELECTOR))
    return null

  const area = target.closest<HTMLElement>(VIDEO_AREA_SELECTOR)
  if (!area)
    return null

  const player = area.closest<HTMLElement>(PLAYER_SELECTOR) ?? area
  const rect = area.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0)
    return null

  // Leave the native bottom control bar fully interactive.
  if (clientY !== undefined && clientY >= rect.bottom - Math.min(64, rect.height * 0.18))
    return null

  const video = getActiveVideo(player)
  if (!video)
    return null

  return { area, player, video, rect }
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID))
    return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .${ROOT_CLASS} ${VIDEO_AREA_SELECTOR.split(', ').join(`, .${ROOT_CLASS} `)} {
      touch-action: none !important;
      -webkit-touch-callout: none !important;
    }

    .${HUD_CLASS} {
      position: absolute;
      top: 50%;
      left: 50%;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 72px;
      padding: 10px 14px;
      color: #fff;
      font: 600 18px/1.2 system-ui, sans-serif;
      white-space: nowrap;
      pointer-events: none;
      background: rgb(0 0 0 / 68%);
      border-radius: 8px;
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.96);
      transition: opacity 120ms ease, transform 120ms ease;
    }

    .${HUD_CLASS}.${HUD_CLASS}--visible {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  `
  document.documentElement.appendChild(style)
}

function showHud(area: HTMLElement, text: string, persist = false) {
  let hud = area.querySelector<HTMLElement>(`:scope > .${HUD_CLASS}`)
  if (!hud) {
    hud = document.createElement('div')
    hud.className = HUD_CLASS
    hud.setAttribute('aria-live', 'polite')
    area.appendChild(hud)
  }

  hud.textContent = text
  hud.classList.add(`${HUD_CLASS}--visible`)

  if (hudHideTimeout !== null)
    clearTimeout(hudHideTimeout)
  hudHideTimeout = null

  if (!persist) {
    hudHideTimeout = window.setTimeout(() => {
      hud?.classList.remove(`${HUD_CLASS}--visible`)
      hudHideTimeout = null
    }, 700)
  }
}

function hideHud(area?: HTMLElement) {
  if (hudHideTimeout !== null) {
    clearTimeout(hudHideTimeout)
    hudHideTimeout = null
  }
  if (area) {
    area.querySelector<HTMLElement>(`:scope > .${HUD_CLASS}`)?.classList.remove(`${HUD_CLASS}--visible`)
    return
  }

  document.querySelectorAll<HTMLElement>(`.${HUD_CLASS}`).forEach((hud) => {
    hud.classList.remove(`${HUD_CLASS}--visible`)
  })
}

function getTapZone(clientX: number, rect: DOMRect): TapZone {
  const ratio = (clientX - rect.left) / rect.width
  if (ratio < DOUBLE_TAP_EDGE_RATIO)
    return 'left'
  if (ratio > 1 - DOUBLE_TAP_EDGE_RATIO)
    return 'right'
  return 'center'
}

function runDoubleTapAction(context: PlayerContext, zone: TapZone, wasPaused: boolean) {
  const { area, video } = context

  if (zone === 'center') {
    if (wasPaused) {
      void video.play().catch(() => {})
      showHud(area, '▶')
    }
    else {
      video.pause()
      showHud(area, 'Ⅱ')
    }
    return
  }

  const offset = zone === 'left' ? -DOUBLE_TAP_SEEK_SECONDS : DOUBLE_TAP_SEEK_SECONDS
  const maxTime = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY
  video.currentTime = clamp(video.currentTime + offset, 0, maxTime)
  if (wasPaused)
    video.pause()
  else
    void video.play().catch(() => {})
  showHud(area, `${offset > 0 ? '+' : '−'}${DOUBLE_TAP_SEEK_SECONDS}s`)
}

function handlePointerDown(event: PointerEvent) {
  if (!settings.value.touchScreenOptimization || !isVideoPlaybackPage() || !isTouchPointer(event))
    return

  const context = getPlayerContext(event.target, event.clientY)
  if (!context)
    return

  const horizontalRatio = (event.clientX - context.rect.left) / context.rect.width
  const volumeGesture = horizontalRatio <= EDGE_ZONE_RATIO || horizontalRatio >= 1 - EDGE_ZONE_RATIO

  gesture = {
    ...context,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startTime: performance.now(),
    startPlaybackTime: context.video.currentTime,
    startVolume: context.video.volume,
    volumeGesture,
    mode: null,
  }
}

function handlePointerMove(event: PointerEvent) {
  if (!gesture || gesture.pointerId !== event.pointerId)
    return

  const deltaX = event.clientX - gesture.startX
  const deltaY = event.clientY - gesture.startY
  const distance = Math.hypot(deltaX, deltaY)

  if (gesture.mode === null && distance >= GESTURE_START_DISTANCE_PX) {
    if (Math.abs(deltaX) > Math.abs(deltaY) * 1.1)
      gesture.mode = 'seek'
    else if (Math.abs(deltaY) > Math.abs(deltaX) * 1.1)
      gesture.mode = gesture.volumeGesture ? 'volume' : 'ignored'
    else
      return

    if (gesture.mode !== 'ignored')
      lastTap = null
  }

  if (gesture.mode === 'seek') {
    if (Number.isFinite(gesture.video.duration) && gesture.video.duration > 0) {
      gesture.video.currentTime = calculateRelativeSeekTime(
        gesture.startPlaybackTime,
        deltaX,
        gesture.rect.width,
        gesture.video.duration,
      )
      showHud(
        gesture.area,
        `${formatTime(gesture.video.currentTime)} / ${formatTime(gesture.video.duration)}`,
        true,
      )
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }

  if (gesture.mode !== 'volume')
    return

  const change = (gesture.startY - event.clientY) / gesture.rect.height
  const volume = clamp(gesture.startVolume + change, 0, 1)
  gesture.video.muted = false
  gesture.video.volume = volume
  showHud(gesture.area, `🔊 ${Math.round(volume * 100)}%`, true)

  event.preventDefault()
  event.stopImmediatePropagation()
}

function handlePointerEnd(event: PointerEvent, cancelled = false) {
  if (!gesture || gesture.pointerId !== event.pointerId)
    return

  const currentGesture = gesture
  gesture = null

  if (currentGesture.mode === 'seek' || currentGesture.mode === 'volume') {
    const feedback = currentGesture.mode === 'volume'
      ? `🔊 ${Math.round(currentGesture.video.volume * 100)}%`
      : `${formatTime(currentGesture.video.currentTime)} / ${formatTime(currentGesture.video.duration)}`
    showHud(currentGesture.area, feedback)
    suppressClickUntil = performance.now() + 300
    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }

  if (cancelled || currentGesture.mode === 'ignored')
    return

  const elapsed = performance.now() - currentGesture.startTime
  const distance = Math.hypot(event.clientX - currentGesture.startX, event.clientY - currentGesture.startY)
  if (elapsed > DOUBLE_TAP_DELAY_MS || distance >= GESTURE_START_DISTANCE_PX)
    return

  const zone = getTapZone(event.clientX, currentGesture.rect)
  const now = performance.now()
  const previousTap = lastTap
  const isDoubleTap = previousTap
    && previousTap.player === currentGesture.player
    && previousTap.zone === zone
    && now - previousTap.time <= DOUBLE_TAP_DELAY_MS
    && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= DOUBLE_TAP_DISTANCE_PX

  if (!isDoubleTap) {
    lastTap = {
      player: currentGesture.player,
      zone,
      wasPaused: currentGesture.video.paused,
      x: event.clientX,
      y: event.clientY,
      time: now,
    }
    return
  }

  const wasPaused = previousTap.wasPaused
  lastTap = null
  suppressNativeDoubleClickUntil = now + 500
  suppressClickUntil = now + 300
  runDoubleTapAction(currentGesture, zone, wasPaused)
  event.preventDefault()
  event.stopImmediatePropagation()
}

function handleClick(event: MouseEvent) {
  if (performance.now() > suppressClickUntil)
    return
  if (!getPlayerContext(event.target))
    return

  event.preventDefault()
  event.stopImmediatePropagation()
}

function handleDoubleClick(event: MouseEvent) {
  if (performance.now() > suppressNativeDoubleClickUntil)
    return
  if (!getPlayerContext(event.target))
    return

  event.preventDefault()
  event.stopImmediatePropagation()
}

function updateEnabledState(enabled: boolean) {
  document.documentElement.classList.toggle(ROOT_CLASS, enabled)
  if (enabled)
    return

  gesture = null
  lastTap = null
  hideHud()
}

export function initTouchPlayerGestures() {
  if (initialized)
    return
  initialized = true

  ensureStyles()
  watch(() => settings.value.touchScreenOptimization, updateEnabledState, { immediate: true })
  document.addEventListener('pointerdown', handlePointerDown, { capture: true })
  document.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false })
  document.addEventListener('pointerup', event => handlePointerEnd(event), { capture: true })
  document.addEventListener('pointercancel', event => handlePointerEnd(event, true), { capture: true })
  document.addEventListener('click', handleClick, { capture: true })
  document.addEventListener('dblclick', handleDoubleClick, { capture: true })
}
