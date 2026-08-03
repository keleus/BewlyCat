import { watch } from 'vue'

import { settings } from '~/logic'

interface NormalizerStateMessage {
  type: 'state'
  gainDb: number
  weightedDb?: number
  shortTermDb?: number
  integratedDb?: number
  targetDb?: number
}

interface AudioNodeBundle {
  source: MediaElementAudioSourceNode
  analysisHighpass: BiquadFilterNode
  analysisPresence: BiquadFilterNode
  normalizer: AudioWorkletNode
  limiter: DynamicsCompressorNode
  processedOutput: GainNode
  emergencyOutput: GainNode
  connected: boolean
  processorFailed: boolean
  gainDb: number
  lastState: NormalizerStateMessage | null
}

interface ManagedVideoListeners {
  video: HTMLVideoElement
  onPlay: () => void
  onPause: () => void
  onEnded: () => void
  onLoadStart: () => void
  onEmptied: () => void
}

type AudioGraphMode = 'disconnected' | 'processing' | 'bypass' | 'emergency'
type WorkletModuleState = 'not-loaded' | 'loading' | 'ready' | 'retry-wait' | 'unsupported'

const PLAYER_VIDEO_SELECTOR = [
  '#bilibiliPlayer video',
  '#bilibili-player video',
  '.bilibili-player video',
  '.bpx-player-container video',
  '.player-container video',
  '#bofqi video',
  '[aria-label="哔哩哔哩播放器"] video',
].join(',')

const WORKLET_PROCESSOR_NAME = 'bewly-volume-normalizer'
const WORKLET_MODULE_PATH = 'dist/audioWorklets/volume-normalization.js'
const PLAYBACK_END_TOLERANCE_SECONDS = 1
const ATTACH_SETTLE_MS = 450
const MIN_ATTACH_READY_STATE = HTMLMediaElement.HAVE_CURRENT_DATA
const WORKLET_RETRY_DELAY_MS = 5000
const DEBUG_SNAPSHOT_INTERVAL_MS = 1000
const VIDEO_MISSING_GRACE_MS = 3000

let audioContext: AudioContext | null = null
let audioWorkletModulePromise: Promise<void> | null = null
let audioWorkletRetryAfter = 0
let hasReportedWorkletLoadFailure = false
let workletModuleState: WorkletModuleState = 'not-loaded'
let audioNodes: AudioNodeBundle | null = null
let audioGraphMode: AudioGraphMode = 'disconnected'
const audioNodeCache = new WeakMap<HTMLVideoElement, AudioNodeBundle>()
// Videos whose media element is already captured by a MediaElementSource we do
// not own (or whose source node was lost). createMediaElementSource cannot be
// retried for the lifetime of the element.
const mediaSourceBlockedVideos = new WeakSet<HTMLVideoElement>()
const attachInFlight = new WeakMap<HTMLVideoElement, Promise<void>>()
let attachQueue: Promise<void> = Promise.resolve()

let currentVideoElement: HTMLVideoElement | null = null
let currentVideoListeners: ManagedVideoListeners | null = null
const pendingMetadataVideos = new WeakSet<HTMLVideoElement>()
const pendingAttachTimers = new WeakMap<HTMLVideoElement, ReturnType<typeof setTimeout>>()
let attachRequestId = 0
let hasAttached = false
let interceptorTimer: ReturnType<typeof setInterval> | null = null
let hasSetupSettingsWatcher = false
let visibilityChangeHandler: (() => void) | null = null
let hasSetupActivationResume = false
let lastDebugSnapshotAt = 0
let managedVideoMissingSince: number | null = null

// 临时启用/禁用状态（用于播放器控件）
let tempDisabled = false

function logEvent(message: string, details?: Record<string, unknown>) {
  if (!settings.value.volumeNormalizationDebug)
    return

  const prefix = `[BewlyAudio][事件][${getFrameDebugState()}] ${message}`
  if (details)
    console.log(prefix, details)
  else
    console.log(prefix)
}

function error(message: string, ...args: unknown[]) {
  console.error(`[BewlyAudio][错误] ${message}`, ...args)
}

