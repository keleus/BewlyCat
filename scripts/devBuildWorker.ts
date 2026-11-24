// 开发模式按需单次构建子进程：执行 bg (tsdown)、inject 或 options (Vite) 后立即退出，
// 让操作系统完整回收 V8 堆、UnoCSS 上下文与 Rolldown 原生内存，并通过 IPC 回传实际依赖文件列表。
import { readdirSync } from 'node:fs'
import process from 'node:process'

import type { TsdownPlugin } from 'tsdown'
import type { Plugin as VitePlugin, UserConfig } from 'vite'

import type { EmittedArtifact } from './devBuildReport.ts'
import { collectBundleArtifacts, printEmittedArtifacts } from './devBuildReport.ts'
import { r } from './utils.ts'

export type DevWorkerTarget = 'bg' | 'inject' | 'options'

export interface DevWorkerResult {
  ok: boolean
  watchFiles: string[]
}

function listLocaleFiles(): string[] {
  const localesDir = r('src/_locales')
  return readdirSync(localesDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => r('src/_locales', name))
}

async function buildViteTarget(createConfig: () => UserConfig): Promise<DevWorkerResult> {
  const { build: buildWithVite, mergeConfig } = await import('vite')
  const watchFiles = new Set<string>(listLocaleFiles())
  const collectWatchFiles: VitePlugin = {
    name: 'bewly:collect-watch-files',
    apply: 'build',
    buildEnd() {
      for (const id of this.getModuleIds()) watchFiles.add(id)
    },
    writeBundle(outputOptions, bundle) {
      printEmittedArtifacts(collectBundleArtifacts(outputOptions.dir, bundle))
    },
  }

  try {
    await buildWithVite(
      mergeConfig(createConfig(), {
        configFile: false,
        mode: 'development',
        logLevel: 'warn',
        plugins: [collectWatchFiles],
      }),
    )
    return { ok: true, watchFiles: [...watchFiles] }
  } catch {
    return { ok: false, watchFiles: [...watchFiles] }
  }
}

async function buildBackgroundTarget(): Promise<DevWorkerResult> {
  const [{ build: buildWithTsdown }, { createTsdownConfigs }] = await Promise.all([
    import('tsdown'),
    import('../tsdown.config.ts'),
  ])
  const watchFiles = new Set<string>()
  const emittedArtifacts: EmittedArtifact[] = []
  const collectWatchFiles: TsdownPlugin = {
    name: 'bewly:collect-watch-files',
    buildEnd() {
      for (const id of this.getModuleIds()) watchFiles.add(id)
    },
    writeBundle(outputOptions, bundle) {
      emittedArtifacts.push(...collectBundleArtifacts(outputOptions.dir, bundle))
    },
  }

  try {
    for (const config of createTsdownConfigs()) {
      const existingPlugins = config.plugins ? [config.plugins].flat() : []
      await buildWithTsdown({
        ...config,
        config: false,
        logLevel: 'warn',
        plugins: [...existingPlugins, collectWatchFiles],
      })
    }
    printEmittedArtifacts(emittedArtifacts)
    return { ok: true, watchFiles: [...watchFiles] }
  } catch (error) {
    console.error(error)
    return { ok: false, watchFiles: [...watchFiles] }
  }
}

async function runTarget(target: DevWorkerTarget): Promise<DevWorkerResult> {
  if (target === 'bg') return buildBackgroundTarget()
  if (target === 'inject') {
    const { createInjectConfig } = await import('../vite.config.inject.ts')
    return buildViteTarget(createInjectConfig)
  }
  const { createOptionsConfig } = await import('../vite.config.options.ts')
  return buildViteTarget(createOptionsConfig)
}

async function main() {
  const target = process.argv[2] as DevWorkerTarget | undefined
  if (target !== 'bg' && target !== 'inject' && target !== 'options') {
    console.error(`[devBuildWorker] Unknown target: ${String(target)}`)
    process.exit(2)
  }

  const result = await runTarget(target)
  process.send?.(result)
  process.exitCode = result.ok ? 0 : 1
}

void main()
