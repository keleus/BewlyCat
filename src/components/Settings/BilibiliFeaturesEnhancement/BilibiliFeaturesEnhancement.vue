<script setup lang="ts">
import SettingsCategoryLayout from '../components/SettingsCategoryLayout.vue'

const storageKey = 'bewly-settings-bilibili-page'
const legacyStorageKey = 'bewly-settings-playback-page'
const bilibiliPageValues = ['player', 'auto-play']
const legacyPage = sessionStorage.getItem(legacyStorageKey)

if (!sessionStorage.getItem(storageKey) && legacyPage && bilibiliPageValues.includes(legacyPage))
  sessionStorage.setItem(storageKey, legacyPage)

const pages = [
  {
    value: 'player',
    titleKey: 'settings.bilibili_features.video_playback',
    descriptionKey: 'settings.category_playback_player_desc',
    icon: 'i-mingcute:play-circle-line',
    iconActivated: 'i-mingcute:play-circle-fill',
    component: defineAsyncComponent(() => import('./VideoPlayback/VideoPlayback.vue')),
  },
  {
    value: 'listen-video',
    titleKey: 'settings.bilibili_features.listen_video',
    descriptionKey: 'settings.category_bilibili_listen_video_desc',
    icon: 'i-mingcute:headphone-line',
    iconActivated: 'i-mingcute:headphone-fill',
    component: defineAsyncComponent(() => import('./ListenVideo/ListenVideo.vue')),
  },
  {
    value: 'volume-balance',
    titleKey: 'settings.bilibili_features.volume_balance',
    descriptionKey: 'settings.category_bilibili_volume_balance_desc',
    icon: 'i-mingcute:volume-line',
    iconActivated: 'i-mingcute:volume-fill',
    component: defineAsyncComponent(() => import('./VolumeBalance/VolumeBalance.vue')),
  },
  {
    value: 'ambilight',
    titleKey: 'settings.bilibili_features.ambilight',
    descriptionKey: 'settings.category_bilibili_ambilight_desc',
    icon: 'i-mingcute:light-line',
    iconActivated: 'i-mingcute:light-fill',
    component: defineAsyncComponent(() => import('./Ambilight/Ambilight.vue')),
  },
  {
    value: 'auto-play',
    titleKey: 'settings.bilibili_features.auto_play',
    descriptionKey: 'settings.category_playback_autoplay_desc',
    icon: 'i-mingcute:list-check-line',
    iconActivated: 'i-mingcute:list-check-fill',
    component: defineAsyncComponent(() => import('./AutoPlay/AutoPlay.vue')),
  },
  {
    value: 'comments',
    titleKey: 'settings.bilibili_features.comments',
    descriptionKey: 'settings.category_bilibili_comments_desc',
    icon: 'i-mingcute:comment-line',
    iconActivated: 'i-mingcute:comment-fill',
    component: defineAsyncComponent(() => import('./Comments/Comments.vue')),
  },
  {
    value: 'vip-features',
    titleKey: 'settings.bilibili_features.vip_features',
    descriptionKey: 'settings.category_bilibili_vip_desc',
    icon: 'i-mingcute:vip-1-line',
    iconActivated: 'i-mingcute:vip-1-fill',
    component: defineAsyncComponent(() => import('./VipFeatures/VipFeatures.vue')),
  },
  {
    value: 'compatibility',
    titleKey: 'settings.menu_compatibility',
    descriptionKey: 'settings.category_advanced_compatibility_desc',
    icon: 'i-mingcute:polygon-line',
    iconActivated: 'i-mingcute:polygon-fill',
    component: defineAsyncComponent(() => import('../Compatibility/Compatibility.vue')),
  },
]
</script>

<template>
  <SettingsCategoryLayout :pages="pages" :storage-key="storageKey" />
</template>
