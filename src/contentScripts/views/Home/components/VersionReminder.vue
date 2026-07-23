<script setup lang="ts">
import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import { settings } from '~/logic'

import { version } from '../../../../../package.json'

const GITHUB_RELEASES_URL = 'https://github.com/keleus/BewlyCat/releases'
const BILIBILI_DYNAMIC_URL = 'https://space.bilibili.com/32487218/dynamic'

const dialogVisible = ref(false)

const shouldShowReminder = computed(() =>
  settings.value.enableVersionReminder
  && settings.value.lastAcknowledgedVersion !== version,
)

watch(shouldShowReminder, (visible) => {
  if (!visible)
    dialogVisible.value = false
})

function acknowledgeCurrentVersion() {
  settings.value.lastAcknowledgedVersion = version
  dialogVisible.value = false
}
</script>

<template>
  <Transition name="version-reminder">
    <button
      v-if="shouldShowReminder"
      class="version-reminder-trigger"
      type="button"
      @click="dialogVisible = true"
    >
      <span class="version-reminder-trigger__icon" i-mingcute:notification-newdot-line />
      <span class="version-reminder-trigger__text">
        <strong>{{ $t('version_reminder.trigger') }}</strong>
        <small>v{{ version }}</small>
      </span>
    </button>
  </Transition>

  <Dialog
    v-if="dialogVisible"
    :title="$t('version_reminder.title')"
    :desc="$t('version_reminder.current_version', { version })"
    width="480px"
    max-width="calc(100vw - 32px)"
    content-max-height="calc(100vh - 180px)"
    :show-footer="false"
    append-to-bewly-body
    @close="dialogVisible = false"
  >
    <div class="version-reminder-dialog">
      <p class="version-reminder-dialog__intro">
        {{ $t('version_reminder.description') }}
      </p>

      <div class="version-reminder-dialog__links">
        <a
          :href="GITHUB_RELEASES_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="version-reminder-dialog__link"
        >
          <span class="version-reminder-dialog__link-icon" i-mingcute:github-line />
          <span>
            <strong>{{ $t('version_reminder.github_releases') }}</strong>
            <small>{{ $t('version_reminder.github_releases_desc') }}</small>
          </span>
          <span class="version-reminder-dialog__arrow" i-mingcute:external-link-line />
        </a>

        <a
          :href="BILIBILI_DYNAMIC_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="version-reminder-dialog__link"
        >
          <span class="version-reminder-dialog__link-icon" i-mingcute:bilibili-line />
          <span>
            <strong>{{ $t('version_reminder.bilibili_dynamic') }}</strong>
            <small>{{ $t('version_reminder.bilibili_dynamic_desc') }}</small>
          </span>
          <span class="version-reminder-dialog__arrow" i-mingcute:external-link-line />
        </a>
      </div>

      <Button type="primary" block center @click="acknowledgeCurrentVersion">
        {{ $t('version_reminder.acknowledge') }}
      </Button>

      <p class="version-reminder-dialog__hint">
        {{ $t('version_reminder.settings_hint') }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.version-reminder-trigger {
  position: fixed;
  left: 24px;
  bottom: 24px;
  z-index: 50;
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 42px;
  padding: 7px 12px;
  color: white;
  background: var(--bew-theme-color);
  border: 1px solid var(--bew-theme-color);
  border-radius: var(--bew-radius);
  box-shadow: var(--bew-shadow-2);
  cursor: pointer;
  transition: box-shadow 160ms ease;
}

.version-reminder-trigger:hover {
  box-shadow: var(--bew-shadow-4);
}

.version-reminder-trigger:active {
  box-shadow: var(--bew-shadow-1);
}

.version-reminder-trigger__icon {
  width: 20px;
  height: 20px;
  color: white;
}

.version-reminder-trigger__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}

.version-reminder-trigger__text strong {
  font-size: 13px;
  font-weight: 700;
}

.version-reminder-trigger__text small {
  margin-top: 2px;
  font-size: 11px;
  color: rgb(255 255 255 / 78%);
}

.version-reminder-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 2px 0 18px;
}

.version-reminder-dialog__intro {
  margin: 0;
  color: var(--bew-text-2);
  font-size: 14px;
  line-height: 1.7;
}

.version-reminder-dialog__links {
  display: grid;
  gap: 10px;
}

.version-reminder-dialog__link {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 18px;
  gap: 12px;
  align-items: center;
  min-height: 64px;
  padding: 10px 14px;
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  transition:
    color 160ms ease,
    background-color 160ms ease,
    border-color 160ms ease;
}

.version-reminder-dialog__link:hover {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
  border-color: var(--bew-theme-color);
}

.version-reminder-dialog__link-icon {
  width: 38px;
  height: 38px;
  padding: 8px;
  background: var(--bew-fill-2);
  border-radius: 10px;
}

.version-reminder-dialog__link strong,
.version-reminder-dialog__link small {
  display: block;
}

.version-reminder-dialog__link strong {
  font-size: 14px;
}

.version-reminder-dialog__link small {
  margin-top: 4px;
  color: var(--bew-text-3);
  font-size: 12px;
}

.version-reminder-dialog__arrow {
  width: 18px;
  height: 18px;
}

.version-reminder-dialog__hint {
  margin: -6px 0 0;
  color: var(--bew-text-3);
  font-size: 11px;
  line-height: 1.55;
  text-align: center;
}

.version-reminder-enter-active,
.version-reminder-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.version-reminder-enter-from,
.version-reminder-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 560px) {
  .version-reminder-trigger {
    left: 16px;
    bottom: 16px;
  }
}
</style>
