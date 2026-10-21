<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()
</script>

<template>
  <SettingsItemGroup :title="t('settings.bilibili_features.listen_video')">
    <SettingsItem
      :title="t('settings.enable_listen_video')"
      :desc="t('settings.enable_listen_video_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.enableListenVideo" />
    </SettingsItem>

    <SettingsItem
      v-if="settings.enableListenVideo"
      :title="t('settings.show_listen_video_button')"
      :desc="t('settings.show_listen_video_button_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.showListenVideoButton" />
    </SettingsItem>
  </SettingsItemGroup>
</template>
