<script setup lang="ts">
defineProps<{
  visible: boolean
  label: string
  icon: string
}>()

defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    type="button"
    class="settings-visibility-tag"
    :class="{ 'is-visible': visible }"
    :aria-pressed="visible"
    @click="$emit('toggle')"
  >
    <span :class="icon" />
    <span>{{ label }}</span>
    <span
      class="settings-visibility-tag__state"
      :class="visible ? 'i-tabler-eye' : 'i-tabler-eye-off'"
    />
  </button>
</template>

<style scoped lang="scss">
.settings-visibility-tag {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 7px;
  padding: 7px 11px;
  border: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 32%);
  border-radius: 999px;
  color: var(--bew-text-3);
  background: var(--bew-fill-1);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition:
    color 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease,
    transform 0.18s ease;
}

.settings-visibility-tag:hover {
  color: var(--bew-text-2);
  background: var(--bew-fill-2);
  transform: translateY(-1px);
}

.settings-visibility-tag:active {
  transform: scale(0.97);
}

.settings-visibility-tag:focus-visible {
  outline: 2px solid var(--bew-theme-color-40);
  outline-offset: 2px;
}

.settings-visibility-tag.is-visible {
  border-color: var(--bew-theme-color-30);
  color: var(--bew-theme-color);
  background: color-mix(in oklab, var(--bew-theme-color-20), transparent 28%);
}

.settings-visibility-tag.is-visible:hover {
  border-color: var(--bew-theme-color);
  color: var(--bew-theme-color);
  background: color-mix(in oklab, var(--bew-theme-color-20), transparent 10%);
}

.settings-visibility-tag__state {
  margin-left: 1px;
  font-size: 14px;
}
</style>
