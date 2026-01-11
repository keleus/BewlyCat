import { usePreferredDark } from '@vueuse/core'

import { DARK_MODE_BASE_COLOR_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { runWhenIdle } from '~/utils/lazyLoad'
import { setCookie } from '~/utils/main'
import { executeTimes } from '~/utils/timer'

/**
 * Check if current page is festival page
 */
function isFestivalPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(document.URL)
}

/**
 * 设置深色模式基准颜色
 */
function setDarkModeBaseColor(color: string) {
  // 设置主文档的CSS变量（用于哔哩哔哩原站样式）
  document.documentElement.style.setProperty('--bew-dark-base-color', color)

  // 设置Shadow DOM内的CSS变量（用于BewlyCat组件样式）
  const bewlyContainer = document.getElementById('bewly')
  if (bewlyContainer?.shadowRoot) {
    const shadowHost = bewlyContainer
    shadowHost.style.setProperty('--bew-dark-base-color', color)
  }
}

export function useDark() {
  const isPreferredDark = usePreferredDark()
  const currentSystemColorScheme = computed(() => isPreferredDark.value ? 'dark' : 'light')
  const currentAppColorScheme = computed((): 'dark' | 'light' => {
    if (settings.value.theme !== 'auto')
      return settings.value.theme
    else
      return currentSystemColorScheme.value
  })
  const isDark = computed(() => currentAppColorScheme.value === 'dark')
  let themeChangeTimer: NodeJS.Timeout | null = null

  // Watch for changes in the 'settings.value.theme' variable and add the 'dark' class to the 'mainApp' element
  // to prevent some Unocss dark-specific styles from failing to take effect
  watch(
    () => [settings.value.theme, isPreferredDark.value],
    () => {
      setAppAppearance()
    },
    { immediate: true },
  )

  // 监听深色模式基准颜色变化
  watch(
    () => settings.value.darkModeBaseColor,
    (newColor) => {
      setDarkModeBaseColor(newColor)
      // 触发全局基准颜色变化事件
      window.dispatchEvent(new CustomEvent(DARK_MODE_BASE_COLOR_CHANGE, { detail: newColor }))
    },
    { immediate: true },
  )

  // use watchEffect instead of onMounted because onMounted is only aviailable in setup function
  watchEffect(() => {
    // Because some shadow dom may not be loaded when the page has already loaded, we need to wait until the page is idle
    runWhenIdle(() => {
      if (isDark.value) {
        setCookie('theme_style', 'dark', 365 * 10)
        // TODO: find a better way implement this
        themeChangeTimer = executeTimes(() => {
          window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'dark' }))
        }, 10, 500)
      }
      else {
        setCookie('theme_style', 'light', 365 * 10)
        themeChangeTimer = executeTimes(() => {
          window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'light' }))
        }, 10, 500)
      }
    })
  })

  /**
   * Watch for changes in the 'settings.value.theme' variable and add the 'dark' class to the 'mainApp' element
   * to prevent some Unocss dark-specific styles from failing to take effect
   */
  function setAppAppearance() {
    if (themeChangeTimer)
      clearInterval(themeChangeTimer)

    // Check if we should apply selective dark mode (plugin UI only) on festival pages
    const isSelectiveDark = isFestivalPage() && settings.value.adaptToOtherPageStyles

    if (isDark.value) {
      // Always apply dark mode to plugin container
      document.querySelector('#bewly')?.classList.add('dark')

      // Only apply global dark mode if not on festival pages
      if (!isSelectiveDark) {
        document.documentElement.classList.add('dark')
        document.body?.classList.add('dark')
        // bili_dark is bilibili's official dark mode class
        document.documentElement.classList.add('bili_dark')
      }

      // 确保深色模式基准颜色被正确应用
      setDarkModeBaseColor(settings.value.darkModeBaseColor)

      setCookie('theme_style', 'dark', 365 * 10)
      window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'dark' }))
    }
    else {
      document.querySelector('#bewly')?.classList?.remove('dark')

      // Only remove global classes if we're not in selective mode or if we applied them
      if (!isSelectiveDark) {
        document.documentElement.classList.remove('dark')
        document.body?.classList.remove('dark')
        document.documentElement.classList.remove('bili_dark')
      }

      setCookie('theme_style', 'light', 365 * 10)
      window.dispatchEvent(new CustomEvent('global.themeChange', { detail: 'light' }))
    }

    // Only used as a temporary solution, which will eventually be removed
    // It seems like Bilibili already supports dark mode when the `bili_dark` class is added to the `html` element
    // but it's not yet fully refined.
    if (currentAppColorScheme.value === 'dark') {
      if (document.documentElement.classList.contains('bili_dark')) {
        document.documentElement.classList.remove('bili_dark')
      }
    }
    // else {
    //   if (!document.documentElement.classList.contains('bili_dark')) {
    //     document.documentElement.classList.add('bili_dark')
    //   }
    // }
  }

  function toggleDark(e: MouseEvent) {
    const updateThemeSettings = () => {
      if (currentAppColorScheme.value !== currentSystemColorScheme.value)
        settings.value.theme = 'auto'
      else
        settings.value.theme = isPreferredDark.value ? 'light' : 'dark'
    }

    const isAppearanceTransition = typeof document !== 'undefined'
    // @ts-expect-error: Transition API
      && document.startViewTransition
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!isAppearanceTransition) {
      updateThemeSettings()
    }
    else {
      const x = e.clientX
      const y = e.clientY
      const endRadius = Math.hypot(
        Math.max(x, innerWidth - x),
        Math.max(y, innerHeight - y),
      )
      // https://github.com/vueuse/vueuse/pull/3129
      const style = document.createElement('style')
      const styleString = `
            *, *::before, *::after
            {-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}`
      style.appendChild(document.createTextNode(styleString))
      document.head.appendChild(style)

      const viewTransitionStyle = document.createElement('style')
      viewTransitionStyle.textContent = `
            ::view-transition-old(root),
            ::view-transition-new(root) {
              animation: none !important;
              mix-blend-mode: normal;
            }
            `
      document.head.appendChild(viewTransitionStyle)

      // Since the above normal dom style cannot be applied in shadow dom style
      // We need to add this style again to the shadow dom
      const shadowDomStyle = document.createElement('style')
      const shadowDomStyleString = `
            *, *::before, *::after
            {-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important; will-change: background}`
      shadowDomStyle.appendChild(document.createTextNode(shadowDomStyleString))

      const bewlyShadowRoot = document.getElementById('bewly')?.shadowRoot
      const bewlyWrapper = bewlyShadowRoot?.getElementById('bewly-wrapper')
      if (!bewlyWrapper)
        throw new Error('mainAppRef is not found')

      bewlyWrapper.appendChild(shadowDomStyle)

      const transition = document.startViewTransition(async () => {
        updateThemeSettings()
        await nextTick()
      })

      transition.ready.then(() => {
        const isDarkNow = document.documentElement.classList.contains('dark')

        const zIndexStyle = document.createElement('style')
        zIndexStyle.textContent = `
            ::view-transition-old(root) { z-index: ${isDarkNow ? 1 : 9999}; }
            ::view-transition-new(root) { z-index: ${isDarkNow ? 9999 : 1}; }
            `
        document.head.appendChild(zIndexStyle)

        const clipPath = [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ]
        const animation = document.documentElement.animate(
          {
            clipPath: isDarkNow ? clipPath : [...clipPath].reverse(),
          },
          {
            duration: 300,
            easing: 'ease-in-out',
            pseudoElement: isDarkNow
              ? '::view-transition-new(root)'
              : '::view-transition-old(root)',
          },
        )

        animation.finished.then(() => {
          zIndexStyle.remove()
        })
      })

      transition.finished.then(() => {
        style.remove()
        viewTransitionStyle.remove()
        shadowDomStyle.remove()
      })
    }
  }

  return {
    isDark,
    toggleDark,
  }
}
