import { originalSettings } from '~/logic'

/**
 * B 站的点赞、长按三连等动效由 Canvas 绘制，颜色固化在 SVGA 资源里，无法通过 CSS 变量直接改色。
 * 这里按主题色与 B 站品牌蓝的色相/饱和度/明度差生成滤镜，交给样式作用到动效画布上。
 */

// B 站点赞/三连 SVGA 资源里固化的品牌蓝 #00aeec 的 HSL 值，作为滤镜的基准颜色。
const BILIBILI_ACTION_ANIMATION_HUE = 196
const BILIBILI_ACTION_ANIMATION_SATURATION = 1
const BILIBILI_ACTION_ANIMATION_LIGHTNESS = 0.46

interface RgbColor {
  r: number
  g: number
  b: number
}

interface HslColor {
  hue: number
  saturation: number
  lightness: number
}

function parseRgbColor(value: string): RgbColor | null {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match)
    return null

  return {
    r: Number(match[1]) / 255,
    g: Number(match[2]) / 255,
    b: Number(match[3]) / 255,
  }
}

function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2

  if (max === min)
    return { hue: 0, saturation: 0, lightness }

  const delta = max - min
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min)

  let hue = 0
  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0)
      break
    case g:
      hue = (b - r) / delta + 2
      break
    default:
      hue = (r - g) / delta + 4
      break
  }

  return { hue: hue * 60, saturation, lightness }
}

function resolveCssColor(value: string): RgbColor | null {
  if (!value)
    return null

  const probe = document.createElement('span')
  probe.style.position = 'fixed'
  probe.style.pointerEvents = 'none'
  probe.style.opacity = '0'
  probe.style.color = value
  const container = document.body ?? document.documentElement
  container.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()

  return parseRgbColor(resolved)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isSameRgbColor(a: RgbColor, b: RgbColor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b
}

/** 生成让 B 站动效画布跟随主题色的 CSS 滤镜；主题色为插件默认主题色时返回 `none`。 */
export function createActionAnimationFilter(themeColor: string): string {
  const rgb = resolveCssColor(themeColor || originalSettings.themeColor)
  if (!rgb)
    return 'none'

  // 默认主题色 #00a1d6 与 SVGA 资源的 #00aeec 色相只差约 1°，但明度更低，按差值计算会让原生动效整体变暗，这里保持原样
  const defaultRgb = resolveCssColor(originalSettings.themeColor)
  if (defaultRgb && isSameRgbColor(rgb, defaultRgb))
    return 'none'

  const { hue, saturation, lightness } = rgbToHsl(rgb)
  const hueRotate = Math.round(hue - BILIBILI_ACTION_ANIMATION_HUE)
  const saturationRatio = clamp(saturation / BILIBILI_ACTION_ANIMATION_SATURATION, 0.2, 2.4)
  const brightnessRatio = clamp(lightness / BILIBILI_ACTION_ANIMATION_LIGHTNESS, 0.6, 1.35)
  const isIdentity = hueRotate === 0
    && Math.abs(saturationRatio - 1) < 0.02
    && Math.abs(brightnessRatio - 1) < 0.02

  if (isIdentity)
    return 'none'

  return `hue-rotate(${hueRotate}deg) saturate(${saturationRatio.toFixed(2)}) brightness(${brightnessRatio.toFixed(2)})`
}

/** 把滤镜写入 CSS 变量，供 `.svga-fireworks` 等动效画布使用。 */
export function syncActionAnimationFilter(
  themeColor: string,
  target: HTMLElement = document.documentElement,
): void {
  target.style.setProperty('--bew-action-animation-filter', createActionAnimationFilter(themeColor))
}
