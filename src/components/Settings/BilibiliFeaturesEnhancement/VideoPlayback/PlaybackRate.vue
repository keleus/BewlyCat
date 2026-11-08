<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Button from '~/components/Button.vue'
import Input from '~/components/Input.vue'
import { settings } from '~/logic'
import { normalizePlaybackRate, normalizePlaybackRateStep } from '~/utils/playbackRate'
import { requestBilibiliTab } from '~/utils/settingsPage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemSubgroup from '../../components/SettingsItemSubgroup.vue'

const { t } = useI18n()
const toast = useToast()
const rate = ref<string | number>(settings.value.savedPlaybackRate)
const step = ref<string | number>(settings.value.playbackRateStep)

watch(() => settings.value.playbackRateStep, value => step.value = value)

function saveStep() {
  const value = step.value === '' ? Number.NaN : Number(step.value)
  settings.value.playbackRateStep = normalizePlaybackRateStep(value)
  step.value = settings.value.playbackRateStep
}

async function applyRate() {
  const value = rate.value === '' ? Number.NaN : Number(rate.value)
  if (!Number.isFinite(value))
    return
  rate.value = normalizePlaybackRate(value)
  if (await requestBilibiliTab<boolean>({ action: 'applyPlaybackRate', rate: rate.value }))
    toast.success(t('player_state.speed', { rate: rate.value }))
  else
    toast.info(t('settings.custom_playback_rate_no_video'))
}
</script>

<template>
  <SettingsItemSubgroup :title="t('settings.custom_playback_rate')">
    <SettingsItem
      :title="t('settings.custom_playback_rate')"
      :desc="t('settings.custom_playback_rate_desc')"
      right-width="auto"
    >
      <div flex="~ wrap items-center gap-2">
        <Input
          v-model="rate" type="number" :min="0.25" :max="5" :step="0.01"
          w="100px"
          :aria-label="t('settings.custom_playback_rate')" @enter="applyRate"
        />
        <Button @click="applyRate">
          {{ t('settings.custom_playback_rate_apply') }}
        </Button>
      </div>
    </SettingsItem>
    <SettingsItem :title="t('settings.playback_rate_step')" :desc="t('settings.playback_rate_step_desc')" right-width="auto">
      <Input
        v-model="step" type="number" :min="0.01" :max="1" :step="0.01"
        w="100px"
        :aria-label="t('settings.playback_rate_step')" @blur="saveStep" @enter="saveStep"
      />
    </SettingsItem>
  </SettingsItemSubgroup>
</template>
