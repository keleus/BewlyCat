// 更完善的播放器元素选择器
import { settings } from '~/logic'

const _videoClassTag = {
  danmuBtn:
      '.bilibili-player-video-danmaku-switch > input[type=checkbox],.bpx-player-dm-switch input[type=checkbox]',
  playBtn:
      '.bpx-player-ctrl-play,.bilibili-player-video-btn-start,.squirtle-video-start',
  nextBtn:
      '.bpx-player-ctrl-next,.bilibili-player-video-btn-next,.squirtle-video-next',
  muteBtn:
      '.bpx-player-ctrl-volume,.bilibili-player-video-btn-volume,.squirtle-volume-icon',
  state:
      '.bilibili-player-video-state,.bpx-player-state-wrap,.bpx-player-video-state',
  title:
      '.video-title,.bilibili-player-video-top-title,#player-title,.season-info .title',
  widescreen:
      '.bpx-player-ctrl-wide,.bilibili-player-video-btn-widescreen,.squirtle-video-widescreen',
  pagefullscreen:
      '.bpx-player-ctrl-web,.bilibili-player-video-web-fullscreen,.squirtle-video-pagefullscreen',
  fullscreen:
      '.bpx-player-ctrl-full,.bilibili-player-video-btn-fullscreen,.squirtle-video-fullscreen',
  videoArea: '.bilibili-player-video-wrap,.bpx-player-video-area',
  video: '#bilibiliPlayer video,#bilibili-player video,.bilibili-player video,.player-container video,#bilibiliPlayer bwp-video,#bilibili-player bwp-video,.bilibili-player bwp-video,.player-container bwp-video,#bofqi video,[aria-label="哔哩哔哩播放器"] video',
  player: '#bilibili-player,.bpx-player-container',
  autoPlaySwitchOn: '.auto-play .switch-btn.on',
  autoPlaySwitchOff: '.auto-play .switch-btn:not(.on)',
}

// 重试任务类，用于处理重试逻辑
export class RetryTask {
  private count = 0
  private repeat: () => void

  constructor(
    private max: number,
    private timeout: number,
    private fn: () => boolean,
  ) {
    this.repeat = this.start.bind(this)
  }

  start() {
    this.count++
    if (this.count > this.max)
      return
    if (!this.fn())
      setTimeout(this.repeat, this.timeout)
  }
}

// 状态显示元素
let stateElement: HTMLDivElement | null = null
let timeElement: HTMLDivElement | null = null
let clockElement: HTMLDivElement | null = null
let titleElement: HTMLDivElement | null = null
let timeInterval: number | null = null
let clockInterval: number | null = null

// 获取视频元素
export function getVideoElement(): HTMLVideoElement | null {
  return document.querySelector(_videoClassTag.video)
}

// 判断是否为视频页面
export function isVideoPage() {
  return location.pathname.startsWith('/video/')
}

// 判断是否为番剧/watchlater页面
export function isBangumiOrWatchLaterPage() {
  return location.pathname.startsWith('/bangumi/play/') || location.pathname.startsWith('/list/watchlater')
}

// 格式化时间
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  seconds = Math.floor(seconds % 60)
  return `${minutes < 10 ? `0${minutes}` : minutes}:${seconds < 10 ? `0${seconds}` : seconds}`
}

// 显示状态
export function showState(text: string) {
  if (!stateElement) {
    stateElement = document.createElement('div')
    stateElement.style.cssText = 'display: none; position: absolute; z-index: 100000; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 8px 12px; background-color: rgba(8, 8, 8, 0.75); color: white; font-size: 22px; border-radius: 4px;'
  }

  const stateContainer = document.querySelector(_videoClassTag.state)
  if (stateContainer) {
    if (stateContainer.parentElement !== stateElement.parentElement) {
      stateContainer.parentElement!.appendChild(stateElement)
    }

    stateElement.textContent = text
    stateElement.style.display = 'block'

    setTimeout(() => {
      stateElement!.style.display = 'none'
    }, 1000)
  }
}

export function fullscreen() {
  new RetryTask(20, 500, () => {
    return fullscreenClick()
  }).start()
}

export function webFullscreen() {
  new RetryTask(20, 500, () => {
    // 检查是否已经处于网页全屏状态
    if (document.querySelector('[data-screen=\'web\']')) {
      return true
    }

    return webFullscreenClick()
  }).start()
}

