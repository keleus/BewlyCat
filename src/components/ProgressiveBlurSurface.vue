<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** 过渡到恒等滤镜，视觉上等同于关闭，但保留平滑动画与挂载状态 */
  inactive?: boolean
}>(), { inactive: false })

// 恒等滤镜：blur(0) + saturate(100%) 不产生任何视觉效果，
// 且与各层 blur(Npx)（首层另含 saturate(180%)）函数结构一致，可平滑插值。
// Chromium 在 opacity 动画期间会丢弃 backdrop-filter（crbug.com/40877283），
// 因此需要淡出时保持挂载并把各层过渡到恒等滤镜，而不是靠 opacity 或卸载隐藏。
const IDENTITY_BACKDROP_FILTER = 'blur(0px) saturate(100%)'

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

const layerStyles = computed(() =>
  blurLayers.map(layer => (props.inactive
    ? { ...layer, backdropFilter: IDENTITY_BACKDROP_FILTER, WebkitBackdropFilter: IDENTITY_BACKDROP_FILTER }
    : layer)))
</script>

<template>
  <div class="progressive-blur-surface" aria-hidden="true">
    <div
      v-for="(layer, index) in layerStyles"
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

.progressive-blur-surface__layer {
  transition: backdrop-filter var(--bew-duration-moderate) var(--bew-ease-standard);
}
</style>
