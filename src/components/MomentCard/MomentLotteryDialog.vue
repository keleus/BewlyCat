<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Dialog from '~/components/Dialog.vue'

import { isMomentLotteryUrl } from './lottery'

const props = defineProps<{ url: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const frame = ref<HTMLIFrameElement | null>(null)
let frameWindow: Window | null = null
function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape')
    emit('close')
}
function loaded() {
  try {
    frameWindow?.removeEventListener('keydown', closeOnEscape)
    frameWindow = frame.value?.contentWindow || null
    frameWindow?.addEventListener('keydown', closeOnEscape)
  }
  catch {
    frameWindow = null
  }
}
onBeforeUnmount(() => {
  frameWindow?.removeEventListener('keydown', closeOnEscape)
  if (frame.value)
    frame.value.src = 'about:blank'
})
</script>

<template>
  <Dialog
    append-to-bewly-body
    content-flush
    :title="t('moment_card.lottery_details')"
    width="560px"
    max-width="calc(100vw - 16px)"
    content-height="min(509px, calc(100dvh - 120px))"
    :show-footer="false"
    :close-on-confirm="false"
    @close="emit('close')"
  >
    <iframe
      v-if="isMomentLotteryUrl(props.url)"
      ref="frame"
      class="moment-lottery-frame"
      :src="props.url"
      :title="t('moment_card.lottery_details')"
      @load="loaded"
    />
  </Dialog>
</template>

<style scoped>
.moment-lottery-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
