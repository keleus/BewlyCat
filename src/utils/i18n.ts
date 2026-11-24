import { watch } from 'vue'
import { createI18n } from 'vue-i18n'

import { LanguageType } from '~/enums/appEnums'

type SupportedLocale = (typeof LanguageType)[keyof typeof LanguageType]

const localeLoaders: Record<SupportedLocale, () => Promise<{ default: Record<string, any> }>> = {
  [LanguageType.English]: () => import('~/_locales/en.yml'),
  [LanguageType.Mandarin_CN]: () => import('~/_locales/cmn-CN.yml'),
  [LanguageType.Mandarin_TW]: () => import('~/_locales/cmn-TW.yml'),
  [LanguageType.Cantonese]: () => import('~/_locales/jyut.yml'),
}

const loadedLocales = new Set<SupportedLocale>()
const pendingLoads = new Map<SupportedLocale, Promise<void>>()
let activeLocaleRequestId = 0

export function resolveLocale(preferred?: string): SupportedLocale {
  if (preferred && preferred in localeLoaders) return preferred as SupportedLocale

  const uiLang = typeof browser !== 'undefined' ? browser.i18n.getUILanguage() : navigator.language
  if (uiLang === 'zh-CN' || uiLang === 'zh-SG') return LanguageType.Mandarin_CN
  if (uiLang === 'zh-HK' || uiLang === 'zh-MO') return LanguageType.Cantonese
  if (uiLang === 'zh-TW') return LanguageType.Mandarin_TW
  return LanguageType.English
}

export const i18n = createI18n({
  legacy: false,
  locale: LanguageType.English,
  fallbackLocale: LanguageType.English,
  globalInjection: true,
  // 按当前语言动态加载对应语种；关闭缺失回退告警避免切换加载瞬间噪声。
  missingWarn: false,
  fallbackWarn: false,
  // 内置翻译中的 HTML 为有意使用（v-html 渲染），且只来自打包的 locale 文件
  warnHtmlMessage: false,
  messages: {},
})

export async function ensureLocaleMessages(preferred?: string): Promise<SupportedLocale> {
  const target = resolveLocale(preferred)
  if (!loadedLocales.has(target)) {
    let task = pendingLoads.get(target)
    if (!task) {
      task = localeLoaders[target]()
        .then((mod) => {
          i18n.global.setLocaleMessage(target, mod.default)
          loadedLocales.add(target)
        })
        .finally(() => {
          pendingLoads.delete(target)
        })
      pendingLoads.set(target, task)
    }
    await task
  }
  return target
}

/** 先拉取目标语言包再切换全局 locale，避免界面和轻 DOM 文案在切换瞬间出现未加载键名。 */
export async function setActiveLocale(preferred?: string): Promise<SupportedLocale> {
  const requestId = ++activeLocaleRequestId
  const target = await ensureLocaleMessages(preferred)
  if (requestId === activeLocaleRequestId && i18n.global.locale.value !== target) {
    i18n.global.locale.value = target
  }
  return target
}

// 兜底：若有外部逻辑直接改写 locale，也自动补拉目标语言包。
watch(
  () => i18n.global.locale.value,
  (nextLocale) => {
    if (nextLocale) void ensureLocaleMessages(nextLocale)
  },
)
