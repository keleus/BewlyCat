<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { settings } from '~/logic'
import type { MomentsGridColumns, TabsPosition } from '~/logic/storage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../../components/SettingsSegmentedControl.vue'
import SettingsToggleTag from '../../components/SettingsToggleTag.vue'
import MomentFilterSettings from './MomentFilterSettings.vue'
import WantedUsersManager from './WantedUsersManager.vue'

const { t } = useI18n()
const { confirm: showConfirmDialog } = useConfirmDialog()

const pluginComponentOptions = computed(() => [
  { setting: 'momentsSidebarShowUserCard' as const, label: t('settings.moments_show_user_card'), labelKey: 'settings.moments_show_user_card', icon: 'i-tabler-user-square-rounded' },
  { setting: 'momentsSidebarShowPublish' as const, label: t('settings.moments_show_publish'), labelKey: undefined, icon: 'i-tabler-edit' },
  { setting: 'momentsSidebarShowLive' as const, label: t('settings.moments_show_live'), labelKey: undefined, icon: 'i-tabler-live-photo' },
  { setting: 'momentsSidebarShowHotSearch' as const, label: t('settings.moments_show_hot_search'), labelKey: 'settings.moments_show_hot_search', icon: 'i-tabler-flame' },
  { setting: 'momentsShowUpList' as const, label: t('settings.moments_show_up_list'), labelKey: undefined, icon: 'i-tabler-users' },
])

const openModeOptions = computed(() => [
  {
    label: t('settings.moments_card_open_mode_opt.dialog'),
    value: 'dialog',
  },
  {
    label: t('settings.moments_card_open_mode_opt.new_tab'),
    value: 'newTab',
  },
  {
    label: t('settings.moments_card_open_mode_opt.background'),
    value: 'background',
  },
])

const videoCardOpenModeOptions = computed(() => [
  {
    label: t('settings.moments_video_card_open_mode_opt.inherit'),
    value: 'inherit',
  },
  {
    label: t('settings.link_opening_behavior_opt.current_tab'),
    value: 'currentTab',
  },
  {
    label: t('settings.moments_card_open_mode_opt.dialog'),
    value: 'dialog',
  },
  {
    label: t('settings.link_opening_behavior_opt.background'),
    value: 'background',
  },
  {
    label: t('settings.link_opening_behavior_opt.new_tab'),
    value: 'newTab',
  },
])

// 3、4 列未做适配，需确认后才展开
const moreGridColumnsUnlocked = ref(settings.value.momentsGridColumns === '3' || settings.value.momentsGridColumns === '4')

const gridColumnOptions = computed<{ label: string, value: MomentsGridColumns | 'more' }[]>(() => [
  { label: t('settings.moments_grid_columns_option', { count: 2 }), value: '2' },
  { label: t('settings.moments_grid_columns_option', { count: 1 }), value: '1' },
  ...moreGridColumnsUnlocked.value
    ? [
        { label: t('settings.moments_grid_columns_option', { count: 3 }), value: '3' as const },
        { label: t('settings.moments_grid_columns_option', { count: 4 }), value: '4' as const },
      ]
    : [{ label: t('settings.moments_grid_columns_more'), value: 'more' as const }],
])

async function selectGridColumns(value: MomentsGridColumns | 'more') {
  if (value !== 'more') {
    settings.value.momentsGridColumns = value
    return
  }
  if (await showConfirmDialog(t('settings.moments_grid_columns_more_confirm'), { title: t('settings.moments_grid_columns') }))
    moreGridColumnsUnlocked.value = true
}

const momentsTabsPositionOptions = computed<{ label: string, value: TabsPosition }[]>(() => [
  { label: t('common.position.left'), value: 'left' },
  { label: t('common.position.center'), value: 'center' },
])
</script>

