<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import { useTopBarStore } from '~/stores/topBarStore'

import MomentRichEditor from './MomentRichEditor.vue'
import { commentDrafts } from './repostEditor'
import type { CommentPicture, CommentSubmission } from './useMomentComments'

const props = defineProps<{
  draftKey: string
  placeholder: string
  /** 回复对象的用户名；为空时是发表一级评论 */
  replyName?: string
  disabled?: boolean
  autofocus?: boolean
  /** 一级评论可切换“评论并转发”，同时把评论转发到自己的动态 */
  canSyncToDynamic?: boolean
  submit: (submission: CommentSubmission) => Promise<void>
  upload: (file: File) => Promise<CommentPicture>
}>()
const emit = defineEmits<{ cancel: [] }>()
const { t } = useI18n()
const account = useTopBarStore()
const editor = ref<InstanceType<typeof MomentRichEditor> | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const images = ref<Array<{ id: number, file: File, preview: string }>>([])
const submitting = ref(false)
const syncToDynamic = ref(false)
const error = ref('')
const MAX_LENGTH = 1000
const MAX_IMAGES = 9
const MAX_IMAGE_SIZE = 20 * 1024 * 1024
let imageId = 0
let alive = true
const remaining = computed(() => editor.value?.remaining ?? MAX_LENGTH)
const empty = computed(() => !editor.value?.nodes.some(node => node.raw_text.trim()) && !images.value.length)

function addImages(files: File[]) {
  error.value = ''
  for (const file of files) {
    if (images.value.length >= MAX_IMAGES) {
      error.value = t('moment_card.comment_image_limit', { count: MAX_IMAGES })
      break
    }
    if (!file.type.startsWith('image/')) {
      error.value = t('moment_card.comment_image_invalid')
      continue
    }
    if (file.size > MAX_IMAGE_SIZE) {
      error.value = t('moment_card.comment_image_too_large', { size: MAX_IMAGE_SIZE / 1024 / 1024 })
      continue
    }
    images.value.push({ id: ++imageId, file, preview: URL.createObjectURL(file) })
  }
}
function pickImages(event: Event) {
  const input = event.target as HTMLInputElement
  addImages(Array.from(input.files || []))
  input.value = ''
  editor.value?.focus()
}
function removeImage(id: number) {
  const image = images.value.find(item => item.id === id)
  if (image)
    URL.revokeObjectURL(image.preview)
  images.value = images.value.filter(item => item.id !== id)
}

async function send() {
  if (submitting.value || props.disabled || !editor.value)
    return
  editor.value.sync()
  error.value = ''
  if (remaining.value < 0) {
    error.value = t('moment_card.repost_too_long')
    return
  }
  if (empty.value)
    return
  const nodes = editor.value.nodes
  const atNameToMid: Record<string, number> = {}
  for (const node of nodes) {
    if (node.type === 2 && /^\d+$/.test(node.biz_id))
      atNameToMid[node.raw_text.replace(/^@/, '')] ??= Number(node.biz_id)
  }
  submitting.value = true
  try {
    const pictures = await Promise.all(images.value.map(image => props.upload(image.file)))
    await props.submit({
      message: nodes.map(node => node.raw_text).join('').trim(),
      atNameToMid,
      pictures,
      syncToDynamic: !props.replyName && props.canSyncToDynamic && syncToDynamic.value,
    })
    // 发送途中收起评论区时卸载钩子已存下草稿，成功后一并清除。
    commentDrafts.delete(props.draftKey)
    if (!alive)
      return
    images.value.forEach(image => URL.revokeObjectURL(image.preview))
    images.value = []
    syncToDynamic.value = false
    editor.value?.setNodes([])
    if (props.replyName)
      emit('cancel')
  }
  catch (cause) {
    if (alive)
      error.value = cause instanceof Error ? cause.message : t('moment_card.comment_send_failed')
  }
  finally {
    if (alive)
      submitting.value = false
  }
}

onMounted(() => {
  const draft = commentDrafts.get(props.draftKey)
  if (draft)
    editor.value?.setNodes(draft)
})
// 父组件先于编辑器卸载，此时编辑器 DOM 仍在，可以读出最终草稿。
onBeforeUnmount(() => {
  alive = false
  images.value.forEach(image => URL.revokeObjectURL(image.preview))
  if (!editor.value)
    return
  editor.value.sync()
  if (editor.value.nodes.some(node => node.raw_text.trim())) {
    if (commentDrafts.size >= 50 && !commentDrafts.has(props.draftKey))
      commentDrafts.delete(commentDrafts.keys().next().value!)
    commentDrafts.set(props.draftKey, editor.value.nodes)
  }
  else {
    commentDrafts.delete(props.draftKey)
  }
})
</script>

