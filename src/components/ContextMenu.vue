<script setup lang="ts">
import type { CSSProperties } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'

export interface ContextMenuOption {
  value: string | number
  label: string
  icon: string
  danger?: boolean
}

defineProps<{
  options: ContextMenuOption[]
  menuStyles: CSSProperties
}>()

const emit = defineEmits<{
  (event: 'select', value: string | number): void
  (event: 'close'): void
}>()

const { mainAppRef } = useBewlyApp()
</script>

<template>
  <Teleport :to="mainAppRef">
    <div
      class="context-menu-container"
      :style="menuStyles"
      style="backdrop-filter: var(--bew-filter-glass-1); box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1); z-index: 9999;"
      p-1 bg="$bew-elevated" rounded="$bew-popover-radius"
      min-w-140px m="t-1 l-[calc(-140px+0.5rem)]"
      border="1 $bew-border-color"
    >
      <ul flex="~ col gap-1">
        <li
          v-for="option in options"
          :key="option.value"
          class="context-menu-item"
          :class="{ danger: option.danger }"
          @click="emit('select', option.value); emit('close')"
        >
          <i class="item-icon" :class="option.icon" />
          {{ option.label }}
        </li>
      </ul>
    </div>

    <!-- 点击遮罩关闭菜单 -->
    <div
      pos="fixed top-0 left-0" w-full h-full
      style="z-index: 9998;"
      @click="emit('close')"
    />
  </Teleport>
</template>

<style lang="scss" scoped>
.context-menu-item {
  --uno: "hover:bg-$bew-fill-2 rounded-$bew-interactive-radius cursor-pointer";
  --uno: "flex items-center";

  min-height: 32px;
  padding: var(--bew-space-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);

  &.danger {
    color: var(--bew-error-color);

    .item-icon {
      color: var(--bew-error-color);
    }
  }
}

.item-icon {
  --uno: "inline-block color-$bew-text-color-2";

  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
  margin-right: var(--bew-space-2);
}
</style>
