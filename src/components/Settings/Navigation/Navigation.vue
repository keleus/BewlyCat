<script setup lang="ts">
import SettingsCategoryLayout from '../components/SettingsCategoryLayout.vue'

const pages = [
  {
    value: 'home',
    titleKey: 'settings.plugin.home',
    descriptionKey: 'settings.category_browsing_home_desc',
    icon: 'i-mingcute:home-5-line',
    iconActivated: 'i-mingcute:home-5-fill',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/Home/Home.vue')),
  },
  {
    value: 'video-card',
    titleKey: 'settings.plugin.video_card',
    descriptionKey: 'settings.category_browsing_video_card_desc',
    icon: 'i-mingcute:video-camera-line',
    iconActivated: 'i-mingcute:video-camera-fill',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/VideoCard/VideoCard.vue')),
  },
  {
    value: 'link-opening',
    titleKey: 'settings.group_link_opening_behavior',
    descriptionKey: 'settings.category_navigation_link_opening_desc',
    icon: 'i-mingcute:external-link-line',
    iconActivated: 'i-mingcute:external-link-line',
    component: defineAsyncComponent(() => import('./LinkOpening.vue')),
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
  {
    value: 'search',
    titleKey: 'settings.plugin.search',
    descriptionKey: 'settings.category_navigation_search_desc',
    icon: 'i-mingcute:search-2-line',
    iconActivated: 'i-mingcute:search-2-fill',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/SearchPage/SearchPage.vue')),
  },
]
</script>

<template>
  <SettingsCategoryLayout :pages="pages" storage-key="bewly-settings-navigation-page" />
</template>