// 将播放器滚动到合适位置，优先保证弹幕栏可见
function scrollPlayerToOptimalPosition(delay = 0) {
  // 如果设置了不滚动，直接返回
  if (!settings.value.videoPlayerScroll)
    return

  const scroll = () => {
    const playerElement = document.querySelector(_videoClassTag.player)
    if (!playerElement)
      return

    // 查找弹幕发送栏
    const sendingBar = document.querySelector('.bpx-player-sending-bar')
    if (sendingBar) {
      // 将弹幕发送栏底部滚动到窗口底部
      const rect = sendingBar.getBoundingClientRect()
      const bottomOffset = window.innerHeight - rect.bottom
      if (bottomOffset < 0) {
        window.scrollBy({
          top: -bottomOffset,
          behavior: 'smooth',
        })
      }
    }
    else {
      // 如果找不到弹幕发送栏，则直接居中显示播放器
      playerElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  if (delay > 0) {
    setTimeout(scroll, delay)
  }
  else {
    scroll()
  }
}

export function widescreen() {
  new RetryTask(20, 500, () => {
    // 检查是否已经处于宽屏状态
    if (document.querySelector('[data-screen=\'wide\']')) {
      // 即使已经是宽屏状态，也执行滚动
      scrollPlayerToOptimalPosition()
      return true
    }

    const result = widescreenClick()
    if (result) {
      scrollPlayerToOptimalPosition()
    }
    return result
  }).start()
}

export function widescreenClick() {
  const widescreenBtn = document.querySelector(_videoClassTag.widescreen) as HTMLElement
  if (widescreenBtn) {
    widescreenBtn.click()
    return true
  }
  return false
}

export function fullscreenClick() {
  const fullscreenBtn = document.querySelector(_videoClassTag.fullscreen) as HTMLElement
  if (fullscreenBtn) {
    fullscreenBtn.click()
    return true
  }
  return false
}

export function webFullscreenClick() {
  const webFullscreenBtn = document.querySelector(_videoClassTag.pagefullscreen) as HTMLElement
  if (webFullscreenBtn) {
    webFullscreenBtn.click()
    return true
  }
  return false
}

// 默认模式下也执行滚动
export function defaultMode() {
  scrollPlayerToOptimalPosition()
  return true
}

export function disableAutoPlayCollection(settings: { disableAutoPlayCollection: boolean }) {
  if (!settings.disableAutoPlayCollection)
    return false

  setTimeout(() => {
    const autoPlaySwitch = document.querySelector(_videoClassTag.autoPlaySwitchOn) as HTMLElement
    if (autoPlaySwitch)
      autoPlaySwitch.click()
  }, 2000)
}

// 播放/暂停
export function playPause(player: Element) {
  const playBtn = player.querySelector(_videoClassTag.playBtn)
  if (playBtn) {
    (playBtn as HTMLElement).click()
  }
  else {
    const video = getVideoElement()
    if (video) {
      if (video.paused)
        video.play()
      else
        video.pause()
    }
  }
}

// 步进/步退
export function stepSeek(forward: boolean, seconds: number) {
  const video = getVideoElement()
  if (!video || video.readyState === 0 || !Number.isFinite(video.duration) || (seconds < 1 && !video.paused))
    return

  if (forward) {
    video.currentTime = Math.min(video.currentTime + seconds, video.duration - 1)
  }
  else {
    if (video.duration === video.currentTime) {
      // 如果在视频末尾，使用左箭头事件
      simulateArrowKey(false)
    }
    else {
      video.currentTime = Math.max(video.currentTime - seconds, 0)
    }
  }
}

// 模拟箭头键
export function simulateArrowKey(isRight: boolean) {
  const videoArea = document.querySelector(_videoClassTag.videoArea)
  if (videoArea) {
    (videoArea as HTMLElement).click()
  }

  const keyOptions = {
    bubbles: true,
    cancelable: true,
    key: isRight ? 'ArrowRight' : 'ArrowLeft',
    code: isRight ? 'ArrowRight' : 'ArrowLeft',
    keyCode: isRight ? 39 : 37,
  }

  const keydownEvent = new KeyboardEvent('keydown', keyOptions)
  const keyupEvent = new KeyboardEvent('keyup', keyOptions)

  document.body.dispatchEvent(keydownEvent)
  document.body.dispatchEvent(keyupEvent)
}

// 百分比跳转
export function seekToPercent(percent: number) {
  const video = getVideoElement()
  if (video && video.readyState !== 0 && Number.isFinite(video.duration)) {
    video.currentTime = video.duration / 10 * percent
  }
}

// 切换静音
export function toggleMute(player: Element) {
  const muteBtn = player.querySelector(_videoClassTag.muteBtn)
  if (muteBtn) {
    const firstChild = muteBtn.firstElementChild
    if (firstChild) {
      (firstChild as HTMLElement).click()
    }

    const video = getVideoElement()
    if (video) {
      const volumeNumber = document.querySelector('.bpx-player-ctrl-volume-number')
      const isMuted = volumeNumber ? volumeNumber.textContent === '0' : video.muted
      showState(isMuted ? '已静音' : '已取消静音')
    }
  }
}

// 切换画中画
export async function togglePictureInPicture() {
  const video = getVideoElement()
  if (video && document.pictureInPictureEnabled && !video.disablePictureInPicture && video.readyState !== 0) {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    }

    if (document.pictureInPictureElement) {
      document.exitPictureInPicture()
    }
    else {
      video.requestPictureInPicture()
    }
  }
}

// 切换关灯
export function toggleLight() {
  const lightBtn = document.querySelector('.bpx-player-ctrl-setting-lightoff input[type=checkbox], .bilibili-player-video-btn-setting-right-others-content-lightoff input[type=checkbox], .squirtle-lightoff')
  if (lightBtn) {
    (lightBtn as HTMLElement).click()
    return
  }

  const settingBtn = document.querySelector('.bilibili-player-video-btn-setting')
  if (settingBtn) {
    settingBtn.addEventListener('mouseover', () => {
      setTimeout(() => {
        settingBtn.dispatchEvent(new MouseEvent('mouseout'))
        setTimeout(() => {
          const lightBtn = document.querySelector('.bpx-player-ctrl-setting-lightoff input[type=checkbox], .bilibili-player-video-btn-setting-right-others-content-lightoff input[type=checkbox], .squirtle-lightoff')
          if (lightBtn) {
            (lightBtn as HTMLElement).click()
          }
        }, 100)
      }, 150)
    }, { once: true })

    settingBtn.dispatchEvent(new MouseEvent('mouseover'))
  }
}

// 切换字幕
export function toggleCaption() {
  let captionBtn = document.querySelector('.bilibili-player-iconfont-subtitle')
  if (captionBtn) {
    if (captionBtn.nextElementSibling) {
      (captionBtn as HTMLElement).click()
    }
    else {
      const parent = captionBtn.parentElement
      if (parent) {
        parent.addEventListener('mouseover', () => {
          setTimeout(() => {
            parent.dispatchEvent(new MouseEvent('mouseout'))
            setTimeout(() => (captionBtn as HTMLElement).click(), 500)
          }, 150)
        }, { once: true })

        parent.dispatchEvent(new MouseEvent('mouseover'))
      }
    }
  }
  else {
    captionBtn = document.querySelector('.bpx-player-ctrl-subtitle span')
    if (captionBtn) {
      (captionBtn as HTMLElement).click()
    }
    else {
      const subtitleWrap = document.querySelector('.squirtle-subtitle-wrap')
      if (subtitleWrap && subtitleWrap.firstElementChild) {
        (subtitleWrap.firstElementChild as HTMLElement).click()
      }
    }
  }
}

// 改变播放速度
export function changePlaybackRate(increase: boolean) {
  const video = getVideoElement()
  if (!video)
    return

  const speedStep = 0.25

  if (increase) {
    if (video.playbackRate < 5) {
      video.playbackRate = Number.parseFloat((video.playbackRate + speedStep).toFixed(2))
    }
  }
  else {
    const newRate = Number.parseFloat((video.playbackRate - speedStep).toFixed(2))
    if (newRate >= 0.25) {
      video.playbackRate = newRate
    }
  }

  showState(`倍速 ${video.playbackRate}`)
}

// 重置播放速度
export function resetPlaybackRate() {
  const video = getVideoElement()
  if (video) {
    video.playbackRate = 1
    showState('倍速 1')
  }
}

// 截图
export function takeScreenshot(toClipboard = false, format: 'png' | 'jpg' = 'jpg') {
  const video = getVideoElement()
  if (!video || video.readyState < 2) {
    showState('视频未准备好截图')
    return
  }

  const downloadLink: HTMLAnchorElement = window._bewlyScreenshotLink || (window._bewlyScreenshotLink = document.createElement('a'))
  const canvas: HTMLCanvasElement = window._bewlyScreenshotCanvas || (window._bewlyScreenshotCanvas = document.createElement('canvas'))

  const currentTimeFormatted = video.currentTime.toFixed(0) // For filename

  if (video.tagName === 'BWP-VIDEO') {
    // BWP-VIDEO seems to have its own optimized screenshot method
    if ((video as any).toDataURL) {
      const dataUrlValue = (video as any).toDataURL()
      if (toClipboard) {
        const dataUrlParts = dataUrlValue.split(',')
        const mimeType = dataUrlParts[0].match(/:(.*?);/)?.[1] || 'image/png'
        const base64 = atob(dataUrlParts[1])
        const length = base64.length
        const uint8Array = new Uint8Array(length)
        for (let i = 0; i < length; i++) {
          uint8Array[i] = base64.charCodeAt(i)
        }
        const blob = new Blob([uint8Array], { type: mimeType })
        copyToClipboard(blob)
      }
      else {
        downloadLink.href = dataUrlValue
        // BWP-VIDEO toDataURL seems to be png only, format param might not apply here.
        downloadLink.download = `bilibili_${Date.now()}_${currentTimeFormatted}s.png`
        downloadLink.click()
        showState('截图已保存')
      }
      return
    }
  }

  // Fallback to canvas method
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) {
    showState('无法获取视频尺寸')
    return
  }
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    showState('无法获取Canvas上下文')
    return
  }

  ctx.drawImage(video, 0, 0, width, height)

  const imageMimeType = format === 'jpg' ? 'image/jpeg' : 'image/png'
  const fileExtension = format === 'jpg' ? 'jpg' : 'png'

  if (toClipboard) {
    canvas.toBlob((blob) => {
      if (blob) {
        copyToClipboard(blob) // copyToClipboard already shows state
      }
      else {
        showState('创建Blob失败')
      }
    }, imageMimeType)
  }
  else {
    try {
      downloadLink.href = canvas.toDataURL(imageMimeType, format === 'jpg' ? 0.98 : undefined) // Add quality for JPG
      downloadLink.download = `bilibili_${Date.now()}_${currentTimeFormatted}s.${fileExtension}`
      downloadLink.click()
      showState('截图已保存')
    }
    catch (e) {
      console.error('截图失败:', e)
      showState('截图失败')
    }
  }
}

