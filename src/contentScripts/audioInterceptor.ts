import { watch } from 'vue'

// Watch settings
import { settings } from '~/logic'

interface AudioNodeBundle {
  source: MediaElementAudioSourceNode
  analyser: AnalyserNode
  analysisHighpass: BiquadFilterNode
  analysisPresence: BiquadFilterNode
  adaptiveGain: GainNode
  limiter: DynamicsCompressorNode
  dataArray: Float32Array
}

interface LoudnessAnalysisState {
  dataArray: Float32Array
  shortTermBlocks: number[]
  integratedBlocks: number[]
  animationId: number | null
  silenceFrames: number
}

interface ManagedVideoListeners {
  video: HTMLVideoElement
  onPlay: () => void
  onPause: () => void
  onLoadStart: () => void
  onEmptied: () => void
}

const PLAYER_VIDEO_SELECTOR = [
  '#bilibiliPlayer video',
  '#bilibili-player video',
  '.bilibili-player video',
  '.bpx-player-container video',
  '.player-container video',
  '#bofqi video',
  '[aria-label="哔哩哔哩播放器"] video',
].join(',')

const ANALYSIS_INTERVAL_MS = 100
const SHORT_TERM_WINDOW = 20
const INTEGRATED_WINDOW = 100
const ANALYSIS_EPSILON = 1e-8

// Debug logger
function log(msg: string, ...args: any[]) {
  if (settings.value.volumeNormalizationDebug) {
    console.log(`[BewlyAudio] ${msg}`, ...args)
  }
}

function error(msg: string, ...args: any[]) {
  console.error(`[BewlyAudio] ${msg}`, ...args)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function average(values: number[]) {
  if (values.length === 0)
    return 0

  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
  }
  return sum / values.length
}

function rmsToPower(rms: number) {
  return Math.max(rms * rms, ANALYSIS_EPSILON)
}

function powerToDb(power: number) {
  return 10 * Math.log10(Math.max(power, ANALYSIS_EPSILON))
}

function gainToDb(gain: number) {
  return 20 * Math.log10(Math.max(gain, 0.01))
}

function dbToGain(db: number) {
  return 10 ** (db / 20)
}

function getStrengthNormalized() {
  return (clamp(settings.value.normalizationStrength || 12, 1, 20) - 1) / 19
}

function getSpeedNormalized() {
  return (clamp(settings.value.adaptiveGainSpeed || 5, 1, 10) - 1) / 9
}

function getTargetLoudnessDb() {
  const targetVolume = clamp(settings.value.targetVolume || 50, 0, 100)
  return -30 + (targetVolume / 100) * 20
}

function getGainControlProfile() {
  const strength = getStrengthNormalized()
  const speed = getSpeedNormalized()

  return {
    correctionFactor: 0.45 + strength * 0.55,
    maxBoostDb: 5 + strength * 6,
    maxCutDb: 7 + strength * 7,
    deadbandDb: 0.9 - strength * 0.25,
    maxStepUpDb: 0.18 + speed * 0.42,
    maxStepDownDb: 0.45 + speed * 0.75,
    attackTimeConstant: 0.28 - speed * 0.18,
    releaseTimeConstant: 2.8 - speed * 1.8,
    silenceReleaseTimeConstant: 3.2 - speed * 1.6,
  }
}

// Audio Context and Nodes
let audioContext: AudioContext | null = null
let audioNodes: AudioNodeBundle | null = null
const audioNodeCache = new WeakMap<HTMLVideoElement, AudioNodeBundle>()

// Analysis State
let loudnessAnalysis: LoudnessAnalysisState | null = null

let currentVideoElement: HTMLVideoElement | null = null
let currentVideoListeners: ManagedVideoListeners | null = null
const pendingMetadataVideos = new WeakSet<HTMLVideoElement>()
let hasAttached = false

// 临时启用/禁用状态（用于播放器控件）
let tempDisabled = false

// Initialize Audio Context
function initAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (AudioContextClass) {
      audioContext = new AudioContextClass({ latencyHint: 'playback' })
      log('AudioContext initialized', audioContext.state)
    }
    else {
      error('AudioContext not supported')
    }
  }
  return audioContext
}

