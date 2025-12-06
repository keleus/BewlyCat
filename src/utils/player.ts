// 更完善的播放器元素选择器
import { settings } from '~/logic'
import type { AutoPlayMode } from '~/logic/storage'

import { applyVolumeNormalization } from './audioNormalization'

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
  subtitle:
      '.video-pod__item.active>.title,.multip-list-item.multip-list-item-active',
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
    stateElement.style.cssText = 'display: none; position: absolute; z-index: 99; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 8px 12px; background-color: rgba(8, 8, 8, 0.75); color: white; font-size: 22px; border-radius: 4px;'
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

// 应用播放器辅助功能（音量均衡、倍速记忆等）
function applyPlayerEnhancements() {
  applyVolumeNormalization()
  applyRememberedPlaybackRate()
  startPlaybackRateMonitoring()
}

export function fullscreen() {
  new RetryTask(20, 500, () => {
    const result = fullscreenClick()
    if (result) {
      // 在成功进入全屏后应用音量均衡和倍速记忆
      setTimeout(() => {
        applyPlayerEnhancements()
      }, 1000)
    }
    return result
  }).start()
}

export function webFullscreen() {
  new RetryTask(20, 500, () => {
    // 检查是否已经处于网页全屏状态
    if (document.querySelector('[data-screen=\'web\']')) {
      // 即使已经是网页全屏状态，也应用音量均衡和倍速记忆
      setTimeout(() => {
        applyPlayerEnhancements()
      }, 1000)
      return true
    }

    const result = webFullscreenClick()
    if (result) {
      // 在成功进入网页全屏后应用音量均衡和倍速记忆
      setTimeout(() => {
        applyPlayerEnhancements()
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
      // 即使已经是宽屏状态，也执行滚动、音量均衡和倍速记忆
      scrollPlayerToOptimalPosition()
      setTimeout(() => {
        applyPlayerEnhancements()
      }, 1000)
      return true
    }

    const result = widescreenClick()
    if (result) {
      scrollPlayerToOptimalPosition()
      // 在成功进入宽屏后应用音量均衡和倍速记忆
      setTimeout(() => {
        applyPlayerEnhancements()
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

// 默认模式下也执行滚动、音量均衡和倍速记忆
export function defaultMode() {
  scrollPlayerToOptimalPosition()
  // 在默认模式下也应用音量均衡和倍速记忆
  setTimeout(() => {
    applyPlayerEnhancements()
  }, 2000) // 默认模式延迟稍长一些，确保页面完全加载
  return true
}

// 根据设置应用默认弹幕状态
export function applyDefaultDanmakuState() {
  const preference = settings.value.defaultDanmakuState
  if (!preference || preference === 'system')
    return

  const shouldEnable = preference === 'on'

  new RetryTask(20, 500, () => {
    const danmuSwitch = document.querySelector(_videoClassTag.danmuBtn) as HTMLInputElement | null
    if (!danmuSwitch)
      return false

    if (danmuSwitch.checked === shouldEnable)
      return true

    const clickableParent = danmuSwitch.closest('label')
      || (danmuSwitch.parentElement instanceof HTMLElement ? danmuSwitch.parentElement : null)

    if (clickableParent)
      clickableParent.click()
    else
      danmuSwitch.click()

    if (danmuSwitch.checked !== shouldEnable) {
      danmuSwitch.checked = shouldEnable
      danmuSwitch.dispatchEvent(new Event('change', { bubbles: true }))
    }

    return danmuSwitch.checked === shouldEnable
  }).start()
}

// 检测是否为合集视频
export function isCollectionVideo(): boolean {
  // 检测多P视频选集
  const episodes = document.querySelectorAll('.video-pod__item')
  if (episodes.length > 0) {
    return true
  }

  // 检测多P视频的其他容器
  const multiPageItems = document.querySelectorAll('.multi-page__item, .page-item')
  if (multiPageItems.length > 0) {
    return true
  }

  // 检测合集视频容器
  const videoSectionsContainer = document.querySelector('.video-sections-content-list, .base-video-sections-v1, .video-sections-v1')
  if (videoSectionsContainer) {
    return true
  }

  // 检测其他可能的选集容器，但排除推荐列表区域
  const otherEpisodes = document.querySelectorAll('.list-item, .episode-item, .section-item, .collect-item')
  const hasVideoLinks = Array.from(otherEpisodes).some((item) => {
    // 排除推荐列表和相关推荐区域
    const isInRecommendArea = (item as Element).closest('.recommend-list-v1, .rec-list, .next-play, .video-page-card-small, .recommend-list')
    if (isInRecommendArea) {
      return false
    }

    const link = item.querySelector('a[href*="/video/"]')
    return link !== null
  })

  return hasVideoLinks
}

// 检测自动连播是否开启
export function isAutoPlayEnabled(): boolean {
  // 查找自动连播开关按钮（on状态）
  const autoPlaySwitchOn = document.querySelector(_videoClassTag.autoPlaySwitchOn)
  return autoPlaySwitchOn !== null
}

// 视频类型枚举
export enum VideoType {
  MULTIPART = 'multipart', // 分P视频
  COLLECTION = 'collection', // 合集视频
  RECOMMEND = 'recommend', // 单视频推荐
  PLAYLIST = 'playlist', // 收藏列表
}

// 检测当前视频类型
export function detectVideoType(): VideoType {
  // 检测是否为收藏列表
  if (/https?:\/\/(?:www\.)?bilibili\.com\/list\//.test(location.href)) {
    return VideoType.PLAYLIST
  }

  // 检测多P视频和合集视频的关键区别：
  // 分P视频有 .view-mode 切换视图组件，合集视频没有
  const hasViewMode = !!document.querySelector('.view-mode')
  const hasVideoPod = !!document.querySelector('.video-pod__item, .multi-page__item, .page-item')

  if (hasVideoPod) {
    // 有视频列表项
    if (hasViewMode) {
      // 有切换视图组件 = 分P视频
      return VideoType.MULTIPART
    }
    else {
      // 没有切换视图组件 = 合集视频
      return VideoType.COLLECTION
    }
  }

  // 尝试从页面中获取视频数据（备用方案）
  const app = document.querySelector('#app') as any
  if (app?.__vue__) {
    const videoData = app.__vue__.videoData
    if (videoData) {
      const { videos: videosCount } = videoData
      const isSection = app.__vue__.isSection

      // 分P视频：videos > 1
      if (videosCount > 1) {
        return VideoType.MULTIPART
      }
      // 合集视频：isSection = true
      if (isSection) {
        return VideoType.COLLECTION
      }
    }
  }

  // 如果以上都不是，检测是否为合集视频（通过DOM）
  if (isCollectionVideo()) {
    return VideoType.COLLECTION
  }

  // 默认为单视频推荐
  return VideoType.RECOMMEND
}

// 查找自动播放开关按钮（支持多种 DOM 结构）
function findAutoPlaySwitchButton(): { button: HTMLElement, isOn: boolean } | null {
  // 尝试多种可能的选择器
  const selectors = [
    // 新版 B站
    { container: '.auto-play', switchOn: '.switch-btn.on', switchOff: '.switch-btn:not(.on)' },
    // 旧版 B站
    { container: '.continuous-btn', switchOn: '.switch-btn.on', switchOff: '.switch-btn:not(.on)' },
    // 备用：直接查找开关
    { container: null, switchOn: '.switch-btn.on', switchOff: '.switch-btn:not(.on)' },
  ]

  for (const selector of selectors) {
    let searchRoot: Element | Document = document

    // 如果指定了容器，先查找容器
    if (selector.container) {
      const container = document.querySelector(selector.container)
      if (!container) {
        continue
      }
      searchRoot = container
    }

    // 在容器内查找开关按钮
    const switchOnBtn = searchRoot.querySelector(selector.switchOn) as HTMLElement
    const switchOffBtn = searchRoot.querySelector(selector.switchOff) as HTMLElement

    if (switchOnBtn) {
      return { button: switchOnBtn, isOn: true }
    }
    if (switchOffBtn) {
      return { button: switchOffBtn, isOn: false }
    }
  }

  return null
}

// 设置单集循环状态
export function setLoopState(enable: boolean) {
  new RetryTask(30, 500, () => {
    // 查找单集循环开关
    const loopCheckbox = document.querySelector(
      '.bpx-player-ctrl-setting-loop input[type=checkbox]',
    ) as HTMLInputElement | null

    if (!loopCheckbox) {
      return false
    }

    // 如果当前状态与目标状态不一致，则切换
    if (loopCheckbox.checked !== enable) {
      // B站的单集循环使用了 Vue/React，直接点击不会触发状态更新
      // 需要直接设置 checked 属性并触发 change 事件
      loopCheckbox.checked = enable
      loopCheckbox.dispatchEvent(new Event('change', { bubbles: true }))
    }

    return loopCheckbox.checked === enable
  }).start()
}

// 用户手动修改自动播放状态的标志
let userManuallyChangedAutoPlay = false

// 监听用户手动修改自动播放状态
export function startAutoPlayUserChangeMonitoring() {
  // 使用事件委托监听点击
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    // 检查是否点击了自动播放开关
    const switchBtn = target.closest('.auto-play .switch-btn, .continuous-btn .switch-btn')
    if (switchBtn) {
      userManuallyChangedAutoPlay = true
    }
  }, true)
}

// 重置用户手动修改标志(在页面导航时调用)
export function resetAutoPlayUserChangeFlag() {
  userManuallyChangedAutoPlay = false
}

// 设置自动播放状态
function setAutoPlayState(enable: boolean) {
  new RetryTask(30, 500, () => {
    const result = findAutoPlaySwitchButton()

    if (!result) {
      return false
    }

    const { button, isOn } = result

    // 如果当前状态与目标状态不一致，则切换
    if (isOn !== enable) {
      button.click()
    }

    return true
  }).start()
}

// 设置收藏列表的播放方式（自动切集或播完暂停）
function setPlaylistHandoffMode(enable: boolean) {
  // 如果启用自动切集，需要先关闭单集循环（单集循环优先级更高）
  if (enable) {
    setLoopState(false)
  }

  new RetryTask(30, 500, () => {
    // 自动切集的 radio value 是 "0"，播完暂停的 value 是 "2"
    const targetValue = enable ? '0' : '2'
    const targetRadio = document.querySelector(
      `.bpx-player-ctrl-setting-handoff input[type=radio][value="${targetValue}"]`,
    ) as HTMLInputElement | null

    if (!targetRadio) {
      return false
    }

    // 如果目标按钮未选中，则设置为选中
    if (!targetRadio.checked) {
      targetRadio.checked = true
      targetRadio.dispatchEvent(new Event('change', { bubbles: true }))
    }

    return targetRadio.checked
  }).start()
}

// 根据视频类型和设置应用自动连播状态
export function applyAutoPlayByVideoType() {
  // 如果启用了B站默认自动播放行为，不进行任何操作
  if (settings.value.useBilibiliDefaultAutoPlay) {
    return
  }

  // 如果用户手动修改过自动播放状态,跳过自动应用
  if (userManuallyChangedAutoPlay) {
    return
  }

  const videoType = detectVideoType()
  let mode: AutoPlayMode = 'default'

  // 根据视频类型获取对应的设置
  switch (videoType) {
    case VideoType.MULTIPART:
      mode = settings.value.autoPlayMultipart
      break
    case VideoType.COLLECTION:
      mode = settings.value.autoPlayCollection
      break
    case VideoType.RECOMMEND:
      mode = settings.value.autoPlayRecommend
      break
    case VideoType.PLAYLIST:
      mode = settings.value.autoPlayPlaylist
      break
  }

  // 收藏列表使用特殊的播放方式控制（自动切集/播完暂停）
  if (videoType === VideoType.PLAYLIST) {
    switch (mode) {
      case 'autoPlay':
        // 开启自动切集
        setPlaylistHandoffMode(true)
        break
      case 'pauseAtEnd':
        // 开启播完暂停
        setPlaylistHandoffMode(false)
        break
      case 'loop':
        // 收藏列表不支持单集循环，使用播完暂停代替
        setPlaylistHandoffMode(false)
        break
    }
    return
  }

  // 其他类型视频使用原有的自动播放和循环控制
  switch (mode) {
    case 'autoPlay':
      // 开启自动连播，确保关闭单集循环
      setLoopState(false)
      setAutoPlayState(true)
      break
    case 'pauseAtEnd':
      // 关闭自动连播，确保关闭单集循环
      setLoopState(false)
      setAutoPlayState(false)
      break
    case 'loop':
      // 先开启单集循环，再关闭自动连播
      setLoopState(true)
      setAutoPlayState(false)
      break
  }
}

// 播放/暂停
export function playPause(player?: Element) {
  // 如果提供了player参数，优先使用
  if (player) {
    const playBtn = player.querySelector(_videoClassTag.playBtn)
    if (playBtn) {
      (playBtn as HTMLElement).click()
      return
    }
  }

  // 如果没有player参数或者找不到播放按钮，尝试自动查找播放器
  const autoPlayer = document.querySelector(_videoClassTag.player)
  if (autoPlayer) {
    const playBtn = autoPlayer.querySelector(_videoClassTag.playBtn)
    if (playBtn) {
      (playBtn as HTMLElement).click()
      return
    }
  }

  // 最后备用方案：直接操作视频元素
  const video = getVideoElement()
  if (video) {
    if (video.paused)
      video.play()
    else
      video.pause()
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
  const closeSwitch = document.querySelector<HTMLElement>('.bpx-player-ctrl-subtitle-close-switch')
  const languageItem = document.querySelector<HTMLElement>('.bpx-player-ctrl-subtitle-language-item')

  if (closeSwitch && languageItem) {
    const isClosed = closeSwitch.classList.contains('bpx-state-active')
    if (isClosed) {
      languageItem.click()
    }
    else {
      closeSwitch.click()
    }
    return
  }

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
    return
  }

  captionBtn = document.querySelector('.bpx-player-ctrl-subtitle span')
  if (captionBtn) {
    (captionBtn as HTMLElement).click()
    return
  }

  const subtitleWrap = document.querySelector('.squirtle-subtitle-wrap')
  if (subtitleWrap && subtitleWrap.firstElementChild) {
    (subtitleWrap.firstElementChild as HTMLElement).click()
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

// 应用记住的倍速
export function applyRememberedPlaybackRate() {
  if (!settings.value.rememberPlaybackRate) {
    return
  }

  const video = getVideoElement()
  if (!video) {
    // 如果视频元素还没有加载，延迟重试
    setTimeout(() => applyRememberedPlaybackRate(), 1000)
    return
  }

  // 确保倍速值在有效范围内
  const savedRate = settings.value.savedPlaybackRate
  if (savedRate >= 0.25 && savedRate <= 5) {
    video.playbackRate = savedRate
    // 只在倍速不是1时显示状态
    if (savedRate !== 1) {
      showState(`倍速 ${savedRate}`)
    }
  }
}

// 监听播放器倍速变化并记录（监听所有倍速变化，包括播放器UI操作）
export function startPlaybackRateMonitoring() {
  if (!settings.value.rememberPlaybackRate) {
    return
  }

  const video = getVideoElement()
  if (!video) {
    // 如果视频元素还没有加载，延迟重试
    setTimeout(() => startPlaybackRateMonitoring(), 1000)
    return
  }

  // 避免重复添加监听器
  if (video.hasAttribute('bewly-rate-listener')) {
    return
  }
  video.setAttribute('bewly-rate-listener', 'true')

  // 监听倍速变化事件，这会捕获所有倍速变化（包括UI操作）
  video.addEventListener('ratechange', () => {
    if (settings.value.rememberPlaybackRate) {
      const currentRate = video.playbackRate
      // 确保倍速值在有效范围内
      if (currentRate >= 0.25 && currentRate <= 5) {
        settings.value.savedPlaybackRate = currentRate
      }
    }
  })
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
    titleElement.style.cssText = 'display: none; position: absolute; z-index: 99; top: 0px; left: 50%; transform: translateX(-50%); padding: 4px 8px; background-color: rgba(8, 8, 8, 0.75); color: white; font-size: 22px;'
  }

  const stateContainer = document.querySelector(_videoClassTag.state)
  const titleElement2 = document.querySelector(_videoClassTag.title)
  const subtitleElement = document.querySelector(_videoClassTag.subtitle)

  if (stateContainer && titleElement2 && titleElement2.textContent) {
    if (stateContainer.parentElement !== titleElement.parentElement) {
      stateContainer.parentElement!.appendChild(titleElement)
      titleElement.style.display = 'none'
    }

    if (titleElement.style.display === 'none') {
      if (subtitleElement && subtitleElement.getAttribute('title'))
        titleElement.textContent = `${titleElement2.textContent} - ${subtitleElement.getAttribute('title')}`
      else
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
    timeElement.style.cssText = 'display: none; position: absolute; z-index: 99; bottom: 55px; right: 20px; padding: 4px 8px; background-color: rgba(8, 8, 8, 0.75); color: white; font-size: 16px; border-radius: 4px;'
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
    clockElement.style.cssText = 'display: none; position: absolute; z-index: 99; top: 10px; right: 20px; padding: 4px 8px; background-color: rgba(8, 8, 8, 0.75); color: white; font-size: 16px; border-radius: 4px;'
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

// 检查是否为互动视频
export function isInteractiveVideo(): boolean {
  try {
    // 方法1: 检查页面DOM中是否存在互动视频的选择问题容器
    const interactionQuestion = document.querySelector('.bpx-player-interaction-question')
    if (interactionQuestion) {
      return true
    }

    // 方法2: 检查URL中是否包含互动视频的参数
    const url = window.location.href
    if (url.includes('?') && (url.includes('edge_id=') || url.includes('graph_version='))) {
      return true
    }

    // 方法3: 检查页面中是否有互动视频的标识元素
    const interactiveBtn = document.querySelector('.bpx-player-ctrl-btn[aria-label*="互动"]')
    if (interactiveBtn) {
      return true
    }

    return false
  }
  catch (error) {
    console.error('检查互动视频时出错:', error)
    return false
  }
}

// 检查结束面板的下一个视频是否为推广视频（非分P/合集内视频）
// 仅在分P视频和合集视频中生效
function checkAndCancelAutoPlayForRecommendation() {
  // 检测当前视频类型,只在分P和合集视频中生效
  const videoType = detectVideoType()
  if (videoType !== VideoType.MULTIPART && videoType !== VideoType.COLLECTION) {
    return
  }

  // 查找结束面板中的推荐视频标题
  const endingPanelTitle = document.querySelector('.bpx-player-ending-related-item-title')
  if (!endingPanelTitle || !endingPanelTitle.textContent) {
    return
  }

  const endingVideoTitle = endingPanelTitle.textContent.trim()

  // 查找页面推广位的视频标题
  const recommendCards = document.querySelectorAll('.video-page-card-small .title')
  if (recommendCards.length === 0) {
    return
  }

  // 检查结束面板的视频标题是否与任何推广位视频匹配
  let isRecommendedVideo = false
  for (const card of Array.from(recommendCards)) {
    const cardTitle = card.textContent?.trim()
    if (cardTitle && cardTitle === endingVideoTitle) {
      isRecommendedVideo = true
      break
    }
  }

  // 如果是推广视频，点击取消连播按钮
  if (isRecommendedVideo) {
    const cancelButton = document.querySelector('.bpx-player-ending-related-item-cancel') as HTMLElement
    if (cancelButton) {
      cancelButton.click()
    }
  }
}

// 监听视频结束事件并自动退出全屏
export function startAutoExitFullscreenMonitoring() {
  const video = getVideoElement()
  if (!video) {
    // 如果视频元素还没有加载，延迟重试
    setTimeout(() => startAutoExitFullscreenMonitoring(), 1000)
    return
  }

  // 避免重复添加监听器
  if (video.hasAttribute('bewly-auto-exit-listener')) {
    return
  }
  video.setAttribute('bewly-auto-exit-listener', 'true')

  // 监听视频结束事件
  video.addEventListener('ended', async () => {
    // 如果是互动视频，不处理（因为URL变化会由pushstate处理）
    if (isInteractiveVideo()) {
      return
    }

    // 检查是否应该取消自动连播（针对推广视频）
    // 延迟检查，等待结束面板完全渲染
    setTimeout(() => {
      checkAndCancelAutoPlayForRecommendation()
    }, 1500)

    // 非互动视频且开启了自动退出全屏
    if (settings.value.autoExitFullscreenOnEnd) {
      // 如果开启了自动连播下除外选项，并且当前自动连播已开启，则不自动退出
      if (settings.value.autoExitFullscreenExcludeAutoPlay && isAutoPlayEnabled()) {
        return
      }

      // 如果启用了随机播放功能，并且随机播放已激活，也不自动退出
      if (settings.value.enableRandomPlay) {
        const { isRandomPlayActive } = await import('~/utils/randomPlay')
        if (isRandomPlayActive()) {
          return
        }
      }

      // 检查是否处于全屏状态
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        // 退出浏览器全屏
        if (document.exitFullscreen) {
          document.exitFullscreen()
        }
        else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen()
        }
      }

      // 检查是否处于网页全屏状态
      const webFullscreenBtn = document.querySelector(_videoClassTag.pagefullscreen) as HTMLElement
      if (webFullscreenBtn && webFullscreenBtn.classList.contains('bpx-state-entered')) {
        webFullscreenBtn.click()
      }
    }
  })
}

// 为Window接口添加自定义属性
declare global {
  interface Window {
    _bewlyScreenshotLink?: HTMLAnchorElement
    _bewlyScreenshotCanvas?: HTMLCanvasElement
    bewlyPlayer: {
      adjustVolume: (delta: number) => boolean
    }
  }
}
