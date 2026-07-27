<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import type { AutoPlayMode } from '~/logic/storage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsItemSubgroup from '../../components/SettingsItemSubgroup.vue'

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
        right-width="auto"
      >
        <Radio v-model="settings.useBilibiliDefaultAutoPlay" />
      </SettingsItem>

      <SettingsItemSubgroup
        v-if="!settings.useBilibiliDefaultAutoPlay"
        :title="t('settings.group_custom_auto_play_behavior')"
        :desc="t('settings.group_custom_auto_play_behavior_desc')"
      >
        <SettingsItem
          :title="t('settings.auto_play_multipart')"
          right-width="auto"
        >
          <Select
            v-model="settings.autoPlayMultipart"
            :options="autoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="160px"
          />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.auto_play_collection')"
          right-width="auto"
        >
          <Select
            v-model="settings.autoPlayCollection"
            :options="autoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="160px"
          />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.auto_play_recommend')"
          right-width="auto"
        >
          <Select
            v-model="settings.autoPlayRecommend"
            :options="autoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="160px"
          />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.auto_play_playlist')"
          right-width="auto"
        >
          <Select
            v-model="settings.autoPlayPlaylist"
            :options="autoPlayModes.map(m => ({ label: $t(`settings.${m.label}`), value: m.value }))"
            w="160px"
          />
        </SettingsItem>
      </SettingsItemSubgroup>
    </SettingsItemGroup>

    <SettingsItemGroup :title="t('settings.group_random_play')">
      <SettingsItem
        :title="t('settings.enable_random_play')"
        :desc="t('settings.enable_random_play_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.enableRandomPlay" />
      </SettingsItem>

      <SettingsItemSubgroup
        v-if="settings.enableRandomPlay"
        :title="t('settings.group_random_play_options')"
        :desc="t('settings.group_random_play_options_desc')"
      >
        <SettingsItem
          :title="t('settings.random_play_mode')"
          right-width="auto"
        >
          <Select v-model="settings.randomPlayMode" :options="randomPlayModeOptions" w="160px" />
        </SettingsItem>

        <SettingsItem
          :title="t('settings.min_videos_for_random')"
          right-width="auto"
        >
          <Input
            v-model="settings.minVideosForRandom"
            type="number"
            w="120px"
          />
        </SettingsItem>
      </SettingsItemSubgroup>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
