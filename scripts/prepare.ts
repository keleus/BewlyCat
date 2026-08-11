// generate stub index.html files for dev entry
import { execSync } from 'node:child_process'
import process from 'node:process'

import chokidar from 'chokidar'
import fs from 'fs-extra'

import { isDev, isFirefox, isSafari, log, r } from './utils'

const extensionDirectory = isFirefox
  ? 'extension-firefox'
  : isSafari ? 'extension-safari' : 'extension'
const contributorsImageUrl = 'https://contrib.rocks/image?repo=keleus/BewlyCat'
const contributorsImagePath = r(extensionDirectory, 'assets/contributors.svg')

/**
 * Stub index.html to use Vite in development
 */
async function stubIndexHtml() {
  const views = [
    'options',
    'popup',
  ]

  for (const view of views) {
    await fs.ensureDir(r(
      isFirefox
        ? `extension-firefox/dist/${view}`
        : isSafari ? `extension-safari/dist/${view}` : `extension/dist/${view}`,
    ))
    let data = await fs.readFile(r(`src/${view}/index.html`), 'utf-8')
    data = data
      .replace('"./main.ts"', `"/${view}/main.ts.js"`)
      .replace('<div id="app"></div>', '<div id="app">Vite server did not start</div>')
    await fs.writeFile(r(
      isFirefox
        ? `extension-firefox/dist/${view}/index.html`
        : isSafari ? `extension-safari/dist/${view}/index.html` : `extension/dist/${view}/index.html`,
    ), data, 'utf-8')
    log('PRE', `stub ${view}`)
  }
}

function writeManifest() {
  execSync('npx esno ./scripts/manifest.ts', { stdio: 'inherit' })
}

async function downloadContributorsImage() {
  const temporaryPath = `${contributorsImagePath}.tmp`
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

    await fs.writeFile(temporaryPath, image)
    await fs.move(temporaryPath, contributorsImagePath, { overwrite: true })
    log('PRE', 'download contributors image')
  }
  catch (error) {
    await fs.remove(temporaryPath)
    throw error
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
    await stubIndexHtml()
    chokidar.watch(r('src/**/*.html'))
      .on('change', () => {
        stubIndexHtml()
      })
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
