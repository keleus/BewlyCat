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
const emit = defineEmits<{
  cancel: []
  openImagePreview: [urls: string[], index: number, trigger: HTMLElement | null]
}>()
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
function previewImage(index: number, event: Event) {
  emit('openImagePreview', images.value.map(image => image.preview), index, event.currentTarget instanceof HTMLElement ? event.currentTarget : null)
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
  if (!draft)
    return
  editor.value?.setNodes(draft.nodes)
  images.value = draft.files.map(file => ({ id: ++imageId, file, preview: URL.createObjectURL(file) }))
})
// 父组件先于编辑器卸载，此时编辑器 DOM 仍在，可以读出最终草稿。
// 正文与图片一起保留，与转发草稿一致：切换转发/评论或收起后再展开都能接着写。
onBeforeUnmount(() => {
  alive = false
  images.value.forEach(image => URL.revokeObjectURL(image.preview))
  if (!editor.value)
    return
  editor.value.sync()
  const nodes = editor.value.nodes
  const files = images.value.map(image => image.file)
  if (nodes.some(node => node.raw_text.trim()) || files.length) {
    if (commentDrafts.size >= 50 && !commentDrafts.has(props.draftKey))
      commentDrafts.delete(commentDrafts.keys().next().value!)
    commentDrafts.set(props.draftKey, { nodes, files })
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
        :accepts-files="!replyName"
        :toolbar-pinned="submitting || images.length > 0"
        @submit="send"
        @paste-files="addImages"
      >
        <template #attachments>
          <ul v-if="images.length" class="moment-comment-composer__images">
            <li v-for="(image, index) in images" :key="image.id">
              <!-- 预览与删除是并列的两个按钮：嵌套时删除键的回车/空格会冒泡成预览 -->
              <button
                type="button"
                class="moment-comment-composer__preview"
                :aria-label="t('moment_card.comment_image', { index: index + 1 })"
                :title="t('moment_card.comment_image', { index: index + 1 })"
                @click="previewImage(index, $event)"
              >
                <img :src="image.preview" alt="">
              </button>
              <button
                type="button"
                class="moment-comment-composer__remove"
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
          <!-- 与 B 站一致：只有主评论可以附图和同时转发，楼中楼回复只有表情与 @ -->
          <button
            v-if="!replyName"
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
            class="bew-segment-control__item moment-comment-composer__sync"
            type="button"
            role="switch"
            :aria-checked="syncToDynamic"
            :disabled="submitting || disabled"
            @mousedown.prevent
            @click="syncToDynamic = !syncToDynamic"
          >
            <span class="moment-comment-composer__sync-track" aria-hidden="true">
              <span class="moment-comment-composer__sync-thumb" />
            </span>
            {{ t('moment_card.comment_sync_repost') }}
          </button>
        </template>
        <template #actions>
          <Button v-if="replyName" size="small" :disabled="submitting" @click="emit('cancel')">
            {{ t('common.operation.cancel') }}
          </Button>
          <span class="moment-comment-composer__shortcut">{{ t('moment_card.comment_send_keys') }}</span>
          <Button
            type="primary"
            size="small"
            :disabled="disabled || empty || remaining < 0"
            :aria-disabled="submitting || disabled || empty || remaining < 0"
            :aria-busy="submitting"
            :title="t('moment_card.comment_send_shortcut')"
            @click="send"
          >
            <span v-if="submitting" class="bew-submit-spinner" aria-hidden="true" /><span class="bew-submit-label" :class="{ 'is-hidden': submitting }">{{ t(replyName ? 'moment_card.comment_reply' : 'moment_card.comment_send') }}</span>
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
    --moment-rich-editor-min-height: 32px;
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
  color: var(--bew-error-color);
}

// 删除按钮以缩略图右上角为圆心外凸半个按钮（12px）：
// 间距与顶部留白都放到 12px，避免压到相邻缩略图和上方正文。
.moment-comment-composer__images {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-3);
  margin: 0;
  padding: var(--bew-space-1) 0 0;
  list-style: none;
}

// 圆角裁切放在预览按钮上，li 不裁切，删除按钮才能伸出图片角。
.moment-comment-composer__images li {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: var(--bew-radius-md);
  background: var(--bew-fill-1);

  // 细框画在图片之上，白底图片也能看清缩略图边界；不拦截点击。
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--bew-border-color);
    pointer-events: none;
  }
}

.moment-comment-composer__images img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-comment-composer__preview {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: zoom-in;

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color);
    outline-offset: -2px;
  }
}

.moment-comment-composer__remove {
  position: absolute;
  z-index: 1;
  // 圆心落在缩略图右上角。
  top: -12px;
  right: -12px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--bew-radius-full);
  color: #fff;
  // 与动态图片画廊的媒体浮层按钮一致，保证在任意图片上都可辨认。
  background: var(--bew-media-button-bg);
  font-size: var(--bew-icon-size-sm);
  cursor: pointer;
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    background: var(--bew-media-button-bg-hover);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color);
    outline-offset: 1px;
  }
}

// 可悬停设备上删除按钮默认隐藏，悬停或键盘聚焦到该缩略图时出现；触屏设备始终显示。
@media (hover: hover) {
  .moment-comment-composer__images li:not(:hover, :focus-within) .moment-comment-composer__remove {
    opacity: 0;
  }
}

.moment-comment-composer__shortcut {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  white-space: nowrap;
}

.moment-comment-composer__sync {
  font-size: var(--bew-font-size-caption);
}

.moment-comment-composer__sync-track {
  position: relative;
  display: block;
  flex: none;
  width: 28px;
  height: 16px;
  border-radius: var(--bew-radius-full);
  background: var(--bew-switch-bg);
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.moment-comment-composer__sync-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--bew-duration-fast) var(--bew-ease-standard);
}

.moment-comment-composer__sync[aria-checked="true"] .moment-comment-composer__sync-track {
  background: var(--bew-theme-color);
}

.moment-comment-composer__sync[aria-checked="true"] .moment-comment-composer__sync-thumb {
  transform: translateX(12px);
}

@media (prefers-reduced-motion: reduce) {
  .moment-comment-composer__sync-track,
  .moment-comment-composer__sync-thumb {
    transition: none;
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
