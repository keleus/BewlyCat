import type { AmbilightBackdropSample, AmbilightTone } from './types'

// 各级文字在原主题底色上的对比度（由 variables.scss 中的文字色叠在主题底色上算得）；
// 浅色三级文字略微提高，弥补光晕底色不均匀带来的损失
const TEXT_CONTRAST: Record<AmbilightTone, readonly number[]> = {
  light: [17.6, 6, 3.6, 2],
  dark: [13.9, 9, 5.3, 2.8],
}

// 环境光下各级文字至少达到的对比度：光晕让背景不均匀，三、四级的小字按原主题的浅灰很容易看不清，
// 整体比原主题更醒目，不严格保持原有的灰阶梯度
const MIN_CONTRAST = [7, 7, 5.5, 4]

// 背景无法满足目标对比度时，各级取所能达到的最高对比度的一定比例，只保留轻微的层级差
const LEVEL_HEADROOM = [1, 0.92, 0.85, 0.78]

// 一、二级（标题、正文）按区域背景的典型亮度取色；三、四级多为播放量、日期等小字，
// 按区域内最不利位置取色，避免标题清楚而小字看不清
const SMALL_TEXT_LEVEL = 2

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

// 文字背后的有效相对亮度：typical 为均值与最不利位置的折中，worst 为最不利位置
export interface AmbilightBackdrop {
  typical: number
  worst: number
}

/**
 * 估算页面在某明暗下，文字背后的有效相对亮度。
 * 浏览器按 sRGB 编码值做透明度合成，结果量化到 0.01，亮度细微波动时不重复写入样式。
 */
export function getBackdrop(
  samples: readonly AmbilightBackdropSample[],
  tone: AmbilightTone,
  baseValues: Readonly<AmbilightBaseValues>,
): AmbilightBackdrop {
  const base = baseValues[tone]
  const values = samples.map(({ glow, alpha }) => toLinear(alpha * glow + (1 - alpha) * base))
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const worst = tone === 'light' ? Math.min(...values) : Math.max(...values)
  const quantize = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100
  return { typical: quantize((mean + worst) / 2), worst: quantize(worst) }
}

function maxTextContrast(tone: AmbilightTone, backdrop: number): number {
  return tone === 'light' ? (backdrop + 0.05) / 0.05 : 1.05 / (backdrop + 0.05)
}

function toSrgbChannel(linear: number): number {
  const v = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

// 纯中性灰，只在黑白之间变化，不带色相
function greyWithLuminance(luminance: number): string {
  const v = toSrgbChannel(Math.min(1, Math.max(0, luminance)))
  return `rgb(${v} ${v} ${v})`
}

/**
 * 按背景相对亮度求出四级文字色：每级取原主题与环境光最低要求中更高的对比度，背景接近文字时尽量贴近可达上限。
 */
export function getAmbilightTextColors(tone: AmbilightTone, backdrop: AmbilightBackdrop): string[] {
  return TEXT_CONTRAST[tone].map((contrast, level) => {
    const background = level < SMALL_TEXT_LEVEL ? backdrop.typical : backdrop.worst
    const target = Math.min(
      Math.max(contrast, MIN_CONTRAST[level]),
      maxTextContrast(tone, background) * LEVEL_HEADROOM[level],
    )
    const luminance = tone === 'light'
      ? (background + 0.05) / target - 0.05
      : target * (background + 0.05) - 0.05
    return greyWithLuminance(luminance)
  })
}
