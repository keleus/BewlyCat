<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { originalSettings, settings } from '~/logic'
import type { GridColumnsConfig, VideoCardFontSizeSetting, VideoCardLayoutSetting } from '~/logic/storage'
import { defaultGridColumns, GRID_BREAKPOINTS } from '~/logic/storage'
import {
  MAX_LIST_LAYOUT_BREAKPOINT,
  MIN_LIST_LAYOUT_BREAKPOINT,
  normalizeListLayoutBreakpoint,
} from '~/utils/gridLayout'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import ShadowCurveEditor from '../../components/ShadowCurveEditor.vue'
import LinkOpening from '../../Navigation/LinkOpening.vue'
import VideoCardContentEditor from './VideoCardContentEditor.vue'
import VideoCardContextMenuEditor from './VideoCardContextMenuEditor.vue'

const { t } = useI18n()

const fontSizeOptionValues: VideoCardFontSizeSetting[] = ['xs', 'sm', 'base', 'lg']
const videoCardLayoutOptionValues: VideoCardLayoutSetting[] = ['modern', 'old']

const videoCardFontSizeOptions = computed(() => fontSizeOptionValues.map(value => ({
  label: t(`settings.font_size_option.${value}`),
  value,
})))

const videoCardLayoutOptions = computed(() => videoCardLayoutOptionValues.map(value => ({
  label: t(`settings.video_card_layout_option.${value}`),
  value,
})))

const isModernLayout = computed(() => settings.value.videoCardLayout === 'modern')

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

function updateListLayoutBreakpoint(value: string | number | undefined) {
  settings.value.autoSwitchListLayoutBreakpoint = normalizeListLayoutBreakpoint(value)
}
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_video_card_display')">
      <SettingsItem
        :title="$t('settings.video_card_layout')"
        :desc="$t('settings.video_card_layout_desc')"
        right-width="auto"
      >
        <Select v-model="settings.videoCardLayout" :options="videoCardLayoutOptions" w="160px" />
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.release_offscreen_images')"
        :badge="$t('settings.badge_use_with_caution')"
        right-width="auto"
      >
        <template #desc>
          <span>{{ $t('settings.release_offscreen_images_desc') }}</span>
          <span block class="bew-warning-text">
            {{ $t('settings.release_offscreen_images_warning') }}
          </span>
        </template>
        <Radio v-model="settings.releaseOffscreenVideoCardImages" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_video_preview')" right-width="auto">
        <Radio v-model="settings.enableVideoPreview" />
      </SettingsItem>

      <template v-if="settings.enableVideoPreview">
        <SettingsItem :title="$t('settings.enable_video_ctrl_bar_on_video_card')" right-width="auto">
          <Radio v-model="settings.enableVideoCtrlBarOnVideoCard" />
        </SettingsItem>

        <SettingsItem
          :title="$t('settings.video_preview_swipe_seek')"
          :desc="$t('settings.video_preview_swipe_seek_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.enableVideoPreviewSwipeSeek" />
        </SettingsItem>

        <SettingsItem :title="$t('settings.hover_video_card_delayed')" right-width="auto">
          <Radio v-model="settings.hoverVideoCardDelayed" />
        </SettingsItem>

        <SettingsItem :title="$t('settings.only_cover_video_preview')" right-width="auto">
          <Radio v-model="settings.onlyCoverVideoPreview" />
        </SettingsItem>
      </template>
    </SettingsItemGroup>

    <!-- 视频卡片网格：打开设置时直接展示断点配置 -->
    <SettingsItemGroup
      :title="$t('settings.group_video_card_grid')"
      :desc="$t('settings.grid_breakpoints_desc')"
    >
      <SettingsItem
        :title="$t('settings.auto_switch_list_layout')"
        :desc="$t('settings.auto_switch_list_layout_desc')"
        right-width="auto"
      >
        <div class="list-layout-control">
          <Input
            :model-value="settings.autoSwitchListLayoutBreakpoint"
            type="number"
            :min="MIN_LIST_LAYOUT_BREAKPOINT"
            :max="MAX_LIST_LAYOUT_BREAKPOINT"
            class="list-layout-control__input"
            @update:model-value="updateListLayoutBreakpoint"
          >
            <template #prefix>
              <span class="list-layout-control__label">{{ $t('settings.auto_switch_list_layout_breakpoint') }}</span>
            </template>
            <template #suffix>
              <span class="list-layout-control__unit">px</span>
            </template>
          </Input>
          <Radio v-model="settings.autoSwitchListLayout" />
        </div>
      </SettingsItem>

      <SettingsItem :title="$t('settings.grid_breakpoints')" :desc="$t('settings.grid_breakpoints_desc')" right-width="auto">
        <template #bottom>
          <div class="grid-breakpoints">
            <div
              v-for="bp in breakpointLabels"
              :key="bp.key"
              class="grid-breakpoints__item"
            >
              <span class="grid-breakpoints__label">{{ bp.label }}</span>
              <Input
                :model-value="settings.gridColumns[bp.key]"
                type="number"
                :min="1"
                :max="12"
                class="grid-breakpoints__input"
                @update:model-value="(v) => updateColumns(bp.key, Number(v) || 1)"
              />
              <span class="grid-breakpoints__unit">{{ $t('settings.grid_columns_unit') }}</span>
            </div>
          </div>
          <div class="grid-breakpoints__actions">
            <Button type="tertiary" size="small" @click="resetColumns">
              {{ $t('common.operation.reset') }}
            </Button>
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.group_video_card_content')"
      :desc="$t('settings.group_video_card_content_desc')"
    >
      <VideoCardContentEditor />

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

    <SettingsItemGroup
      :title="$t('settings.group_video_card_context_menu')"
      :desc="$t('settings.group_video_card_context_menu_desc')"
      collapsible
    >
      <VideoCardContextMenuEditor />
    </SettingsItemGroup>

    <!-- 阴影设置仅适用于现代布局，默认折叠 -->
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

    <LinkOpening scope="videoCard" />
  </div>
