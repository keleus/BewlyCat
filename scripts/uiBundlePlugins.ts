// 内容脚本与设置页共用的 UI 打包插件：两者都把界面渲染在 Shadow DOM 内。
import { readdirSync } from 'node:fs'

import type { Plugin } from 'vite'
import { isCSSRequest, normalizePath, transformWithEsbuild } from 'vite'

import { r } from './utils'

const BUNDLED_STYLE_GLOBAL = '__BEWLYCAT_BUNDLED_STYLE_TEXT__'
const HOST_STYLE_GLOBAL = '__BEWLYCAT_HOST_STYLE_TEXT__'
const SRC_ROOT = `${normalizePath(r('src'))}/`

type StyleTarget = 'host-only' | 'shared' | 'shadow-only'

// 同时会在宿主文档（light DOM）与 Shadow DOM 内渲染的 Vue 组件
const HOST_SHARED_VUE_COMPONENTS = new Set([
  'components/Tooltip.vue',
  'components/TopBar/components/TopBarModeSwitcher.vue',
])

// 仅挂载在宿主文档（light DOM）内的 Vue 组件，无需注入 #bewly Shadow DOM
const HOST_ONLY_VUE_COMPONENTS = new Set([
  'components/PlayerLoudnessControl.vue',
])

// 同时作用于宿主文档与 #bewly Shadow DOM 的基础样式
const SHARED_STYLES = new Set([
  'styles/variables.scss',
  'styles/main.scss',
  'styles/fonts.scss',
])

// 仅用于 #bewly Shadow DOM 的全局样式，不注入 B 站宿主文档
const SHADOW_ONLY_STYLES = new Set([
  'styles/transitionAndTransitionGroup.scss',
  'styles/segmentLiquidIndicator.scss',
  'styles/segmentControl.scss',
  'styles/commentReplyTree.scss',
])

// 仅作用于 B 站宿主文档的样式，不注入 #bewly Shadow DOM
const HOST_ONLY_STYLES = new Set([
  'styles/toast.scss',
  'styles/hostIcons.scss',
  'styles/blockAds.scss',
  'styles/removeTopBar.scss',
  'styles/ambilight.scss',
  'styles/videoPageGlass.scss',
  'styles/roundedPlayer.scss',
])

function classifyContentStyleModule(normalizedId: string): StyleTarget | null {
  const [filePath, query = ''] = normalizedId.split('?')

  // ?inline / ?raw / ?url 是显式按字符串或资源导入（如按页加载的 adaptedStyles/pages/*.scss?inline），
  // 不参与主样式表的宿主 / Shadow DOM 拆分。
  if (/(?:^|&)(?:inline|raw|url)(?:=|&|$)/.test(query))
    return null

  // vue-toastification 的容器直接挂载在 document.body（宿主文档）
  if (filePath.endsWith('/vue-toastification/dist/index.css'))
    return 'host-only'

  if (!filePath.startsWith(SRC_ROOT))
    return 'shadow-only'

  const relPath = filePath.slice(SRC_ROOT.length)

  if (relPath.endsWith('.vue')) {
    if (HOST_ONLY_VUE_COMPONENTS.has(relPath))
      return 'host-only'
    if (HOST_SHARED_VUE_COMPONENTS.has(relPath))
      return 'shared'
    return 'shadow-only'
  }

  if (relPath.startsWith('styles/adaptedStyles/'))
    return 'host-only'
  if (HOST_ONLY_STYLES.has(relPath))
    return 'host-only'
  if (SHARED_STYLES.has(relPath))
    return 'shared'
  if (SHADOW_ONLY_STYLES.has(relPath))
    return 'shadow-only'

  // src/styles/ 下未来新增的未分类样式默认保底两边注入，避免意外缺失宿主或 Shadow DOM 样式
  if (relPath.startsWith('styles/'))
    return 'shared'

  return 'shadow-only'
}

