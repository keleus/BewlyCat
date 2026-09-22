<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'

const props = defineProps<{ video: HTMLVideoElement }>()
const { t } = useI18n()
const root = ref<HTMLElement>()
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

function requestStatus() {
  window.postMessage({ type: 'BEWLY_LOUDNESS_STATUS_REQUEST' }, location.origin)
}
function show() {
  open.value = true
  requestStatus()
  void nextTick(placePanel)
}
function placePanel() {
  if (!panel.value || !root.value || !open.value)
    return
  panel.value.style.transform = ''
  const player = root.value.closest('.bpx-player-container')?.getBoundingClientRect()
  const left = Math.max(8, (player?.left ?? 0) + 8)
  const right = Math.min(innerWidth - 8, (player?.right ?? innerWidth) - 8)
  panel.value.style.maxWidth = `${Math.max(0, right - left)}px`
  const rect = panel.value.getBoundingClientRect()
  const shift = Math.max(left - rect.left, Math.min(0, right - rect.right))
  panel.value.style.transform = `translateX(${shift}px)`
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
    void nextTick(() => panel.value?.querySelector<HTMLInputElement>('input')?.focus())
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
  for (const name of ['emptied', 'loadedmetadata', 'seeking'])
    props.video.addEventListener(name, resetStatus, { signal: life.signal })
  requestStatus()
})
onBeforeUnmount(() => life.abort())
</script>

<template>
  <div
    ref="root" class="loudness-widget"
    @mouseenter="show" @mouseleave="leave"
    @focusout="onFocusOut" @keydown.stop="onKey" @keyup.stop
    @click.stop @dblclick.stop @pointerdown.stop @mousedown.stop @wheel.stop
  >
    <button
      ref="button" type="button" class="loudness-button"
      :aria-label="t('settings.local_loudness.title')" :aria-expanded="open" aria-controls="bewly-loudness-panel"
      @click="open ? open = false : show()" @focus="onButtonFocus"
    >
      <svg viewBox="0 0 88 88" aria-hidden="true">
        <path d="M26 23v42M44 23v42M62 23v42M20 34h12M38 54h12M56 39h12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
      </svg>
    </button>
    <div
      v-show="open" id="bewly-loudness-panel" ref="panel" class="loudness-panel" role="group"
      :aria-label="t('settings.local_loudness.title')"
    >
      <div class="panel-title">
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
</template>

<style scoped lang="scss">
// Match Bilibili’s dark player popovers, with themed interactive controls.
.loudness-widget {
  position: relative;
  height: 100%;
  text-align: left;
  white-space: normal;
}
.loudness-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  color: rgba(255, 255, 255, 0.8);
  background: transparent;
  cursor: pointer;
  &:hover {
    color: #fff;
  }
  svg {
    width: 100%;
    height: 100%;
  }
}
.loudness-widget :focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.loudness-panel {
  position: absolute;
  bottom: 100%;
  right: 0;
  z-index: 10;
  box-sizing: border-box;
  width: 288px;
  max-width: calc(100vw - 16px);
  max-height: 65vh;
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
.panel-title {
  margin-bottom: 12px;
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
