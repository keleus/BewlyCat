import { Buffer } from 'node:buffer'
import { crc32 as nodeCrc32, deflateSync, inflateSync } from 'node:zlib'

const COMPRESSED_MARKER = '<!-- bewlycat-compressed -->'
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const TARGET_AVATAR_SIZE = 64
const MAX_PALETTE_COLORS = 256

interface DecodedPng {
  width: number
  height: number
  bitDepth: number
  colorType: number
  interlace: number
  palette?: Buffer
  transparency?: Buffer
  idatChunks: Buffer[]
}

interface ColorBucketEntry {
  r: number
  g: number
  b: number
  count: number
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function parsePngChunks(raw: Buffer): DecodedPng | undefined {
  if (raw.length < 33 || !raw.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let compression = 0
  let filter = 0
  let interlace = 0
  let hasIhdr = false
  let palette: Buffer | undefined
  let transparency: Buffer | undefined
  const idatChunks: Buffer[] = []

  let offset = 8
  while (offset + 12 <= raw.length) {
    const length = raw.readUInt32BE(offset)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > raw.length) return undefined

    const type = raw.subarray(offset + 4, dataStart).toString('latin1')
    const payload = raw.subarray(dataStart, dataEnd)

    if (type === 'IHDR') {
      if (length !== 13) return undefined
      width = payload.readUInt32BE(0)
      height = payload.readUInt32BE(4)
      bitDepth = payload[8]
      colorType = payload[9]
      compression = payload[10]
      filter = payload[11]
      interlace = payload[12]
      hasIhdr = true
    } else if (type === 'PLTE') {
      palette = payload
    } else if (type === 'tRNS') {
      transparency = payload
    } else if (type === 'IDAT') {
      idatChunks.push(payload)
    } else if (type === 'IEND') {
      break
    }

    offset = dataEnd + 4
  }

  if (
    !hasIhdr ||
    width === 0 ||
    height === 0 ||
    compression !== 0 ||
    filter !== 0 ||
    interlace !== 0 ||
    idatChunks.length === 0
  )
    return undefined

  if (bitDepth !== 8 && bitDepth !== 16) return undefined

  if (![0, 2, 3, 4, 6].includes(colorType)) return undefined

  if (colorType === 3 && (!palette || bitDepth !== 8)) return undefined

  return { width, height, bitDepth, colorType, interlace, palette, transparency, idatChunks }
}

function unfilterScanlines(
  data: Buffer,
  width: number,
  height: number,
  bytesPerPixel: number,
): Buffer | undefined {
  const stride = width * bytesPerPixel
  if (data.length < height * (stride + 1)) return undefined

  const output = Buffer.allocUnsafe(height * stride)
  let sourceOffset = 0

  for (let y = 0; y < height; y++) {
    const filterType = data[sourceOffset++]
    const rowStart = y * stride
    const prevRowStart = (y - 1) * stride

    for (let x = 0; x < stride; x++) {
      const rawByte = data[sourceOffset++]
      const left = x >= bytesPerPixel ? output[rowStart + x - bytesPerPixel] : 0
      const up = y > 0 ? output[prevRowStart + x] : 0
      const upLeft = y > 0 && x >= bytesPerPixel ? output[prevRowStart + x - bytesPerPixel] : 0

      let value = rawByte
      if (filterType === 1) value = (rawByte + left) & 0xff
      else if (filterType === 2) value = (rawByte + up) & 0xff
      else if (filterType === 3) value = (rawByte + ((left + up) >> 1)) & 0xff
      else if (filterType === 4) value = (rawByte + paethPredictor(left, up, upLeft)) & 0xff
      else if (filterType !== 0) return undefined

      output[rowStart + x] = value
    }
  }

  return output
}

function decodePngToRgb(
  raw: Buffer,
): { width: number; height: number; pixels: Uint8Array } | undefined {
  const png = parsePngChunks(raw)
  if (!png) return undefined

  const channelsByColorType: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const channels = channelsByColorType[png.colorType]
  const sampleBytes = png.bitDepth / 8
  const bytesPerPixel = channels * sampleBytes

  let inflated: Buffer
  try {
    inflated = inflateSync(Buffer.concat(png.idatChunks))
  } catch {
    return undefined
  }

  const scanlines = unfilterScanlines(inflated, png.width, png.height, bytesPerPixel)
  if (!scanlines) return undefined

  const pixelCount = png.width * png.height
  const pixels = new Uint8Array(pixelCount * 3)
  const trns = png.transparency

  for (let i = 0; i < pixelCount; i++) {
    const inOffset = i * bytesPerPixel
    const outOffset = i * 3
    let r = 255
    let g = 255
    let b = 255
    let alpha = 255

    if (png.colorType === 0) {
      const gray = scanlines[inOffset]
      r = gray
      g = gray
      b = gray
      if (trns && trns.length >= 2) {
        const key = png.bitDepth === 16 ? scanlines.readUInt16BE(inOffset) : gray
        if (key === trns.readUInt16BE(0)) alpha = 0
      }
    } else if (png.colorType === 2) {
      r = scanlines[inOffset]
      g = scanlines[inOffset + sampleBytes]
      b = scanlines[inOffset + sampleBytes * 2]
      if (trns && trns.length >= 6) {
        const sr = png.bitDepth === 16 ? scanlines.readUInt16BE(inOffset) : r
        const sg = png.bitDepth === 16 ? scanlines.readUInt16BE(inOffset + sampleBytes) : g
        const sb = png.bitDepth === 16 ? scanlines.readUInt16BE(inOffset + sampleBytes * 2) : b
        if (
          sr === trns.readUInt16BE(0) &&
          sg === trns.readUInt16BE(2) &&
          sb === trns.readUInt16BE(4)
        )
          alpha = 0
      }
    } else if (png.colorType === 3) {
      const paletteIndex = scanlines[inOffset]
      const paletteOffset = paletteIndex * 3
      if (!png.palette || paletteOffset + 2 >= png.palette.length) return undefined
      r = png.palette[paletteOffset]
      g = png.palette[paletteOffset + 1]
      b = png.palette[paletteOffset + 2]
      if (trns && paletteIndex < trns.length) alpha = trns[paletteIndex]
    } else if (png.colorType === 4) {
      const gray = scanlines[inOffset]
      r = gray
      g = gray
      b = gray
      alpha = scanlines[inOffset + sampleBytes]
    } else {
      r = scanlines[inOffset]
      g = scanlines[inOffset + sampleBytes]
      b = scanlines[inOffset + sampleBytes * 2]
      alpha = scanlines[inOffset + sampleBytes * 3]
    }

    if (alpha < 255) {
      const inv = 255 - alpha
      r = Math.round((r * alpha + 255 * inv) / 255)
      g = Math.round((g * alpha + 255 * inv) / 255)
      b = Math.round((b * alpha + 255 * inv) / 255)
    }

    pixels[outOffset] = r
    pixels[outOffset + 1] = g
    pixels[outOffset + 2] = b
  }

  return { width: png.width, height: png.height, pixels }
}

function resizeRgbArea(
  pixels: Uint8Array,
  srcW: number,
  srcH: number,
  dstSize: number,
): Uint8Array {
  if (srcW === dstSize && srcH === dstSize) return pixels

  const out = new Uint8Array(dstSize * dstSize * 3)
  for (let dy = 0; dy < dstSize; dy++) {
    const y0 = Math.floor((dy * srcH) / dstSize)
    const y1 = Math.max(y0 + 1, Math.floor(((dy + 1) * srcH) / dstSize))
    for (let dx = 0; dx < dstSize; dx++) {
      const x0 = Math.floor((dx * srcW) / dstSize)
      const x1 = Math.max(x0 + 1, Math.floor(((dx + 1) * srcW) / dstSize))
      let sr = 0
      let sg = 0
      let sb = 0
      let count = 0

      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const offset = (sy * srcW + sx) * 3
          sr += pixels[offset]
          sg += pixels[offset + 1]
          sb += pixels[offset + 2]
          count++
        }
      }

      const outOffset = (dy * dstSize + dx) * 3
      out[outOffset] = Math.round(sr / count)
      out[outOffset + 1] = Math.round(sg / count)
      out[outOffset + 2] = Math.round(sb / count)
    }
  }

  return out
}

