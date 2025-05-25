// 更完善的播放器元素选择器
import { settings } from '~/logic'

import { applyVolumeBalance, startVolumeChangeMonitoring } from './volumeBalance'
import { initVolumeSliders } from './volumeSliders'

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
  upName: '.up-name,.up-info-name,.upinfo-btn-panel .name,.video-info-detail-list .name',
  upLink: 'a[href*="space.bilibili.com"],.up-name[href*="space.bilibili.com"],.upinfo-btn-panel .name[href*="space.bilibili.com"]',
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
    const result = fullscreenClick()
    if (result) {
      // 在成功进入全屏后应用音量均衡
      setTimeout(() => {
        applyVolumeBalance()
        startVolumeChangeMonitoring()
        initVolumeSliders()
      }, 1000)
    }
    return result
  }).start()
}

export function webFullscreen() {
  new RetryTask(20, 500, () => {
    // 检查是否已经处于网页全屏状态
    if (document.querySelector('[data-screen=\'web\']')) {
      // 即使已经是网页全屏状态，也应用音量均衡
      setTimeout(() => {
        applyVolumeBalance()
        startVolumeChangeMonitoring()
        initVolumeSliders()
      }, 1000)
      return true
    }

    const result = webFullscreenClick()
    if (result) {
      // 在成功进入网页全屏后应用音量均衡
      setTimeout(() => {
        applyVolumeBalance()
        startVolumeChangeMonitoring()
        initVolumeSliders()
      }, 1000)
    }
    return result
  }).start()
}

// 将播放器滚动到合适位置，优先保证弹幕栏可见
function scrollPlayerToOptimalPosition(delay = 1000) {
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
      // 即使已经是宽屏状态，也执行滚动和音量均衡
      scrollPlayerToOptimalPosition()
      setTimeout(() => {
        applyVolumeBalance()
        startVolumeChangeMonitoring()
        initVolumeSliders()
      }, 1000)
      return true
    }

    const result = widescreenClick()
    if (result) {
      scrollPlayerToOptimalPosition()
      // 在成功进入宽屏后应用音量均衡
      setTimeout(() => {
        applyVolumeBalance()
        startVolumeChangeMonitoring()
        initVolumeSliders()
      }, 1000)
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

// 默认模式下也执行滚动和音量均衡
export function defaultMode() {
  scrollPlayerToOptimalPosition()
  // 在默认模式下也应用音量均衡
  setTimeout(() => {
    applyVolumeBalance()
    startVolumeChangeMonitoring()
    initVolumeSliders()
  }, 2000) // 默认模式延迟稍长一些，确保页面完全加载
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

// 查找UP主元素，优先查找 up-panel-container 容器，适配单UP和联合投稿
function findUpElement(): HTMLAnchorElement | null {
  // 首先查找 up-panel-container 容器
  const upPanelContainer = document.querySelector('.up-panel-container')
  if (upPanelContainer) {
    // 在容器内查找 .up-name[href*="space.bilibili.com"] 链接
    const upLinkElement = upPanelContainer.querySelector('.up-name[href*="space.bilibili.com"]') as HTMLAnchorElement
    if (upLinkElement && upLinkElement.href) {
      return upLinkElement
    }

    // 查找带有 info-tag 为 "UP主" 的 staff-info 结构
    const staffInfos = upPanelContainer.querySelectorAll('.staff-info')
    for (let i = 0; i < staffInfos.length; i++) {
      const staffInfo = staffInfos[i]
      const infoTag = staffInfo.querySelector('.info-tag')
      if (infoTag && infoTag.textContent?.trim() === 'UP主') {
        const staffLink = staffInfo.querySelector('a[href*="space.bilibili.com"]') as HTMLAnchorElement
        if (staffLink && staffLink.href) {
          return staffLink
        }
      }
    }
  }

  // 如果在 up-panel-container 中没找到，查找 video-staffs-container 容器
  const videoStaffsContainer = document.querySelector('.video-staffs-container')
  if (videoStaffsContainer) {
    // 查找带有 info-title 为 "UP主" 的 video-staffs-info 结构
    const staffInfos = videoStaffsContainer.querySelectorAll('.video-staffs-info[href*="space.bilibili.com"]')
    for (let i = 0; i < staffInfos.length; i++) {
      const staffInfo = staffInfos[i] as HTMLAnchorElement
      const infoTitle = staffInfo.querySelector('.info-title')
      if (infoTitle && infoTitle.textContent?.trim() === 'UP主') {
        return staffInfo
      }
    }
  }

  // 如果都没找到，回退到原来的查找方式
  const upLinkElement = document.querySelector('.up-name[href*="space.bilibili.com"]') as HTMLAnchorElement
  if (upLinkElement && upLinkElement.href) {
    return upLinkElement
  }

  return null
}

// 从链接中提取UID
function extractUidFromHref(href: string): string | null {
  const uidMatch = href.match(/space\.bilibili\.com\/(\d+)/)
  return uidMatch ? uidMatch[1] : null
}

// 从元素中提取名称
function extractNameFromElement(element: HTMLElement): string | null {
  // 优先查找 .info-name 元素（适用于 video-staffs-info 结构）
  const infoNameElement = element.querySelector('.info-name')
  if (infoNameElement && infoNameElement.textContent) {
    return infoNameElement.textContent.trim() || null
  }

  // 如果没有 .info-name，使用原有逻辑
  if (!element.textContent) {
    return null
  }

  let name = element.textContent.trim()

  // 如果存在mask元素，需要去除它的影响
  const maskElement = element.querySelector('.mask')
  if (maskElement && maskElement.textContent) {
    name = name.replace(maskElement.textContent.trim(), '').trim()
  }

  return name || null
}

// 获取UP主的uid
export function getUpUid(): string | null {
  const upElement = findUpElement()
  return upElement ? extractUidFromHref(upElement.href) : null
}

// 获取UP主的名字
export function getUpName(): string | null {
  const upElement = findUpElement()
  return upElement ? extractNameFromElement(upElement) : null
}

// 获取UP主完整信息
export function getUpInfo(): { uid: string | null, name: string | null } {
  const upElement = findUpElement()
  if (upElement) {
    return {
      uid: extractUidFromHref(upElement.href),
      name: extractNameFromElement(upElement),
    }
  }

  return {
    uid: null,
    name: null,
  }
}

// 获取当前音量 (0-100)
export function getCurrentVolume(): number {
  const video = getVideoElement()
  if (!video) {
    return 0
  }

  // 将0-1范围映射到0-100
  return Math.round(video.volume * 100)
}

// 设置音量 (0-100)
export function setVolume(volume: number, showStatus = false): boolean {
  const video = getVideoElement()
  if (!video) {
    return false
  }

  // 确保音量在有效范围内
  const clampedVolume = Math.max(0, Math.min(100, volume))

  // 将0-100范围映射到0-1
  video.volume = clampedVolume / 100

  // 如果设置的音量大于0，取消静音状态
  if (clampedVolume > 0 && video.muted) {
    video.muted = false
  }

  // 根据参数决定是否显示音量状态
  if (showStatus) {
    showState(`音量 ${clampedVolume}%`)
  }

  return true
}

// 调整音量 (增加或减少指定数值)
export function adjustVolume(delta: number): boolean {
  const currentVolume = getCurrentVolume()
  const newVolume = currentVolume + delta
  return setVolume(newVolume, true)
}

// 为Window接口添加自定义属性
declare global {
  interface Window {
    _bewlyScreenshotLink?: HTMLAnchorElement
    _bewlyScreenshotCanvas?: HTMLCanvasElement
  }
}
