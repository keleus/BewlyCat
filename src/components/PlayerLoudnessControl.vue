<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { applyPictureAdjustment, isPictureAdjusted, playerAdjustment } from '~/utils/playerAdjustment'

const props = defineProps<{ video: HTMLVideoElement }>()
const { t } = useI18n()
const root = ref<HTMLElement>()
const knobMaskId = `bewly-loudness-knobs-${useId()}`
const button = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const open = ref(false)
const state = ref('waiting')
const gain = ref<number | null>(null)
// A bounded telemetry history; no audio buffers, animation loop or extra timer.
const history = ref<{ time: number, db: number }[]>([])
const gainPath = computed(() => {
  const samples = history.value
  const end = samples.at(-1)?.time ?? 0
  return samples.map((sample, index) => {
    const x = 30 + (1 - (end - sample.time) / 60_000) * 226
    const y = 8 + (6 - Math.max(-18, Math.min(6, sample.db))) / 24 * 72
    const move = index === 0 || sample.time - samples[index - 1].time > 2500
    return `${move ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
})
watch(() => settings.value.localLoudnessEnabled, () => {
  history.value = []
  gain.value = null
})
function updateParameter(event: Event, key: 'localLoudnessTarget' | 'localLoudnessStrength') {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isFinite(value))
    settings.value[key] = value
}
const statuses = new Set(['off', 'waiting', 'active', 'error', 'native-unavailable', 'unsupported'])
const displayState = computed(() => settings.value.localLoudnessEnabled ? state.value : 'off')
const life = new AbortController()
const panelResizeObserver = new ResizeObserver(placePanel)

const delayStatuses = new Set(['off', 'waiting', 'active', 'unsupported', 'error'])
const delayState = ref('off')
const pictureAdjusted = computed(isPictureAdjusted)
const adjusted = computed(() => pictureAdjusted.value || playerAdjustment.audioDelay > 0)
const delayNotice = computed(() => playerAdjustment.audioDelay > 0 && ['waiting', 'unsupported', 'error'].includes(delayState.value)
  ? t(`settings.player_adjustment.audio_delay_states.${delayState.value}`)
  : t('settings.player_adjustment.audio_delay_desc'))
const videoResizeObserver = new ResizeObserver(() => applyPictureAdjustment(props.video))

watch(() => [playerAdjustment.rotation, playerAdjustment.flipX, playerAdjustment.flipY], () => {
  applyPictureAdjustment(props.video)
}, { immediate: true })
watch(() => playerAdjustment.audioDelay, (delay) => {
  window.postMessage({ type: 'BEWLY_AUDIO_DELAY', delay }, location.origin)
}, { immediate: true })

function rotate(step: number) {
  playerAdjustment.rotation = (playerAdjustment.rotation + step + 360) % 360
}
function resetPicture() {
  playerAdjustment.rotation = 0
  playerAdjustment.flipX = false
  playerAdjustment.flipY = false
}
function updateAudioDelay(event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isFinite(value))
    playerAdjustment.audioDelay = value
}

watch(open, (visible) => {
  if (visible) {
    // The top layer escapes the player's overflow and transformed containers
    // while keeping focus, hover and player event handling in the same DOM tree.
    panel.value?.showPopover()
    placePanel()
  }
  else {
    panel.value?.hidePopover()
  }
}, { flush: 'post' })

function requestStatus() {
  window.postMessage({ type: 'BEWLY_LOUDNESS_STATUS_REQUEST' }, location.origin)
  window.postMessage({ type: 'BEWLY_AUDIO_DELAY_STATUS_REQUEST' }, location.origin)
}
function show() {
  open.value = true
  requestStatus()
}
function placePanel() {
  if (!panel.value || !button.value || !open.value)
    return
  const anchor = button.value.getBoundingClientRect()
  const width = document.documentElement.clientWidth
  const height = document.documentElement.clientHeight
  if (anchor.width === 0 || anchor.height === 0 || anchor.bottom <= 0 || anchor.top >= height
    || anchor.right <= 0 || anchor.left >= width) {
    close()
    return
  }
  const margin = 8
  const top = Math.max(margin, Math.min(anchor.top, height - margin))
  const bottom = Math.max(margin, Math.min(anchor.bottom, height - margin))
  const above = Math.max(0, top - margin)
  const below = Math.max(0, height - margin - bottom)
  panel.value.style.maxWidth = `${Math.max(0, width - margin * 2)}px`
  const placeAbove = above >= panel.value.scrollHeight || above >= below
  panel.value.style.maxHeight = `${placeAbove ? above : below}px`
  const rect = panel.value.getBoundingClientRect()
  panel.value.style.left = `${Math.max(margin, Math.min(anchor.right - rect.width, width - margin - rect.width))}px`
  panel.value.style.top = `${placeAbove ? top - rect.height : bottom}px`
}
function close() {
  open.value = false
}
function onFocusOut(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget))
    open.value = false
}
function onButtonFocus() {
  if (button.value?.matches(':focus-visible'))
    show()
}
function leave() {
  if (!root.value?.contains(document.activeElement))
    open.value = false
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    button.value?.focus()
    open.value = false
  }
  else if (event.key === 'ArrowDown' && event.target === button.value) {
    event.preventDefault()
    show()
    void nextTick(() => panel.value?.querySelector<HTMLElement>('button, input')?.focus())
  }
}
function resetStatus() {
  state.value = 'waiting'
  gain.value = null
  history.value = []
  requestStatus()
}
function onStatus(event: MessageEvent) {
  const data = event.data
  if (event.source === window && data?.type === 'BEWLY_AUDIO_DELAY_STATUS' && delayStatuses.has(data.state)
    && data.url === location.href) {
    delayState.value = data.state
    return
  }
  if (event.source !== window || data?.type !== 'BEWLY_LOUDNESS_STATUS' || !statuses.has(data.state)
    || data.url !== location.href || data.src !== props.video.currentSrc) {
    return
  }
  state.value = data.state
  if (data.state !== 'active') {
    gain.value = null
    return
  }
  if (typeof data.gainDb === 'number' && Number.isFinite(data.gainDb)) {
    gain.value = data.gainDb
    const time = performance.now()
    history.value = [...history.value.filter(sample => time - sample.time <= 60_000).slice(-60), { time, db: data.gainDb }]
  }
}
onMounted(() => {
  window.addEventListener('message', onStatus, { signal: life.signal })
  window.addEventListener('resize', placePanel, { signal: life.signal })
  window.addEventListener('scroll', placePanel, { capture: true, signal: life.signal })
  // Fullscreen changes the top-layer order; reopen from the button in the new mode.
  document.addEventListener('fullscreenchange', close, { signal: life.signal })
  for (const element of [button.value, panel.value, root.value?.closest('.bpx-player-container')]) {
    if (element)
      panelResizeObserver.observe(element)
  }
  for (const name of ['emptied', 'loadedmetadata', 'seeking'])
    props.video.addEventListener(name, resetStatus, { signal: life.signal })
  // 画面尺寸或比例变化后重新计算旋转 90° 时的缩放。
  for (const name of ['loadedmetadata', 'resize'])
    props.video.addEventListener(name, () => applyPictureAdjustment(props.video), { signal: life.signal })
  videoResizeObserver.observe(props.video)
  requestStatus()
})
onBeforeUnmount(() => {
  life.abort()
  panelResizeObserver.disconnect()
  videoResizeObserver.disconnect()
  panel.value?.hidePopover()
})
</script>

<template>
  <div
    ref="root" class="loudness-widget"
    @mouseenter="show" @mouseleave="leave"
    @focusout="onFocusOut" @keydown.stop="onKey" @keyup.stop
    @click.stop @dblclick.stop @pointerdown.stop @mousedown.stop @wheel.stop
  >
    <button
      ref="button" type="button" class="bpx-player-ctrl-btn-icon loudness-button" :class="{ 'is-adjusted': adjusted }"
      :aria-label="t('settings.player_adjustment.title')" :aria-expanded="open" aria-controls="bewly-loudness-panel"
      @click="open ? open = false : show()" @focus="onButtonFocus"
    >
      <span class="bpx-common-svg-icon">
        <!-- 与原生控制栏图标同为 88 网格面性图形：轨道宽 8、推钮 20×12；轨道在推钮上下各留 4 的间隙 -->
        <svg viewBox="0 0 88 88" fill="#fff" aria-hidden="true">
          <mask
            :id="knobMaskId" maskUnits="userSpaceOnUse" x="0" y="0" width="88"
            height="88"
          >
            <rect width="88" height="88" fill="#fff" />
            <rect
              class="knob knob-1" x="10" y="22" width="20" height="20"
              fill="#000"
            />
            <rect
              class="knob knob-2" x="34" y="44" width="20" height="20"
              fill="#000"
            />
            <rect
              class="knob knob-3" x="58" y="30" width="20" height="20"
              fill="#000"
            />
          </mask>
          <g :mask="`url(#${knobMaskId})`">
            <rect x="16" y="16" width="8" height="56" rx="2" />
            <rect x="40" y="16" width="8" height="56" rx="2" />
            <rect x="64" y="16" width="8" height="56" rx="2" />
          </g>
          <rect
            class="knob knob-1" x="10" y="26" width="20" height="12"
            rx="3"
          />
          <rect
            class="knob knob-2" x="34" y="48" width="20" height="12"
            rx="3"
          />
          <rect
            class="knob knob-3" x="58" y="34" width="20" height="12"
            rx="3"
          />
        </svg>
      </span>
    </button>
    <div
      id="bewly-loudness-panel" ref="panel" class="loudness-panel" role="group" popover="manual"
      :aria-label="t('settings.player_adjustment.title')"
    >
      <div class="section-heading">
        <span>{{ t('settings.player_adjustment.picture') }}</span>
        <button v-if="pictureAdjusted" type="button" class="text-button" @click="resetPicture">
          {{ t('settings.player_adjustment.reset') }}
        </button>
      </div>
      <div class="picture-actions">
        <button type="button" class="action-button" @click="rotate(-90)">
          {{ t('settings.player_adjustment.rotate_left') }}
        </button>
        <button type="button" class="action-button" @click="rotate(90)">
          {{ t('settings.player_adjustment.rotate_right') }}
        </button>
        <button
          type="button" class="action-button" :aria-pressed="playerAdjustment.flipX"
          @click="playerAdjustment.flipX = !playerAdjustment.flipX"
        >
          {{ t('settings.player_adjustment.flip_horizontal') }}
        </button>
        <button
          type="button" class="action-button" :aria-pressed="playerAdjustment.flipY"
          @click="playerAdjustment.flipY = !playerAdjustment.flipY"
        >
          {{ t('settings.player_adjustment.flip_vertical') }}
        </button>
      </div>
      <div class="panel-section">
        <div class="section-heading">
          <span>{{ t('settings.player_adjustment.audio_sync') }}</span>
          <button v-if="playerAdjustment.audioDelay > 0" type="button" class="text-button" @click="playerAdjustment.audioDelay = 0">
            {{ t('settings.player_adjustment.reset') }}
          </button>
        </div>
        <label class="parameter">
          <span>{{ t('settings.player_adjustment.audio_delay') }} <output>{{ playerAdjustment.audioDelay }} ms</output></span>
          <input
            type="range" :value="playerAdjustment.audioDelay" min="0" max="1000" step="10"
            :aria-label="t('settings.player_adjustment.audio_delay')"
            :style="{ '--loudness-progress': `${playerAdjustment.audioDelay / 10}%` }"
            @input="updateAudioDelay"
          >
        </label>
        <div class="hint" role="status">
          {{ delayNotice }}
        </div>
      </div>
      <!-- 音量均衡在设置页开启后才在面板中显示 -->
      <div v-if="settings.localLoudnessEnabled" class="panel-section">
        <div class="section-heading">
          {{ t('settings.local_loudness.title') }}
        </div>
        <label class="toggle-row">
          <span>{{ t('settings.local_loudness.enable') }}</span>
          <input v-model="settings.localLoudnessEnabled" type="checkbox" class="native-switch">
        </label>
        <label class="parameter">
          <span>{{ t('settings.local_loudness.target') }} <output>{{ settings.localLoudnessTarget }} LUFS</output></span>
          <input
            type="range" :value="settings.localLoudnessTarget" min="-24" max="-14" :aria-label="t('settings.local_loudness.target')"
            :style="{ '--loudness-progress': `${(settings.localLoudnessTarget + 24) / 10 * 100}%` }"
            @input="updateParameter($event, 'localLoudnessTarget')"
          >
        </label>
        <label class="parameter">
          <span>{{ t('settings.local_loudness.strength') }} <output>{{ settings.localLoudnessStrength }}%</output></span>
          <input
            type="range" :value="settings.localLoudnessStrength" min="40" max="100" :aria-label="t('settings.local_loudness.strength')"
            :style="{ '--loudness-progress': `${(settings.localLoudnessStrength - 40) / 60 * 100}%` }"
            @input="updateParameter($event, 'localLoudnessStrength')"
          >
        </label>
        <div class="status">
          <div class="status-heading">
            <span>{{ t('settings.local_loudness.status') }}</span>
            <span v-if="displayState === 'active' && gain !== null">{{ gain > 0 ? '+' : '' }}{{ gain.toFixed(1) }} dB</span>
          </div>
          <svg class="gain-chart" viewBox="0 0 264 98" role="img" :aria-label="t('settings.local_loudness.gain_history')">
            <title>{{ t('settings.local_loudness.gain_history') }}</title>
            <path class="chart-grid" d="M30 8H256 M30 26H256 M30 80H256" />
            <text x="0" y="12">+6</text>
            <text x="0" y="30">0</text>
            <text x="0" y="84">−18</text>
            <text x="30" y="96">−60 s</text>
            <text x="240" y="96">dB</text>
            <path v-if="history.length > 1" class="chart-line" :d="gainPath" />
          </svg>
          <div class="chart-caption">
            {{ t('settings.local_loudness.gain_history') }}
          </div>
          <span role="status">{{ t(`settings.local_loudness.states.${displayState}`) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
// Match Bilibili’s dark player popovers, with themed interactive controls.
.loudness-widget {
  position: relative;
  text-align: left;
  white-space: normal;
}
.loudness-button {
  display: flex;
  align-items: center;
  justify-content: center;
  // Let the native icon wrapper size this control, like the widescreen button.
  // 颜色与悬停透明度沿用原生 .bpx-common-svg-icon 规则。
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  svg {
    width: 100%;
    height: 100%;
  }
}
// 悬停或键盘聚焦时三根推子错峰滑动，在端点前留出余量后回到原位
.loudness-widget:hover .knob,
.loudness-button:focus-visible .knob {
  animation: 700ms ease-in-out both;
}
.loudness-widget:hover .knob-1,
.loudness-button:focus-visible .knob-1 {
  animation-name: loudness-knob-1;
}
.loudness-widget:hover .knob-2,
.loudness-button:focus-visible .knob-2 {
  animation-name: loudness-knob-2;
  animation-delay: 70ms;
}
.loudness-widget:hover .knob-3,
.loudness-button:focus-visible .knob-3 {
  animation-name: loudness-knob-3;
  animation-delay: 140ms;
}
@keyframes loudness-knob-1 {
  45% {
    transform: translateY(26px);
  }
}
@keyframes loudness-knob-2 {
  45% {
    transform: translateY(-24px);
  }
}
@keyframes loudness-knob-3 {
  45% {
    transform: translateY(18px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .loudness-button .knob {
    animation: none !important;
  }
}
.loudness-widget :focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.loudness-panel {
  position: fixed;
  inset: auto;
  margin: 0;
  box-sizing: border-box;
  width: 288px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 20px;
  border: 0;
  border-radius: 2px;
  background: rgba(20, 20, 20, 0.9);
  color: #fff;
  font-size: 12px;
  font-weight: 400;
  line-height: 20px;
  cursor: default;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.panel-section {
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  margin-top: 16px;
  padding-top: 12px;
}
.panel-section .parameter:first-of-type {
  margin-top: 0;
}
.hint {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.5);
}
.text-button,
.action-button {
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.text-button {
  padding: 0;
  background: transparent;
  color: var(--bew-theme-color, #00a1d6);
}
.picture-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.action-button {
  min-height: 28px;
  padding: 4px 8px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  &[aria-pressed="true"] {
    background: var(--bew-theme-color, #00a1d6);
  }
}
// 有画面或音画调整生效时在图标角落提示，避免忘记已改动。
.loudness-button.is-adjusted {
  position: relative;
  &::after {
    content: "";
    position: absolute;
    top: 6px;
    right: 4px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--bew-theme-color, #00a1d6);
  }
}
.toggle-row,
.parameter > span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.parameter {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}
.parameter output {
  color: rgba(255, 255, 255, 0.8);
}
input[type="range"] {
  appearance: none;
  width: 100%;
  height: 4px;
  margin: 4px 0;
  border: 0;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--bew-theme-color, #00a1d6) var(--loudness-progress),
    rgba(255, 255, 255, 0.3) var(--loudness-progress)
  );
  cursor: pointer;
  &::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border: 0;
    border-radius: 50%;
    background: #fff;
  }
  &::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: 0;
    border-radius: 50%;
    background: #fff;
  }
}
.native-switch {
  appearance: none;
  position: relative;
  flex-shrink: 0;
  width: 30px;
  height: 16px;
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #aaa;
  }
  &:checked {
    border-color: var(--bew-theme-color, #00a1d6);
    background: var(--bew-theme-color, #00a1d6);
  }
  &:checked::after {
    left: 16px;
    background: #fff;
  }
}
.status {
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  margin-top: 16px;
  padding-top: 12px;
  color: rgba(255, 255, 255, 0.8);
}
.status-heading {
  display: flex;
  justify-content: space-between;
}
.gain-chart {
  display: block;
  width: 100%;
  height: auto;
  margin-top: 8px;
  overflow: visible;
  text {
    fill: rgba(255, 255, 255, 0.5);
    font-size: 10px;
  }
}
.chart-grid {
  fill: none;
  stroke: rgba(255, 255, 255, 0.15);
  stroke-dasharray: 3 3;
}
.chart-line {
  fill: none;
  stroke: #fff;
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.chart-caption {
  margin: 4px 0 8px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
