import { readFileSync } from 'node:fs'

import UnoCSS from 'unocss/vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

import packageJson from './package.json'
import { embedBundledStyles, watchLocaleFiles } from './scripts/uiBundlePlugins'
import { isDev, isFirefox, isSafari, r } from './scripts/utils'
import { sharedConfig } from './vite.config'

function emitOptionsPageHtml(): Plugin {
  const htmlPath = r('src/options/index.html')
  return {
    name: 'emit-options-page-html',
    apply: 'build',
    buildStart() {
      this.addWatchFile(htmlPath)
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: readFileSync(htmlPath, 'utf-8'),
      })
    },
  }
}

// 独立设置页。它用到的模块都已包含在内容脚本中，第三方许可由内容脚本的清单覆盖。
export default defineConfig({
  ...sharedConfig,
  plugins: [
    UnoCSS(),
    ...sharedConfig.plugins!,
    embedBundledStyles(),
    watchLocaleFiles(),
    emitOptionsPageHtml(),
  ],
  build: {
    watch: isDev
      ? { include: ['./**/*'] }
      : undefined,
    outDir: r(isFirefox ? 'extension-firefox/dist/options' : isSafari ? 'extension-safari/dist/options' : 'extension/dist/options'),
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
    lib: {
      entry: r('src/options/main.ts'),
      name: packageJson.name,
      formats: ['iife'],
    },
    rollupOptions: {
      // Disable Rollup cache in dev mode to ensure locale file changes are picked up
      cache: isDev ? false : undefined,
      output: {
        entryFileNames: 'index.global.js',
        assetFileNames: 'style.css',
        extend: true,
      },
    },
  },
})