function isAlreadyConnectedError(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object')
    return false

  const errorCause = cause as { message?: unknown, name?: unknown }
  const message = typeof errorCause.message === 'string'
    ? errorCause.message
    : ''
  const name = typeof errorCause.name === 'string' ? errorCause.name : ''

  // Chrome: "HTMLMediaElement already connected previously to a different MediaElementSourceNode."
  return /already connected/i.test(message)
    || (message.includes('createMediaElementSource') && message.includes('MediaElement'))
    || (name === 'InvalidStateError' && !message)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function getStrengthNormalized() {
  return (clamp(finiteOr(settings.value.normalizationStrength, 12), 1, 20) - 1) / 19
}

function isNormalizationEnabled() {
  return settings.value.enableVolumeNormalization && !tempDisabled
}

function getWorkletConfiguration() {
  return {
    enabled: isNormalizationEnabled(),
    debug: settings.value.volumeNormalizationDebug,
    targetVolume: clamp(finiteOr(settings.value.targetVolume, 50), 0, 100),
    strength: clamp(finiteOr(settings.value.normalizationStrength, 12), 1, 20),
    speed: clamp(finiteOr(settings.value.adaptiveGainSpeed, 5), 1, 10),
    voiceGateDb: finiteOr(settings.value.voiceGateDb, -34),
  }
}

function initAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext
    }).webkitAudioContext

    if (!AudioContextClass) {
      error('当前浏览器不支持 AudioContext')
      return null
    }

    audioContext = new AudioContextClass({ latencyHint: 'playback' })
    logEvent('AudioContext 已创建', { state: audioContext.state })
  }

  return audioContext
}

async function ensureAudioWorklet(context: AudioContext) {
  if (!context.audioWorklet) {
    workletModuleState = 'unsupported'
    if (!hasReportedWorkletLoadFailure) {
      hasReportedWorkletLoadFailure = true
      error('当前浏览器不支持 AudioWorklet，保持原生音频输出')
    }
    throw new Error('AudioWorklet is not supported')
  }

  if (!audioWorkletModulePromise) {
    if (Date.now() < audioWorkletRetryAfter)
      throw new Error('AudioWorklet module is waiting before retry')

    const moduleUrl = browser.runtime.getURL(WORKLET_MODULE_PATH)
    workletModuleState = 'loading'
    logEvent('正在加载 AudioWorklet')
    audioWorkletModulePromise = context.audioWorklet.addModule(moduleUrl)
      .then(() => {
        audioWorkletRetryAfter = 0
        hasReportedWorkletLoadFailure = false
        workletModuleState = 'ready'
        logEvent('AudioWorklet 已就绪')
        reportDebugStatus('Worklet 模块加载完成', true)
      })
      .catch((cause) => {
        audioWorkletModulePromise = null
        audioWorkletRetryAfter = Date.now() + WORKLET_RETRY_DELAY_MS
        workletModuleState = 'retry-wait'
        if (!hasReportedWorkletLoadFailure) {
          hasReportedWorkletLoadFailure = true
          error('AudioWorklet 模块加载失败，保持原生音频输出', cause)
        }
        throw cause
      })
  }

  await audioWorkletModulePromise
}

function resumeAudioContext(context: AudioContext) {
  if (context.state !== 'suspended')
    return

  void context.resume()
    .then(() => {
      logEvent('AudioContext 已恢复', { state: context.state })
      reportDebugStatus('上下文恢复', true)
    })
    .catch(cause => error('AudioContext 恢复失败', cause))
}

function setupActivationResume() {
  if (hasSetupActivationResume)
    return

  hasSetupActivationResume = true

  const resumeFromUserActivation = () => {
    if (audioContext && currentVideoElement)
      resumeAudioContext(audioContext)
  }

  document.addEventListener('pointerdown', resumeFromUserActivation, true)
  document.addEventListener('keydown', resumeFromUserActivation, true)
}

function applyProcessingLimiterSettings(nodes: AudioNodeBundle, context: AudioContext) {
  const strength = getStrengthNormalized()
  const { limiter } = nodes
  const now = context.currentTime

  limiter.threshold.setValueAtTime(-7 + strength * 2, now)
  limiter.knee.setValueAtTime(8 + strength * 6, now)
  limiter.ratio.setValueAtTime(6 + strength * 10, now)
  limiter.attack.setValueAtTime(0.003, now)
  limiter.release.setValueAtTime(0.18 + (1 - strength) * 0.18, now)
}

function applyNeutralLimiterSettings(nodes: AudioNodeBundle, context: AudioContext) {
  const { limiter } = nodes
  const now = context.currentTime

  limiter.threshold.setValueAtTime(0, now)
  limiter.knee.setValueAtTime(0, now)
  limiter.ratio.setValueAtTime(1, now)
  limiter.attack.setValueAtTime(0.003, now)
  limiter.release.setValueAtTime(0.25, now)
}

