<script setup lang="ts">
import { storeToRefs } from 'pinia'

import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import Progress from '~/components/Progress.vue'
import { useTopBarStore } from '~/stores/topBarStore'

const emit = defineEmits<{ close: [] }>()
const topBarStore = useTopBarStore()
const { isAddingOpenTabsToWatchLater, openTabsWatchLaterProgress, openTabsWatchLaterError } = storeToRefs(topBarStore)
const dialogRef = ref<InstanceType<typeof Dialog>>()
const hasStarted = ref(isAddingOpenTabsToWatchLater.value)

const total = computed(() => openTabsWatchLaterProgress.value?.total ?? 0)
const completed = computed(() => {
  const progress = openTabsWatchLaterProgress.value
  return progress ? progress.added + progress.skipped + progress.failed : 0
})
const percentage = computed(() => total.value > 0 ? Math.min(100, completed.value / total.value * 100) : 0)

function handleConfirm() {
  if (isAddingOpenTabsToWatchLater.value)
    return

  if (hasStarted.value) {
    dialogRef.value?.close()
    return
  }

  hasStarted.value = true
  void topBarStore.addOpenTabVideosToWatchLater()
}
</script>

<template>
  <Dialog
    ref="dialogRef"
    :title="$t('watch_later.add_open_tabs')"
    width="440px"
    max-width="calc(100vw - var(--bew-space-4))"
    append-to-bewly-body
    :loading="isAddingOpenTabsToWatchLater"
    :show-loading-overlay="false"
    :show-footer="false"
    :close-on-confirm="false"
    @confirm="handleConfirm"
    @close="emit('close')"
  >
    <div class="open-tabs-dialog">
      <p class="open-tabs-dialog__message">
        {{ $t('watch_later.add_open_tabs_confirm') }}
      </p>

      <div v-if="hasStarted" class="open-tabs-dialog__status">
        <div
          class="open-tabs-dialog__track"
          role="progressbar"
          :aria-label="$t('watch_later.add_open_tabs')"
          :aria-valuemin="0"
          :aria-valuemax="Math.max(1, total)"
          :aria-valuenow="total > 0 ? completed : undefined"
          :aria-busy="isAddingOpenTabsToWatchLater"
        >
          <Progress :percentage="percentage" height="100%" class="open-tabs-dialog__fill" />
        </div>

        <p role="status" aria-live="polite">
          <template v-if="isAddingOpenTabsToWatchLater && total === 0">
            {{ $t('watch_later.reading_open_tabs') }}
          </template>
          <template v-else-if="total > 0">
            {{ $t('watch_later.add_open_tabs_progress', { completed, total }) }}
          </template>
          <template v-else-if="!openTabsWatchLaterError">
            {{ $t('watch_later.no_open_video_tabs') }}
          </template>
        </p>

        <p v-if="openTabsWatchLaterProgress && total > 0">
          {{ $t('watch_later.add_open_tabs_result', {
            added: openTabsWatchLaterProgress.added,
            skipped: openTabsWatchLaterProgress.skipped,
            failed: openTabsWatchLaterProgress.failed,
          }) }}
        </p>
        <p v-if="openTabsWatchLaterError || openTabsWatchLaterProgress?.message" class="open-tabs-dialog__error" role="alert">
          {{ openTabsWatchLaterError || openTabsWatchLaterProgress?.message }}
        </p>
      </div>

      <div class="open-tabs-dialog__actions">
        <template v-if="!hasStarted">
          <Button type="tertiary" @click="dialogRef?.close()">
            {{ $t('common.operation.cancel') }}
          </Button>
          <Button type="primary" @click="handleConfirm">
            {{ $t('watch_later.confirm_add_open_tabs') }}
          </Button>
        </template>
        <Button v-else type="primary" :disabled="isAddingOpenTabsToWatchLater" @click="dialogRef?.close()">
          {{ $t(isAddingOpenTabsToWatchLater ? 'watch_later.adding_open_tabs' : 'common.close') }}
        </Button>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.open-tabs-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);

  p {
    margin: 0;
  }
}

.open-tabs-dialog__message {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}

.open-tabs-dialog__status {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.open-tabs-dialog__track {
  height: var(--bew-space-2);
  overflow: hidden;
  border-radius: var(--bew-badge-radius);
  background: var(--bew-fill-2);
}

.open-tabs-dialog__fill {
  transition: width var(--bew-duration-fast) var(--bew-ease-standard);
}

.open-tabs-dialog__error {
  color: var(--bew-error-color);
}

.open-tabs-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--bew-space-2);
}
</style>
