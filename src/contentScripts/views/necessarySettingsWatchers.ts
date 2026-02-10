import { useI18n } from 'vue-i18n'

import { IFRAME_TOP_BAR_CHANGE } from '~/constants/globalEvents'
import { setUselessFeedCardBlockerEnabled } from '~/contentScripts/features/blockUselessFeedCards'
import { LanguageType } from '~/enums/appEnums'
import { appAuthTokens, FROSTED_GLASS_BLUR_MAX_PX, FROSTED_GLASS_BLUR_MIN_PX, localSettings, originalSettings, settings } from '~/logic'
import { resetBilibiliTopBarInlineStyles } from '~/utils/bilibiliTopBar'
import { cleanBilibiliShareText, getUserID, injectCSS, isHomePage, isInIframe } from '~/utils/main'

export function setupNecessarySettingsWatchers() {
  const { locale } = useI18n()
  let syncingTopBarSettings = false

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

    // 设置页已增加了相应警告，不再限制模糊强度
    const blur1Value = `blur(${clampedValue}px)`
    const blur2Value = `blur(${clampedValue + FROSTED_GLASS_DIALOG_OFFSET_PX}px)`

    targets.forEach((element) => {
      element.style.setProperty('--bew-filter-glass-1', blur1Value)
      element.style.setProperty('--bew-filter-glass-2', blur2Value)
    })
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
      }
      else if (settings.value.customizeFont === 'recommend') {
        document.documentElement.classList.add('modify-fonts')
      }
      else {
        document.documentElement.classList.add('modify-fonts')
        document.documentElement.style.setProperty('--bew-custom-fonts', settings.value.fontFamily)
      }
    },
    { immediate: true },
  )

  let danmakuFontStyleEl: HTMLStyleElement | null = null
  watch(
    () => settings.value.overrideDanmakuFont,
    () => {
      if (settings.value.overrideDanmakuFont) {
        danmakuFontStyleEl = injectCSS(`
          .bewly-design.modify-fonts .bili-danmaku-x-dm {
            font-family: var(--bew-fonts) !important;
          }
        `)
      }
      else {
        danmakuFontStyleEl?.remove()
      }
    },
    { immediate: true },
  )

  const removeTheIndentFromChinesePunctuationStyleEl = injectCSS(`
    .video-info-container .special-text-indent[data-title^='“'],a[title^='“'],p[title^='“'],h3[title^='“'],
    .video-info-container .special-text-indent[data-title^='《'],a[title^='《'],p[title^='《'],h3[title^='《'],
    .video-info-container .special-text-indent[data-title^='「'],a[title^='「'],p[title^='「'],h3[title^='「'],
    .video-info-container .special-text-indent[data-title^='『'],a[title^='『'],p[title^='『'],h3[title^='『'],
    .video-info-container .special-text-indent[data-title^='【'],a[title^='【'],p[title^='【'],h3[title^='【'] {
      text-indent: 0 !important;
    }
  `)
  watch(
    () => settings.value.removeTheIndentFromChinesePunctuation,
    () => {
      if (settings.value.removeTheIndentFromChinesePunctuation) {
        document.documentElement.appendChild(removeTheIndentFromChinesePunctuationStyleEl)
      }
      else {
        document.documentElement.removeChild(removeTheIndentFromChinesePunctuationStyleEl)
      }
    },
    { immediate: true },
  )

  watch(
    () => settings.value.enableFrostedGlass,
    () => {
      const bewlyElement = document.querySelector('#bewly') as HTMLElement | null
      if (settings.value.enableFrostedGlass) {
        if (bewlyElement)
          bewlyElement.classList.remove('disable-frosted-glass')

        document.documentElement.classList.remove('disable-frosted-glass')
      }
      else {
        if (bewlyElement)
          bewlyElement.classList.add('disable-frosted-glass')

        document.documentElement.classList.add('disable-frosted-glass')
      }

      applyFrostedGlassBlur(settings.value.frostedGlassBlurIntensity)
    },
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

  watch(() => settings.value.blockAds, () => {
    // Do not use the "ads" keyword. AdGuard, AdBlock, and some ad-blocking extensions will
    // detect and remove it when the class name contains "ads"
    if (settings.value.blockAds)
      document.documentElement.classList.add('block-useless-contents')
    else
      document.documentElement.classList.remove('block-useless-contents')

    // Avoid expensive :has() selectors by using a JS marker on homepage feed cards.
    setUselessFeedCardBlockerEnabled(settings.value.blockAds && isHomePage() && !isInIframe())
  }, { immediate: true })

  // SPA navigation: homepage state can change without a full reload.
  if (!isInIframe()) {
    const refreshUselessFeedCardBlocker = () => {
      setUselessFeedCardBlockerEnabled(settings.value.blockAds && isHomePage() && !isInIframe())
    }
    window.addEventListener('pushstate', refreshUselessFeedCardBlocker)
    window.addEventListener('popstate', refreshUselessFeedCardBlocker)
    window.addEventListener('hashchange', refreshUselessFeedCardBlocker)
  }

  /**
   * 搜尋結果的上方的廣告，但有時是年末總結、年度報告這些
   */
  const blockTopSearchPageAdsStyleEl = injectCSS(`
    .activity-game-list {
      display: none !important;
    }
  `)
  watch(() => settings.value.blockTopSearchPageAds, () => {
    if (settings.value.blockTopSearchPageAds)
      document.documentElement.appendChild(blockTopSearchPageAdsStyleEl)
    else
      document.documentElement.removeChild(blockTopSearchPageAdsStyleEl)
  }, { immediate: true })

  watch(
    () => settings.value.themeColor,
    () => {
      const bewlyElement = document.querySelector('#bewly') as HTMLElement
      if (bewlyElement) {
        bewlyElement.style.setProperty('--bew-theme-color', settings.value.themeColor)
      }

      document.documentElement.style.setProperty('--bew-theme-color', settings.value.themeColor)
    },
    { immediate: true },
  )

  let styleEL: HTMLStyleElement | null = null
  let bewlyStyleEL: HTMLStyleElement | null = null
  watch(
    [() => localSettings.value.customizeCSS, () => localSettings.value.customizeCSSContent],
    () => {
      const bewlyEl: HTMLElement | null = document.querySelector('#bewly')
      const bewlyShadow: ShadowRoot | null = bewlyEl?.shadowRoot || null

      document.querySelectorAll('[data-bewly-customizeCSS]').forEach((el) => {
        el.remove()
      })

      bewlyShadow?.querySelectorAll('[data-bewly-customizeCSS]').forEach((el) => {
        el.remove()
      })

      if (localSettings.value.customizeCSS) {
        styleEL = injectCSS(localSettings.value.customizeCSSContent)
        styleEL.setAttribute('data-bewly-customizeCSS', '')

        if (bewlyShadow) {
          bewlyStyleEL = injectCSS(localSettings.value.customizeCSSContent, bewlyShadow)
          bewlyStyleEL.setAttribute('data-bewly-customizeCSS', '')
        }
      }
    },
    { immediate: true },
  )

  watch(
    () => appAuthTokens.value.accessToken,
    (token) => {
      if (!token)
        return

      // Clear accessKey if not logged in
      if (!getUserID())
        appAuthTokens.value.accessToken = ''
    },
    { immediate: true },
  )

  watch(
    () => settings.value.showTopBar,
    (newVal) => {
      // `showTopBar` is the Bewly top bar toggle. Keep `useOriginalBilibiliTopBar` in sync,
      // but avoid ping-pong writes that can race in async storage.
      if (syncingTopBarSettings)
        return

      const desiredUseOriginal = !newVal
      if (settings.value.useOriginalBilibiliTopBar === desiredUseOriginal)
        return

      syncingTopBarSettings = true
      settings.value.useOriginalBilibiliTopBar = desiredUseOriginal
      syncingTopBarSettings = false
    },
    { immediate: true },
  )

  watch(
    () => settings.value.useOriginalBilibiliTopBar,
    (newVal) => {
      // `useOriginalBilibiliTopBar` is the source-of-truth for "which top bar to use".
      // Sync `showTopBar` (Bewly top bar visible) with minimal writes.
      const desiredShowTopBar = !newVal
      if (!syncingTopBarSettings && settings.value.showTopBar !== desiredShowTopBar) {
        syncingTopBarSettings = true
        settings.value.showTopBar = desiredShowTopBar
        syncingTopBarSettings = false
      }
      applyOuterTopBarPolicy()

      // Sync top bar visibility preference to embedded Bilibili iframes.
      // `useStorageAsync` (webextension storage) doesn't automatically sync reactive state across frames,
      // so the iframe may not update until reload without this message.
      if (!isInIframe()) {
        const message = {
          type: IFRAME_TOP_BAR_CHANGE,
          useOriginalBilibiliTopBar: settings.value.useOriginalBilibiliTopBar,
        }

        const iframeCandidates = new Set<HTMLIFrameElement>()
        document.querySelectorAll<HTMLIFrameElement>('iframe').forEach(iframe => iframeCandidates.add(iframe))
        document.getElementById('bewly')?.shadowRoot?.querySelectorAll<HTMLIFrameElement>('iframe').forEach(iframe => iframeCandidates.add(iframe))

        iframeCandidates.forEach((iframe) => {
          try {
            // Prefer direct DOM access when same-origin, so it works even if the iframe didn't inject our content script.
            const iframeDoc = iframe.contentWindow?.document
            iframeDoc?.documentElement?.classList.toggle('remove-top-bar', !settings.value.useOriginalBilibiliTopBar)
            if (settings.value.useOriginalBilibiliTopBar && iframeDoc)
              resetBilibiliTopBarInlineStyles(iframeDoc)
          }
          catch {
            // Ignore cross-origin / sandbox restrictions.
          }

          try {
            iframe.contentWindow?.postMessage(message, '*')
          }
          catch {
            // Ignore cross-origin / sandbox restrictions.
          }
        })
      }
    },
    { immediate: true },
  )

  // In the homepage "original Bili page in iframe" mode, the iframe may appear after async settings load.
  // Observe shadow DOM changes so we can hide/show the outer `.bili-header` reliably without requiring refresh.
  if (!isInIframe() && isHomePage()) {
    const bewlyHost = document.getElementById('bewly')
    const shadow = bewlyHost?.shadowRoot
    if (shadow) {
      const observer = new MutationObserver(() => {
        applyOuterTopBarPolicy()
      })
      observer.observe(shadow, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
    }
  }

  watch(
    () => settings.value.adaptToOtherPageStyles,
    () => {
      if (settings.value.adaptToOtherPageStyles)
        document.documentElement.classList.add('bewly-design')
      else
        document.documentElement.classList.remove('bewly-design')
    },
    { immediate: true },
  )

  // Clean Share Link - intercept clipboard copy events
  let cleanShareLinkCopyHandler: ((e: ClipboardEvent) => void) | null = null

  watch(
    [
      () => settings.value.enableCleanShareLink,
      () => settings.value.cleanShareLinkIncludeTitle,
      () => settings.value.cleanShareLinkRemoveTrackingParams,
    ],
    () => {
      // Remove previous handler if exists
      if (cleanShareLinkCopyHandler) {
        document.removeEventListener('copy', cleanShareLinkCopyHandler, true)
        cleanShareLinkCopyHandler = null
      }

      if (settings.value.enableCleanShareLink) {
        // Handle document copy events (e.g., Ctrl+C)
        cleanShareLinkCopyHandler = (e: ClipboardEvent) => {
          const clipboardData = e.clipboardData
          if (!clipboardData)
            return

          const text = clipboardData.getData('text/plain')
          if (!text)
            return

          // Only process text that looks like a Bilibili share text or contains Bilibili URLs
          const isBilibiliShare = /【.+?】\s*https?:\/\//.test(text)
          const hasBilibiliUrl = /https?:\/\/(?:www\.)?bilibili\.com\//.test(text) || /https?:\/\/b23\.tv\//.test(text)

          if (isBilibiliShare || hasBilibiliUrl) {
            const cleanedText = cleanBilibiliShareText(text, {
              includeTitle: settings.value.cleanShareLinkIncludeTitle,
              removeTrackingParams: settings.value.cleanShareLinkRemoveTrackingParams,
            })

            if (cleanedText !== text) {
              e.preventDefault()
              clipboardData.setData('text/plain', cleanedText)
            }
          }
        }

        document.addEventListener('copy', cleanShareLinkCopyHandler, true)
      }
    },
    { immediate: true },
  )

  function hasBiliIframePage(): boolean {
    const bewlyHost = document.getElementById('bewly')
    const shadow = bewlyHost?.shadowRoot
    if (!shadow)
      return false
    // Only consider iframes that look like a Bilibili page.
    return Boolean(shadow.querySelector('iframe[src*="bilibili.com"]'))
  }

  function applyOuterTopBarPolicy() {
    if (isInIframe())
      return

    // Handle homepage-specific logic
    if (isHomePage()) {
      // When the homepage is showing an original Bilibili page inside our iframe (dock item "useOriginalBiliPage"),
      // we should keep the *outer* document's Bilibili top bar hidden to avoid double headers.
      const shouldHideOuterBiliTopBar = hasBiliIframePage()

      const shouldApplyRemoveTopBar = !settings.value.useOriginalBilibiliTopBar || shouldHideOuterBiliTopBar
      document.documentElement.classList.toggle('remove-top-bar', shouldApplyRemoveTopBar)

      const outerHeader = document.querySelector<HTMLElement>('.bili-header')
      if (outerHeader) {
        if (shouldHideOuterBiliTopBar)
          outerHeader.style.display = 'none'
        else
          outerHeader.style.removeProperty('display')
      }

      if (settings.value.useOriginalBilibiliTopBar && !shouldHideOuterBiliTopBar)
        resetBilibiliTopBarInlineStyles(document)
    }
    else {
      // Handle non-homepage pages
      document.documentElement.classList.toggle('remove-top-bar', !settings.value.useOriginalBilibiliTopBar)

      // When switching to Bewly top bar, reset any inline styles that Bilibili might have added
      if (!settings.value.useOriginalBilibiliTopBar)
        resetBilibiliTopBarInlineStyles(document)
      // When switching to original Bilibili top bar, also reset inline styles to ensure it's visible
      else
        resetBilibiliTopBarInlineStyles(document)
    }
  }
}
