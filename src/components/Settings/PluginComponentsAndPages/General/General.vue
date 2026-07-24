<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSectionHeading from '../../components/SettingsSectionHeading.vue'

const { t, locale } = useI18n()
const FavoritesSettings = defineAsyncComponent(() => import('../Favorites/Favorites.vue'))

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

    <SettingsItemGroup :title="$t('settings.group_ad_blocking')">
      <SettingsItem :title="$t('settings.block_ads')" right-width="auto">
        <Radio v-model="settings.blockAds" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.block_top_search_page_ads')" :desc="$t('settings.block_top_search_page_ads_desc')" right-width="auto">
        <Radio v-model="settings.blockTopSearchPageAds" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.clean_url_argument')" :desc="$t('settings.clean_url_argument_desc')" right-width="auto">
        <Radio v-model="settings.cleanUrlArgument" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_clean_share_link')">
      <SettingsItem :title="$t('settings.enable_clean_share_link')" :desc="$t('settings.enable_clean_share_link_desc')" right-width="auto">
        <Radio v-model="settings.enableCleanShareLink" />
      </SettingsItem>
      <template v-if="settings.enableCleanShareLink">
        <SettingsItem :title="$t('settings.clean_share_link_include_title')" :desc="$t('settings.clean_share_link_include_title_desc')" right-width="auto">
          <Radio v-model="settings.cleanShareLinkIncludeTitle" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.clean_share_link_remove_tracking_params')" :desc="$t('settings.clean_share_link_remove_tracking_params_desc')" right-width="auto">
          <Radio v-model="settings.cleanShareLinkRemoveTrackingParams" />
        </SettingsItem>
      </template>
    </SettingsItemGroup>

    <FavoritesSettings />
  </div>
</template>

<style lang="scss" scoped>
</style>
