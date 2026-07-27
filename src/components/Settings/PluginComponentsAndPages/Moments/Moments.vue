<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsVisibilityTag from '../../components/SettingsVisibilityTag.vue'

const { t } = useI18n()

type MomentToggleSetting
  = | 'originalMomentsShowUserCard'
    | 'originalMomentsShowLiveList'
    | 'originalMomentsShowCommunityCenter'
    | 'originalMomentsShowHotSearch'
    | 'originalMomentsShowUpList'
    | 'momentsSidebarShowUserCard'
    | 'momentsSidebarShowPublish'
    | 'momentsSidebarShowLive'
    | 'momentsFilterUpRecommendation'
    | 'momentsHideChargeExclusive'
    | 'momentsHideVideoReservation'
    | 'momentsHideLiveReservation'
    | 'momentsHideLiveDynamics'

interface MomentTagOption {
  setting: MomentToggleSetting
  label: string
  icon: string
}

const originalComponentOptions = computed<MomentTagOption[]>(() => [
  { setting: 'originalMomentsShowUserCard', label: t('settings.original_moments_show_user_card'), icon: 'i-tabler-user-square-rounded' },
  { setting: 'originalMomentsShowLiveList', label: t('settings.original_moments_show_live_list'), icon: 'i-tabler-live-photo' },
  { setting: 'originalMomentsShowCommunityCenter', label: t('settings.original_moments_show_community_center'), icon: 'i-tabler-layout-dashboard' },
  { setting: 'originalMomentsShowHotSearch', label: t('settings.original_moments_show_hot_search'), icon: 'i-tabler-flame' },
  { setting: 'originalMomentsShowUpList', label: t('settings.original_moments_show_up_list'), icon: 'i-tabler-users' },
])

const pluginComponentOptions = computed<MomentTagOption[]>(() => [
  { setting: 'momentsSidebarShowUserCard', label: t('settings.moments_show_user_card'), icon: 'i-tabler-user-square-rounded' },
  { setting: 'momentsSidebarShowPublish', label: t('settings.moments_show_publish'), icon: 'i-tabler-edit' },
  { setting: 'momentsSidebarShowLive', label: t('settings.moments_show_live'), icon: 'i-tabler-live-photo' },
])

const pluginFilterOptions = computed<MomentTagOption[]>(() => [
  { setting: 'momentsFilterUpRecommendation', label: t('settings.moments_filter_up_recommendation_short'), icon: 'i-tabler-sparkles' },
  { setting: 'momentsHideChargeExclusive', label: t('settings.moments_filter_charge_dynamic'), icon: 'i-tabler-battery-charging' },
  { setting: 'momentsHideVideoReservation', label: t('settings.moments_filter_video_reservation'), icon: 'i-tabler-calendar-time' },
  { setting: 'momentsHideLiveReservation', label: t('settings.moments_filter_live_reservation'), icon: 'i-tabler-calendar-event' },
  { setting: 'momentsHideLiveDynamics', label: t('settings.moments_filter_live_dynamic'), icon: 'i-tabler-broadcast' },
])

function toggleMomentSetting(setting: MomentToggleSetting) {
  settings.value[setting] = !settings.value[setting]
}

const openModeOptions = computed(() => [
  {
    label: t('settings.moments_card_open_mode_opt.dialog'),
    value: 'dialog',
  },
  {
    label: t('settings.moments_card_open_mode_opt.new_tab'),
    value: 'newTab',
  },
])
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_original_moments_page')">
      <SettingsItem
        :title="$t('settings.moments_visible_components')"
        :desc="$t('settings.moments_visible_components_desc')"
      >
        <template #bottom>
          <div class="moment-setting-tags" role="group" :aria-label="$t('settings.moments_visible_components')">
            <SettingsVisibilityTag
              v-for="option in originalComponentOptions"
              :key="option.setting"
              :visible="settings[option.setting]"
              :label="option.label"
              :icon="option.icon"
              @toggle="toggleMomentSetting(option.setting)"
            />
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.group_new_moments_page')"
      :desc="$t('settings.group_new_moments_page_desc')"
      warning-desc
    >
      <SettingsItem
        :title="$t('settings.moments_visible_components')"
        :desc="$t('settings.moments_visible_components_desc')"
      >
        <template #bottom>
          <div class="moment-setting-tags" role="group" :aria-label="$t('settings.moments_visible_components')">
            <SettingsVisibilityTag
              v-for="option in pluginComponentOptions"
              :key="option.setting"
              :visible="settings[option.setting]"
              :label="option.label"
              :icon="option.icon"
              @toggle="toggleMomentSetting(option.setting)"
            />
          </div>
        </template>
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
      <SettingsItem
        :title="$t('settings.moments_filtered_types')"
        :desc="$t('settings.moments_filtered_types_desc')"
      >
        <template #bottom>
          <div class="moment-setting-tags moment-setting-tags--filters" role="group" :aria-label="$t('settings.moments_filtered_types')">
            <SettingsVisibilityTag
              v-for="option in pluginFilterOptions"
              :key="option.setting"
              :visible="!settings[option.setting]"
              :label="option.label"
              :icon="option.icon"
              @toggle="toggleMomentSetting(option.setting)"
            />
          </div>
        </template>
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.moments_card_open_mode')"
        :desc="$t('settings.moments_card_open_mode_desc')"
        right-width="auto"
      >
        <Select
          v-model="settings.momentsCardOpenMode"
          :options="openModeOptions"
          w="160px"
        />
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
