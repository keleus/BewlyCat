import { injectCSS } from './main'
import { getVideoElement } from './player'

const PLAYER_HOST_SELECTOR = [
  '#playerWrap',
  '#bilibili-player',
  '#bilibiliPlayer',
  '.player-wrap',
  '.bpx-player-container',
].join(',')

const HOST_CLASS = 'bewly-vertical-video-zoom-host'
const VERTICAL_CLASS = 'is-bewly-vertical-video'
const ZOOMED_CLASS = 'is-bewly-vertical-video-zoomed'
const ADJUSTING_CLASS = 'is-bewly-vertical-video-adjusting'
const BUTTON_CLASS = 'bewly-vertical-video-zoom-button'
const CONTROL_CLASS = 'bewly-vertical-video-zoom-control'
const MAP_CLASS = 'bewly-vertical-video-zoom-map'
const CANVAS_CLASS = 'bewly-vertical-video-zoom-canvas'
const VIEWPORT_CLASS = 'bewly-vertical-video-zoom-viewport'
const MAX_REFRESH_ATTEMPTS = 40
const DEFAULT_ZOOM_POSITION_Y = 50
const MAP_HEIGHT = 160
const MINIMAP_FRAME_REFRESH_INTERVAL = 30000

let styleEl: HTMLStyleElement | null = null
let button: HTMLButtonElement | null = null
let control: HTMLDivElement | null = null
let mapElement: HTMLDivElement | null = null
let canvasElement: HTMLCanvasElement | null = null
let viewportElement: HTMLDivElement | null = null
let currentHost: HTMLElement | null = null
let observedVideo: HTMLVideoElement | null = null
let metadataListener: (() => void) | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let minimapRenderTimer: ReturnType<typeof setTimeout> | null = null
let refreshAttempts = 0
let zoomPositionY = DEFAULT_ZOOM_POSITION_Y
let lastMinimapRenderAt = 0

function injectStyle() {
  if (styleEl?.isConnected)
    return

  styleEl = injectCSS(`
    .${HOST_CLASS} {
      position: relative !important;
    }

    .${BUTTON_CLASS} {
      position: absolute !important;
      top: 12px !important;
      right: 12px !important;
      z-index: 100 !important;
      display: none;
      align-items: center !important;
      justify-content: center !important;
      height: 32px !important;
      min-width: 58px !important;
      padding: 0 14px !important;
      border: 1px solid rgb(255 255 255 / 24%) !important;
      border-radius: 999px !important;
      color: #fff !important;
      background: rgb(0 0 0 / 48%) !important;
      backdrop-filter: blur(8px) !important;
      box-shadow: 0 6px 18px rgb(0 0 0 / 22%) !important;
      filter: none !important;
      outline: 0 !important;
      font-size: 13px !important;
      line-height: 32px !important;
      cursor: pointer !important;
      user-select: none !important;
    }

    .${HOST_CLASS}.${VERTICAL_CLASS}:hover > .${BUTTON_CLASS},
    .${HOST_CLASS}.${VERTICAL_CLASS}.${ADJUSTING_CLASS} > .${BUTTON_CLASS} {
      display: inline-flex;
    }

    .${CONTROL_CLASS} {
      position: absolute !important;
      top: 52px !important;
      right: 12px !important;
      z-index: 100 !important;
      display: none;
      align-items: center !important;
      justify-content: center !important;
      width: var(--bewly-vertical-video-map-width, 72px) !important;
      height: ${MAP_HEIGHT}px !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 4px !important;
      background: transparent !important;
      backdrop-filter: none !important;
      box-shadow: 0 6px 18px rgb(0 0 0 / 22%) !important;
      filter: none !important;
    }

    .${HOST_CLASS}.${VERTICAL_CLASS}.${ZOOMED_CLASS}:hover > .${CONTROL_CLASS},
    .${HOST_CLASS}.${VERTICAL_CLASS}.${ZOOMED_CLASS}.${ADJUSTING_CLASS} > .${CONTROL_CLASS} {
      display: inline-flex;
    }

    .${MAP_CLASS} {
      position: relative !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 4px !important;
      background: rgb(0 0 0 / 54%) !important;
      box-shadow: 0 0 0 1px rgb(0 0 0 / 34%) !important;
      cursor: pointer !important;
      overflow: hidden !important;
      touch-action: none !important;
    }

    .${MAP_CLASS}:focus {
      outline: none !important;
    }

    .${CANVAS_CLASS} {
      position: absolute !important;
      inset: 0 !important;
      z-index: 0 !important;
      width: 100% !important;
      height: 100% !important;
      display: block !important;
      object-fit: contain !important;
      background: #000 !important;
      pointer-events: none !important;
    }

    .${VIEWPORT_CLASS} {
      position: absolute !important;
      z-index: 2 !important;
      left: 0 !important;
      top: var(--bewly-vertical-video-zoom-window-top, 49px) !important;
      width: 100% !important;
      height: var(--bewly-vertical-video-zoom-window-height, 50px) !important;
      border: 2px solid var(--bew-theme-color, #00aeec) !important;
      border-color: var(--bew-theme-color, #00aeec) !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      box-sizing: border-box !important;
      pointer-events: none !important;
    }

    #bewly-widescreen-root .${HOST_CLASS} > .${BUTTON_CLASS} {
      border: 1px solid rgb(255 255 255 / 24%) !important;
      border-radius: 999px !important;
      box-shadow: 0 6px 18px rgb(0 0 0 / 22%) !important;
      filter: none !important;
    }

    #bewly-widescreen-root .${HOST_CLASS} > .${CONTROL_CLASS} {
      border: 0 !important;
      border-radius: 4px !important;
      box-shadow: 0 6px 18px rgb(0 0 0 / 22%) !important;
      filter: none !important;
    }

    #bewly-widescreen-root .${HOST_CLASS} .${VIEWPORT_CLASS} {
      border: 2px solid var(--bew-theme-color, #00aeec) !important;
      border-top-color: var(--bew-theme-color, #00aeec) !important;
      border-right-color: var(--bew-theme-color, #00aeec) !important;
      border-bottom-color: var(--bew-theme-color, #00aeec) !important;
      border-left-color: var(--bew-theme-color, #00aeec) !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      filter: none !important;
    }

    .${BUTTON_CLASS}:hover,
    #bewly-widescreen-root .${BUTTON_CLASS}:hover {
      border-color: var(--bew-theme-color, #00aeec) !important;
      background: var(--bew-theme-color, #00aeec) !important;
      color: #fff !important;
    }

    .${HOST_CLASS}.${ZOOMED_CLASS} .bpx-player-primary-area,
    .${HOST_CLASS}.${ZOOMED_CLASS} .bpx-player-video-area,
    .${HOST_CLASS}.${ZOOMED_CLASS} .bpx-player-video-wrap,
    .${HOST_CLASS}.${ZOOMED_CLASS} .bilibili-player-video-area,
    .${HOST_CLASS}.${ZOOMED_CLASS} .bilibili-player-video-wrap {
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      overflow: hidden !important;
    }

    .${HOST_CLASS}.${ZOOMED_CLASS} video {
      position: absolute !important;
      left: 50% !important;
      top: 0 !important;
      width: auto !important;
      height: 100% !important;
      aspect-ratio: 1 / 1 !important;
      max-width: none !important;
      max-height: none !important;
      object-fit: cover !important;
      object-position: center var(--bewly-vertical-video-zoom-y, 50%) !important;
      transform: translateX(-50%) !important;
    }
  `)
}

