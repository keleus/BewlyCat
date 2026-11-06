<script setup lang="ts">
defineProps<{
  /** 遮罩主文案，如「已移除」 */
  message: string
  /** 撤销是否禁用（删除/还原进行中为 true） */
  pending?: boolean
}>()

const emit = defineEmits<{
  undo: []
  dismiss: []
}>()
</script>

<template>
  <div class="watch-later-removed-mask" @click.prevent.stop>
    <button
      class="watch-later-dismiss-btn" :aria-label="$t('watch_later.dismiss')"
      @click.prevent.stop="emit('dismiss')"
    >
      <i i-tabler:x aria-hidden="true" />
    </button>
    <p class="watch-later-removed-text">
      {{ message }}
    </p>
    <Button
      color="rgba(255,255,255,.35)" text-color="white" size="small"
      :disabled="pending" @click.prevent.stop="emit('undo')"
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

.watch-later-dismiss-btn {
  position: absolute;
  top: var(--bew-space-2);
  right: var(--bew-space-2);
  display: grid;
  place-items: center;
  width: var(--bew-space-6);
  height: var(--bew-space-6);
  padding: 0;
  border: 0;
  border-radius: var(--bew-radius-full);
  background: rgba(255, 255, 255, 0.18);
  color: white;
  font-size: var(--bew-font-size-control);
  cursor: pointer;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    background: rgba(255, 255, 255, 0.32);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color);
    outline-offset: var(--bew-space-0-5);
  }
}
</style>
