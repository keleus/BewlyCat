import { Buffer } from 'node:buffer'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import { bold, dim, green, lightBlue, magenta, yellow } from 'kolorist'
import type { TsdownPlugin } from 'tsdown'
import type { Plugin as VitePlugin } from 'vite'

import { isDev, isFirefox, isSafari, log, r } from './utils.ts'

export type ArtifactCategory = 'js' | 'css' | 'html' | 'other'

export interface BundleOutputEntry {
  type: string
  fileName: string
  code?: string
  source?: string | Uint8Array
  moduleIds?: string[]
}

export interface EmittedArtifact {
  file: string
  size: number
  gzipSize?: number
  category: ArtifactCategory
}

export interface BuildSummary {
  fileCount: number
  totalBytes: number
  totalGzipBytes: number
  hasAllGzip: boolean
  totals: Record<ArtifactCategory, number>
}

const MAX_DETAILED_FILES = 10
const CORE_ASSET_PATTERNS = [
  /(?:^|\/)contentScripts\/index\.global\.js$/,
  /(?:^|\/)contentScripts\/main\.js$/,
  /(?:^|\/)options\/index\.html$/,
  /(?:^|\/)options\/index\.js$/,
  /(?:^|\/)options\/host\.css$/,
  /(?:^|\/)chunks\/shadowStyles\.js$/,
  /(?:^|\/)chunks\/contentHostStyles\.js$/,
  /(?:^|\/)chunks\/vendor\.js$/,
]

const INLINE_STYLE_MODULE_RE = /\.(?:css|scss|sass|less|styl)\?inline(?:&|$)/
const recordedSummaries = new Map<string, BuildSummary>()

function getSummaryCacheDir(): string {
  const targetDir = isFirefox ? 'extension-firefox' : isSafari ? 'extension-safari' : 'extension'
  return r('node_modules/.cache/bewly-build-report', targetDir)
}

function toBuffer(output: BundleOutputEntry): Buffer {
  if (output.type === 'chunk') return Buffer.from(output.code ?? '', 'utf8')
  if (typeof output.source === 'string') return Buffer.from(output.source, 'utf8')
  if (output.source instanceof Uint8Array) return Buffer.from(output.source)
  return Buffer.alloc(0)
}

function classifyArtifact(output: BundleOutputEntry): ArtifactCategory {
  const fileName = output.fileName.replaceAll('\\', '/')
  if (
    fileName.endsWith('.css') ||
    /(?:^|\/)chunks\/(?:shadowStyles|contentHostStyles)\.js$/.test(fileName)
  ) {
    return 'css'
  }
  if (
    output.type === 'chunk' &&
    output.moduleIds &&
    output.moduleIds.length > 0 &&
    output.moduleIds.every((id) => INLINE_STYLE_MODULE_RE.test(id))
  ) {
    return 'css'
  }
  if (/\.[cm]?js$/.test(fileName)) return 'js'
  if (fileName.endsWith('.html')) return 'html'
  return 'other'
}

function colorizeByCategory(text: string, category: ArtifactCategory): string {
  switch (category) {
    case 'js':
      return lightBlue(text)
    case 'css':
      return magenta(text)
    case 'html':
      return green(text)
    case 'other':
      return yellow(text)
  }
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

  return entries.map((output) => {
    const filePath = outDir ? resolve(outDir, output.fileName) : output.fileName
    const file = relative(r(), filePath).replaceAll('\\', '/')
    const buffer = toBuffer(output)
    return {
      file,
      size: buffer.byteLength,
      category: classifyArtifact(output),
      ...(computeGzip ? { gzipSize: gzipSync(buffer).byteLength } : {}),
    }
  })
}

export function summarizeArtifacts(artifacts: EmittedArtifact[]): BuildSummary {
  const totals: Record<ArtifactCategory, number> = { js: 0, css: 0, html: 0, other: 0 }
  let totalBytes = 0
  let totalGzipBytes = 0
  let hasAllGzip = true

  for (const item of artifacts) {
    totals[item.category] += item.size
    totalBytes += item.size
    if (item.gzipSize === undefined) hasAllGzip = false
    else totalGzipBytes += item.gzipSize
  }

  return {
    fileCount: artifacts.length,
    totalBytes,
    totalGzipBytes,
    hasAllGzip,
    totals,
  }
}

export function mergeBuildSummaries(summaries: BuildSummary[]): BuildSummary {
  const totals: Record<ArtifactCategory, number> = { js: 0, css: 0, html: 0, other: 0 }
  let fileCount = 0
  let totalBytes = 0
  let totalGzipBytes = 0
  let hasAllGzip = summaries.length > 0

  for (const summary of summaries) {
    fileCount += summary.fileCount
    totalBytes += summary.totalBytes
    totalGzipBytes += summary.totalGzipBytes
    if (!summary.hasAllGzip) hasAllGzip = false
    totals.js += summary.totals.js
    totals.css += summary.totals.css
    totals.html += summary.totals.html
    totals.other += summary.totals.other
  }

  return { fileCount, totalBytes, totalGzipBytes, hasAllGzip, totals }
}

export function clearSavedBuildSummaries() {
  rmSync(getSummaryCacheDir(), { recursive: true, force: true })
}

