// 内容脚本与独立设置页共用的多入口 UI 打包插件：
// - 两端界面均渲染在 Shadow DOM 内，共享同一份 Shadow DOM 样式（chunks/shadowStyles.js）；
// - 内容脚本的 B 站宿主样式单独输出为 chunks/contentHostStyles.js，并生成经典引导脚本 contentScripts/index.global.js；
// - 独立设置页的宿主样式（token、toast、options.scss）单独输出为 options/host.css，避免 B 站宿主样式与设置页样式互相污染。
import { Buffer } from 'node:buffer'
import { readdirSync } from 'node:fs'

import { transform as transformCss } from 'lightningcss'
import type { Plugin } from 'vite'
import { isCSSRequest, normalizePath } from 'vite'

import { isDev, r } from './utils.ts'

function minifyHostCss(css: string, filename: string): string {
  const { code } = transformCss({
    filename,
    code: Buffer.from(css),
    minify: true,
  })
  return new TextDecoder().decode(code).trim()
}

const BUNDLED_STYLE_GLOBAL = '__BEWLYCAT_BUNDLED_STYLE_TEXT__'
const HOST_STYLE_GLOBAL = '__BEWLYCAT_HOST_STYLE_TEXT__'
const SHADOW_STYLES_CHUNK = 'chunks/shadowStyles.js'
const CONTENT_HOST_STYLES_CHUNK = 'chunks/contentHostStyles.js'
const CONTENT_ENTRY_FILE = 'contentScripts/main.js'
const CONTENT_BOOTSTRAP_FILE = 'contentScripts/index.global.js'
const OPTIONS_ENTRY_FILE = 'options/index.js'
const OPTIONS_HTML_FILE = 'options/index.html'
const OPTIONS_HOST_CSS_FILE = 'options/host.css'
const SRC_ROOT = `${normalizePath(r('src'))}/`

type StyleTarget =
  | 'shared-all'
  | 'shared-host-only'
  | 'content-host-only'
  | 'content-host-and-shadow'
  | 'options-host-only'
  | 'shadow-only'

// 同时会在 B 站宿主文档（light DOM）与 Shadow DOM 内渲染的 Vue 组件
const CONTENT_HOST_SHARED_VUE_COMPONENTS = new Set([
  'components/Tooltip.vue',
  'components/TopBar/components/TopBarModeSwitcher.vue',
])

// 仅挂载在 B 站宿主文档（light DOM）内的 Vue 组件，无需注入 #bewly Shadow DOM
const CONTENT_HOST_ONLY_VUE_COMPONENTS = new Set(['components/PlayerLoudnessControl.vue'])

// 同时作用于 B 站宿主文档、独立设置页宿主文档与 #bewly Shadow DOM 的基础样式
const SHARED_ALL_STYLES = new Set([
  'styles/variables.scss',
  'styles/main.scss',
  'styles/fonts.scss',
])

// 同时作用于 B 站宿主文档与独立设置页宿主文档的样式（不注入 Shadow DOM）
const SHARED_HOST_ONLY_STYLES = new Set(['styles/toast.scss'])

// 仅用于 #bewly Shadow DOM 的全局样式，不注入宿主文档
const SHADOW_ONLY_STYLES = new Set([
  'styles/transitionAndTransitionGroup.scss',
  'styles/segmentLiquidIndicator.scss',
  'styles/segmentControl.scss',
  'styles/commentReplyTree.scss',
])

// 仅作用于 B 站宿主文档的样式，不注入 #bewly Shadow DOM 与独立设置页
const CONTENT_HOST_ONLY_STYLES = new Set([
  'styles/hostIcons.scss',
  'styles/blockAds.scss',
  'styles/removeTopBar.scss',
  'styles/ambilight.scss',
  'styles/videoPageGlass.scss',
  'styles/roundedPlayer.scss',
])

// 仅作用于独立设置页宿主文档的壳样式，严禁注入 B 站宿主文档与 Shadow DOM
const OPTIONS_HOST_ONLY_STYLES = new Set(['options/options.scss'])

function isInlineOrRawQuery(query: string): boolean {
  return /(?:^|&)(?:inline|raw|url)(?:=|&|$)/.test(query)
}

