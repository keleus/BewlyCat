<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import type { CollectedSeasonPlayAllMode } from '~/logic/storage'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()

const collectedSeasonPlayAllModeOptions = computed(() => [
  {
    label: t('settings.collected_season_play_all_mode_beginning'),
    value: 'beginning' satisfies CollectedSeasonPlayAllMode,
  },
  {
    label: t('settings.collected_season_play_all_mode_latest'),
    value: 'latest' satisfies CollectedSeasonPlayAllMode,
  },
  {
    label: t('settings.collected_season_play_all_mode_last_watched'),
    value: 'lastWatched' satisfies CollectedSeasonPlayAllMode,
  },
])
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
    <SettingsItem
      :title="$t('settings.collected_season_play_all_mode')"
      :desc="$t('settings.collected_season_play_all_mode_desc')"
      right-width="auto"
    >
      <Select
        v-model="settings.collectedSeasonPlayAllMode"
        :options="collectedSeasonPlayAllModeOptions"
        w="180px"
      />
    </SettingsItem>
  </SettingsItemGroup>
</template>
