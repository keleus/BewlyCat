const NEUTRAL_DISPLACEMENT_CHANNEL = 128
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const DOCK_FILTER_ID = 'bew-dock-liquid-glass-filter'
const FILTER_DEFINITIONS_ATTRIBUTE = 'data-bew-dock-liquid-glass-definitions'
const DOCK_REFRACTION_SCALE = 19.8

export const DOCK_LIQUID_GLASS_FILTER_URL = `url("#${DOCK_FILTER_ID}")`

function smoothStep(start: number, end: number, value: number): number {
  const progress = Math.min(1, Math.max(0, (value - start) / (end - start)))
  return progress * progress * (3 - 2 * progress)
}

function roundedRectDistance(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): number {
  const offsetX = Math.abs(x - width / 2) - (width / 2 - radius)
  const offsetY = Math.abs(y - height / 2) - (height / 2 - radius)
  const outsideDistance = Math.hypot(Math.max(offsetX, 0), Math.max(offsetY, 0))
  const insideDistance = Math.min(Math.max(offsetX, offsetY), 0)

  return outsideDistance + insideDistance - radius
}

function toDisplacementChannel(value: number): number {
  return Math.round(Math.min(255, Math.max(0, NEUTRAL_DISPLACEMENT_CHANNEL + value * 127)))
}

/**
 * 按元素实际尺寸生成药丸形边缘位移贴图，避免拉伸导致折射边缘变形。
 * 贴图只在尺寸变化时生成，运行时不监听指针，也不执行逐帧计算。
 */
export function createPillDisplacementMap(width = 160, height = 48): string {
  if (typeof document === 'undefined')
    return ''

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context)
    return ''

  const imageData = context.createImageData(width, height)
  const pixels = imageData.data
  const radius = Math.max(1, height / 2 - 1)
  const edgeWidth = Math.max(3, height * 0.18)
  const normalSampleOffset = 0.75

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * 4
      const distance = roundedRectDistance(x, y, width, height, radius)

      pixels[pixelIndex] = NEUTRAL_DISPLACEMENT_CHANNEL
      pixels[pixelIndex + 1] = NEUTRAL_DISPLACEMENT_CHANNEL
      pixels[pixelIndex + 2] = 0
      pixels[pixelIndex + 3] = 255

      if (distance > 0)
        continue

      const edgeStrength = 1 - smoothStep(0, edgeWidth, -distance)
      if (edgeStrength <= 0)
        continue

      const gradientX = roundedRectDistance(
        x + normalSampleOffset,
        y,
        width,
        height,
        radius,
      ) - roundedRectDistance(
        x - normalSampleOffset,
        y,
        width,
        height,
        radius,
      )
      const gradientY = roundedRectDistance(
        x,
        y + normalSampleOffset,
        width,
        height,
        radius,
      ) - roundedRectDistance(
        x,
        y - normalSampleOffset,
        width,
        height,
        radius,
      )
      const gradientLength = Math.hypot(gradientX, gradientY)

      if (gradientLength === 0)
        continue

      const refractionStrength = edgeStrength ** 1.7
      pixels[pixelIndex] = toDisplacementChannel(gradientX / gradientLength * refractionStrength)
      pixels[pixelIndex + 1] = toDisplacementChannel(gradientY / gradientLength * refractionStrength)
    }
  }

  context.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

let dockDisplacementMap = ''

/**
 * 生成可被不同宽高容器复用的边缘位移贴图。
 * 位移只发生在四周，元素自身的圆角会负责裁切最终轮廓。
 */
function createDockDisplacementMap(size = 256): string {
  if (typeof document === 'undefined')
    return ''

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context)
    return ''

  const imageData = context.createImageData(size, size)
  const pixels = imageData.data
  const edgeWidth = size * 0.13

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixelIndex = (y * size + x) * 4
      const leftStrength = 1 - smoothStep(0, edgeWidth, x)
      const rightStrength = 1 - smoothStep(0, edgeWidth, size - 1 - x)
      const topStrength = 1 - smoothStep(0, edgeWidth, y)
      const bottomStrength = 1 - smoothStep(0, edgeWidth, size - 1 - y)
      const displacementX = (leftStrength - rightStrength) ** 3
      const displacementY = (topStrength - bottomStrength) ** 3

      pixels[pixelIndex] = toDisplacementChannel(displacementX)
      pixels[pixelIndex + 1] = toDisplacementChannel(displacementY)
      pixels[pixelIndex + 2] = 0
      pixels[pixelIndex + 3] = 255
    }
  }

  context.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  documentRef: Document,
  tagName: K,
): SVGElementTagNameMap[K] {
  return documentRef.createElementNS(SVG_NAMESPACE, tagName)
}