function findPlayerHost() {
  const video = getVideoElement()
  return video?.closest<HTMLElement>(PLAYER_HOST_SELECTOR)
    || document.querySelector<HTMLElement>(PLAYER_HOST_SELECTOR)
}

function syncButtonLabel() {
  if (!button || !currentHost)
    return

  button.textContent = currentHost.classList.contains(ZOOMED_CLASS) ? '缩小' : '放大'
}

function syncZoomPosition() {
  if (!currentHost)
    return

  currentHost.style.setProperty('--bewly-vertical-video-zoom-y', `${zoomPositionY}%`)
  if (mapElement && viewportElement) {
    syncMinimapGeometry()
    const trackHeight = mapElement.clientHeight || MAP_HEIGHT
    const viewportHeight = viewportElement.offsetHeight || getViewportHeight()
    const top = Math.max(0, (trackHeight - viewportHeight) * (zoomPositionY / 100))
    mapElement.style.setProperty('--bewly-vertical-video-zoom-window-top', `${top}px`)
    mapElement.setAttribute('aria-valuenow', String(Math.round(zoomPositionY)))
  }
}

function resetZoomPosition() {
  zoomPositionY = DEFAULT_ZOOM_POSITION_Y
  syncZoomPosition()
}

function ensureButton(host: HTMLElement) {
  if (!button) {
    button = document.createElement('button')
    button.type = 'button'
    button.className = BUTTON_CLASS
    button.addEventListener('click', () => {
      if (!currentHost?.classList.contains(VERTICAL_CLASS))
        return

      const zoomed = currentHost.classList.toggle(ZOOMED_CLASS)
      if (!zoomed) {
        resetZoomPosition()
      }
      else {
        scheduleMinimapFrameRender(0, true)
        syncZoomPosition()
      }
      syncButtonLabel()
      button?.blur()
    })
  }

  if (button.parentElement !== host)
    host.appendChild(button)
}

