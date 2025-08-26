<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const { t } = useI18n()

// 视频播放器模式选项
const videoPlayerModeOptions = computed(() => {
  return [
    {
      label: t('settings.video_player_mode.default'),
      value: 'default',
    },
    {
      label: t('settings.video_player_mode.fullscreen'),
      value: 'fullscreen',
    },
    {
      label: t('settings.video_player_mode.web_fullscreen'),
      value: 'webFullscreen',
    },
    {
      label: t('settings.video_player_mode.widescreen'),
      value: 'widescreen',
    },
  ]
})

// 随机播放模式选项
const randomPlayModeOptions = computed(() => {
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
    <SettingsItemGroup :title="$t('settings.group_player_settings')">
      <SettingsItem :title="$t('settings.video_default_player_mode')">
        <Select v-model="settings.defaultVideoPlayerMode" :options="videoPlayerModeOptions" w="full" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.video_player_scroll')"
        :desc="t('settings.video_player_scroll_desc')"
      >
        <Radio v-model="settings.videoPlayerScroll" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.remember_playback_rate')"
        :desc="t('settings.remember_playback_rate_desc')"
      >
        <Radio v-model="settings.rememberPlaybackRate" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_playback_behavior')">
      <SettingsItem
        :title="t('settings.disable_auto_play_collection')"
        :desc="t('settings.disable_auto_play_collection_desc')"
      >
        <Radio v-model="settings.disableAutoPlayCollection" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.keep_collection_video_default_mode')"
        :desc="t('settings.keep_collection_video_default_mode_desc')"
      >
        <Radio v-model="settings.keepCollectionVideoDefaultMode" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.enable_random_play')"
        :desc="t('settings.enable_random_play_desc')"
      >
        <Radio v-model="settings.enableRandomPlay" />
      </SettingsItem>

      <template v-if="settings.enableRandomPlay">
        <SettingsItem
          :title="t('settings.random_play_mode')"
          :desc="t('settings.random_play_mode_desc')"
        >
          <Select v-model="settings.randomPlayMode" :options="randomPlayModeOptions" w="full" />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.min_videos_for_random')"
          :desc="t('settings.min_videos_for_random_desc')"
        >
          <Input
            v-model="settings.minVideosForRandom"
            type="number"
            w="full"
          />
        </SettingsItem>
      </template>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
