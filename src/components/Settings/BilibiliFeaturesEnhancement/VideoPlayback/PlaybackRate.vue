<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Button from '~/components/Button.vue'
import Input from '~/components/Input.vue'
import { settings } from '~/logic'
import { normalizePlaybackRate, normalizePlaybackRateStep } from '~/utils/playbackRate'
import { getVideoElement, setPlaybackRate } from '~/utils/player'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemSubgroup from '../../components/SettingsItemSubgroup.vue'

const { t } = useI18n()
const toast = useToast()
const rate = ref<string | number>(1)
const step = ref<string | number>(settings.value.playbackRateStep)

function findCurrentVideo() {
  // 设置可从视频页、首页抽屉或动态视频弹窗打开；只查找当前页面持有的播放器。
  const frames = document.getElementById('bewly')?.shadowRoot?.querySelectorAll<HTMLIFrameElement>('iframe')
  for (const frame of Array.from(frames ?? []).reverse()) {
    if (!frame.getClientRects().length)
      continue
    try {
      const video = frame.contentDocument && getVideoElement(frame.contentDocument)
      if (video)
        return video
    }
    catch {
      // 跨域页面不能由当前设置窗口控制。
    }
  }
  return getVideoElement()
}

onMounted(() => {
  rate.value = findCurrentVideo()?.playbackRate ?? 1
})
watch(() => settings.value.playbackRateStep, value => step.value = value)

function saveStep() {
  const value = step.value === '' ? Number.NaN : Number(step.value)
  settings.value.playbackRateStep = normalizePlaybackRateStep(value)
  step.value = settings.value.playbackRateStep
}

function applyRate() {
  const value = rate.value === '' ? Number.NaN : Number(rate.value)
  if (!Number.isFinite(value))
    return
  rate.value = normalizePlaybackRate(value)
  if (setPlaybackRate(rate.value, findCurrentVideo()))
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
