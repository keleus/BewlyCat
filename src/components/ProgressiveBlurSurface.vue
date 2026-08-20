<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** 过渡到恒等滤镜，视觉上等同于关闭，但保留平滑动画与挂载状态 */
  inactive?: boolean
}>(), { inactive: false })

// 恒等滤镜：blur(0) + saturate(100%) 不产生任何视觉效果，
// 且与 blur(Npx) saturate(180%) 函数结构一致，可平滑插值。
// Chromium 在 opacity 动画期间会丢弃 backdrop-filter（crbug.com/40877283），
// 因此需要淡出时保持挂载并把滤镜过渡到恒等值，而不是靠 opacity 或卸载隐藏。
const IDENTITY_BACKDROP_FILTER = 'blur(0px) saturate(100%)'

// 早期实现用 blur(1/2/4/8/16px) 五层叠出"模糊半径渐变"，顶部会同时命中五个合成层，
// 低端 GPU 上开销明显。改为单层：半径取五层叠加的等效值（√(1²+2²+4²+8²+16²) ≈ 18.5，
// 取 20px 与 --bew-filter-glass-1 对齐），再用余弦 mask 让模糊随 alpha 渐隐。
// 观感与原先接近，但始终只占一个合成层。
const BLUR_FILTER = 'blur(20px) saturate(180%)'

const FADE_STOP_COUNT = 16
const FADE_MASK = `linear-gradient(to bottom, ${
  Array.from({ length: FADE_STOP_COUNT }, (_, index) => {
    const t = index / (FADE_STOP_COUNT - 1)
    const alpha = (1 + Math.cos(Math.PI * t)) / 2
    return `rgb(0 0 0 / ${+(alpha * 100).toFixed(2)}%) ${+(t * 100).toFixed(1)}%`
  }).join(', ')
})`

const layerStyle = computed(() => {
  const filter = props.inactive ? IDENTITY_BACKDROP_FILTER : BLUR_FILTER
  return {
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
    maskImage: FADE_MASK,
    WebkitMaskImage: FADE_MASK,
  }
})
</script>

<template>
  <div class="progressive-blur-surface" aria-hidden="true">
    <div class="progressive-blur-surface__layer" :style="layerStyle" />
  </div>
</template>

<style scoped lang="scss">
.progressive-blur-surface,
.progressive-blur-surface__layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.progressive-blur-surface__layer {
  transition: backdrop-filter var(--bew-duration-moderate) var(--bew-ease-standard);
}
</style>
