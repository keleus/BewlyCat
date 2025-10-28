<script setup lang="ts">
import browser from 'webextension-polyfill'

defineProps<{
  show: boolean | null | undefined
  keepSpace?: boolean // 是否在隐藏时保持占位空间
  minHeight?: string // 最小高度
}>()

const imgURL = browser.runtime.getURL('/assets/loading.gif')
</script>

<template>
  <div
    w="full"
    :style="{
      minHeight: minHeight || '46px',
      visibility: !!show ? 'visible' : (keepSpace ? 'hidden' : 'visible'),
      opacity: !!show ? '1' : '0',
      height: !!show || keepSpace ? 'auto' : '0',
      padding: !!show || keepSpace ? '2rem 0' : '0',
      overflow: 'hidden',
    }"
    flex="~"
    justify="center"
    items="center"
    duration-300
    ease-in-out
    :class="{ 'pointer-events-none': !show }"
  >
    <Transition name="fade-scale">
      <div v-if="!!show" flex="~ items-center" justify="center">
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
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.3s ease;
}

.fade-scale-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
