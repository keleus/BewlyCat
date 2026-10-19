// 在构建时收集实际打包进扩展的第三方依赖及其许可文本，供「关于」页展示。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import fs from 'fs-extra'
import type { Options as TsupOptions } from 'tsup'
import type { Plugin as VitePlugin } from 'vite'

import { isFirefox, isSafari, r } from './utils'

export interface ThirdPartyLicense {
  name: string
  version: string
  license: string
  homepage?: string
  licenseText?: string
}

const extensionDirectory = isFirefox
  ? 'extension-firefox'
  : isSafari ? 'extension-safari' : 'extension'
const NODE_MODULES_SEGMENT = '/node_modules/'
const LICENSE_FILE_PATTERN = /^(?:licen[cs]e|copying|notice)(?:[.\-_].*)?$/i

type EsbuildPlugin = NonNullable<TsupOptions['esbuildPlugins']>[number]

function resolvePackageDirectory(moduleId: string): string | undefined {
  if (moduleId.startsWith('\0'))
    return undefined

  // Vite 的模块 ID 使用 POSIX 分隔符，esbuild 在 Windows 下给出原生路径，这里统一处理。
  const filePath = moduleId.split('?')[0].replaceAll('\\', '/')
  const index = filePath.lastIndexOf(NODE_MODULES_SEGMENT)
  if (index < 0)
    return undefined

  const rest = filePath.slice(index + NODE_MODULES_SEGMENT.length).split('/')
  const nameSegments = rest[0].startsWith('@') ? rest.slice(0, 2) : rest.slice(0, 1)
  return join(filePath.slice(0, index + NODE_MODULES_SEGMENT.length), ...nameSegments)
}

function normalizeLicenseField(pkg: Record<string, any>): string {
  if (typeof pkg.license === 'string')
    return pkg.license
  if (pkg.license?.type)
    return pkg.license.type
  if (Array.isArray(pkg.licenses))
    return pkg.licenses.map((item: any) => item?.type ?? item).join(' OR ')
  return 'UNKNOWN'
}

function normalizeHomepage(pkg: Record<string, any>): string | undefined {
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  const url: string | undefined = pkg.homepage || repository
  if (!url)
    return undefined
  if (/^[\w-]+\/[\w.-]+$/.test(url))
    return `https://github.com/${url}`
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
      .filter(file => LICENSE_FILE_PATTERN.test(file))
      .sort()
    const licenseText = licenseFiles
      .map(file => readFileSync(join(packageDirectory, file), 'utf-8').trim())
      .filter(Boolean)
      .join('\n\n')

    return {
      name: pkg.name,
      version: pkg.version,
      license: normalizeLicenseField(pkg),
      homepage: normalizeHomepage(pkg),
      licenseText: licenseText || undefined,
    }
  }
  catch {
    return undefined
  }
}

async function writeLicenses(buildName: string, packageDirectories: Iterable<string>) {
  const licenses = new Map<string, ThirdPartyLicense>()
  for (const directory of packageDirectories) {
    const license = readLicense(directory)
    if (license)
      licenses.set(`${license.name}@${license.version}`, license)
  }

  const packages = [...licenses.values()].sort((a, b) => a.name.localeCompare(b.name))
  // 每个构建写入独立文件，避免开发模式下并行构建互相覆盖。
  await fs.outputJson(
    r(extensionDirectory, 'assets', `third-party-licenses.${buildName}.json`),
    { packages },
  )
}

export function thirdPartyLicensesVitePlugin(buildName: string): VitePlugin {
  return {
    name: 'third-party-licenses',
    apply: 'build',
    async generateBundle(_options, bundle) {
      const packageDirectories = new Set<string>()
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk')
          continue
        for (const [moduleId, info] of Object.entries(output.modules)) {
          // 被 tree-shaking 完全移除的模块不计入。
          if (info.renderedLength === 0)
            continue
          const directory = resolvePackageDirectory(moduleId)
          if (directory)
            packageDirectories.add(directory)
        }
      }
      await writeLicenses(buildName, packageDirectories)
    },
  }
}

export function thirdPartyLicensesEsbuildPlugin(buildName: string): EsbuildPlugin {
  return {
    name: 'third-party-licenses',
    setup(build) {
      const packageDirectories = new Set<string>()
      build.onStart(() => {
        packageDirectories.clear()
      })
      build.onLoad({ filter: /[\\/]node_modules[\\/]/ }, (args) => {
        const directory = resolvePackageDirectory(args.path)
        if (directory)
          packageDirectories.add(directory)
        return undefined
      })
      build.onEnd(async (result) => {
        if (result.errors.length === 0)
          await writeLicenses(buildName, packageDirectories)
      })
    },
  }
}
