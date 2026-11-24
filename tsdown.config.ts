import type { UserConfig } from 'tsdown'
import { defineConfig } from 'tsdown'

import { createTsdownBuildReportCollector } from './scripts/buildReport.ts'
import { createThirdPartyLicensesTsdownCollector } from './scripts/thirdPartyLicenses.ts'
import { buildCommit, isDev, isFirefox, isSafari } from './scripts/utils.ts'

const outDir = isFirefox
  ? 'extension-firefox/dist'
  : isSafari
    ? 'extension-safari/dist'
    : 'extension/dist'

// 三个入口在扩展中的加载方式不同（web_accessible ESM、MV3 service_worker / Firefox classic script、content_script），
// 各自独立单入口打包并禁用分块，避免生成共享的 rolldown-runtime.js 导致运行时找不到模块或非模块脚本语法报错。
const entries = [
  { name: 'flvPlayer', entry: { 'contentScripts/flvPlayer': './src/contentScripts/flvPlayer.ts' } },
  { name: 'background', entry: { 'background/index': './src/background/index.ts' } },
  {
    name: 'pageLoading',
    entry: { 'contentScripts/pageLoading': './src/contentScripts/pageLoading.ts' },
  },
] as const

const sharedConfig: UserConfig = {
  outDir,
  clean: false,
  dts: false,
  logLevel: 'warn',
  format: ['esm'],
  fixedExtension: false,
  hash: false,
  target: 'esnext',
  // auto-imports.d.ts 会在每次 Vite 构建时重写，类型声明不影响后台脚本产物。
  ignoreWatch: [
    '**/extension/**',
    '**/extension-firefox/**',
    '**/extension-safari/**',
    '**/*.d.ts',
  ],
  deps: {
    // Stream players and background scripts are loaded in browser extension contexts and must be self-contained.
    alwaysBundle: ['md5', 'flv.js'],
    onlyBundle: false,
  },
  sourcemap: false, // https://github.com/vitejs/vite-plugin-vue/issues/35
  define: {
    __DEV__: JSON.stringify(isDev),
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
    'process.env.FIREFOX': isFirefox ? 'true' : 'false',
    'process.env.SAFARI': isSafari ? 'true' : 'false',
  },
  platform: 'browser',
  minify: isDev ? false : { compress: true, mangle: false },
  outputOptions: {
    codeSplitting: false,
  },
}

export function createTsdownConfigs(): UserConfig[] {
  const createLicensePlugin = createThirdPartyLicensesTsdownCollector('background')
  const createReportPlugin = createTsdownBuildReportCollector(entries.map(({ name }) => name))
  return entries.map(({ name, entry }) => ({
    ...sharedConfig,
    name,
    entry,
    plugins: [createLicensePlugin(name), createReportPlugin(name)],
  }))
}

export default defineConfig(createTsdownConfigs())
