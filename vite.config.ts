import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import replace from '@rollup/plugin-replace'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import type { Plugin, UserConfig } from 'vite'

import { buildCommit, isDev, isFirefox, r } from './scripts/utils.ts'

// unplugin-vue-i18n 按 config.isProduction 选择消息格式：开发模式下每条消息都编译为带 start/end/loc/source
// 位置信息的完整 AST，4 个语言约 3.5 MB，是生产格式的十倍左右，显著拖慢内容脚本与设置页的构建。
// 位置信息只用于编译期报错定位，vue-i18n 运行时同样解析精简格式，因此开发构建也使用生产格式。
function withCompactI18nMessages(plugins: Plugin | Plugin[]): Plugin[] {
  return [plugins].flat().map((plugin) => {
    const hook = plugin.configResolved
    if (!hook) return plugin
    const handler = typeof hook === 'function' ? hook : hook.handler
    return {
      ...plugin,
      configResolved(config) {
        return handler.call(this, Object.create(config, { isProduction: { value: true } }))
      },
    }
  })
}

// 内容脚本、页面脚本与设置页的共享配置工厂；每次构建生成独立插件实例，
// 避免多构建共享可变插件状态，也避免开发模式通过 configFile 反复动态加载配置泄漏 ESM 模块缓存。
export function createSharedConfig(): UserConfig {
  return {
    root: r('src'),
    resolve: {
      alias: [
        { find: '~/', replacement: `${r('src')}/` },
        { find: '~', replacement: r('src') },
        // vuedraggable's UMD entry `require`s `vue`, which resolves to the CJS
        // build and drags the template compiler into the content script.
        // Templates are precompiled, so every consumer can share the runtime build.
        { find: /^vue$/, replacement: 'vue/dist/vue.runtime.esm-bundler.js' },
      ],
    },
    plugins: [
      Vue(),

      AutoImport({
        dts: r('src/auto-imports.d.ts'),
        // 跳过 node_modules 与 Vue 样式子模块，避免 Rolldown 将 200+ 个 ?vue&type=style 传给 JS transform。
        exclude: [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[?&]type=style(?:&|$)/],
        // @types/webextension-polyfill 使用 `export = Browser`，unimport 为默认导入生成的
        // `typeof import('webextension-polyfill').default` 会退化为 any；全局类型改由 src/global.d.ts 声明。
        ignoreDts: ['browser'],
        imports: [
          'vue',
          {
            // webextension-polyfill 是返回 Proxy 的 CJS/UMD 模块；命名空间导入在 Rolldown 下会
            // 通过 __toESM 丢失自有属性并穿透到原生 chrome.*，必须使用默认导入。
            'webextension-polyfill': [['default', 'browser']],
          },
        ],
      }),

      // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
      withCompactI18nMessages(
        VueI18nPlugin({
          runtimeOnly: true,
          compositionOnly: true,
          strictMessage: false,
          include: [r('./src/_locales/**')],
        }),
      ),

      // https://github.com/unocss/unocss
      // UnoCSS(),

      replace({
        __DEV__: JSON.stringify(isDev),
        __BUILD_COMMIT__: JSON.stringify(buildCommit),
        'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
        'process.env.FIREFOX': JSON.stringify(isFirefox),
        __VUE_OPTIONS_API__: JSON.stringify(true),
        __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
        preventAssignment: true,
      }),
    ],
  }
}
