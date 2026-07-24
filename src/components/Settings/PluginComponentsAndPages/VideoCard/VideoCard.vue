<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { originalSettings, settings } from '~/logic'
import type { GridColumnsConfig, VideoCardFontSizeSetting, VideoCardLayoutSetting } from '~/logic/storage'
import { defaultGridColumns, GRID_BREAKPOINTS } from '~/logic/storage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import ShadowCurveEditor from '../../components/ShadowCurveEditor.vue'

const { t } = useI18n()

const fontSizeOptionValues: VideoCardFontSizeSetting[] = ['xs', 'sm', 'base', 'lg']
const videoCardLayoutOptionValues: VideoCardLayoutSetting[] = ['modern', 'compact', 'old']

const videoCardFontSizeOptions = computed(() => fontSizeOptionValues.map(value => ({
  label: t(`settings.font_size_option.${value}`),
  value,
})))

const videoCardLayoutOptions = computed(() => videoCardLayoutOptionValues.map(value => ({
  label: t(`settings.video_card_layout_option.${value}`),
  value,
})))

const isModernLayout = computed(() => settings.value.videoCardLayout === 'modern' || settings.value.videoCardLayout === 'compact')

function resetShadowSettings() {
  settings.value.videoCardShadowCurve = [...originalSettings.videoCardShadowCurve]
  settings.value.videoCardShadowHeight = originalSettings.videoCardShadowHeight
}

// Grid columns management - 固定断点，只修改列数
const breakpointLabels: { key: keyof GridColumnsConfig, label: string }[] = [
  { key: 'base', label: '< 640px' },
  { key: 'sm', label: `≥ ${GRID_BREAKPOINTS.sm}px` },
  { key: 'md', label: `≥ ${GRID_BREAKPOINTS.md}px` },
  { key: 'lg', label: `≥ ${GRID_BREAKPOINTS.lg}px` },
  { key: 'xl', label: `≥ ${GRID_BREAKPOINTS.xl}px` },
  { key: 'xxl', label: `≥ ${GRID_BREAKPOINTS.xxl}px` },
]

function updateColumns(key: keyof GridColumnsConfig, value: number) {
  settings.value.gridColumns = { ...settings.value.gridColumns, [key]: value }
}

function resetColumns() {
  settings.value.gridColumns = { ...defaultGridColumns }
}
</script>

