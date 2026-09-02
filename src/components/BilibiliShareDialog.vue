<script setup lang="ts">
import QRCodeCanvas from 'qrcode.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import bilibiliBrandLogoUrl from '~/assets/branding/bilibili-brand-logo.png'
import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import Icon from '~/components/Icon.vue'
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { BilibiliShareDialogRequest } from '~/contentScripts/bilibiliShareControl'
import { settings } from '~/logic'
import type { VideoShareSession } from '~/utils/bilibiliShare'
import { formatTimestamp, isNativeShareEntryEnabled, readCurrentTime, updateShareSession } from '~/utils/bilibiliShare'
import type { PosterLabels, RenderPosterResult } from '~/utils/bilibiliSharePoster'
import {
  canvasToPngBlob,
  copyCanvasImage,
  renderPoster,
  safePosterFilename,
} from '~/utils/bilibiliSharePoster'
import { findLeafActiveElement } from '~/utils/element'

const props = defineProps<{
  request: BilibiliShareDialogRequest
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const toast = useToast()
const { mainAppRef } = useBewlyApp()
const dialogRef = ref<{
  close: () => void
  getDialogPanel: () => HTMLElement | null
} | null>(null)
const shareSession = ref<VideoShareSession>({ ...props.request.session })
const activeTab = ref<'quick' | 'poster'>('quick')
const posterState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const operation = ref<'idle' | 'copy-text' | 'copy-link' | 'web-share' | 'copy-poster' | 'download'>('idle')
const statusMessage = ref('')
const statusKind = ref<'info' | 'success' | 'error'>('info')
const coverError = ref(false)
const posterCanvas = ref<HTMLCanvasElement | null>(null)
const posterQrContainer = ref<HTMLElement | null>(null)
const posterResult = ref<RenderPosterResult>()
let timeRefreshTimer: number | undefined
let posterGeneration = 0
let posterRenderPromise: Promise<RenderPosterResult | null> | undefined
let posterAbortController: AbortController | undefined
let closeHandled = false
let previousFocus: HTMLElement | null = null
const dialogClosing = ref(false)
let focusTimer: number | undefined

const nativeFallbackAvailable = ref(isNativeShareEntryEnabled(props.request.trigger))
const isBusy = computed(() => operation.value !== 'idle')
const posterLabels = computed<Partial<PosterLabels>>(() => ({
  brand: String(t('bilibili_share.poster_brand')),
  ownerFallback: String(t('bilibili_share.owner_missing')),
  infoTitle: String(t('bilibili_share.poster_info_title')),
  scanHint: String(t('bilibili_share.poster_scan_hint')),
  tagFallback: String(t('bilibili_share.poster_tag_fallback')),
  fallbackCover: String(t('bilibili_share.poster_fallback_cover')),
  fromTime: time => String(t('bilibili_share.poster_from_time', { time })),
}))

const withTimestamp = computed({
  get: () => shareSession.value.withTimestamp,
  set: (value: boolean) => {
    shareSession.value = updateShareSession(
      shareSession.value,
      readCurrentTime(document),
      value,
      props.request.outputPolicy,
    )
  },
})

function getDialogPanel(): HTMLElement | null {
  return dialogRef.value?.getDialogPanel() ?? null
}

function getFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  )).filter((element) => {
    if (element.tabIndex < 0)
      return false
    if (element.closest('[hidden], [inert], [aria-hidden="true"]'))
      return false
    const style = element.ownerDocument.defaultView?.getComputedStyle(element)
    return style?.display !== 'none' && style?.visibility !== 'hidden'
  })
}

function isFocusableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected || element.tabIndex < 0)
    return false
  if (element.matches(':disabled, [hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]'))
    return false
  if (element.closest('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]'))
    return false

  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  return style?.display !== 'none' && style?.visibility !== 'hidden' && Number.parseFloat(style?.opacity || '1') > 0
}

function focusElement(element: HTMLElement): boolean {
  try {
    element.focus({ preventScroll: true })
  }
  catch {
    return false
  }
  return findLeafActiveElement(element.ownerDocument) === element
}

function getShadowActiveElement(panel: HTMLElement): Element | null {
  const root = panel.getRootNode()
  return root instanceof ShadowRoot ? root.activeElement : panel.ownerDocument.activeElement
}

function handleDialogKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab')
    return

  const panel = getDialogPanel()
  if (!panel || !event.composedPath().includes(panel))
    return

  const elements = getFocusableElements(panel)
  if (!elements.length) {
    event.preventDefault()
    panel.focus({ preventScroll: true })
    return
  }

  const activeElement = getShadowActiveElement(panel)
  const activeIndex = activeElement ? elements.indexOf(activeElement as HTMLElement) : -1
  const nextIndex = event.shiftKey
    ? activeIndex <= 0 ? elements.length - 1 : activeIndex - 1
    : activeIndex === elements.length - 1 ? 0 : activeIndex + 1

  event.preventDefault()
  elements[nextIndex]?.focus({ preventScroll: true })
}

function handleTabKeydown(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
    return

  const tab = (event.target as Element | null)?.closest<HTMLElement>('[role="tab"]')
  const tabList = tab?.closest<HTMLElement>('[role="tablist"]')
  if (!tab || !tabList)
    return

  const tabs = Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]'))
  const currentIndex = tabs.indexOf(tab)
  if (currentIndex < 0)
    return

  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? tabs.length - 1
      : event.key === 'ArrowLeft'
        ? (currentIndex - 1 + tabs.length) % tabs.length
        : (currentIndex + 1) % tabs.length

  event.preventDefault()
  activeTab.value = nextIndex === 0 ? 'quick' : 'poster'
  tabs[nextIndex]?.focus({ preventScroll: true })
}

function focusDialog(): void {
  const panel = getDialogPanel()
  if (!panel)
    return

  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', String(t('bilibili_share.dialog_label')))
  panel.tabIndex = -1
  getFocusableElements(panel)[0]?.focus({ preventScroll: true })
}

function setStatus(key: string, kind: 'info' | 'success' | 'error' = 'info', params?: Record<string, unknown>): void {
  statusMessage.value = String(t(key, params ?? {}))
  statusKind.value = kind
}

function setOperationStatus(key: string): void {
  setStatus(key, 'success')
  toast.success(statusMessage.value)
}

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException && error.name === 'AbortError')
    || (typeof error === 'object'
      && error !== null
      && 'name' in error
      && error.name === 'AbortError')
}

async function runOperation(
  kind: Exclude<typeof operation.value, 'idle'>,
  action: () => Promise<void>,
  successKey: string,
): Promise<void> {
  if (isBusy.value)
    return

  operation.value = kind
  try {
    await action()
    setOperationStatus(successKey)
  }
  catch (error) {
    if (isStaleOperationError(error))
      return
    if (isAbortError(error)) {
      if (kind === 'web-share')
        setStatus('bilibili_share.web_share_cancelled')
      return
    }
    console.error('[BewlyCat] Bilibili share operation failed', error)
    setStatus('bilibili_share.operation_failed', 'error')
    toast.error(statusMessage.value)
  }
  finally {
    operation.value = 'idle'
  }
}

async function copyText(value: string): Promise<void> {
  if (typeof navigator.clipboard?.writeText !== 'function')
    throw new Error('Text clipboard unavailable')
  await navigator.clipboard.writeText(value)
}

function refreshCurrentTime(): void {
  const currentTime = readCurrentTime(document)
  if (Math.floor(currentTime) === Math.floor(shareSession.value.currentTime))
    return

  shareSession.value = updateShareSession(
    shareSession.value,
    currentTime,
    shareSession.value.withTimestamp,
    props.request.outputPolicy,
  )
}

function getQrCanvas(): HTMLCanvasElement | null {
  return posterQrContainer.value?.querySelector('canvas') ?? null
}

