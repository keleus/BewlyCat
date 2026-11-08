<script setup lang="ts">
import type { Ref } from 'vue'

import ConfirmDialogOverlay from '~/components/ConfirmDialogOverlay.vue'
import Settings from '~/components/Settings/Settings.vue'
import { useAppearanceSettings } from '~/composables/useAppearanceSettings'
import type { BewlyAppProvider, SettingsNavigationTarget } from '~/composables/useAppProvider'
import { useConfirmDialogHost } from '~/composables/useConfirmDialog'
import { useDark } from '~/composables/useDark'
import { onMessage } from '~/utils/messaging'
import type { SettingsPageTabLocation } from '~/utils/settingsPage'
import { NAVIGATE_SETTINGS_PAGE_MESSAGE, parseSettingsPageHash } from '~/utils/settingsPage'

useAppearanceSettings()
const { isDark } = useDark()
const { activeConfirmDialog, finishConfirmDialog } = useConfirmDialogHost()

const mainAppRef = ref<HTMLElement>() as Ref<HTMLElement>
const pendingNavigation = ref<SettingsNavigationTarget | undefined>(parseSettingsPageHash(location.hash))
const isMounted = ref(false)

// 设置页及其子组件只使用这部分能力，其余是 B 站页面内布局相关的状态。
const appProvider: Pick<BewlyAppProvider, 'mainAppRef' | 'openSettings'> = {
  mainAppRef,
  openSettings: target => pendingNavigation.value = target,
}
provide('BEWLY_APP', appProvider as BewlyAppProvider)

onMessage<SettingsNavigationTarget | undefined, SettingsPageTabLocation>(NAVIGATE_SETTINGS_PAGE_MESSAGE, async (target) => {
  if (target)
    pendingNavigation.value = target

  const tab = await browser.tabs.getCurrent()
  return { tabId: tab?.id, windowId: tab?.windowId }
})

onMounted(() => {
  // Teleport 的目标 mainAppRef 在根节点挂载后才可用。
  isMounted.value = true
})
</script>

<template>
  <div
    id="bewly-wrapper"
    ref="mainAppRef"
    class="bewly-wrapper"
    :class="{ dark: isDark }"
    text="$bew-text-1"
  >
    <Settings
      v-if="isMounted"
      v-model:pending-navigation="pendingNavigation"
    />

    <ConfirmDialogOverlay
      v-if="activeConfirmDialog"
      :key="activeConfirmDialog.id"
      :request="activeConfirmDialog"
      @finish="finishConfirmDialog"
    />
  </div>
</template>
