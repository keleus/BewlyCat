<script setup lang="ts">
import browser from 'webextension-polyfill'

const props = defineProps<{
  show: boolean | null | undefined
  keepSpace?: boolean // 是否在隐藏时保持占位空间
  minHeight?: string // 最小高度
}>()

const imgURL = browser.runtime.getURL('/assets/loading.gif')

// 优化：使用计算属性预先确定样式类，避免模板中多次判断
const containerClass = computed(() => ({
  'loading-visible': !!props.show,
  'loading-hidden': !props.show && !props.keepSpace,
  'loading-keep-space': !props.show && props.keepSpace,
  'pointer-events-none': !props.show,
}))
</script>

<template>
  <div
    w="full"
    class="loading-container"
    :class="containerClass"
    :style="{ minHeight: minHeight || '46px' }"
    flex="~"
    justify="center"
    items="center"
  >
    <Transition name="fade-scale">
      <div v-if="!!show" flex="~ items-center" justify="center" class="loading-content">
        <img
          :src="imgURL"
          alt="loading"
          w="46px"
          h="46px"
          m="r-2"
        >
        <span>{{ $t('common.loading') }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
/* 优化：避免 height transition，使用 max-height 或纯 opacity */
.loading-container {
  overflow: hidden;
  /* 关键优化：只 transition opacity，不 transition height/padding */
  transition: opacity 0.2s ease-in-out;
  /* CSS containment 隔离渲染 */
  contain: layout style paint;
}

.loading-visible {
  visibility: visible;
  opacity: 1;
  /* 固定最小高度避免布局跳动 */
  min-height: 100px;
  padding: 2rem 0;
}

.loading-hidden {
  visibility: visible;
  opacity: 0;
  /* 不改变 height，只改变 opacity 和 visibility */
  /* 使用 absolute positioning 移出文档流 */
  position: absolute;
  pointer-events: none;
  min-height: 0;
  padding: 0;
}

.loading-keep-space {
  visibility: hidden;
  opacity: 0;
  min-height: 100px;
  padding: 2rem 0;
}

.loading-content {
  /* 使用 GPU 加速，但避免过度分层 */
  transform: translateZ(0);
  will-change: transform, opacity;
}

/* 简化 transition，避免复杂动画 */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.2s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
}
</style>
