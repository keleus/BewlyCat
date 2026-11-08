<script setup lang="ts">
import Button from '~/components/Button.vue'
import Radio from '~/components/Radio.vue'
import type { ConfirmDialogRequest } from '~/composables/useConfirmDialog'
import { settings } from '~/logic'

defineProps<{
  request: ConfirmDialogRequest
}>()

const emit = defineEmits<{
  finish: [confirmed: boolean]
}>()

const panelStyle = computed(() => {
  const frostedGlass = settings.value.enableFrostedGlass
  return {
    backdropFilter: frostedGlass ? 'var(--bew-filter-glass-2)' : 'none',
    WebkitBackdropFilter: frostedGlass ? 'var(--bew-filter-glass-2)' : 'none',
    backgroundColor: frostedGlass ? 'var(--bew-elevated-alt)' : 'var(--bew-elevated-alt-solid)',
  }
})
</script>

<template>
  <div
    class="bew-confirm-dialog"
    role="alertdialog"
    aria-modal="true"
    :aria-label="$t('common.operation.confirm')"
  >
    <div class="bew-confirm-dialog__backdrop" @click="emit('finish', false)" />
    <div class="bew-confirm-dialog__panel" :style="panelStyle">
      <header class="bew-confirm-dialog__header">
        <p class="bew-confirm-dialog__title">
          {{ request.title || $t('common.operation.confirm') }}
        </p>
        <button
          type="button"
          class="bew-confirm-dialog__close"
          :aria-label="$t('common.operation.cancel')"
          @click="emit('finish', false)"
        >
          <div i-ic-baseline-clear />
        </button>
      </header>
      <div class="bew-confirm-dialog__body">
        <p class="bew-confirm-dialog__message">
          {{ request.message }}
        </p>
        <div
          v-if="request.toggleFields?.length"
          class="bew-confirm-dialog__fields"
        >
          <div
            v-for="field in request.toggleFields"
            :key="field.id"
            class="bew-confirm-dialog__field"
          >
            <span class="bew-confirm-dialog__field-label">{{ field.label }}</span>
            <!-- 调用方在确认后读取这些字段的值，因此直接写回请求对象。 -->
            <Radio
              v-model="field.value"
              :label="field.value ? field.enabledLabel : field.disabledLabel"
            />
          </div>
        </div>
      </div>
      <footer class="bew-confirm-dialog__footer">
        <Button type="tertiary" @click="emit('finish', true)">
          {{ request.confirmLabel || $t('common.operation.confirm') }}
        </Button>
        <Button type="primary" @click="emit('finish', false)">
          {{ $t('common.operation.cancel') }}
        </Button>
      </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.bew-confirm-dialog {
  position: fixed;
  inset: 0;
  z-index: var(--bew-z-confirm-dialog);
  pointer-events: auto;
}

.bew-confirm-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 40%);
}

.bew-confirm-dialog__panel {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  width: 420px;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-modal-radius);
  box-shadow: var(--bew-shadow-4), var(--bew-shadow-edge-glow-2);
  transform: translate(-50%, -50%);
}

.bew-confirm-dialog__header {
  display: flex;
  gap: var(--bew-space-4);
  align-items: center;
  justify-content: space-between;
  min-height: 70px;
  padding: 0 var(--bew-space-8);
}

.bew-confirm-dialog__title {
  margin: 0;
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.bew-confirm-dialog__close {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  appearance: none;
  color: inherit;
  cursor: pointer;
  background: var(--bew-elevated);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);

  &:hover {
    color: var(--bew-theme-color);
    background: var(--bew-theme-color-30);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: var(--bew-space-0-5);
  }
}

.bew-confirm-dialog__body {
  max-height: min(60vh, 480px);
  padding: var(--bew-space-2) var(--bew-space-8) var(--bew-space-2);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.bew-confirm-dialog__message {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  white-space: pre-line;
}

.bew-confirm-dialog__fields {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-4);
}

.bew-confirm-dialog__field {
  display: flex;
  min-height: 48px;
  gap: var(--bew-space-4);
  align-items: center;
  justify-content: space-between;
  padding: var(--bew-space-2) var(--bew-space-3);
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
}

.bew-confirm-dialog__field-label {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.bew-confirm-dialog__footer {
  display: flex;
  gap: var(--bew-space-2);
  justify-content: flex-end;
  padding: var(--bew-space-2) var(--bew-space-8) var(--bew-space-6);
}
</style>
