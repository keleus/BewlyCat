<script setup lang="ts" generic="T extends string">
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'

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
    class="settings-segmented-control bew-segment-control bew-segment-control--solid"
    role="radiogroup"
    :aria-label="label"
    :style="{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }"
  >
    <LiquidSegmentIndicator :active-key="modelValue" />

    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="settings-segmented-control__option bew-segment-control__item"
      :class="{ 'is-selected': modelValue === option.value }"
      data-segment-item
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
}

.settings-segmented-control__option {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
