import UnoCSS from 'unocss/vite'
import type { UserConfig } from 'vite'
import { defineConfig } from 'vite'

import { createViteBuildReportPlugin } from './scripts/buildReport.ts'
import { thirdPartyLicensesVitePlugin } from './scripts/thirdPartyLicenses.ts'
import { bundleUiStyles, watchLocaleFiles } from './scripts/uiBundlePlugins.ts'
import { isDev, isFirefox, isSafari, r } from './scripts/utils.ts'
import { createUnoConfig } from './unocss.config.ts'
import { createSharedConfig } from './vite.config.ts'

const UI_VENDOR_RE =
  /[\\/]node_modules[\\/](?:\.pnpm[\\/])?(?:vue|@vue|vue-i18n|@intlify|pinia|@vueuse|vue-toastification|webextension-polyfill|webext-bridge)[\\/@+]/
const UI_PLAYER_RE =
  /[\\/]src[\\/](?:utils[\\/](?:bewlyWidescreen|player|playerAdjustment|randomPlay|verticalVideoZoom|watchLaterButton|videoScreenshot)\.ts|contentScripts[\\/](?:bewlyWidescreenControl|fullscreenWheelVolume|keyboardVolumeStep|localLoudnessControl|playerControlFit|touchPlayerGestures|videoAspectRatioMemory|videoPipButtonControl|videoQualityMemory|videoScreenshotControl)\.ts|components[\\/]PlayerLoudnessControl\.vue)/

// 内容脚本与独立设置页的统一多入口 UI 构建：共享 vendor、语言包、svgIcons、vuedraggable、
// logic、21 个设置子页及 Shadow DOM 样式分块，避免两端重复打包。
export function createUiConfig(): UserConfig {
  const sharedConfig = createSharedConfig()
  return {
    ...sharedConfig,
    base: './',
    logLevel: 'warn',
    plugins: [
      UnoCSS({
        ...createUnoConfig(),
        configFile: false,
      }),
      ...sharedConfig.plugins!,
      ...bundleUiStyles(),
      watchLocaleFiles(),
      thirdPartyLicensesVitePlugin('content'),
      createViteBuildReportPlugin('ui'),
    ],
    build: {
      outDir: r(
        isFirefox
          ? 'extension-firefox/dist'
          : isSafari
            ? 'extension-safari/dist'
            : 'extension/dist',
      ),
      cssCodeSplit: false,
      // 内容脚本运行在 B 站页面上下文：禁止向宿主 document.head 注入指向错误源站的 modulepreload 标签。
      modulePreload: false,
      // 静态导入的图片/字体等资源内联为 data URI，避免内容脚本在宿主页面按相对路径加载触发 404，也避免重复落盘。
      assetsInlineLimit: () => true,
      emptyOutDir: false,
      sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
      minify: !isDev,
      cssMinify: !isDev,
      reportCompressedSize: false,
      ...(isDev ? { target: 'esnext' } : {}),
      rolldownOptions: {
        checks: {
          // Vue、UnoCSS 与 AutoImport 的 JS 钩子耗时天然高于 Rolldown 原生打包阶段，关闭提示性耗时告警。
          bundlerTimings: false,
        },
        input: {
          'contentScripts/main': r('src/contentScripts/index.ts'),
          'options/index': r('src/options/index.html'),
        },
        // 开发模式跳过全量树摇，减少大量模块的副作用分析耗时；生产构建保持完整树摇。
        treeshake: !isDev,
        output: {
          format: 'es',
          entryFileNames: '[name].js',
          // 扩展本地资源无需 CDN 缓存哈希；固定分块名可避免开发模式重建后残留旧哈希文件或找不到分块。
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name][extname]',
          codeSplitting: {
            groups: [
              {
                name: 'vendor',
                // 保持 vuedraggable / sortablejs / qrcode 等按需依赖留在各自异步分块，不打入首屏 vendor。
                test: UI_VENDOR_RE,
              },
              {
                name: 'player',
                // 仅将视频播放器增强模块独立分块，不递归吸纳共享的 logic 等模块，避免设置页误依赖 player 分块。
                test: UI_PLAYER_RE,
                includeDependenciesRecursively: false,
              },
            ],
          },
        },
      },
    },
  }
}

export default defineConfig(createUiConfig)
