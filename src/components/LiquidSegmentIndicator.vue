<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { useLiquidSegmentIndicator } from '~/composables/useLiquidSegmentIndicator'

const props = withDefaults(defineProps<{
  activeKey: unknown
  white?: boolean
}>(), {
  white: false,
})

const indicatorRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

// The indicator is always a direct child of the measured segmented-control
// container. Resolve it here so callers never repeat ref/composable wiring.
onMounted(() => {
  containerRef.value = indicatorRef.value?.parentElement ?? null
})

const {
  indicatorStyle,
  isMoving,
  updateIndicator,
  setPreview,
  clearPreview,
  moveDurationMs,
} = useLiquidSegmentIndicator({
  containerRef,
  activeKey: () => props.activeKey,
})

defineExpose({
  updateIndicator,
  setPreview,
  clearPreview,
  moveDurationMs,
})
</script>

<template>
  <div
    ref="indicatorRef"
    class="bew-liquid-indicator"
    :class="{
      'is-moving': isMoving,
      'bew-liquid-indicator--white': white,
    }"
    :style="indicatorStyle"
    aria-hidden="true"
  />
</template>
