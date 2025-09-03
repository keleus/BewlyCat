<script setup lang="ts">
import { ref, watch } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

function toggleBewlyTopBar() {
  settings.value.useOriginalBilibiliTopBar = !settings.value.useOriginalBilibiliTopBar
  settings.value.showTopBar = !settings.value.showTopBar
}

const topBarStore = useTopBarStore()

// 按钮的可见性状态
const isButtonVisible = ref(false)

// 监听按钮可见性状态变化并更新 store
watch(isButtonVisible, (newValue) => {
  topBarStore.setSwitcherButtonVisible(newValue)
})

// 计算顶部边距
const topMargin = computed(() => {
  if (settings.value.useOriginalBilibiliTopBar) {
    return 'calc(var(--bew-top-bar-height) - 15px)'
  }
  if (!topBarStore.topBarVisible) {
    return '0px'
  }
  return 'calc(var(--bew-top-bar-height) - 20px)'
})
</script>

<template>
  <div
    v-show="topBarStore.topBarVisible || settings.useOriginalBilibiliTopBar"
    class="group"
    pos="fixed top-0 right-0"
    z-10
    w-full
    flex="~ items-center justify-center"
    :style="{ marginTop: topMargin }"
    p="t-30px"
    @mouseenter="isButtonVisible = true"
    @mouseleave="isButtonVisible = false"
  >
    <button
      style="backdrop-filter: var(--bew-filter-glass-1);"
      pos="absolute"
      :class="isButtonVisible ? 'opacity-100' : 'opacity-0'"
      class="pointer-events-auto"
      :style="{
        transform: isButtonVisible ? 'translateY(0)' : 'translateY(-100%)',
      }"
      flex="~ items-center gap-2"
      text="$bew-text-2 sm"
      bg="$bew-elevated" p="x-2 y-1" mt-2
      rounded="full" shadow="$bew-shadow-1"
      duration-300
      @click="toggleBewlyTopBar"
    >
      <i i-mingcute:transfer-3-line text-xs />
      <span>
        <template v-if="settings.showTopBar">
          {{ $t('topbar.switch_to_bili_top_bar') }}
        </template>
        <template v-else>
          {{ $t('topbar.switch_to_bewly_top_bar') }}
        </template>
      </span>
    </button>
  </div>
</template>
