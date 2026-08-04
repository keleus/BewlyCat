<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, ref, toRef } from 'vue'

import { usePageModeSwitcher } from '~/composables/usePageModeSwitcher'
import type { AppPage } from '~/enums/appEnums'

import Tooltip from './Tooltip.vue'

type TooltipPlacement = 'left' | 'right' | 'top' | 'bottom' | 'bottom-left' | 'bottom-right'

const props = withDefaults(defineProps<{
  activatedPage: AppPage
  placement: TooltipPlacement
  variant: 'dock' | 'sidebar'
  disableGlowingEffect?: boolean
}>(), {
  disableGlowingEffect: false,
})

const hovered = ref(false)
const focused = ref(false)
const {
  currentIcon,
  disabled,
  nextIcon,
  tooltip,
  cyclePageMode,
} = usePageModeSwitcher(toRef(props, 'activatedPage'))
const previewNextMode = computed(() => (hovered.value || focused.value) && !disabled.value)
const displayedIcon = computed(() => previewNextMode.value ? nextIcon.value : currentIcon.value)
</script>

<template>
  <Tooltip :content="tooltip" :placement="placement">
    <button
      type="button"
      class="page-mode-switcher"
      :class="[
        `page-mode-switcher--${variant}`,
        { 'page-mode-switcher--no-glow': disableGlowingEffect },
      ]"
      :disabled="disabled"
      :aria-label="tooltip"
      @click="cyclePageMode"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
      @focus="focused = true"
      @blur="focused = false"
    >
      <Transition name="fade" mode="out-in">
        <Icon :key="displayedIcon" :icon="displayedIcon" aria-hidden="true" />
      </Transition>
    </button>
  </Tooltip>
</template>

<style lang="scss" scoped>
.page-mode-switcher {
  box-sizing: border-box;
  display: grid;
  flex: none;
  place-items: center;
  padding: 0;
  border-radius: var(--bew-radius-full);
  appearance: none;
  color: var(--bew-text-1);
  cursor: pointer;
  transition:
    color var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    border-color var(--bew-duration-moderate) var(--bew-ease-standard),
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard),
    opacity var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-emphasized);

  &:hover:not(:disabled) {
    transform: scale(1.1);
  }

  &:active:not(:disabled) {
    transform: scale(0.9);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: var(--bew-space-0-5);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    transform: none;
  }

  &--dock {
    width: var(--bew-dock-control-size);
    height: var(--bew-dock-control-size);
    border: 0;
    background: var(--bew-fill-alt);
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);

    &:hover:not(:disabled) {
      background: var(--bew-fill-2);
      box-shadow:
        var(--bew-shadow-edge-glow-1),
        0 0 0 2px var(--bew-fill-2),
        var(--bew-shadow-2);
    }

    svg {
      width: var(--bew-dock-control-icon-size);
      height: var(--bew-dock-control-icon-size);
    }
  }

  &--sidebar {
    width: var(--bew-floating-control-size);
    height: var(--bew-floating-control-size);
    border: 1px solid var(--bew-border-color);
    background: var(--bew-elevated);
    box-shadow: var(--bew-shadow-1);
    backdrop-filter: var(--bew-filter-glass-1);

    &:hover:not(:disabled) {
      background: var(--bew-elevated-hover);
      box-shadow: var(--bew-shadow-2);
    }

    svg {
      width: var(--bew-floating-control-icon-size);
      height: var(--bew-floating-control-icon-size);
    }
  }

  &--no-glow:hover:not(:disabled) {
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
  }

  &:disabled,
  &:disabled:hover {
    box-shadow: var(--bew-shadow-1);
  }
}

:global(.dark) .page-mode-switcher--dock:hover:not(:disabled) {
  background: var(--bew-fill-4);
  box-shadow:
    var(--bew-shadow-edge-glow-1),
    0 0 0 2px var(--bew-fill-4),
    var(--bew-shadow-2);
}

:global(.dark) .page-mode-switcher--dock.page-mode-switcher--no-glow:hover:not(:disabled) {
  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
}

@media (min-width: 1024px) {
  .page-mode-switcher--dock {
    width: var(--bew-dock-control-size-lg);
    height: var(--bew-dock-control-size-lg);

    svg {
      width: var(--bew-dock-control-icon-size-lg);
      height: var(--bew-dock-control-icon-size-lg);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-mode-switcher {
    transition: none;
  }
}
</style>
