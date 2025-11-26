<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const { t } = useI18n()
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.menu_changelog')">
      <div text="sm $bew-text-2" p-4 space-y-4>
        <p>{{ t('settings.changelog_placeholder') }}</p>
      </div>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
