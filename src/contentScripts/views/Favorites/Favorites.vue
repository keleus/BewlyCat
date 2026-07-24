<script setup lang="ts">
import { settings } from '~/logic'

const FavoritesNewPage = defineAsyncComponent(() => import('./FavoritesNew.vue'))
const FavoritesOldPage = defineAsyncComponent(() => import('./FavoritesOld.vue'))

const favoritesPage = computed(() => settings.value.useFavoritesNewLayout
  ? FavoritesNewPage
  : FavoritesOldPage)
</script>

<template>
  <Component :is="favoritesPage" />
</template>
