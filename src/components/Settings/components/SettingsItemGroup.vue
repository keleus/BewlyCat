<script setup lang="ts">
defineProps<{
  title?: string
  desc?: string
  warningDesc?: boolean
  icon?: string
}>()
</script>

<template>
  <div class="b-settings-item-group" :data-settings-title="title">
    <template v-if="title || desc">
      <p class="group-title" text="$bew-text-1">
        <i v-if="icon" :class="icon" />
        {{ title }}
      </p>
      <p v-if="desc" class="group-desc" text="$bew-text-2" :class="{ 'warning-desc': warningDesc }">
        {{ desc }}
      </p>
    </template>

    <main
      style="box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);"
      mt-2 px-4 mx--4 rounded="$bew-radius"
      bg="$bew-fill-alt"
      shadow="$bew-shadow-edge-glow-1"
    >
      <slot />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.b-settings-item-group + .b-settings-item-group {
  --uno: "mt-6";
}

.group-title {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-2);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-bold);
  line-height: var(--bew-line-height-body);
}

.group-desc {
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.group-title > i {
  color: var(--bew-theme-color);
  font-size: var(--bew-icon-size-md);
}

.warning-desc {
  color: var(--bew-warning-color);
}
</style>