function safelyDisconnect(node: AudioNode | null | undefined) {
  if (!node)
    return

  try {
    node.disconnect()
  }
  catch {}
}

function connectBundle(nodes: AudioNodeBundle, context: AudioContext) {
  if (nodes.connected)
    return

  // Input 0 is the unmodified playback signal. Input 1 is the K-weighting
  // approximation used only for loudness analysis inside the Worklet.
  nodes.source.connect(nodes.normalizer, 0, 0)
  nodes.source.connect(nodes.analysisHighpass)
  nodes.analysisHighpass.connect(nodes.analysisPresence)
  nodes.analysisPresence.connect(nodes.normalizer, 0, 1)
  nodes.normalizer.connect(nodes.limiter)
  nodes.limiter.connect(nodes.processedOutput)
  nodes.processedOutput.connect(context.destination)

  // Keep an emergency route connected at zero gain. It is only raised if the
  // Worklet processor crashes, so normal setting and visibility changes never
  // rebuild the Web Audio graph.
  nodes.source.connect(nodes.emergencyOutput)
  nodes.emergencyOutput.connect(context.destination)
  nodes.connected = true
}

function disconnectBundle(nodes: AudioNodeBundle) {
  safelyDisconnect(nodes.source)
  safelyDisconnect(nodes.analysisHighpass)
  safelyDisconnect(nodes.analysisPresence)
  safelyDisconnect(nodes.normalizer)
  safelyDisconnect(nodes.limiter)
  safelyDisconnect(nodes.processedOutput)
  safelyDisconnect(nodes.emergencyOutput)
  nodes.connected = false
}

function disconnectCurrentGraph() {
  if (audioNodes)
    disconnectBundle(audioNodes)

  audioGraphMode = 'disconnected'
}

function setOutputPath(nodes: AudioNodeBundle, context: AudioContext, emergency: boolean) {
  const now = context.currentTime
  const processedGain = nodes.processedOutput.gain
  const emergencyGain = nodes.emergencyOutput.gain

  processedGain.cancelScheduledValues(now)
  emergencyGain.cancelScheduledValues(now)
  processedGain.setTargetAtTime(emergency ? 0 : 1, now, 0.015)
  emergencyGain.setTargetAtTime(emergency ? 1 : 0, now, 0.015)
}

function postWorkletConfiguration(nodes = audioNodes) {
  if (!nodes || nodes.processorFailed)
    return

  nodes.normalizer.port.postMessage({
    type: 'configure',
    config: getWorkletConfiguration(),
  })
}

function postPlaybackState(active: boolean, nodes = audioNodes) {
  if (!nodes || nodes.processorFailed)
    return

  nodes.normalizer.port.postMessage({ type: 'playback', active })
}

function resetWorklet(nodes = audioNodes) {
  if (!nodes || nodes.processorFailed)
    return

  nodes.normalizer.port.postMessage({ type: 'reset' })
}

function connectProcessingGraph() {
  if (!audioNodes || !audioContext)
    return

  connectBundle(audioNodes, audioContext)

  if (audioNodes.processorFailed) {
    setOutputPath(audioNodes, audioContext, true)
    audioGraphMode = 'emergency'
    return
  }

  setOutputPath(audioNodes, audioContext, false)
  applyProcessingLimiterSettings(audioNodes, audioContext)
  postWorkletConfiguration(audioNodes)
  audioGraphMode = 'processing'
}

function connectBypassGraph() {
  if (!audioNodes || !audioContext)
    return

  connectBundle(audioNodes, audioContext)

  if (audioNodes.processorFailed) {
    setOutputPath(audioNodes, audioContext, true)
    audioGraphMode = 'emergency'
    return
  }

  setOutputPath(audioNodes, audioContext, false)
  applyNeutralLimiterSettings(audioNodes, audioContext)
  postWorkletConfiguration(audioNodes)
  audioGraphMode = 'bypass'
}

function formatDebugDb(value: number | undefined) {
  return value !== undefined && Number.isFinite(value)
    ? Math.round(value * 10) / 10
    : null
}

function getPlaybackDebugState() {
  if (!currentVideoElement)
    return '未绑定'
  if (isPlaybackAtEnd(currentVideoElement))
    return '已结束'
  return currentVideoElement.paused ? '已暂停' : '播放中'
}

