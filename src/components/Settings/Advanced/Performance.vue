<script setup lang="ts">
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
</script>

<template>
  <SettingsItemGroup :title="$t('settings.advanced_performance.home_grid')">
    <SettingsItem
      :title="$t('settings.advanced_performance.release_offscreen_images')"
      :badge="$t('settings.badge_use_with_caution')"
      right-width="auto"
    >
      <template #desc>
        <span>{{ $t('settings.advanced_performance.release_offscreen_images_desc') }}</span>
        <span block class="bew-warning-text">
          {{ $t('settings.advanced_performance.release_offscreen_images_warning') }}
        </span>
      </template>
      <Radio v-model="settings.releaseOffscreenVideoCardImages" />
    </SettingsItem>

    <SettingsItem
      :title="$t('settings.advanced_performance.virtualize_home_grid')"
      :badge="$t('settings.badge_use_with_caution')"
      right-width="auto"
    >
      <template #desc>
        <span>{{ $t('settings.advanced_performance.virtualize_home_grid_desc') }}</span>
        <span block class="bew-warning-text">
          {{ $t('settings.advanced_performance.virtualize_home_grid_warning') }}
        </span>
      </template>
      <Radio v-model="settings.enableHomeGridVirtualization" />
    </SettingsItem>
  </SettingsItemGroup>
</template>
