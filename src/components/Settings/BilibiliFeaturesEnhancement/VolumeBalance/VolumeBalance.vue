<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Slider from '~/components/Slider.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()
</script>

<template>
  <SettingsItemGroup :title="t('settings.local_loudness.title')">
    <SettingsItem :title="t('settings.local_loudness.enable')" :desc="t('settings.local_loudness.description')" right-width="auto">
      <Radio v-model="settings.localLoudnessEnabled" />
    </SettingsItem>
    <template v-if="settings.localLoudnessEnabled">
      <SettingsItem :title="t('settings.local_loudness.target')" :desc="t('settings.local_loudness.target_desc')">
        <Slider v-model="settings.localLoudnessTarget" :min="-24" :max="-14" :label="`${settings.localLoudnessTarget} LUFS`" />
      </SettingsItem>
      <SettingsItem :title="t('settings.local_loudness.strength')" :desc="t('settings.local_loudness.strength_desc')">
        <Slider v-model="settings.localLoudnessStrength" :min="40" :max="100" :label="`${settings.localLoudnessStrength}%`" />
      </SettingsItem>
    </template>
    <SettingsItem :title="t('settings.local_loudness.show_button')" :desc="t('settings.local_loudness.show_button_desc')" right-width="auto">
      <Radio v-model="settings.showLocalLoudnessButton" />
    </SettingsItem>
  </SettingsItemGroup>
</template>