function getNormalizationDebugState(nodes: AudioNodeBundle | null) {
  if (nodes?.processorFailed || audioGraphMode === 'emergency')
    return '紧急旁路'
  if (!settings.value.enableVolumeNormalization)
    return '设置关闭'
  if (tempDisabled)
    return '临时禁用'
  if (!nodes)
    return '等待绑定'
  return audioGraphMode === 'processing' ? '实时均衡' : '直通'
}

function getFrameDebugState() {
  return window.self === window.top ? '主页面' : '内嵌页'
}

function reportDebugStatus(
  reason: string,
  force = false,
  nodes: AudioNodeBundle | null = audioNodes,
) {
  if (!settings.value.volumeNormalizationDebug)
    return

  // Content scripts also run in Bilibili iframes. An iframe without its own
  // managed video is not an audio state and should not look like an "unbound"
  // transition of the active top-level player.
  if (!nodes && window.self !== window.top)
    return

  const now = Date.now()
  if (!force && now - lastDebugSnapshotAt < DEBUG_SNAPSHOT_INTERVAL_MS)
    return

  lastDebugSnapshotAt = now
  const state = nodes?.lastState
  const tab = document.hidden ? '后台' : '前台'
  const frame = getFrameDebugState()
  const contextState = audioContext?.state ?? '未创建'
  const playback = getPlaybackDebugState()
  const normalization = getNormalizationDebugState(nodes)
  const worklet = nodes?.processorFailed ? 'processor-failed' : workletModuleState
  const gainDb = formatDebugDb(state?.gainDb ?? nodes?.gainDb)
  const snapshot = {
    tab,
    frame,
    audioContext: contextState,
    playback,
    normalization,
    graph: audioGraphMode,
    worklet,
    gainDb,
    weightedDb: formatDebugDb(state?.weightedDb),
    shortTermDb: formatDebugDb(state?.shortTermDb),
    integratedDb: formatDebugDb(state?.integratedDb),
    targetDb: formatDebugDb(state?.targetDb),
    limiterReductionDb: nodes ? formatDebugDb(nodes.limiter.reduction) : null,
    settings: {
      targetVolume: settings.value.targetVolume,
      strength: settings.value.normalizationStrength,
      speed: settings.value.adaptiveGainSpeed,
      voiceGateDb: settings.value.voiceGateDb,
    },
  }
  const gainLabel = gainDb === null ? '--' : `${gainDb} dB`

  console.log(
    `[BewlyAudio][状态] ${reason} | ${frame} | ${tab} | ${playback} | ${normalization} | context=${contextState} | worklet=${worklet} | gain=${gainLabel}`,
    snapshot,
  )
}

function handleWorkletState(nodes: AudioNodeBundle, message: NormalizerStateMessage) {
  if (message.type !== 'state')
    return

  nodes.gainDb = message.gainDb
  nodes.lastState = message

  // Pause/ended events already emit one forced snapshot. Do not keep printing
  // periodic Worklet reports while playback is inactive.
  if (nodes === audioNodes && isPlaybackActive(currentVideoElement))
    reportDebugStatus('运行中', false, nodes)
}

function createProcessingChain(
  context: AudioContext,
  video: HTMLVideoElement,
): AudioNodeBundle {
  const analysisHighpass = context.createBiquadFilter()
  analysisHighpass.type = 'highpass'
  analysisHighpass.frequency.setValueAtTime(80, context.currentTime)
  analysisHighpass.Q.setValueAtTime(0.707, context.currentTime)

  const analysisPresence = context.createBiquadFilter()
  analysisPresence.type = 'highshelf'
  analysisPresence.frequency.setValueAtTime(1600, context.currentTime)
  analysisPresence.gain.setValueAtTime(4, context.currentTime)

  const normalizer = new AudioWorkletNode(context, WORKLET_PROCESSOR_NAME, {
    numberOfInputs: 2,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: 'max',
    channelInterpretation: 'speakers',
  })
  const limiter = context.createDynamicsCompressor()
  const processedOutput = context.createGain()
  const emergencyOutput = context.createGain()
  processedOutput.gain.setValueAtTime(1, context.currentTime)
  emergencyOutput.gain.setValueAtTime(0, context.currentTime)

  // Create the MediaElement source last. If Worklet/node creation is
  // unsupported, the video is never captured away from its native output.
  // A media element can only ever be bound once; cache immediately so a later
  // failure cannot lose the only MediaElementAudioSourceNode reference.
  const source = context.createMediaElementSource(video)
  const nodes: AudioNodeBundle = {
    source,
    analysisHighpass,
    analysisPresence,
    normalizer,
    limiter,
    processedOutput,
    emergencyOutput,
    connected: false,
    processorFailed: false,
    gainDb: 0,
    lastState: null,
  }
  audioNodeCache.set(video, nodes)

  normalizer.port.onmessage = (event: MessageEvent<NormalizerStateMessage>) => {
    handleWorkletState(nodes, event.data)
  }
  normalizer.onprocessorerror = () => {
    nodes.processorFailed = true
    error('AudioWorklet 处理器异常，正在切换紧急旁路')

    if (nodes === audioNodes && audioContext) {
      setOutputPath(nodes, audioContext, true)
      audioGraphMode = 'emergency'
      reportDebugStatus('Worklet 异常，已切换紧急旁路', true, nodes)
    }
  }

  applyProcessingLimiterSettings(nodes, context)
  return nodes
}

