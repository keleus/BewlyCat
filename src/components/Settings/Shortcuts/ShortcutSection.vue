<script setup lang="ts">
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

defineProps<{
  title: string
  defaultOpen?: boolean
}>()
</script>

<template>
  <details class="shortcuts-group" :open="defaultOpen" :data-settings-title="title">
    <summary>{{ title }}</summary>
    <SettingsItemGroup>
      <slot />
    </SettingsItemGroup>
  </details>
</template>

<style lang="scss" scoped>
.shortcuts-group {
  margin-top: var(--bew-space-6);

  summary {
    display: flex;
    align-items: center;
    gap: var(--bew-space-2);
    min-height: var(--bew-space-6);
    color: var(--bew-text-1);
    cursor: pointer;
    font-size: var(--bew-font-size-body);
    font-weight: var(--bew-font-weight-bold);
    line-height: var(--bew-line-height-body);
    list-style: none;
    border-radius: var(--bew-interactive-radius);

    &::-webkit-details-marker {
      display: none;
    }

    &::before {
      content: "›";
    }

    &:hover {
      color: var(--bew-theme-color);
    }

    &:focus-visible {
      outline: 2px solid var(--bew-theme-color);
      outline-offset: 2px;
    }
  }

  &[open] > summary::before {
    transform: rotate(90deg);
  }
}
</style>
