<script setup lang="ts">
defineProps<{
  /** 按钮的可访问性名称 */
  label: string
}>()

const emit = defineEmits<{
  dismiss: []
}>()
</script>

<template>
  <button
    type="button"
    class="mask-dismiss-btn"
    :aria-label="label"
    @click.prevent.stop="emit('dismiss')"
  >
    <i i-tabler:x aria-hidden="true" />
  </button>
</template>

<style scoped lang="scss">
.mask-dismiss-btn {
  position: absolute;
  top: var(--bew-space-2);
  right: var(--bew-space-2);
  display: grid;
  place-items: center;
  width: var(--bew-space-6);
  height: var(--bew-space-6);
  padding: 0;
  border: 0;
  border-radius: var(--bew-radius-full);
  background: rgba(255, 255, 255, 0.18);
  color: white;
  font-size: var(--bew-font-size-control);
  cursor: pointer;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    background: rgba(255, 255, 255, 0.32);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color);
    outline-offset: var(--bew-space-0-5);
  }
}
</style>
