// 内容脚本与设置页共用的 UI 打包插件：两者都把界面渲染在 Shadow DOM 内。
import { readdirSync } from 'node:fs'

import type { Plugin } from 'vite'

import { r } from './utils'

const BUNDLED_STYLE_GLOBAL = '__BEWLYCAT_BUNDLED_STYLE_TEXT__'

export function embedBundledStyles(): Plugin {
  return {
    name: 'embed-bundled-styles',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
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
      entryChunk.code = `globalThis.${BUNDLED_STYLE_GLOBAL}=${JSON.stringify(css)};\n${entryChunk.code}`
      // 样式已内联到 JS，不再向磁盘写出重复的 style.css。
      delete bundle[styleKey]
    },
  }
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
