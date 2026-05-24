<script setup lang="ts">
type RightWidth = 'default' | 'auto'

withDefaults(defineProps<{
  title?: string
  desc?: string
  rightWidth?: RightWidth
}>(), {
  rightWidth: 'default',
})
</script>

<template>
  <div class="b-settings-item" py-4>
    <div
      class="b-settings-item-row" :class="`right-width-${rightWidth}`" flex="~ gap-4" justify-between items-center
      text-base
    >
      <div class="left-content" flex-1 min-w-0>
        <div>
          <slot name="title">
            {{ title }}
          </slot>
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
</style>
