<script setup lang="ts">
import { ref } from 'vue'

import UpdateLogDialog from '~/components/UpdateLogDialog.vue'

defineProps<{
  version: string
  changelogUrl: string
}>()

const emit = defineEmits<{
  closeAndNeverShow: []
}>()

const showDialog = ref(false)
const showNotifier = ref(true)

function handleOpenDialog() {
  showDialog.value = true
}

function handleCloseDialog() {
  showDialog.value = false
}

function handleCloseAndNeverShow() {
  showDialog.value = false
  showNotifier.value = false
  emit('closeAndNeverShow')
}
</script>

<template>
  <!-- Notification Icon in bottom left corner -->
  <Transition name="notifier">
    <div
      v-if="showNotifier && !showDialog"
      class="update-log-notifier"
      pos="fixed bottom-6 left-6"
      z-10001
      @click="handleOpenDialog"
    >
      <div
        class="notifier-button"
        w-14 h-14
        rounded-full
        flex="~ items-center justify-center"
        cursor-pointer
        style="
          background: var(--bew-theme-color);
          box-shadow: var(--bew-shadow-3), 0 0 20px var(--bew-theme-color-40);
        "
        transition-all duration-300
        hover:scale-110
        animate-pulse
      >
        <div
          i-mingcute-horn-line
          text="2xl white"
        />
      </div>

      <!-- Tooltip -->
      <div
        class="tooltip"
        pos="absolute bottom-full left-1/2"
        transform="translate-x--1/2"
        mb-2
        px-3 py-2
        rounded-lg
        bg="$bew-elevated"
        border="1 $bew-border-color"
        text="sm nowrap $bew-text-1"
        pointer-events-none
        opacity-0
        transition-opacity duration-200
        style="
          box-shadow: var(--bew-shadow-2);
          backdrop-filter: var(--bew-filter-glass-1);
        "
      >
        {{ $t('update_log.new_version_available') }}
        <div
          pos="absolute top-full left-1/2"
          transform="translate-x--1/2"
          w-0 h-0
          border="4 transparent t-$bew-border-color"
        />
      </div>
    </div>
  </Transition>

  <!-- Dialog -->
  <UpdateLogDialog
    v-if="showDialog"
    :version="version"
    :changelog-url="changelogUrl"
    @close="handleCloseDialog"
    @close-and-never-show="handleCloseAndNeverShow"
  />
</template>

<style lang="scss" scoped>
.notifier-enter-active,
.notifier-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.notifier-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.8);
}

.notifier-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.8);
}

.update-log-notifier {
  .notifier-button:hover + .tooltip {
    opacity: 1;
  }
}
</style>
