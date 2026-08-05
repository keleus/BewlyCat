<script setup lang="ts">
import SettingsCategoryLayout from '../components/SettingsCategoryLayout.vue'

const storageKey = 'bewly-settings-bewly-pages-page'
const legacyStorageKey = 'bewly-settings-navigation-page'
const pageValues = ['home', 'moments', 'search']
const legacyPage = sessionStorage.getItem(legacyStorageKey)

if (!sessionStorage.getItem(storageKey) && legacyPage && pageValues.includes(legacyPage))
  sessionStorage.setItem(storageKey, legacyPage)
if (!pageValues.includes(sessionStorage.getItem(storageKey) ?? ''))
  sessionStorage.setItem(storageKey, pageValues[0])

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
    value: 'moments',
    titleKey: 'settings.plugin.moments',
    descriptionKey: 'settings.category_navigation_moments_desc',
    icon: 'i-mingcute:moment-line',
    iconActivated: 'i-mingcute:moment-fill',
    component: defineAsyncComponent(() => import('../PluginComponentsAndPages/Moments/Moments.vue')),
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
  <SettingsCategoryLayout :pages="pages" :storage-key="storageKey" />
</template>
