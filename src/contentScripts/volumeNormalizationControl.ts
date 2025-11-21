import { watch } from 'vue'

import { settings } from '~/logic'

import { isTempDisabled, setTempDisabled } from './audioInterceptor'

// 均衡器图标 SVG - 匹配B站播放器 88x88 viewBox
const equalizerIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" style="width: 100%; height: 100%;">
  <rect x="22" y="44" width="8" height="24" rx="2" fill="#fff"/>
  <rect x="40" y="24" width="8" height="44" rx="2" fill="#fff"/>
  <rect x="58" y="34" width="8" height="34" rx="2" fill="#fff"/>
</svg>`

// 均衡器禁用图标 SVG
const equalizerOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" style="width: 100%; height: 100%;">
  <rect x="22" y="44" width="8" height="24" rx="2" fill="#fff" opacity="0.4"/>
  <rect x="40" y="24" width="8" height="44" rx="2" fill="#fff" opacity="0.4"/>
  <rect x="58" y="34" width="8" height="34" rx="2" fill="#fff" opacity="0.4"/>
  <line x1="20" y1="20" x2="68" y2="68" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
</svg>`

let controlContainer: HTMLElement | null = null
let volumeSlider: HTMLInputElement | null = null
let isInjected = false

// 创建控件容器
function createControlContainer(): HTMLElement {
  // 使用B站播放器原生的类名和结构
  const container = document.createElement('div')
  container.className = 'bpx-player-ctrl-btn bewly-volume-normalization-control'
  container.setAttribute('role', 'button')
  container.setAttribute('aria-label', '音量均衡')
  container.setAttribute('tabindex', '0')

  // 创建图标按钮 - 使用B站原生结构
  const iconBtn = document.createElement('div')
  iconBtn.className = 'bpx-player-ctrl-btn-icon bewly-vn-icon'

  const iconSpan = document.createElement('span')
  iconSpan.className = 'bpx-common-svg-icon'
  iconSpan.innerHTML = equalizerIcon
  iconBtn.appendChild(iconSpan)

  iconBtn.title = '音量均衡'

  // 创建滑块容器（悬停显示）- 模仿B站 bpx-player-ctrl-volume-box
  const sliderWrap = document.createElement('div')
  sliderWrap.className = 'bewly-vn-slider-wrap'
  sliderWrap.style.cssText = `
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(21, 21, 21, 0.9);
    border-radius: 2px;
    padding: 10px 15px 14px;
    display: none;
    flex-direction: column;
    align-items: center;
    z-index: 100;
  `

  // 创建音量数值显示 - 模仿 bpx-player-ctrl-volume-number
  const valueDisplay = document.createElement('div')
  valueDisplay.className = 'bewly-vn-value'
  valueDisplay.style.cssText = `
    color: #fff;
    font-size: 12px;
    line-height: 18px;
    text-align: center;
    margin-bottom: 4px;
  `
  valueDisplay.textContent = `${settings.value.targetVolume}`

  // 创建滑块 - 模仿B站 bui-slider bui-track-vertical 结构
  const trackHeight = 100
  const sliderContainer = document.createElement('div')
  sliderContainer.className = 'bewly-vn-slider-container'
  sliderContainer.style.cssText = `
    position: relative;
    width: 32px;
    height: ${trackHeight}px;
    display: flex;
    justify-content: center;
  `

  // 轨道
  const track = document.createElement('div')
  track.className = 'bewly-vn-track'
  track.style.cssText = `
    position: relative;
    width: 2px;
    height: 100%;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 1px;
  `

  // bui-bar-wrap + bui-bar
  const barWrap = document.createElement('div')
  barWrap.style.cssText = `
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 1px;
  `

  const bar = document.createElement('div')
  bar.className = 'bewly-vn-bar'
  bar.style.cssText = `
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    background: var(--bew-theme-color, #00a1d6);
    border-radius: 1px;
    transform-origin: bottom;
  `
  bar.style.transform = `scaleY(${settings.value.targetVolume / 100})`

  barWrap.appendChild(bar)
  track.appendChild(barWrap)

  // bui-thumb + bui-thumb-dot - 手柄底部在进度条顶端
  const thumb = document.createElement('div')
  thumb.className = 'bewly-vn-thumb'
  thumb.style.cssText = `
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 12px;
    height: 12px;
  `
  // 手柄底部对齐进度条顶端
  thumb.style.bottom = `${settings.value.targetVolume}%`

  const thumbDot = document.createElement('div')
  thumbDot.className = 'bewly-vn-thumb-dot'
  thumbDot.style.cssText = `
    width: 12px;
    height: 12px;
    background: var(--bew-theme-color, #00a1d6);
    border-radius: 50%;
  `
  thumb.appendChild(thumbDot)

  sliderContainer.appendChild(track)
  sliderContainer.appendChild(thumb)

  // 隐藏的原生滑块用于交互
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = '100'
  slider.value = String(settings.value.targetVolume)
  slider.className = 'bewly-vn-slider'
  slider.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    writing-mode: vertical-lr;
    direction: rtl;
  `

  sliderContainer.appendChild(slider)

  // 滑块样式
  const styleEl = document.createElement('style')
  styleEl.textContent = `
    .bewly-volume-normalization-control:hover .bewly-vn-slider-wrap {
      display: flex !important;
    }
    .bewly-volume-normalization-control .bewly-vn-icon.disabled {
      opacity: 0.35 !important;
    }
  `
  document.head.appendChild(styleEl)

  // 滑块事件 - 同步更新视觉元素
  slider.addEventListener('input', () => {
    const value = Number(slider.value)
    settings.value.targetVolume = value
    valueDisplay.textContent = `${value}`
    bar.style.transform = `scaleY(${value / 100})`
    thumb.style.bottom = `${value}%`
  })

  // 阻止滑块区域的点击事件冒泡，避免触发开关
  sliderWrap.addEventListener('click', (e) => {
    e.stopPropagation()
  })

  // 图标点击事件（临时禁用/启用）
  container.addEventListener('click', () => {
    const newDisabled = !isTempDisabled()
    setTempDisabled(newDisabled)
    updateIconState(iconBtn, iconSpan, newDisabled)
  })

  sliderWrap.appendChild(valueDisplay)
  sliderWrap.appendChild(sliderContainer)
  container.appendChild(iconBtn)
  container.appendChild(sliderWrap)

  volumeSlider = slider

  return container
}

// 更新图标状态
function updateIconState(iconBtn: HTMLElement, iconSpan: HTMLElement, disabled: boolean) {
  if (disabled) {
    iconSpan.innerHTML = equalizerOffIcon
    iconBtn.classList.add('disabled')
    iconBtn.title = '音量均衡（已禁用，点击启用）'
  }
  else {
    iconSpan.innerHTML = equalizerIcon
    iconBtn.classList.remove('disabled')
    iconBtn.title = '音量均衡（点击临时禁用）'
  }
}

// 查找播放器控制栏
function findPlayerControlBar(): HTMLElement | null {
  // 新版播放器控制栏
  const controlBar = document.querySelector('.bpx-player-control-bottom-right')
  if (controlBar)
    return controlBar as HTMLElement

  // 旧版播放器控制栏
  const oldControlBar = document.querySelector('.bilibili-player-video-btn-quality')
  if (oldControlBar?.parentElement)
    return oldControlBar.parentElement as HTMLElement

  return null
}

// 注入控件
function injectControl() {
  if (isInjected || !settings.value.enableVolumeNormalization)
    return

  const controlBar = findPlayerControlBar()
  if (!controlBar)
    return

  // 检查是否已存在
  if (controlBar.querySelector('.bewly-volume-normalization-control'))
    return

  // 等待音量按钮加载完成，确保播放器控制栏已完全初始化
  const volumeBtn = controlBar.querySelector('.bpx-player-ctrl-volume')
  if (!volumeBtn) {
    return
  }

  // 检查音量按钮是否已渲染完成（包含图标）
  const volumeIcon = volumeBtn.querySelector('.bpx-player-ctrl-btn-icon')
  if (!volumeIcon) {
    return
  }

  controlContainer = createControlContainer()

  // 在音量按钮后面插入
  if (volumeBtn.nextSibling) {
    controlBar.insertBefore(controlContainer, volumeBtn.nextSibling)
  }
  else {
    controlBar.appendChild(controlContainer)
  }

  isInjected = true
  console.log('[BewlyAudio] Volume normalization control injected')
}

// 移除控件
function removeControl() {
  if (controlContainer && controlContainer.parentElement) {
    controlContainer.parentElement.removeChild(controlContainer)
  }
  controlContainer = null
  volumeSlider = null
  isInjected = false
}

// 初始化
export function initVolumeNormalizationControl() {
  // 检查是否为直播页面
  if (location.hostname.includes('live.bilibili.com'))
    return

  // 监听设置变化
  watch(() => settings.value.enableVolumeNormalization, (enabled) => {
    if (enabled) {
      injectControl()
    }
    else {
      removeControl()
    }
  }, { immediate: true })

  // 监听目标音量变化，更新滑块
  watch(() => settings.value.targetVolume, (newValue) => {
    if (volumeSlider && controlContainer) {
      volumeSlider.value = String(newValue)
      const valueDisplay = controlContainer.querySelector('.bewly-vn-value')
      const bar = controlContainer.querySelector('.bewly-vn-bar') as HTMLElement
      const thumb = controlContainer.querySelector('.bewly-vn-thumb') as HTMLElement
      if (valueDisplay) {
        valueDisplay.textContent = `${newValue}`
      }
      if (bar) {
        bar.style.transform = `scaleY(${newValue / 100})`
      }
      if (thumb) {
        thumb.style.bottom = `${newValue}%`
      }
    }
  })

  // 定期检查并注入（处理 SPA 页面切换）
  let lastUrl = location.href
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      isInjected = false
    }

    if (settings.value.enableVolumeNormalization && !isInjected) {
      injectControl()
    }
  }, 2000)
}
