<script setup lang="ts">
defineProps<{
  message: string
  actionLabel: string
}>()

const emit = defineEmits<{
  (e: 'details'): void
  (e: 'closeToast'): void
}>()

function openDetails() {
  emit('details')
  emit('closeToast')
}
</script>

<template>
  <div class="bewly-toast__content">
    <span>{{ message }}</span>
    <button type="button" class="bewly-toast__action" @click="openDetails">
      {{ actionLabel }}
    </button>
  </div>
</template>
