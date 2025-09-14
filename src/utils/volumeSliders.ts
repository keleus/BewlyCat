import { settings } from '~/logic'
import { t } from '~/utils/dataFormatter'

import { getUpInfo, setVolume } from './player'
import { getUpVolumeConfig, removeUpVolumeConfig, saveUpVolumeConfig } from './volumeBalance'

let volumeSlidersContainer: HTMLElement | null = null
let upVolumeSlider: HTMLInputElement | null = null
let baseVolumeSlider: HTMLInputElement | null = null
let isUpdatingSliders = false
let hideTimeout: ReturnType<typeof setTimeout> | null = null

// 更新基准音量进度条
function updateBaseVolumeProgress(slider: HTMLInputElement, value: number) {
  const progress = (value / 100) * 100
  slider.style.setProperty('--progress', `${progress}%`)
}

// 更新UP主音量进度条
function updateUpVolumeProgress(slider: HTMLInputElement, value: number) {
  // UP主音量是-100到100，需要转换为0到100的进度
  const normalizedValue = (value + 100) / 2
  const progress = (normalizedValue / 100) * 100

  // 根据值的正负设置不同的颜色
  if (value < 0) {
    // 负值：红色区域从当前位置到中间（50%）
    slider.style.background = `linear-gradient(to right, 
      #3a3a3a 0%, 
      #3a3a3a ${progress}%, 
      #ff4757 ${progress}%, 
      #ff4757 50%, 
      #3a3a3a 50%, 
      #3a3a3a 100%)`
  }
  else if (value > 0) {
    // 正值：绿色区域从中间（50%）到当前位置
    slider.style.background = `linear-gradient(to right, 
      #3a3a3a 0%, 
      #3a3a3a 50%, 
      #2ed573 50%, 
      #2ed573 ${progress}%, 
      #3a3a3a ${progress}%, 
      #3a3a3a 100%)`
  }
  else {
    // 零值：中性，在中间显示主题色标记
    slider.style.background = `linear-gradient(to right, 
      #3a3a3a 0%, 
      #3a3a3a 49%, 
      var(--bew-theme-color) 49%, 
      var(--bew-theme-color) 51%, 
      #3a3a3a 51%, 
      #3a3a3a 100%)`
  }
}

