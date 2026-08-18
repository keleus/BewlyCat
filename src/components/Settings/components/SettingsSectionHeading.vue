<script setup lang="ts">
defineProps<{
  title: string
  desc?: string
  icon?: string
  warning?: boolean
  badge?: string
}>()
</script>

<template>
  <header
    class="settings-section-heading"
    :data-settings-title="title"
  >
    <span v-if="icon" class="settings-section-heading__icon" :class="icon" />
    <span class="settings-section-heading__content">
      <h2>
        {{ title }}
        <span v-if="badge" class="settings-risk-badge bew-warning-badge">{{ badge }}</span>
      </h2>
      <p v-if="desc" :class="{ warning }">{{ desc }}</p>
    </span>
  </header>
</template>

<style lang="scss" scoped>
.settings-section-heading {
  display: flex;
  gap: var(--bew-space-3);
  align-items: center;
  margin-bottom: var(--bew-space-4);
  padding: 0 var(--bew-space-0-5);
}

.settings-section-heading__icon {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  color: var(--bew-theme-color);
  font-size: var(--bew-icon-size-lg);
}

.settings-section-heading__content {
  min-width: 0;
}

h2 {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  transition: color var(--bew-duration-normal) var(--bew-ease-standard);
}

.settings-risk-badge {
  margin-left: var(--bew-space-2);
  vertical-align: middle;
}

p {
  margin-top: var(--bew-space-1);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}

p.warning {
  color: var(--bew-warning-color);
}
</style>
