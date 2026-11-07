import { reactive, ref } from 'vue'

// 镜像只针对当前视频：换视频或分 P 时重置，切换清晰度时保留。
export const playerAdjustment = reactive({
  flipX: false,
  flipY: false,
})

// 面板开关只临时关闭本页的音量均衡，不写入设置；刷新页面后恢复。
export const loudnessTemporarilyOff = ref(false)

let currentVideoKey = ''

function getVideoKey() {
  return `${location.pathname}?p=${new URLSearchParams(location.search).get('p') ?? ''}`
}

export function resetPictureAdjustment() {
  playerAdjustment.flipX = false
  playerAdjustment.flipY = false
}

export function syncPlayerAdjustmentVideo() {
  const key = getVideoKey()
  if (key === currentVideoKey)
    return
  currentVideoKey = key
  resetPictureAdjustment()
}

export function isPictureAdjusted() {
  return playerAdjustment.flipX || playerAdjustment.flipY
}

// 使用独立的 scale 属性，与播放器自身写在 transform 上的镜像等效果叠加而不互相覆盖。
export function applyPictureAdjustment(video: HTMLVideoElement) {
  if (!isPictureAdjusted()) {
    video.style.removeProperty('scale')
    return
  }
  video.style.setProperty('scale', `${playerAdjustment.flipX ? -1 : 1} ${playerAdjustment.flipY ? -1 : 1}`)
}
