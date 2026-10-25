import { reactive } from 'vue'

// 旋转、镜像与音画同步只针对当前视频：换视频或分 P 时重置，切换清晰度时保留。
export const playerAdjustment = reactive({
  rotation: 0,
  flipX: false,
  flipY: false,
  audioDelay: 0,
})

let currentVideoKey = ''

function getVideoKey() {
  return `${location.pathname}?p=${new URLSearchParams(location.search).get('p') ?? ''}`
}

export function resetPlayerAdjustment() {
  playerAdjustment.rotation = 0
  playerAdjustment.flipX = false
  playerAdjustment.flipY = false
  playerAdjustment.audioDelay = 0
}

export function syncPlayerAdjustmentVideo() {
  const key = getVideoKey()
  if (key === currentVideoKey)
    return
  currentVideoKey = key
  resetPlayerAdjustment()
}

export function isPictureAdjusted() {
  return playerAdjustment.rotation !== 0 || playerAdjustment.flipX || playerAdjustment.flipY
}

// 使用独立的 rotate/scale 属性，与播放器自身写在 transform 上的镜像等效果叠加而不互相覆盖。
export function applyPictureAdjustment(video: HTMLVideoElement) {
  const { rotation, flipX, flipY } = playerAdjustment
  if (!isPictureAdjusted()) {
    video.style.removeProperty('rotate')
    video.style.removeProperty('scale')
    return
  }
  const quarterTurn = rotation % 180 !== 0
  let fit = 1
  const width = video.clientWidth
  const height = video.clientHeight
  const aspect = video.videoWidth / video.videoHeight
  if (quarterTurn && width && height && Number.isFinite(aspect) && aspect > 0) {
    // 按 contain 计算画面实际尺寸，转 90° 后宽高互换，再缩放到能完整放进播放器。
    const contentWidth = Math.min(width, height * aspect)
    const contentHeight = contentWidth / aspect
    fit = Math.min(width / contentHeight, height / contentWidth)
  }
  // scale 先于 rotate 作用在元素自身坐标上；转过 90° 后元素横轴在屏幕上是竖直的，镜像轴随之互换。
  const scaleX = (quarterTurn ? flipY : flipX) ? -fit : fit
  const scaleY = (quarterTurn ? flipX : flipY) ? -fit : fit
  video.style.setProperty('rotate', `${rotation}deg`)
  video.style.setProperty('scale', `${scaleX} ${scaleY}`)
}