// 复制到剪贴板
export async function copyToClipboard(blob: Blob) {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob,
      }),
    ])
    showState('已复制到剪贴板')
  }
  catch (err) {
    console.error('复制到剪贴板失败:', err)
    showState('复制到剪贴板失败')
  }
}

// 重播
export function replay() {
  const video = getVideoElement()
  if (video) {
    video.currentTime = 0
    if (video.paused)
      video.play()
  }
}

// 调整视频大小
export function adjustVideoSize(direction: number) {
  const video = getVideoElement()
  if (!video)
    return

  let width = video.style.width
  if (width === '') {
    width = '100%'
  }

  if (direction > 0) {
    // 增大
    video.style.width = width === '50%' ? '75%' : '100%'
  }
  else if (direction < 0) {
    // 减小
    video.style.width = width === '100%' ? '75%' : '50%'
  }
  else {
    // 重置
    video.style.width = '100%'
  }

  video.style.margin = 'auto'
}

// 显示弹幕状态
export function showDanmuState() {
  const danmuBtn = document.querySelector(_videoClassTag.danmuBtn)
  if (danmuBtn) {
    showState(`弹幕 ${(danmuBtn as HTMLInputElement).checked ? 'On' : 'Off'}`)
  }
}

// 切换视频标题显示
export function toggleVideoTitle() {
  if (!titleElement) {
    titleElement = document.createElement('div')
    titleElement.style.cssText = 'display: none; position: absolute; z-index: 100000; top: 0px; left: 50%; transform: translateX(-50%); padding: 4px 8px; background-color: rgba(8, 8, 8, 0.75); color: white; font-size: 22px;'
  }

  const stateContainer = document.querySelector(_videoClassTag.state)
  const titleElement2 = document.querySelector(_videoClassTag.title)

  if (stateContainer && titleElement2 && titleElement2.textContent) {
    if (stateContainer.parentElement !== titleElement.parentElement) {
      stateContainer.parentElement!.appendChild(titleElement)
      titleElement.style.display = 'none'
    }

    if (titleElement.style.display === 'none') {
      titleElement.textContent = titleElement2.textContent
      titleElement.style.display = 'block'
    }
    else {
      titleElement.style.display = 'none'
    }
  }
  else {
    titleElement.style.display = 'none'
  }
}

