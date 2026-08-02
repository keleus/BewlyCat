<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

function toggleBewlyTopBar() {
  settings.value.useOriginalBilibiliTopBar = !settings.value.useOriginalBilibiliTopBar
}

const topBarStore = useTopBarStore()

// 按钮的可见性状态
const isButtonVisible = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function showButton() {
  clearHideTimer()
  isButtonVisible.value = true
}

// 离开时短暂延迟隐藏，避免按钮位移/动画边缘触发的 enter/leave 抖动
function hideButton() {
  clearHideTimer()
  hideTimer = setTimeout(() => {
    isButtonVisible.value = false
    hideTimer = null
  }, 120)
}

// 监听按钮可见性状态变化并更新 store
watch(isButtonVisible, (newValue) => {
  topBarStore.setSwitcherButtonVisible(newValue)
})

onUnmounted(() => {
  clearHideTimer()
  topBarStore.setSwitcherButtonVisible(false)
})

// 轻微搭接顶栏底边，形成贴近搜索框下沿的小拉片；位置不随按钮显隐跳动
const topOffset = computed(() => {
  if (!topBarStore.topBarVisible && !settings.value.useOriginalBilibiliTopBar)
    return '0px'
  return 'calc(var(--bew-top-bar-height) - var(--bew-space-2))'
})

const isShowingBewlyTopBar = computed(() => !settings.value.useOriginalBilibiliTopBar)
</script>

<template>
  <Teleport to="body">
    <div
      v-show="topBarStore.topBarVisible || settings.useOriginalBilibiliTopBar"
      class="top-bar-switcher"
      :style="{ top: topOffset }"
    >
      <!--
        稳定命中区：尺寸固定、不随按钮 transform 改变。
        外层全宽容器不接收事件，避免挡住顶栏其他交互。
      -->
      <div
        class="top-bar-switcher__hit"
        @mouseenter="showButton"
        @mouseleave="hideButton"
      >
        <button
          type="button"
          class="top-bar-switcher__btn"
          :class="{ 'is-visible': isButtonVisible }"
          @click="toggleBewlyTopBar"
        >
          <i i-mingcute:transfer-3-line text-xs />
          <span>
            <template v-if="isShowingBewlyTopBar">
              {{ $t('topbar.switch_to_bili_top_bar') }}
            </template>
            <template v-else>
              {{ $t('topbar.switch_to_bewly_top_bar') }}
            </template>
          </span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.top-bar-switcher {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 1002;
  display: flex;
  justify-content: center;
  // 全宽定位壳不拦截点击
  pointer-events: none;
}

.top-bar-switcher__hit {
  pointer-events: auto;
  // 仅保留按钮自身大小的命中区；overflow 裁掉上移的隐藏状态
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0 var(--bew-space-2);
  overflow: hidden;
}

.top-bar-switcher__btn {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  box-sizing: border-box;
  height: var(--bew-top-bar-switcher-height);
  padding: 0 var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium, 500);
  line-height: var(--bew-line-height-caption);
  background: var(--bew-elevated);
  border: none;
  border-radius: var(--bew-radius-full);
  box-shadow: var(--bew-shadow-1);
  backdrop-filter: var(--bew-filter-glass-1);
  cursor: pointer;
  opacity: 0;
  // transform 只影响绘制，不改变命中区布局，避免位移导致反复 enter/leave
  transform: translateY(calc(-100% - 4px));
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;

  &.is-visible {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