<template>
  <div>
    <!-- 视频卡片网格详细设置默认折叠 -->
    <SettingsItemGroup
      :title="$t('settings.group_video_card_grid')"
      :desc="$t('settings.grid_breakpoints_desc')"
      collapsible
      default-collapsed
    >
      <SettingsItem
        :title="$t('settings.auto_switch_list_layout')"
        :desc="$t('settings.auto_switch_list_layout_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.autoSwitchListLayout" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.grid_breakpoints')" :desc="$t('settings.grid_breakpoints_desc')" right-width="auto">
        <template #bottom>
          <div flex="~ col gap-3" w-full>
            <div
              v-for="bp in breakpointLabels"
              :key="bp.key"
              flex="~ items-center gap-3"
            >
              <span text-sm shrink-0 min-w-24>{{ bp.label }}</span>
              <Input
                :model-value="settings.gridColumns[bp.key]"
                type="number"
                :min="1"
                :max="12"
                w-20
                @update:model-value="(v) => updateColumns(bp.key, Number(v) || 1)"
              />
              <span text-sm shrink-0>{{ $t('settings.grid_columns_unit') }}</span>
            </div>
            <div flex="~ gap-2" mt-2>
              <Button type="tertiary" size="small" @click="resetColumns">
                {{ $t('common.operation.reset') }}
              </Button>
            </div>
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_video_card_display')">
      <SettingsItem
        :title="$t('settings.video_card_layout')"
        :desc="$t('settings.video_card_layout_desc')"
        right-width="auto"
      >
        <Select v-model="settings.videoCardLayout" :options="videoCardLayoutOptions" w="160px" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_video_preview')" right-width="auto">
        <Radio v-model="settings.enableVideoPreview" />
      </SettingsItem>

      <template v-if="settings.enableVideoPreview">
        <SettingsItem :title="$t('settings.enable_video_ctrl_bar_on_video_card')" right-width="auto">
          <Radio v-model="settings.enableVideoCtrlBarOnVideoCard" />
        </SettingsItem>

        <SettingsItem :title="$t('settings.hover_video_card_delayed')" right-width="auto">
          <Radio v-model="settings.hoverVideoCardDelayed" />
        </SettingsItem>

        <SettingsItem :title="$t('settings.only_cover_video_preview')" right-width="auto">
          <Radio v-model="settings.onlyCoverVideoPreview" />
        </SettingsItem>
      </template>

      <SettingsItem :title="$t('settings.show_video_card_recommend_tag')" :desc="$t('settings.show_video_card_recommend_tag_desc')" right-width="auto">
        <Radio v-model="settings.showVideoCardRecommendTag" />
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.video_card_title_font_size')"
        :desc="$t('settings.video_card_title_font_size_desc')"
        right-width="auto"
      >
        <Select v-model="settings.videoCardTitleFontSize" :options="videoCardFontSizeOptions" w="160px" />
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.video_card_author_font_size')"
        :desc="$t('settings.video_card_author_font_size_desc')"
        right-width="auto"
      >
        <Select v-model="settings.videoCardAuthorFontSize" :options="videoCardFontSizeOptions" w="160px" />
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.video_card_meta_font_size')"
        :desc="$t('settings.video_card_meta_font_size_desc')"
        right-width="auto"
      >
        <Select v-model="settings.videoCardMetaFontSize" :options="videoCardFontSizeOptions" w="160px" />
      </SettingsItem>
    </SettingsItemGroup>

    <!-- 阴影设置仅适用于现代与紧凑布局，默认折叠 -->
    <SettingsItemGroup
      v-if="isModernLayout"
      :title="$t('settings.video_card_shadow_curve')"
      :desc="$t('settings.video_card_shadow_curve_desc')"
      collapsible
      default-collapsed
    >
      <SettingsItem :title="$t('settings.video_card_shadow_curve')" :desc="$t('settings.video_card_shadow_curve_desc')" right-width="auto">
        <ShadowCurveEditor v-model="settings.videoCardShadowCurve" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.video_card_shadow_height')" :desc="$t('settings.video_card_shadow_height_desc')" right-width="auto">
        <div class="shadow-height-control" flex="~ items-center gap-2">
          <input
            v-model.number="settings.videoCardShadowHeight"
            type="range"
            :min="0"
            :max="2"
            :step="0.1"
            flex-1
            class="shadow-height-slider"
            :style="{ '--shadow-height-progress': `${settings.videoCardShadowHeight * 50}%` }"
          >
          <span text-sm min-w-8 text-right>{{ settings.videoCardShadowHeight.toFixed(1) }}</span>
        </div>
      </SettingsItem>

      <SettingsItem right-width="auto">
        <Button type="secondary" center @click="resetShadowSettings">
          {{ $t('settings.video_card_shadow_reset') }}
        </Button>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.shadow-height-control {
  width: 220px;
}

.shadow-height-slider {
  height: 4px;
  appearance: none;
  background: linear-gradient(
    to right,
    var(--bew-theme-color) 0,
    var(--bew-theme-color) var(--shadow-height-progress),
    var(--bew-fill-2) var(--shadow-height-progress),
    var(--bew-fill-2) 100%
  );
  border-radius: 999px;
  cursor: pointer;
  accent-color: var(--bew-theme-color);

  &::-webkit-slider-thumb {
    width: 16px;
    height: 16px;
    appearance: none;
    background: var(--bew-theme-color);
    border: 2px solid var(--bew-elevated-solid);
    border-radius: 50%;
    box-shadow: var(--bew-shadow-1);
  }

  &::-moz-range-track {
    height: 4px;
    background: var(--bew-fill-2);
    border-radius: 999px;
  }

  &::-moz-range-progress {
    height: 4px;
    background: var(--bew-theme-color);
    border-radius: 999px;
  }

  &::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: var(--bew-theme-color);
    border: 2px solid var(--bew-elevated-solid);
    border-radius: 50%;
    box-shadow: var(--bew-shadow-1);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: 5px;
  }
}
</style>
