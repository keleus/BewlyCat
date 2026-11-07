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
    await fs.copy(contributorsImageCachePath, contributorsImagePath, { overwrite: true })
    log('PRE', 'download contributors image')
  }
  catch (error) {
    await fs.remove(temporaryPath)

    if (await fs.pathExists(contributorsImageCachePath)) {
      await fs.copy(contributorsImageCachePath, contributorsImagePath, { overwrite: true })
      log('PRE', 'use cached contributors image')
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[PRE] no cached contributors image available; use the cloud image at runtime: ${message}`)
  }
  finally {
    clearTimeout(timeout)
  }
}

async function prepare() {
  fs.ensureDirSync(r(extensionDirectory))
  fs.copySync(r('assets'), r(extensionDirectory, 'assets'))
  await downloadContributorsImage()
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
