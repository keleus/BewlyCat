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
    class="settings-segmented-control bew-segment-control bew-segment-control--solid bew-segment-control--static"
    role="radiogroup"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="settings-segmented-control__option bew-segment-control__item"
      :class="{ 'is-selected': modelValue === option.value }"
      :data-active="modelValue === option.value ? 'true' : undefined"
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
}

.settings-segmented-control__option {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
