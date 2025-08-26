<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { VideoPageTopBarConfig } from '~/enums/appEnums'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import TopBarComponents from './TopBarComponents.vue'

const { t } = useI18n()

const videoPageTopBarConfigOptions = computed(() => {
  return [
    {
      label: t('settings.video_page_top_bar_config_opt.alwaysShow'),
      value: VideoPageTopBarConfig.AlwaysShow,
    },
    {
      label: t('settings.video_page_top_bar_config_opt.alwaysHide'),
      value: VideoPageTopBarConfig.AlwaysHide,
    },
    {
      label: t('settings.video_page_top_bar_config_opt.showOnMouse'),
      value: VideoPageTopBarConfig.ShowOnMouse,
    },
    {
      label: t('settings.video_page_top_bar_config_opt.showOnScroll'),
      value: VideoPageTopBarConfig.ShowOnScroll,
    },
  ]
})
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_topbar')">
      <SettingsItem :title="$t('settings.auto_hide_top_bar')">
        <Radio v-model="settings.autoHideTopBar" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.video_page_top_bar_config')" :desc="$t('settings.video_page_top_bar_config_desc')">
        <Select v-model="settings.videoPageTopBarConfig" :options="videoPageTopBarConfigOptions" w="full" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.show_top_bar_theme_color_gradient')">
        <Radio v-model="settings.showTopBarThemeColorGradient" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.show_bewly_or_bili_top_bar_switcher')">
        <Radio v-model="settings.showBewlyOrBiliTopBarSwitcher" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.show_bewly_or_bili_page_switcher')">
        <Radio v-model="settings.showBewlyOrBiliPageSwitcher" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.show_bcoin_receive_reminder')">
        <Radio v-model="settings.showBCoinReceiveReminder" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.open_notifications_page_as_drawer')">
        <Radio v-model="settings.openNotificationsPageAsDrawer" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.show_hot_search_in_top_bar')">
        <template #desc>
          <span>{{ $t('settings.show_hot_search_in_top_bar_desc') }}</span>
        </template>
        <Radio v-model="settings.showHotSearchInTopBar" />
      </SettingsItem>
    </SettingsItemGroup>

    <TopBarComponents />
  </div>
</template>

<style lang="scss" scoped>
</style>