function getOrCreateAudioNodes(context: AudioContext, video: HTMLVideoElement): AudioNodeBundle {
  const cached = audioNodeCache.get(video)
  if (cached)
    return cached

  return createProcessingChain(context, video)
}

function activateAudioNodes(
  nodes: AudioNodeBundle,
  context: AudioContext,
  shouldResumeContext = false,
) {
  if (shouldResumeContext)
    resumeAudioContext(context)

  connectBundle(nodes, context)

  if (nodes.processorFailed) {
    setOutputPath(nodes, context, true)
    audioGraphMode = 'emergency'
    return
  }

  if (isNormalizationEnabled()) {
    setOutputPath(nodes, context, false)
    applyProcessingLimiterSettings(nodes, context)
    audioGraphMode = 'processing'
  }
  else {
    setOutputPath(nodes, context, false)
    applyNeutralLimiterSettings(nodes, context)
    audioGraphMode = 'bypass'
  }

  postWorkletConfiguration(nodes)
}

function unbindCurrentVideoListeners() {
  if (!currentVideoListeners)
    return

  const { video, onPlay, onPause, onEnded, onLoadStart, onEmptied } = currentVideoListeners
  video.removeEventListener('play', onPlay)
  video.removeEventListener('pause', onPause)
  video.removeEventListener('ended', onEnded)
  video.removeEventListener('loadstart', onLoadStart)
  video.removeEventListener('emptied', onEmptied)
  currentVideoListeners = null
}

function isPlaybackAtEnd(video: HTMLVideoElement) {
  return video.ended
    || (Number.isFinite(video.duration)
      && video.duration > 0
      && video.currentTime >= video.duration - PLAYBACK_END_TOLERANCE_SECONDS)
}

function isPlaybackActive(video: HTMLVideoElement | null): video is HTMLVideoElement {
  return !!video && !video.paused && !isPlaybackAtEnd(video)
}

function updateProcessingState(shouldResumeContext = false) {
  if (!audioNodes || !audioContext)
    return

  try {
    if (shouldResumeContext)
      resumeAudioContext(audioContext)

    if (isNormalizationEnabled())
      connectProcessingGraph()
    else
      connectBypassGraph()

    postPlaybackState(isPlaybackActive(currentVideoElement))
  }
  catch (cause) {
    error('更新音频处理状态失败', cause)
  }
}

