import { watch } from 'vue'

// Watch settings
import { settings } from '~/logic'

// Debug logger
function log(msg: string, ...args: any[]) {
  console.log(`[BewlyAudio] ${msg}`, ...args)
}

function error(msg: string, ...args: any[]) {
  console.error(`[BewlyAudio] ${msg}`, ...args)
}

// Audio Context and Nodes
let audioContext: AudioContext | null = null
let audioNodes: {
  source: MediaElementAudioSourceNode
  analyser: AnalyserNode
  adaptiveGain: GainNode
  limiter: GainNode | DynamicsCompressorNode // Kept as union for compatibility
} | null = null

// Analysis State
let loudnessAnalysis: {
  dataArray: Float32Array
  smoothedLoudness: number
  targetLoudness: number
  animationId: number | null
} | null = null

let currentVideoElement: HTMLVideoElement | null = null
let hasAttached = false

// Initialize Audio Context
function initAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (AudioContextClass) {
      // Use 'playback' latency hint to prefer smooth playback over low latency
      // This can reduce CPU usage and dropouts
      audioContext = new AudioContextClass({ latencyHint: 'playback' })
      log('AudioContext initialized', audioContext.state)
    }
    else {
      error('AudioContext not supported')
    }
  }
  return audioContext
}

// Create Processing Chain
function createProcessingChain(context: AudioContext, source: MediaElementAudioSourceNode) {
  try {
    // 1. Analyser
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024 // Reduced from 2048 to save CPU
    analyser.smoothingTimeConstant = 0.8
    const bufferLength = analyser.fftSize
    const dataArray = new Float32Array(bufferLength)

    // 2. Adaptive Gain
    const adaptiveGain = context.createGain()
    adaptiveGain.gain.setValueAtTime(1.0, context.currentTime)

    // Simplified Graph: Source -> Analyser -> Gain -> Destination
    // Removed Compressor and Limiter to reduce overhead and potential glitches
    // The Gain node will handle volume normalization.
    // We rely on the browser's internal limiter or just careful gain calculation to avoid clipping.
    // (Most browsers handle >0dB gracefully in the pipeline, clipping only at output)

    // Connect
    source.connect(analyser)
    analyser.connect(adaptiveGain)
    adaptiveGain.connect(context.destination)

    log('Audio processing chain created (Simplified)')

    return {
      analyser,
      adaptiveGain,
      dataArray,
      // Mock limiter for compatibility with existing types/logic
      limiter: adaptiveGain,
    }
  }
  catch (e) {
    error('Failed to create processing chain', e)
    throw e
  }
}

// Loudness Analysis Loop
function startLoudnessAnalysis() {
  if (!audioNodes || !loudnessAnalysis || !audioContext)
    return

  // If already running, don't start another
  if (loudnessAnalysis.animationId)
    return

  const { analyser, adaptiveGain } = audioNodes
  const { dataArray } = loudnessAnalysis
  const context = audioContext

  let lastGainUpdate = 0

  // Throttled Analysis Loop (5fps - 200ms)
  function analyze() {
    if (!audioNodes || !loudnessAnalysis || !audioContext)
      return

    // Schedule next analysis
    loudnessAnalysis.animationId = window.setTimeout(analyze, 200)

    // If video is paused, skip analysis to save CPU
    if (currentVideoElement && currentVideoElement.paused) {
      return
    }

    analyser.getFloatTimeDomainData(dataArray as any)

    // Calculate RMS
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i]
    }
    const rms = Math.sqrt(sum / dataArray.length)

    // Smooth Loudness
    const smoothingFactor = 0.95 // Adjusted for slower sampling
    loudnessAnalysis.smoothedLoudness = loudnessAnalysis.smoothedLoudness * smoothingFactor + rms * (1 - smoothingFactor)

    // Update Gain every 1s
    const now = context.currentTime
    if (now - lastGainUpdate >= 1.0) {
      lastGainUpdate = now

      const currentLoudness = loudnessAnalysis.smoothedLoudness
      if (currentLoudness > 0.0001) {
        const currentDb = 20 * Math.log10(currentLoudness)

        // Target Calculation
        const targetVolume = settings.value.targetVolume || 50
        const volumeRatio = (100 - targetVolume) / 100
        const targetDb = -45 * volumeRatio ** 1.8

        const gainDb = targetDb - currentDb
        // Clamp gain to avoid extreme amplification of noise
        const clampedGainDb = Math.max(-15, Math.min(15, gainDb))
        const targetGain = 10 ** (clampedGainDb / 20)

        const responseSpeed = (settings.value.adaptiveGainSpeed || 5) / 10
        const timeConstant = 11 - responseSpeed

        adaptiveGain.gain.setTargetAtTime(
          Math.max(0.01, targetGain),
          now,
          timeConstant,
        )

        // Verbose logging (every 1s)
        log(`Loudness: ${currentDb.toFixed(1)}dB | Gain: ${gainDb > 0 ? '+' : ''}${gainDb.toFixed(1)}dB | Target: ${targetDb.toFixed(1)}dB`)
      }
    }
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