function applyLimiterSettings(nodes: AudioNodeBundle, context: AudioContext) {
  const strength = getStrengthNormalized()
  const { limiter } = nodes

  limiter.threshold.setValueAtTime(-7 + strength * 2, context.currentTime)
  limiter.knee.setValueAtTime(8 + strength * 6, context.currentTime)
  limiter.ratio.setValueAtTime(6 + strength * 10, context.currentTime)
  limiter.attack.setValueAtTime(0.003, context.currentTime)
  limiter.release.setValueAtTime(0.18 + (1 - strength) * 0.18, context.currentTime)
}

// Create Processing Chain
function createProcessingChain(context: AudioContext, source: MediaElementAudioSourceNode): AudioNodeBundle {
  try {
    const analyser = context.createAnalyser()
    analyser.fftSize = 4096
    analyser.smoothingTimeConstant = 0.1

    // Approximate K-weighting for analysis only so playback tone stays unchanged.
    const analysisHighpass = context.createBiquadFilter()
    analysisHighpass.type = 'highpass'
    analysisHighpass.frequency.setValueAtTime(80, context.currentTime)
    analysisHighpass.Q.setValueAtTime(0.707, context.currentTime)

    const analysisPresence = context.createBiquadFilter()
    analysisPresence.type = 'highshelf'
    analysisPresence.frequency.setValueAtTime(1600, context.currentTime)
    analysisPresence.gain.setValueAtTime(4, context.currentTime)

    const adaptiveGain = context.createGain()
    adaptiveGain.gain.setValueAtTime(1.0, context.currentTime)

    const limiter = context.createDynamicsCompressor()
    const nodes = {
      source,
      analyser,
      analysisHighpass,
      analysisPresence,
      adaptiveGain,
      limiter,
      dataArray: new Float32Array(analyser.fftSize),
    }
    applyLimiterSettings(nodes, context)

    log('Audio processing nodes created')

    return nodes
  }
  catch (e) {
    error('Failed to create processing chain', e)
    throw e
  }
}

function createLoudnessAnalysis(dataArray: Float32Array): LoudnessAnalysisState {
  return {
    dataArray,
    shortTermBlocks: [],
    integratedBlocks: [],
    animationId: null,
    silenceFrames: 0,
  }
}

function resetLoudnessAnalysis() {
  if (loudnessAnalysis) {
    loudnessAnalysis.shortTermBlocks = []
    loudnessAnalysis.integratedBlocks = []
    loudnessAnalysis.animationId = null
    loudnessAnalysis.silenceFrames = 0
  }

  if (audioNodes && audioContext) {
    audioNodes.adaptiveGain.gain.setValueAtTime(1.0, audioContext.currentTime)
  }
}

function safelyDisconnect(node: AudioNode | null | undefined) {
  if (!node)
    return

  try {
    node.disconnect()
  }
  catch {}
}

function disconnectCurrentGraph() {
  stopLoudnessAnalysis()

  if (!audioNodes)
    return

  safelyDisconnect(audioNodes.source)
  safelyDisconnect(audioNodes.analysisHighpass)
  safelyDisconnect(audioNodes.analysisPresence)
  safelyDisconnect(audioNodes.analyser)
  safelyDisconnect(audioNodes.adaptiveGain)
  safelyDisconnect(audioNodes.limiter)
}

function connectProcessingGraph() {
  if (!audioNodes || !audioContext)
    return

  disconnectCurrentGraph()
  applyLimiterSettings(audioNodes, audioContext)

  const { source, analysisHighpass, analysisPresence, analyser, adaptiveGain, limiter } = audioNodes
  source.connect(analysisHighpass)
  analysisHighpass.connect(analysisPresence)
  analysisPresence.connect(analyser)

  source.connect(adaptiveGain)
  adaptiveGain.connect(limiter)
  limiter.connect(audioContext.destination)
}

function connectBypassGraph() {
  if (!audioNodes || !audioContext)
    return

  disconnectCurrentGraph()
  audioNodes.source.connect(audioContext.destination)
}

