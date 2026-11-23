import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

import packageJson from './package.json'
import { thirdPartyLicensesVitePlugin } from './scripts/thirdPartyLicenses'
import { embedBundledStyles, watchLocaleFiles } from './scripts/uiBundlePlugins'
import { isDev, isFirefox, isSafari, r } from './scripts/utils'
import unoConfig from './unocss.config'
import { sharedConfig } from './vite.config'

// bundling the content script using Vite
export default defineConfig({
  ...sharedConfig,
  plugins: [
    UnoCSS({
      ...unoConfig,
      configFile: false,
    }),
    ...sharedConfig.plugins!,
    embedBundledStyles({ splitHostStyles: true }),
    watchLocaleFiles(),
    thirdPartyLicensesVitePlugin('content'),
  ],
  build: {
    outDir: r(isFirefox ? 'extension-firefox/dist/contentScripts' : isSafari ? 'extension-safari/dist/contentScripts' : 'extension/dist/contentScripts'),
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
    minify: isDev ? false : 'esbuild',
    cssMinify: isDev ? false : 'esbuild',
    reportCompressedSize: !isDev,
    ...(isDev ? { target: 'esnext' } : {}),
    lib: {
      entry: r('src/contentScripts/index.ts'),
      name: packageJson.name,
      formats: ['iife'],
    },
    rollupOptions: {
      // 开发模式跳过全量树摇，减少 885 个模块与 i18n AST 的副作用分析耗时；生产构建保持完整树摇。
      treeshake: !isDev,
      output: {
        entryFileNames: 'index.global.js',
        assetFileNames: 'style.css',
        extend: true,
      },
    },
  },
})
