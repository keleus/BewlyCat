<script lang="ts" setup>
defineProps<{
  content: string
  placement: 'left' | 'right' | 'top' | 'bottom' | 'bottom-left' | 'bottom-right'
  type?: 'default' | 'dark' | 'white'
}>()

const tooltipPos = ref({ left: 0, top: 0 })
const tooltipRef = ref(null)
</script>

<template>
  <span
    class="b-tooltip-wrapper"
    :style="{
      top: `${tooltipPos.top}px`,
      left: `${tooltipPos.left}px`,
    }"
  >
    <div
      v-if="content"
      ref="tooltipRef"
      class="b-tooltip"
      :class="[`b-tooltip--placement-${placement ?? 'top'}`, `b-tooltip--type-${type ?? 'default'}`]"
    >
      {{ content }}
    </div>
    <slot />
  </span>
</template>

<style lang="scss" scoped>
.b-tooltip-wrapper {
  --uno: "flex items-center relative";

  .b-tooltip {
    --uno: "absolute px-2 rounded-$bew-radius-half pointer-events-none opacity-0 duration-300 shadow-$bew-shadow-2 whitespace-nowrap z-9999";

    padding-block: var(--bew-space-1);
    font-size: var(--bew-font-size-control);
    font-weight: var(--bew-font-weight-medium);
    line-height: var(--bew-line-height-control);

    &--placement-right {
      --uno: "left-[calc(100%+0.5em)]";
    }

    &--placement-left {
      --uno: "right-[calc(100%+0.5em)]";
    }

    &--placement-top {
      --uno: "top--2.5em left-1/2 translate-x--1/2";
    }

    &--placement-bottom {
      --uno: "bottom--2.5em left-1/2 translate-x--1/2";
    }

    &--placement-bottom-left {
      --uno: "bottom--2.5em left--2";
    }

    &--placement-bottom-right {
      --uno: "bottom--2.5em right--2";
    }

    &--type-default {
      --uno: "text-white dark:text-black bg-black dark:bg-white";
    }

    &--type-dark {
      --uno: "text-white bg-black";
    }

    &--type-white {
      --uno: "text-black bg-white";
    }
  }

  &:hover .b-tooltip {
    --uno: "opacity-100";
  }
}
</style>
