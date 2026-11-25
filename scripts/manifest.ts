import fs from 'fs-extra'

import { getManifest } from '../src/manifest.ts'
import { isFirefox, isSafari, log, r } from './utils.ts'

export async function writeManifest() {
  await fs.writeJSON(
    r(
      isFirefox
        ? 'extension-firefox/manifest.json'
        : isSafari
          ? 'extension-safari/manifest.json'
          : 'extension/manifest.json',
    ),
    await getManifest(),
    { spaces: 2 },
  )
  log('pre', 'write manifest.json')
}

writeManifest()