function maskOutsideCircle(pixels: Uint8Array, size: number): void {
  const center = (size - 1) / 2
  const radiusSq = (size / 2 + 1.5) ** 2

  for (let y = 0; y < size; y++) {
    const dy = y - center
    for (let x = 0; x < size; x++) {
      const dx = x - center
      if (dx * dx + dy * dy <= radiusSq) continue
      const offset = (y * size + x) * 3
      pixels[offset] = 255
      pixels[offset + 1] = 255
      pixels[offset + 2] = 255
    }
  }
}

function buildQuantizedPalette(pixels: Uint8Array): Array<[number, number, number]> {
  const unique = new Map<number, ColorBucketEntry>()
  for (let i = 0; i < pixels.length; i += 3) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const key = (r << 16) | (g << 8) | b
    const existing = unique.get(key)
    if (existing) existing.count++
    else unique.set(key, { r, g, b, count: 1 })
  }

  const entries = [...unique.values()]
  if (entries.length <= MAX_PALETTE_COLORS)
    return entries.map((entry) => [entry.r, entry.g, entry.b])

  const boxes: ColorBucketEntry[][] = [entries]
  while (boxes.length < MAX_PALETTE_COLORS) {
    let bestBoxIndex = -1
    let bestScore = -1
    let bestChannel: 'r' | 'g' | 'b' = 'r'

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      if (box.length <= 1) continue

      let minR = 255
      let maxR = 0
      let minG = 255
      let maxG = 0
      let minB = 255
      let maxB = 0
      let totalCount = 0

      for (const entry of box) {
        if (entry.r < minR) minR = entry.r
        if (entry.r > maxR) maxR = entry.r
        if (entry.g < minG) minG = entry.g
        if (entry.g > maxG) maxG = entry.g
        if (entry.b < minB) minB = entry.b
        if (entry.b > maxB) maxB = entry.b
        totalCount += entry.count
      }

      const rangeR = maxR - minR
      const rangeG = maxG - minG
      const rangeB = maxB - minB
      const maxRange = Math.max(rangeR, rangeG, rangeB)
      if (maxRange === 0) continue

      const score = maxRange * Math.sqrt(totalCount)
      if (score > bestScore) {
        bestScore = score
        bestBoxIndex = i
        bestChannel = rangeR === maxRange ? 'r' : rangeG === maxRange ? 'g' : 'b'
      }
    }

    if (bestBoxIndex === -1) break

    const targetBox = boxes.splice(bestBoxIndex, 1)[0]
    targetBox.sort((a, b) => a[bestChannel] - b[bestChannel])
    const mid = Math.floor(targetBox.length / 2)
    boxes.push(targetBox.slice(0, mid), targetBox.slice(mid))
  }

  return boxes.map((box) => {
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let weight = 0
    for (const entry of box) {
      sumR += entry.r * entry.count
      sumG += entry.g * entry.count
      sumB += entry.b * entry.count
      weight += entry.count
    }
    return [Math.round(sumR / weight), Math.round(sumG / weight), Math.round(sumB / weight)]
  })
}