async function renderCurrentPoster(): Promise<RenderPosterResult | null> {
  posterAbortController?.abort()
  const abortController = new AbortController()
  posterAbortController = abortController
  const generation = ++posterGeneration
  const session = {
    ...shareSession.value,
    tags: shareSession.value.tags ? [...shareSession.value.tags] : undefined,
  }
  const labels = posterLabels.value
  posterState.value = 'loading'

  try {
    await nextTick()
    if (generation !== posterGeneration || dialogClosing.value)
      return null

    const qrCanvas = getQrCanvas()
    const targetCanvas = posterCanvas.value
    if (!qrCanvas || !targetCanvas)
      throw new Error('Poster canvas is unavailable')

    // 每次异步渲染使用独立画布，旧请求完成时不会覆盖当前预览。
    const renderCanvas = document.createElement('canvas')
    const result = await renderPoster(session, {
      canvas: renderCanvas,
      qrCanvas,
      logoUrl: bilibiliBrandLogoUrl,
      labels,
      signal: abortController.signal,
    })
    if (generation !== posterGeneration || dialogClosing.value || shareSession.value.url !== session.url)
      return null

    targetCanvas.width = renderCanvas.width
    targetCanvas.height = renderCanvas.height
    const targetContext = targetCanvas.getContext('2d')
    if (!targetContext)
      throw new Error('Poster canvas is unavailable')
    targetContext.drawImage(renderCanvas, 0, 0)

    const committedResult = { ...result, canvas: targetCanvas }
    posterResult.value = committedResult
    posterState.value = 'ready'
    return committedResult
  }
  catch (error) {
    if (isAbortError(error))
      return null
    if (generation === posterGeneration && !dialogClosing.value) {
      posterResult.value = undefined
      posterState.value = 'error'
    }
    console.error('[BewlyCat] Bilibili poster render failed', error)
    return null
  }
  finally {
    if (posterAbortController === abortController)
      posterAbortController = undefined
  }
}

function requestPosterRender(): Promise<RenderPosterResult | null> {
  const promise = renderCurrentPoster()
  posterRenderPromise = promise
  void promise.finally(() => {
    if (posterRenderPromise === promise)
      posterRenderPromise = undefined
  })
  return promise
}

async function ensurePoster(): Promise<RenderPosterResult> {
  if (posterResult.value)
    return posterResult.value

  const result = await (posterRenderPromise ?? requestPosterRender())
  if (!result)
    throw new Error('Poster is unavailable')
  return result
}

function isStaleOperationError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'StaleOperationError'
}

function createStaleOperationError(): Error {
  const error = new Error('Share operation is no longer current')
  error.name = 'StaleOperationError'
  return error
}

function isCurrentPosterOperation(generation: number, url: string): boolean {
  return !dialogClosing.value
    && !closeHandled
    && activeTab.value === 'poster'
    && generation === posterGeneration
    && shareSession.value.url === url
}

function assertCurrentPosterOperation(generation: number, url: string): void {
  if (!isCurrentPosterOperation(generation, url))
    throw createStaleOperationError()
}

function getWebShareText(): string {
  const text = shareSession.value.text.trim()
  const url = shareSession.value.url
  const urlIndex = text.lastIndexOf(url)
  if (urlIndex < 0 || text.slice(urlIndex + url.length).trim())
    return text
  return text.slice(0, urlIndex).trim()
}

async function handleWebShare(): Promise<void> {
  if (typeof navigator.share !== 'function') {
    setStatus('bilibili_share.web_share_unavailable', 'error')
    return
  }

  await runOperation(
    'web-share',
    async () => {
      const text = getWebShareText()
      await navigator.share({
        title: shareSession.value.title,
        ...(text ? { text } : {}),
        url: shareSession.value.url,
      })
    },
    'bilibili_share.web_share_success',
  )
}

async function handleCopyPoster(): Promise<void> {
  const generation = posterGeneration
  const url = shareSession.value.url
  await runOperation(
    'copy-poster',
    async () => {
      const result = await ensurePoster()
      assertCurrentPosterOperation(generation, url)
      await copyCanvasImage(result.canvas, undefined, undefined, {
        isCurrent: () => isCurrentPosterOperation(generation, url),
      })
    },
    'bilibili_share.poster_copied',
  )
}

async function handleDownloadPoster(): Promise<void> {
  const generation = posterGeneration
  const url = shareSession.value.url
  const bvid = shareSession.value.bvid
  await runOperation(
    'download',
    async () => {
      const { canvas } = await ensurePoster()
      assertCurrentPosterOperation(generation, url)
      const blob = await canvasToPngBlob(canvas)
      assertCurrentPosterOperation(generation, url)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = safePosterFilename(bvid)
      link.style.display = 'none'
      try {
        assertCurrentPosterOperation(generation, url)
        document.body.appendChild(link)
        link.click()
      }
      finally {
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      }
    },
    'bilibili_share.poster_download_started',
  )
}

function refreshNativeFallbackAvailability(): void {
  nativeFallbackAvailable.value = isNativeShareEntryEnabled(props.request.trigger)
}

