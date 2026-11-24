import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { bold, gray, yellow } from 'kolorist'

export const r = (...args: string[]) =>
  resolve(dirname(fileURLToPath(import.meta.url)), '..', ...args)
export const isDev = process.env.NODE_ENV !== 'production'
export const isWin = process.platform === 'win32'
export const isFirefox = process.env.FIREFOX === 'true'
export const isSafari = process.env.SAFARI === 'true'

function readBuildCommit(): string {
  if (!isDev) return ''
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: r(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // 源码压缩包可能不含 Git 元数据，此时仅显示版本号。
    return ''
  }
}

// Vite 与 tsdown 都在启动时读取，避免已打开页面的标识随后续提交变化。
export const buildCommit = readBuildCommit()

function formatLogTag(name: string): string {
  const label = name.toLowerCase()
  const bracketed = `[${label}]`
  if (label === 'pre') return gray(bracketed)
  if (label === 'change') return yellow(bracketed)
  return bold(bracketed)
}

export function log(name: string, message: string) {
  console.log(formatLogTag(name), message)
}
