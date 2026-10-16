import UnoCSS from 'unocss/vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

import packageJson from './package.json'
import { isDev, isFirefox, isSafari, r } from './scripts/utils'
import { sharedConfig } from './vite.config'

const BUNDLED_STYLE_GLOBAL = '__BEWLYCAT_BUNDLED_STYLE_TEXT__'

function embedContentScriptStyles(): Plugin {
  return {
    name: 'embed-content-script-styles',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const styleAsset = Object.values(bundle).find(
        output => output.type === 'asset' && output.fileName === 'style.css',
      )
      const contentScriptChunk = Object.values(bundle).find(
        output => output.type === 'chunk' && output.fileName === 'index.global.js',
      )

      if (!styleAsset || styleAsset.type !== 'asset') {
        this.error('Unable to embed content script styles: style.css was not emitted.')
        return
      }
      if (!contentScriptChunk || contentScriptChunk.type !== 'chunk') {
        this.error('Unable to embed content script styles: index.global.js was not emitted.')
        return
      }

      const css = typeof styleAsset.source === 'string'
        ? styleAsset.source
        : new TextDecoder().decode(styleAsset.source)
      contentScriptChunk.code = `globalThis.${BUNDLED_STYLE_GLOBAL}=${JSON.stringify(css)};\n${contentScriptChunk.code}`
    },
  }
}

// bundling the content script using Vite
export default defineConfig({
  ...sharedConfig,
  plugins: [
    UnoCSS(),
    ...sharedConfig.plugins!,
    embedContentScriptStyles(),
  ],
  build: {
    watch: isDev
      ? { include: ['./**/*'] }
      : undefined,
    outDir: r(isFirefox ? 'extension-firefox/dist/contentScripts' : isSafari ? 'extension-safari/dist/contentScripts' : 'extension/dist/contentScripts'),
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
    lib: {
      entry: r('src/contentScripts/index.ts'),
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
