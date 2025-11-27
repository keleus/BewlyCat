<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

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
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_player_settings')">
      <SettingsItem :title="$t('settings.video_default_player_mode')">
        <Select v-model="settings.defaultVideoPlayerMode" :options="videoPlayerModeOptions" w="full" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.keep_collection_video_default_mode')"
        :desc="t('settings.keep_collection_video_default_mode_desc')"
      >
        <Radio v-model="settings.keepCollectionVideoDefaultMode" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.video_player_scroll')"
        :desc="t('settings.video_player_scroll_desc')"
      >
        <Radio v-model="settings.videoPlayerScroll" />
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

    <SettingsItemGroup :title="t('settings.group_player_components')">
      <SettingsItem
        :title="t('settings.video_danmaku_default_state')"
        :desc="t('settings.video_danmaku_default_state_desc')"
      >
        <Select v-model="settings.defaultDanmakuState" :options="videoDanmakuDefaultStateOptions" w="full" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.remember_playback_rate')"
        :desc="t('settings.remember_playback_rate_desc')"
      >
        <Radio v-model="settings.rememberPlaybackRate" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.enlarge_favorite_dialog')"
        :desc="t('settings.enlarge_favorite_dialog_desc')"
      >
        <Radio v-model="settings.enlargeFavoriteDialog" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.external_watch_later_button')"
        :desc="t('settings.external_watch_later_button_desc')"
      >
        <Radio v-model="settings.externalWatchLaterButton" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
