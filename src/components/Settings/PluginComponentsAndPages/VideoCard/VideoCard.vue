<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { originalSettings, settings } from '~/logic'
import type { VideoCardFontSizeSetting, VideoCardLayoutSetting } from '~/logic/storage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import ShadowCurveEditor from '../../components/ShadowCurveEditor.vue'

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

const isModernLayout = computed(() => settings.value.videoCardLayout === 'modern')

function resetShadowSettings() {
  settings.value.videoCardShadowCurve = [...originalSettings.videoCardShadowCurve]
  settings.value.videoCardShadowHeight = originalSettings.videoCardShadowHeight
}
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_link_opening_behavior')">
      <SettingsItem :title="$t('settings.video_card_link_opening_behavior')">
        <Select
          v-model="settings.videoCardLinkOpenMode"
          :options="videoCardOpenModeOptions"
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

      <!-- Shadow settings - only for modern layout -->
      <template v-if="isModernLayout">
        <SettingsItem :title="$t('settings.video_card_shadow_curve')" :desc="$t('settings.video_card_shadow_curve_desc')">
          <ShadowCurveEditor v-model="settings.videoCardShadowCurve" />
        </SettingsItem>

        <SettingsItem :title="$t('settings.video_card_shadow_height')" :desc="$t('settings.video_card_shadow_height_desc')">
          <div flex="~ items-center gap-2" w-full>
            <input
              v-model.number="settings.videoCardShadowHeight"
              type="range"
              :min="0"
              :max="2"
              :step="0.1"
              flex-1
              class="shadow-height-slider"
            >
            <span text-sm min-w-8 text-right>{{ settings.videoCardShadowHeight.toFixed(1) }}</span>
          </div>
        </SettingsItem>

        <SettingsItem>
          <Button type="secondary" center @click="resetShadowSettings">
            {{ $t('settings.video_card_shadow_reset') }}
          </Button>
        </SettingsItem>
      </template>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
