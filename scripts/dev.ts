// 开发模式入口：协调统一 UI（内容脚本 + 独立设置页）、后台/独立脚本（tsdown）与页面脚本（Vite）的开发构建。
// - UI（contentScripts + options）改动最频繁且共享分块，保留在主进程内使用 Rolldown 监听模式并复用转换缓存，加快增量重建。
// - 后台/独立脚本（bg）与页面脚本（inject）按需在短生命周期原生 Node 子进程中单次构建：
//   构建完成立即退出，将 V8 堆与 Rolldown 原生内存完整归还操作系统，避免常驻堆膨胀或 OOM。
// - 全部构建目标共用同一个串行构建槽（acquireBuildSlot），同一时刻只运行一个构建，避免抢占 CPU 与叠加内存峰值。
// - 各按需目标仅监听自身实际模块图内的文件变动（不再用 tsdown 盲扫整个 src/），减少无效重建。
// 各构建的实际配置仍以 vite.config.*.ts 与 tsdown.config.ts 为准。
import './prepare.ts'
import type { ChildProcess } from 'node:child_process'
import { fork } from 'node:child_process'
import { isAbsolute, relative } from 'node:path'
import process from 'node:process'

import chokidar from 'chokidar'
import { dim, green, red } from 'kolorist'
import type { Plugin, Rolldown } from 'vite'
import { build as buildWithVite, mergeConfig } from 'vite'

import { createUiConfig } from '../vite.config.ui.ts'
import type { BuildSummary } from './buildReport.ts'
import { getRecordedBuildSummary, mergeBuildSummaries, printBuildSummary } from './buildReport.ts'
import type { DevWorkerResult, DevWorkerTarget } from './devBuildWorker.ts'
import { log, r } from './utils.ts'

const REBUILD_DELAY = 100
const WORKER_SCRIPT = r('scripts/devBuildWorker.ts')

// 先进先出的构建槽：同一时刻只运行一个构建目标，避免抢进程与同时达到内存峰值。
let buildQueue = Promise.resolve()
function acquireBuildSlot(): Promise<() => void> {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  const acquired = buildQueue.then(() => release)
  buildQueue = buildQueue.then(() => released)
  return acquired
}

// 终端里用仓库相对路径，避免整屏绝对路径。
function toRepoPath(id: string): string {
  return relative(r(), id.split('?')[0])
}

let uiWatcher: Rolldown.RolldownWatcher | undefined
let activeChild: ChildProcess | undefined
let shuttingDown = false

function watchUiBundle(): Promise<void> {
  let releaseSlot: (() => void) | undefined
  let buildStartTime = 0
  let resolveFirstBuild!: () => void
  const firstBuild = new Promise<void>((resolve) => (resolveFirstBuild = resolve))

  const devPlugin: Plugin = {
    name: 'bewly:dev-ui',
    apply: 'build',
    // Rolldown 监听模式下 options 仅在启动时执行一次，增量重建从 buildStart 开始；
    // 使用 pre + sequential 确保每轮重建都在真正开始前拿到串行构建槽并重置计时。
    buildStart: {
      order: 'pre',
      sequential: true,
      async handler() {
        releaseSlot?.()
        releaseSlot = await acquireBuildSlot()
        buildStartTime = Date.now()
        log('ui', dim('building...'))
      },
    },
  }

  void (async () => {
    const watcher = (await buildWithVite(
      mergeConfig(createUiConfig(), {
        configFile: false,
        mode: 'development',
        logLevel: 'warn',
        plugins: [devPlugin],
        build: { watch: {} },
      }),
    )) as Rolldown.RolldownWatcher
    uiWatcher = watcher

    // 文件变动先于重建开始，提示是哪个文件触发了 UI 重建。
    watcher.on('change', (id) => {
      log('change', `${toRepoPath(id)} → ui`)
    })

    watcher.on('event', (event) => {
      if (event.code === 'BUNDLE_END') {
        const duration = buildStartTime > 0 ? Date.now() - buildStartTime : event.duration
        log('ui', `${green('built')} ${dim(`in ${duration}ms`)}`)
      }
      // 出错时 Rolldown 同样会在 ERROR 之后发出 END。
      if (event.code !== 'END') return
      buildStartTime = 0
      // 接下来会由 Rolldown 调用上一轮插件的 watchChange 钩子（用于清理插件内部缓存），
      // 因此保留上一轮构建对象，不做手动释放，仅在此交出构建槽并标记首轮完成。
      releaseSlot?.()
      releaseSlot = undefined
      resolveFirstBuild()
    })
  })().catch((error) => {
    console.error(error)
    process.exit(1)
  })

  return firstBuild
}

interface OnDemandBuild {
  name: DevWorkerTarget
  files: Set<string>
  summary?: BuildSummary
  running: boolean
  rerun: boolean
  timer?: ReturnType<typeof setTimeout>
}

