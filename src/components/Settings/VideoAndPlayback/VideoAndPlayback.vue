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
      label: t('settings.video_player_mode.web_fullscreen'),
      value: 'webFullscreen',
    },
    {
      label: t('settings.video_player_mode.widescreen'),
      value: 'widescreen',
    },
  ]
})

const videoDanmakuDefaultStateOptions = computed(() => {
  return [
    {
      label: t('settings.video_danmaku_default_state_opt.system'),
      value: 'system',
    },
    {
      label: t('settings.video_danmaku_default_state_opt.on'),
      value: 'on',
    },
    {
      label: t('settings.video_danmaku_default_state_opt.off'),
      value: 'off',
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
        :title="t('settings.video_danmaku_default_state')"
        :desc="t('settings.video_danmaku_default_state_desc')"
      >
        <Select v-model="settings.defaultDanmakuState" :options="videoDanmakuDefaultStateOptions" w="full" />
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

      <SettingsItem
        :title="t('settings.auto_exit_fullscreen_on_end')"
        :desc="t('settings.auto_exit_fullscreen_on_end_desc')"
      >
        <Radio v-model="settings.autoExitFullscreenOnEnd" />
      </SettingsItem>

      <template v-if="settings.autoExitFullscreenOnEnd">
        <SettingsItem
          :title="t('settings.auto_exit_fullscreen_exclude_auto_play')"
          :desc="t('settings.auto_exit_fullscreen_exclude_auto_play_desc')"
        >
          <Radio v-model="settings.autoExitFullscreenExcludeAutoPlay" />
        </SettingsItem>
      </template>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_playback_behavior')">
      <SettingsItem
        :title="t('settings.auto_play_multipart')"
        :desc="t('settings.auto_play_multipart_desc')"
      >
        <Radio v-model="settings.autoPlayMultipart" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.auto_play_collection')"
        :desc="t('settings.auto_play_collection_desc')"
      >
        <Radio v-model="settings.autoPlayCollection" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.auto_play_recommend')"
        :desc="t('settings.auto_play_recommend_desc')"
      >
        <Radio v-model="settings.autoPlayRecommend" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.auto_play_playlist')"
        :desc="t('settings.auto_play_playlist_desc')"
      >
        <Radio v-model="settings.autoPlayPlaylist" />
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
