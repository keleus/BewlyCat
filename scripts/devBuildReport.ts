import { Buffer } from 'node:buffer'
import { relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import { cyan, dim } from 'kolorist'

import { r } from './utils.ts'

export interface BundleOutputEntry {
  type: string
  fileName: string
  code?: string
  source?: string | Uint8Array
}

export interface EmittedArtifact {
  file: string
  size: number
  gzipSize?: number
}

const MAX_DETAILED_FILES = 10
const CORE_ASSET_PATTERNS = [
  /(?:^|\/)index\.html$/,
  /(?:^|\/)assets\/host\.css$/,
  /(?:^|\/)assets\/shadow\.css$/,
  /(?:^|\/)assets\/index\.js$/,
  /(?:^|\/)assets\/vendor\.js$/,
]

function toBuffer(output: BundleOutputEntry): Buffer {
  if (output.type === 'chunk') return Buffer.from(output.code ?? '', 'utf8')
  if (typeof output.source === 'string') return Buffer.from(output.source, 'utf8')
  if (output.source instanceof Uint8Array) return Buffer.from(output.source)
  return Buffer.alloc(0)
}

function formatKilobytes(bytes: number): string {
  return `${(bytes / 1000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kB`
}

export function collectBundleArtifacts(
  outDir: string | undefined,
  bundle: Record<string, BundleOutputEntry>,
  options: { computeGzip?: boolean } = {},
): EmittedArtifact[] {
  const { computeGzip = true } = options
  const entries = Object.values(bundle)
  const summarize = entries.length > MAX_DETAILED_FILES

  return entries.map((output) => {
    const filePath = outDir ? resolve(outDir, output.fileName) : output.fileName
    const file = relative(r(), filePath).replaceAll('\\', '/')
    const buffer = toBuffer(output)
    const shouldComputeGzip =
      computeGzip && (!summarize || CORE_ASSET_PATTERNS.some((pattern) => pattern.test(file)))
    return {
      file,
      size: buffer.byteLength,
      ...(shouldComputeGzip ? { gzipSize: gzipSync(buffer).byteLength } : {}),
    }
  })
}

export function printEmittedArtifacts(artifacts: EmittedArtifact[]) {
  if (artifacts.length === 0) return

  let display = artifacts
  let omittedCount = 0
  let omittedBytes = 0

  if (artifacts.length > MAX_DETAILED_FILES) {
    const primary: EmittedArtifact[] = []
    for (const item of artifacts) {
      if (CORE_ASSET_PATTERNS.some((pattern) => pattern.test(item.file))) {
        primary.push(item)
      } else {
        omittedCount += 1
        omittedBytes += item.size
      }
    }
    if (primary.length > 0) {
      primary.sort(
        (a, b) =>
          CORE_ASSET_PATTERNS.findIndex((p) => p.test(a.file)) -
          CORE_ASSET_PATTERNS.findIndex((p) => p.test(b.file)),
      )
      display = primary
    }
  }

  const formatted = display.map((item) => ({
    file: item.file,
    sizeText: formatKilobytes(item.size),
    gzipText: item.gzipSize !== undefined ? formatKilobytes(item.gzipSize) : undefined,
  }))

  const fileWidth = Math.max(...formatted.map((item) => item.file.length))
  const sizeWidth = Math.max(...formatted.map((item) => item.sizeText.length))
  const gzipWidth = Math.max(...formatted.map((item) => item.gzipText?.length ?? 0))

  for (const item of formatted) {
    const paddedFile = item.file.padEnd(fileWidth)
    const paddedSize = item.sizeText.padStart(sizeWidth)
    const gzipSuffix = item.gzipText ? dim(` │ gzip: ${item.gzipText.padStart(gzipWidth)}`) : ''
    console.log(`  ${cyan(paddedFile)}  ${paddedSize}${gzipSuffix}`)
  }

  if (omittedCount > 0) {
    console.log(dim(`  + ${omittedCount} other assets (${formatKilobytes(omittedBytes)})`))
  }
}