function ensureControl(host: HTMLElement) {
  if (!control) {
    control = document.createElement('div')
    control.className = CONTROL_CLASS

    mapElement = document.createElement('div')
    mapElement.className = MAP_CLASS
    mapElement.tabIndex = 0
    mapElement.setAttribute('role', 'slider')
    mapElement.setAttribute('aria-label', '调整竖屏放大区域')
    mapElement.setAttribute('aria-valuemin', '0')
    mapElement.setAttribute('aria-valuemax', '100')

    canvasElement = document.createElement('canvas')
    canvasElement.className = CANVAS_CLASS
    viewportElement = document.createElement('div')
    viewportElement.className = VIEWPORT_CLASS
    mapElement.appendChild(canvasElement)
    mapElement.appendChild(viewportElement)

    mapElement.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      mapElement?.setPointerCapture(event.pointerId)
      currentHost?.classList.add(ADJUSTING_CLASS)
      setZoomPositionFromPointer(event)

      const onPointerMove = (moveEvent: PointerEvent) => setZoomPositionFromPointer(moveEvent)
      const onPointerUp = () => {
        currentHost?.classList.remove(ADJUSTING_CLASS)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp, { once: true })
    })

    mapElement.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
        return

      event.preventDefault()
      zoomPositionY = Math.max(0, Math.min(100, zoomPositionY + (event.key === 'ArrowDown' ? 4 : -4)))
      syncZoomPosition()
    })

    control.appendChild(mapElement)
  }

  if (control.parentElement !== host)
    host.appendChild(control)

  scheduleMinimapFrameRender(0, true)
  syncZoomPosition()
}

function setZoomPositionFromPointer(event: PointerEvent) {
  if (!mapElement || !viewportElement)
    return

  const rect = mapElement.getBoundingClientRect()
  const viewportHeight = viewportElement.offsetHeight || getViewportHeight()
  const maxTop = Math.max(1, rect.height - viewportHeight)
  const progress = (event.clientY - rect.top - viewportHeight / 2) / maxTop
  zoomPositionY = Math.max(0, Math.min(100, progress * 100))
  syncZoomPosition()
}

function getViewportHeight() {
  if (!currentHost)
    return 50

  const video = getVideoElement()
  // The zoomed view shows the largest 1:1 (square) crop of the video, so the
  // visible vertical slice equals the video width — its fraction of the full
  // frame height is simply videoWidth / videoHeight.
  const visibleRatio = video?.videoWidth && video.videoHeight
    ? video.videoWidth / video.videoHeight
    : 9 / 16
  const clampedRatio = Math.max(0.1, Math.min(1, visibleRatio))
  return Math.max(24, Math.min(MAP_HEIGHT, Math.round(MAP_HEIGHT * clampedRatio)))
}

function syncMinimapGeometry() {
  if (!currentHost || !mapElement || !control || !viewportElement)
    return

  const video = getVideoElement()
  const videoAspect = video?.videoWidth && video.videoHeight
    ? video.videoWidth / video.videoHeight
    : 9 / 16
  const mapWidth = Math.max(48, Math.min(96, Math.round(MAP_HEIGHT * videoAspect)))
  const viewportHeight = getViewportHeight()

  control.style.setProperty('--bewly-vertical-video-map-width', `${mapWidth}px`)
  mapElement.style.setProperty('--bewly-vertical-video-zoom-window-height', `${viewportHeight}px`)
}

function renderMinimapFrame() {
  const video = getVideoElement()
  if (!canvasElement || !video?.videoWidth || !video.videoHeight)
    return
  if (!isVideoFrameDrawable(video))
    return

  syncMinimapGeometry()

  const rect = canvasElement.getBoundingClientRect()
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  const width = Math.max(1, Math.round(rect.width * dpr))
  const height = Math.max(1, Math.round(rect.height * dpr))
  if (canvasElement.width !== width)
    canvasElement.width = width
  if (canvasElement.height !== height)
    canvasElement.height = height

  const ctx = canvasElement.getContext('2d')
  if (!ctx)
    return

  const scale = Math.min(width / video.videoWidth, height / video.videoHeight)
  const drawWidth = video.videoWidth * scale
  const drawHeight = video.videoHeight * scale
  const x = (width - drawWidth) / 2
  const y = (height - drawHeight) / 2

  try {
    const frameCanvas = document.createElement('canvas')
    frameCanvas.width = width
    frameCanvas.height = height
    const frameCtx = frameCanvas.getContext('2d', { alpha: false })
    if (!frameCtx)
      return

    frameCtx.fillStyle = '#000'
    frameCtx.fillRect(0, 0, width, height)
    frameCtx.drawImage(video, x, y, drawWidth, drawHeight)
    if (isCanvasFrameEffectivelyBlack(frameCtx, width, height))
      return

    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(frameCanvas, 0, 0)
    lastMinimapRenderAt = Date.now()
  }
  catch {
    // The live frame can be temporarily unavailable while Bilibili swaps streams.
  }
}

