<script setup lang="ts">
import { settings } from '~/logic'

const favoritesPage = computed(() => settings.value.useFavoritesNewLayout
  ? defineAsyncComponent(() => import('./FavoritesNew.vue'))
  : defineAsyncComponent(() => import('./FavoritesOld.vue')))
</script>

<template>
  <Component :is="favoritesPage" />
</template>
