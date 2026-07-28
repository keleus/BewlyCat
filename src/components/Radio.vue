<script lang="ts" setup>
defineProps<{
  modelValue: boolean
  label?: string
}>()

const model = defineModel()
</script>

<template>
  <label cursor="pointer" pointer="auto" flex items-center gap-3>
    <span>{{ label }}</span>
    <input v-model="model" type="checkbox" class="radio-input">
    <span class="radio-switch" aria-hidden="true" />
  </label>
</template>

<style lang="scss" scoped>
label {
  --b-switch-width: 44px;
  --b-switch-height: 24px;
  --b-switch-inset: 2px;
  --b-switch-thumb-size: 20px;
}

.radio-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.radio-switch {
  position: relative;
  display: inline-block;
  box-sizing: border-box;
  width: var(--b-switch-width);
  height: var(--b-switch-height);
  flex: 0 0 auto;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-badge-radius);

  &::after {
    --b-switch-thumb-offset: 0px;
    --b-switch-thumb-scale: 1;

    position: absolute;
    top: var(--b-switch-inset);
    left: var(--b-switch-inset);
    width: var(--b-switch-thumb-size);
    height: var(--b-switch-thumb-size);
    background: white;
    border-radius: var(--bew-badge-radius);
    content: "";
    transform: translateX(var(--b-switch-thumb-offset)) scale(var(--b-switch-thumb-scale));
  }
}

input[type="checkbox"] {
  &:focus-visible + .radio-switch {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: var(--bew-space-0-5);
  }

  &:hover + .radio-switch {
    background: var(--bew-fill-2);
  }

  &:active + .radio-switch::after {
    --b-switch-thumb-scale: 0.9;
  }

  &:checked + .radio-switch {
    background: var(--bew-theme-color-60);
    border-color: var(--bew-theme-color);
  }

  &:checked:hover + .radio-switch {
    background: var(--bew-theme-color-80);
    border-color: var(--bew-theme-color);
    box-shadow:
      0 0 6px 2px var(--bew-theme-color-40),
      inset 0 0 6px var(--bew-theme-color-30);
  }

  & + .radio-switch,
  & + .radio-switch::after {
    transition:
      transform 0.25s var(--bew-ease-emphasized, cubic-bezier(0.34, 1.3, 0.64, 1)),
      background-color 0.25s ease,
      border-color 0.25s ease,
      box-shadow 0.25s ease;
  }

  &:checked + .radio-switch::after {
    // Track width minus the thumb and equal inset on both sides.
    --b-switch-thumb-offset: calc(var(--b-switch-width) - var(--b-switch-thumb-size) - var(--b-switch-inset) * 2);
  }
}
</style>
