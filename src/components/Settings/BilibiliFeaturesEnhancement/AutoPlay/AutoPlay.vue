<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import type { AutoPlayMode } from '~/logic/storage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()

// 自动播放模式选项
const autoPlayModes: { label: string, value: AutoPlayMode }[] = [
  { label: 'auto_play_mode_auto_play', value: 'autoPlay' },
  { label: 'auto_play_mode_auto_play_with_recommend', value: 'autoPlayWithRecommend' },
  { label: 'auto_play_mode_pause_at_end', value: 'pauseAtEnd' },
  { label: 'auto_play_mode_loop', value: 'loop' },
]

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
    <SettingsItemGroup :title="$t('settings.group_auto_play')">
      <SettingsItem
        :title="t('settings.use_bilibili_default_auto_play')"
        :desc="t('settings.use_bilibili_default_auto_play_desc')"
      >
        <Radio v-model="settings.useBilibiliDefaultAutoPlay" />
      </SettingsItem>

      <template v-if="!settings.useBilibiliDefaultAutoPlay">
        <SettingsItem
          :title="t('settings.auto_play_multipart')"
          :desc="t('settings.auto_play_multipart_desc')"
        >
          <Select
            v-model="settings.autoPlayMultipart"
            :options="autoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
          />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.auto_play_collection')"
          :desc="t('settings.auto_play_collection_desc')"
        >
          <Select
            v-model="settings.autoPlayCollection"
            :options="autoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
          />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.auto_play_recommend')"
          :desc="t('settings.auto_play_recommend_desc')"
        >
          <Select
            v-model="settings.autoPlayRecommend"
            :options="autoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
          />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.auto_play_playlist')"
          :desc="t('settings.auto_play_playlist_desc')"
        >
          <Select
            v-model="settings.autoPlayPlaylist"
            :options="autoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
          />
        </SettingsItem>
      </template>
    </SettingsItemGroup>

    <SettingsItemGroup :title="t('settings.group_random_play')">
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
