import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { bgCyan, black } from 'kolorist'

export const port = Number.parseInt(process.env.PORT || '') || 3303
export const r = (...args: string[]) => resolve(dirname(fileURLToPath(import.meta.url)), '..', ...args)
export const isDev = process.env.NODE_ENV !== 'production'
export const isWin = process.platform === 'win32'
export const isFirefox = process.env.FIREFOX === 'true'
export const isSafari = process.env.SAFARI === 'true'

export function log(name: string, message: string) {
  console.log(black(bgCyan(` ${name} `)), message)
}

/**
 * Generate a unique build hash based on current timestamp
 */
export function generateBuildHash(): string {
  const timestamp = Date.now()
  const hash = timestamp.toString(36).slice(-6)
  return hash
}
