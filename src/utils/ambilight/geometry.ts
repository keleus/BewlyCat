import type { AmbilightDisplayMode } from './types'

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface GlowGeometry extends Rect {
  marginX: number
  marginY: number
  blur: number
}

export function contentRect(rect: Rect, vw: number, vh: number, fit: string = 'contain'): Rect {
  if (!vw || !vh || fit === 'fill' || fit === 'cover')
    return { ...rect }
  const scale = Math.min(rect.width / vw, rect.height / vh)
  const width = vw * scale
  const height = vh * scale
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  }
}

export function glowGeometry(
  rect: Rect,
  viewport: { width: number, height: number },
  spread: number,
  blur: number,
  mode: AmbilightDisplayMode = 'normal',
): GlowGeometry {
  const immersive = mode !== 'normal'
  const effectiveBlur = blur > 0 ? (immersive ? Math.max(100, blur * 1.4) : blur) : 0
  const x = immersive ? Math.max(240, (viewport.width - rect.width) / 2 + 130) : 100
  const y = immersive ? Math.max(180, Math.min(300, viewport.height * 0.23)) : 100

  // 30–100% 为局部光晕；100–400% 平滑扩展到一个固定的本地半径。
  // 泊松模式没有模糊，因此不额外预留 bleed。
  const bleed = effectiveBlur > 0 ? Math.ceil(effectiveBlur * 3) + 2 : 0
  const local = Math.min(spread / 100, 1)
  const fill = Math.max(0, Math.min(1, (spread - 100) / 300))
  const reachX = Math.max(x, (viewport.width - rect.width) / 2 + bleed)
  const reachY = Math.max(y, (viewport.height - rect.height) / 2 + bleed)
  const marginX = x * local + (reachX - x) * fill
  const marginY = y * local + (reachY - y) * fill

  return {
    left: rect.left - marginX,
    top: rect.top - marginY,
    width: rect.width + 2 * marginX,
    height: rect.height + 2 * marginY,
    marginX,
    marginY,
    blur: effectiveBlur,
  }
}
