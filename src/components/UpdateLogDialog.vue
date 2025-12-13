<script setup lang="ts">
import Button from '~/components/Button.vue'
import { useBewlyApp } from '~/composables/useAppProvider'

defineProps<{
  version: string
  changelogUrl: string
}>()

const emit = defineEmits<{
  close: []
  closeAndNeverShow: []
}>()

const { mainAppRef } = useBewlyApp()

function handleClose() {
  emit('close')
}

function handleCloseAndNeverShow() {
  emit('closeAndNeverShow')
}
</script>

<template>
  <Teleport :to="mainAppRef">
    <div
      class="update-log-dialog"
      pos="fixed top-0 left-0" w-full h-full z-10002
      pointer-events-auto
    >
      <div
        bg="black opacity-40 dark:opacity-40"
        pos="absolute top-0 left-0" w-full h-full z-0
      />
      <div
        class="dialog-content"
        style="
          box-shadow: var(--bew-shadow-4), var(--bew-shadow-edge-glow-2);
          backdrop-filter: var(--bew-filter-glass-2);
          background-color: var(--bew-elevated);
          width: 520px;
          max-width: 90vw;
        "
        pos="absolute top-1/2 left-1/2" rounded="$bew-radius" border="1 $bew-border-color"
        transform="translate--1/2" z-2
        antialiased overflow-hidden
      >
        <header
          class="dialog-header"
          pos="relative" w-full px-8 py-6
          text-center
          border="b-1 $bew-border-color"
        >
          <div
            pos="absolute top-0 left-0" w-full h-full
            style="
              background: linear-gradient(135deg, var(--bew-theme-color-20) 0%, transparent 100%);
            "
          />
          <div pos="relative" z-1>
            <div
              class="icon-wrapper"
              w-12 h-12 mx-auto mb-3
              rounded-full
              flex="~ items-center justify-center"
              style="
                background: var(--bew-theme-color-20);
                border: 2px solid var(--bew-theme-color-40);
              "
            >
              <div i-mingcute-horn-line text="2xl $bew-theme-color" />
            </div>
            <h2 text="xl" fw-bold mb-1>
              {{ $t('update_log.title') }}
            </h2>
            <p text="sm $bew-text-2">
              v{{ version }}
            </p>
          </div>
        </header>

        <main class="dialog-main" p="x-8 y-6">
          <div class="update-info">
            <a
              :href="changelogUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="changelog-link"
              block
              p-4
              rounded-lg
              border="1 $bew-border-color hover:$bew-theme-color"
              bg="hover:$bew-theme-color-10"
              transition-all duration-300
              text-decoration-none
            >
              <div flex="~ items-center justify-between">
                <div flex="~ items-center gap-3">
                  <div
                    w-10 h-10
                    rounded-lg
                    flex="~ items-center justify-center"
                    bg="$bew-theme-color-20"
                  >
                    <div i-mingcute-file-info-line text="lg $bew-theme-color" />
                  </div>
                  <div>
                    <div text="sm" fw-medium mb-1>
                      {{ $t('update_log.view_full_changelog') }}
                    </div>
                    <div text="xs $bew-text-3">
                      {{ changelogUrl }}
                    </div>
                  </div>
                </div>
                <div
                  i-mingcute-arrow-right-line
                  text="xl $bew-text-2"
                  transition-transform duration-300
                  class="arrow-icon"
                />
              </div>
            </a>
          </div>
        </main>

        <footer
          class="dialog-footer"
          flex="~ gap-3 justify-end"
          p="x-8 y-6"
          border="t-1 $bew-border-color"
          bg="$bew-fill-1"
        >
          <Button type="tertiary" @click="handleClose">
            {{ $t('update_log.close') }}
          </Button>
          <Button type="primary" @click="handleCloseAndNeverShow">
            {{ $t('update_log.close_and_never_show') }}
          </Button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.changelog-link {
  &:hover {
    .arrow-icon {
      transform: translateX(4px);
    }
  }
}
</style>
