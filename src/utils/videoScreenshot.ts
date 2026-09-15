import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'
import { showState } from '~/utils/player'

let isCapturing = false

function translate(key: string): string {
  return String(i18n.global.t(key, settings.value.language))
}

function findCurrentVideo(trigger?: HTMLElement): HTMLVideoElement | null {
  const playerSelector = '.bpx-player-container, #bilibili-player, #bilibiliPlayer, .bilibili-player'
  const player = trigger?.closest(playerSelector) ?? document.querySelector(playerSelector)
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

export async function captureVideoScreenshot(trigger?: HTMLElement) {
  if (isCapturing)
    return

  const video = findCurrentVideo(trigger)
  if (!video) {
    showState(translate('player_screenshot.video_unavailable'))
    return
  }

  isCapturing = true
  if (trigger) {
    trigger.setAttribute('aria-busy', 'true')
    trigger.style.opacity = '0.5'
  }

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
    if (trigger) {
      trigger.removeAttribute('aria-busy')
      trigger.style.removeProperty('opacity')
    }
  }
}
