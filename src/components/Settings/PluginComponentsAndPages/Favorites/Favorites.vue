<script setup lang="ts">
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
</script>

<template>
  <SettingsItemGroup :title="$t('settings.group_favorites')">
    <SettingsItem
      :title="$t('settings.use_favorites_new_layout')"
      :desc="$t('settings.use_favorites_new_layout_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.useFavoritesNewLayout" />
    </SettingsItem>
  </SettingsItemGroup>
</template>