function classifyUiStyleModule(normalizedId: string): StyleTarget | null {
  const [filePath, query = ''] = normalizedId.split('?')

  // ?inline / ?raw / ?url 是显式按字符串或资源导入（如按页加载的 adaptedStyles/pages/*.scss?inline），
  // 不参与主样式表的宿主 / Shadow DOM 拆分。
  if (isInlineOrRawQuery(query)) return null

  // vue-toastification 的容器直接挂载在 document.body（宿主文档）
  if (filePath.endsWith('/vue-toastification/dist/index.css')) return 'shared-host-only'

  if (!filePath.startsWith(SRC_ROOT)) return 'shadow-only'

  const relPath = filePath.slice(SRC_ROOT.length)

  if (relPath.endsWith('.vue')) {
    if (CONTENT_HOST_ONLY_VUE_COMPONENTS.has(relPath)) return 'content-host-only'
    if (CONTENT_HOST_SHARED_VUE_COMPONENTS.has(relPath)) return 'content-host-and-shadow'
    return 'shadow-only'
  }

  if (OPTIONS_HOST_ONLY_STYLES.has(relPath)) return 'options-host-only'
  if (relPath.startsWith('styles/adaptedStyles/')) return 'content-host-only'
  if (CONTENT_HOST_ONLY_STYLES.has(relPath)) return 'content-host-only'
  if (SHARED_HOST_ONLY_STYLES.has(relPath)) return 'shared-host-only'
  if (SHARED_ALL_STYLES.has(relPath)) return 'shared-all'
  if (SHADOW_ONLY_STYLES.has(relPath)) return 'shadow-only'

  // src/styles/ 下未来新增的未分类样式默认保底三端注入，避免意外缺失样式
  if (relPath.startsWith('styles/')) return 'shared-all'

  return 'shadow-only'
}

function createContentScriptBootstrap(entryFileName: string): string {
  const entryPath = JSON.stringify(`dist/${entryFileName}`)
  return [
    ';(() => {',
    '  if (globalThis.__BEWLYCAT_CONTENT_SCRIPT_BOOTSTRAPPED__) return',
    '  globalThis.__BEWLYCAT_CONTENT_SCRIPT_BOOTSTRAPPED__ = true',
    '  const runtime = globalThis.browser?.runtime ?? globalThis.chrome?.runtime',
    '  if (!runtime?.getURL) return',
    `  void import(runtime.getURL(${entryPath})).catch((error) => {`,
    '    globalThis.__BEWLYCAT_CONTENT_SCRIPT_BOOTSTRAPPED__ = false',
    '    globalThis.__BEWLYCAT_PAGE_LOADING__?.dispose()',
    "    console.error('[BewlyCat] Failed to load content script module:', error)",
    '  })',
    '})()',
    '',
  ].join('\n')
}

interface ChunkLike {
  fileName: string
  isEntry: boolean
  moduleIds: string[]
}

function collectOrderedCss(
  chunks: ChunkLike[],
  preferredEntryFile: string,
  cssById: Map<string, string>,
  hasModuleInfo: (id: string) => boolean,
): string[] {
  const ordered: string[] = []
  const seenIds = new Set<string>()
  const sorted = [...chunks].sort((a, b) => {
    const aPreferred = Number(a.fileName === preferredEntryFile)
    const bPreferred = Number(b.fileName === preferredEntryFile)
    if (aPreferred !== bPreferred) return bPreferred - aPreferred
    return Number(b.isEntry) - Number(a.isEntry)
  })

  for (const chunk of sorted) {
    for (const moduleId of chunk.moduleIds) {
      if (seenIds.has(moduleId)) continue
      const cssPart = cssById.get(moduleId)
      if (cssPart) {
        ordered.push(cssPart)
        seenIds.add(moduleId)
      }
    }
  }
  for (const [moduleId, cssPart] of cssById) {
    if (!seenIds.has(moduleId) && hasModuleInfo(moduleId) && cssPart) ordered.push(cssPart)
  }
  return ordered
}