<template>
  <section
    class="moment-comment-composer"
    :class="{ 'is-reply': replyName }"
    :aria-label="replyName ? t('moment_card.comment_reply_to', { name: replyName }) : t('moment_card.comment_send')"
    @click.stop
    @keydown.stop
  >
    <img v-if="!replyName && account.userInfo.face" class="moment-comment-composer__avatar" :src="account.userInfo.face" alt="">
    <div class="moment-comment-composer__body">
      <p v-if="replyName" class="moment-comment-composer__target">
        {{ t('moment_card.comment_reply_to', { name: replyName }) }}
      </p>
      <MomentRichEditor
        ref="editor"
        :placeholder="placeholder"
        :max-length="MAX_LENGTH"
        :disabled="submitting || disabled"
        :autofocus="autofocus"
        @submit="send"
        @paste-files="addImages"
      >
        <template #attachments>
          <ul v-if="images.length" class="moment-comment-composer__images">
            <li v-for="(image, index) in images" :key="image.id">
              <img :src="image.preview" :alt="t('moment_card.comment_image', { index: index + 1 })">
              <button
                type="button"
                :disabled="submitting"
                :aria-label="t('moment_card.comment_image_remove', { index: index + 1 })"
                :title="t('moment_card.comment_image_remove', { index: index + 1 })"
                @click="removeImage(image.id)"
              >
                <span i-tabler-x aria-hidden="true" />
              </button>
            </li>
          </ul>
        </template>
        <template #tools>
          <button
            class="bew-segment-control__item bew-segment-control__item--icon"
            type="button"
            :title="t('moment_card.comment_image_add')"
            :aria-label="t('moment_card.comment_image_add')"
            :disabled="submitting || disabled || images.length >= MAX_IMAGES"
            @mousedown.prevent
            @click="fileInput?.click()"
          >
            <span i-tabler-photo />
          </button>
          <button
            v-if="!replyName && canSyncToDynamic"
            class="bew-segment-control__item bew-segment-control__item--icon"
            type="button"
            :title="t('moment_card.comment_sync_repost')"
            :aria-label="t('moment_card.comment_sync_repost')"
            :aria-pressed="syncToDynamic"
            :data-active="syncToDynamic"
            :disabled="submitting || disabled"
            @mousedown.prevent
            @click="syncToDynamic = !syncToDynamic"
          >
            <span i-tabler-share-3 />
          </button>
        </template>
        <template #actions>
          <Button v-if="replyName" size="small" :disabled="submitting" @click="emit('cancel')">
            {{ t('common.operation.cancel') }}
          </Button>
          <Button
            type="primary"
            size="small"
            :disabled="disabled || empty || remaining < 0"
            :aria-disabled="submitting"
            :aria-busy="submitting"
            :title="t('moment_card.comment_send_shortcut')"
            @click="send"
          >
            <span v-if="submitting" i-svg-spinners:ring-resize aria-hidden="true" />{{ t(replyName ? 'moment_card.comment_reply' : 'moment_card.comment_send') }}
          </Button>
        </template>
      </MomentRichEditor>
      <input
        ref="fileInput"
        class="moment-comment-composer__file"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        tabindex="-1"
        aria-hidden="true"
        @change="pickImages"
      >
      <p v-if="error" class="moment-comment-composer__error" role="alert">
        {{ error }}
      </p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.moment-comment-composer {
  display: flex;
  gap: var(--bew-space-3);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  cursor: default;
  --moment-rich-editor-min-height: 48px;

  &.is-reply {
    --moment-rich-editor-min-height: 24px;
  }
}

.moment-comment-composer__avatar {
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 50%;
}

.moment-comment-composer__body {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: var(--bew-space-2);
}

.moment-comment-composer__target,
.moment-comment-composer__error {
  margin: 0;
  overflow-wrap: anywhere;
}

.moment-comment-composer__target {
  color: var(--bew-text-2);
}

.moment-comment-composer__error {
  color: var(--bew-theme-color);
}

.moment-comment-composer__images {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.moment-comment-composer__images li {
  position: relative;
  width: 64px;
  height: 64px;
  overflow: hidden;
  border-radius: var(--bew-radius-md);
  background: var(--bew-fill-1);
}

.moment-comment-composer__images img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-comment-composer__images button {
  position: absolute;
  top: var(--bew-space-1);
  right: var(--bew-space-1);
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--bew-radius-full);
  color: #fff;
  // 与动态图片画廊的媒体浮层按钮一致，保证在任意图片上都可辨认。
  background: rgb(15 20 25 / 72%);
  font-size: var(--bew-icon-size-sm);
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color);
    outline-offset: 1px;
  }
}

.moment-comment-composer__file {
  display: none;
}

@media (max-width: 480px) {
  .moment-comment-composer__avatar {
    display: none;
  }
}
</style>
