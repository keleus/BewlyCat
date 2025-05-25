import { settings } from '~/logic'
import type { UpVolumeConfig } from '~/logic/storage'

import { getUpInfo, setVolume } from './player'
import { initVolumeSliders } from './volumeSliders'

// 音量均衡相关的状态管理

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

// 初始化音量滑动条
export function startVolumeChangeMonitoring(): void {
  if (!settings.value.enableVolumeBalance) {
    return
  }

  // 初始化音量滑动条
  initVolumeSliders()
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
  // 现在使用滑动条，不需要重置监听状态
}
