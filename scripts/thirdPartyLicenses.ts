// 在构建时收集实际打包进扩展的第三方依赖及其许可文本，供「关于」页展示。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import fs from 'fs-extra'
import type { TsdownPlugin } from 'tsdown'
import type { Plugin as VitePlugin } from 'vite'

import { isFirefox, isSafari, r } from './utils.ts'

export interface ThirdPartyLicense {
  name: string
  version: string
  license: string
  homepage?: string
  licenseText?: string
}

interface BundleChunkLike {
  type: string
  modules?: Record<string, { renderedLength: number }>
}

const extensionDirectory = isFirefox
  ? 'extension-firefox'
  : isSafari
    ? 'extension-safari'
    : 'extension'
const NODE_MODULES_SEGMENT = '/node_modules/'
const LICENSE_FILE_PATTERN = /^(?:licen[cs]e|copying|notice)(?:[.\-_].*)?$/i

function resolvePackageDirectory(moduleId: string): string | undefined {
  if (moduleId.startsWith('\0')) return undefined

  // 统一为 POSIX 分隔符，兼容 Windows 原生路径。
  const filePath = moduleId.split('?')[0].replaceAll('\\', '/')
  const index = filePath.lastIndexOf(NODE_MODULES_SEGMENT)
  if (index < 0) return undefined

  const rest = filePath.slice(index + NODE_MODULES_SEGMENT.length).split('/')
  const nameSegments = rest[0].startsWith('@') ? rest.slice(0, 2) : rest.slice(0, 1)
  return join(filePath.slice(0, index + NODE_MODULES_SEGMENT.length), ...nameSegments)
}

function normalizeLicenseField(pkg: Record<string, any>): string {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license?.type) return pkg.license.type
  if (Array.isArray(pkg.licenses))
    return pkg.licenses.map((item: any) => item?.type ?? item).join(' OR ')
  return 'UNKNOWN'
}

function normalizeHomepage(pkg: Record<string, any>): string | undefined {
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  const url: string | undefined = pkg.homepage || repository
  if (!url) return undefined
  if (/^[\w-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`
  return url
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^github:/, 'https://github.com/')
    .replace(/\.git(?=$|#)/, '')
}

function readLicense(packageDirectory: string): ThirdPartyLicense | undefined {
  try {
    const pkg = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf-8'))
    const licenseFiles = readdirSync(packageDirectory)
      .filter((file) => LICENSE_FILE_PATTERN.test(file))
      .sort()
    const licenseText = licenseFiles
      .map((file) => readFileSync(join(packageDirectory, file), 'utf-8').trim())
      .filter(Boolean)
      .join('\n\n')

    return {
      name: pkg.name,
      version: pkg.version,
      license: normalizeLicenseField(pkg),
      homepage: normalizeHomepage(pkg),
      licenseText: licenseText || undefined,
    }
  } catch {
    return undefined
  }
}

async function writeLicenses(buildName: string, packageDirectories: Iterable<string>) {
  const licenses = new Map<string, ThirdPartyLicense>()
  for (const directory of packageDirectories) {
    const license = readLicense(directory)
    if (license) licenses.set(`${license.name}@${license.version}`, license)
  }

  const packages = [...licenses.values()].sort((a, b) => a.name.localeCompare(b.name))
  // 每个构建写入独立文件，避免开发模式下并行构建互相覆盖。
  await fs.outputJson(r(extensionDirectory, 'assets', `third-party-licenses.${buildName}.json`), {
    packages,
  })
}

function collectPackageDirectories(bundle: Record<string, BundleChunkLike>): Set<string> {
  const packageDirectories = new Set<string>()
  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk' || !output.modules) continue
    for (const [moduleId, info] of Object.entries(output.modules)) {
      // 被 tree-shaking 完全移除的模块不计入。
      if (info.renderedLength === 0) continue
      const directory = resolvePackageDirectory(moduleId)
      if (directory) packageDirectories.add(directory)
    }
  }
  return packageDirectories
}

export function thirdPartyLicensesVitePlugin(buildName: string): VitePlugin {
  return {
    name: 'third-party-licenses',
    apply: 'build',
    async generateBundle(_options, bundle) {
      await writeLicenses(buildName, collectPackageDirectories(bundle))
    },
  }
}

export function createThirdPartyLicensesTsdownCollector(buildName: string) {
  const packagesByEntry = new Map<string, Set<string>>()
  let writeQueue = Promise.resolve()

  return (entryName: string): TsdownPlugin => ({
    name: `third-party-licenses:${entryName}`,
    generateBundle(_options, bundle) {
      packagesByEntry.set(entryName, collectPackageDirectories(bundle))
      writeQueue = writeQueue.then(async () => {
        const merged = new Set<string>()
        for (const directories of packagesByEntry.values()) {
          for (const directory of directories) merged.add(directory)
        }
        await writeLicenses(buildName, merged)
      })
      return writeQueue
    },
  })
}