function createDockFilterDefinitions(documentRef: Document): SVGSVGElement {
  const svg = createSvgElement(documentRef, 'svg')
  svg.setAttribute(FILTER_DEFINITIONS_ATTRIBUTE, '')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:fixed;inset:0;overflow:hidden;pointer-events:none'

  const defs = createSvgElement(documentRef, 'defs')
  const filter = createSvgElement(documentRef, 'filter')
  filter.id = DOCK_FILTER_ID
  filter.setAttribute('x', '-8%')
  filter.setAttribute('y', '-8%')
  filter.setAttribute('width', '116%')
  filter.setAttribute('height', '116%')
  filter.setAttribute('filterUnits', 'objectBoundingBox')
  filter.setAttribute('color-interpolation-filters', 'sRGB')

  const displacementImage = createSvgElement(documentRef, 'feImage')
  displacementImage.setAttribute('href', dockDisplacementMap)
  displacementImage.setAttribute('x', '0')
  displacementImage.setAttribute('y', '0')
  displacementImage.setAttribute('width', '100%')
  displacementImage.setAttribute('height', '100%')
  displacementImage.setAttribute('preserveAspectRatio', 'none')
  displacementImage.setAttribute('result', 'bew-dock-displacement-map')

  const displacement = createSvgElement(documentRef, 'feDisplacementMap')
  displacement.setAttribute('in', 'SourceGraphic')
  displacement.setAttribute('in2', 'bew-dock-displacement-map')
  displacement.setAttribute('xChannelSelector', 'R')
  displacement.setAttribute('yChannelSelector', 'G')
  displacement.setAttribute('scale', '8')

  filter.append(displacementImage, displacement)
  defs.append(filter)
  svg.append(defs)
  return svg
}

function syncFilterInRoot(
  root: Document | ShadowRoot,
  enabled: boolean,
  scale: number,
) {
  const existing = root.querySelector<SVGSVGElement>(`[${FILTER_DEFINITIONS_ATTRIBUTE}]`)

  if (!enabled) {
    existing?.remove()
    return
  }

  const svg = existing ?? createDockFilterDefinitions(root.ownerDocument ?? root)
  svg.querySelector(`#${DOCK_FILTER_ID} feDisplacementMap`)?.setAttribute('scale', scale.toFixed(2))

  if (!existing) {
    if (root instanceof Document)
      root.documentElement.append(svg)
    else
      root.append(svg)
  }
}

export function supportsDockLiquidGlass(): boolean {
  return typeof CSS !== 'undefined'
    && (
      CSS.supports('backdrop-filter', DOCK_LIQUID_GLASS_FILTER_URL)
      || CSS.supports('-webkit-backdrop-filter', DOCK_LIQUID_GLASS_FILTER_URL)
    )
}

/**
 * 仅在 Bewly Shadow DOM 中同步 Dock 专用滤镜。
 * 贴图只生成一次，开关变化只同步 SVG 定义，不触发逐帧计算。
 */
export function syncDockLiquidGlassFilter(enabled: boolean): boolean {
  const supported = supportsDockLiquidGlass()
  const shouldEnable = enabled && supported
  const shadowRoot = document.getElementById('bewly')?.shadowRoot

  // 清理旧版本可能留在页面文档中的重复定义。
  syncFilterInRoot(document, false, DOCK_REFRACTION_SCALE)

  if (!shouldEnable || !shadowRoot) {
    if (shadowRoot)
      syncFilterInRoot(shadowRoot, false, DOCK_REFRACTION_SCALE)
    return false
  }

  if (!dockDisplacementMap)
    dockDisplacementMap = createDockDisplacementMap()

  syncFilterInRoot(shadowRoot, true, DOCK_REFRACTION_SCALE)

  return true
}
