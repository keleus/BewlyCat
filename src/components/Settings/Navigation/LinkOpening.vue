<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const props = defineProps<{
  scope: 'topBar' | 'videoCard'
}>()

const { t } = useI18n()

const openModeOptions = computed(() => {
  return [
    {
      label: t('settings.link_opening_behavior_opt.current_tab'),
      value: 'currentTab',
    },
    {
      label: t('settings.link_opening_behavior_opt.current_tab_if_not_homepage'),
      value: 'currentTabIfNotHomepage',
    },
    {
      label: t('settings.link_opening_behavior_opt.background'),
      value: 'background',
    },
    {
      label: t('settings.link_opening_behavior_opt.new_tab'),
      value: 'newTab',
    },
  ]
})

const videoCardOpenModeOptions = computed(() => {
  return [
    {
      label: t('settings.link_opening_behavior_opt.current_tab'),
      value: 'currentTab',
    },
    {
      label: t('settings.link_opening_behavior_opt.drawer'),
      value: 'drawer',
    },
    {
      label: t('settings.link_opening_behavior_opt.background'),
      value: 'background',
    },
    {
      label: t('settings.link_opening_behavior_opt.new_tab'),
      value: 'newTab',
    },
  ]
})
</script>

<template>
  <SettingsItemGroup :title="$t('settings.group_link_opening_behavior')">
    <SettingsItem
      v-if="props.scope === 'topBar'"
      :title="$t('settings.top_bar_link_opening_behavior')"
      :desc="$t('settings.link_opening_behavior_desc')"
      right-width="auto"
    >
      <Select v-model="settings.topBarLinkOpenMode" :options="openModeOptions" w="160px" />
    </SettingsItem>
    <SettingsItem
      v-if="props.scope === 'videoCard'"
      :title="$t('settings.video_card_link_opening_behavior')"
      :desc="$t('settings.video_card_link_opening_behavior_desc')"
      right-width="auto"
    >
      <Select
        v-model="settings.videoCardLinkOpenMode"
        :options="videoCardOpenModeOptions"
        w="160px"
      />
    </SettingsItem>
    <SettingsItem
      v-if="props.scope === 'topBar'"
      :title="$t('settings.search_bar_link_opening_behavior')"
      :desc="$t('settings.link_opening_behavior_desc')"
      right-width="auto"
    >
      <Select
        v-model="settings.searchBarLinkOpenMode"
        :options="openModeOptions"
        w="160px"
      />
    </SettingsItem>
  </SettingsItemGroup>
</template>