// 创建音量滑动条容器
function createVolumeSlidersContainer(): HTMLElement {
  const container = document.createElement('div')
  container.className = 'bewly-volume-sliders'
  container.style.cssText = `
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(20, 20, 20, 0.9);
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 6px;
    min-width: 160px;
    color: white;
    font-size: 12px;
    z-index: 99;
    display: none;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  `

  // UP主音量滑动条
  const upVolumeSection = document.createElement('div')
  upVolumeSection.style.cssText = 'margin-bottom: 12px;'

  const upVolumeLabel = document.createElement('div')
  upVolumeLabel.textContent = t('settings.volume_balance.up_volume')
  upVolumeLabel.style.cssText = 'margin-bottom: 6px; font-weight: bold; font-size: 11px;'

  const upVolumeSliderContainer = document.createElement('div')
  upVolumeSliderContainer.style.cssText = 'position: relative;'

  upVolumeSlider = document.createElement('input')
  upVolumeSlider.type = 'range'
  upVolumeSlider.min = '-100'
  upVolumeSlider.max = '100'
  upVolumeSlider.value = '0'
  upVolumeSlider.className = 'up-volume-slider'
  upVolumeSlider.style.cssText = `
    width: 100%;
    height: 4px;
    outline: none;
    border-radius: 2px;
    appearance: none;
    cursor: pointer;
  `

  // 添加滑动条样式
  const style = document.createElement('style')
  style.textContent = `
    .bewly-volume-sliders input[type="range"] {
      position: relative;
    }
    
    .bewly-volume-sliders input[type="range"]::-webkit-slider-thumb {
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--bew-theme-color);
      cursor: pointer;
      border: none;
      box-shadow: 0 2px 6px var(--bew-theme-color-30);
      transition: all 0.2s ease;
    }
    
    .bewly-volume-sliders input[type="range"]::-webkit-slider-thumb:hover {
      background: var(--bew-theme-color-80);
      transform: scale(1.1);
      box-shadow: 0 3px 8px var(--bew-theme-color-50);
    }
    
    .bewly-volume-sliders input[type="range"]::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--bew-theme-color);
      cursor: pointer;
      border: none;
      box-shadow: 0 2px 6px var(--bew-theme-color-30);
      transition: all 0.2s ease;
    }
    
    .bewly-volume-sliders input[type="range"]::-moz-range-thumb:hover {
      background: var(--bew-theme-color-80);
      transform: scale(1.1);
      box-shadow: 0 3px 8px var(--bew-theme-color-50);
    }
    
    /* 为UP主音量滑动条添加进度条效果 */
    .bewly-volume-sliders .up-volume-slider {
      background: linear-gradient(to right, 
        #ff4757 0%, 
        #ff4757 calc(50% - 1px), 
        #3a3a3a calc(50% - 1px), 
        #3a3a3a calc(50% + 1px), 
        #2ed573 calc(50% + 1px), 
        #2ed573 100%);
    }
    
    /* 为基准音量滑动条添加进度条效果 */
    .bewly-volume-sliders .base-volume-slider {
      background: linear-gradient(to right, var(--bew-theme-color) 0%, var(--bew-theme-color) var(--progress), #3a3a3a var(--progress), #3a3a3a 100%);
    }
  `
  document.head.appendChild(style)

  const upVolumeValue = document.createElement('div')
  upVolumeValue.style.cssText = 'text-align: center; margin-top: 3px; font-size: 11px; color: #ccc;'
  upVolumeValue.textContent = '0%'

  upVolumeSliderContainer.appendChild(upVolumeSlider)
  upVolumeSliderContainer.appendChild(upVolumeValue)
  upVolumeSection.appendChild(upVolumeLabel)
  upVolumeSection.appendChild(upVolumeSliderContainer)

  // 基准音量滑动条
  const baseVolumeSection = document.createElement('div')

  const baseVolumeLabel = document.createElement('div')
  baseVolumeLabel.textContent = t('settings.volume_balance.base_volume')
  baseVolumeLabel.style.cssText = 'margin-bottom: 6px; font-weight: bold; font-size: 11px;'

  const baseVolumeSliderContainer = document.createElement('div')
  baseVolumeSliderContainer.style.cssText = 'position: relative;'

  baseVolumeSlider = document.createElement('input')
  baseVolumeSlider.type = 'range'
  baseVolumeSlider.min = '0'
  baseVolumeSlider.max = '100'
  baseVolumeSlider.value = settings.value.baseVolume.toString()
  baseVolumeSlider.className = 'base-volume-slider'
  baseVolumeSlider.style.cssText = `
    width: 100%;
    height: 4px;
    outline: none;
    border-radius: 2px;
    appearance: none;
    cursor: pointer;
  `

  // 设置初始进度
  updateBaseVolumeProgress(baseVolumeSlider, settings.value.baseVolume)

  const baseVolumeValue = document.createElement('div')
  baseVolumeValue.style.cssText = 'text-align: center; margin-top: 3px; font-size: 11px; color: #ccc;'
  baseVolumeValue.textContent = `${settings.value.baseVolume}%`

  baseVolumeSliderContainer.appendChild(baseVolumeSlider)
  baseVolumeSliderContainer.appendChild(baseVolumeValue)
  baseVolumeSection.appendChild(baseVolumeLabel)
  baseVolumeSection.appendChild(baseVolumeSliderContainer)

  container.appendChild(upVolumeSection)
  container.appendChild(baseVolumeSection)

  // 添加事件监听器
  upVolumeSlider.addEventListener('input', handleUpVolumeChange)
  baseVolumeSlider.addEventListener('input', handleBaseVolumeChange)

  return container
}

