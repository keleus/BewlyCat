// uno.css 已由统一 UI 构建在 src/contentScripts/index.ts 引入并通过 chunks/shadowStyles.js 共享，避免重复导入告警。
import 'vue-toastification/dist/index.css'
import '~/styles/variables.scss'
import '~/styles/main.scss'
import '~/styles/toast.scss'
import '~/styles/transitionAndTransitionGroup.scss'
import '~/styles/segmentLiquidIndicator.scss'
import '~/styles/segmentControl.scss'
import '~/styles/fonts.scss'
import './options.scss'
import { createApp } from 'vue'

import { localSettingsReady, settings, settingsReady } from '~/logic'
import { setupApp } from '~/logic/common-setup'
import { setActiveLocale } from '~/utils/i18n'
import { setBilibiliCookieSnapshot } from '~/utils/main'

import Options from './Options.vue'
import { registerSettingsComponents } from './settingsComponents'

import RESET_BEWLY_CSS from '~/styles/reset.css?raw'

const BILIBILI_URL = 'https://www.bilibili.com/'
const optionsGlobal = globalThis as typeof globalThis & {
  __BEWLYCAT_BUNDLED_STYLE_TEXT__: string
}

// 扩展页的 document.cookie 读不到 B 站登录态，收藏夹整理等功能依赖这份快照。
async function syncBilibiliCookies() {
  try {
    const cookies = await browser.cookies.getAll({ url: BILIBILI_URL })
    setBilibiliCookieSnapshot(new Map(cookies.map((cookie) => [cookie.name, cookie.value])))
  } catch (error) {
    console.error('[BewlyCat] 读取 B 站 Cookie 失败:', error)
  }
}

function mountOptionsPage() {
  // 与内容脚本共享同一份打包后的 Shadow DOM 样式（由 chunks/shadowStyles.js 同步注入），
  // 宿主页面仅通过 ./host.css 加载页面壳与 toast 样式，避免双份输出 shadow.css。
  const host = document.createElement('div')
  host.id = 'bewly'

  const shadowRoot = host.attachShadow({ mode: 'open' })
  const resetStyle = document.createElement('style')
  resetStyle.textContent = RESET_BEWLY_CSS

  const bundledStyle = document.createElement('style')
  bundledStyle.setAttribute('data-bewly-bundled-styles', '')
  bundledStyle.textContent = optionsGlobal.__BEWLYCAT_BUNDLED_STYLE_TEXT__

  const root = document.createElement('div')
  shadowRoot.append(resetStyle, bundledStyle, root)
  document.body.appendChild(host)

  const app = createApp(Options)
  setupApp(app)
  registerSettingsComponents(app)
  app.mount(root)
}

async function bootstrap() {
  setBilibiliCookieSnapshot(new Map())
  browser.cookies.onChanged.addListener(({ cookie }) => {
    const normalizedDomain = cookie.domain.trim().toLowerCase().replace(/^\.+/, '')
    if (normalizedDomain === 'bilibili.com' || normalizedDomain.endsWith('.bilibili.com'))
      void syncBilibiliCookies()
  })

  await Promise.all([settingsReady, localSettingsReady, syncBilibiliCookies()])
  await setActiveLocale(settings.value.language)
  mountOptionsPage()
}

void bootstrap()