// 切换视频时间显示
export function toggleVideoTime() {
  if (!timeElement) {
    timeElement = document.createElement('div')
    timeElement.style.cssText = 'display: none; position: absolute; z-index: 100000; bottom: 55px; right: 20px; padding: 4px 8px; background-color: rgba(8, 8, 8, 0.75); color: white; font-size: 16px; border-radius: 4px;'
  }

  if (timeElement.style.display === 'none') {
    showVideoTime(true)
  }
  else {
    timeElement.style.display = 'none'
    if (timeInterval) {
      clearTimeout(timeInterval)
      timeInterval = null
    }
  }
}

// 显示视频时间
export function showVideoTime(firstShow = false) {
  const video = getVideoElement()
  const stateContainer = document.querySelector(_videoClassTag.state)

  if (stateContainer && video && video.readyState !== 0 && Number.isFinite(video.duration)) {
    const currentTime = Math.round(video.currentTime)
    const duration = Math.round(video.duration)
    const remainingTime = duration - currentTime

    const timeText = `${formatTime(currentTime)} / ${formatTime(duration)} [-${formatTime(remainingTime)}]`

    if (firstShow) {
      timeElement!.style.display = 'block'
    }

    if (stateContainer.parentElement !== timeElement!.parentElement) {
      stateContainer.parentElement!.appendChild(timeElement!)
    }

    timeElement!.textContent = timeText
    timeInterval = window.setTimeout(showVideoTime, 1000)
  }
  else {
    timeInterval = null
    if (timeElement) {
      timeElement.style.display = 'none'
    }
  }
}

