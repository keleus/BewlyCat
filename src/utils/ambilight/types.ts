export interface AmbilightEngineOptions {
  enabled: boolean
  strength: number
  spread: number
  smoothing: number
  blur: number
  saturation: number
  fps: number
}

// 环境光只在默认与宽屏播放器下运行；全屏、网页全屏与 Bewly 宽屏由 ambilightControl 整体停用
export type AmbilightDisplayMode = 'normal' | 'theater' | 'mini'

export type AmbilightTone = 'light' | 'dark'

// 页面上用于估算文字背景的采样点（视口坐标），region 为所属文字区域
export interface AmbilightBackdropAnchor {
  region: string
  x: number
  y: number
}

// 某个采样点下的光晕：glow 为光晕颜色的 sRGB 编码亮度，alpha 为其叠在页面底色上的不透明度
export interface AmbilightBackdropSample {
  region: string
  glow: number
  alpha: number
}

export interface AmbilightBackdropProbe {
  getAnchors: () => AmbilightBackdropAnchor[]
  onSample: (samples: AmbilightBackdropSample[]) => void
}
