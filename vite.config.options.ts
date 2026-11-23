import UnoCSS from 'unocss/vite'
import type { Plugin } from 'vite'
import { defineConfig, normalizePath } from 'vite'

import { splitOptionsExternalStyles, watchLocaleFiles } from './scripts/uiBundlePlugins'
import { isDev, isFirefox, isSafari, r } from './scripts/utils'
import unoConfig from './unocss.config'
import { sharedConfig } from './vite.config'

const CONTENT_I18N_PATH = normalizePath(r('src/utils/i18n.ts'))
const OPTIONS_I18N_PATH = normalizePath(r('src/options/i18n.ts'))
const SYNC_SETTINGS_MENUS_PATH = normalizePath(r('src/components/Settings/settingsMenus.ts'))
const ASYNC_SETTINGS_MENUS_PATH = normalizePath(r('src/options/settingsMenus.ts'))

// 独立设置页运行在原生 ESM 环境：将同步全量语言包和同步菜单替换为按需分包版本，
// 不改动内容脚本共用的 ~/utils/i18n 与 settingsMenus.ts。
function optionsModuleOverrides(): Plugin {
  return {
    name: 'bewly:options-module-overrides',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (options.isEntry)
        return null
      // 只拦截目标模块，避免对 uno.css 等虚拟模块触发二次 resolve 引发 UnoCSS 重复导入提示。
      if (!source.includes('i18n') && !source.includes('settingsMenus'))
        return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved)
        return null
      const normalized = normalizePath(resolved.id)
      if (normalized === CONTENT_I18N_PATH)
        return OPTIONS_I18N_PATH
      if (normalized === SYNC_SETTINGS_MENUS_PATH)
        return ASYNC_SETTINGS_MENUS_PATH
      return null
    },
  }
}

function optionsManualChunks(id: string): string | undefined {
  const normalized = normalizePath(id)
  if (!normalized.includes('/node_modules/'))
    return undefined
  // 保持 vuedraggable / sortablejs / qrcode 跟随各自异步子页按需加载，不打入首屏 vendor。
  if (/\/node_modules\/(?:\.pnpm\/)?(?:vue|@vue|vue-i18n|@intlify|pinia|@vueuse|vue-toastification)[/@+]/.test(normalized))
    return 'vendor'
  return undefined
}

// 独立设置页。它用到的模块都已包含在内容脚本中，第三方许可由内容脚本的清单覆盖。
export default defineConfig({
  ...sharedConfig,
  root: r('src/options'),
  base: './',
  plugins: [
    optionsModuleOverrides(),
    UnoCSS({
      ...unoConfig,
      configFile: false,
      // 不继承内容脚本的全局图标 safelist，沿用 unocss.config.ts 的精确 pipeline 扫描范围。
      safelist: [],
    }),
    ...sharedConfig.plugins!,
    ...splitOptionsExternalStyles(),
    watchLocaleFiles(),
  ],
  build: {
    outDir: r(isFirefox ? 'extension-firefox/dist/options' : isSafari ? 'extension-safari/dist/options' : 'extension/dist/options'),
    cssCodeSplit: false,
    emptyOutDir: true,
    sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
    minify: isDev ? false : 'esbuild',
    cssMinify: isDev ? false : 'esbuild',
    reportCompressedSize: !isDev,
    ...(isDev ? { target: 'esnext' } : {}),
    rollupOptions: {
      input: r('src/options/index.html'),
      output: {
        format: 'es',
        entryFileNames: 'assets/[name].js',
        // 扩展本地资源无需 CDN 缓存哈希；固定分块名也能避免开发模式重建后已打开的设置页找不到旧哈希分块。
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
        manualChunks: optionsManualChunks,
      },
    },
  },
})