const fileWatcher = chokidar.watch([], { ignoreInitial: true })
const buildsByFile = new Map<string, Set<OnDemandBuild>>()

function toWatchedPath(id: string): string | undefined {
  const file = id.split('?')[0]
  if (!isAbsolute(file) || /[\\/]node_modules[\\/]/.test(file)) return undefined
  return file
}

function updateWatchedFiles(target: OnDemandBuild, ids: string[], keepPrevious: boolean) {
  const next = new Set(ids.map(toWatchedPath).filter((file): file is string => !!file))
  if (keepPrevious) {
    for (const file of target.files) next.add(file)
  }

  for (const file of target.files) {
    if (next.has(file)) continue
    const builds = buildsByFile.get(file)
    builds?.delete(target)
    if (!builds?.size) {
      buildsByFile.delete(file)
      fileWatcher.unwatch(file)
    }
  }
  const added: string[] = []
  for (const file of next) {
    let builds = buildsByFile.get(file)
    if (!builds) {
      builds = new Set()
      buildsByFile.set(file, builds)
      added.push(file)
    }
    builds.add(target)
  }
  if (added.length) fileWatcher.add(added)
  target.files = next
}

function spawnBuildWorker(target: DevWorkerTarget): Promise<DevWorkerResult> {
  return new Promise((resolve) => {
    let workerResult: DevWorkerResult | undefined
    const child = fork(WORKER_SCRIPT, [target], {
      // 直接使用原生 Node 运行 .ts，不继承父进程额外的启动参数，减少子进程开销。
      execArgv: [],
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    activeChild = child

    child.on('message', (message: unknown) => {
      if (message && typeof message === 'object' && 'watchFiles' in message)
        workerResult = message as DevWorkerResult
    })

    child.on('error', (error) => {
      console.error(error)
    })

    child.on('exit', (code) => {
      if (activeChild === child) activeChild = undefined
      resolve(workerResult ?? { ok: code === 0, watchFiles: [] })
    })
  })
}

async function runOnDemandBuild(target: OnDemandBuild) {
  if (shuttingDown) return

  // 拿到构建槽后才真正拉起子进程，确保同一时刻只有一个构建占用 CPU 与内存。
  const releaseSlot = await acquireBuildSlot()
  if (shuttingDown) {
    releaseSlot()
    return
  }

  log(target.name, dim('building...'))
  const startTime = Date.now()
  try {
    const result = await spawnBuildWorker(target.name)
    if (result.ok) {
      target.summary = result.summary
      updateWatchedFiles(target, result.watchFiles, false)
      log(target.name, `${green('built')} ${dim(`in ${Date.now() - startTime}ms`)}`)
    } else {
      // 保留此前监听的文件，修复后仍能触发重建。
      updateWatchedFiles(target, result.watchFiles, true)
      log(target.name, red('build failed'))
    }
  } finally {
    releaseSlot()
  }
}

async function rebuild(target: OnDemandBuild) {
  if (target.running) {
    target.rerun = true
    return
  }
  target.running = true
  do {
    target.rerun = false
    await runOnDemandBuild(target)
  } while (target.rerun && !shuttingDown)
  target.running = false
}

fileWatcher.on('all', (_event, file) => {
  const targets = [...(buildsByFile.get(file) ?? [])]
  if (!targets.length) return

  // 先提示是哪个文件触发了哪些目标，再安排重建；重建真正开始时还会打印 building。
  log('change', `${toRepoPath(file)} → ${targets.map((target) => target.name).join(', ')}`)
  for (const target of targets) {
    clearTimeout(target.timer)
    target.timer = setTimeout(() => void rebuild(target), REBUILD_DELAY)
  }
})

const onDemandBuilds: OnDemandBuild[] = [
  { name: 'bg', files: new Set(), running: false, rerun: false },
  { name: 'inject', files: new Set(), running: false, rerun: false },
]

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  for (const target of onDemandBuilds) clearTimeout(target.timer)
  activeChild?.kill('SIGTERM')
  void Promise.allSettled([fileWatcher.close(), uiWatcher?.close()]).finally(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

async function dev() {
  // 统一 UI 首轮构建先占用构建槽，完成后 bg / inject 按队列依次在短生命周期子进程中构建。
  await watchUiBundle()
  for (const target of onDemandBuilds) await rebuild(target)

  const summaries = [
    getRecordedBuildSummary('ui'),
    ...onDemandBuilds.map((target) => target.summary),
  ].filter((summary): summary is BuildSummary => !!summary)
  if (summaries.length > 0) printBuildSummary(mergeBuildSummaries(summaries))
}

dev().catch((error) => {
  console.error(error)
  process.exit(1)
})
