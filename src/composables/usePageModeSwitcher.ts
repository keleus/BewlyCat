import { useEventListener, useIntervalFn } from '@vueuse/core'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { computed, ref, toValue, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { useSettingsStore } from '~/stores/settingsStore'
import type { PageMode } from '~/utils/pageMode'
import {
  getNextPageMode,
  resolvePageModeNavigationUrl,
  resolvePageModeTarget,
  shouldReloadForPageModeChange,
} from '~/utils/pageMode'

export interface PageModeSwitcherState {
  currentIcon: ComputedRef<string>
  disabled: ComputedRef<boolean>
  nextIcon: ComputedRef<string>
  tooltip: ComputedRef<string>
  cyclePageMode: () => Promise<void>
}

const PAGE_MODE_ICONS: Readonly<Record<PageMode, string>> = {
  original: 'mingcute:bilibili-line',
  bewly: 'mingcute:cat-line',
  custom: 'mingcute:pencil-ruler-line',
}

const PAGE_MODE_LABEL_KEYS: Readonly<Record<PageMode, string>> = {
  original: 'dock.page_mode_original',
  bewly: 'dock.page_mode_bewly',
  custom: 'dock.page_mode_custom',
}

export function usePageModeSwitcher(
  activatedPage: MaybeRefOrGetter<AppPage>,
): PageModeSwitcherState {
  const { t } = useI18n()
  const settingsStore = useSettingsStore()
  const currentLocationHref = ref(window.location.href)
  const switchingPageMode = ref(false)

  function updateCurrentLocationHref() {
    if (currentLocationHref.value !== window.location.href)
      currentLocationHref.value = window.location.href
  }

  useEventListener(window, 'pushstate', updateCurrentLocationHref)
  useEventListener(window, 'popstate', updateCurrentLocationHref)
  useEventListener(window, 'hashchange', updateCurrentLocationHref)
  useIntervalFn(updateCurrentLocationHref, 1000)
  watch(() => toValue(activatedPage), updateCurrentLocationHref, { flush: 'post' })

  const target = computed(() => {
    return resolvePageModeTarget(currentLocationHref.value, toValue(activatedPage))
  })
  const unavailable = computed(() => target.value === null)
  const disabled = computed(() => unavailable.value || switchingPageMode.value)
  const nextMode = computed(() => getNextPageMode(settings.value.pageMode))
  const currentIcon = computed(() => PAGE_MODE_ICONS[settings.value.pageMode])
  const nextIcon = computed(() => PAGE_MODE_ICONS[nextMode.value])
  const tooltip = computed(() => {
    if (unavailable.value)
      return t('dock.bewly_page_unavailable')

    return t('dock.page_mode_switch_tooltip', {
      current: t(PAGE_MODE_LABEL_KEYS[settings.value.pageMode]),
      next: t(PAGE_MODE_LABEL_KEYS[nextMode.value]),
    })
  })

  async function cyclePageMode() {
    if (switchingPageMode.value)
      return

    updateCurrentLocationHref()
    const currentHref = currentLocationHref.value
    const currentTarget = resolvePageModeTarget(currentHref, toValue(activatedPage))
    if (!currentTarget)
      return

    const previousPageMode = settings.value.pageMode
    const wasUsingOriginalBilibiliHomepage = settings.value.useOriginalBilibiliHomepage
    const selectedPageMode = nextMode.value
    settings.value = {
      ...settings.value,
      pageMode: selectedPageMode,
      useOriginalBilibiliHomepage: false,
    }

    const useOriginalBiliPage = settingsStore.getDockItemIsUseOriginalBiliPage(
      currentTarget.preferencePage,
    )
    const navigationUrl = resolvePageModeNavigationUrl(
      currentHref,
      currentTarget,
      useOriginalBiliPage,
    )

    const shouldReload = shouldReloadForPageModeChange(
      currentHref,
      wasUsingOriginalBilibiliHomepage,
    )
    const shouldNavigate = navigationUrl && navigationUrl !== currentHref
    if (shouldReload || shouldNavigate) {
      switchingPageMode.value = true
      try {
        await settings.flush()
      }
      catch {
        settings.value = {
          ...settings.value,
          pageMode: previousPageMode,
          useOriginalBilibiliHomepage: wasUsingOriginalBilibiliHomepage,
        }
        switchingPageMode.value = false
        return
      }
    }

    if (shouldReload) {
      window.location.reload()
      return
    }

    if (navigationUrl && navigationUrl !== currentHref)
      window.location.assign(navigationUrl)
  }

  return {
    currentIcon,
    disabled,
    nextIcon,
    tooltip,
    cyclePageMode,
  }
}
