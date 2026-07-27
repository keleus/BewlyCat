<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()

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
      <SettingsItem :title="$t('settings.original_moments_show_user_card')" right-width="auto">
        <Radio v-model="settings.originalMomentsShowUserCard" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.original_moments_show_live_list')" right-width="auto">
        <Radio v-model="settings.originalMomentsShowLiveList" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.original_moments_show_community_center')" right-width="auto">
        <Radio v-model="settings.originalMomentsShowCommunityCenter" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.original_moments_show_hot_search')" right-width="auto">
        <Radio v-model="settings.originalMomentsShowHotSearch" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.original_moments_show_up_list')" right-width="auto">
        <Radio v-model="settings.originalMomentsShowUpList" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.group_new_moments_page')"
      :desc="$t('settings.group_new_moments_page_desc')"
      collapsible
      default-collapsed
      warning-desc
    >
      <SettingsItem :title="$t('settings.moments_show_user_card')" right-width="auto">
        <Radio v-model="settings.momentsSidebarShowUserCard" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.moments_show_publish')" right-width="auto">
        <Radio v-model="settings.momentsSidebarShowPublish" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.moments_show_live')" right-width="auto">
        <Radio v-model="settings.momentsSidebarShowLive" />
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
