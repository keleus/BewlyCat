// 开发模式按需单次构建子进程：执行 bg (tsdown) 或 inject (Vite) 后立即退出，
// 让操作系统完整回收 V8 堆与 Rolldown 原生内存，并通过 IPC 回传实际依赖文件列表与体积汇总。
import process from 'node:process'

import type { TsdownPlugin } from 'tsdown'
import type { Plugin as VitePlugin, UserConfig } from 'vite'

import type { BuildSummary } from './buildReport.ts'
import { getRecordedBuildSummary } from './buildReport.ts'

export type DevWorkerTarget = 'bg' | 'inject'

export interface DevWorkerResult {
  ok: boolean
  watchFiles: string[]
  summary?: BuildSummary
}

async function buildViteTarget(
  target: DevWorkerTarget,
  createConfig: () => UserConfig,
): Promise<DevWorkerResult> {
  const { build: buildWithVite, mergeConfig } = await import('vite')
  const watchFiles = new Set<string>()
  const collectWatchFiles: VitePlugin = {
    name: 'bewly:collect-watch-files',
    apply: 'build',
    buildEnd() {
      for (const id of this.getModuleIds()) watchFiles.add(id)
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
    return {
      ok: true,
      watchFiles: [...watchFiles],
      summary: getRecordedBuildSummary(target),
    }
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
  const collectWatchFiles: TsdownPlugin = {
    name: 'bewly:collect-watch-files',
    buildEnd() {
      for (const id of this.getModuleIds()) watchFiles.add(id)
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
    return {
      ok: true,
      watchFiles: [...watchFiles],
      summary: getRecordedBuildSummary('bg'),
    }
  } catch (error) {
    console.error(error)
    return { ok: false, watchFiles: [...watchFiles] }
  }
}

async function runTarget(target: DevWorkerTarget): Promise<DevWorkerResult> {
  if (target === 'bg') return buildBackgroundTarget()
  const { createInjectConfig } = await import('../vite.config.inject.ts')
  return buildViteTarget('inject', createInjectConfig)
}

async function main() {
  const target = process.argv[2] as DevWorkerTarget | undefined
  if (target !== 'bg' && target !== 'inject') {
    console.error(`[devBuildWorker] Unknown target: ${String(target)}`)
    process.exit(2)
  }

  const result = await runTarget(target)
  process.send?.(result)
  process.exitCode = result.ok ? 0 : 1
}

void main()
