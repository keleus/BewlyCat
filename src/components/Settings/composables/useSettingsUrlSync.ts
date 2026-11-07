import { useEventListener } from '@vueuse/core'
import type { ComputedRef } from 'vue'

import type { SettingsNavigationTarget } from '~/composables/useAppProvider'
import { parseSettingsPageHash } from '~/utils/settingsPage'

/** 让当前设置页与地址栏同步，支持直接打开和浏览器前进后退。 */
export function useSettingsUrlSync(
  currentHash: ComputedRef<string>,
  navigate: (target: SettingsNavigationTarget) => void,
) {
  // 打开页面或跟随地址栏跳转时已有历史记录，补全地址时不能再新增一条。
  let replaceNextUrl = true

  watch(currentHash, (hash) => {
    if (hash !== location.hash) {
      if (replaceNextUrl)
        history.replaceState(null, '', hash)
      else
        history.pushState(null, '', hash)
    }
    replaceNextUrl = false
  }, { immediate: true })

  useEventListener(window, 'hashchange', () => {
    if (location.hash === currentHash.value)
      return

    const target = parseSettingsPageHash(location.hash)
    if (target) {
      replaceNextUrl = true
      navigate(target)
    }
    // 跳转后地址仍未规范（如不存在的二级页），或地址无法识别时，恢复为当前页面。
    if (location.hash !== currentHash.value)
      history.replaceState(null, '', currentHash.value)
    replaceNextUrl = false
  })
}
