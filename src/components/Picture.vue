<script setup lang="ts">
withDefaults(defineProps<{
  src: string
  loading?: 'lazy' | 'eager'
  alt?: string
  aspectRatio?: string
}>(), {
  aspectRatio: '16 / 9',
})
</script>

<template>
  <picture
    w-full max-w-full align-middle object-cover
    rounded="$bew-radius"
    bg="$bew-skeleton"
    :style="{ aspectRatio, display: 'block' }"
  >
    <source :srcset="`${src}.avif`" type="image/avif">
    <source :srcset="`${src}.webp`" type="image/webp">
    <img
      :src="src"
      :loading="loading || 'lazy'"
      :alt="alt"
      decoding="async"
      block w-full h-full object-cover
      rounded-inherit
      :style="{ aspectRatio }"
    >
  </picture>
</template>
