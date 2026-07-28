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
  padding: var(--bew-space-0-5) 0 var(--bew-space-2);
}

.subgroup-title {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-body);
}

.subgroup-desc {
  margin-top: var(--bew-space-0-5);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.subgroup-content {
  margin-top: var(--bew-space-1);

  :deep(.b-settings-item) {
    padding: var(--bew-space-3) 0;
  }
}
</style>