function handleNativeFallback(): void {
  refreshNativeFallbackAvailability()
  if (!nativeFallbackAvailable.value) {
    setStatus('bilibili_share.native_unavailable', 'error')
    return
  }

  if (props.request.nativeFallback()) {
    closeDialog()
  }
  else {
    refreshNativeFallbackAvailability()
    setStatus('bilibili_share.native_unavailable', 'error')
  }
}

function closeDialog(): void {
  dialogRef.value?.close()
}

function handleDialogCloseRequested(): void {
  if (dialogClosing.value)
    return
  dialogClosing.value = true
  posterGeneration++
  posterAbortController?.abort()
  posterAbortController = undefined
  if (timeRefreshTimer)
    clearInterval(timeRefreshTimer)
  if (focusTimer)
    clearTimeout(focusTimer)
}

function handleDialogClose(): void {
  if (closeHandled)
    return
  handleDialogCloseRequested()
  closeHandled = true

  emit('close')
  props.request.onClosed()
  nextTick(() => {
    const trigger = props.request.trigger
    if (isNativeShareEntryEnabled(trigger) && focusElement(trigger))
      return
    if (isFocusableElement(previousFocus) && focusElement(previousFocus))
      return

    const fallback = mainAppRef.value
    if (!fallback?.isConnected)
      return
    const previousTabIndex = fallback.getAttribute('tabindex')
    fallback.tabIndex = -1
    focusElement(fallback)
    if (previousTabIndex === null)
      fallback.removeAttribute('tabindex')
    else
      fallback.setAttribute('tabindex', previousTabIndex)
  })
}

watch(() => shareSession.value.url, () => {
  posterResult.value = undefined
  posterState.value = 'idle'
  if (activeTab.value === 'poster')
    void requestPosterRender()
})

watch(activeTab, (tab) => {
  if (tab === 'poster' && !posterResult.value)
    void requestPosterRender()
})

onMounted(() => {
  const activeElement = findLeafActiveElement(document)
  previousFocus = activeElement instanceof HTMLElement && activeElement !== document.body
    ? activeElement
    : null

  timeRefreshTimer = window.setInterval(() => {
    refreshNativeFallbackAvailability()
    // 勾选后固定用户选择的秒数，避免播放期间持续改写二维码和重绘海报。
    if (!shareSession.value.withTimestamp)
      refreshCurrentTime()
  }, 500)
  window.addEventListener('keydown', handleDialogKeydown, true)
  focusTimer = window.setTimeout(focusDialog, 0)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleDialogKeydown, true)
  if (timeRefreshTimer)
    clearInterval(timeRefreshTimer)
  if (focusTimer)
    clearTimeout(focusTimer)
  if (!closeHandled) {
    handleDialogCloseRequested()
    props.request.onClosed()
  }
})

defineExpose({ close: closeDialog })
</script>

