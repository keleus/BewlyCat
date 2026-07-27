<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import type { AutoPlayMode, CollectedSeasonPlayAllMode, DefaultCustomPlayOrder } from '~/logic/storage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsItemSubgroup from '../../components/SettingsItemSubgroup.vue'

const { t } = useI18n()

type AutoPlaySettingKey = 'autoPlayMultipart' | 'autoPlayCollection' | 'autoPlayRecommend' | 'autoPlayPlaylist'

const nativeAutoPlayModes: { label: string, value: AutoPlayMode }[] = [
  { label: 'auto_play_mode_auto_play', value: 'autoPlay' },
  { label: 'auto_play_mode_auto_play_with_recommend', value: 'autoPlayWithRecommend' },
  { label: 'auto_play_mode_pause_at_end', value: 'pauseAtEnd' },
  { label: 'auto_play_mode_loop', value: 'loop' },
]

const customAutoPlayModes: { label: string, value: AutoPlayMode }[] = [
  { label: 'auto_play_mode_custom_sequential', value: 'customSequential' },
  { label: 'auto_play_mode_custom_reverse', value: 'customReverse' },
  { label: 'auto_play_mode_custom_random', value: 'customRandom' },
]

const defaultCustomPlayOrderOptions = computed(() => [
  {
    label: t('settings.random_play_order_sequential'),
    value: 'sequential' satisfies DefaultCustomPlayOrder,
  },
  {
    label: t('settings.random_play_order_reverse'),
    value: 'reverse' satisfies DefaultCustomPlayOrder,
  },
  {
    label: t('settings.random_play_order_random'),
    value: 'random' satisfies DefaultCustomPlayOrder,
  },
])

const supportedAutoPlayModes = computed(() => [
  ...nativeAutoPlayModes,
  ...(settings.value.enableRandomPlay ? customAutoPlayModes : []),
])

function isCustomAutoPlayMode(mode: AutoPlayMode): boolean {
  return mode === 'customSequential' || mode === 'customReverse' || mode === 'customRandom'
}

function createAutoPlayModeModel(key: AutoPlaySettingKey) {
  return computed<AutoPlayMode>({
    get: () => {
      const mode = settings.value[key]
      return !settings.value.enableRandomPlay && isCustomAutoPlayMode(mode) ? 'pauseAtEnd' : mode
    },
    set: value => settings.value[key] = value,
  })
}

const autoPlayMultipartModel = createAutoPlayModeModel('autoPlayMultipart')
const autoPlayCollectionModel = createAutoPlayModeModel('autoPlayCollection')
const autoPlayRecommendModel = createAutoPlayModeModel('autoPlayRecommend')
const autoPlayPlaylistModel = createAutoPlayModeModel('autoPlayPlaylist')

const collectedSeasonPlayAllModeOptions = computed(() => [
  {
    label: t('settings.collected_season_play_all_mode_beginning'),
    value: 'beginning' satisfies CollectedSeasonPlayAllMode,
  },
  {
    label: t('settings.collected_season_play_all_mode_latest'),
    value: 'latest' satisfies CollectedSeasonPlayAllMode,
  },
  {
    label: t('settings.collected_season_play_all_mode_last_watched'),
    value: 'lastWatched' satisfies CollectedSeasonPlayAllMode,
  },
])

// 随机播放专用的启用方式
const randomPlayActivationModeOptions = computed(() => {
  return [
    {
      label: t('settings.random_play_mode_manual'),
      value: 'manual',
    },
    {
      label: t('settings.random_play_mode_auto'),
      value: 'auto',
    },
  ]
})
</script>

<template>
  <div>
    <SettingsItemGroup :title="t('settings.group_random_play')">
      <SettingsItem
        :title="t('settings.enable_random_play')"
        :desc="t('settings.enable_random_play_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.enableRandomPlay" />
      </SettingsItem>

      <SettingsItem
        v-if="settings.enableRandomPlay"
        :title="t('settings.default_custom_play_order')"
        :desc="t('settings.default_custom_play_order_desc')"
        right-width="auto"
      >
        <Select v-model="settings.defaultCustomPlayOrder" :options="defaultCustomPlayOrderOptions" w="160px" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      v-if="settings.enableRandomPlay"
      :title="t('settings.group_random_play_settings')"
      :desc="t('settings.group_random_play_settings_desc')"
    >
      <SettingsItem
        :title="t('settings.random_play_mode')"
        :desc="t('settings.random_play_mode_desc')"
        right-width="auto"
      >
        <Select v-model="settings.randomPlayMode" :options="randomPlayActivationModeOptions" w="160px" />
      </SettingsItem>

      <SettingsItem
        v-if="settings.randomPlayMode === 'auto'"
        :title="t('settings.min_videos_for_random')"
        :desc="t('settings.min_videos_for_random_desc')"
        right-width="auto"
      >
        <Input
          v-model="settings.minVideosForRandom"
          type="number"
          w="120px"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_playback_end_behavior')">
      <SettingsItem
        :title="t('settings.use_bilibili_default_auto_play')"
        :desc="t('settings.use_bilibili_default_auto_play_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.useBilibiliDefaultAutoPlay" />
      </SettingsItem>

      <SettingsItemSubgroup
        v-if="!settings.useBilibiliDefaultAutoPlay"
        :title="t('settings.group_video_type_end_behavior')"
        :desc="t('settings.group_custom_auto_play_behavior_desc')"
      >
        <SettingsItem
          :title="t('settings.auto_play_multipart')"
          right-width="auto"
        >
          <Select
            v-model="autoPlayMultipartModel"
            :options="supportedAutoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="176px"
          />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.auto_play_collection')"
          right-width="auto"
        >
          <Select
            v-model="autoPlayCollectionModel"
            :options="supportedAutoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="176px"
          />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.auto_play_playlist')"
          right-width="auto"
        >
          <Select
            v-model="autoPlayPlaylistModel"
            :options="supportedAutoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="176px"
          />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.auto_play_recommend')"
          right-width="auto"
        >
          <Select
            v-model="autoPlayRecommendModel"
            :options="nativeAutoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="176px"
          />
        </SettingsItem>
      </SettingsItemSubgroup>
    </SettingsItemGroup>

    <SettingsItemGroup :title="t('settings.group_playlist_start_behavior')">
      <SettingsItem
        :title="t('settings.collected_season_play_all_mode')"
        :desc="t('settings.collected_season_play_all_mode_desc')"
        right-width="auto"
      >
        <Select
          v-model="settings.collectedSeasonPlayAllMode"
          :options="collectedSeasonPlayAllModeOptions"
          w="180px"
        />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
