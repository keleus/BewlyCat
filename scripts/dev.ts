// 开发模式入口：在单个进程中构建内容脚本、页面脚本、设置页（Vite）与后台脚本（tsup）。
// - 内容脚本改动最频繁，使用 Rollup 监听模式，保留转换缓存以加快重建。
// - 监听模式只保留上一轮构建对象供 Rollup 向插件派发 watchChange，不做手动清理，避免改文件后插件缓存不刷新。
// - 页面脚本与设置页按需单次构建：构建结束后整个模块图即可释放，只在其模块图内的文件变化时重建。
// - Vite 构建串行执行，避免同时达到内存峰值；每个目标开始/完成都输出日志，文件变动先提示再触发重建。
// 各构建的实际配置仍以 vite.config.*.ts 与 tsup.config.ts 为准。
import './prepare'

import { isAbsolute, relative } from 'node:path'
import process from 'node:process'

import chokidar from 'chokidar'
import { build as buildWithTsup } from 'tsup'
import type { Plugin, Rollup } from 'vite'
import { build as buildWithVite } from 'vite'

import { log, r } from './utils'

const REBUILD_DELAY = 100

// 先进先出的构建槽：同一时刻只运行一个 Vite 构建，避免同时达到内存峰值。
let buildQueue = Promise.resolve()
function acquireBuildSlot(): Promise<() => void> {
  let release!: () => void
  const released = new Promise<void>(resolve => (release = resolve))
  const acquired = buildQueue.then(() => release)
  buildQueue = buildQueue.then(() => released)
  return acquired
}

// 终端里用仓库相对路径，避免整屏绝对路径。
function toRepoPath(id: string): string {
  return relative(r(), id.split('?')[0])
}

function watchContentScript(): Promise<void> {
  let releaseSlot: (() => void) | undefined
  let buildStartTime = 0
  let resolveFirstBuild!: () => void
  const firstBuild = new Promise<void>(resolve => (resolveFirstBuild = resolve))

  const devPlugin: Plugin = {
    name: 'bewly:dev-content',
    apply: 'build',
    // Rollup 每轮构建开始时都会调用 options 钩子，在此等待构建槽；
    // 拿到槽后再打印开始日志，避免排队中的构建提前显示为正在构建。
    async options() {
      releaseSlot = await acquireBuildSlot()
      buildStartTime = Date.now()
      log('VITE', 'content building...')
    },
  }

  void (async () => {
    const watcher = await buildWithVite({
      configFile: r('vite.config.content.ts'),
      mode: 'development',
      logLevel: 'warn',
      plugins: [devPlugin],
      build: { watch: {} },
    }) as Rollup.RollupWatcher

    // 文件变动先于重建开始，提示是哪个文件触发了内容脚本重建。
    watcher.on('change', (id) => {
      log('CHANGE', `${toRepoPath(id)} → content`)
    })

    watcher.on('event', (event) => {
      if (event.code === 'BUNDLE_END')
        log('VITE', `content built in ${Date.now() - buildStartTime}ms`)
      // 出错时 Rollup 同样会在 ERROR 之后发出 END。
      if (event.code !== 'END')
        return
      // 接下来会由 Rollup 调用上一轮插件的 watchChange 钩子（用于清理插件内部缓存），
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
  name: string
  configFile: string
  files: Set<string>
  running: boolean
  rerun: boolean
  timer?: ReturnType<typeof setTimeout>
}

const fileWatcher = chokidar.watch([], { ignoreInitial: true })
const buildsByFile = new Map<string, Set<OnDemandBuild>>()

function toWatchedPath(id: string): string | undefined {
  const file = id.split('?')[0]
  if (!isAbsolute(file) || /[\\/]node_modules[\\/]/.test(file))
    return undefined
  return file
}

function updateWatchedFiles(target: OnDemandBuild, ids: string[], keepPrevious: boolean) {
  const next = new Set(ids.map(toWatchedPath).filter((file): file is string => !!file))
  if (keepPrevious) {
    for (const file of target.files)
      next.add(file)
  }

  for (const file of target.files) {
    if (next.has(file))
      continue
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
  if (added.length)
    fileWatcher.add(added)
  target.files = next
}

async function runOnDemandBuild(target: OnDemandBuild) {
  let watchFiles: string[] = []
  const collectWatchFiles: Plugin = {
    name: 'bewly:collect-watch-files',
    apply: 'build',
    // 构建失败时同样会调用 buildEnd，此时拿到的是已解析部分的文件。
    buildEnd() {
      watchFiles = this.getWatchFiles()
    },
  }

  // 拿到构建槽后才真正开始构建，等待中的目标不会提前打印开始日志。
  const releaseSlot = await acquireBuildSlot()
  log('VITE', `${target.name} building...`)
  const startTime = Date.now()
  try {
    await buildWithVite({
      configFile: r(target.configFile),
      mode: 'development',
      logLevel: 'warn',
      plugins: [collectWatchFiles],
    })
    updateWatchedFiles(target, watchFiles, false)
    log('VITE', `${target.name} built in ${Date.now() - startTime}ms`)
  }
  catch {
    // Vite 已输出错误详情；保留此前监听的文件，修复后仍能触发重建。
    updateWatchedFiles(target, watchFiles, true)
    log('VITE', `${target.name} build failed`)
  }
  finally {
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
  } while (target.rerun)
  target.running = false
}

fileWatcher.on('all', (_event, file) => {
  const targets = [...(buildsByFile.get(file) ?? [])]
  if (!targets.length)
    return

  // 先提示是哪个文件触发了哪些目标，再安排重建；重建真正开始时还会打印 building。
  log('CHANGE', `${toRepoPath(file)} → ${targets.map(target => target.name).join(', ')}`)
  for (const target of targets) {
    clearTimeout(target.timer)
    target.timer = setTimeout(() => void rebuild(target), REBUILD_DELAY)
  }
})

const onDemandBuilds: OnDemandBuild[] = [
  { name: 'inject', configFile: 'vite.config.inject.ts', files: new Set(), running: false, rerun: false },
  { name: 'options', configFile: 'vite.config.options.ts', files: new Set(), running: false, rerun: false },
]

async function dev() {
  const backgroundBuild = buildWithTsup({ watch: './src' })
  // 内容脚本的首轮构建先占用构建槽，之后注入脚本与设置页依次排队重建。
  await watchContentScript()
  await Promise.all([backgroundBuild, ...onDemandBuilds.map(rebuild)])
}

dev().catch((error) => {
  console.error(error)
  process.exit(1)
})
