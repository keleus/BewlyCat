<script setup lang="ts">
defineProps<{
  title: string
  desc?: string
}>()
</script>

<template>
  <section class="settings-item-subgroup" :data-settings-title="title">
    <header class="subgroup-heading">
      <div class="subgroup-title">
        {{ title }}
      </div>
      <div v-if="desc" class="subgroup-desc">
        {{ desc }}
      </div>
    </header>

    <div class="subgroup-content">
      <slot />
    </div>
  </section>
</template>

<style lang="scss" scoped>
.settings-item-subgroup {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0.75rem 0;
  border-top: 1px solid var(--bew-border-color);
}

.settings-item-subgroup:first-child {
  border-top: 0;
}

.subgroup-heading {
  width: 100%;
  min-width: 0;
  padding: 0.125rem 0 0.5rem;
}

.subgroup-title {
  color: var(--bew-text-1);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
}

.subgroup-desc {
  margin-top: 0.125rem;
  color: var(--bew-text-3);
  font-size: 0.75rem;
  line-height: 1.5;
}

.subgroup-content {
  margin-top: 0.25rem;

  :deep(.b-settings-item) {
    padding: 0.75rem 0;
  }
}
</style>
