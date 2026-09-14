<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Button from '~/components/Button.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'

import type { RepostNode } from './repostEditor'
import { createRepostRequest, findRepostCompletion, isRepostCompletionBoundary, pendingReposts, readRepostEditor, repostDrafts } from './repostEditor'

interface Choice { id: string, name: string, image?: string, animated?: boolean, type?: number }
interface EmotePackage { id: string, name: string, items: Choice[] }
const props = defineProps<{ momentId: string }>()
const emit = defineEmits<{ close: [], sent: [] }>()
const { t } = useI18n()
const toast = useToast()
const account = useTopBarStore()
const { mainAppRef } = useBewlyApp()
const container = ref<HTMLElement | null>(null)
const panelTriggers = ref<HTMLElement | null>(null)
const popup = ref<HTMLElement | null>(null)
const popupContent = ref<HTMLElement | null>(null)
const popupId = useId()
const activeChoice = ref(0)
const popupStyle = ref<Record<string, string>>({})
let anchorButton: HTMLElement | null = null
let positionFrame = 0
let eventRoot: Node | null = null
const editor = ref<HTMLElement | null>(null)
const nodes = ref<RepostNode[]>([])
const panel = ref<'' | 'emoji' | 'mention' | 'topic' | 'commercial'>('')
const query = ref('')
const choices = ref<Choice[]>([])
const packages = ref<EmotePackage[]>([])
const packageId = ref('')
const topic = ref<{ id: number, name: string }>()
const commercial = ref<Choice>()
const commercialAllowed = ref(false)
const loading = ref(false)
const initializing = ref(true)
const initialized = ref(false)
const submitting = ref(false)
const error = ref('')
const panelError = ref('')
const maxLength = ref(1000)
const maxMentions = ref(20)
const ownerId = String(getUserID() || '')
const draftKey = `${ownerId}:${props.momentId}`
const uploadId = `${ownerId}_${Math.floor(Date.now() / 1000)}_${Math.floor(Math.random() * 10000)}`
const remaining = computed(() => maxLength.value - nodes.value.reduce((sum, node) => sum + node.raw_text.length, 0))
const emotes = computed(() => packages.value.find(item => item.id === packageId.value)?.items || [])
let savedRange: Range | null = null
let completionRange: Range | null = null
let sequence = 0
let timer: ReturnType<typeof setTimeout> | undefined
let alive = true
let sent = false
let history: RepostNode[][] = [[]]
let historyIndex = 0
let restoringHistory = false

function recordHistory() {
  if (restoringHistory || JSON.stringify(history[historyIndex]) === JSON.stringify(nodes.value))
    return
  history = history.slice(0, historyIndex + 1)
  history.push(nodes.value.map(node => ({ ...node })))
  if (history.length > 100)
    history.shift()
  historyIndex = history.length - 1
}
function restoreHistory(direction: -1 | 1) {
  const index = historyIndex + direction
  if (submitting.value || index < 0 || index >= history.length || !editor.value)
    return
  historyIndex = index
  restoringHistory = true
  closePanel()
  editor.value.replaceChildren(...history[index].map(node => node.type === 1 && !node.topic ? document.createTextNode(node.raw_text) : token(node)))
  editor.value.focus({ preventScroll: true })
  const range = document.createRange()
  range.selectNodeContents(editor.value)
  range.collapse(false)
  const selected = selection()
  selected?.removeAllRanges()
  selected?.addRange(range)
  savedRange = range
  sync()
  restoringHistory = false
}

