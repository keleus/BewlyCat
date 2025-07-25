<script lang="ts" setup>
import { useThrottleFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { localSettings, settings } from '~/logic'

import ChangeWallpaper from '../components/ChangeWallpaper.vue'
import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const { t } = useI18n()

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

const themeOptions = computed<Array<{ value: string, label: string }>>(() => {
  return [
    {
      label: t('settings.theme_opt.light'),
      value: 'light',
    },
    {
      label: t('settings.theme_opt.dark'),
      value: 'dark',
    },
    {
      label: t('settings.theme_opt.auto'),
      value: 'auto',
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
    <SettingsItemGroup :title="$t('settings.group_color')">
      <SettingsItem :title="$t('settings.theme')">
        <Select v-model="settings.theme" w-full :options="themeOptions" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.theme_color')">
        <div flex="~ gap-2 wrap" justify-end>
          <div
            v-for="color in themeColorOptions" :key="color"
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

      <SettingsItem :title="$t('settings.dark_mode_base_color')">
        <div flex="~ gap-2 wrap" justify-end>
          <div
            v-for="color in darkModeBaseColorOptions" :key="color"
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

      <SettingsItem :title="$t('settings.gradient_theme_color_background')">
        <Radio v-model="settings.useLinearGradientThemeColorBackground" />
      </SettingsItem>
    </SettingsItemGroup>

    <ChangeWallpaper type="global" />

    <SettingsItemGroup>
      <SettingsItem :title="$t('settings.customize_css')">
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
</style>
