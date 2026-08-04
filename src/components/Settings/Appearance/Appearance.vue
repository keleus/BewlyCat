<script lang="ts" setup>
import { useThrottleFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import Select from '~/components/Select.vue'
import { FROSTED_GLASS_BLUR_MAX_PX, FROSTED_GLASS_BLUR_MIN_PX, localSettings, settings } from '~/logic'

import ChangeWallpaper from '../components/ChangeWallpaper.vue'
import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
import SettingsSectionHeading from '../components/SettingsSectionHeading.vue'

const { t } = useI18n()

const themeScheduleStart = ref(settings.value.themeScheduleStart)
const themeScheduleEnd = ref(settings.value.themeScheduleEnd)

watch(() => settings.value.themeScheduleStart, (value) => {
  themeScheduleStart.value = value
})

watch(() => settings.value.themeScheduleEnd, (value) => {
  themeScheduleEnd.value = value
})

function saveThemeSchedule() {
  settings.value.themeScheduleStart = themeScheduleStart.value
  settings.value.themeScheduleEnd = themeScheduleEnd.value
}

const themeColorOptions = computed<Array<string>>(() => {
  return [
    '#22c55e',
    '#34d399',
    '#14b8a6',
    '#06b6d4',
    '#00a1d6',
    '#60a5fa',
    '#3b82f6',
    '#6366f1',
    '#818cf8',
    '#a78bfa',
    '#f46d43',
    '#fb923c',
    '#f59e0b',
    '#eab308',
    '#f43f5e',
    '#fb7299',
    '#fda4af',
  ]
})

// 深色模式基准颜色选项
const darkModeBaseColorOptions = computed<Array<string>>(() => {
  return [
    '#2a2d32', // 默认深色
    '#1a1b1e', // 更深的黑色
    '#2d2a2f', // 紫色调深色
    '#2a2f2d', // 绿色调深色
    '#2f2d2a', // 棕色调深色
    '#252829', // 蓝色调深色
    '#2c2a2a', // 红色调深色
    '#292a2c', // 灰色调深色
  ]
})

const isCustomColor = computed<boolean>(() => {
  return !themeColorOptions.value.includes(settings.value.themeColor)
})

const isCustomDarkModeBaseColor = computed<boolean>(() => {
  return !darkModeBaseColorOptions.value.includes(settings.value.darkModeBaseColor)
})

const bilibiliEvolvedThemeColor = computed(() => {
  return getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim() || '#00a1d6'
})

const fontPreferenceOptions = computed(() => {
  return [
    {
      label: t('settings.customize_font_opt.default'),
      value: 'default',
    },
    {
      label: t('settings.customize_font_opt.recommend'),
      value: 'recommend',
    },
    {
      label: t('settings.customize_font_opt.custom'),
      value: 'custom',
    },
  ]
})

const themeOptions = computed<Array<{ value: string, label: string }>>(() => {
  return [
    {
      label: t('settings.theme_opt.dark'),
      value: 'dark',
    },
    {
      label: t('settings.theme_opt.light'),
      value: 'light',
    },
    {
      label: t('settings.theme_opt.auto'),
      value: 'auto',
    },
    {
      label: t('settings.theme_opt.scheduled'),
      value: 'scheduled',
    },
  ]
})

watch(() => settings.value.wallpaper, (newValue) => {
  changeWallpaper(newValue)
})

function changeThemeColor(color: string) {
  settings.value.themeColor = color
}
const changeThemeColorThrottle = useThrottleFn((color: string) => changeThemeColor(color), 100)

function changeDarkModeBaseColor(color: string) {
  settings.value.darkModeBaseColor = color
}
const changeDarkModeBaseColorThrottle = useThrottleFn((color: string) => changeDarkModeBaseColor(color), 100)

function changeWallpaper(url: string) {
  // If you had already set the wallpaper, it enables the wallpaper masking to prevent text hard to see
  if (url)
    settings.value.enableWallpaperMasking = true
  else
    settings.value.enableWallpaperMasking = false

  settings.value.wallpaper = url
}
</script>

<template>
  <div>
    <SettingsSectionHeading
      :title="$t('settings.menu_appearance')"
      :desc="$t('settings.category_appearance_desc')"
      icon="i-mingcute:paint-brush-fill"
    />

    <SettingsItemGroup :title="$t('settings.group_visual_effects')">
      <SettingsItem
        :title="$t('settings.enable_frosted_glass')"
        :badge="$t('settings.badge_performance_impact')"
        right-width="auto"
      >
        <template #desc>
          <span class="bew-warning-text">{{ $t('common.performance_impact_warn') }}</span>
        </template>

        <Radio v-model="settings.enableFrostedGlass" />
      </SettingsItem>
      <SettingsItem
        v-if="settings.enableFrostedGlass"
        :title="$t('settings.frosted_glass_blur_intensity')"
        right-width="auto"
      >
        <div class="slider-control">
          <Slider
            v-model="settings.frostedGlassBlurIntensity"
            :min="FROSTED_GLASS_BLUR_MIN_PX"
            :max="FROSTED_GLASS_BLUR_MAX_PX"
            :label="`${settings.frostedGlassBlurIntensity}`"
          />
        </div>
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.enable_liquid_segment_indicator')"
        :badge="$t('settings.badge_performance_impact')"
        right-width="auto"
      >
        <template #desc>
          <span>{{ $t('settings.enable_liquid_segment_indicator_desc') }}</span>
          <span block class="bew-warning-text">{{ $t('common.performance_impact_warn') }}</span>
        </template>
        <Radio v-model="settings.enableLiquidSegmentIndicator" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.disable_shadow')" right-width="auto">
        <Radio v-model="settings.disableShadow" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_page_style')">
      <SettingsItem
        :title="$t('settings.adapt_to_other_page_styles')"
        :desc="$t('settings.adapt_to_other_page_styles_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.adaptToOtherPageStyles" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_color')">
      <SettingsItem :title="$t('settings.theme')" right-width="auto">
        <Select v-model="settings.theme" w="160px" :options="themeOptions" />
      </SettingsItem>
      <SettingsItem
        v-if="settings.theme === 'scheduled'"
        :title="$t('settings.theme_schedule')"
        :desc="$t('settings.theme_schedule_desc')"
        right-width="auto"
      >
        <div class="theme-schedule" flex="~ items-center gap-2">
          <input v-model="themeScheduleStart" type="time" @blur="saveThemeSchedule">
          <span>–</span>
          <input v-model="themeScheduleEnd" type="time" @blur="saveThemeSchedule">
        </div>
      </SettingsItem>
      <SettingsItem :title="$t('settings.video_page_dark_mode')" right-width="auto">
        <template #desc>
          {{ $t('settings.video_page_dark_mode_desc') }}
        </template>

        <Radio v-model="settings.videoPageDarkMode" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.theme_color')" right-width="auto">
        <div class="theme-color-options" flex="~ gap-2 wrap" justify-end>
          <div
            v-for="color in themeColorOptions" :key="color"
            class="color-option"
            w-20px h-20px rounded-8 cursor-pointer transition
            duration-300 box-border
            :style="{
              background: color,
              transform: color === settings.themeColor ? 'scale(1.3)' : 'scale(1)',
              border: color === settings.themeColor ? '2px solid white' : '2px solid transparent',
              boxShadow: color === settings.themeColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
            }"
            @click="changeThemeColor(color)"
          />
          <div
            class="color-option"
            w-20px h-20px rounded-8 overflow-hidden
            cursor-pointer transition duration-300
            flex="~ items-center justify-center"
            :style="{
              transform: isCustomColor ? 'scale(1.3)' : 'scale(1)',
              border: isCustomColor ? '2px solid white' : `2px solid ${settings.themeColor}`,
              boxShadow: isCustomColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
            }"
          >
            <div
              i-mingcute:color-picker-line pos="absolute" text-white w-12px h-12px
              pointer-events-none
            />
            <input
              :value="settings.themeColor"
              type="color"
              w-30px h-30px p-0 m-0 block
              shrink-0 rounded-8 border-none cursor-pointer
              @input="(e) => changeThemeColorThrottle((e.target as HTMLInputElement)?.value)"
            >
          </div>
        </div>
      </SettingsItem>

      <SettingsItem :title="$t('settings.dark_mode_base_color')" right-width="auto">
        <div class="dark-mode-base-color-options" flex="~ gap-2 wrap" justify-end>
          <div
            v-for="color in darkModeBaseColorOptions" :key="color"
            class="color-option"
            w-20px h-20px rounded-8 cursor-pointer transition
            duration-300 box-border
            :style="{
              background: color,
              transform: color === settings.darkModeBaseColor ? 'scale(1.3)' : 'scale(1)',
              border: color === settings.darkModeBaseColor ? '2px solid white' : '2px solid transparent',
              boxShadow: color === settings.darkModeBaseColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
            }"
            @click="changeDarkModeBaseColor(color)"
          />
          <div
            class="color-option"
            w-20px h-20px rounded-8 overflow-hidden
            cursor-pointer transition duration-300
            flex="~ items-center justify-center"
            :style="{
              transform: isCustomDarkModeBaseColor ? 'scale(1.3)' : 'scale(1)',
              border: isCustomDarkModeBaseColor ? '2px solid white' : `2px solid ${settings.darkModeBaseColor}`,
              boxShadow: isCustomDarkModeBaseColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
            }"
          >
            <div
              i-mingcute:color-picker-line pos="absolute" text-white w-12px h-12px
              pointer-events-none
            />
            <input
              :value="settings.darkModeBaseColor"
              type="color"
              w-30px h-30px p-0 m-0 block
              shrink-0 rounded-8 border-none cursor-pointer
              @input="(e) => changeDarkModeBaseColorThrottle((e.target as HTMLInputElement)?.value)"
            >
          </div>
        </div>
      </SettingsItem>

      <SettingsItem :title="$t('settings.gradient_theme_color_background')" right-width="auto">
        <Radio v-model="settings.useLinearGradientThemeColorBackground" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.follow_bilibili_evolved_color')"
        :desc="$t('settings.follow_bilibili_evolved_color_desc')"
        right-width="auto"
      >
        <div
          class="color-option"
          w-20px h-20px rounded-8 cursor-pointer transition
          duration-300 box-border
          :style="{
            background: bilibiliEvolvedThemeColor,
            transform: bilibiliEvolvedThemeColor === settings.themeColor ? 'scale(1.3)' : 'scale(1)',
            border: bilibiliEvolvedThemeColor === settings.themeColor ? '2px solid white' : '2px solid transparent',
            boxShadow: bilibiliEvolvedThemeColor === settings.themeColor ? '0 0 0 1px var(--bew-border-color), var(--bew-shadow-1)' : 'none',
          }"
          @click="changeThemeColor(bilibiliEvolvedThemeColor)"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <ChangeWallpaper type="global" />

    <SettingsItemGroup :title="$t('settings.group_fonts')">
      <SettingsItem :title="$t('settings.customize_font')" right-width="auto">
        <Select
          v-model="settings.customizeFont"
          :options="fontPreferenceOptions"
          w="160px"
        />
        <template v-if="settings.customizeFont === 'custom'" #bottom>
          <Input v-model="settings.fontFamily" @keydown.stop.passive="() => {}" />
          <div text="sm $bew-text-2" mt-1 v-html="t('settings.customize_font_desc')" />
        </template>
      </SettingsItem>
      <SettingsItem :title="$t('settings.remove_the_indent_from_chinese_punctuation')" :desc="$t('settings.remove_the_indent_from_chinese_punctuation_desc')" right-width="auto">
        <Radio v-model="settings.removeTheIndentFromChinesePunctuation" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.override_danmaku_font')" :desc="$t('settings.override_danmaku_font_desc')" right-width="auto">
        <Radio v-model="settings.overrideDanmakuFont" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup>
      <SettingsItem
        :title="$t('settings.customize_css')"
        :badge="$t('settings.badge_advanced')"
        right-width="auto"
      >
        <Radio v-model="localSettings.customizeCSS" />
        <template #desc>
          <span text="$bew-error-color">
            {{ $t('settings.customize_css_desc') }}
          </span>
        </template>
        <template v-if="localSettings.customizeCSS" #bottom>
          <CodeEditor v-model="localSettings.customizeCSSContent" language="css" @keydown.stop.passive="() => {}" />
        </template>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.color-option {
  transition:
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    box-shadow var(--bew-duration-normal) var(--bew-ease-standard),
    filter var(--bew-duration-normal) var(--bew-ease-standard),
    outline-color var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-standard);
}

.color-option:hover {
  filter: brightness(1.12);
  outline: 1px solid var(--bew-border-color);
  outline-offset: 2px;
}

.theme-color-options {
  width: 312px;
}

.dark-mode-base-color-options {
  width: 252px;
}

.theme-schedule input {
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-fill-3);
  border-radius: var(--bew-interactive-radius);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  color-scheme: inherit;
}

.slider-control {
  width: 220px;
}
</style>
