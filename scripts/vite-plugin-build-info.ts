import fs from 'fs-extra'
import type { Plugin } from 'vite'

import { generateBuildHash, isDev, isFirefox, isSafari, log, r } from './utils'

/**
 * Vite plugin to generate build-info.json on every build
 * This ensures the dev build hash is updated whenever Vite rebuilds
 */
export function BuildInfoPlugin(): Plugin {
  return {
    name: 'build-info-plugin',
    // Use buildStart hook to generate before build
    buildStart() {
      if (isDev) {
        const buildHash = generateBuildHash()
        const buildInfo = {
          buildHash,
          buildTime: Date.now(),
        }

        const targetDir = isFirefox
          ? 'extension-firefox/dist'
          : isSafari
            ? 'extension-safari/dist'
            : 'extension/dist'

        fs.ensureDirSync(r(targetDir))
        fs.writeJSONSync(r(`${targetDir}/build-info.json`), buildInfo, { spaces: 2 })
        log('BUILD-INFO', `Generated build-info.json with hash: ${buildHash}`)
      }
    },
  }
}
