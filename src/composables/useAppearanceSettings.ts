import { useI18n } from 'vue-i18n'

import { LanguageType } from '~/enums/appEnums'
import { FROSTED_GLASS_BLUR_MAX_PX, FROSTED_GLASS_BLUR_MIN_PX, originalSettings, settings } from '~/logic'
import { syncActionAnimationFilter } from '~/utils/actionAnimationTheme'
import { injectCSS } from '~/utils/main'

/** 同步插件界面本身的语言与外观；页面内 App 和独立设置页共用，不改写 B 站页面行为。 */
export function useAppearanceSettings() {
  const { locale } = useI18n()

  const DEFAULT_FROSTED_GLASS_BLUR_PX = originalSettings.frostedGlassBlurIntensity
  const FROSTED_GLASS_DIALOG_OFFSET_PX = 10

  const clampFrostedGlassBlur = (value: number) => {
    if (!Number.isFinite(value))
      return DEFAULT_FROSTED_GLASS_BLUR_PX

    return Math.min(FROSTED_GLASS_BLUR_MAX_PX, Math.max(FROSTED_GLASS_BLUR_MIN_PX, value))
  }

  const applyFrostedGlassBlur = (rawValue: number) => {
    const clampedValue = clampFrostedGlassBlur(rawValue)
    const bewlyElement = document.querySelector('#bewly') as HTMLElement | null
    const targets: HTMLElement[] = [document.documentElement]

    if (bewlyElement)
      targets.push(bewlyElement)

    if (!settings.value.enableFrostedGlass) {
      targets.forEach((element) => {
        element.style.removeProperty('--bew-filter-glass-1')
        element.style.removeProperty('--bew-filter-glass-2')
      })
      return
    }

    const blur1Value = `blur(${clampedValue}px) saturate(180%)`
    const dialogBlur = clampedValue === 0 ? 0 : clampedValue + FROSTED_GLASS_DIALOG_OFFSET_PX
    const blur2Value = `blur(${dialogBlur}px) saturate(180%)`

    targets.forEach((element) => {
      if (Math.abs(clampedValue - DEFAULT_FROSTED_GLASS_BLUR_PX) < 0.01) {
        element.style.removeProperty('--bew-filter-glass-1')
        element.style.removeProperty('--bew-filter-glass-2')
      }
      else {
        element.style.setProperty('--bew-filter-glass-1', blur1Value)
        element.style.setProperty('--bew-filter-glass-2', blur2Value)
      }
    })
  }

  const applyFrostedGlassState = () => {
    const bewlyElement = document.querySelector('#bewly') as HTMLElement | null
    const shouldDisable = !settings.value.enableFrostedGlass

    bewlyElement?.classList.toggle('disable-frosted-glass', shouldDisable)
    document.documentElement.classList.toggle('disable-frosted-glass', shouldDisable)
    applyFrostedGlassBlur(settings.value.frostedGlassBlurIntensity)
  }

  watch(
    () => settings.value.language,
    async () => {
      // if there is first-time load extension, set the default language by browser display language
      if (!settings.value.language) {
        if (browser.i18n.getUILanguage() === 'zh-CN') {
          settings.value.language = LanguageType.Mandarin_CN
        }
        else if (browser.i18n.getUILanguage() === 'zh-TW') {
          // Since getUILanguage() cannot get the zh-HK language code
          // use getAcceptLanguages() to get the language code
          const languages: string[] = await browser.i18n.getAcceptLanguages()
          if (languages.includes('zh-HK')) {
            settings.value.language = LanguageType.Cantonese
          }
          else {
            settings.value.language = LanguageType.Mandarin_TW
          }
        }
        else {
          settings.value.language = LanguageType.English
        }
      }

      locale.value = settings.value.language

      if (locale.value === LanguageType.Mandarin_CN) {
        document.documentElement.lang = 'zh-CN'
      }
      else if (locale.value === LanguageType.Mandarin_TW) {
        document.documentElement.lang = 'zh-TW'
      }
      else if (locale.value === LanguageType.Cantonese) {
        document.documentElement.lang = 'zh-HK'
      }
      else {
        document.documentElement.lang = 'en'
      }
    },
    { immediate: true },
  )

  watch(
    [() => settings.value.customizeFont, () => settings.value.fontFamily],
    () => {
      const bewlyHost = document.getElementById('bewly')

      if (typeof settings.value.customizeFont === 'boolean')
        settings.value.customizeFont = 'recommend'

      // Set the default font family
      if (!settings.value.fontFamily && settings.value.customizeFont !== 'custom') {
        /* Do not wrap following line */
        settings.value.fontFamily = `CJKEmDash, Numbers, Onest, ShangguSansSCVF, -apple-system, BlinkMacSystemFont, InterVariable, Inter, "Segoe UI", Cantarell, "Noto Sans", "Roboto Flex", Roboto, sans-serif, ui-sans-serif, system-ui, "Apple Color Emoji", "Twemoji Mozilla", "Noto Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", emoji`
      }

      // Remove the custom fonts first
      document.documentElement.style.removeProperty('--bew-custom-fonts')

      // Under default settings, revert to Bilibili's original font-family
      if (settings.value.customizeFont === 'default') {
        document.documentElement.classList.remove('modify-fonts')
        bewlyHost?.classList.remove('modify-fonts')
      }
      else if (settings.value.customizeFont === 'recommend') {
        document.documentElement.classList.add('modify-fonts')
        bewlyHost?.classList.add('modify-fonts')
      }
      else {
        document.documentElement.classList.add('modify-fonts')
        bewlyHost?.classList.add('modify-fonts')
        document.documentElement.style.setProperty('--bew-custom-fonts', settings.value.fontFamily)
      }
    },
    { immediate: true },
  )

  // text-autospace 为继承属性，设在根元素即可覆盖原生页面与 Shadow DOM 内的插件 UI；
  // 不支持该属性的浏览器会忽略此规则
  let cjkLatinAutospaceStyleEl: HTMLStyleElement | null = null
  watch(
    () => settings.value.enableCjkLatinAutospace,
    (enabled) => {
      if (enabled) {
        cjkLatinAutospaceStyleEl ??= injectCSS(`
          html {
            text-autospace: normal !important;
          }
        `)
      }
      else {
        cjkLatinAutospaceStyleEl?.remove()
        cjkLatinAutospaceStyleEl = null
      }
    },
    { immediate: true },
  )

  watch(
    () => settings.value.enableFrostedGlass,
    applyFrostedGlassState,
    { immediate: true },
  )

  watch(
    () => settings.value.frostedGlassBlurIntensity,
    (value) => {
      const clamped = clampFrostedGlassBlur(value)

      if (clamped !== value) {
        settings.value.frostedGlassBlurIntensity = clamped
        return
      }

      applyFrostedGlassBlur(clamped)
    },
    { immediate: true },
  )

  watch(() => settings.value.disableShadow, (newValue) => {
    const bewlyElement = document.querySelector('#bewly') as HTMLElement
    if (newValue) {
      if (bewlyElement)
        bewlyElement.classList.add('disable-shadow')

      document.documentElement.classList.add('disable-shadow')
    }
    else {
      if (bewlyElement)
        bewlyElement.classList.remove('disable-shadow')

      document.documentElement.classList.remove('disable-shadow')
    }
  }, { immediate: true })

  watch(
    () => settings.value.themeColor,
    () => {
      const bewlyElement = document.querySelector('#bewly') as HTMLElement
      if (bewlyElement) {
        bewlyElement.style.setProperty('--bew-theme-color', settings.value.themeColor)
      }

      document.documentElement.style.setProperty('--bew-theme-color', settings.value.themeColor)
      syncActionAnimationFilter(settings.value.themeColor)
    },
    { immediate: true },
  )
}
