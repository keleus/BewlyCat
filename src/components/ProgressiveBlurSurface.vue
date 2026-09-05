<script setup lang="ts">
// v1.7.6 的渐进雾化实现（b6fdb800）移植恢复。
//
// backdrop-filter 的 blur 半径无法用 CSS 渐变做线性插值，只能靠"若干层不同半径的
// 模糊层 + 各层错位的 alpha mask"叠加出模糊自下而上递增的观感：
//   层 0..4 的半径依次为 blur(1/2/4/8/16px)，每层的 mask 让半径越大的层只出现在越靠上
//   的窄条里，叠在一起就形成底部≈1px、顶部≈16px 的连续渐变。
//
// 注意：每层都是一个独立 backdrop 合成层，顶部会同时命中五层。这是有意为之的
// "观感开关"——只在该档被用户显式选择时才挂载，默认不产生任何额外合成开销。
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
