<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import Slider from '~/components/Slider.vue'
import { originalSettings, settings } from '~/logic'
import type { AmbilightPreset } from '~/logic/storage'
import type { AmbilightDiffusionMode, AmbilightDiffusionQuality } from '~/utils/ambilight/types'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsItemSubgroup from '../../components/SettingsItemSubgroup.vue'
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

const diffusionOptions = computed<{ label: string, value: AmbilightDiffusionMode }[]>(() => [
  { label: t('settings.ambilight.diffusion_gaussian'), value: 'gaussian' },
  { label: t('settings.ambilight.diffusion_poisson'), value: 'poisson' },
])

const qualityOptions = computed<{ label: string, value: AmbilightDiffusionQuality }[]>(() => [
  { label: t('settings.ambilight.diffusion_quality_ultra_low'), value: 'ultra-low' },
  { label: t('settings.ambilight.diffusion_quality_low'), value: 'low' },
  { label: t('settings.ambilight.diffusion_quality_medium'), value: 'medium' },
  { label: t('settings.ambilight.diffusion_quality_high'), value: 'high' },
  { label: t('settings.ambilight.diffusion_quality_ultra_high'), value: 'ultra-high' },
])

const isGaussian = computed(() => settings.value.ambilightDiffusion === 'gaussian')

const PRESET_CONFIGS: Record<AmbilightPreset, {
  ambilightStrength: number
  ambilightSpread: number
  ambilightSmoothing: number
  ambilightSaturation: number
}> = {
  soft: {
    ambilightStrength: 55,
    ambilightSpread: 75,
    ambilightSmoothing: 80,
    ambilightSaturation: 110,
  },
  cinema: {
    ambilightStrength: 80,
    ambilightSpread: 100,
    ambilightSmoothing: 65,
    ambilightSaturation: 130,
  },
  vivid: {
    ambilightStrength: 100,
    ambilightSpread: 310,
    ambilightSmoothing: 45,
    ambilightSaturation: 160,
  },
}

function matchesPreset(preset: AmbilightPreset): boolean {
  const config = PRESET_CONFIGS[preset]
  return (Object.keys(config) as (keyof typeof config)[])
    .every(key => settings.value[key] === config[key])
}

// 手动调整参数后不再与任何预设一致时，不高亮预设
const currentPreset = computed<AmbilightPreset | ''>({
  get: () => matchesPreset(settings.value.ambilightPreset) ? settings.value.ambilightPreset : '',
  set: (val) => {
    if (!val)
      return
    const preset = PRESET_CONFIGS[val]

    settings.value = {
      ...settings.value,
      ambilightPreset: val,
      ...preset,
    }
  },
})

function resetAmbilightSettings() {
  settings.value = {
    ...settings.value,
    ambilightPreset: originalSettings.ambilightPreset,
    ambilightDiffusion: originalSettings.ambilightDiffusion,
    ambilightDiffusionQuality: originalSettings.ambilightDiffusionQuality,
    ambilightDiffusionScreening: originalSettings.ambilightDiffusionScreening,
    ambilightDiffusionIterations: originalSettings.ambilightDiffusionIterations,
    ambilightDiffusionFeather: originalSettings.ambilightDiffusionFeather,
    ambilightStrength: originalSettings.ambilightStrength,
    ambilightSpread: originalSettings.ambilightSpread,
    ambilightSmoothing: originalSettings.ambilightSmoothing,
    ambilightBlur: originalSettings.ambilightBlur,
    ambilightSaturation: originalSettings.ambilightSaturation,
    ambilightFps: originalSettings.ambilightFps,
  }
}
</script>

