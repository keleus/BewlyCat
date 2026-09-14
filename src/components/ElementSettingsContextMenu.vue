<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ContextMenu from '~/components/ContextMenu.vue'
import type { SettingsNavigationTarget } from '~/composables/useAppProvider'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { useMainStore } from '~/stores/mainStore'
import { getElementSettingsActions } from '~/utils/elementSettingsMenu'

const { t } = useI18n()
const { mainAppRef, openSettings, activatedPage } = useBewlyApp()
const { isLayoutEditing } = useLayoutEditMode()
const mainStore = useMainStore()
const target = shallowRef<SettingsNavigationTarget & { elementKey?: string }>()
const restoreFocus = ref(false)
let keyboardContextMenuRequested = false
const position = ref({ x: 0, y: 0 })
const generation = ref(0)
const actions = computed(() => target.value ? getElementSettingsActions(target.value, t, target.value.elementKey, mainStore.dockItems) : [])
const options = computed(() => [
  ...actions.value,
  { value: 'settings', label: t('dock.settings'), icon: 'i-mingcute:settings-3-line' },
])

function close() {
  target.value = undefined
}

function handleContextMenu(event: MouseEvent) {
  if (event.defaultPrevented || (event.shiftKey && !keyboardContextMenuRequested) || isLayoutEditing.value)
    return

  const path = event.composedPath()
  // Keep native text/video menus, even when a card is nested inside a configurable Pop.
  if (path.some(node => node instanceof HTMLElement
    && (node.matches('input, textarea, select, .video-card-container, .moment-card')
      || node.dataset.layoutSettingsPage === 'video-card'
      || node.isContentEditable))) {
    return
  }

  const element = path.find((node): node is HTMLElement => node instanceof HTMLElement
    && node.hasAttribute('data-layout-settings-menu'))
  if (!element || (!path.includes(mainAppRef.value) && !element.hasAttribute('data-native-settings-context-menu')))
    return

  restoreFocus.value = keyboardContextMenuRequested
    || (event.button === 0 && event.clientX === 0 && event.clientY === 0)
  keyboardContextMenuRequested = false
  event.preventDefault()
  event.stopPropagation()
  const rect = (path.find(node => node instanceof HTMLElement) as HTMLElement).getBoundingClientRect()
  position.value = event.clientX || event.clientY
    ? { x: event.clientX, y: event.clientY }
    : { x: rect.left, y: rect.bottom }
  target.value = {
    elementKey: element.dataset.layoutEditTarget,
    menu: element.dataset.layoutSettingsMenu as SettingsNavigationTarget['menu'],
    secondaryPage: element.dataset.layoutSettingsPage,
    targetTitleKey: element.dataset.layoutSettingsTitleKey,
  }
  generation.value++
}

function select(value: string | number) {
  const navigation = target.value
  const action = actions.value.find(action => action.value === value)
  if (value === 'settings' && navigation) {
    close()
    openSettings(navigation)
    return
  }

  action?.run()
  if (action?.checked === undefined)
    close()
}

useEventListener(document, 'keydown', (event) => {
  keyboardContextMenuRequested = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}, { capture: true })
useEventListener(document, 'pointerdown', () => {
  keyboardContextMenuRequested = false
}, { capture: true })

useEventListener(mainAppRef, 'contextmenu', handleContextMenu)
// The original Bilibili header is outside the extension's Shadow DOM.
useEventListener(document, 'contextmenu', handleContextMenu)
useEventListener(window, 'resize', close)
useEventListener(window, 'blur', close)
useEventListener(mainAppRef, 'scroll', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('.context-menu-container'))
    close()
}, { capture: true, passive: true })
useEventListener(document, 'scroll', close, { passive: true })
watch([isLayoutEditing, activatedPage], close)
</script>

<template>
  <ContextMenu
    v-if="target"
    :key="generation"
    :options="options"
    :menu-styles="{}"
    :cursor-position="position"
    :restore-focus="restoreFocus"
    @select="select"
    @close="close"
  />
</template>
