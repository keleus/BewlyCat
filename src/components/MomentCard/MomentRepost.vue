<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Button from '~/components/Button.vue'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'

import type { RichEditorChoice } from './MomentRichEditor.vue'
import MomentRichEditor from './MomentRichEditor.vue'
import { createRepostRequest, pendingReposts, repostDrafts } from './repostEditor'

const props = defineProps<{ momentId: string }>()
const emit = defineEmits<{ close: [], sent: [] }>()
const { t } = useI18n()
const toast = useToast()
const account = useTopBarStore()
const editor = ref<InstanceType<typeof MomentRichEditor> | null>(null)
const commercial = ref<RichEditorChoice>()
const commercialAllowed = ref(false)
const initializing = ref(true)
const initialized = ref(false)
const submitting = ref(false)
const error = ref('')
const maxLength = ref(1000)
const maxMentions = ref(20)
const ownerId = String(getUserID() || '')
const draftKey = `${ownerId}:${props.momentId}`
const uploadId = `${ownerId}_${Math.floor(Date.now() / 1000)}_${Math.floor(Math.random() * 10000)}`
const remaining = computed(() => editor.value?.remaining ?? maxLength.value)
let alive = true
let sent = false

// 请求只附带一个话题，但正文里的每个话题节点都会保留链接。
function currentTopic() {
  return editor.value?.nodes.findLast(node => node.topic)?.topic
}
function checkResponse(response: any) {
  if (response?.code !== 0)
    throw new Error(response?.message || response?.msg || t('moment_card.repost_failed'))
  return response.data
}
async function initialize() {
  initializing.value = true
  error.value = ''
  try {
    if (!getCSRF() || !ownerId)
      throw new Error(t('moment_card.repost_login'))
    const data = checkResponse(await api.moment.getRepostConfig())
    if (!alive)
      return
    maxLength.value = Number(data?.settings?.max_content_length) || 1000
    maxMentions.value = Number(data?.settings?.max_at_count) || 20
    commercialAllowed.value = Boolean(data?.permissions?.commercial?.allowable)
    initialized.value = true
  }
  catch (cause) {
    if (alive)
      error.value = cause instanceof Error ? cause.message : t('moment_card.repost_failed')
  }
  finally {
    if (alive)
      initializing.value = false
  }
}
async function submit() {
  if (submitting.value || !initialized.value || !editor.value)
    return
  if (pendingReposts.has(draftKey)) {
    error.value = t('moment_card.repost_pending')
    return
  }
  editor.value.sync()
  error.value = ''
  if (remaining.value < 0) {
    error.value = t('moment_card.repost_too_long')
    return
  }
  const csrf = getCSRF()
  if (!csrf || String(getUserID() || '') !== ownerId) {
    error.value = t('moment_card.repost_login')
    return
  }
  const request = createRepostRequest(props.momentId, editor.value.nodes, uploadId, currentTopic(), Number(commercial.value?.id) || undefined)
  pendingReposts.add(draftKey)
  submitting.value = true
  try {
    checkResponse(await api.moment.checkRepost({
      content: request.dyn_req.content,
      scene: 4,
      attach_card: request.dyn_req.attach_card,
      csrf,
    }))
    checkResponse(await api.moment.submitRepost({ ...request, csrf }))
    sent = true
    repostDrafts.delete(draftKey)
    toast.success(t('moment_card.repost_success'))
    if (alive)
      emit('sent')
  }
  catch (cause) {
    const message = cause instanceof Error ? cause.message : t('moment_card.repost_failed')
    if (alive)
      error.value = message
    else
      toast.error(message)
  }
  finally {
    pendingReposts.delete(draftKey)
    submitting.value = false
  }
}
onMounted(() => {
  const draft = repostDrafts.get(draftKey)
  if (draft) {
    editor.value?.setNodes(draft.nodes)
    if (draft.commercialId)
      commercial.value = { id: String(draft.commercialId), name: t('moment_card.repost_commercial') }
  }
  void initialize()
})
// 父组件先于编辑器卸载，此时编辑器 DOM 仍在，可以读出最终草稿。
onBeforeUnmount(() => {
  alive = false
  if (sent || !editor.value)
    return
  editor.value.sync()
  const nodes = editor.value.nodes
  if (nodes.length || commercial.value) {
    if (repostDrafts.size >= 50)
      repostDrafts.delete(repostDrafts.keys().next().value!)
    repostDrafts.set(draftKey, { nodes, topic: currentTopic(), commercialId: Number(commercial.value?.id) || undefined })
  }
  else {
    repostDrafts.delete(draftKey)
  }
})
</script>

<template>
  <section class="moment-repost" :aria-label="t('moment_card.repost')" @click.stop @keydown.stop>
    <img v-if="account.userInfo.face" class="moment-repost__avatar" :src="account.userInfo.face" alt="">
    <div class="moment-repost__body">
      <MomentRichEditor
        ref="editor"
        :placeholder="t('moment_card.repost_placeholder')"
        :max-length="maxLength"
        :max-mentions="maxMentions"
        :disabled="submitting"
        :commercial-allowed="commercialAllowed"
        autofocus
        @submit="submit"
        @commercial="choice => commercial = choice"
      >
        <template #attachments>
          <button v-if="commercial" class="moment-repost__selection" type="button" :disabled="submitting" @click="commercial = undefined">
            {{ commercial.name }} <span i-tabler-x aria-hidden="true" />
          </button>
        </template>
        <template #actions>
          <Button
            class="moment-repost__submit" type="primary" size="small" :disabled="initializing || !initialized || remaining < 0" :aria-disabled="submitting"
            :aria-busy="submitting"
            @click="submit"
          >
            <span v-if="submitting" i-svg-spinners:ring-resize aria-hidden="true" />{{ t('moment_card.repost') }}
          </Button>
        </template>
      </MomentRichEditor>
      <p v-if="error" class="moment-repost__error" role="alert">
        {{ error }}
        <button v-if="!initialized" type="button" @click="initialize">
          {{ t('moment_card.repost_retry') }}
        </button>
        <a :href="`https://t.bilibili.com/${momentId}?tab=1`" target="_blank" rel="noopener noreferrer">{{ t('moments.new_tab') }}</a>
      </p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.moment-repost {
  button:not(.bew-segment-control__item):not(.b-button) {
    font: inherit;
    display: inline-flex;
    align-items: center;
    gap: var(--bew-space-1);
    min-height: 32px;
    min-width: 32px;
    padding: var(--bew-space-1) var(--bew-space-2);
    border: 0;
    border-radius: var(--bew-interactive-radius);
    background: transparent;
    color: inherit;
    cursor: pointer;

    &:hover {
      background: var(--bew-fill-2);
      color: var(--bew-theme-color);
    }
    &:active {
      background: var(--bew-fill-3);
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
  p {
    margin: 0;
  }
}
.moment-repost {
  position: relative;
  z-index: 2;
  cursor: default;
  display: flex;
  gap: var(--bew-space-3);
  padding: var(--bew-space-3);
  border-top: 1px solid var(--bew-border-color);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.moment-repost__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}
.moment-repost__body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: var(--bew-space-2);
}
.moment-repost__selection {
  justify-self: start;
}
.moment-repost__error {
  display: grid;
  gap: var(--bew-space-1);
  color: var(--bew-theme-color);
}
@media (max-width: 480px) {
  .moment-repost__avatar {
    display: none;
  }
}
</style>