<template>
  <Dialog
    ref="dialogRef"
    :title="$t('bilibili_share.title')"
    :desc="$t('bilibili_share.description')"
    :close-label="$t('bilibili_share.close')"
    width="min(920px, calc(100vw - 32px))"
    max-width="920px"
    content-max-height="calc(100vh - 170px)"
    append-to-bewly-body
    :show-footer="false"
    @close-request="handleDialogCloseRequested"
    @close="handleDialogClose"
  >
    <div class="bilibili-share-dialog">
      <section class="bilibili-share-dialog__identity" aria-labelledby="bilibili-share-dialog-title">
        <div class="bilibili-share-dialog__cover-frame">
          <img
            v-if="shareSession.coverUrl && !coverError"
            class="bilibili-share-dialog__cover"
            :src="shareSession.coverUrl"
            :alt="shareSession.title"
            loading="lazy"
            @error="coverError = true"
          >
          <div v-else class="bilibili-share-dialog__cover-placeholder" aria-hidden="true">
            <Icon icon="tabler:photo-off" />
          </div>
        </div>
        <div class="bilibili-share-dialog__identity-copy">
          <h2 id="bilibili-share-dialog-title" class="bilibili-share-dialog__video-title">
            {{ shareSession.title }}
          </h2>
          <dl class="bilibili-share-dialog__metadata">
            <div>
              <dt>{{ $t('bilibili_share.owner') }}</dt>
              <dd>{{ shareSession.owner || $t('bilibili_share.owner_missing') }}</dd>
            </div>
            <div>
              <dt>BVID</dt>
              <dd>{{ shareSession.bvid }}</dd>
            </div>
            <div>
              <dt>{{ $t('bilibili_share.current_time') }}</dt>
              <dd class="bilibili-share-dialog__time-value">
                {{ formatTimestamp(shareSession.currentTime) }}
                <span v-if="shareSession.duration"> / {{ formatTimestamp(shareSession.duration) }}</span>
              </dd>
            </div>
          </dl>
          <label class="bilibili-share-dialog__timestamp-toggle">
            <input v-model="withTimestamp" type="checkbox">
            <span>{{ $t('bilibili_share.include_timestamp') }}</span>
          </label>
        </div>
      </section>

      <section class="bilibili-share-dialog__qr-section" :aria-label="$t('bilibili_share.qr_label')">
        <div class="bilibili-share-dialog__qr-frame">
          <QRCodeCanvas
            :value="shareSession.url"
            :size="224"
            :margin="4"
            level="H"
            aria-hidden="true"
          />
        </div>
        <p class="bilibili-share-dialog__qr-caption">
          {{ $t('bilibili_share.qr_hint') }}
        </p>
      </section>

      <div
        class="bilibili-share-dialog__tabs bew-segment-control bew-segment-control--surface"
        :class="{ 'bew-segment-control--static': !settings.enableLiquidSegmentIndicator, 'bew-segment-control--solid': !settings.enableFrostedGlass }"
        role="tablist"
        :aria-label="$t('bilibili_share.view_modes')"
        @keydown="handleTabKeydown"
      >
        <LiquidSegmentIndicator v-if="settings.enableLiquidSegmentIndicator" :active-key="activeTab" />
        <button
          id="bilibili-share-dialog-quick-tab"
          class="bew-segment-control__item bew-segment-control__item--wide"
          :data-active="activeTab === 'quick'"
          data-segment-item
          role="tab"
          :aria-selected="activeTab === 'quick'"
          aria-controls="bilibili-share-dialog-quick-panel"
          :tabindex="activeTab === 'quick' ? 0 : -1"
          type="button"
          @click="activeTab = 'quick'"
        >
          <Icon icon="mingcute:share-2-line" aria-hidden="true" />
          <span>{{ $t('bilibili_share.quick_tab') }}</span>
        </button>
        <button
          id="bilibili-share-dialog-poster-tab"
          class="bew-segment-control__item bew-segment-control__item--wide"
          :data-active="activeTab === 'poster'"
          data-segment-item
          role="tab"
          :aria-selected="activeTab === 'poster'"
          aria-controls="bilibili-share-dialog-poster-panel"
          :tabindex="activeTab === 'poster' ? 0 : -1"
          type="button"
          @click="activeTab = 'poster'"
        >
          <Icon icon="mingcute:picture-line" aria-hidden="true" />
          <span>{{ $t('bilibili_share.poster_tab') }}</span>
        </button>
      </div>

      <section
        id="bilibili-share-dialog-quick-panel"
        class="bilibili-share-dialog__panel"
        role="tabpanel"
        aria-labelledby="bilibili-share-dialog-quick-tab"
        :hidden="activeTab !== 'quick'"
      >
        <div class="bilibili-share-dialog__link-box">
          <span>{{ $t('bilibili_share.final_link') }}</span>
          <code>{{ shareSession.url }}</code>
        </div>
        <div class="bilibili-share-dialog__actions">
          <Button
            type="primary"
            :disabled="isBusy"
            @click="runOperation('copy-text', () => copyText(shareSession.text), 'bilibili_share.text_copied')"
          >
            <template #left>
              <i i-mingcute:copy-2-line aria-hidden="true" />
            </template>
            {{ $t('bilibili_share.copy_text') }}
          </Button>
          <Button
            type="secondary"
            :disabled="isBusy"
            @click="runOperation('copy-link', () => copyText(shareSession.url), 'bilibili_share.link_copied')"
          >
            <template #left>
              <i i-mingcute:link-2-line aria-hidden="true" />
            </template>
            {{ $t('bilibili_share.copy_link') }}
          </Button>
          <Button
            type="secondary"
            :disabled="isBusy || !shareSession.capabilities.webShare"
            :title="shareSession.capabilities.webShare ? undefined : $t('bilibili_share.web_share_unavailable')"
            @click="handleWebShare"
          >
            <template #left>
              <i i-mingcute:share-forward-line aria-hidden="true" />
            </template>
            {{ $t('bilibili_share.web_share') }}
          </Button>
          <Button
            type="tertiary"
            :disabled="isBusy || !nativeFallbackAvailable"
            @click="handleNativeFallback"
          >
            <template #left>
              <i i-mingcute:external-link-line aria-hidden="true" />
            </template>
            {{ $t('bilibili_share.native_share') }}
          </Button>
        </div>
      </section>

      <section
        id="bilibili-share-dialog-poster-panel"
        class="bilibili-share-dialog__panel"
        role="tabpanel"
        aria-labelledby="bilibili-share-dialog-poster-tab"
        :hidden="activeTab !== 'poster'"
      >
        <div class="bilibili-share-dialog__poster-frame" :class="{ 'is-loading': posterState === 'loading' }">
          <canvas ref="posterCanvas" class="bilibili-share-dialog__poster" :aria-label="$t('bilibili_share.poster_label')" />
          <div v-if="posterState === 'loading'" class="bilibili-share-dialog__poster-loading" role="status">
            <Icon icon="svg-spinners:ring-resize" aria-hidden="true" />
            <span>{{ $t('bilibili_share.poster_loading') }}</span>
          </div>
          <div v-else-if="posterState === 'error'" class="bilibili-share-dialog__poster-error" role="status">
            <Icon icon="mingcute:alert-line" aria-hidden="true" />
            <span>{{ $t('bilibili_share.poster_error') }}</span>
          </div>
        </div>
        <div ref="posterQrContainer" class="bilibili-share-dialog__poster-qr-source" aria-hidden="true">
          <QRCodeCanvas :value="shareSession.url" :size="250" :margin="4" level="H" />
        </div>
        <div class="bilibili-share-dialog__actions">
          <Button type="secondary" :disabled="isBusy || posterState !== 'ready'" @click="handleCopyPoster">
            <template #left>
              <i i-mingcute:image-2-line aria-hidden="true" />
            </template>
            {{ $t('bilibili_share.copy_poster') }}
          </Button>
          <Button type="primary" :disabled="isBusy || posterState !== 'ready'" @click="handleDownloadPoster">
            <template #left>
              <i i-mingcute:download-2-line aria-hidden="true" />
            </template>
            {{ $t('bilibili_share.download_poster') }}
          </Button>
        </div>
      </section>

      <p v-if="statusMessage" class="bilibili-share-dialog__status" :data-kind="statusKind" role="status" aria-live="polite">
        {{ statusMessage }}
      </p>
    </div>
  </Dialog>
