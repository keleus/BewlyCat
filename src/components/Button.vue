<script lang="ts" setup>
interface Props {
  type?: | 'default'
    | 'primary'
    | 'secondary'
    | 'tertiary'
    | 'info'
    | 'success'
    | 'warning'
    | 'error'
  size?: 'small' | 'medium' | 'large'
  color?: string
  textColor?: string
  strong?: boolean
  round?: boolean
  block?: boolean
  center?: boolean
}

defineProps<Props>()

const emit = defineEmits(['click'])

function handleClick(evt: MouseEvent) {
  emit('click', evt)
}
</script>

<template>
  <button
    class="b-button"
    :class="[
      `b-button--type-${type ?? 'default'}`,
      `b-button--size-${size ?? 'medium'}`,
      `${strong ? 'b-button--strong' : ''}`,
      `${color || textColor ? 'b-button--custom-color' : ''}`,
    ]"
    :style="{
      'backgroundColor': color,
      'color': textColor,
      '--b-button-radius': round ? 'var(--bew-badge-radius)' : '',
      'width': block ? '100%' : 'var(--b-button-width)',
      'justifyContent': center ? 'center' : '',
    }"
    @click="handleClick"
  >
    <slot name="left" />
    <slot />
    <slot name="right" />
  </button>
</template>

<style lang="scss" scoped>
.b-button {
  --b-button-color: var(--bew-content-solid);
  --b-button-color-hover: var(--bew-content-solid-hover);
  --b-button-text-color: var(--bew-text-1);
  --b-button-radius: var(--bew-interactive-radius);
  --b-button-padding: var(--bew-space-3);
  --b-button-font-size: var(--bew-font-size-control);
  --b-button-font-weight: var(--bew-font-weight-semibold);
  --b-button-line-height: var(--bew-line-height-control);
  --b-button-icon-size: var(--bew-control-icon-size);
  --b-button-width: fit-content;
  --b-button-height: var(--bew-control-height);
  --b-button-border-width: 0px;
  --b-button-border-color: var(--bew-border-color);
  --b-button-shadow: none;
  --b-button-shadow-hover: var(--b-button-shadow);
  --b-button-shadow-active: var(--b-button-shadow);

  --uno: "bg-$b-button-color hover:bg-$b-button-color-hover box-border";
  --uno: "rounded-$b-button-radius p-x-$b-button-padding active:scale-95";
  --uno: "flex items-center gap-$bew-space-2 text-size-$b-button-font-size";
  --uno: "text-$b-button-text-color lh-$b-button-line-height h-$b-button-height";
  --uno: "border-solid border-width-$b-button-border-width border-$b-button-border-color";
  --uno: "shadow-$b-button-shadow hover:shadow-$b-button-shadow-hover active:shadow-$b-button-shadow-active";

  appearance: none;
  font-weight: var(--b-button-font-weight);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    border-color var(--bew-duration-fast) var(--bew-ease-standard),
    box-shadow var(--bew-duration-fast) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-emphasized);

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: var(--bew-space-0-5);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  & svg {
    --uno: "text-size-$b-button-icon-size";
  }

  // &--type-default {
  // }

  &--type-primary {
    --b-button-color: var(--bew-theme-color);
    --b-button-color-hover: var(--bew-theme-color);
    --b-button-text-color: white;
  }

  &--type-secondary {
    --b-button-color: var(--bew-fill-1);
    --b-button-color-hover: var(--bew-fill-2);
    --b-button-text-color: var(--bew-text-1);
  }

  &--type-tertiary {
    --b-button-color: transparent;
    --b-button-color-hover: var(--bew-fill-2);
    --b-button-text-color: var(--bew-text-1);
  }

  &--type-error {
    --b-button-color: var(--bew-error-color);
    --b-button-color-hover: var(--bew-error-color);
    --b-button-text-color: white;
  }

  &--size-small {
    --b-button-padding: var(--bew-space-2);
    --b-button-font-size: var(--bew-font-size-caption);
    --b-button-line-height: var(--bew-line-height-caption);
    --b-button-icon-size: 14px;
    --b-button-height: 28px;
  }

  &--size-large {
    --b-button-padding: var(--bew-space-4);
    --b-button-font-size: var(--bew-font-size-body);
    --b-button-line-height: var(--bew-line-height-body);
    --b-button-icon-size: var(--bew-control-icon-size);
    --b-button-height: 40px;
  }

  &--custom-color {
    --uno: "hover:opacity-70";
  }

  &--strong {
    --b-button-font-weight: var(--bew-font-weight-bold);
  }
}
</style>
