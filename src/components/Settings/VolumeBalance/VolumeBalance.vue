<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'
import { updateNormalizationStrength, updateNormalizationVolume } from '~/utils/audioNormalization'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const { t } = useI18n()

// 当均衡强度改变时，实时更新音频处理器
function handleStrengthChange(newValue: number) {
  updateNormalizationStrength(newValue)
}

// 当目标音量改变时，实时更新音频处理器
function handleVolumeChange(newValue: number) {
  updateNormalizationVolume(newValue)
}
</script>

<template>
  <div>
    <!-- 响度均衡设置组 -->
    <SettingsItemGroup :title="t('settings.volume_normalization.title')">
      <SettingsItem
        :title="t('settings.volume_normalization.enable')"
        :desc="t('settings.volume_normalization.enable_desc')"
      >
        <Radio v-model="settings.enableVolumeNormalization" />
      </SettingsItem>

      <SettingsItem
        v-if="settings.enableVolumeNormalization"
        :title="t('settings.volume_normalization.target_volume')"
        :desc="t('settings.volume_normalization.target_volume_desc')"
      >
        <div flex="~ justify-end items-center" w-full gap-2>
          <Input
            :model-value="settings.targetVolume"
            type="number"
            :min="0"
            :max="100"
            w-20
            @update:model-value="(value) => { settings.targetVolume = Number(value); handleVolumeChange(Number(value)) }"
          />
          <span text="sm $bew-text-2">%</span>
        </div>
      </SettingsItem>

      <SettingsItem
        v-if="settings.enableVolumeNormalization"
        :title="t('settings.volume_normalization.strength')"
        :desc="t('settings.volume_normalization.strength_desc')"
      >
        <div flex="~ justify-end items-center" w-full gap-2>
          <Input
            :model-value="settings.normalizationStrength"
            type="number"
            :min="1"
            :max="20"
            w-20
            @update:model-value="(value) => { settings.normalizationStrength = Number(value); handleStrengthChange(Number(value)) }"
          />
        </div>
      </SettingsItem>

      <SettingsItem
        v-if="settings.enableVolumeNormalization"
        :title="t('settings.volume_normalization.adaptive_speed')"
        :desc="t('settings.volume_normalization.adaptive_speed_desc')"
      >
        <div flex="~ justify-end items-center" w-full gap-2>
          <Input
            v-model="settings.adaptiveGainSpeed"
            type="number"
            :min="1"
            :max="10"
            w-20
          />
        </div>
      </SettingsItem>

      <SettingsItem
        v-if="settings.enableVolumeNormalization"
        :title="t('settings.volume_normalization.voice_gate')"
        :desc="t('settings.volume_normalization.voice_gate_desc')"
      >
        <div flex="~ justify-end items-center" w-full gap-2>
          <Input
            v-model="settings.voiceGateDb"
            type="number"
            :min="-60"
            :max="-10"
            w-20
          />
          <span text="sm $bew-text-2">dB</span>
        </div>
      </SettingsItem>

      <SettingsItem
        v-if="settings.enableVolumeNormalization"
        :title="t('settings.volume_normalization.debug')"
        :desc="t('settings.volume_normalization.debug_desc')"
      >
        <Radio v-model="settings.volumeNormalizationDebug" />
      </SettingsItem>
    </SettingsItemGroup>

    <!-- 使用说明 -->
    <SettingsItemGroup :title="t('settings.volume_normalization.usage_guide.title')">
      <SettingsItem :title="t('settings.volume_normalization.usage_guide.title')">
        <template #desc>
          <div text="sm $bew-text-2" space-y-2 p-4>
            <pre whitespace-pre-wrap break-words>{{ t('settings.volume_normalization.usage_guide.desc') }}</pre>
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>
