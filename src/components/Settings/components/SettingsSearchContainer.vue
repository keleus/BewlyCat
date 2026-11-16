<script setup lang="ts">
import { useSettingsSearchNode } from '../composables/useSettingsSearchFilter'

// 容器本身不是可搜索设置，只在所有可搜索子项都被筛掉时隐藏。
const { visible } = useSettingsSearchNode(() => undefined)
</script>

<template>
  <div v-show="visible">
    <slot />
  </div>
</template>