</template>

<style lang="scss" scoped>
.grid-breakpoints {
  display: grid;
  width: 100%;
  gap: var(--bew-space-3);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 13.5rem), 1fr));

  &__item {
    display: grid;
    align-items: center;
    grid-template-columns: 5rem 5rem max-content;
    gap: var(--bew-space-2);
    min-width: 0;
  }

  &__label {
    min-width: 5rem;
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
    color: var(--bew-text-1);
    white-space: nowrap;
  }

  &__input {
    width: 100%;
    min-width: 4.5rem;
    border: 1px solid color-mix(in oklab, var(--bew-border-color), var(--bew-fill-2) 60%);

    // Keep the native number stepper integrated with the input surface. The
    // pseudo-elements are Chromium/WebKit-specific; Firefox keeps its native
    // controls and still receives the same input background below.
    :deep(input[type="number"]) {
      background-color: var(--bew-fill-1);
      color-scheme: inherit;

      &::-webkit-inner-spin-button,
      &::-webkit-outer-spin-button {
        background-color: var(--bew-fill-1);
        opacity: 1;
      }
    }
  }

  &__unit {
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
    color: var(--bew-text-2);
    white-space: nowrap;
  }

  &__actions {
    display: flex;
    gap: var(--bew-space-2);
    margin-top: var(--bew-space-3);
  }
}

.list-layout-control {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}

.list-layout-control__input {
  width: 150px;
}

.list-layout-control__label,
.list-layout-control__unit {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  white-space: nowrap;
}

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
  border-radius: var(--bew-radius-full);
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
    border-radius: var(--bew-radius-full);
  }

  &::-moz-range-progress {
    height: 4px;
    background: var(--bew-theme-color);
    border-radius: var(--bew-radius-full);
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
    outline-offset: var(--bew-space-1);
  }
}
</style>
