import type { UserConfig } from 'vite'
import { defineConfig } from 'vite'

import packageJson from './package.json' with { type: 'json' }
import { createViteBuildReportPlugin } from './scripts/buildReport.ts'
import { injectMessagesPlugin } from './scripts/injectMessages.ts'
import { thirdPartyLicensesVitePlugin } from './scripts/thirdPartyLicenses.ts'
import { isDev, isFirefox, isSafari, r } from './scripts/utils.ts'
import { createSharedConfig } from './vite.config.ts'

// bundling the page-world inject script using Vite
export function createInjectConfig(): UserConfig {
  const sharedConfig = createSharedConfig()
  return {
    ...sharedConfig,
    logLevel: 'warn',
    plugins: [
      ...sharedConfig.plugins!,
      injectMessagesPlugin(),
      thirdPartyLicensesVitePlugin('inject'),
      createViteBuildReportPlugin('inject'),
    ],
    build: {
      outDir: r(
        isFirefox
          ? 'extension-firefox/dist/contentScripts'
          : isSafari
            ? 'extension-safari/dist/contentScripts'
            : 'extension/dist/contentScripts',
      ),
      cssCodeSplit: false,
      emptyOutDir: false,
      sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
      minify: !isDev,
      reportCompressedSize: false,
      ...(isDev ? { target: 'esnext' } : {}),
      lib: {
        entry: r('src/inject/index.ts'),
        name: packageJson.name,
        formats: ['iife'],
      },
      rolldownOptions: {
        output: {
          entryFileNames: 'inject.global.js',
          extend: true,
        },
      },
    },
  }
}

export default defineConfig(createInjectConfig)
