<script setup lang="ts">
import { settings } from '~/logic'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import TopBarLogo from './TopBarLogo.vue'
import TopBarRight from './TopBarRight.vue'
import TopBarSearch from './TopBarSearch.vue'

defineProps<{
  reachTop: boolean
  isDark: boolean
}>()

const { forceWhiteIcon, handleNotificationsItemClick } = useTopBarInteraction()
</script>

<template>
  <main
    max-w="$bew-page-max-width"
    flex="~ justify-between items-center gap-4"
    p="x-12" m-auto
    h="$bew-top-bar-height"
  >
    <!-- Top bar mask -->
    <div
      v-if="!reachTop"
      style="
        mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1), rgba(0, 0, 0, 1) 24px, rgba(0, 0, 0, 0.9) 44px, transparent);
      "
      :style="{ backdropFilter: settings.disableFrostedGlass ? 'none' : 'blur(12px)' }"
      pos="absolute top-0 left-0" w-full h="$bew-top-bar-height"
      pointer-events-none transform-gpu
    />

    <div
      pos="absolute top-0 left-0" w-full
      pointer-events-none opacity-100 duration-300
      :style="{
        background: `linear-gradient(to bottom, ${
          forceWhiteIcon
            ? 'rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.4) calc(var(--bew-top-bar-height) / 2)'
            : 'color-mix(in oklab, var(--bew-bg), transparent 20%), color-mix(in oklab, var(--bew-bg), transparent 40%) calc(var(--bew-top-bar-height) / 2)'
        }, transparent)`,
        opacity: reachTop ? 0.8 : 1,
        height: 'var(--bew-top-bar-height)',
      }"
    />

    <!-- Top bar theme color gradient -->
    <Transition name="fade">
      <div
        v-if="settings.showTopBarThemeColorGradient && !forceWhiteIcon && reachTop && isDark"
        pos="absolute top-0 left-0" w-full h="$bew-top-bar-height" pointer-events-none
        :style="{ background: 'linear-gradient(to bottom, var(--bew-theme-color-10), transparent)' }"
      />
    </Transition>

    <TopBarLogo :force-white-icon="forceWhiteIcon" />

    <!-- search bar -->
    <TopBarSearch />

    <!-- right content -->
    <TopBarRight
      @notifications-click="handleNotificationsItemClick"
    />
  </main>
</template>