function unbindCurrentVideoListeners() {
  if (!currentVideoListeners)
    return

  const { video, onPlay, onPause, onLoadStart, onEmptied } = currentVideoListeners
  video.removeEventListener('play', onPlay)
  video.removeEventListener('pause', onPause)
  video.removeEventListener('loadstart', onLoadStart)
  video.removeEventListener('emptied', onEmptied)

  currentVideoListeners = null
}

function bindVideoListeners(video: HTMLVideoElement) {
  unbindCurrentVideoListeners()

  const onPlay = () => {
    if (video !== currentVideoElement)
      return

    if (settings.value.enableVolumeNormalization && !tempDisabled) {
      startLoudnessAnalysis()
    }
  }

  const onPause = () => {
    if (video === currentVideoElement) {
      stopLoudnessAnalysis()
    }
  }

  const resetForNewSource = () => {
    if (video !== currentVideoElement)
      return

    stopLoudnessAnalysis()
    resetLoudnessAnalysis()
  }

  video.addEventListener('play', onPlay)
  video.addEventListener('pause', onPause)
  video.addEventListener('loadstart', resetForNewSource)
  video.addEventListener('emptied', resetForNewSource)

  currentVideoListeners = {
    video,
    onPlay,
    onPause,
    onLoadStart: resetForNewSource,
    onEmptied: resetForNewSource,
  }
}

function isVisibleVideo(video: HTMLVideoElement) {
  const rect = video.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function getActiveVideoElement(): HTMLVideoElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLVideoElement>(PLAYER_VIDEO_SELECTOR))
    .filter(video => video.isConnected)

  if (candidates.length === 0) {
    return document.querySelector('video')
  }

  return candidates.find(video => isVisibleVideo(video) && !video.ended)
    || candidates.find(isVisibleVideo)
    || candidates[0]
    || null
}

function waitForVideoReady(video: HTMLVideoElement) {
  if (pendingMetadataVideos.has(video))
    return

  pendingMetadataVideos.add(video)
  video.addEventListener('loadedmetadata', () => {
    pendingMetadataVideos.delete(video)

    if (!video.isConnected)
      return

    const activeVideo = getActiveVideoElement()
    if (activeVideo !== video)
      return

    attachToVideo(video)
  }, { once: true })
}

function trimBlocks(blocks: number[], maxLength: number) {
  if (blocks.length > maxLength) {
    blocks.splice(0, blocks.length - maxLength)
  }
}

function computeWeightedRms(dataArray: Float32Array) {
  let sum = 0

  for (let i = 0; i < dataArray.length; i++) {
    const sample = dataArray[i]
    sum += sample * sample
  }

  return Math.sqrt(sum / dataArray.length)
}