// 切换时钟时间显示
export function toggleClockTime() {
  if (!clockElement) {
    clockElement = document.createElement('div')
    clockElement.style.cssText = 'display: none; position: absolute; z-index: 100000; top: 10px; right: 20px; padding: 4px 8px; background-color: rgba(8, 8, 8, 0.75); color: white; font-size: 16px; border-radius: 4px;'
  }

  if (clockElement.style.display === 'none') {
    showClockTime(true)
  }
  else {
    clockElement.style.display = 'none'
    if (clockInterval) {
      clearInterval(clockInterval)
      clockInterval = null
    }
  }
}

// 显示时钟时间
export function showClockTime(firstShow = false) {
  const stateContainer = document.querySelector(_videoClassTag.state)

  if (stateContainer) {
    const now = new Date()
    // 始终使用24小时制
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    const seconds = now.getSeconds().toString().padStart(2, '0')
    const timeText = `${hours}:${minutes}:${seconds}`

    if (firstShow) {
      clockElement!.style.display = 'block'
    }

    if (stateContainer.parentElement !== clockElement!.parentElement) {
      stateContainer.parentElement!.appendChild(clockElement!)
    }

    clockElement!.textContent = timeText

    if (!clockInterval) {
      clockInterval = window.setInterval(showClockTime, 1000)
    }
  }
  else {
    clockInterval = null
    if (clockElement) {
      clockElement.style.display = 'none'
    }
  }
}

// 添加视频页面内部跳转后的滚动处理
export function handleVideoPageNavigation() {
  scrollPlayerToOptimalPosition(3000) // 延迟3秒执行滚动
}

// 为Window接口添加自定义属性
declare global {
  interface Window {
    _bewlyScreenshotLink?: HTMLAnchorElement
    _bewlyScreenshotCanvas?: HTMLCanvasElement
  }
}