<template>
  <div>
    <SettingsItemGroup
      :title="$t('settings.group_new_moments_page')"
      :desc="$t('settings.group_new_moments_page_desc')"
      warning-desc
    >
      <SettingsItem
        :title="$t('settings.moments_visible_components')"
        :desc="$t('settings.moments_visible_components_plugin_desc')"
      >
        <template #bottom>
          <div class="moment-setting-tags" role="group" :aria-label="$t('settings.moments_visible_components')">
            <SettingsToggleTag
              v-for="option in pluginComponentOptions"
              :key="option.setting"
              v-model="settings[option.setting]"
              :label="option.label"
              :icon="option.icon"
              :data-settings-key="option.labelKey"
            />
          </div>
        </template>
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.moments_grid_columns')"
        :desc="$t('settings.moments_grid_columns_desc')"
        right-width="auto"
      >
        <SettingsSegmentedControl
          :model-value="settings.momentsGridColumns"
          :label="$t('settings.moments_grid_columns')"
          :options="gridColumnOptions"
          @update:model-value="selectGridColumns"
        />
      </SettingsItem>
      <SettingsItem :title="$t('settings.moments_tabs_position')" right-width="auto">
        <SettingsSegmentedControl
          v-model="settings.momentsTabsPosition"
          :label="$t('settings.moments_tabs_position')"
          :options="momentsTabsPositionOptions"
        />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.moments_start_from_last_seen')"
        :desc="$t('settings.moments_start_from_last_seen_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.momentsStartFromLastSeen" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.moments_enable_live_preview')"
        :desc="$t('settings.moments_enable_live_preview_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.momentsEnableLivePreview" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.moments_enable_video_preview')"
        :desc="$t('settings.moments_enable_video_preview_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.momentsEnableVideoPreview" />
      </SettingsItem>
      <template v-if="settings.momentsEnableVideoPreview">
        <SettingsItem :title="$t('settings.enable_video_ctrl_bar_on_video_card')" right-width="auto">
          <Radio v-model="settings.momentsEnableVideoControls" />
        </SettingsItem>
        <SettingsItem
          :title="$t('settings.video_preview_swipe_seek')"
          :desc="$t('settings.video_preview_swipe_seek_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.momentsEnableVideoPreviewSwipeSeek" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.hover_video_card_delayed')" right-width="auto">
          <Radio v-model="settings.momentsVideoPreviewDelayed" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.only_cover_video_preview')" right-width="auto">
          <Radio v-model="settings.momentsOnlyCoverVideoPreview" />
        </SettingsItem>
      </template>
      <SettingsItem
        :title="$t('settings.moments_card_open_mode')"
        :desc="$t('settings.moments_card_open_mode_desc')"
        right-width="auto"
      >
        <Select
          v-model="settings.momentsCardOpenMode"
          :options="openModeOptions"
          w="180px"
        />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.moments_video_card_open_mode')"
        :desc="$t('settings.moments_video_card_open_mode_desc')"
        right-width="auto"
      >
        <Select
          v-model="settings.momentsVideoCardOpenMode"
          :options="videoCardOpenModeOptions"
          w="180px"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <MomentFilterSettings>
      <SettingsItem
        :title="$t('settings.moments_show_filter_entry')"
        :desc="$t('settings.moments_show_filter_entry_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.momentsShowFilterEntry" />
      </SettingsItem>
    </MomentFilterSettings>

    <SettingsItemGroup
      :title="$t('settings.group_moments_wanted_users')"
      :desc="$t('settings.group_moments_wanted_users_desc')"
      icon="i-tabler-star-filled"
    >
      <SettingsItem
        :title="$t('settings.moments_enable_wanted_filter')"
        :desc="$t('settings.moments_enable_wanted_filter_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.momentsEnableWantedFilter" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.moments_wanted_users')">
        <template #bottom>
          <WantedUsersManager mode="wanted" />
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.group_moments_pinned_users')"
      :desc="$t('settings.group_moments_pinned_users_desc')"
      icon="i-tabler-pin-filled"
    >
      <SettingsItem :title="$t('settings.moments_pinned_users')">
        <template #bottom>
          <WantedUsersManager mode="pinned" />
        </template>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style scoped lang="scss">
.moment-setting-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
