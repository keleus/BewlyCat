export interface AmbilightEngineOptions {
  enabled: boolean
  enableFullscreen: boolean
  strength: number
  spread: number
  smoothing: number
  blur: number
  saturation: number
  fps: number
}

export interface VideoGeometry {
  left: number
  top: number
  width: number
  height: number
}

export type AmbilightDisplayMode = 'normal' | 'theater' | 'fullscreen' | 'mini'
