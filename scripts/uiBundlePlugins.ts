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
      const styleAsset = Object.values(bundle).find(
        output => output.type === 'asset' && output.fileName === 'style.css',
      )
      const entryChunk = Object.values(bundle).find(
        output => output.type === 'chunk' && output.fileName === 'index.global.js',
      )

      if (!styleAsset || styleAsset.type !== 'asset') {
        this.error('Unable to embed bundled styles: style.css was not emitted.')
        return
      }
      if (!entryChunk || entryChunk.type !== 'chunk') {
        this.error('Unable to embed bundled styles: index.global.js was not emitted.')
        return
      }

      const css = typeof styleAsset.source === 'string'
        ? styleAsset.source
        : new TextDecoder().decode(styleAsset.source)
      entryChunk.code = `globalThis.${BUNDLED_STYLE_GLOBAL}=${JSON.stringify(css)};\n${entryChunk.code}`
    },
  }
}

// unplugin-vue-i18n 的虚拟 messages 模块直接读取并内联 locale 文件，不会登记为监听文件；
// 构建监听模式下改动翻译不会触发重建，这里补登记，配合关闭的 Rollup 缓存重新生成翻译。
export function watchLocaleFiles(): Plugin {
  const localesDir = r('src/_locales')
  return {
    name: 'watch-locale-files',
    apply: 'build',
    buildStart() {
      if (!this.meta.watchMode)
        return
      for (const fileName of readdirSync(localesDir).filter(name => /\.ya?ml$/.test(name)))
        this.addWatchFile(r('src/_locales', fileName))
    },
  }
}
