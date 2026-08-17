<script setup lang="ts">
const BLUR_LAYER_COUNT = 5

const blurLayers = Array.from({ length: BLUR_LAYER_COUNT }, (_, index) => {
  const solid = ((BLUR_LAYER_COUNT - 1 - index) / BLUR_LAYER_COUNT) * 100
  const fade = ((BLUR_LAYER_COUNT - index) / BLUR_LAYER_COUNT) * 100
  const mask = `linear-gradient(to bottom, rgb(0 0 0 / 100%) 0, rgb(0 0 0 / 100%) ${solid}%, rgb(0 0 0 / 0%) ${fade}%)`
  const filter = index === 0 ? `blur(${2 ** index}px) saturate(180%)` : `blur(${2 ** index}px)`

  return {
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
    maskImage: mask,
    WebkitMaskImage: mask,
  }
})
</script>

<template>
  <div class="progressive-blur-surface" aria-hidden="true">
    <div
      v-for="(layer, index) in blurLayers"
      :key="index"
      class="progressive-blur-surface__layer"
      :style="layer"
    />
  </div>
</template>

<style scoped lang="scss">
.progressive-blur-surface,
.progressive-blur-surface__layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