</template>

<style lang="scss" scoped>
.bilibili-share-dialog {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 248px;
  gap: var(--bew-space-4);
  min-width: 0;
  padding-block: var(--bew-space-2);
}

.bilibili-share-dialog__identity,
.bilibili-share-dialog__qr-section {
  min-width: 0;
  padding: var(--bew-space-4);
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-panel-radius);
}

.bilibili-share-dialog__identity {
  display: grid;
  grid-template-columns: minmax(180px, 38%) minmax(0, 1fr);
  gap: var(--bew-space-4);
}

.bilibili-share-dialog__cover-frame {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--bew-fill-2);
  border-radius: var(--bew-media-radius);
}

.bilibili-share-dialog__cover,
.bilibili-share-dialog__cover-placeholder {
  display: block;
  width: 100%;
  height: 100%;
}

.bilibili-share-dialog__cover {
  object-fit: cover;
}

.bilibili-share-dialog__cover-placeholder {
  display: grid;
  color: var(--bew-text-3);
  place-items: center;
}

.bilibili-share-dialog__cover-placeholder :deep(.bew-local-icon) {
  font-size: var(--bew-icon-size-xl);
}

.bilibili-share-dialog__identity-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: var(--bew-space-3);
}

.bilibili-share-dialog__video-title {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  overflow-wrap: anywhere;
}

.bilibili-share-dialog__metadata {
  display: grid;
  gap: var(--bew-space-2);
  margin: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.bilibili-share-dialog__metadata > div {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--bew-space-2);
  min-width: 0;
}

.bilibili-share-dialog__metadata dt {
  color: var(--bew-text-3);
}