// Attach to Video
export function attachToVideo(video: HTMLVideoElement) {
  if (hasAttached && currentVideoElement === video) {
    // If already attached, just ensure we are in the right state (processing vs bypass)
    updateProcessingState()
    return
  }

  if (!settings.value.enableVolumeNormalization) {
    return
  }

  // Ensure video is ready
  if (video.readyState < 1) {
    video.addEventListener('loadedmetadata', () => attachToVideo(video), { once: true })
    return
  }

  log('Attaching to video element', video)
  currentVideoElement = video
  hasAttached = true

  // Listen to play/pause events to manage analysis loop
  video.addEventListener('play', () => startLoudnessAnalysis())
  video.addEventListener('pause', () => {
    // We don't fully stop (clearTimeout), but the analyze loop checks for paused state.
    // Actually, clearing timeout is better to stop the loop entirely.
    // But we need to restart it on play.
    // Let's rely on the check inside analyze() for simplicity, or:
    // stopLoudnessAnalysis() // This would require startLoudnessAnalysis() to be robust.
  })
  // We'll stick to the check inside analyze() for now to avoid race conditions.

  const context = initAudioContext()
  if (!context)
    return

  if (context.state === 'suspended') {
    context.resume().then(() => {
      log('AudioContext resumed')
    }).catch(e => error('Failed to resume AudioContext', e))
  }

  try {
    // Create Source (or reuse if we could, but we can't easily access existing one if we lost reference)
    // If we already have audioNodes for this video, reuse them
    if (audioNodes && audioNodes.source.mediaElement === video) {
      log('Reusing existing audio nodes')
    }
    else {
      // This might fail if already connected by someone else
      const source = context.createMediaElementSource(video)
      const nodes = createProcessingChain(context, source)
      audioNodes = {
        source,
        ...nodes,
      }

      loudnessAnalysis = {
        dataArray: nodes.dataArray,
        smoothedLoudness: 0,
        targetLoudness: (settings.value.targetVolume || 50) / 100,
        animationId: null,
      }
    }

    updateProcessingState()
    log('Successfully attached')
  }
  catch (e: any) {
    if (e.message?.includes('already connected')) {
      // Ignore
    }
    else {
      error('Error attaching to video', e)
    }
    // We don't set hasAttached=false here because we might want to retry or it might be fine
  }
}

function updateProcessingState() {
  if (!audioNodes || !audioContext)
    return

  const { source, limiter } = audioNodes

  if (settings.value.enableVolumeNormalization) {
    // Enable processing: Source -> Analyser -> ... -> Limiter -> Destination
    try {
      // Disconnect bypass if exists
      try {
        source.disconnect(audioContext.destination)
      }
      catch {}

      // Connect chain
      // Ensure chain is connected
      // source -> analyser (already connected in createProcessingChain)
      // limiter -> destination
      limiter.connect(audioContext.destination)

      if (!loudnessAnalysis?.animationId) {
        startLoudnessAnalysis()
      }
      log('Volume normalization ENABLED')
    }
    catch (e) {
      error('Error enabling processing', e)
    }
  }
  else {
    // Disable processing (Bypass): Source -> Destination
    try {
      stopLoudnessAnalysis()

      // Disconnect chain from destination
      limiter.disconnect()

      // Connect source directly to destination
      source.connect(audioContext.destination)
      log('Volume normalization DISABLED (Bypass)')
    }
    catch (e) {
      error('Error disabling processing', e)
    }
  }
}

// Detach/Reset
export function detach() {
  stopLoudnessAnalysis()

  // We cannot fully detach (undo createMediaElementSource).
  // We can only bypass.
  if (audioNodes && audioContext) {
    try {
      audioNodes.limiter.disconnect()
      audioNodes.source.connect(audioContext.destination)
    }
    catch {}
  }

  currentVideoElement = null
  hasAttached = false
  log('Detached (Bypass mode)')
}

export function initAudioInterceptor() {
  log('Initializing Audio Interceptor')

  let lastUrl = location.href

  setInterval(() => {
    // 1. Check URL change
    if (location.href !== lastUrl) {
      lastUrl = location.href
      log('URL changed')
      // Don't full detach, just check video
    }

    // 2. Check Video Element
    const video = document.querySelector('video')
    if (video) {
      if (video !== currentVideoElement) {
        log('New video element detected')
        // If we have old nodes, we should probably close them or let GC handle if we create new context?
        // But we reuse context.
        // If we switch video elements, we MUST create new source.
        // Old source is bound to old video.
        if (currentVideoElement) {
          // Old video might still be playing?
          // Just leave it?
        }
        attachToVideo(video)
      }
      else if (hasAttached) {
        // Periodic check to ensure state is correct
        // updateProcessingState() // Too spammy
      }
    }
  }, 1000)
}

export function setupSettingsWatcher() {
  watch(() => settings.value.enableVolumeNormalization, (newVal) => {
    log('Settings changed: enableVolumeNormalization =', newVal)
    if (currentVideoElement) {
      updateProcessingState()
    }
  })

  watch(() => settings.value.targetVolume, (newVal) => {
    if (loudnessAnalysis) {
      loudnessAnalysis.targetLoudness = (newVal || 50) / 100
      log('Target volume updated', newVal)
    }
  })
}
