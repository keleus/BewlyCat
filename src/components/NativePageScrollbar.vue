<script setup lang="ts">
import { useEventListener, useMutationObserver, useResizeObserver } from '@vueuse/core'

import FirefoxScrollbar from './FirefoxScrollbar.vue'

const ROOT_CLASS = 'bewly-native-scrollbar-overlay'
const target = ref<HTMLElement | null>(null)
const root = document.documentElement
let frame = 0

function update() {
  frame = 0
  const scrollingElement = document.scrollingElement
  const body = document.body
  const overflowHidden = [root, body].some(element => element
    && ['hidden', 'clip'].includes(getComputedStyle(element).overflowY))
  // 保留有横向溢出的页面的原生滚动条，也不在全屏或页面锁定滚动时绘制。
  const enabled = scrollingElement instanceof HTMLElement
    && !document.fullscreenElement
    && !overflowHidden
    && scrollingElement.scrollWidth <= window.innerWidth + 1

  target.value = enabled ? scrollingElement : null
  if (root.classList.contains(ROOT_CLASS) !== enabled)
    root.classList.toggle(ROOT_CLASS, enabled)
}

function scheduleUpdate() {
  if (!frame)
    frame = requestAnimationFrame(update)
}

useResizeObserver([root, document.body], scheduleUpdate)
useMutationObserver([root, document.body], scheduleUpdate, {
  attributes: true,
  attributeFilter: ['class', 'style'],
})
useEventListener(window, ['resize', 'pageshow'], scheduleUpdate)
useEventListener(document, 'fullscreenchange', scheduleUpdate)

onMounted(update)
onBeforeUnmount(() => {
  if (frame)
    cancelAnimationFrame(frame)
  root.classList.remove(ROOT_CLASS)
})
</script>

<template>
  <FirefoxScrollbar v-if="target" :target="target" viewport />
</template>
