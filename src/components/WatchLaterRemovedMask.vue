<script setup lang="ts">
import MaskDismissButton from './MaskDismissButton.vue'

defineProps<{
  /** 遮罩主文案，如「已移出稍后再看」 */
  message: string
  /** 撤销不可用（删除/还原请求进行中） */
  pending?: boolean
}>()

const emit = defineEmits<{
  undo: []
  dismiss: []
}>()
</script>

<template>
  <div class="watch-later-removed-mask" @click.prevent.stop>
    <MaskDismissButton :label="$t('common.dismiss')" @dismiss="emit('dismiss')" />
    <p class="watch-later-removed-text">
      {{ message }}
    </p>
    <Button
      color="rgba(255,255,255,.35)" text-color="white" size="small"
      :disabled="pending"
      @click.prevent.stop="emit('undo')"
    >
      <template #left>
        <div i-mingcute-back-line />
      </template>
      {{ $t('common.undo') }}
    </Button>
  </div>
</template>

<style scoped lang="scss">
.watch-later-removed-mask {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  border-radius: inherit;
  background: var(--bew-fill-4);
  backdrop-filter: blur(20px);
  color: white;
  font-size: var(--bew-font-size-body);
  cursor: default;
}

.watch-later-removed-text {
  margin: 0;
}
</style>
