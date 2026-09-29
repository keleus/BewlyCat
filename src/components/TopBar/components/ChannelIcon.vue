<script setup lang="ts">
defineProps<{ icon: string, color?: string }>()
</script>

<template>
  <span class="channel-icon" aria-hidden="true">
    <svg v-if="icon.startsWith('#')"><use :xlink:href="icon" /></svg>
    <i v-else :class="icon" :style="{ color }" />
  </span>
</template>

<style scoped lang="scss">
.channel-icon {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);

  svg {
    width: 100%;
    height: 100%;
    fill: currentColor;
  }
  i {
    font-size: var(--bew-control-icon-size);
  }
}
</style>
