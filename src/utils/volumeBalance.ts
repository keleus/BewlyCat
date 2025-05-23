import { settings } from '~/logic'
import type { UpVolumeConfig } from '~/logic/storage'

import { getCurrentVolume, getUpInfo, setVolume } from './player'
import { showVolumeAdjustDialog } from './volumeDialogManager'

// 音量均衡相关的状态管理
let lastVolume = 0
let volumeChangeTimeout: number | null = null
let isVolumeMonitoringActive = false

// 获取UP主音量配置
export function getUpVolumeConfig(uid: string): UpVolumeConfig | null {
  if (!settings.value.enableVolumeBalance) {
    return null
  }

  return settings.value.upVolumeConfigs.find(config => config.uid === uid) || null
}

// 保存UP主音量配置
export function saveUpVolumeConfig(uid: string, name: string, volumeOffset: number): void {
  if (!settings.value.enableVolumeBalance) {
    return
  }

  const existingIndex = settings.value.upVolumeConfigs.findIndex(config => config.uid === uid)
  const newConfig: UpVolumeConfig = {
    uid,
    name,
    volumeOffset,
    lastUpdated: Date.now(),
  }

  if (existingIndex >= 0) {
    settings.value.upVolumeConfigs[existingIndex] = newConfig
  }
  else {
    settings.value.upVolumeConfigs.push(newConfig)
  }
}

// 删除UP主音量配置
export function removeUpVolumeConfig(uid: string): void {
  const index = settings.value.upVolumeConfigs.findIndex(config => config.uid === uid)
  if (index >= 0) {
    settings.value.upVolumeConfigs.splice(index, 1)
  }
}

// 清空所有UP主音量配置
export function clearAllUpVolumeConfigs(): void {
  settings.value.upVolumeConfigs = []
}

// 应用音量均衡 (页面加载时调用)
export function applyVolumeBalance(): void {
  if (!settings.value.enableVolumeBalance) {
    return
  }

  const video = document.querySelector('#bilibiliPlayer video,#bilibili-player video,.bilibili-player video,.player-container video,#bilibiliPlayer bwp-video,#bilibili-player bwp-video,.bilibili-player bwp-video,.player-container bwp-video,#bofqi video,[aria-label="哔哩哔哩播放器"] video') as HTMLVideoElement
  if (!video) {
    // 如果视频元素还没有加载，延迟重试
    setTimeout(() => applyVolumeBalance(), 1000)
    return
  }

  const upInfo = getUpInfo()

  if (!upInfo.uid) {
    // 如果没有UP主信息，设置为基准音量
    setVolume(settings.value.baseVolume)
    return
  }

  const upConfig = getUpVolumeConfig(upInfo.uid)

  if (upConfig) {
    // 如果有UP主配置，应用相对基准音量的偏移
    const targetVolume = Math.max(0, Math.min(100, settings.value.baseVolume + upConfig.volumeOffset))
    setVolume(targetVolume)
  }
  else {
    // 如果没有UP主配置，设置为基准音量
    setVolume(settings.value.baseVolume)
  }
}

// 监听音量变化
export function startVolumeChangeMonitoring(): void {
  if (!settings.value.enableVolumeBalance) {
    return
  }

  // 如果已经在监听，直接返回
  if (isVolumeMonitoringActive) {
    return
  }

  const video = document.querySelector('#bilibiliPlayer video,#bilibili-player video,.bilibili-player video,.player-container video,#bilibiliPlayer bwp-video,#bilibili-player bwp-video,.bilibili-player bwp-video,.player-container bwp-video,#bofqi video,[aria-label="哔哩哔哩播放器"] video') as HTMLVideoElement
  if (!video) {
    return
  }

  lastVolume = getCurrentVolume()

  const handleVolumeChange = () => {
    const currentVolume = getCurrentVolume()

    // 如果音量发生变化且不是程序自动设置的
    if (Math.abs(currentVolume - lastVolume) > 1) {
      if (volumeChangeTimeout) {
        clearTimeout(volumeChangeTimeout)
      }

      // 延迟显示对话框，避免频繁触发
      volumeChangeTimeout = window.setTimeout(() => {
        showVolumeAdjustDialog(currentVolume)
      }, 1000)
    }

    lastVolume = currentVolume
  }

  video.addEventListener('volumechange', handleVolumeChange)
  isVolumeMonitoringActive = true

  // 当视频元素被移除时，重置监听状态
  const observer = new MutationObserver(() => {
    if (!document.contains(video)) {
      isVolumeMonitoringActive = false
      observer.disconnect()
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

// 手动应用音量均衡（用于页面跳转等场景）
export function manualApplyVolumeBalance() {
  setTimeout(() => {
    applyVolumeBalance()
    startVolumeChangeMonitoring()
  }, 2000)
}

// 重置音量监听状态（用于页面跳转时）
export function resetVolumeMonitoring() {
  isVolumeMonitoringActive = false
  if (volumeChangeTimeout) {
    clearTimeout(volumeChangeTimeout)
    volumeChangeTimeout = null
  }
}
