import type { SettingsNavigationTarget } from '~/composables/useAppProvider'
import { isInIframe } from '~/utils/main'
import { openSettingsPage } from '~/utils/settingsPage'

/**
 * 页面内设置浮层的可见状态与打开目标。
 *
 * 状态只由内容脚本使用，避免把 Vue ref 混进后台和设置页共享的
 * `utils/settingsPage.ts`，后台读取设置页消息时不会被迫加载 Vue。
 */
export const settingsOverlayVisible = ref(false)
export const settingsOverlayTarget = ref<SettingsNavigationTarget | undefined>()

/**
 * 在 B 站页面内打开设置浮层；iframe 中无法承载浮层时回退到独立设置页。
 */
export function openSettingsOverlay(target?: SettingsNavigationTarget) {
  if (isInIframe()) {
    openSettingsPage(target)
    return
  }

  settingsOverlayTarget.value = target
  settingsOverlayVisible.value = true
}
