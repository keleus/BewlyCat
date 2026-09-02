import type { VideoShareSession } from './bilibiliShare'
import { formatTimestamp } from './bilibiliShare'

export const BILIBILI_SHARE_POSTER_SIZE = 1080

const DEFAULT_BACKGROUND = '#e8f4fa'
const POSTER_BACKGROUND_START = '#292e38'
const POSTER_BACKGROUND_MID = '#12151b'
const POSTER_BACKGROUND_END = '#000000'
const DARK_TEXT = '#111827'
const BLACK = '#000000'
const WHITE = '#ffffff'
const MAX_POSTER_TEXT_LENGTH = 512

export interface PosterLabels {
  brand: string
  ownerFallback: string
  infoTitle: string
  scanHint: string
  tagFallback: string
  fallbackCover: string
  fromTime: (time: string) => string
}

export interface RenderPosterOptions {
  canvas?: HTMLCanvasElement
  qrCanvas?: HTMLCanvasElement
  logoUrl?: string
  labels?: Partial<PosterLabels>
  signal?: AbortSignal
}

export interface RenderPosterResult {
  canvas: HTMLCanvasElement
  background: string
  foreground: string
  coverDrawn: boolean
  dataUrl: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseHexColor(value: string): [number, number, number] | null {
  const normalized = value.trim().replace(/^#/, '')
  if (!/^[0-9a-f]{6}$/i.test(normalized))
    return null

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ]
}

export function relativeLuminance(hex: string): number {
  const channels = parseHexColor(String(hex))
  if (!channels)
    return 1

  const linear = channels.map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })

  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

export function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  const light = Math.max(firstLuminance, secondLuminance)
  const dark = Math.min(firstLuminance, secondLuminance)
  return (light + 0.05) / (dark + 0.05)
}

export function readableTextColor(background: string): string {
  const darkContrast = contrastRatio(background, DARK_TEXT)
  const whiteContrast = contrastRatio(background, WHITE)
  if (darkContrast >= 4.5)
    return darkContrast >= whiteContrast ? DARK_TEXT : WHITE
  if (whiteContrast >= 4.5)
    return WHITE
  return contrastRatio(background, BLACK) >= whiteContrast ? BLACK : WHITE
}

