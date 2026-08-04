<script setup lang="ts">
import SettingsCategoryLayout from '../components/SettingsCategoryLayout.vue'

const pages = [
  {
    value: 'player',
    titleKey: 'settings.bilibili_features.video_playback',
    descriptionKey: 'settings.category_playback_player_desc',
    icon: 'i-mingcute:play-circle-line',
    iconActivated: 'i-mingcute:play-circle-fill',
    component: defineAsyncComponent(() => import('../BilibiliFeaturesEnhancement/VideoPlayback/VideoPlayback.vue')),
  },
  {
    value: 'auto-play',
    titleKey: 'settings.bilibili_features.auto_play',
    descriptionKey: 'settings.category_playback_autoplay_desc',
    icon: 'i-mingcute:list-check-line',
    iconActivated: 'i-mingcute:list-check-fill',
    component: defineAsyncComponent(() => import('../BilibiliFeaturesEnhancement/AutoPlay/AutoPlay.vue')),
  },
]
</script>

<template>
  <SettingsCategoryLayout :pages="pages" storage-key="bewly-settings-playback-page" />
</template>