export function bundleUiStyles(): Plugin[] {
  // Rolldown 监听模式会复用未改动模块的转换缓存，不能在 buildStart 中清空，
  // 而是由 generateBundle 按当次构建的所有 chunk.moduleIds 精确挑选有效模块。
  const contentHostCssById = new Map<string, string>()
  const optionsHostCssById = new Map<string, string>()

  return [
    {
      name: 'collect-ui-host-styles',
      apply: 'build',
      transform(code, id) {
        if (!isCSSRequest(id)) return null

        const target = classifyUiStyleModule(normalizePath(id))
        if (!target || target === 'shadow-only') return null

        if (
          target === 'shared-all' ||
          target === 'shared-host-only' ||
          target === 'content-host-only' ||
          target === 'content-host-and-shadow'
        ) {
          contentHostCssById.set(id, code)
        }
        if (
          target === 'shared-all' ||
          target === 'shared-host-only' ||
          target === 'options-host-only'
        ) {
          optionsHostCssById.set(id, code)
        }

        if (
          target === 'shared-host-only' ||
          target === 'content-host-only' ||
          target === 'options-host-only'
        ) {
          return { code: '', map: null }
        }

        return null
      },
    },
    {
      name: 'emit-unified-ui-styles',
      apply: 'build',
      enforce: 'post',
      async generateBundle(_options, bundle) {
        const styleEntry = Object.entries(bundle).find(
          ([, output]) => output.type === 'asset' && output.fileName.endsWith('.css'),
        )
        const htmlEntry = Object.entries(bundle).find(
          ([, output]) => output.type === 'asset' && output.fileName === OPTIONS_HTML_FILE,
        )
        const chunks = Object.values(bundle).filter((output) => output.type === 'chunk')
        const contentEntry = chunks.find((chunk) => chunk.fileName === CONTENT_ENTRY_FILE)
        const optionsEntry = chunks.find((chunk) => chunk.fileName === OPTIONS_ENTRY_FILE)

        if (!styleEntry || styleEntry[1].type !== 'asset') {
          this.error('Unable to bundle UI styles: bundled CSS asset was not emitted.')
          return
        }
        if (!contentEntry) {
          this.error(`Unable to bundle UI styles: ${CONTENT_ENTRY_FILE} was not emitted.`)
          return
        }
        if (!optionsEntry) {
          this.error(`Unable to bundle UI styles: ${OPTIONS_ENTRY_FILE} was not emitted.`)
          return
        }
        if (!htmlEntry || htmlEntry[1].type !== 'asset') {
          this.error(`Unable to bundle UI styles: ${OPTIONS_HTML_FILE} was not emitted.`)
          return
        }

        const [styleKey, styleAsset] = styleEntry
        const shadowCss =
          typeof styleAsset.source === 'string'
            ? styleAsset.source
            : new TextDecoder().decode(styleAsset.source)

        const hasModuleInfo = (id: string) => Boolean(this.getModuleInfo(id))
        const orderedContentHostCss = collectOrderedCss(
          chunks,
          CONTENT_ENTRY_FILE,
          contentHostCssById,
          hasModuleInfo,
        )
        const orderedOptionsHostCss = collectOrderedCss(
          chunks,
          OPTIONS_ENTRY_FILE,
          optionsHostCssById,
          hasModuleInfo,
        )

        if (orderedContentHostCss.length === 0) {
          this.error('Unable to bundle UI styles: no content host style modules were collected.')
          return
        }
        if (orderedOptionsHostCss.length === 0) {
          this.error('Unable to bundle UI styles: no options host style modules were collected.')
          return
        }

        const rawContentHostCss = orderedContentHostCss.join('\n')
        const contentHostCss = isDev
          ? rawContentHostCss
          : minifyHostCss(rawContentHostCss, 'bewly-content-host-styles.css')
        const rawOptionsHostCss = orderedOptionsHostCss.join('\n')
        const optionsHostCss = isDev
          ? rawOptionsHostCss
          : minifyHostCss(rawOptionsHostCss, 'bewly-options-host-styles.css')

        delete bundle[styleKey]

        // 内容脚本与独立设置页共享同一份 Shadow DOM 样式，避免双份打包。
        this.emitFile({
          type: 'asset',
          fileName: SHADOW_STYLES_CHUNK,
          source: `globalThis.${BUNDLED_STYLE_GLOBAL}=${JSON.stringify(shadowCss)};\n`,
        })
        this.emitFile({
          type: 'asset',
          fileName: CONTENT_HOST_STYLES_CHUNK,
          source: `globalThis.${HOST_STYLE_GLOBAL}=${JSON.stringify(contentHostCss)};\n`,
        })
        this.emitFile({
          type: 'asset',
          fileName: CONTENT_BOOTSTRAP_FILE,
          source: createContentScriptBootstrap(contentEntry.fileName),
        })
        this.emitFile({
          type: 'asset',
          fileName: OPTIONS_HOST_CSS_FILE,
          source: optionsHostCss,
        })

        // 入口首行静态导入样式模块，保证在所有业务模块求值前注入全局样式字符串且保持合法 ESM 语法。
        contentEntry.code = `import '../${SHADOW_STYLES_CHUNK}';\nimport '../${CONTENT_HOST_STYLES_CHUNK}';\n${contentEntry.code}`
        optionsEntry.code = `import '../${SHADOW_STYLES_CHUNK}';\n${optionsEntry.code}`

        const [, htmlAsset] = htmlEntry
        const htmlSource =
          typeof htmlAsset.source === 'string'
            ? htmlAsset.source
            : new TextDecoder().decode(htmlAsset.source)
        const hostLinkTag = '    <link rel="stylesheet" href="./host.css">'
        const stylesheetTagRE = /^[ \t]*<link\s[^>]*rel=["']stylesheet["'][^>]*>/im
        htmlAsset.source = stylesheetTagRE.test(htmlSource)
          ? htmlSource.replace(stylesheetTagRE, hostLinkTag)
          : htmlSource.replace('</head>', `${hostLinkTag}\n  </head>`)
      },
    },
  ]
}

// 补登记 locale 文件监听，确保开发模式下改动翻译文件时稳定触发重建。
export function watchLocaleFiles(): Plugin {
  const localesDir = r('src/_locales')
  return {
    name: 'watch-locale-files',
    apply: 'build',
    buildStart() {
      for (const fileName of readdirSync(localesDir).filter((name) => /\.ya?ml$/.test(name)))
        this.addWatchFile(r('src/_locales', fileName))
    },
  }
}
