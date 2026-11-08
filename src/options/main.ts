import 'uno.css'
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

import { localSettingsReady, settingsReady } from '~/logic'
import { setupApp } from '~/logic/common-setup'
import RESET_BEWLY_CSS from '~/styles/reset.css?raw'
import { setBilibiliCookieSnapshot } from '~/utils/main'
import { SVG_ICONS } from '~/utils/svgIcons'

import Options from './Options.vue'

const BILIBILI_URL = 'https://www.bilibili.com/'

const bundledStyleText = (globalThis as typeof globalThis & {
  __BEWLYCAT_BUNDLED_STYLE_TEXT__: string
}).__BEWLYCAT_BUNDLED_STYLE_TEXT__

// 扩展页的 document.cookie 读不到 B 站登录态，收藏夹整理等功能依赖这份快照。
async function syncBilibiliCookies() {
  try {
    const cookies = await browser.cookies.getAll({ url: BILIBILI_URL })
    setBilibiliCookieSnapshot(new Map(cookies.map(cookie => [cookie.name, cookie.value])))
  }
  catch (error) {
    console.error('[BewlyCat] 读取 B 站 Cookie 失败:', error)
  }
}

function mountOptionsPage() {
  // 与页面内的设置面板使用相同的 Shadow DOM 样式环境。
  const host = document.createElement('div')
  host.id = 'bewly'

  const shadowRoot = host.attachShadow({ mode: 'open' })
  const resetStyle = document.createElement('style')
  resetStyle.textContent = RESET_BEWLY_CSS
  const bundledStyle = document.createElement('style')
  bundledStyle.textContent = bundledStyleText
  const icons = document.createElement('div')
  icons.innerHTML = SVG_ICONS
  const root = document.createElement('div')
  shadowRoot.append(resetStyle, bundledStyle, root, icons)
  document.body.appendChild(host)

  const app = createApp(Options)
  setupApp(app)
  app.mount(root)
}

async function bootstrap() {
  setBilibiliCookieSnapshot(new Map())
  browser.cookies.onChanged.addListener(({ cookie }) => {
    if (cookie.domain.endsWith('bilibili.com'))
      void syncBilibiliCookies()
  })

  await Promise.all([settingsReady, localSettingsReady, syncBilibiliCookies()])
  mountOptionsPage()
}

void bootstrap()
