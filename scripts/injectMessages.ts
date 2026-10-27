import { readdirSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'

import type { Plugin } from 'vite'

import { r } from './utils'

const VIRTUAL_ID = 'virtual:bewly-inject-messages'
const RESOLVED_ID = `\0${VIRTUAL_ID}`
const LOCALES_DIR = r('src/_locales')

// The page-world script only needs the flat `inject:` section of each locale.
// Bundling vue-i18n with every message made up most of inject.global.js, which
// runs in every Bilibili frame alongside the page's own scripts.
function parseInjectSection(file: string): Record<string, string> {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const start = lines.findIndex(line => line === 'inject:')
  if (start === -1)
    throw new Error(`[inject-messages] Missing top-level "inject:" section in ${file}`)

  const messages: Record<string, string> = {}
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index]
    if (!line.trim() || /^\s*#/.test(line))
      continue
    if (!/^\s/.test(line))
      break

    const match = line.match(/^ {2}([\w-]+): (.+)$/)
    if (!match)
      throw new Error(`[inject-messages] Unsupported line ${index + 1} in ${file}; keep inject messages as flat single-line values`)

    const [, key, rawValue] = match
    const value = rawValue.trim()
    if (value.startsWith('\'') && value.endsWith('\'') && value.length >= 2)
      messages[key] = value.slice(1, -1).replace(/''/g, '\'')
    else if (value.startsWith('"'))
      messages[key] = JSON.parse(value) as string
    else if (/^[|>&*!%@`]/.test(value) || / #/.test(value))
      throw new Error(`[inject-messages] Unsupported YAML value on line ${index + 1} in ${file}`)
    else
      messages[key] = value
  }
  return messages
}

export function injectMessagesPlugin(): Plugin {
  return {
    name: 'bewly-inject-messages',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    load(id) {
      if (id !== RESOLVED_ID)
        return

      const messages: Record<string, Record<string, string>> = {}
      for (const fileName of readdirSync(LOCALES_DIR).filter(name => name.endsWith('.yml')).sort()) {
        const file = r('src/_locales', fileName)
        this.addWatchFile(file)
        messages[basename(fileName, '.yml')] = parseInjectSection(file)
      }
      return `export default ${JSON.stringify(messages)}`
    },
  }
}
