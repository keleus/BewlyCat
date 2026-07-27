<script setup lang="ts">
const props = defineProps<{
  label: string
  description?: string
  icon: string
  inverted?: boolean
  showStateIcon?: boolean
}>()

const model = defineModel<boolean>({ required: true })
const active = computed(() => props.inverted ? !model.value : model.value)

function toggle() {
  model.value = !model.value
}
</script>

<template>
  <button
    type="button"
    class="settings-toggle-tag"
    :class="{ 'is-active': active }"
    :data-settings-title="label"
    :aria-pressed="active"
    :aria-label="description ? `${label}：${description}` : label"
    :title="description"
    @click="toggle"
  >
    <span :class="icon" />
    <span>{{ label }}</span>
    <span
      v-if="showStateIcon !== false"
      class="settings-toggle-tag__state"
      :class="active ? 'i-tabler-eye' : 'i-tabler-eye-off'"
    />
  </button>
</template>

<style scoped lang="scss">
.settings-toggle-tag {
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
    background-color 0.18s ease;
}

.settings-toggle-tag:hover {
  color: var(--bew-text-2);
  background: var(--bew-fill-2);
}

.settings-toggle-tag:focus-visible {
  box-shadow: inset 0 0 0 1px currentColor;
  outline: 0;
}

.settings-toggle-tag.is-active {
  border-color: var(--bew-theme-color-30);
  color: var(--bew-theme-color);
  background: color-mix(in oklab, var(--bew-theme-color-20), transparent 28%);
}

.settings-toggle-tag.is-active:hover {
  border-color: var(--bew-theme-color);
  color: var(--bew-theme-color);
  background: color-mix(in oklab, var(--bew-theme-color-20), transparent 10%);
}

.settings-toggle-tag__state {
  margin-left: 1px;
  font-size: 14px;
}
</style>
