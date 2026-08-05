<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../../components/SettingsSegmentedControl.vue'
import SettingsToggleTag from '../../components/SettingsToggleTag.vue'
import WantedUsersManager from './WantedUsersManager.vue'

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
    | 'momentsShowUpList'
    | 'momentsFilterUpRecommendation'
    | 'momentsHideChargeExclusive'
    | 'momentsHideVideoReservation'
    | 'momentsHideLiveReservation'
    | 'momentsHideLiveDynamics'
    | 'momentsHideVideoDynamics'
    | 'momentsHideDrawDynamics'
    | 'momentsHideUgcSeasonDynamics'
    | 'momentsHideForwardDynamics'
    | 'momentsHidePgcDynamics'
    | 'momentsHideArticleDynamics'

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
  { setting: 'momentsShowUpList', label: t('settings.moments_show_up_list'), icon: 'i-tabler-users' },
])

const pluginFilterOptions = computed<MomentTagOption[]>(() => [
  { setting: 'momentsHideVideoDynamics', label: t('settings.moments_filter_video_dynamic'), icon: 'i-tabler-player-play' },
  { setting: 'momentsHideDrawDynamics', label: t('settings.moments_filter_draw_dynamic'), icon: 'i-tabler-photo' },
  { setting: 'momentsHideUgcSeasonDynamics', label: t('settings.moments_filter_ugc_season_dynamic'), icon: 'i-tabler-stack' },
  { setting: 'momentsHideForwardDynamics', label: t('settings.moments_filter_forward_dynamic'), icon: 'i-tabler-repeat' },
  { setting: 'momentsHidePgcDynamics', label: t('settings.moments_filter_pgc_dynamic'), icon: 'i-tabler-device-tv' },
  { setting: 'momentsHideArticleDynamics', label: t('settings.moments_filter_article_dynamic'), icon: 'i-tabler-news' },
  { setting: 'momentsFilterUpRecommendation', label: t('settings.moments_filter_up_recommendation_short'), icon: 'i-tabler-sparkles' },
  { setting: 'momentsHideChargeExclusive', label: t('settings.moments_filter_charge_dynamic'), icon: 'i-tabler-battery-charging' },
  { setting: 'momentsHideVideoReservation', label: t('settings.moments_filter_video_reservation'), icon: 'i-tabler-calendar-time' },
  { setting: 'momentsHideLiveReservation', label: t('settings.moments_filter_live_reservation'), icon: 'i-tabler-calendar-event' },
  { setting: 'momentsHideLiveDynamics', label: t('settings.moments_filter_live_dynamic'), icon: 'i-tabler-broadcast' },
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

const gridColumnOptions = computed(() => [
  { label: t('settings.moments_grid_columns_option', { count: 3 }), value: '3' as const },
  { label: t('settings.moments_grid_columns_option', { count: 2 }), value: '2' as const },
  { label: t('settings.moments_grid_columns_option', { count: 1 }), value: '1' as const },
])
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_original_moments_page')">
      <SettingsItem
        :title="$t('settings.moments_visible_components')"
        :desc="$t('settings.moments_visible_components_original_desc')"
      >
        <template #bottom>
          <div class="moment-setting-tags" role="group" :aria-label="$t('settings.moments_visible_components')">
            <SettingsToggleTag
              v-for="option in originalComponentOptions"
              :key="option.setting"
              v-model="settings[option.setting]"
              :label="option.label"
              :icon="option.icon"
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
          v-model="settings.momentsGridColumns"
          :label="$t('settings.moments_grid_columns')"
          :options="gridColumnOptions"
        />
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
            <SettingsToggleTag
              v-for="option in pluginFilterOptions"
              :key="option.setting"
              v-model="settings[option.setting]"
              :label="option.label"
              :icon="option.icon"
              inverted
              :show-state-icon="false"
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
          w="180px"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.group_moments_wanted_users')"
      :desc="$t('settings.group_moments_wanted_users_desc')"
      icon="i-tabler-star-filled"
      collapsible
      default-collapsed
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
      collapsible
      default-collapsed
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
