<script setup lang="ts" generic="T extends string">
defineProps<{
  modelValue: T
  options: readonly { label: string, value: T }[]
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T]
  'change': [value: T]
}>()

function selectOption(value: T) {
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<template>
  <div
    class="settings-segmented-control"
    role="radiogroup"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="settings-segmented-control__option"
      :class="{ 'is-selected': modelValue === option.value }"
      role="radio"
      :aria-checked="modelValue === option.value"
      @click="selectOption(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.settings-segmented-control {
  display: grid;
  width: 300px;
  max-width: 100%;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 0.25rem;
  border-radius: var(--bew-radius);
  background: var(--bew-fill-1);
}

.settings-segmented-control__option {
  min-width: 0;
  padding: 0.25rem 0.5rem;
  overflow: hidden;
  border: 0;
  border-radius: var(--bew-radius);
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 0.18s ease,
    background-color 0.18s ease;
}

.settings-segmented-control__option:hover:not(.is-selected) {
  background: var(--bew-fill-2);
}

.settings-segmented-control__option.is-selected {
  color: white;
  background: var(--bew-theme-color);
}

.settings-segmented-control__option:focus-visible {
  box-shadow: inset 0 0 0 1px currentColor;
  outline: 0;
}
</style>
