import messages from '@intlify/unplugin-vue-i18n/messages'
import { createI18n } from 'vue-i18n'

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  globalInjection: true,
  // 内置翻译中的 HTML 为有意使用（v-html 渲染），且只来自打包的 locale 文件
  warnHtmlMessage: false,
  messages,
})