// 处理UP主音量变化
function handleUpVolumeChange() {
  if (!upVolumeSlider || isUpdatingSliders)
    return

  const upInfo = getUpInfo()
  if (!upInfo.uid || !upInfo.name)
    return

  const volumeOffset = Number.parseInt(upVolumeSlider.value)
  const upVolumeValue = upVolumeSlider.parentElement?.querySelector('div:last-child')

  if (upVolumeValue) {
    const sign = volumeOffset > 0 ? '+' : ''
    upVolumeValue.textContent = `${sign}${volumeOffset}%`
  }

  if (volumeOffset === 0) {
    // 如果偏移为0，删除配置
    removeUpVolumeConfig(upInfo.uid)
  }
  else {
    // 保存配置
    saveUpVolumeConfig(upInfo.uid, upInfo.name, volumeOffset)
  }

  // 更新UP主音量进度条
  updateUpVolumeProgress(upVolumeSlider, volumeOffset)

  // 实时应用音量
  applyVolumeFromSliders()
}

// 处理基准音量变化
function handleBaseVolumeChange() {
  if (!baseVolumeSlider || isUpdatingSliders)
    return

  const baseVolume = Number.parseInt(baseVolumeSlider.value)
  const baseVolumeValue = baseVolumeSlider.parentElement?.querySelector('div:last-child')

  if (baseVolumeValue) {
    baseVolumeValue.textContent = `${baseVolume}%`
  }

  // 更新设置
  settings.value.baseVolume = baseVolume

  // 更新基准音量进度条
  updateBaseVolumeProgress(baseVolumeSlider, baseVolume)

  // 实时应用音量
  applyVolumeFromSliders()
}

// 从滑动条应用音量
function applyVolumeFromSliders() {
  if (!baseVolumeSlider || !upVolumeSlider)
    return

  const baseVolume = Number.parseInt(baseVolumeSlider.value)
  const upVolumeOffset = Number.parseInt(upVolumeSlider.value)
  const targetVolume = Math.max(0, Math.min(100, baseVolume + upVolumeOffset))

  setVolume(targetVolume)
}

// 更新滑动条值
function updateSliderValues() {
  if (!upVolumeSlider || !baseVolumeSlider || isUpdatingSliders)
    return

  isUpdatingSliders = true

  // 更新基准音量滑动条
  baseVolumeSlider.value = settings.value.baseVolume.toString()
  updateBaseVolumeProgress(baseVolumeSlider, settings.value.baseVolume)
  const baseVolumeValue = baseVolumeSlider.parentElement?.querySelector('div:last-child')
  if (baseVolumeValue) {
    baseVolumeValue.textContent = `${settings.value.baseVolume}%`
  }

  // 更新UP主音量滑动条
  const upInfo = getUpInfo()
  let upVolumeOffset = 0

  if (upInfo.uid) {
    const upConfig = getUpVolumeConfig(upInfo.uid)
    if (upConfig) {
      upVolumeOffset = upConfig.volumeOffset
    }
  }

  upVolumeSlider.value = upVolumeOffset.toString()
  updateUpVolumeProgress(upVolumeSlider, upVolumeOffset)
  const upVolumeValue = upVolumeSlider.parentElement?.querySelector('div:last-child')
  if (upVolumeValue) {
    const sign = upVolumeOffset > 0 ? '+' : ''
    upVolumeValue.textContent = `${sign}${upVolumeOffset}%`
  }

  isUpdatingSliders = false
}

// 显示音量滑动条
function showVolumeSliders() {
  if (!volumeSlidersContainer)
    return

  // 清除隐藏定时器
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }

  updateSliderValues()
  volumeSlidersContainer.style.display = 'block'
}

// 隐藏音量滑动条
function hideVolumeSliders() {
  if (!volumeSlidersContainer)
    return

  // 延迟隐藏，给用户时间移动鼠标到滑动条上
  hideTimeout = setTimeout(() => {
    if (volumeSlidersContainer) {
      volumeSlidersContainer.style.display = 'none'
    }
    hideTimeout = null
  }, 200)
}

