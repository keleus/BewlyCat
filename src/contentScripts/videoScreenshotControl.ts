import { i18n } from '~/utils/i18n'
import { showState } from '~/utils/player'

const screenshotIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" style="width: 100%; height: 100%;">
  <path d="M25 29h9l4-6h12l4 6h9a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H25a6 6 0 0 1-6-6V35a6 6 0 0 1 6-6Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="44" cy="48" r="11" fill="none" stroke="#fff" stroke-width="5"/>
</svg>`

let controlContainer: HTMLElement | null = null
let hasInitialized = false
let isCapturing = false

function translate(key: string): string {
  return String(i18n.global.t(key))
}

function findPlayerControlBar(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.bpx-player-control-bottom-right')
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

function injectControl() {
  if (controlContainer?.isConnected)
    return

  const controlBar = findPlayerControlBar()
  if (!controlBar)
    return

  const existingControl = controlBar.querySelector<HTMLElement>('.bewly-video-screenshot-control')
  if (existingControl) {
    controlContainer = existingControl
    return
  }

  const anchor = controlBar.querySelector('.bewly-volume-normalization-control')
    || controlBar.querySelector('.bpx-player-ctrl-volume')
  if (!anchor?.querySelector('.bpx-player-ctrl-btn-icon'))
    return

  controlContainer = createControlContainer()
  anchor.insertAdjacentElement('afterend', controlContainer)
}

export function initVideoScreenshotControl() {
  if (hasInitialized || location.hostname.includes('live.bilibili.com'))
    return

  hasInitialized = true
  injectControl()

  setInterval(() => {
    injectControl()
  }, 2000)
}
