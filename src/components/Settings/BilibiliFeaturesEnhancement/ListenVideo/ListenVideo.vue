<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()

const listenVideoCoverShapeOptions = computed(() => {
  return [
    { label: t('settings.listen_video_cover_shape_circle'), value: 'circle' },
    { label: t('settings.listen_video_cover_shape_square'), value: 'square' },
    { label: t('settings.listen_video_cover_shape_rectangle'), value: 'rectangle' },
  ]
})

const listenVideoGlowOptions = computed(() => {
  return [
    { label: t('settings.listen_video_glow_none'), value: 'none' },
    { label: t('settings.listen_video_glow_static'), value: 'static' },
    { label: t('settings.listen_video_glow_breathe'), value: 'breathe' },
  ]
})

const listenVideoGlowColorOptions = computed(() => {
  return [
    { label: t('settings.listen_video_glow_color_theme'), value: 'theme' },
    { label: t('settings.listen_video_glow_color_cover'), value: 'cover' },
  ]
})

const listenVideoBackgroundOptions = computed(() => {
  return [
    { label: t('settings.listen_video_background_solid'), value: 'solid' },
    { label: t('settings.listen_video_background_blur'), value: 'blur' },
  ]
})
</script>

<template>
  <SettingsItemGroup :title="t('settings.bilibili_features.listen_video')">
    <SettingsItem
      :title="t('settings.enable_listen_video')"
      :desc="t('settings.enable_listen_video_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.enableListenVideo" />
    </SettingsItem>

    <SettingsItem
      v-if="settings.enableListenVideo"
      :title="t('settings.show_listen_video_button')"
      :desc="t('settings.show_listen_video_button_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.showListenVideoButton" />
    </SettingsItem>

    <SettingsItem
      v-if="settings.enableListenVideo"
      :title="t('settings.listen_video_cover_shape')"
      :desc="t('settings.listen_video_cover_shape_desc')"
      right-width="auto"
    >
      <Select v-model="settings.listenVideoCoverShape" :options="listenVideoCoverShapeOptions" w="160px" />
    </SettingsItem>

    <SettingsItem
      v-if="settings.enableListenVideo"
      :title="t('settings.listen_video_glow')"
      :desc="t('settings.listen_video_glow_desc')"
      right-width="auto"
    >
      <Select v-model="settings.listenVideoGlow" :options="listenVideoGlowOptions" w="160px" />
    </SettingsItem>

    <SettingsItem
      v-if="settings.enableListenVideo && settings.listenVideoGlow !== 'none'"
      :title="t('settings.listen_video_glow_color')"
      :desc="t('settings.listen_video_glow_color_desc')"
      right-width="auto"
    >
      <Select v-model="settings.listenVideoGlowColor" :options="listenVideoGlowColorOptions" w="160px" />
    </SettingsItem>

    <SettingsItem
      v-if="settings.enableListenVideo"
      :title="t('settings.listen_video_background')"
      :desc="t('settings.listen_video_background_desc')"
      right-width="auto"
    >
      <Select v-model="settings.listenVideoBackground" :options="listenVideoBackgroundOptions" w="160px" />
    </SettingsItem>
  </SettingsItemGroup>
</template>
