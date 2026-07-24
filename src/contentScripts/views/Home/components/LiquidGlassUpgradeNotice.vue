<script setup lang="ts">
import { settings } from '~/logic'

const visible = computed(() => !settings.value.liquidGlassPerformanceNoticeAcknowledged)

function acknowledgeNotice() {
  settings.value.liquidGlassPerformanceNoticeAcknowledged = true
}
</script>

<template>
  <Transition name="liquid-glass-notice">
    <aside
      v-if="visible"
      class="liquid-glass-notice"
      role="status"
    >
      <span class="liquid-glass-notice__icon" i-mingcute:sparkles-2-line />

      <div class="liquid-glass-notice__content">
        <strong>{{ $t('liquid_glass_upgrade_notice.title') }}</strong>
        <p>{{ $t('liquid_glass_upgrade_notice.description') }}</p>
      </div>

      <button
        class="liquid-glass-notice__acknowledge"
        type="button"
        @click="acknowledgeNotice"
      >
        {{ $t('liquid_glass_upgrade_notice.acknowledge') }}
      </button>
    </aside>
  </Transition>
</template>

<style scoped lang="scss">
.liquid-glass-notice {
  position: fixed;
  left: 24px;
  bottom: 80px;
  z-index: 51;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: min(560px, calc(100vw - 48px));
  padding: 14px 16px;
  color: var(--bew-text-1);
  background: var(--bew-elevated);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-3);
  backdrop-filter: var(--bew-filter-glass-1);
}

.liquid-glass-notice__icon {
  width: 24px;
  height: 24px;
  color: var(--bew-theme-color);
}

.liquid-glass-notice__content {
  min-width: 0;
}

.liquid-glass-notice__content strong {
  display: block;
  font-size: 14px;
}

.liquid-glass-notice__content p {
  margin: 4px 0 0;
  color: var(--bew-text-2);
  font-size: 12px;
  line-height: 1.55;
}

.liquid-glass-notice__acknowledge {
  padding: 7px 12px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  background: var(--bew-theme-color);
  border: 1px solid var(--bew-theme-color);
  border-radius: var(--bew-radius-half);
  cursor: pointer;
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.liquid-glass-notice__acknowledge:hover {
  opacity: 0.84;
}

.liquid-glass-notice__acknowledge:active {
  transform: scale(0.96);
}

.liquid-glass-notice-enter-active,
.liquid-glass-notice-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.liquid-glass-notice-enter-from,
.liquid-glass-notice-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 640px) {
  .liquid-glass-notice {
    left: 16px;
    bottom: 72px;
    grid-template-columns: 24px minmax(0, 1fr);
    width: calc(100vw - 32px);
  }

  .liquid-glass-notice__acknowledge {
    grid-column: 1 / -1;
    width: 100%;
  }
}
</style>
