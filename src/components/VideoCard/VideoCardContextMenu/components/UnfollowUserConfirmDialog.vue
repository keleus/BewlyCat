<script lang="ts" setup>
import type { Video } from '~/components/VideoCard/types'

const props = defineProps<{
  modelValue: boolean
  video: Video
}>()

const emit = defineEmits<{
  (event: 'confirm'): void
  (event: 'close'): void
}>()

const showDialog = defineModel<boolean>()

const authorName = computed(() => {
  if (Array.isArray(props.video.author)) {
    return props.video.author[0]?.name || ''
  }
  return props.video.author?.name || ''
})

function handleConfirm() {
  emit('confirm')
  showDialog.value = false
}

function handleClose() {
  showDialog.value = false
  emit('close')
}
</script>

<template>
  <Dialog
    v-if="showDialog"
    :title="$t('video_card.unfollow_user_confirm.title')"
    width="420px"
    append-to-bewly-body
    @close="handleClose"
    @confirm="handleConfirm"
  >
    <div flex="~ col gap-4">
      <p text="$bew-text-1">
        {{ $t('video_card.unfollow_user_confirm.message', { name: authorName }) }}
      </p>
      <p text="$bew-text-3 sm">
        {{ $t('video_card.unfollow_user_confirm.warning') }}
      </p>
    </div>
  </Dialog>
</template>