function makePngChunk(type: string, payload: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'latin1')
  const chunk = Buffer.allocUnsafe(12 + payload.length)
  chunk.writeUInt32BE(payload.length, 0)
  typeBytes.copy(chunk, 4)
  payload.copy(chunk, 8)
  const crc = nodeCrc32(chunk.subarray(4, 8 + payload.length)) >>> 0
  chunk.writeUInt32BE(crc, 8 + payload.length)
  return chunk
}

function encodeIndexedPng(pixels: Uint8Array, size: number): Buffer {
  const palette = buildQuantizedPalette(pixels)
  const colorCache = new Map<number, number>()
  const scanlines = Buffer.allocUnsafe(size * (size + 1))

  let pixelIndex = 0
  let outOffset = 0
  for (let y = 0; y < size; y++) {
    scanlines[outOffset++] = 0
    for (let x = 0; x < size; x++) {
      const r = pixels[pixelIndex++]
      const g = pixels[pixelIndex++]
      const b = pixels[pixelIndex++]
      const key = (r << 16) | (g << 8) | b

      let paletteIndex = colorCache.get(key)
      if (paletteIndex === undefined) {
        let bestDistance = Infinity
        paletteIndex = 0
        for (let i = 0; i < palette.length; i++) {
          const [pr, pg, pb] = palette[i]
          const dr = r - pr
          const dg = g - pg
          const db = b - pb
          const dist = dr * dr + dg * dg + db * db
          if (dist < bestDistance) {
            bestDistance = dist
            paletteIndex = i
          }
        }
        colorCache.set(key, paletteIndex)
      }
      scanlines[outOffset++] = paletteIndex
    }
  }

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 3
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const plte = Buffer.allocUnsafe(palette.length * 3)
  for (let i = 0; i < palette.length; i++) {
    plte[i * 3] = palette[i][0]
    plte[i * 3 + 1] = palette[i][1]
    plte[i * 3 + 2] = palette[i][2]
  }

  const idat = deflateSync(scanlines, { level: 9 })
  return Buffer.concat([
    PNG_SIGNATURE,
    makePngChunk('IHDR', ihdr),
    makePngChunk('PLTE', plte),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ])
}

