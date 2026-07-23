<script setup lang="ts">
import SettingsCategoryLayout from '../components/SettingsCategoryLayout.vue'

const pages = [
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