export function colorFromPixels(data: ArrayLike<number>): string {
  if (data.length < 4)
    return DEFAULT_BACKGROUND

  let red = 0
  let green = 0
  let blue = 0
  let count = 0

  for (let index = 0; index + 3 < data.length; index += 16) {
    const alpha = data[index + 3]
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    if (
      alpha < 200
      || (r > 244 && g > 244 && b > 244)
      || (r < 10 && g < 10 && b < 10)
    ) {
      continue
    }

    red += r
    green += g
    blue += b
    count++
  }

  if (!count)
    return DEFAULT_BACKGROUND

  const average = [red / count, green / count, blue / count]
  const minimum = Math.min(...average)
  const maximum = Math.max(...average)
  const factor = maximum - minimum > 90 ? 0.55 : 0.8
  const adjusted = average.map(channel =>
    clamp(128 + (channel - 128) * factor, 32, 224),
  )
  return `#${adjusted.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

export function safePosterFilename(bvid: string): string {
  const safe
    = String(bvid || 'video')
      .replace(/[^\w-]/g, '')
      .slice(0, 40) || 'video'
  return `bilibili-${safe}-share.png`
}

function limitPosterText(
  value: unknown,
  maxLength = MAX_POSTER_TEXT_LENGTH,
): string {
  const source = String(value || '')
  let result = ''
  let count = 0
  for (const character of source) {
    if (count >= maxLength)
      break
    result += character
    count++
  }
  return result.trim()
}

function fitWithEllipsis(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  const boundedValue = limitPosterText(value)
  if (context.measureText(boundedValue).width <= maxWidth)
    return boundedValue

  let result = ''
  for (const character of Array.from(boundedValue)) {
    if (context.measureText(`${result}${character}…`).width > maxWidth)
      break
    result += character
  }
  return `${result}…`
}

function segmentPosterText(value: string): string[] {
  const normalized = limitPosterText(value)
  if (!normalized)
    return []

  if (typeof Intl.Segmenter === 'function') {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: 'word' }).segment(
        normalized,
      ),
      item => item.segment,
    )
  }

  return normalized.split(/(\s+)/u).flatMap((segment) => {
    if (/^\s+$/u.test(segment) || /^[A-Za-z0-9]+$/u.test(segment))
      return [segment]
    return Array.from(segment)
  })
}

function fitLineWithEllipsis(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  const trimmed = limitPosterText(value)
  if (context.measureText(`${trimmed}…`).width <= maxWidth)
    return `${trimmed}…`

  let result = ''
  for (const segment of segmentPosterText(trimmed)) {
    const candidate = /^\s+$/u.test(segment)
      ? `${result} `
      : `${result}${segment}`
    if (context.measureText(`${candidate.trimEnd()}…`).width > maxWidth)
      break
    result = candidate
  }

  result = result.trimEnd()
  return result
    ? `${result}…`
    : fitWithEllipsis(context, `${trimmed}…`, maxWidth)
}

export function wrapPosterText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const segments = segmentPosterText(value)
  if (!segments.length || maxLines <= 0)
    return []

  const lines: string[] = []
  let index = 0

  for (
    let lineIndex = 0;
    lineIndex < maxLines && index < segments.length;
    lineIndex++
  ) {
    let line = ''

    while (index < segments.length) {
      const segment = segments[index]
      if (/^\s+$/u.test(segment)) {
        if (!line) {
          index++
          continue
        }

        const next = segments[index + 1]
        if (!next || context.measureText(`${line} ${next}`).width > maxWidth) {
          index++
          break
        }

        line += ' '
        index++
        continue
      }

      const candidate = `${line}${segment}`
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate
        index++
        continue
      }

      if (line)
        break

      const characters = Array.from(segment)
      let fitted = ''
      while (
        characters.length
        && context.measureText(`${fitted}${characters[0]}`).width <= maxWidth
      ) {
        fitted += characters.shift()
      }

      if (!fitted) {
        fitted = fitWithEllipsis(
          context,
          characters.shift() ?? segment,
          maxWidth,
        )
      }

      line = fitted
      if (characters.length)
        segments[index] = characters.join('')
      else index++
      break
    }

    line = line.trimEnd()
    if (!line)
      continue

    if (index < segments.length && lineIndex === maxLines - 1) {
      lines.push(fitLineWithEllipsis(context, line, maxWidth))
      return lines
    }

    lines.push(line)
  }

  return lines
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}

function createAbortError(): Error {
  const error = new Error('Poster rendering was aborted')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw createAbortError()
}

function loadImage(
  url: string,
  crossOrigin = false,
  signal?: AbortSignal,
): Promise<HTMLImageElement | null> {
  throwIfAborted(signal)
  if (!url || typeof Image === 'undefined')
    return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const image = new Image()
    let settled = false
    let abortHandler: (() => void) | undefined

    const cleanup = () => {
      if (abortHandler)
        signal?.removeEventListener('abort', abortHandler)
    }
    const finish = (callback: () => void) => {
      if (settled)
        return
      settled = true
      cleanup()
      callback()
    }
    abortHandler = () => {
      image.onload = null
      image.onerror = null
      try {
        image.src = ''
      }
      catch {
        // Ignore cleanup failures from browser-specific Image implementations.
      }
      finish(() => reject(createAbortError()))
    }

    if (crossOrigin)
      image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => finish(() => resolve(image))
    image.onerror = () => finish(() => resolve(null))
    signal?.addEventListener('abort', abortHandler, { once: true })
    if (signal?.aborted) {
      abortHandler()
      return
    }
    image.src = url
  })
}

function loadCover(
  url: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement | null> {
  return loadImage(url, true, signal)
}

function canReadCover(image: HTMLImageElement | null): boolean {
  if (!image)
    return false

  try {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const context = canvas.getContext('2d')
    if (!context)
      return false
    context.drawImage(image, 0, 0, 2, 2)
    context.getImageData(0, 0, 1, 1)
    return true
  }
  catch {
    return false
  }
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (!image || image.width <= 0 || image.height <= 0)
    return false

  try {
    const sourceRatio = image.width / image.height
    const targetRatio = width / height
    let sourceX = 0
    let sourceY = 0
    let sourceWidth = image.width
    let sourceHeight = image.height

    if (sourceRatio > targetRatio) {
      sourceWidth = image.height * targetRatio
      sourceX = (image.width - sourceWidth) / 2
    }
    else {
      sourceHeight = image.width / targetRatio
      sourceY = (image.height - sourceHeight) / 2
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height,
    )
    return true
  }
  catch {
    return false
  }
}

function fillPosterBackground(context: CanvasRenderingContext2D): void {
  const gradient
    = typeof context.createLinearGradient === 'function'
      ? context.createLinearGradient(
          0,
          0,
          BILIBILI_SHARE_POSTER_SIZE,
          BILIBILI_SHARE_POSTER_SIZE,
        )
      : null

  if (gradient) {
    gradient.addColorStop(0, POSTER_BACKGROUND_START)
    gradient.addColorStop(0.52, POSTER_BACKGROUND_MID)
    gradient.addColorStop(1, POSTER_BACKGROUND_END)
    context.fillStyle = gradient
  }
  else {
    context.fillStyle = POSTER_BACKGROUND_MID
  }

  context.fillRect(
    0,
    0,
    BILIBILI_SHARE_POSTER_SIZE,
    BILIBILI_SHARE_POSTER_SIZE,
  )
}

function drawPosterNoise(context: CanvasRenderingContext2D): void {
  context.save()
  context.globalAlpha = 0.035
  context.fillStyle = WHITE

  let seed = 0x6D2B79F5
  for (let index = 0; index < 720; index++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const x = seed % BILIBILI_SHARE_POSTER_SIZE
    seed = (seed * 1664525 + 1013904223) >>> 0
    const y = seed % BILIBILI_SHARE_POSTER_SIZE
    context.fillRect(x, y, 1, 1)
  }

  context.restore()
}

function drawBrandLogo(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (!image || image.width <= 0 || image.height <= 0)
    return false

  try {
    context.save()
    // The shared branding asset is a mask-colored wordmark; tint it for the dark poster.
    context.filter = 'brightness(0) invert(1)'
    context.drawImage(image, x, y, width, height)
    context.restore()
    return true
  }
  catch {
    context.restore()
    return false
  }
}

function drawPosterTags(
  context: CanvasRenderingContext2D,
  tags: string[],
  x: number,
  y: number,
  maxWidth: number,
): void {
  context.font = '500 20px sans-serif'
  let cursor = x

  for (const tag of tags) {
    const label = fitWithEllipsis(context, tag, 188)
    const width = Math.max(
      64,
      Math.min(220, context.measureText(label).width + 28),
    )
    if (cursor + width > x + maxWidth)
      break

    context.fillStyle = 'rgba(255, 255, 255, .2)'
    roundedRect(context, cursor, y, width, 36, 18)
    context.fill()
    context.fillStyle = 'rgba(255, 255, 255, .88)'
    context.fillText(label, cursor + 14, y + 24)
    cursor += width + 8
  }
}

const defaultLabels: PosterLabels = {
  brand: 'BILIBILI SHARE',
  ownerFallback: 'Video share',
  infoTitle: 'Share information',
  scanHint: 'Scan to open video',
  tagFallback: 'Video share',
  fallbackCover: 'Bilibili video share',
  fromTime: time => `Start at ${time}`,
}

function mergeLabels(labels?: Partial<PosterLabels>): PosterLabels {
  return { ...defaultLabels, ...labels }
}

export async function renderPoster(
  session: VideoShareSession,
  options: RenderPosterOptions = {},
): Promise<RenderPosterResult> {
  if (typeof document === 'undefined')
    throw new Error('Document is unavailable')
  if (!options.qrCanvas)
    throw new Error('QR canvas is unavailable')

  const canvas = options.canvas ?? document.createElement('canvas')
  canvas.width = BILIBILI_SHARE_POSTER_SIZE
  canvas.height = BILIBILI_SHARE_POSTER_SIZE
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('Canvas is unavailable')

  const labels = mergeLabels(options.labels)
  throwIfAborted(options.signal)
  const [cover, logo] = await Promise.all([
    loadCover(session.coverUrl, options.signal),
    loadImage(options.logoUrl ?? '', false, options.signal),
  ])
  throwIfAborted(options.signal)
  const usableCover = canReadCover(cover) ? cover : null
  const foreground = WHITE

  fillPosterBackground(context)
  drawPosterNoise(context)

  const contentX = 72
  const contentWidth = 936

  context.fillStyle = WHITE
  context.font = '700 50px system-ui, sans-serif'
  const titleLines = wrapPosterText(context, session.title, contentWidth, 2)
  titleLines.forEach((line, index) =>
    context.fillText(line, contentX, 110 + index * 62),
  )

  const coverX = contentX
  const coverY = 220
  const coverWidth = contentWidth
  const coverHeight = 398

  // Draw the shadow separately so the cover stays readable while remaining lifted from the dark field.
  context.save()
  context.shadowColor = 'rgba(0, 0, 0, .52)'
  context.shadowBlur = 28
  context.shadowOffsetY = 12
  roundedRect(context, coverX, coverY, coverWidth, coverHeight, 24)
  context.fillStyle = 'rgba(0, 0, 0, .72)'
  context.fill()
  context.restore()

  context.save()
  roundedRect(context, coverX, coverY, coverWidth, coverHeight, 24)
  context.clip()
  const coverDrawn = drawCover(
    context,
    usableCover,
    coverX,
    coverY,
    coverWidth,
    coverHeight,
  )
  if (!coverDrawn) {
    context.fillStyle = '#1b2430'
    context.fillRect(coverX, coverY, coverWidth, coverHeight)
  }

  // A fixed scrim keeps bright covers subordinate to the dark poster, regardless of their source colors.
  context.fillStyle = 'rgba(0, 0, 0, .26)'
  context.fillRect(coverX, coverY, coverWidth, coverHeight)
  const coverGradient
    = typeof context.createLinearGradient === 'function'
      ? context.createLinearGradient(0, coverY, 0, coverY + coverHeight)
      : null
  if (coverGradient) {
    coverGradient.addColorStop(0, 'rgba(0, 0, 0, .04)')
    coverGradient.addColorStop(0.58, 'rgba(0, 0, 0, .12)')
    coverGradient.addColorStop(1, 'rgba(0, 0, 0, .66)')
    context.fillStyle = coverGradient
    context.fillRect(coverX, coverY, coverWidth, coverHeight)
  }

  if (!coverDrawn) {
    context.fillStyle = WHITE
    context.font = '700 36px system-ui, sans-serif'
    context.fillText(
      fitWithEllipsis(context, labels.fallbackCover, 720),
      coverX + 40,
      coverY + coverHeight / 2 + 12,
    )
  }
  context.restore()

  context.save()
  roundedRect(context, coverX, coverY, coverWidth, coverHeight, 24)
  context.strokeStyle = 'rgba(255, 255, 255, .2)'
  context.lineWidth = 2
  context.stroke()
  context.restore()

  const tags = (
    session.tags?.length ? session.tags : [labels.tagFallback]
  ).slice(0, 4)
  drawPosterTags(context, tags, contentX, 650, contentWidth)

  context.fillStyle = 'rgba(255, 255, 255, .16)'
  context.fillRect(contentX, 726, contentWidth, 2)

  const logoX = contentX
  const logoY = 794
  const logoWidth = 150
  const logoHeight = 50
  if (!drawBrandLogo(context, logo, logoX, logoY, logoWidth, logoHeight)) {
    context.fillStyle = WHITE
    context.font = '700 28px system-ui, sans-serif'
    context.fillText(
      fitWithEllipsis(context, labels.brand, logoWidth),
      logoX,
      logoY + 32,
    )
  }

  const metadataX = 260
  context.fillStyle = 'rgba(255, 255, 255, .64)'
  context.font = '500 20px system-ui, sans-serif'
  context.fillText(
    fitWithEllipsis(context, session.owner || labels.ownerFallback, 520),
    metadataX,
    798,
  )
  context.fillStyle = WHITE
  context.font = '700 28px system-ui, sans-serif'
  context.fillText(fitWithEllipsis(context, session.bvid, 520), metadataX, 836)
  if (session.withTimestamp) {
    context.fillStyle = 'rgba(255, 255, 255, .68)'
    context.font = '500 22px system-ui, sans-serif'
    context.fillText(
      fitWithEllipsis(
        context,
        labels.fromTime(formatTimestamp(session.currentTime)),
        520,
      ),
      metadataX,
      876,
    )
  }

  const qrSize = 132
  const qrX = 876
  const qrY = 768
  roundedRect(context, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 16)
  context.fillStyle = 'rgba(255, 255, 255, .96)'
  context.fill()
  context.drawImage(options.qrCanvas, qrX, qrY, qrSize, qrSize)
  context.fillStyle = 'rgba(255, 255, 255, .64)'
  context.font = '500 18px system-ui, sans-serif'
  context.fillText(
    fitWithEllipsis(context, labels.scanHint, 184),
    qrX - 10,
    938,
  )

  if (options.signal?.aborted)
    throw createAbortError()

  return {
    canvas,
    background: `linear-gradient(135deg, ${POSTER_BACKGROUND_START} 0%, ${POSTER_BACKGROUND_MID} 52%, ${POSTER_BACKGROUND_END} 100%)`,
    foreground,
    coverDrawn,
    dataUrl: canvas.toDataURL('image/png'),
  }
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob)
        resolve(blob)
      else reject(new Error('PNG encoding failed'))
    }, 'image/png')
  })
}

export async function copyCanvasImage(
  canvas: HTMLCanvasElement,
  clipboard: Pick<Clipboard, 'write'> | undefined = globalThis.navigator
    ?.clipboard,
  ClipboardItemClass:
    | (new (
      items: Record<string, Blob>,
    ) => ClipboardItem)
    | undefined = globalThis.ClipboardItem,
  options: { isCurrent?: () => boolean } = {},
): Promise<void> {
  if (!clipboard?.write || typeof ClipboardItemClass !== 'function')
    throw new Error('Image clipboard unavailable')

  const blob = await canvasToPngBlob(canvas)
  if (options.isCurrent && !options.isCurrent()) {
    const error = new Error('Share operation is no longer current')
    error.name = 'StaleOperationError'
    throw error
  }

  await clipboard.write([new ClipboardItemClass({ 'image/png': blob })])
  if (options.isCurrent && !options.isCurrent()) {
    const error = new Error('Share operation is no longer current')
    error.name = 'StaleOperationError'
    throw error
  }
}
