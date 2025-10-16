<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import type { VideoCardFontSizeSetting, VideoCardLayoutSetting } from '~/logic/storage'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const { t, locale } = useI18n()

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

const langOptions = computed(() => {
  return [
    {
      label: t('settings.select_language_opt.english'),
      value: 'en',
    },
    {
      label: t('settings.select_language_opt.mandarin_cn'),
      value: 'cmn-CN',
    },
    {
      label: t('settings.select_language_opt.mandarin_tw'),
      value: 'cmn-TW',
    },
    {
      label: t('settings.select_language_opt.jyut'),
      value: 'jyut',
    },
  ]
})

const openModeOptions = computed(() => {
  return [
    {
      label: t('settings.link_opening_behavior_opt.current_tab'),
      value: 'currentTab',
    },
    {
      label: t('settings.link_opening_behavior_opt.current_tab_if_not_homepage'),
      value: 'currentTabIfNotHomepage',
    },
    {
      label: t('settings.link_opening_behavior_opt.background'),
      value: 'background',
    },
    {
      label: t('settings.link_opening_behavior_opt.new_tab'),
      value: 'newTab',
    },
  ]
})

const videoCardOpenModeOptions = computed(() => {
  return [
    {
      label: t('settings.link_opening_behavior_opt.current_tab'),
      value: 'currentTab',
    },
    {
      label: t('settings.link_opening_behavior_opt.drawer'),
      value: 'drawer',
    },
    {
      label: t('settings.link_opening_behavior_opt.background'),
      value: 'background',
    },
    {
      label: t('settings.link_opening_behavior_opt.new_tab'),
      value: 'newTab',
    },
  ]
})

watch(() => settings.value.language, (newValue) => {
  locale.value = newValue
})
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_common')">
      <SettingsItem :title="$t('settings.touch_screen_optimization')" :desc="$t('settings.touch_screen_optimization_desc')">
        <Radio v-model="settings.touchScreenOptimization" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.show_ip_location')" :desc="$t('settings.show_ip_location_desc')">
        <Radio v-model="settings.showIPLocation" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.show_sex')" :desc="$t('settings.show_sex_desc')">
        <Radio v-model="settings.showSex" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.adjust_comment_image_height')" :desc="$t('settings.adjust_comment_image_height_desc')">
        <Radio v-model="settings.adjustCommentImageHeight" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_grid_layout_switcher')">
        <Radio v-model="settings.enableGridLayoutSwitcher" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_horizontal_scrolling')" :desc="$t('settings.enable_horizontal_scrolling_desc')">
        <Radio v-model="settings.enableHorizontalScrolling" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_language')">
      <SettingsItem :title="$t('settings.select_language')">
        <Select
          v-model="settings.language"
          :options="langOptions"
          w="full"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_link_opening_behavior')">
      <SettingsItem :title="$t('settings.top_bar_link_opening_behavior')">
        <Select v-model="settings.topBarLinkOpenMode" :options="openModeOptions" w="full" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.video_card_link_opening_behavior')">
        <Select
          v-model="settings.videoCardLinkOpenMode"
          :options="videoCardOpenModeOptions"
          w="full"
        />
      </SettingsItem>
      <SettingsItem :title="$t('settings.search_bar_link_opening_behavior')">
        <Select
          v-model="settings.searchBarLinkOpenMode"
          :options="openModeOptions"
          w="full"
        />
      </SettingsItem>
      <SettingsItem>
        <template #title>
          <div v-html="$t('settings.close_drawer_without_pressing_esc_again')" />
        </template>
        <Radio v-model="settings.closeDrawerWithoutPressingEscAgain" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_ad_blocking')">
      <SettingsItem :title="$t('settings.block_ads')">
        <Radio v-model="settings.blockAds" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.block_top_search_page_ads')" :desc="$t('settings.block_top_search_page_ads_desc')">
        <Radio v-model="settings.blockTopSearchPageAds" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.clean_url_argument')" :desc="$t('settings.clean_url_argument_desc')">
        <Radio v-model="settings.cleanUrlArgument" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_video_card')">
      <SettingsItem
        :title="$t('settings.video_card_layout')"
        :desc="$t('settings.video_card_layout_desc')"
      >
        <Select v-model="settings.videoCardLayout" :options="videoCardLayoutOptions" w="full" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_video_preview')">
        <Radio v-model="settings.enableVideoPreview" />
      </SettingsItem>

      <template v-if="settings.enableVideoPreview">
        <SettingsItem :title="$t('settings.enable_video_ctrl_bar_on_video_card')">
          <Radio v-model="settings.enableVideoCtrlBarOnVideoCard" />
        </SettingsItem>

        <SettingsItem :title="$t('settings.hover_video_card_delayed')">
          <Radio v-model="settings.hoverVideoCardDelayed" />
        </SettingsItem>
      </template>

      <SettingsItem :title="$t('settings.show_video_card_recommend_tag')" :desc="$t('settings.show_video_card_recommend_tag_desc')">
        <Radio v-model="settings.showVideoCardRecommendTag" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.home_adaptive_title_auto_size')" :desc="$t('settings.home_adaptive_title_auto_size_desc')">
        <Radio v-model="settings.homeAdaptiveTitleAutoSize" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.home_adaptive_title_font_size')" :desc="$t('settings.home_adaptive_title_font_size_desc')">
        <div flex="~ justify-end" w-full>
          <Input
            v-model="settings.homeAdaptiveTitleFontSize"
            type="number"
            :min="12"
            :max="28"
            flex-1
            :disabled="settings.homeAdaptiveTitleAutoSize"
          >
            <template #suffix>
              px
            </template>
          </Input>
        </div>
      </SettingsItem>

      <SettingsItem :title="$t('settings.home_adaptive_card_min_width')" :desc="$t('settings.home_adaptive_card_min_width_desc')">
        <div flex="~ justify-end" w-full>
          <Input
            v-model="settings.homeAdaptiveCardMinWidth"
            type="number"
            :min="160"
            :max="600"
            flex-1
          >
            <template #suffix>
              px
            </template>
          </Input>
        </div>
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.video_card_author_font_size')"
        :desc="$t('settings.video_card_author_font_size_desc')"
      >
        <Select v-model="settings.videoCardAuthorFontSize" :options="videoCardFontSizeOptions" w="full" />
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.video_card_meta_font_size')"
        :desc="$t('settings.video_card_meta_font_size_desc')"
      >
        <Select v-model="settings.videoCardMetaFontSize" :options="videoCardFontSizeOptions" w="full" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
