<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import Performance from '../../Advanced/Performance.vue'
import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSectionHeading from '../../components/SettingsSectionHeading.vue'

const { t, locale } = useI18n()

const langOptions = computed(() => {
  return [
    {
      label: t('settings.select_language_opt.mandarin_cn'),
      value: 'cmn-CN',
    },
    {
      label: t('settings.select_language_opt.mandarin_tw'),
      value: 'cmn-TW',
    },
    {
      label: t('settings.select_language_opt.english'),
      value: 'en',
    },
    {
      label: t('settings.select_language_opt.jyut'),
      value: 'jyut',
    },
  ]
})

watch(() => settings.value.language, (newValue) => {
  locale.value = newValue
})
</script>

<template>
  <div>
    <SettingsSectionHeading
      :title="$t('settings.menu_general')"
      :desc="$t('settings.category_general_desc')"
      icon="i-mingcute:settings-3-fill"
    />

    <SettingsItemGroup :title="$t('settings.group_language')">
      <SettingsItem :title="$t('settings.select_language')" right-width="auto">
        <Select
          v-model="settings.language"
          :options="langOptions"
          w="160px"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_interaction_layout')">
      <SettingsItem :title="$t('settings.touch_screen_optimization')" :desc="$t('settings.touch_screen_optimization_desc')" right-width="auto">
        <Radio v-model="settings.touchScreenOptimization" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_grid_layout_switcher')" right-width="auto">
        <Radio v-model="settings.enableGridLayoutSwitcher" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_horizontal_scrolling')" :desc="$t('settings.enable_horizontal_scrolling_desc')" right-width="auto">
        <Radio v-model="settings.enableHorizontalScrolling" />
      </SettingsItem>
    </SettingsItemGroup>

    <Performance />

    <SettingsItemGroup :title="$t('settings.group_drawer_behavior')">
      <SettingsItem :title="$t('settings.close_drawer_without_pressing_esc_again')" right-width="auto">
        <template #title>
          <div v-html="$t('settings.close_drawer_without_pressing_esc_again')" />
        </template>
        <Radio v-model="settings.closeDrawerWithoutPressingEscAgain" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
