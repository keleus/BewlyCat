<script setup lang="ts">
defineOptions({ name: 'BewLocalIcon' })

defineProps<{
  icon: string
}>()
</script>

<template>
  <span class="bew-local-icon" :class="`i-${icon}`" />
</template>

<style scoped>
.bew-local-icon {
  display: inline-block;
  flex: none;
  vertical-align: middle;
}
</style>