function isVideoFrameDrawable(video: HTMLVideoElement) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
    return false

  return true
}

function isCanvasFrameEffectivelyBlack(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const sampleSize = Math.max(1, Math.min(18, width, height))
  const sampleX = Math.max(0, Math.floor((width - sampleSize) / 2))
  const sampleY = Math.max(0, Math.floor((height - sampleSize) / 2))

  try {
    const data = ctx.getImageData(sampleX, sampleY, sampleSize, sampleSize).data
    let brightPixels = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 30)
        brightPixels++
    }
    return brightPixels / (data.length / 4) < 0.02
  }
  catch {
    return false
  }
}

function scheduleMinimapFrameRender(delay = 80, force = false) {
  if (!force && Date.now() - lastMinimapRenderAt < MINIMAP_FRAME_REFRESH_INTERVAL)
    return

  if (minimapRenderTimer)
    clearTimeout(minimapRenderTimer)

  minimapRenderTimer = setTimeout(() => {
    minimapRenderTimer = null
    renderMinimapFrame()
  }, delay)
}

function syncVideoState() {
  if (!currentHost)
    return

  const video = getVideoElement()
  const vertical = !!(video?.videoWidth && video.videoHeight && video.videoWidth < video.videoHeight)
  currentHost.classList.toggle(VERTICAL_CLASS, vertical)
  if (!vertical) {
    currentHost.classList.remove(ZOOMED_CLASS)
    resetZoomPosition()
  }

  syncButtonLabel()
}

function bindVideoMetadata(video: HTMLVideoElement | null) {
  if (observedVideo === video)
    return

  metadataListener?.()
  observedVideo = video
  metadataListener = null
  lastMinimapRenderAt = 0
  resetZoomPosition()

  if (!video)
    return

  const onLoadedMetadata = () => syncVideoState()
  const onFrameReady = () => scheduleMinimapFrameRender()
  const onFrameReadyNow = () => scheduleMinimapFrameRender(0, true)
  video.addEventListener('loadedmetadata', onLoadedMetadata)
  video.addEventListener('loadeddata', onFrameReadyNow)
  video.addEventListener('canplay', onFrameReadyNow)
  video.addEventListener('playing', onFrameReadyNow)
  video.addEventListener('seeked', onFrameReadyNow)
  video.addEventListener('timeupdate', onFrameReady)
  metadataListener = () => {
    video.removeEventListener('loadedmetadata', onLoadedMetadata)
    video.removeEventListener('loadeddata', onFrameReadyNow)
    video.removeEventListener('canplay', onFrameReadyNow)
    video.removeEventListener('playing', onFrameReadyNow)
    video.removeEventListener('seeked', onFrameReadyNow)
    video.removeEventListener('timeupdate', onFrameReady)
  }
}

function scheduleRefresh(delay = 300) {
  if (refreshTimer)
    clearTimeout(refreshTimer)

  refreshTimer = setTimeout(() => {
    refreshTimer = null
    refreshVerticalVideoZoom()
  }, delay)
}

function refreshVerticalVideoZoom() {
  const host = findPlayerHost()
  const video = getVideoElement()

  if (!host || !video) {
    if (refreshAttempts++ < MAX_REFRESH_ATTEMPTS)
      scheduleRefresh()
    return
  }

  if (currentHost && currentHost !== host) {
    currentHost.classList.remove(HOST_CLASS, VERTICAL_CLASS, ZOOMED_CLASS, ADJUSTING_CLASS)
    currentHost.style.removeProperty('--bewly-vertical-video-zoom-y')
  }

  currentHost = host
  currentHost.classList.add(HOST_CLASS)
  ensureButton(currentHost)
  ensureControl(currentHost)
  bindVideoMetadata(video)
  syncVideoState()

  if ((!video.videoWidth || !video.videoHeight) && refreshAttempts++ < MAX_REFRESH_ATTEMPTS)
    scheduleRefresh()
}

export function initVerticalVideoZoom() {
  injectStyle()
  refreshAttempts = 0
  scheduleRefresh(0)
}

export function resetVerticalVideoZoom() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  if (minimapRenderTimer) {
    clearTimeout(minimapRenderTimer)
    minimapRenderTimer = null
  }

  metadataListener?.()
  metadataListener = null
  observedVideo = null
  button?.remove()
  button = null
  control?.remove()
  control = null
  currentHost?.classList.remove(HOST_CLASS, VERTICAL_CLASS, ZOOMED_CLASS, ADJUSTING_CLASS)
  currentHost?.style.removeProperty('--bewly-vertical-video-zoom-y')
  currentHost = null
  zoomPositionY = DEFAULT_ZOOM_POSITION_Y
  lastMinimapRenderAt = 0
  mapElement = null
  canvasElement = null
  viewportElement = null
  refreshAttempts = 0
}