// 创建UP音量控制按钮
function createUpVolumeButton(): HTMLElement {
  const upButton = document.createElement('div')
  upButton.className = 'bpx-player-ctrl-btn bewly-up-volume-btn'
  upButton.setAttribute('role', 'button')
  upButton.setAttribute('aria-label', t('settings.volume_balance.up_volume'))
  upButton.setAttribute('tabindex', '0')
  upButton.style.cssText = `
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    cursor: pointer;
    color: white;
    user-select: none;
    transition: opacity 0.2s;
  `

  // 创建图标容器
  const iconContainer = document.createElement('div')
  iconContainer.style.cssText = `
    position: relative;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  `

  // 创建音量图标 (简化的SVG)
  const volumeIcon = document.createElement('div')
  volumeIcon.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>
  `
  volumeIcon.style.cssText = `
    color: #fff;
    opacity: 0.8;
  `

  // 创建UP标识
  const upBadge = document.createElement('span')
  upBadge.textContent = 'UP'
  upBadge.style.cssText = `
    position: absolute;
    bottom: -1px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 8px;
    font-weight: bold;
    color: #fff;
    background: rgba(0, 0, 0, 0);
    border-radius: 2px;
    padding: 1px 3px;
    line-height: 1;
    text-align: center;
    min-width: 16px;
  `

  iconContainer.appendChild(volumeIcon)
  iconContainer.appendChild(upBadge)
  upButton.appendChild(iconContainer)

  return upButton
}

// 初始化音量滑动条
export function initVolumeSliders() {
  if (!settings.value.enableVolumeBalance)
    return

  // 查找播放器控制栏右侧容器
  const controlBottomRight = document.querySelector('.bpx-player-control-bottom-right')
  if (!controlBottomRight) {
    // 如果没找到，延迟重试
    setTimeout(initVolumeSliders, 1000)
    return
  }

  // 检查是否已经初始化过
  if (document.querySelector('.bewly-up-volume-btn')) {
    return
  }

  // 创建UP音量控制按钮
  const upVolumeButton = createUpVolumeButton()

  // 查找音量控制按钮，在它后面插入UP按钮
  const volumeControl = controlBottomRight.querySelector('.bpx-player-ctrl-volume')
  if (volumeControl && volumeControl.nextSibling) {
    controlBottomRight.insertBefore(upVolumeButton, volumeControl.nextSibling)
  }
  else if (volumeControl) {
    controlBottomRight.appendChild(upVolumeButton)
  }
  else {
    // 如果没找到音量控制，就添加到容器末尾
    controlBottomRight.appendChild(upVolumeButton)
  }

  // 创建滑动条容器并添加到UP按钮
  volumeSlidersContainer = createVolumeSlidersContainer()
  upVolumeButton.appendChild(volumeSlidersContainer)

  // 添加鼠标事件到UP按钮
  upVolumeButton.addEventListener('mouseenter', showVolumeSliders)
  upVolumeButton.addEventListener('mouseleave', hideVolumeSliders)

  // 防止滑动条容器的鼠标事件冒泡
  volumeSlidersContainer.addEventListener('mouseenter', (e) => {
    e.stopPropagation()
    showVolumeSliders()
  })

  volumeSlidersContainer.addEventListener('mouseleave', (e) => {
    e.stopPropagation()
    hideVolumeSliders()
  })
}

// 清理音量滑动条
export function cleanupVolumeSliders() {
  // 清理UP按钮
  const upVolumeButton = document.querySelector('.bewly-up-volume-btn')
  if (upVolumeButton && upVolumeButton.parentElement) {
    upVolumeButton.parentElement.removeChild(upVolumeButton)
  }

  volumeSlidersContainer = null
  upVolumeSlider = null
  baseVolumeSlider = null
}

// 重新初始化（用于页面跳转等场景）
export function reinitVolumeSliders() {
  cleanupVolumeSliders()
  setTimeout(initVolumeSliders, 1000)
}
