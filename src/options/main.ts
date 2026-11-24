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

import { localSettingsReady, settings, settingsReady } from '~/logic'
import { setupApp } from '~/logic/common-setup'
import { setBilibiliCookieSnapshot } from '~/utils/main'

import { ensureLocaleMessages, i18n } from './i18n'
import Options from './Options.vue'
import { registerSettingsComponents } from './settingsComponents'

import RESET_BEWLY_CSS from '~/styles/reset.css?raw'

const BILIBILI_URL = 'https://www.bilibili.com/'
const OPTIONS_SHADOW_CSS_HREF = './assets/shadow.css'

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
  // 与页面内的设置面板使用相同的 Shadow DOM 样式环境；
  // 样式通过独立外链加载，避免内联进 JS 或双份注入 document.head。
  const host = document.createElement('div')
  host.id = 'bewly'
  host.style.visibility = 'hidden'

  const shadowRoot = host.attachShadow({ mode: 'open' })
  const resetStyle = document.createElement('style')
  resetStyle.textContent = RESET_BEWLY_CSS

  const shadowStyleLink = document.createElement('link')
  shadowStyleLink.rel = 'stylesheet'
  shadowStyleLink.href = OPTIONS_SHADOW_CSS_HREF

  let revealed = false
  const revealHost = () => {
    if (revealed) return
    revealed = true
    host.style.visibility = ''
  }
  shadowStyleLink.addEventListener('load', revealHost, { once: true })
  shadowStyleLink.addEventListener('error', revealHost, { once: true })

  const root = document.createElement('div')
  shadowRoot.append(resetStyle, shadowStyleLink, root)
  document.body.appendChild(host)

  if (shadowStyleLink.sheet) revealHost()
  else window.setTimeout(revealHost, 300)

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
  const activeLocale = await ensureLocaleMessages(settings.value.language)
  i18n.global.locale.value = activeLocale
  mountOptionsPage()
}

void bootstrap()
