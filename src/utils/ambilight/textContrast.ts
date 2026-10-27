import type { AmbilightBackdropSample, AmbilightTone } from './types'

// 各级文字在原主题底色上的对比度（由 variables.scss 中的文字色叠在主题底色上算得）；
// 浅色三级文字略微提高，弥补光晕底色不均匀带来的损失
const TEXT_CONTRAST: Record<AmbilightTone, readonly number[]> = {
  light: [17.6, 6, 3.6, 2],
  dark: [13.9, 9, 5.3, 2.8],
}

// 背景无法满足一级文字的对比度时，其余各级按与一级的对比比例同步压缩，保持层级不并档
const LEVEL_COMPRESSION = 0.35

// 页面底色的 sRGB 编码亮度：实际值由 readPageBaseValue 读取，未读到前使用默认主题的近似值
export type AmbilightBaseValues = Record<AmbilightTone, number>

export const DEFAULT_BASE_VALUES: Readonly<AmbilightBaseValues> = { light: 0.95, dark: 0.135 }

function toSrgbEncoded(linear: number): number {
  return linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055
}

/**
 * 解析页面底色的 sRGB 编码亮度。深色底色由 color-mix(in oklab) 得出，计算值为 oklab()；
 * 透明或无法识别时返回 null。
 */
export function parseBaseValue(color: string): number | null {
  const oklab = /^oklab\(([\d.]+)/.exec(color)
  if (oklab)
    return toSrgbEncoded(Number(oklab[1]) ** 3)

  const channels = /^(?:rgba?\(|color\(srgb )([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(color)
  if (!channels || channels[4] === '0')
    return null
  const scale = color.startsWith('color(') ? 1 : 255
  const [r, g, b] = channels.slice(1, 4).map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / scale
}

function toLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/**
 * 估算页面在某明暗下，文字背后的有效相对亮度。
 * 浏览器按 sRGB 编码值做透明度合成；取均值与最不利位置的折中，兼顾整体与最难读的一处。
 */
export function getBackdropLuminance(
  samples: readonly AmbilightBackdropSample[],
  tone: AmbilightTone,
  baseValues: Readonly<AmbilightBaseValues>,
): number {
  const base = baseValues[tone]
  const values = samples.map(({ glow, alpha }) => toLinear(alpha * glow + (1 - alpha) * base))
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const worst = tone === 'light' ? Math.min(...values) : Math.max(...values)
  return (mean + worst) / 2
}

function maxTextContrast(tone: AmbilightTone, backdrop: number): number {
  return tone === 'light' ? (backdrop + 0.05) / 0.05 : 1.05 / (backdrop + 0.05)
}

function toSrgbChannel(linear: number): number {
  const v = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

// 与主题文字色同样略偏冷的中性灰
function greyWithLuminance(luminance: number): string {
  const v = toSrgbChannel(Math.min(1, Math.max(0, luminance)))
  const clamp = (c: number) => Math.min(255, Math.max(0, c))
  return `rgb(${clamp(v - 2)} ${clamp(v - 1)} ${clamp(v + 3)})`
}

/**
 * 按背景相对亮度求出四级文字色：每级尽量保持原主题下的对比度，背景接近文字时整体同步压缩。
 */
export function getAmbilightTextColors(tone: AmbilightTone, backdropLuminance: number): string[] {
  // 量化到 0.01，亮度细微波动时不重复写入样式
  const backdrop = Math.round(Math.min(1, Math.max(0, backdropLuminance)) * 100) / 100
  const maxContrast = maxTextContrast(tone, backdrop)
  const contrasts = TEXT_CONTRAST[tone]
  const primary = contrasts[0]

  return contrasts.map((contrast) => {
    const target = Math.min(contrast, maxContrast * (contrast / primary) ** LEVEL_COMPRESSION)
    const luminance = tone === 'light'
      ? (backdrop + 0.05) / target - 0.05
      : target * (backdrop + 0.05) - 0.05
    return greyWithLuminance(luminance)
  })
}