function selection() {
  const root = editor.value?.getRootNode() as ShadowRoot & { getSelection?: () => Selection | null }
  return root?.getSelection?.() || window.getSelection()
}
function rememberSelection() {
  const selected = selection()
  if (selected?.rangeCount && editor.value?.contains(selected.getRangeAt(0).commonAncestorContainer))
    savedRange = selected.getRangeAt(0).cloneRange()
}
function sync() {
  if (editor.value)
    nodes.value = readRepostEditor(editor.value)
  // The request attaches one topic, but every inline topic keeps its link.
  topic.value = nodes.value.findLast(node => node.topic)?.topic
  rememberSelection()
  recordHistory()
}
function closePanel() {
  ++sequence
  clearTimeout(timer)
  panel.value = ''
  anchorButton = null
  completionRange = null
  query.value = ''
  choices.value = []
  loading.value = false
}
function updateCompletion(event?: Event) {
  rememberSelection()
  if ((event as KeyboardEvent)?.isComposing || ['Escape', 'ArrowUp', 'ArrowDown', 'Enter'].includes((event as KeyboardEvent)?.key))
    return
  const match = editor.value && savedRange ? findRepostCompletion(editor.value, savedRange) : null
  if (!match) {
    if (panel.value === 'mention' || panel.value === 'topic')
      closePanel()
    return
  }
  completionRange = match.range
  anchorButton = null
  schedulePosition()
  if (panel.value === match.kind && query.value === match.query)
    return
  ++sequence
  clearTimeout(timer)
  panel.value = match.kind
  query.value = match.query
  choices.value = []
  activeChoice.value = 0
  panelError.value = ''
  loading.value = true
  timer = setTimeout(loadPanel, 250)
}
function input(event: Event) {
  sync()
  if ((event as InputEvent).isComposing) {
    if (panel.value === 'mention' || panel.value === 'topic')
      closePanel()
    return
  }
  updateCompletion()
}
function insert(node: Node) {
  const root = editor.value
  if (!root || submitting.value)
    return
  root.focus({ preventScroll: true })
  const range = savedRange && root.contains(savedRange.commonAncestorContainer) ? savedRange : document.createRange()
  if (range !== savedRange) {
    range.selectNodeContents(root)
    range.collapse(false)
  }
  const selected = selection()
  selected?.removeAllRanges()
  selected?.addRange(range)
  range.deleteContents()
  const end = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? node.lastChild : node
  range.insertNode(node)
  if (end)
    range.setStartAfter(end)
  range.collapse(true)
  selected?.removeAllRanges()
  selected?.addRange(range)
  savedRange = range.cloneRange()
  sync()
}
function token(node: RepostNode, image = node.image) {
  const el = document.createElement(node.type === 2 || node.topic ? 'a' : 'span')
  el.draggable = false
  if (el instanceof HTMLAnchorElement) {
    el.href = node.topic
      ? `https://www.bilibili.com/v/topic/detail/?topic_id=${node.topic.id}`
      : `https://space.bilibili.com/${node.biz_id}`
    el.tabIndex = -1
  }
  if (node.topic) {
    el.dataset.topicId = String(node.topic.id)
    el.dataset.topicName = node.topic.name
  }
  el.contentEditable = 'false'
  el.dataset.repostType = String(node.type)
  el.dataset.text = node.raw_text
  el.dataset.uid = node.biz_id
  el.dataset.animated = String(Boolean(node.animated))
  el.className = 'moment-repost__token'
  if (image) {
    const img = document.createElement('img')
    img.draggable = false
    img.src = image
    img.alt = node.raw_text
    el.append(img)
  }
  else {
    el.textContent = node.raw_text
  }
  return el
}
function insertText(text: string) {
  insert(document.createTextNode(text.replace(/\r\n?/g, '\n')))
}
function paste(event: ClipboardEvent) {
  event.preventDefault()
  rememberSelection()
  insertText(event.clipboardData?.getData('text/plain') || '')
  updateCompletion()
}
function beforeInput(event: Event) {
  const input = event as InputEvent
  if (input.inputType === 'historyUndo' || input.inputType === 'historyRedo') {
    event.preventDefault()
    restoreHistory(input.inputType === 'historyUndo' ? -1 : 1)
    return
  }
  if (input.inputType === 'insertParagraph' || input.inputType === 'insertLineBreak') {
    event.preventDefault()
    rememberSelection()
    insertText('\n')
    updateCompletion()
  }
}
function keyboard(event: KeyboardEvent) {
  if (event.isComposing)
    return
  if (editor.value?.contains(event.target as Node)
    && (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault()
    restoreHistory(event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1)
    return
  }
  if ((panel.value === 'mention' || panel.value === 'topic') && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && choices.value.length) {
      event.preventDefault()
      activeChoice.value = (activeChoice.value + (event.key === 'ArrowDown' ? 1 : -1) + choices.value.length) % choices.value.length
      void nextTick(() => popup.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
      return
    }
    if (event.key === 'Enter' && choices.value[activeChoice.value]) {
      event.preventDefault()
      choose(choices.value[activeChoice.value])
      return
    }
  }
  if (event.key === 'Escape' && panel.value) {
    event.preventDefault()
    closePanel()
    editor.value?.focus({ preventScroll: true })
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    void submit()
  }
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
async function loadPanel() {
  const current = ++sequence
  const kind = panel.value
  activeChoice.value = 0
  panelError.value = ''
  choices.value = []
  if (!kind)
    return
  loading.value = true
  try {
    if (kind === 'emoji') {
      if (!packages.value.length) {
        const data = checkResponse(await api.moment.getRepostEmotes())
        if (!alive || current !== sequence)
          return
        packages.value = (data?.packages || []).map((pack: any) => ({
          id: String(pack.id),
          name: String(pack.text),
          items: (pack.emote || []).map((item: any) => ({
            id: String(item.id),
            name: String(item.text),
            type: Number(item.type ?? pack.type),
            image: String(item.webp_url || item.gif_url || item.url || '').replace(/^http:/, 'https:'),
            animated: Boolean(item.gif_url),
          })),
        }))
        packageId.value = packages.value[0]?.id || ''
      }
    }
    else {
      const response = kind === 'mention'
        ? await api.moment.searchRepostMentions({ keyword: query.value })
        : kind === 'topic'
          ? await api.moment.searchRepostTopics({ keywords: query.value })
          : await api.moment.getRepostCommercialOrders()
      if (!alive || current !== sequence)
        return
      if (kind === 'commercial') {
        if (response?.code !== 0)
          throw new Error(response?.message || t('moment_card.repost_failed'))
        choices.value = (response.result || []).map((item: any) => ({ id: String(item.id), name: item.title }))
      }
      else {
        const data = checkResponse(response)
        choices.value = kind === 'mention'
          ? (data.groups || []).flatMap((group: any) => (group.items || []).map((item: any) => ({ id: String(item.uid), name: item.name, image: item.face })))
          : (data.topic_items || []).map((item: any) => ({ id: String(item.id), name: item.name }))
      }
    }
  }
  catch (cause) {
    if (alive && current === sequence)
      panelError.value = cause instanceof Error ? cause.message : t('moment_card.repost_failed')
  }
  finally {
    if (alive && current === sequence)
      loading.value = false
  }
}
function openPanel(kind: typeof panel.value, event?: MouseEvent) {
  rememberSelection()
  if (panel.value === kind) {
    closePanel()
    editor.value?.focus({ preventScroll: true })
    return
  }
  closePanel()
  if (kind === 'mention' || kind === 'topic') {
    const prefix = editor.value && savedRange && !isRepostCompletionBoundary(editor.value, savedRange) ? ' ' : ''
    const suffix = editor.value && savedRange && !isRepostCompletionBoundary(editor.value, savedRange, 'after') ? ' ' : ''
    const trigger = document.createTextNode(`${prefix}${kind === 'mention' ? '@' : '#'}${suffix}`)
    insert(trigger)
    if (suffix && savedRange) {
      savedRange.setStart(trigger, trigger.length - suffix.length)
      savedRange.collapse(true)
      const selected = selection()
      selected?.removeAllRanges()
      selected?.addRange(savedRange)
    }
    updateCompletion()
    anchorButton = event?.currentTarget as HTMLElement | null
    schedulePosition()
    return
  }
  anchorButton = event?.currentTarget as HTMLElement | null
  panel.value = kind
  editor.value?.focus({ preventScroll: true })
  void loadPanel()
}
function choose(item: Choice) {
  if (panel.value === 'mention') {
    if (nodes.value.filter(node => node.type === 2).length >= maxMentions.value) {
      panelError.value = t('moment_card.repost_mentions_limit', { count: maxMentions.value })
      return
    }
    if (!completionRange)
      return
    savedRange = completionRange.cloneRange()
    const fragment = document.createDocumentFragment()
    fragment.append(token({ type: 2, raw_text: `@${item.name}`, biz_id: item.id }), document.createTextNode(' '))
    insert(fragment)
  }
  else if (panel.value === 'emoji') {
    if (item.animated && nodes.value.filter(node => node.animated).length >= 20) {
      panelError.value = t('moment_card.repost_emoji_limit')
      return
    }
    if (item.type === 4)
      insertText(item.name)
    else
      insert(token({ type: 9, raw_text: item.name, biz_id: '', animated: item.animated }, item.image))
  }
  else if (panel.value === 'topic') {
    if (!completionRange)
      return
    savedRange = completionRange.cloneRange()
    const fragment = document.createDocumentFragment()
    fragment.append(token({ type: 1, raw_text: `#${item.name}#`, biz_id: '', topic: { id: Number(item.id), name: item.name } }), document.createTextNode(' '))
    insert(fragment)
  }
  else {
    commercial.value = item
  }
  if (panel.value !== 'emoji')
    closePanel()
}
async function submit() {
  if (submitting.value || !initialized.value)
    return
  if (pendingReposts.has(draftKey)) {
    error.value = t('moment_card.repost_pending')
    return
  }
  sync()
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
  const request = createRepostRequest(props.momentId, nodes.value, uploadId, topic.value, Number(commercial.value?.id) || undefined)
  pendingReposts.add(draftKey)
  submitting.value = true
  closePanel()
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
function schedulePosition() {
  if (positionFrame || !panel.value)
    return
  positionFrame = requestAnimationFrame(() => {
    positionFrame = 0
    positionPopup()
  })
}
function positionPopup() {
  if (!panel.value || !editor.value || !popup.value)
    return
  const editorRect = editor.value.getBoundingClientRect()
  if (editorRect.bottom < 0 || editorRect.top > window.innerHeight) {
    closePanel()
    return
  }
  const caret = savedRange?.cloneRange()
  caret?.collapse(false)
  const caretRect = caret?.getClientRects()[0]
  const anchor = anchorButton?.getBoundingClientRect() || (caretRect?.height ? caretRect : editorRect)
  const margin = 8
  const width = Math.min(320, window.innerWidth - margin * 2)
  const below = window.innerHeight - anchor.bottom - margin * 2
  const above = anchor.top - margin * 2
  const openUp = below < (panel.value === 'emoji' ? 320 : 240) && above > below
  popupStyle.value = {
    left: `${Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin))}px`,
    top: `${Math.max(margin, openUp ? anchor.top - margin : anchor.bottom + margin)}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(0, Math.min(320, openUp ? above : below))}px`,
    transform: openUp ? 'translateY(-100%)' : '',
  }
}
function onOutsideInteraction(event: Event) {
  if (!panel.value)
    return
  const path = event.composedPath()
  if (path.includes(popup.value!)
    || path.some(target => target instanceof HTMLButtonElement && panelTriggers.value?.contains(target))) {
    return
  }
  // Opening a picker and inserting a choice both return focus to the editor.
  if (event.type === 'focusin' && path.includes(editor.value!))
    return
  closePanel()
}
function onEditorClick(event: MouseEvent) {
  if ((event.target as Element).closest('a'))
    event.preventDefault()
}
watch([panel, choices, loading, packageId], () => {
  void nextTick(schedulePosition)
})
watch(packageId, () => {
  if (popupContent.value)
    popupContent.value.scrollTop = 0
}, { flush: 'post' })
onMounted(() => {
  eventRoot = editor.value?.getRootNode() || document
  eventRoot.addEventListener('pointerdown', onOutsideInteraction, true)
  eventRoot.addEventListener('focusin', onOutsideInteraction, true)
  eventRoot.addEventListener('scroll', schedulePosition, true)
  if (eventRoot !== document) {
    document.addEventListener('pointerdown', onOutsideInteraction, true)
    document.addEventListener('focusin', onOutsideInteraction, true)
  }
  window.addEventListener('resize', schedulePosition)
  window.addEventListener('scroll', schedulePosition, true)
  const draft = repostDrafts.get(draftKey)
  if (draft) {
    for (const node of draft.nodes)
      editor.value?.append(node.type === 1 && !node.topic ? document.createTextNode(node.raw_text) : token(node))
    topic.value = draft.topic
    if (draft.commercialId)
      commercial.value = { id: String(draft.commercialId), name: t('moment_card.repost_commercial') }
    sync()
  }
  history = [nodes.value.map(node => ({ ...node }))]
  historyIndex = 0
  void initialize()
  editor.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
  eventRoot?.removeEventListener('pointerdown', onOutsideInteraction, true)
  eventRoot?.removeEventListener('focusin', onOutsideInteraction, true)
  eventRoot?.removeEventListener('scroll', schedulePosition, true)
  document.removeEventListener('pointerdown', onOutsideInteraction, true)
  document.removeEventListener('focusin', onOutsideInteraction, true)
  window.removeEventListener('resize', schedulePosition)
  window.removeEventListener('scroll', schedulePosition, true)
  cancelAnimationFrame(positionFrame)
  alive = false
  ++sequence
  clearTimeout(timer)
  if (!sent) {
    sync()
    if (nodes.value.length || topic.value || commercial.value) {
      if (repostDrafts.size >= 50)
        repostDrafts.delete(repostDrafts.keys().next().value!)
      repostDrafts.set(draftKey, { nodes: nodes.value, topic: topic.value, commercialId: Number(commercial.value?.id) || undefined })
    }
    else {
      repostDrafts.delete(draftKey)
    }
  }
})
</script>

<template>
  <section ref="container" class="moment-repost" :aria-label="t('moment_card.repost')" @click.stop @keydown.stop="keyboard">
    <img v-if="account.userInfo.face" class="moment-repost__avatar" :src="account.userInfo.face" alt="">
    <div class="moment-repost__body">
      <div class="moment-repost__editor-wrap">
        <div
          ref="editor"
          class="moment-repost__editor"
          role="textbox"
          aria-multiline="true"
          aria-autocomplete="list"
          :aria-controls="panel === 'mention' || panel === 'topic' ? popupId : undefined"
          :aria-activedescendant="(panel === 'mention' || panel === 'topic') && choices.length ? `${popupId}-${activeChoice}` : undefined"
          :aria-label="t('moment_card.repost_placeholder')"
          :data-placeholder="t('moment_card.repost_placeholder')"
          :contenteditable="!submitting"
          :aria-readonly="submitting"
          @input="input"
          @compositionend="input"
          @mouseup="rememberSelection"
          @keyup="updateCompletion"
          @beforeinput="beforeInput"
          @paste="paste"
          @click="onEditorClick"
          @dragstart.prevent
          @drop.prevent
        />
        <button v-if="commercial" class="moment-repost__selection" type="button" :disabled="submitting" @click="commercial = undefined">
          {{ commercial.name }} <span i-tabler-x aria-hidden="true" />
        </button>
      </div>
      <div class="moment-repost__toolbar">
        <div ref="panelTriggers" class="moment-repost__tools bew-segment-control bew-segment-control--surface bew-segment-control--static">
          <button
            class="bew-segment-control__item bew-segment-control__item--icon"
            type="button" :title="t('moments.emoji')" :aria-label="t('moments.emoji')" :aria-expanded="panel === 'emoji'" :data-active="panel === 'emoji'"
            :disabled="submitting"
            @mousedown.prevent
            @click="openPanel('emoji', $event)"
          >
            <span i-tabler-mood-smile />
          </button>
          <button
            class="bew-segment-control__item bew-segment-control__item--icon"
            type="button" :title="t('moment_card.repost_mention')" :aria-label="t('moment_card.repost_mention')" :aria-expanded="panel === 'mention'" :data-active="panel === 'mention'"
            :disabled="submitting"
            @mousedown.prevent
            @click="openPanel('mention', $event)"
          >
            <span i-tabler-at />
          </button>
          <button
            class="bew-segment-control__item bew-segment-control__item--icon"
            type="button" :title="t('moment_card.repost_topic')" :aria-label="t('moment_card.repost_topic')" :aria-expanded="panel === 'topic'" :data-active="panel === 'topic'"
            :disabled="submitting"
            @mousedown.prevent
            @click="openPanel('topic', $event)"
          >
            <span i-tabler-hash />
          </button>
          <button
            v-if="commercialAllowed"
            class="bew-segment-control__item bew-segment-control__item--icon" :data-active="panel === 'commercial'" type="button" :title="t('moment_card.repost_commercial')" :aria-label="t('moment_card.repost_commercial')"
            :disabled="submitting"
            @mousedown.prevent
            @click="openPanel('commercial', $event)"
          >
            <span i-tabler-ad />
          </button>
        </div>
        <span class="moment-repost__count" :class="{ 'is-over': remaining < 0 }" aria-live="polite">{{ remaining }}</span>
        <Button
          class="moment-repost__submit" type="primary" size="small" :disabled="initializing || !initialized || remaining < 0" :aria-disabled="submitting"
          :aria-busy="submitting"
          @click="submit"
        >
          <span v-if="submitting" i-svg-spinners:ring-resize aria-hidden="true" />{{ t('moment_card.repost') }}
        </Button>
      </div>
      <Teleport :to="mainAppRef" :disabled="!mainAppRef">
        <div
          v-if="panel" :id="popupId" ref="popup" class="moment-repost__panel bew-popover-surface"
          :class="{ 'moment-repost__panel--emoji': panel === 'emoji' }" :style="popupStyle"
          @click.stop @keydown.stop="keyboard" @mousedown.prevent
        >
          <div v-if="panel === 'emoji' && packages.length" class="moment-repost__packages">
            <button v-for="pack in packages" :key="pack.id" type="button" :aria-pressed="pack.id === packageId" @click="packageId = pack.id">
              {{ pack.name }}
            </button>
          </div>
          <div ref="popupContent" class="moment-repost__panel-content">
            <p v-if="loading" role="status">
              {{ t('moments.loading_detail') }}
            </p>
            <p v-else-if="panelError" role="alert">
              {{ panelError }} <button type="button" @click="loadPanel">
                {{ t('moment_card.repost_retry') }}
              </button>
            </p>
            <div
              v-else-if="panel === 'emoji'" class="moment-repost__emotes"
              :class="{ 'moment-repost__emotes--text': emotes.some(item => item.type === 4) }"
            >
              <button
                v-for="item in emotes" :key="item.id" type="button" :title="item.name" :aria-label="item.name"
                @click="choose(item)"
              >
                <span v-if="item.type === 4">{{ item.name }}</span>
                <img v-else :src="item.image" :alt="item.name" loading="lazy">
              </button>
            </div>
            <div v-else class="moment-repost__choices" role="listbox" :aria-label="t(panel === 'mention' ? 'moment_card.repost_mention' : 'moment_card.repost_topic')">
              <button
                v-for="(item, index) in choices" :id="`${popupId}-${index}`" :key="`${item.id}-${index}`" type="button" role="option"
                :aria-selected="activeChoice === index" @mouseenter="activeChoice = index" @click="choose(item)"
              >
                <img v-if="item.image" :src="item.image" alt="" loading="lazy">{{ item.name }}
              </button>
              <p v-if="!choices.length">
                {{ t('moment_card.repost_no_results') }}
              </p>
            </div>
          </div>
        </div>
      </Teleport>
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
.moment-repost,
.moment-repost__panel {
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

    &:hover,
    &[aria-selected="true"],
    &[aria-pressed="true"],
    &[aria-expanded="true"] {
      background: var(--bew-fill-2);
      color: var(--bew-theme-color);
    }
    &:active {
      background: var(--bew-fill-3);
    }
    &:disabled,
    &[aria-disabled="true"] {
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
.moment-repost__editor-wrap {
  padding: var(--bew-space-3);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  background: transparent;
  cursor: text;
  transition: border-color var(--bew-duration-fast);

  &:focus-within {
    border-color: var(--bew-theme-color);
  }
}
.moment-repost__editor {
  min-height: 64px;
  max-height: 240px;
  overflow: auto;
  // Empty/short drafts must pass the wheel to the feed; contain traps it even without overflow.
  overscroll-behavior: auto;
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  // The wrapper provides the focus indicator for the whole input.
  &:focus,
  &:focus-visible {
    outline: none;
    box-shadow: none;
  }
  &:empty::before {
    content: attr(data-placeholder);
    color: var(--bew-text-3);
    pointer-events: none;
  }
  :deep(.moment-repost__token) {
    color: var(--bew-theme-color);
    cursor: text;
    text-decoration: none;
    user-select: text;
    -webkit-user-select: text;
    -webkit-user-drag: none;
  }
  :deep(img) {
    pointer-events: none;
    -webkit-user-drag: none;
    display: inline-block;
    width: 24px;
    height: 24px;
    vertical-align: middle;
  }
}
.moment-repost__toolbar {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  flex-wrap: wrap;
}
.moment-repost__tools span {
  font-size: var(--bew-icon-size-md);
}

.moment-repost__count {
  margin-left: auto;
  color: var(--bew-text-3);
}
.moment-repost__count.is-over,
.moment-repost__error {
  color: var(--bew-theme-color);
}
.moment-repost__panel {
  position: fixed;
  z-index: 10004;
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2);
  box-sizing: border-box;
  overflow: hidden;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.moment-repost__panel--emoji {
  height: 320px;
}
.moment-repost__panel-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.moment-repost__packages {
  display: flex;
  flex: none;
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior: contain;
}
.moment-repost__packages button {
  flex-shrink: 0;
}
.moment-repost__emotes {
  display: grid;
  align-content: start;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
}
.moment-repost__emotes--text {
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  overflow-wrap: anywhere;
}
.moment-repost__emotes button {
  justify-content: center;
  min-width: 0;
}
.moment-repost__emotes img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.moment-repost__choices {
  display: grid;
}
.moment-repost__choices button {
  justify-content: flex-start;
  text-align: left;
}
.moment-repost__choices img {
  width: 24px;
  height: 24px;
  border-radius: 50%;
}
.moment-repost__choices,
.moment-repost__emotes {
  min-height: 0;
}
.moment-repost__error {
  display: grid;
  gap: var(--bew-space-1);
}
@media (max-width: 480px) {
  .moment-repost__avatar {
    display: none;
  }
}
</style>
