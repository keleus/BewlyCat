<script setup lang="ts">
import { computed } from 'vue'

import { useLayoutEditMode } from '~/composables/useLayoutEditMode'

const props = defineProps<{
  componentKey: string
  /**
   * Kept for callers that use the component as a labelled editor target. The
   * inspector reads the stable settings key below, so no inline controls are
   * rendered here.
   */
  title?: string
  settingsTargetTitleKey?: string
}>()

const { isLayoutEditing } = useLayoutEditMode()

const topBarSettingsTargets: Record<string, string> = {
  logo: 'settings.top_bar_logo_style',
  search: 'settings.show_hot_search_in_top_bar',
  switcher: 'settings.show_bewly_or_bili_page_switcher',
  pinnedChannels: 'settings.topbar_pinned_channels_title',
  moments: 'topbar.moments',
  favorites: 'topbar.favorites',
  history: 'topbar.history',
  watchLater: 'topbar.watch_later',
  creatorCenter: 'topbar.creative_center',
  upload: 'topbar.upload',
  notifications: 'topbar.notifications',
  avatar: 'settings.topbar_user_menu',
  topBarSwitcher: 'settings.show_bewly_or_bili_top_bar_switcher',
}

const settingsTargetTitleKey = computed(() => props.settingsTargetTitleKey
  ?? topBarSettingsTargets[props.componentKey])
const editTargetKey = computed(() => `topbar-${props.componentKey}`)
</script>

<template>
  <div
    class="top-bar-item-editor"
    :class="{ 'top-bar-item-editor--editing': isLayoutEditing }"
    :data-layout-edit-target="editTargetKey"
    data-layout-settings-menu="BewlyComponents"
    data-layout-settings-page="topbar"
    :data-layout-settings-title-key="settingsTargetTitleKey"
  >
    <slot />
  </div>
</template>

<style scoped lang="scss">
// `display: contents` keeps the inspector target layout-neutral outside the
// editor. In edit mode the target becomes a small, visible hit area that an
// outer editor can highlight without adding another control to every item.
.top-bar-item-editor {
  display: contents;
}

.top-bar-item-editor--editing {
  display: inline-flex;
  box-sizing: border-box;
  min-width: 24px;
  min-height: var(--bew-control-height);
  align-items: center;
}

.top-bar-item-editor--editing[data-layout-edit-target="topbar-search"] {
  width: 100%;
}
</style>
