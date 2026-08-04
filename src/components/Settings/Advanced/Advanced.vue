<script setup lang="ts">
import SettingsSectionHeading from '../components/SettingsSectionHeading.vue'

const Compatibility = defineAsyncComponent(() => import('../Compatibility/Compatibility.vue'))
const Maintenance = defineAsyncComponent(() => import('./Maintenance.vue'))
</script>

<template>
  <div class="combined-settings-page">
    <section>
      <SettingsSectionHeading
        :title="$t('settings.menu_compatibility')"
        :desc="$t('settings.category_advanced_compatibility_desc')"
        icon="i-mingcute:polygon-fill"
      />
      <Compatibility />
    </section>

    <section>
      <SettingsSectionHeading
        :title="$t('settings.maintenance.title')"
        :desc="$t('settings.category_advanced_maintenance_desc')"
        icon="i-mingcute:save-2-fill"
      />
      <Maintenance />
    </section>
  </div>
</template>

<style scoped>
.combined-settings-page {
  display: flex;
  flex-direction: column;
  gap: 36px;
}
</style>