// Loudness Analysis Loop
function startLoudnessAnalysis() {
  if (!audioNodes || !loudnessAnalysis || !audioContext || !currentVideoElement)
    return

  if (!settings.value.enableVolumeNormalization || tempDisabled)
    return

  if (loudnessAnalysis.animationId)
    return

  const { analyser, adaptiveGain, limiter } = audioNodes
  const { dataArray } = loudnessAnalysis
  const context = audioContext

  function analyze() {
    if (!audioNodes || !loudnessAnalysis || !audioContext || !currentVideoElement) {
      if (loudnessAnalysis)
        loudnessAnalysis.animationId = null
      return
    }

    if (!settings.value.enableVolumeNormalization || tempDisabled) {
      loudnessAnalysis.animationId = null
      return
    }

    loudnessAnalysis.animationId = window.setTimeout(analyze, ANALYSIS_INTERVAL_MS)

    if (currentVideoElement.paused) {
      return
    }

    analyser.getFloatTimeDomainData(dataArray as any)

    const weightedRms = computeWeightedRms(dataArray)
    const weightedPower = rmsToPower(weightedRms)
    const weightedDb = powerToDb(weightedPower)

    const voiceGateDb = settings.value.voiceGateDb || -34
    const { correctionFactor, maxBoostDb, maxCutDb, deadbandDb, maxStepUpDb, maxStepDownDb, attackTimeConstant, releaseTimeConstant, silenceReleaseTimeConstant } = getGainControlProfile()

    if (weightedDb <= voiceGateDb) {
      loudnessAnalysis.silenceFrames += 1

      if (loudnessAnalysis.silenceFrames === 8) {
        loudnessAnalysis.shortTermBlocks = []
      }

      if (loudnessAnalysis.silenceFrames === 24) {
        loudnessAnalysis.integratedBlocks = loudnessAnalysis.integratedBlocks.slice(-12)
      }

      if (loudnessAnalysis.silenceFrames >= 6) {
        adaptiveGain.gain.setTargetAtTime(1.0, context.currentTime, silenceReleaseTimeConstant)
      }

      return
    }

    loudnessAnalysis.silenceFrames = 0
    loudnessAnalysis.shortTermBlocks.push(weightedPower)
    loudnessAnalysis.integratedBlocks.push(weightedPower)
    trimBlocks(loudnessAnalysis.shortTermBlocks, SHORT_TERM_WINDOW)
    trimBlocks(loudnessAnalysis.integratedBlocks, INTEGRATED_WINDOW)

    const shortTermPower = average(loudnessAnalysis.shortTermBlocks)
    const integratedPower = average(loudnessAnalysis.integratedBlocks)
    const shortTermDb = powerToDb(shortTermPower)
    const integratedDb = powerToDb(integratedPower)
    const blendedLoudnessDb = shortTermDb * 0.7 + integratedDb * 0.3
    const targetLoudnessDb = getTargetLoudnessDb()

    const desiredGainDb = clamp(
      (targetLoudnessDb - blendedLoudnessDb) * correctionFactor,
      -maxCutDb,
      maxBoostDb,
    )

    applyLimiterSettings(audioNodes, context)

    const currentGainDb = gainToDb(adaptiveGain.gain.value)
    const deltaDb = desiredGainDb - currentGainDb

    if (Math.abs(deltaDb) < deadbandDb) {
      log(`Weighted: ${weightedDb.toFixed(1)}dB | ST: ${shortTermDb.toFixed(1)}dB | INT: ${integratedDb.toFixed(1)}dB | Gain hold: ${currentGainDb.toFixed(1)}dB`)
      return
    }

    const maxStepDb = deltaDb < 0 ? maxStepDownDb : maxStepUpDb
    const steppedGainDb = currentGainDb + clamp(deltaDb, -maxStepDb, maxStepDb)
    const timeConstant = deltaDb < 0 ? attackTimeConstant : releaseTimeConstant

    adaptiveGain.gain.setTargetAtTime(
      dbToGain(steppedGainDb),
      context.currentTime,
      timeConstant,
    )

    log(`Weighted: ${weightedDb.toFixed(1)}dB | ST: ${shortTermDb.toFixed(1)}dB | INT: ${integratedDb.toFixed(1)}dB | Gain: ${currentGainDb.toFixed(1)} -> ${steppedGainDb.toFixed(1)}dB | Target: ${targetLoudnessDb.toFixed(1)}dB | Reduction: ${limiter.reduction.toFixed(1)}dB`)
  }

  analyze()
  log('Loudness analysis started')
}

function stopLoudnessAnalysis() {
  if (loudnessAnalysis?.animationId) {
    clearTimeout(loudnessAnalysis.animationId)
    loudnessAnalysis.animationId = null
    log('Loudness analysis stopped')
  }
}

function resumeAudioContext(context: AudioContext) {
  if (context.state !== 'suspended')
    return

  context.resume().then(() => {
    log('AudioContext resumed')
  }).catch(e => error('Failed to resume AudioContext', e))
}

function updateProcessingState() {
  if (!audioNodes || !audioContext)
    return

  try {
    if (settings.value.enableVolumeNormalization && !tempDisabled) {
      connectProcessingGraph()
      resetLoudnessAnalysis()

      if (currentVideoElement && !currentVideoElement.paused) {
        startLoudnessAnalysis()
      }

      console.log('[BewlyAudio] Volume normalization ENABLED')
    }
    else {
      connectBypassGraph()
      console.log('[BewlyAudio] Volume normalization DISABLED (Bypass)')
    }
  }
  catch (e) {
    error('Error updating processing state', e)
  }
}

