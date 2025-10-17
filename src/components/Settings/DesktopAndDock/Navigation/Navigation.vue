<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import draggable from 'vuedraggable'

import Button from '~/components/Button.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()
const mainStore = useMainStore()

const dockPositions = computed(() => {
  return [
    {
      label: t('common.position.left'),
      value: 'left',
    },
    {
      label: t('common.position.right'),
      value: 'right',
    },
    {
      label: t('common.position.bottom'),
      value: 'bottom',
    },
  ]
})

const pageOptions = computed((): { label: string, icon: string, value: string }[] => {
  return mainStore.dockItems.map((e: any) => {
    return {
      label: t(e.i18nKey),
      icon: e.icon,
      value: e.page,
    }
  })
})

const sidebarPositions = computed(() => {
  return [
    {
      label: t('common.position.left'),
      value: 'left',
    },
    {
      label: t('common.position.right'),
      value: 'right',
    },
  ]
})

watch(() => settings.value.halfHideDock, (newValue) => {
  if (newValue)
    settings.value.autoHideDock = false
})

watch(() => settings.value.autoHideDock, (newValue) => {
  if (newValue)
    settings.value.halfHideDock = false
})

function resetDockContent() {
  settings.value.dockItemsConfig = mainStore.dockItems.map((e: DockItem) => {
    return {
      page: e.page,
      visible: true,
      openInNewTab: false,
      useOriginalBiliPage: !e.hasBewlyPage,
    }
  })
}

function handleToggleDockItem(dockItem: any) {
  // Prevent disabling all dock items if there is only one
  if (settings.value.dockItemsConfig.filter(dockItem => dockItem.visible === true).length > 1)
    dockItem.visible = !dockItem.visible
  else
    dockItem.visible = true
}
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_dock')">
      <SettingsItem :title="$t('settings.always_use_dock')" :desc="$t('settings.always_use_dock_desc')">
        <Radio v-model="settings.alwaysUseDock" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.auto_hide_dock')">
        <Radio v-model="settings.autoHideDock" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.half_hide_dock')">
        <Radio v-model="settings.halfHideDock" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.dock_position')" :desc="$t('settings.dock_position_desc')">
        <Select
          v-model="settings.dockPosition"
          :options="dockPositions"
          w="full"
        />
      </SettingsItem>
      <SettingsItem :desc="$t('settings.dock_content_adjustment_desc')">
        <template #title>
          <div flex="~ gap-4 items-center">
            {{ $t('settings.dock_content_adjustment') }}
            <Button size="small" type="secondary" @click="resetDockContent">
              <template #left>
                <div i-mingcute:back-line />
              </template>
              {{ $t('common.operation.reset') }}
            </Button>
          </div>
        </template>

        <template #bottom>
          <draggable
            v-model="settings.dockItemsConfig"
            item-key="page"
            :component-data="{ style: 'display: flex; gap: 0.5rem; flex-wrap: wrap; flex-direction: column;' }"
          >
            <template #item="{ element }">
              <div
                flex="~ gap-2 justify-between items-center wrap" p="x-4 y-2" bg="$bew-fill-1" rounded="$bew-radius" cursor-all-scroll
                duration-300
                :style="{
                  background: element.visible ? 'var(--bew-theme-color-20)' : 'var(--bew-fill-1)',
                  color: element.visible ? 'var(--bew-theme-color)' : 'var(--bew-text-1)',
                }"
                @click="handleToggleDockItem(element)"
              >
                <div flex="~ gap-2 items-center">
                  <div :class="pageOptions.find((page:any) => (page.value === element.page))?.icon as string" />
                  <div w-80px text-ellipsis>
                    {{ pageOptions.find(option => option.value === element.page)?.label }}
                  </div>
                </div>
                <div flex="~ gap-4 items-center justify-between wrap">
                  <div
                    flex="~ items-center"
                  >
                    {{ $t('settings.dock_item_use_original_bili_web_page') }}
                    <Radio v-model="element.useOriginalBiliPage" />
                  </div>
                  <div flex="~ items-center">
                    {{ $t('settings.dock_item_open_in_new_tab') }}
                    <Radio v-model="element.openInNewTab" />
                  </div>
                </div>
              </div>
            </template>
          </draggable>
        </template>
      </SettingsItem>
      <SettingsItem :title="$t('settings.disable_dock_glowing_effect')">
        <Radio v-model="settings.disableDockGlowingEffect" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.disable_light_dark_mode_switcher')">
        <Radio v-model="settings.disableLightDarkModeSwitcherOnDock" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.back_to_top_and_refresh_buttons_are_separated')">
        <Radio v-model="settings.backToTopAndRefreshButtonsAreSeparated" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.enable_undo_refresh_button')" :desc="$t('settings.enable_undo_refresh_button_desc')">
        <Radio v-model="settings.enableUndoRefreshButton" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_sidebar')" :desc="$t('settings.group_sidebar_desc')">
      <SettingsItem :title="$t('settings.sidebar_position')">
        <Select v-model="settings.sidebarPosition" :options="sidebarPositions" w="full" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.auto_hide_sidebar')">
        <Radio v-model="settings.autoHideSidebar" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
