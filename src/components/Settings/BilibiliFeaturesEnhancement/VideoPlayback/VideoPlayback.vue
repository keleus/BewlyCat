<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import type { PlayerDefaultState, VideoPlayerModeContext } from '~/logic/storage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsItemSubgroup from '../../components/SettingsItemSubgroup.vue'
import SettingsToggleTag from '../../components/SettingsToggleTag.vue'

const { t } = useI18n()

const bewlyWidescreenSidebarPositionOptions = computed(() => {
  return [
    {
      label: t('settings.video_player_mode.bewly_widescreen_sidebar_position_left'),
      value: 'left',
    },
    {
      label: t('settings.video_player_mode.bewly_widescreen_sidebar_position_right'),
      value: 'right',
    },
  ]
})

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
    {
      label: t('settings.video_player_mode.bewly_widescreen'),
      value: 'bewlyWidescreen',
    },
  ]
})

const videoPlayerModeOverrideOptions = computed(() => [
  {
    label: t('settings.video_player_mode.inherit'),
    value: 'inherit',
  },
  ...videoPlayerModeOptions.value,
])

const videoPlayerModeContextOptions = computed<{ label: string, value: VideoPlayerModeContext }[]>(() => [
  { label: t('settings.video_player_mode.context_multipart'), value: 'multipart' },
  { label: t('settings.video_player_mode.context_collection'), value: 'collection' },
  { label: t('settings.video_player_mode.context_bangumi'), value: 'bangumi' },
  { label: t('settings.video_player_mode.context_watch_later'), value: 'watchLater' },
  { label: t('settings.video_player_mode.context_playlist'), value: 'playlist' },
])

const usesBewlyWidescreen = computed(() => settings.value.defaultVideoPlayerMode === 'bewlyWidescreen'
  || (settings.value.enableVideoPlayerModeOverrides
    && Object.values(settings.value.videoPlayerModeOverrides).includes('bewlyWidescreen')))

type ToggleSetting
  = | 'rememberPlaybackRate'
    | 'rememberVideoAspectRatio'

interface ToggleTagOption {
  setting: ToggleSetting
  label: string
  icon: string
}

const playbackMemoryOptions = computed<ToggleTagOption[]>(() => [
  { setting: 'rememberPlaybackRate', label: t('settings.remember_playback_rate'), icon: 'i-tabler-gauge' },
  { setting: 'rememberVideoAspectRatio', label: t('settings.remember_video_aspect_ratio'), icon: 'i-tabler-aspect-ratio' },
])

const playerDefaultStateOptions = computed<{ label: string, value: PlayerDefaultState }[]>(() => [
  { label: t('settings.video_default_state_opt.system'), value: 'system' },
  { label: t('settings.video_default_state_opt.remember'), value: 'remember' },
  { label: t('settings.video_default_state_opt.on'), value: 'on' },
  { label: t('settings.video_default_state_opt.off'), value: 'off' },
])
</script>

<template>
  <div>
    <SettingsItemGroup
      :title="t('settings.group_player_display_mode')"
      :desc="t('settings.group_player_display_mode_desc')"
    >
      <SettingsItem :title="$t('settings.video_default_player_mode')" right-width="auto">
        <Select v-model="settings.defaultVideoPlayerMode" :options="videoPlayerModeOptions" w="160px" />
      </SettingsItem>

      <SettingsItem
        v-if="usesBewlyWidescreen"
        :title="t('settings.video_player_mode.bewly_widescreen_sidebar_position')"
        right-width="auto"
      >
        <Select v-model="settings.bewlyWidescreenSidebarPosition" :options="bewlyWidescreenSidebarPositionOptions" w="160px" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.video_player_scroll')"
        right-width="auto"
      >
        <Radio v-model="settings.videoPlayerScroll" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.auto_exit_fullscreen_on_end')"
        :desc="t('settings.auto_exit_fullscreen_on_end_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.autoExitFullscreenOnEnd" />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.video_player_mode.enable_overrides')"
        :desc="t('settings.video_player_mode.enable_overrides_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.enableVideoPlayerModeOverrides" />
      </SettingsItem>

      <SettingsItemSubgroup
        v-if="settings.enableVideoPlayerModeOverrides"
        :title="t('settings.video_player_mode.overrides')"
        :desc="t('settings.video_player_mode.overrides_desc')"
      >
        <SettingsItem
          v-for="context in videoPlayerModeContextOptions"
          :key="context.value"
          :title="context.label"
          right-width="auto"
        >
          <Select
            v-model="settings.videoPlayerModeOverrides[context.value]"
            :options="videoPlayerModeOverrideOptions"
            w="160px"
          />
        </SettingsItem>
      </SettingsItemSubgroup>
    </SettingsItemGroup>

    <SettingsItemGroup :title="t('settings.group_player_components')">
      <SettingsItem
        :title="t('settings.video_danmaku_default_state')"
        right-width="auto"
      >
        <Select
          v-model="settings.defaultDanmakuState"
          :options="playerDefaultStateOptions"
          w="180px"
        />
      </SettingsItem>

      <SettingsItem
        :title="t('settings.video_caption_default_state')"
        right-width="auto"
      >
        <Select
          v-model="settings.defaultCaptionState"
          :options="playerDefaultStateOptions"
          w="180px"
        />
      </SettingsItem>

      <SettingsItemSubgroup
        :title="t('settings.group_playback_memory')"
        :desc="t('settings.group_playback_memory_desc')"
      >
        <div class="video-setting-tags" role="group" :aria-label="t('settings.group_playback_memory')">
          <SettingsToggleTag
            v-for="option in playbackMemoryOptions"
            :key="option.setting"
            v-model="settings[option.setting]"
            :label="option.label"
            :icon="option.icon"
            :show-state-icon="false"
          />
        </div>
      </SettingsItemSubgroup>

      <SettingsItemSubgroup
        :title="t('settings.group_video_page_actions')"
        :desc="t('settings.group_video_page_actions_desc')"
      >
        <SettingsItem
          :title="t('settings.enlarge_favorite_dialog')"
          :desc="t('settings.enlarge_favorite_dialog_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.enlargeFavoriteDialog" />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.external_watch_later_button')"
          :desc="t('settings.external_watch_later_button_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.externalWatchLaterButton" />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.show_vertical_video_zoom_button')"
          :desc="t('settings.show_vertical_video_zoom_button_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.showVerticalVideoZoomButton" />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.show_video_screenshot_button')"
          :desc="t('settings.show_video_screenshot_button_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.showVideoScreenshotButton" />
        </SettingsItem>
      </SettingsItemSubgroup>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.video-setting-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0.25rem 0 0.5rem;
}
</style>