.bilibili-share-dialog__metadata dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.bilibili-share-dialog__time-value {
  font-variant-numeric: tabular-nums;
}

.bilibili-share-dialog__timestamp-toggle {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--bew-space-2);
  min-height: 24px;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
}

.bilibili-share-dialog__timestamp-toggle input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--bew-theme-color);
}

.bilibili-share-dialog__qr-section {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--bew-space-2);
}

.bilibili-share-dialog__qr-frame {
  display: grid;
  width: 224px;
  max-width: 100%;
  aspect-ratio: 1;
  padding: var(--bew-space-2);
  background: white;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  place-items: center;
}

.bilibili-share-dialog__qr-frame :deep(canvas) {
  display: block;
  width: 100% !important;
  max-width: 100%;
  height: auto !important;
}

.bilibili-share-dialog__qr-caption {
  margin: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-align: center;
}

.bilibili-share-dialog__tabs {
  grid-column: 1 / -1;
  justify-self: start;
  min-width: 0;
  max-width: 100%;
}

.bilibili-share-dialog__panel {
  grid-column: 1 / -1;
  min-width: 0;
}

.bilibili-share-dialog__link-box {
  display: grid;
  gap: var(--bew-space-2);
  min-width: 0;
  padding: var(--bew-space-3);
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.bilibili-share-dialog__link-box code {
  display: block;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--bew-text-1);
  font: inherit;
}

.bilibili-share-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
}

.bilibili-share-dialog__poster-frame {
  position: relative;
  width: min(100%, 520px);
  margin: 0 auto;
  overflow: hidden;
  aspect-ratio: 1;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-panel-radius);
}

.bilibili-share-dialog__poster {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 1;
  transition: opacity var(--bew-duration-normal) var(--bew-ease-standard);
}

.bilibili-share-dialog__poster-frame.is-loading .bilibili-share-dialog__poster {
  opacity: 0.35;
}

.bilibili-share-dialog__poster-loading,
.bilibili-share-dialog__poster-error {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--bew-space-2);
  color: var(--bew-text-2);
  background: color-mix(in srgb, var(--bew-elevated-solid), transparent 18%);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.bilibili-share-dialog__poster-error {
  color: var(--bew-error-color);
}

.bilibili-share-dialog__poster-loading :deep(.bew-local-icon),
.bilibili-share-dialog__poster-error :deep(.bew-local-icon) {
  font-size: var(--bew-icon-size-lg);
}

.bilibili-share-dialog__poster-qr-source {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.bilibili-share-dialog__status {
  grid-column: 1 / -1;
  min-height: var(--bew-line-height-control);
  margin: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.bilibili-share-dialog__status[data-kind="success"] {
  color: var(--bew-success-color);
}

.bilibili-share-dialog__status[data-kind="error"] {
  color: var(--bew-error-color);
}

@media (max-width: 720px) {
  .bilibili-share-dialog {
    grid-template-columns: minmax(0, 1fr);
  }

  .bilibili-share-dialog__qr-section,
  .bilibili-share-dialog__tabs,
  .bilibili-share-dialog__panel,
  .bilibili-share-dialog__status {
    grid-column: 1;
  }

  .bilibili-share-dialog__qr-section {
    grid-template-columns: 176px minmax(0, 1fr);
    justify-items: start;
  }

  .bilibili-share-dialog__qr-frame {
    grid-row: span 2;
    width: 176px;
  }

  .bilibili-share-dialog__qr-caption {
    align-self: center;
    text-align: left;
  }
}

@media (max-width: 480px) {
  .bilibili-share-dialog__identity {
    grid-template-columns: 112px minmax(0, 1fr);
    gap: var(--bew-space-3);
    padding: var(--bew-space-3);
  }

  .bilibili-share-dialog__metadata > div {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .bilibili-share-dialog__qr-section {
    grid-template-columns: 132px minmax(0, 1fr);
  }

  .bilibili-share-dialog__qr-frame {
    width: 132px;
  }

  .bilibili-share-dialog__tabs {
    width: 100%;
    justify-self: stretch;
  }

  .bilibili-share-dialog__tabs .bew-segment-control__item {
    min-width: 0;
    flex: 1 1 0;
    padding-inline: var(--bew-space-2);
  }

  .bilibili-share-dialog__tabs .bew-segment-control__item > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bilibili-share-dialog__poster {
    transition: none;
  }
}
</style>