// Attach to Video
export function attachToVideo(video: HTMLVideoElement) {
  if (!settings.value.enableVolumeNormalization) {
    return
  }

  if (!video.isConnected) {
    return
  }

  if (hasAttached && currentVideoElement === video && audioNodes) {
    updateProcessingState()
    return
  }

  if (video.readyState < 1) {
    waitForVideoReady(video)
    return
  }

  log('Attaching to video element', video)

  const context = initAudioContext()
  if (!context)
    return

  resumeAudioContext(context)

  disconnectCurrentGraph()
  unbindCurrentVideoListeners()

  currentVideoElement = video
  hasAttached = true
  bindVideoListeners(video)

  try {
    let nodes = audioNodeCache.get(video)
    if (!nodes) {
      const source = context.createMediaElementSource(video)
      nodes = createProcessingChain(context, source)
      audioNodeCache.set(video, nodes)
    }
    else {
      log('Reusing cached audio nodes')
    }

    audioNodes = nodes
    loudnessAnalysis = createLoudnessAnalysis(nodes.dataArray)

    updateProcessingState()
    log('Successfully attached')
  }
  catch (e: any) {
    hasAttached = false
    currentVideoElement = null
    audioNodes = null
    loudnessAnalysis = null
    unbindCurrentVideoListeners()

    if (e.message?.includes('already connected')) {
      error('Failed to attach because the video element is already bound to another audio source node', e)
    }
    else {
      error('Error attaching to video', e)
    }
  }
}

// Detach/Reset
export function detach() {
  disconnectCurrentGraph()
  unbindCurrentVideoListeners()

  audioNodes = null
  loudnessAnalysis = null
  currentVideoElement = null
  hasAttached = false

  log('Detached')
}

// 检查是否在视频播放页面
function isVideoPage(): boolean {
  const path = location.pathname
  return path.includes('/video/')
    || path.includes('/bangumi/play/')
    || path.includes('/medialist/')
    || path.startsWith('/festival/')
    || path.startsWith('/cheese/play/')
}

export function initAudioInterceptor() {
  if (isVideoPage()) {
    log('Initializing Audio Interceptor')
  }

  let lastUrl = location.href

  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      if (isVideoPage()) {
        log('URL changed')
      }
    }

    if (!isVideoPage()) {
      if (hasAttached) {
        log('Not on video page, detaching')
        detach()
      }
      return
    }

    if (currentVideoElement && !currentVideoElement.isConnected) {
      log('Current video element was removed, detaching')
      detach()
    }

    const video = getActiveVideoElement()
    if (!video) {
      if (hasAttached) {
        log('Active video element missing, detaching')
        detach()
      }
      return
    }

    if ((video !== currentVideoElement || !hasAttached) && settings.value.enableVolumeNormalization) {
      log('New video element detected')
      attachToVideo(video)
    }
  }, 1000)
}

export function setupSettingsWatcher() {
  watch(() => settings.value.enableVolumeNormalization, (newVal) => {
    log('Settings changed: enableVolumeNormalization =', newVal)

    if (newVal) {
      const video = getActiveVideoElement()
      if (video) {
        attachToVideo(video)
      }
    }
    else if (currentVideoElement) {
      updateProcessingState()
    }
  })

  watch(() => settings.value.targetVolume, (newVal) => {
    log('Target volume updated', newVal)
  })

  watch(() => settings.value.normalizationStrength, (newVal) => {
    log('Normalization strength updated', newVal)
    if (currentVideoElement) {
      updateProcessingState()
    }
  })
}

// 临时禁用音量均衡（不修改设置）
export function setTempDisabled(disabled: boolean) {
  tempDisabled = disabled

  if (currentVideoElement) {
    updateProcessingState()
  }
}

// 获取临时禁用状态
export function isTempDisabled(): boolean {
  return tempDisabled
}

// 获取当前是否有音频处理链
export function isAudioProcessingActive(): boolean {
  return hasAttached
    && audioNodes !== null
    && settings.value.enableVolumeNormalization
    && !tempDisabled
}

// 获取当前增益值（用于显示）
export function getCurrentGainDb(): number | null {
  if (!audioNodes)
    return null
  return gainToDb(audioNodes.adaptiveGain.gain.value)
}