function recordBuildSummary(targetName: string, summary: BuildSummary, persist: boolean) {
  recordedSummaries.set(targetName, summary)
  if (!persist) return

  const dir = getSummaryCacheDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, `${targetName}.json`), JSON.stringify(summary), 'utf8')
}

export function getRecordedBuildSummary(targetName: string): BuildSummary | undefined {
  return recordedSummaries.get(targetName)
}

export function printBuildReport(artifacts: EmittedArtifact[]) {
  if (artifacts.length === 0) return

  let display = artifacts
  let omittedCount = 0
  let omittedBytes = 0
  let omittedGzipBytes = 0
  let omittedHasAllGzip = true

  if (artifacts.length > MAX_DETAILED_FILES) {
    const primary: EmittedArtifact[] = []
    for (const item of artifacts) {
      if (CORE_ASSET_PATTERNS.some((pattern) => pattern.test(item.file))) {
        primary.push(item)
      } else {
        omittedCount += 1
        omittedBytes += item.size
        if (item.gzipSize === undefined) omittedHasAllGzip = false
        else omittedGzipBytes += item.gzipSize
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
    category: item.category,
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
    console.log(`  ${colorizeByCategory(paddedFile, item.category)}  ${paddedSize}${gzipSuffix}`)
  }

  if (omittedCount > 0) {
    const omittedSummary = omittedHasAllGzip
      ? `${formatKilobytes(omittedBytes)} │ gzip: ${formatKilobytes(omittedGzipBytes)}`
      : formatKilobytes(omittedBytes)
    console.log(dim(`  + ${omittedCount} other assets (${omittedSummary})`))
  }
}

export function printBuildSummary(summary: BuildSummary) {
  if (summary.fileCount === 0) return

  const breakdownParts: string[] = []
  if (summary.totals.js > 0)
    breakdownParts.push(lightBlue(`JS ${formatKilobytes(summary.totals.js)}`))
  if (summary.totals.css > 0)
    breakdownParts.push(magenta(`CSS ${formatKilobytes(summary.totals.css)}`))
  if (summary.totals.html > 0)
    breakdownParts.push(green(`HTML ${formatKilobytes(summary.totals.html)}`))
  if (summary.totals.other > 0)
    breakdownParts.push(yellow(`Other ${formatKilobytes(summary.totals.other)}`))

  const fileCountLabel = `${summary.fileCount} ${summary.fileCount === 1 ? 'file' : 'files'}`
  const parts = [bold(`${fileCountLabel}  ${formatKilobytes(summary.totalBytes)}`)]
  if (summary.hasAllGzip) parts.push(dim(`gzip: ${formatKilobytes(summary.totalGzipBytes)}`))
  if (breakdownParts.length > 0) parts.push(breakdownParts.join(dim(' │ ')))

  log('total', parts.join(dim(' │ ')))
}

export function flushSavedBuildSummaries() {
  const dir = getSummaryCacheDir()
  let files: string[]
  try {
    files = readdirSync(dir).filter((name) => name.endsWith('.json'))
  } catch {
    return
  }

  const summaries = files.map(
    (name) => JSON.parse(readFileSync(resolve(dir, name), 'utf8')) as BuildSummary,
  )
  printBuildSummary(mergeBuildSummaries(summaries))
  clearSavedBuildSummaries()
}

export function createViteBuildReportPlugin(
  targetName: string,
  options: { logLifecycle?: boolean } = {},
): VitePlugin {
  const { logLifecycle = !isDev } = options
  let startTime = 0

  return {
    name: `bewly:build-report:${targetName}`,
    apply: 'build',
    buildStart() {
      startTime = Date.now()
      if (logLifecycle) log(targetName, dim('building...'))
    },
    writeBundle(outputOptions, bundle) {
      const artifacts = collectBundleArtifacts(outputOptions.dir, bundle)
      recordBuildSummary(targetName, summarizeArtifacts(artifacts), logLifecycle)
      printBuildReport(artifacts)
    },
    closeBundle(error) {
      if (logLifecycle && !error)
        log(targetName, `${green('built')} ${dim(`in ${Date.now() - startTime}ms`)}`)
    },
  }
}

export function createTsdownBuildReportCollector(
  entryNames: readonly string[],
  options: { logLifecycle?: boolean } = {},
) {
  const { logLifecycle = !isDev } = options
  const artifactsByEntry = new Map<string, EmittedArtifact[]>()
  let started = false
  let startTime = 0

  return (entryName: string): TsdownPlugin => ({
    name: `bewly:build-report:${entryName}`,
    buildStart() {
      if (!started) {
        started = true
        startTime = Date.now()
        if (logLifecycle) log('bg', dim('building...'))
      }
    },
    writeBundle(outputOptions, bundle) {
      artifactsByEntry.set(entryName, collectBundleArtifacts(outputOptions.dir, bundle))
      if (artifactsByEntry.size < entryNames.length) return

      const merged = entryNames.flatMap((name) => artifactsByEntry.get(name) ?? [])
      recordBuildSummary('bg', summarizeArtifacts(merged), logLifecycle)
      printBuildReport(merged)
      if (logLifecycle) log('bg', `${green('built')} ${dim(`in ${Date.now() - startTime}ms`)}`)
      artifactsByEntry.clear()
      started = false
    },
  })
}