export interface EmbedBundledStylesOptions {
  /**
   * 为内容脚本拆分宿主文档样式（__BEWLYCAT_HOST_STYLE_TEXT__）与 Shadow DOM 样式（__BEWLYCAT_BUNDLED_STYLE_TEXT__），
   * 避免将上百个 Shadow DOM 专用组件样式与完整 uno.css 注入 B 站宿主文档。
   */
  splitHostStyles?: boolean
}

export function embedBundledStyles(options: EmbedBundledStylesOptions = {}): Plugin[] {
  const { splitHostStyles = false } = options
  // Rollup 监听模式会复用未改动模块的转换缓存，不能在 buildStart 中清空，
  // 而是由 generateBundle 按当次构建的 entryChunk.moduleIds 精确挑选有效模块。
  const hostCssById = new Map<string, string>()

  const plugins: Plugin[] = []

  if (splitHostStyles) {
    plugins.push({
      name: 'collect-host-styles',
      apply: 'build',
      transform(code, id) {
        if (!isCSSRequest(id))
          return null

        const target = classifyContentStyleModule(normalizePath(id))
        if (!target || target === 'shadow-only')
          return null

        hostCssById.set(id, code)
        if (target === 'host-only')
          return { code: '', map: null }

        return null
      },
    })
  }

  plugins.push({
    name: 'embed-bundled-styles',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_options, bundle) {
      const styleEntry = Object.entries(bundle).find(
        ([, output]) => output.type === 'asset' && output.fileName === 'style.css',
      )
      const entryChunk = Object.values(bundle).find(
        output => output.type === 'chunk' && output.fileName === 'index.global.js',
      )

      if (!styleEntry || styleEntry[1].type !== 'asset') {
        this.error('Unable to embed bundled styles: style.css was not emitted.')
        return
      }
      if (!entryChunk || entryChunk.type !== 'chunk') {
        this.error('Unable to embed bundled styles: index.global.js was not emitted.')
        return
      }

      const [styleKey, styleAsset] = styleEntry
      const css = typeof styleAsset.source === 'string'
        ? styleAsset.source
        : new TextDecoder().decode(styleAsset.source)

      const injectedGlobals = [
        `globalThis.${BUNDLED_STYLE_GLOBAL}=${JSON.stringify(css)};`,
      ]

      if (splitHostStyles) {
        const orderedHostCss: string[] = []
        const seenIds = new Set<string>()
        for (const moduleId of entryChunk.moduleIds) {
          const cssPart = hostCssById.get(moduleId)
          if (cssPart) {
            orderedHostCss.push(cssPart)
            seenIds.add(moduleId)
          }
        }
        for (const [moduleId, cssPart] of hostCssById) {
          if (!seenIds.has(moduleId) && this.getModuleInfo(moduleId) && cssPart)
            orderedHostCss.push(cssPart)
        }

        if (orderedHostCss.length === 0) {
          this.error('Unable to embed host styles: no host style modules were collected.')
          return
        }

        const minifiedHost = await transformWithEsbuild(
          orderedHostCss.join('\n'),
          'bewly-host-styles.css',
          { loader: 'css', minify: true },
        )
        injectedGlobals.push(
          `globalThis.${HOST_STYLE_GLOBAL}=${JSON.stringify(minifiedHost.code.trim())};`,
        )
      }

      entryChunk.code = `${injectedGlobals.join('\n')}\n${entryChunk.code}`
      // 样式已内联到 JS，不再向磁盘写出重复的 style.css。
      delete bundle[styleKey]
    },
  })

  return plugins
}

// unplugin-vue-i18n 的虚拟 messages 模块直接读取并内联 locale 文件，不会登记为监听文件；
// 这里补登记，开发模式下改动翻译才会触发重建。虚拟模块的 load 钩子每轮都会重新执行，Rollup 缓存不影响翻译更新。
// 单次构建也登记，scripts/dev.ts 据此决定设置页何时重建。
export function watchLocaleFiles(): Plugin {
  const localesDir = r('src/_locales')
  return {
    name: 'watch-locale-files',
    apply: 'build',
    buildStart() {
      for (const fileName of readdirSync(localesDir).filter(name => /\.ya?ml$/.test(name)))
        this.addWatchFile(r('src/_locales', fileName))
    },
  }
}
