<script setup lang="ts">
import Button from '~/components/Button.vue'
import Radio from '~/components/Radio.vue'
import type { SettingsNavigationTarget } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import type { PerfWatchSettingKey } from '~/utils/performanceWatcher'

/**
 * 卡顿探测命中后，通过右上角 toast 展示的提示内容。
 * 外壳（左侧 warning 图标、右上角关闭按钮、玻璃表面、宽度与定位、倒计时）
 * 全部由 vue-toastification 与 toast.scss 提供，此处只负责正文排版。
 *
 * 开关直接绑定 settings store，拨动即时持久化并全站生效；
 * 每行齿轮跳转到该选项所在的设置页（复用设置搜索定位通道）。
 */
interface PerfFeature {
  modelKey: PerfWatchSettingKey
  /** 卡片的四个选项都需要精确锚点，故要求 targetTitleKey 必填 */
  target: SettingsNavigationTarget & { targetTitleKey: string }
}

const emit = defineEmits<{
  openSettings: [target: SettingsNavigationTarget]
  stopDetection: []
}>()

const PERF_FEATURES: PerfFeature[] = [
  {
    modelKey: 'enableFrostedGlass',
    target: { menu: 'Appearance', targetTitleKey: 'settings.enable_frosted_glass' },
  },
  {
    modelKey: 'enableLiquidSegmentIndicator',
    target: { menu: 'Appearance', targetTitleKey: 'settings.enable_liquid_segment_indicator' },
  },
  {
    modelKey: 'searchPageBlurredOnSearchFocus',
    target: {
      menu: 'BewlyPages',
      secondaryPage: 'search',
      targetTitleKey: 'settings.bg_blurs_when_the_search_bar_is_focused',
    },
  },
  {
    modelKey: 'individuallySetSearchPageWallpaper',
    target: {
      menu: 'BewlyPages',
      secondaryPage: 'search',
      targetTitleKey: 'settings.individually_set_search_page_wallpaper',
    },
  },
]
</script>

<template>
  <div class="perf-warning">
    <p class="perf-warning__title">
      {{ $t('common.perf_warning_title') }}
    </p>
    <p class="perf-warning__desc">
      {{ $t('common.perf_warning_desc') }}
    </p>
    <ul class="perf-warning__features">
      <li
        v-for="feature in PERF_FEATURES"
        :key="feature.modelKey"
        class="perf-warning__feature"
      >
        <span class="perf-warning__feature-label">
          {{ $t(feature.target.targetTitleKey) }}
        </span>
        <button
          type="button"
          class="perf-warning__feature-settings"
          :aria-label="$t('settings.btn.open_settings')"
          :title="$t('settings.btn.open_settings')"
          @click="emit('openSettings', feature.target)"
        >
          <div i-ic-baseline-settings />
        </button>
        <Radio v-model="settings[feature.modelKey]" />
      </li>
    </ul>
    <div class="perf-warning__actions">
      <Button size="small" type="tertiary" @click="emit('stopDetection')">
        {{ $t('common.perf_warning_stop') }}
      </Button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.perf-warning {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.perf-warning__title {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.perf-warning__desc {
  margin: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
}

.perf-warning__features {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
  margin: var(--bew-space-1) 0 0;
  padding: 0;
  list-style: none;
}

.perf-warning__feature {
  display: flex;
  min-height: 24px;
  gap: var(--bew-space-2);
  align-items: center;
}

.perf-warning__feature-label {
  flex: 1;
  min-width: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  overflow-wrap: anywhere;
}

// 与 toast 自带关闭按钮保持同一套图标按钮语言
.perf-warning__feature-settings {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--bew-text-2);
  cursor: pointer;
  background: var(--bew-fill-1);
  border: 0;
  border-radius: var(--bew-radius-half);
  transition:
    color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
    background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);

  > div {
    width: 14px;
    height: 14px;
  }

  &:hover,
  &:focus-visible {
    color: var(--bew-text-1);
    background: var(--bew-fill-2);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: var(--bew-space-0-5);
  }

  &:active {
    transform: scale(0.92);
  }
}

.perf-warning__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--bew-space-1);
}
</style>
