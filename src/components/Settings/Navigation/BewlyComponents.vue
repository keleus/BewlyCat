<script setup lang="ts">
import SettingsCategoryLayout from '../components/SettingsCategoryLayout.vue'

const storageKey = 'bewly-settings-bewly-components-page'
const legacyStorageKey = 'bewly-settings-navigation-page'
const pageValues = ['video-card', 'topbar', 'dock']
const legacyPage = sessionStorage.getItem(legacyStorageKey)

if (!sessionStorage.getItem(storageKey) && legacyPage && pageValues.includes(legacyPage))
  sessionStorage.setItem(storageKey, legacyPage)

const pages = [
  {
    value: 'video-card',
    titleKey: 'settings.plugin.video_card',
    descriptionKey: 'settings.category_browsing_video_card_desc',
    icon: 'i-mingcute:video-camera-line',
    iconActivated: 'i-mingcute:video-camera-fill',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/VideoCard/VideoCard.vue')),
  },
  {
    value: 'topbar',
    titleKey: 'settings.plugin.topbar',
    descriptionKey: 'settings.category_navigation_topbar_desc',
    icon: 'i-mingcute:layout-top-line',
    iconActivated: 'i-mingcute:layout-top-fill',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/TopBar/TopBar.vue')),
  },
  {
    value: 'dock',
    titleKey: 'settings.plugin.dock_and_sidebar',
    descriptionKey: 'settings.category_navigation_dock_desc',
    icon: 'i-mingcute:navigation-line',
    iconActivated: 'i-mingcute:navigation-fill',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/DockAndSidebar/DockAndSidebar.vue')),
  },
]
</script>

<template>
  <SettingsCategoryLayout :pages="pages" :storage-key="storageKey" />
</template>