function optimizeEmbeddedPng(raw: Buffer): Buffer {
  const decoded = decodePngToRgb(raw)
  if (!decoded) return raw

  const resized = resizeRgbArea(decoded.pixels, decoded.width, decoded.height, TARGET_AVATAR_SIZE)
  maskOutsideCircle(resized, TARGET_AVATAR_SIZE)
  const reencoded = encodeIndexedPng(resized, TARGET_AVATAR_SIZE)
  return reencoded.length < raw.length ? reencoded : raw
}

export function isCompressedContributorsSvg(svg: string): boolean {
  return svg.includes(COMPRESSED_MARKER)
}

/**
 * 压缩 contrib.rocks 下载的贡献者 SVG：将内嵌 PNG 头像转为 64x64 8-bit 索引 PNG，
 * 并去重 pattern/defs 结构。若上游 SVG 结构变化无法完整匹配，仍保留图像级压缩结果。
 */
export function compressContributorsSvg(svg: string): string {
  if (isCompressedContributorsSvg(svg)) return svg

  const normalizedMediaSvg = svg.replace(
    /data:(image\/[^;]+);base64,([A-Za-z0-9+/=\s]+)/g,
    (_full, mime: string, base64Body: string) => {
      const cleanedBase64 = base64Body.replaceAll(/\s+/g, '')
      if (mime !== 'image/png') return `data:${mime};base64,${cleanedBase64}`

      try {
        const rawPng = Buffer.from(cleanedBase64, 'base64')
        const optimizedPng = optimizeEmbeddedPng(rawPng)
        return `data:image/png;base64,${optimizedPng.toString('base64')}`
      } catch {
        return `data:${mime};base64,${cleanedBase64}`
      }
    },
  )

  const outerMatch = normalizedMediaSvg.match(
    /<svg\b[^>]*\swidth="(\d+)"[^>]*\sheight="(\d+)"[^>]*\sviewBox="([^"]+)"/,
  )
  const totalImages = (normalizedMediaSvg.match(/<image\b/g) ?? []).length
  const itemPattern =
    /<svg\s+x="(\d+)"\s+y="(\d+)"\s+width="64"\s+height="64">(?:\\n|\s)*<title>([^<]*)<\/title>\s*<circle[^>]*\/>\s*<defs>\s*<pattern[^>]*>\s*<image[^>]*?(?:xlink:)?href="(data:image\/[^"]+)"[^>]*\/>\s*<\/pattern>\s*<\/defs>\s*<\/svg>/g
  const items = [...normalizedMediaSvg.matchAll(itemPattern)]

  if (!outerMatch || items.length === 0 || items.length !== totalImages)
    return `${COMPRESSED_MARKER}\n${normalizedMediaSvg}`

  const [, width, height, viewBox] = outerMatch
  const lines = [
    COMPRESSED_MARKER,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">`,
    '<defs><clipPath id="c"><circle cx="32" cy="32" r="32"/></clipPath></defs>',
  ]

  for (const [, x, y, title, dataUri] of items) {
    lines.push(
      `<g transform="translate(${x},${y})"><title>${title.trim()}</title><image width="64" height="64" clip-path="url(#c)" href="${dataUri}"/><circle cx="32" cy="32" r="32" fill="none" stroke="#c0c0c0"/></g>`,
    )
  }

  lines.push('</svg>', '')
  return lines.join('\n')
}
