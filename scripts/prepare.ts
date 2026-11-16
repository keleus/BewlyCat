import { execSync } from 'node:child_process'
import process from 'node:process'

import chokidar from 'chokidar'
import fs from 'fs-extra'

import { isDev, isFirefox, isSafari, log, r } from './utils'

const extensionDirectory = isFirefox
  ? 'extension-firefox'
  : isSafari ? 'extension-safari' : 'extension'
const contributorsImageUrl = 'https://contrib.rocks/image?repo=keleus/BewlyCat'
const contributorsImageCachePath = r('.cache/bewlycat/contributors.svg')
const contributorsImagePath = r(extensionDirectory, 'assets/contributors.svg')

function writeManifest() {
  execSync('esno ./scripts/manifest.ts', { stdio: 'inherit' })
}

async function hasUsableImage(path: string): Promise<boolean> {
  try {
    const stats = await fs.stat(path)
    return stats.isFile() && stats.size > 0
  }
  catch {
    return false
  }
}

async function downloadContributorsImage() {
  const temporaryPath = `${contributorsImageCachePath}.${process.pid}.tmp`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch(contributorsImageUrl, {
      headers: { Accept: 'image/svg+xml' },
      signal: controller.signal,
    })

    if (!response.ok)
      throw new Error(`Contributor image request failed with HTTP ${response.status}`)

    const contentType = response.headers.get('content-type')
    if (!contentType?.toLowerCase().startsWith('image/svg+xml'))
      throw new TypeError(`Unexpected contributor image content type: ${contentType ?? 'missing'}`)

    const image = new Uint8Array(await response.arrayBuffer())
    if (image.length === 0)
      throw new Error('Downloaded contributor image is empty')

    await fs.ensureDir(r('.cache/bewlycat'))
    await fs.writeFile(temporaryPath, image)
    await fs.move(temporaryPath, contributorsImageCachePath, { overwrite: true })
    return true
  }
  catch (error) {
    await fs.remove(temporaryPath)

    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[PRE] could not download contributors image; About page will use the cloud image: ${message}`)
    return false
  }
  finally {
    clearTimeout(timeout)
  }
}

// 开发模式不联网：有缓存就直接用，没有则留给「关于」页在运行时回退到云端图片。
// 生产构建只在本地没有可用图片时才下载，避免每次打包都等待网络。
async function prepareContributorsImage() {
  if (await hasUsableImage(contributorsImageCachePath)) {
    await fs.copy(contributorsImageCachePath, contributorsImagePath, { overwrite: true })
    log('PRE', 'use cached contributors image')
    return
  }

  if (isDev) {
    log('PRE', 'skip contributors image download in dev; About page will use the cloud image')
    return
  }

  if (await downloadContributorsImage()) {
    await fs.copy(contributorsImageCachePath, contributorsImagePath, { overwrite: true })
    log('PRE', 'download contributors image')
  }
}

async function prepare() {
  fs.ensureDirSync(r(extensionDirectory))
  fs.copySync(r('assets'), r(extensionDirectory, 'assets'))
  await prepareContributorsImage()
  writeManifest()

  if (isDev) {
    chokidar.watch([r('src/manifest.ts'), r('package.json')])
      .on('change', () => {
        writeManifest()
      })
  }
}

prepare().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