<template>
  <SettingsItemGroup :title="t('settings.ambilight.title')">
    <template #action>
      <Button
        v-if="settings.ambilightEnabled"
        size="small"
        type="secondary"
        @click="resetAmbilightSettings"
      >
        <template #left>
          <div i-mingcute:back-line />
        </template>
        {{ t('common.operation.reset') }}
      </Button>
    </template>

    <SettingsItem
      :title="t('settings.ambilight.enable')"
      :badge="t('settings.badge_performance_impact')"
      right-width="auto"
    >
      <template #desc>
        <span>{{ t('settings.ambilight.enable_desc') }}</span>
        <span block class="bew-warning-text">{{ t('common.performance_impact_warn') }}</span>
      </template>

      <Radio v-model="settings.ambilightEnabled" />
    </SettingsItem>

    <template v-if="settings.ambilightEnabled">
      <SettingsItem :title="t('settings.ambilight.preset')" right-width="auto">
        <SettingsSegmentedControl
          v-model="currentPreset"
          :label="t('settings.ambilight.preset')"
          :options="presetOptions"
        />
      </SettingsItem>

      <SettingsItem :title="t('settings.ambilight.strength')">
        <div class="slider-control">
          <Slider v-model="settings.ambilightStrength" :min="0" :max="150" :label="`${settings.ambilightStrength}%`" />
        </div>
      </SettingsItem>

      <SettingsItem :title="t('settings.ambilight.smoothing')">
        <div class="slider-control">
          <Slider v-model="settings.ambilightSmoothing" :min="0" :max="95" :label="`${settings.ambilightSmoothing}%`" />
        </div>
      </SettingsItem>

      <SettingsItem :title="t('settings.ambilight.saturation')">
        <div class="slider-control">
          <Slider v-model="settings.ambilightSaturation" :min="50" :max="200" :label="`${settings.ambilightSaturation}%`" />
        </div>
      </SettingsItem>

      <SettingsItemSubgroup :title="t('settings.ambilight.subgroup_algorithm')">
        <SettingsItem
          :title="t('settings.ambilight.diffusion')"
          right-width="auto"
        >
          <Select v-model="settings.ambilightDiffusion" :options="diffusionOptions" w="240px" />
        </SettingsItem>

        <SettingsItem v-if="isGaussian" :title="t('settings.ambilight.spread')">
          <div class="slider-control">
            <Slider
              v-model="settings.ambilightSpread"
              :min="30"
              :max="400"
              editable
              unit="%"
              :aria-label="t('settings.ambilight.spread')"
            />
          </div>
        </SettingsItem>

        <SettingsItem v-if="isGaussian" :title="t('settings.ambilight.blur')">
          <div class="slider-control">
            <Slider v-model="settings.ambilightBlur" :min="20" :max="140" :label="`${settings.ambilightBlur}px`" />
          </div>
        </SettingsItem>

        <template v-else>
          <SettingsItem
            :title="t('settings.ambilight.diffusion_screening')"
            :desc="t('settings.ambilight.diffusion_screening_desc')"
          >
            <div class="slider-control">
              <Slider
                v-model="settings.ambilightDiffusionScreening"
                :min="0"
                :max="100"
                :step="1"
                :label="`${settings.ambilightDiffusionScreening}%`"
              />
            </div>
          </SettingsItem>

          <SettingsItem
            :title="t('settings.ambilight.diffusion_quality')"
            :desc="t('settings.ambilight.diffusion_quality_desc')"
            right-width="auto"
          >
            <Select v-model="settings.ambilightDiffusionQuality" :options="qualityOptions" w="180px" />
          </SettingsItem>

          <SettingsItem
            :title="t('settings.ambilight.diffusion_iterations')"
            :desc="t('settings.ambilight.diffusion_iterations_desc')"
          >
            <div class="slider-control">
              <Slider
                v-model="settings.ambilightDiffusionIterations"
                :min="4"
                :max="32"
                :step="1"
                :label="`${settings.ambilightDiffusionIterations}`"
              />
            </div>
          </SettingsItem>

          <SettingsItem
            :title="t('settings.ambilight.diffusion_feather')"
            :desc="t('settings.ambilight.diffusion_feather_desc')"
          >
            <div class="slider-control">
              <Slider
                v-model="settings.ambilightDiffusionFeather"
                :min="0"
                :max="4"
                :step="1"
                :label="`${settings.ambilightDiffusionFeather}`"
              />
            </div>
          </SettingsItem>
        </template>
      </SettingsItemSubgroup>

      <SettingsItemSubgroup
        :title="t('settings.ambilight.subgroup_performance')"
        :desc="t('settings.ambilight.subgroup_performance_desc')"
      >
        <SettingsItem :title="t('settings.ambilight.fps')" right-width="auto">
          <Select v-model="settings.ambilightFps" :options="fpsOptions" w="180px" />
        </SettingsItem>
      </SettingsItemSubgroup>
    </template>
  </SettingsItemGroup>
</template>

<style lang="scss" scoped>
.slider-control {
  width: 260px;

  // 扩散为输入模式；其余只读数值区与输入框等宽，使同组滑块轨道两端对齐。
  :deep(.b-slider) {
    --b-slider-label-width: var(--b-slider-input-width);
  }
}
</style>
