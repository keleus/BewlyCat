<script setup lang="ts">
type RightWidth = 'default' | 'auto'

withDefaults(defineProps<{
  title?: string
  desc?: string
  rightWidth?: RightWidth
  badge?: string
}>(), {
  rightWidth: 'default',
})
</script>

<template>
  <div class="b-settings-item" :data-settings-title="title" py-4>
    <div
      class="b-settings-item-row" :class="`right-width-${rightWidth}`" flex="~ gap-4" justify-between items-center
      text-base
    >
      <div class="left-content" flex-1 min-w-0>
        <div>
          <span class="settings-item-title">
            <slot name="title">
              {{ title }}
            </slot>
            <span v-if="badge" class="settings-item-badge">{{ badge }}</span>
          </span>
        </div>

        <div
          text="sm $bew-text-2"
          break-words
          :style="{ marginTop: $slots.desc || desc ? '0.25rem' : '0' }"
        >
          <slot name="desc">
            {{ desc }}
          </slot>
        </div>
      </div>

      <div class="right-content" w-auto shrink-0>
        <slot />
      </div>
    </div>

    <div v-if="$slots.bottom" mt-4>
      <slot name="bottom" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.right-width-auto {
  .left-content {
    --uno: "w-auto flex-1 min-w-0";
  }

  .right-content {
    --uno: "w-auto shrink-0";
  }
}

:deep(.right-content > *) {
  --uno: "float-right clear-both";
}

.b-settings-item + .b-settings-item {
  --uno: "border-t-1 border-$bew-border-color";
}

.settings-item-title {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  flex-wrap: wrap;
}

.settings-item-badge {
  padding: 2px 7px;
  color: var(--bew-warning-color);
  background: color-mix(in oklab, var(--bew-warning-color), transparent 88%);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
</style>
