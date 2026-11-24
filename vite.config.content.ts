import UnoCSS from 'unocss/vite'
import type { UserConfig } from 'vite'
import { defineConfig } from 'vite'

import packageJson from './package.json' with { type: 'json' }
import { thirdPartyLicensesVitePlugin } from './scripts/thirdPartyLicenses.ts'
import { embedBundledStyles, watchLocaleFiles } from './scripts/uiBundlePlugins.ts'
import { isDev, isFirefox, isSafari, r } from './scripts/utils.ts'
import { createUnoConfig } from './unocss.config.ts'
import { createSharedConfig } from './vite.config.ts'

// bundling the content script using Vite
export function createContentConfig(): UserConfig {
  const sharedConfig = createSharedConfig()
  return {
    ...sharedConfig,
    plugins: [
      UnoCSS({
        ...createUnoConfig(),
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
      minify: !isDev,
      cssMinify: !isDev,
      reportCompressedSize: !isDev,
      ...(isDev ? { target: 'esnext' } : {}),
      lib: {
        entry: r('src/contentScripts/index.ts'),
        name: packageJson.name,
        formats: ['iife'],
      },
      rolldownOptions: {
        // 开发模式跳过全量树摇，减少 885 个模块与 i18n AST 的副作用分析耗时；生产构建保持完整树摇。
        treeshake: !isDev,
        output: {
          entryFileNames: 'index.global.js',
          assetFileNames: 'style.css',
          extend: true,
        },
      },
    },
  }
}

export default defineConfig(createContentConfig)
