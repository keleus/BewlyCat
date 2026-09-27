<script setup lang="ts">
defineProps<{
  title: string
  summary?: string
  defaultOpen?: boolean
}>()
</script>

<template>
  <details class="shortcuts-group" :open="defaultOpen" :data-settings-title="title">
    <summary>
      <span class="shortcuts-group-title">{{ title }}</span>
      <span v-if="summary" class="shortcuts-group-summary">{{ summary }}</span>
    </summary>
    <div class="shortcuts-group-content">
      <slot />
    </div>
  </details>
</template>

<style lang="scss" scoped>
.shortcuts-group {
  margin-block: var(--bew-space-3);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-panel-radius);

  summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--bew-space-2);
    min-height: var(--bew-space-10);
    padding: var(--bew-space-3);
    border-radius: inherit;
    cursor: pointer;
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &::before {
      content: "›";
    }

    &:hover {
      background: var(--bew-fill-1);
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

.shortcuts-group-title {
  font-weight: var(--bew-font-weight-semibold);
}

.shortcuts-group-summary {
  color: var(--bew-text-2);
}

.shortcuts-group-content {
  padding: var(--bew-space-3) var(--bew-space-4);
}
</style>
