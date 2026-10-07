<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import Slider from '~/components/Slider.vue'
import { settings } from '~/logic'
import type { AmbilightPreset } from '~/logic/storage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../../components/SettingsSegmentedControl.vue'

const { t } = useI18n()

const presetOptions = computed(() => [
  { label: t('settings.ambilight.preset_soft'), value: 'soft' },
  { label: t('settings.ambilight.preset_cinema'), value: 'cinema' },
  { label: t('settings.ambilight.preset_vivid'), value: 'vivid' },
])

const fpsOptions = computed(() => [
  { label: t('settings.ambilight.fps_15'), value: 15 },
  { label: t('settings.ambilight.fps_24'), value: 24 },
  { label: t('settings.ambilight.fps_30'), value: 30 },
])

const currentPreset = computed({
  get: () => settings.value.ambilightPreset,
  set: (val: AmbilightPreset) => {
    settings.value.ambilightPreset = val
    if (val === 'soft') {
      settings.value.ambilightStrength = 55
      settings.value.ambilightSpread = 75
      settings.value.ambilightSmoothing = 80
      settings.value.ambilightBlur = 85
      settings.value.ambilightSaturation = 110
      settings.value.ambilightFps = 15
    }
    else if (val === 'cinema') {
      settings.value.ambilightStrength = 80
      settings.value.ambilightSpread = 100
      settings.value.ambilightSmoothing = 65
      settings.value.ambilightBlur = 72
      settings.value.ambilightSaturation = 130
      settings.value.ambilightFps = 24
    }
    else if (val === 'vivid') {
      settings.value.ambilightStrength = 100
      settings.value.ambilightSpread = 310
      settings.value.ambilightSmoothing = 45
      settings.value.ambilightBlur = 60
      settings.value.ambilightSaturation = 160
      settings.value.ambilightFps = 30
    }
  },
})
</script>

<template>
  <SettingsItemGroup :title="t('settings.ambilight.title')">
    <SettingsItem :title="t('settings.ambilight.enable')" :desc="t('settings.ambilight.enable_desc')" right-width="auto">
      <Radio v-model="settings.ambilightEnabled" />
    </SettingsItem>

    <template v-if="settings.ambilightEnabled">
      <SettingsItem :title="t('settings.ambilight.enable_in_live')" :desc="t('settings.ambilight.enable_in_live_desc')" right-width="auto">
        <Radio v-model="settings.ambilightEnableInLive" />
      </SettingsItem>

      <SettingsItem :title="t('settings.ambilight.enable_fullscreen')" :desc="t('settings.ambilight.enable_fullscreen_desc')" right-width="auto">
        <Radio v-model="settings.ambilightEnableFullscreen" />
      </SettingsItem>

      <SettingsItem :title="t('settings.ambilight.preset')" right-width="auto">
        <SettingsSegmentedControl
          v-model="currentPreset"
          :label="t('settings.ambilight.preset')"
          :options="presetOptions"
        />
      </SettingsItem>

      <SettingsItem :title="t('settings.ambilight.strength')">
        <Slider v-model="settings.ambilightStrength" :min="0" :max="150" :label="`${settings.ambilightStrength}%`" />
      </SettingsItem>

      <SettingsItem :title="t('settings.ambilight.spread')">
        <Slider v-model="settings.ambilightSpread" :min="30" :max="400" :label="`${settings.ambilightSpread}%`" />
      </SettingsItem>

      <SettingsItem :title="t('settings.ambilight.smoothing')">
        <Slider v-model="settings.ambilightSmoothing" :min="0" :max="95" :label="`${settings.ambilightSmoothing}%`" />
      </SettingsItem>

      <SettingsItem :title="t('settings.ambilight.blur')">
        <Slider v-model="settings.ambilightBlur" :min="20" :max="140" :label="`${settings.ambilightBlur}px`" />
      </SettingsItem>

      <SettingsItem :title="t('settings.ambilight.saturation')">
        <Slider v-model="settings.ambilightSaturation" :min="50" :max="200" :label="`${settings.ambilightSaturation}%`" />
      </SettingsItem>

      <SettingsItem :title="t('settings.ambilight.fps')" right-width="auto">
        <Select v-model="settings.ambilightFps" :options="fpsOptions" w="180px" />
      </SettingsItem>
    </template>
  </SettingsItemGroup>
</template>
