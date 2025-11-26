<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import TopBarVisualConfig from './TopBarVisualConfig.vue'

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
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_link_opening_behavior')">
      <SettingsItem :title="$t('settings.top_bar_link_opening_behavior')">
        <Select v-model="settings.topBarLinkOpenMode" :options="openModeOptions" w="full" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.search_bar_link_opening_behavior')">
        <Select
          v-model="settings.searchBarLinkOpenMode"
          :options="openModeOptions"
          w="full"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <TopBarVisualConfig />
  </div>
</template>

<style lang="scss" scoped>
</style>