function bindVideoListeners(video: HTMLVideoElement) {
  unbindCurrentVideoListeners()

  const onPlay = () => {
    if (video !== currentVideoElement)
      return

    // A real playback event/user activation may resume an autoplay-suspended
    // context. Visibility changes deliberately never resume or reset it.
    updateProcessingState(true)
    reportDebugStatus('视频开始播放', true)
  }

  const onPause = () => {
    if (video === currentVideoElement) {
      postPlaybackState(false)
      reportDebugStatus('视频已暂停，保持当前增益', true)
    }
  }

  const onEnded = () => {
    if (video !== currentVideoElement)
      return

    postPlaybackState(false)
    resetWorklet()
    reportDebugStatus('视频播放结束，均衡状态已重置', true)
  }

  const resetForNewSource = () => {
    if (video !== currentVideoElement)
      return

    postPlaybackState(false)
    resetWorklet()
    reportDebugStatus('检测到新音频源，均衡状态已重置', true)
  }

  video.addEventListener('play', onPlay)
  video.addEventListener('pause', onPause)
  video.addEventListener('ended', onEnded)
  video.addEventListener('loadstart', resetForNewSource)
  video.addEventListener('emptied', resetForNewSource)

  currentVideoListeners = {
    video,
    onPlay,
    onPause,
    onEnded,
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

  if (candidates.length === 0)
    return document.querySelector('video')

  if (currentVideoElement
    && candidates.includes(currentVideoElement)
    && isPlaybackActive(currentVideoElement)) {
    return currentVideoElement
  }

  const playingVideo = candidates.find(video => isVisibleVideo(video) && isPlaybackActive(video))
    || candidates.find(video => isPlaybackActive(video))

  if (playingVideo)
    return playingVideo

  // Player transitions can briefly report the managed video as paused. Keep
  // that element instead of binding a temporary sibling and rebuilding audio.
  if (currentVideoElement && candidates.includes(currentVideoElement))
    return currentVideoElement

  return candidates.find(video => isVisibleVideo(video) && !video.ended)
    || candidates.find(isVisibleVideo)
    || candidates[0]
    || null
}

function clearManagedVideoMissingState() {
  managedVideoMissingSince = null
}

function hasManagedVideoBeenMissingLongEnough() {
  const now = Date.now()
  if (managedVideoMissingSince === null) {
    managedVideoMissingSince = now
    logEvent('播放器节点暂时不可用，等待 DOM 稳定', {
      graceMs: VIDEO_MISSING_GRACE_MS,
    })
    return false
  }

  return now - managedVideoMissingSince >= VIDEO_MISSING_GRACE_MS
}

function clearPendingAttachTimer(video: HTMLVideoElement) {
  const timer = pendingAttachTimers.get(video)
  if (!timer)
    return

  clearTimeout(timer)
  pendingAttachTimers.delete(video)
}

function scheduleAttachToVideo(video: HTMLVideoElement) {
  clearPendingAttachTimer(video)

  const timer = setTimeout(() => {
    pendingAttachTimers.delete(video)
    pendingMetadataVideos.delete(video)

    if (!video.isConnected || document.hidden)
      return

    const activeVideo = getActiveVideoElement()
    if (activeVideo && activeVideo !== video)
      return

    attachToVideo(video)
  }, ATTACH_SETTLE_MS)

  pendingAttachTimers.set(video, timer)
}

function isVideoSafeToAttach(video: HTMLVideoElement) {
  if (!video.isConnected || document.hidden)
    return false

  if (!video.currentSrc && !video.srcObject)
    return false

  if (video.readyState >= MIN_ATTACH_READY_STATE)
    return true

  return isPlaybackActive(video) && video.readyState >= HTMLMediaElement.HAVE_METADATA
}

function waitForVideoReady(video: HTMLVideoElement) {
  if (pendingMetadataVideos.has(video) || pendingAttachTimers.has(video))
    return

  if (isVideoSafeToAttach(video)) {
    scheduleAttachToVideo(video)
    return
  }

  pendingMetadataVideos.add(video)

  const onReady = () => {
    video.removeEventListener('loadeddata', onReady)
    video.removeEventListener('canplay', onReady)
    video.removeEventListener('playing', onReady)

    if (!video.isConnected) {
      pendingMetadataVideos.delete(video)
      return
    }

    scheduleAttachToVideo(video)
  }

  video.addEventListener('loadeddata', onReady)
  video.addEventListener('canplay', onReady)
  video.addEventListener('playing', onReady)
}

async function attachToVideoInternal(video: HTMLVideoElement) {
  if (!settings.value.enableVolumeNormalization || document.hidden || !video.isConnected)
    return

  if (mediaSourceBlockedVideos.has(video))
    return

  const cachedNodes = audioNodeCache.get(video)
  if (currentVideoElement === video && audioNodes && cachedNodes === audioNodes) {
    clearManagedVideoMissingState()
    hasAttached = true
    if (audioContext && !audioNodes.connected)
      activateAudioNodes(audioNodes, audioContext, isPlaybackActive(video))
    else
      updateProcessingState(isPlaybackActive(video))
    return
  }

  if (!isVideoSafeToAttach(video)) {
    waitForVideoReady(video)
    return
  }

  clearPendingAttachTimer(video)
  pendingMetadataVideos.delete(video)

  const requestId = ++attachRequestId
  const context = initAudioContext()
  if (!context)
    return

  // Load and register the processor before createMediaElementSource. If module
  // loading fails, the page's native audio remains untouched.
  try {
    await ensureAudioWorklet(context)
  }
  catch {
    return
  }

  if (requestId !== attachRequestId
    || !settings.value.enableVolumeNormalization
    || document.hidden
    || !video.isConnected
    || mediaSourceBlockedVideos.has(video)) {
    return
  }

  const activeVideo = getActiveVideoElement()
  if (activeVideo && activeVideo !== video)
    return

  // Keep the previous graph alive until the target bundle is ready. Disconnecting
  // first can leave a dangling MediaElementSource and stall Bilibili loading.
  const previousNodes = audioNodes
  const previousVideo = currentVideoElement
  const previousAttached = hasAttached
    && !!previousNodes
    && !!previousVideo
    && previousVideo.isConnected

  try {
    const reused = audioNodeCache.has(video)
    const nodes = getOrCreateAudioNodes(context, video)
    if (reused)
      logEvent('复用现有 AudioWorklet 音频图')

    if (previousNodes && previousNodes !== nodes)
      disconnectBundle(previousNodes)

    audioNodes = nodes
    currentVideoElement = video
    hasAttached = true
    clearManagedVideoMissingState()
    bindVideoListeners(video)

    // Connect in the same turn as create/reuse so the media element never sits
    // with a captured-but-disconnected MediaElementSource.
    activateAudioNodes(nodes, context, isPlaybackActive(video))
    postPlaybackState(isPlaybackActive(video), nodes)
    logEvent('已绑定视频音频')
    reportDebugStatus('绑定完成', true, nodes)
  }
  catch (cause) {
    unbindCurrentVideoListeners()

    // Prefer restoring the previous audible graph over leaving any source
    // disconnected after a failed switch/create.
    if (previousAttached && previousNodes && previousVideo) {
      audioNodes = previousNodes
      currentVideoElement = previousVideo
      hasAttached = true
      try {
        bindVideoListeners(previousVideo)
        activateAudioNodes(previousNodes, context, isPlaybackActive(previousVideo))
        postPlaybackState(isPlaybackActive(previousVideo), previousNodes)
      }
      catch (restoreCause) {
        error('恢复先前音频图失败', restoreCause)
      }
    }
    else {
      const orphanedNodes = audioNodeCache.get(video)
      if (orphanedNodes) {
        // Source was created for this video but activation failed; keep the only
        // reference connected so the player does not stick on loading.
        audioNodes = orphanedNodes
        currentVideoElement = video
        hasAttached = true
        try {
          bindVideoListeners(video)
          activateAudioNodes(orphanedNodes, context, isPlaybackActive(video))
          postPlaybackState(isPlaybackActive(video), orphanedNodes)
          logEvent('绑定后激活失败，已紧急恢复音频通路')
        }
        catch (recoverCause) {
          hasAttached = false
          currentVideoElement = null
          audioNodes = null
          error('紧急恢复音频通路失败', recoverCause)
        }
      }
      else {
        hasAttached = false
        currentVideoElement = null
        audioNodes = null
      }
    }

    if (isAlreadyConnectedError(cause)) {
      mediaSourceBlockedVideos.add(video)
      logEvent('视频已被其他 MediaElementAudioSourceNode 占用，跳过音量均衡')
    }
    else {
      error('AudioWorklet 音频图绑定失败', cause)
    }
  }
}

// Attach to Video
export function attachToVideo(video: HTMLVideoElement) {
  const existing = attachInFlight.get(video)
  if (existing) {
    void existing
    return
  }

  const run = attachQueue
    .catch(() => {})
    .then(() => attachToVideoInternal(video))

  const tracked = run.finally(() => {
    if (attachInFlight.get(video) === tracked)
      attachInFlight.delete(video)
  })

  attachInFlight.set(video, tracked)
  attachQueue = tracked.then(() => {}, () => {})
  void tracked
}

// Detach/Reset
export function detach() {
  attachRequestId += 1
  disconnectCurrentGraph()
  unbindCurrentVideoListeners()

  audioNodes = null
  currentVideoElement = null
  hasAttached = false
  clearManagedVideoMissingState()
  logEvent('已解除视频音频绑定')
  reportDebugStatus('已解绑', true, null)
}

function isVideoPage(): boolean {
  const path = location.pathname
  return path.includes('/video/')
    || path.includes('/bangumi/play/')
    || path.includes('/medialist/')
    || path.startsWith('/festival/')
    || path.startsWith('/cheese/play/')
}

function stopAudioInterceptor() {
  if (interceptorTimer) {
    clearInterval(interceptorTimer)
    interceptorTimer = null
  }

  if (visibilityChangeHandler) {
    document.removeEventListener('visibilitychange', visibilityChangeHandler)
    visibilityChangeHandler = null
  }
}

export function initAudioInterceptor() {
  if (interceptorTimer || !settings.value.enableVolumeNormalization)
    return

  setupActivationResume()

  if (isVideoPage())
    logEvent('音量均衡拦截器已启动')

  let lastUrl = location.href

  if (!visibilityChangeHandler) {
    visibilityChangeHandler = () => {
      // A running graph keeps processing in the background. Visibility never
      // changes its gain, playback state, connections, or AudioContext state.
      if (document.hidden) {
        if (hasAttached && audioNodes)
          reportDebugStatus('标签页进入后台，均衡保持运行', true)
        return
      }

      if (hasAttached && audioNodes)
        reportDebugStatus('标签页回到前台', true)

      // Pages opened in the background attach only after first becoming visible.
      if (hasAttached && currentVideoElement?.isConnected && audioNodes)
        return

      const video = getActiveVideoElement()
      if (video && video !== currentVideoElement)
        attachToVideo(video)
    }
    document.addEventListener('visibilitychange', visibilityChangeHandler)
  }

  interceptorTimer = setInterval(() => {
    const urlChanged = location.href !== lastUrl
    if (urlChanged) {
      lastUrl = location.href
      if (isVideoPage())
        logEvent('检测到视频页面切换', { path: location.pathname })
    }

    if (!isVideoPage()) {
      if (hasAttached)
        detach()
      return
    }

    if (document.hidden)
      return

    const video = getActiveVideoElement()
    if (!video) {
      if (hasAttached && hasManagedVideoBeenMissingLongEnough())
        detach()
      return
    }

    if (currentVideoElement && !currentVideoElement.isConnected && video === currentVideoElement) {
      if (hasManagedVideoBeenMissingLongEnough())
        detach()
      return
    }

    clearManagedVideoMissingState()

    if ((video !== currentVideoElement || !hasAttached) && settings.value.enableVolumeNormalization)
      attachToVideo(video)
  }, 1000)
}

function updateWorkletSettings() {
  if (!audioNodes || !audioContext)
    return

  if (isNormalizationEnabled()) {
    applyProcessingLimiterSettings(audioNodes, audioContext)
    connectProcessingGraph()
  }
  else {
    connectBypassGraph()
  }

  postWorkletConfiguration()
}

export function setupSettingsWatcher() {
  if (hasSetupSettingsWatcher)
    return

  hasSetupSettingsWatcher = true

  watch(() => settings.value.enableVolumeNormalization, (enabled) => {
    logEvent(enabled ? '音量均衡设置已启用' : '音量均衡设置已关闭')

    if (enabled) {
      initAudioInterceptor()
      const video = getActiveVideoElement()
      if (video && !document.hidden)
        attachToVideo(video)
    }
    else {
      updateWorkletSettings()
      reportDebugStatus('设置已关闭，音频保持直通', true)
      stopAudioInterceptor()
    }
  })

  watch(
    () => [
      settings.value.targetVolume,
      settings.value.normalizationStrength,
      settings.value.adaptiveGainSpeed,
      settings.value.voiceGateDb,
    ],
    () => {
      updateWorkletSettings()
      reportDebugStatus('均衡参数已更新', true)
    },
  )

  watch(() => settings.value.volumeNormalizationDebug, (enabled) => {
    updateWorkletSettings()
    if (enabled)
      reportDebugStatus('调试日志已启用', true)
    else if (hasAttached && audioNodes)
      console.log(`[BewlyAudio][事件][${getFrameDebugState()}] 调试日志已关闭`)
  })
}

// 临时禁用音量均衡（不修改设置）
export function setTempDisabled(disabled: boolean) {
  tempDisabled = disabled
  updateWorkletSettings()
  reportDebugStatus(disabled ? '播放器按钮临时禁用均衡' : '播放器按钮恢复实时均衡', true)
}

export function isTempDisabled(): boolean {
  return tempDisabled
}

export function isAudioProcessingActive(): boolean {
  return hasAttached
    && audioNodes !== null
    && audioGraphMode === 'processing'
    && !audioNodes.processorFailed
    && isNormalizationEnabled()
}

export function getCurrentGainDb(): number | null {
  return audioNodes?.gainDb ?? null
}
