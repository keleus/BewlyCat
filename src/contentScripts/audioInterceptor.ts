import { watch } from 'vue'

// Watch settings
import { settings } from '~/logic'

// Debug logger
function log(msg: string, ...args: any[]) {
  if (settings.value.volumeNormalizationDebug) {
    console.log(`[BewlyAudio] ${msg}`, ...args)
  }
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
  recentLoudness: number[] // 用于计算百分位响度
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

    // 使用设置中的人声检测阈值
    // dB 转换为线性值: 10^(dB/20)
    const voiceGateDb = settings.value.voiceGateDb || -34
    const voiceGate = 10 ** (voiceGateDb / 20)

    if (rms > voiceGate) {
      // 只记录人声级别的响度
      loudnessAnalysis.recentLoudness.push(rms)

      // 突变检测：检测响度剧烈变化（BGM突然变大/小）
      const windowSize = 15 // 3 秒（15 个样本 × 200ms）
      if (loudnessAnalysis.recentLoudness.length >= 5) {
        // 比较最新样本和当前平滑值
        const currentSmoothed = loudnessAnalysis.smoothedLoudness
        if (currentSmoothed > 0.0001) {
          const ratio = rms / currentSmoothed
          // 如果响度突然增加超过2倍或减少到1/2以下，判定为场景切换
          if (ratio > 2.0 || ratio < 0.5) {
            // 快速重置：只保留最近3个样本，快速适应新场景
            loudnessAnalysis.recentLoudness = loudnessAnalysis.recentLoudness.slice(-3)
            log(`Scene change detected (ratio: ${ratio.toFixed(2)}), reset window`)
          }
        }
      }

      // 自适应窗口大小：检测是否在淡入/淡出
      if (loudnessAnalysis.recentLoudness.length > windowSize) {
        // 检测趋势：最近 5 个样本的平均值 vs 前面样本的平均值
        const recentAvg = loudnessAnalysis.recentLoudness.slice(-5).reduce((a, b) => a + b, 0) / 5
        const olderAvg = loudnessAnalysis.recentLoudness.slice(0, Math.min(10, loudnessAnalysis.recentLoudness.length - 5)).reduce((a, b) => a + b, 0) / Math.min(10, loudnessAnalysis.recentLoudness.length - 5)

        // 如果响度显著增加（淡入），快速丢弃旧样本
        if (recentAvg > olderAvg * 1.5) {
          // 淡入：只保留最近 10 个样本
          loudnessAnalysis.recentLoudness = loudnessAnalysis.recentLoudness.slice(-10)
        }
        else {
          // 正常情况：保持窗口大小
          loudnessAnalysis.recentLoudness.shift()
        }
      }

      // 计算自适应百分位：优先关注较响的内容（人声区域）
      if (loudnessAnalysis.recentLoudness.length >= 3) {
        const sorted = [...loudnessAnalysis.recentLoudness].sort((a, b) => a - b)

        // 过滤掉最低的 40% 样本（背景音/间隙），使用剩余样本的中位数
        // 这样能更好地聚焦人声和主要内容
        const filterThreshold = Math.floor(sorted.length * 0.4)
        const filteredSamples = sorted.slice(filterThreshold)

        // 使用过滤后样本的 30 百分位（偏向较安静的人声，避免被大声片段拉高）
        const percentile30Index = Math.floor(filteredSamples.length * 0.3)
        const targetLoudness = filteredSamples[percentile30Index]

        // 对目标响度进行平滑，根据场景变化程度调整平滑系数
        if (loudnessAnalysis.smoothedLoudness === 0) {
          loudnessAnalysis.smoothedLoudness = targetLoudness
        }
        else {
          // 计算变化幅度，决定平滑系数
          const changeMagnitude = Math.abs(targetLoudness - loudnessAnalysis.smoothedLoudness) / loudnessAnalysis.smoothedLoudness
          // 变化越大，响应越快（权重越高）
          const alpha = changeMagnitude > 0.5 ? 0.7 : 0.5 // 大变化用70%新值，小变化用50%新值
          loudnessAnalysis.smoothedLoudness = loudnessAnalysis.smoothedLoudness * (1 - alpha) + targetLoudness * alpha
        }
      }
    }

    // Update Gain every 0.5s (加快响应)
    const now = context.currentTime
    if (now - lastGainUpdate >= 0.5) {
      lastGainUpdate = now

      const currentLoudness = loudnessAnalysis.smoothedLoudness
      if (currentLoudness > 0.0001) {
        const currentDb = 20 * Math.log10(currentLoudness)

        // 目标响度映射算法
        // 0-100 映射到 -30dB 到 -10dB，50 对应 -20dB（中间值）
        const targetVolume = settings.value.targetVolume || 50
        // 线性映射：0 → -30dB, 50 → -20dB, 100 → -10dB
        const targetDb = -30 + (targetVolume / 100) * 20

        const gainDb = targetDb - currentDb

        // 对称的增益限制范围
        const clampedGainDb = Math.max(-15, Math.min(15, gainDb))
        const targetGain = 10 ** (clampedGainDb / 20)

        const responseSpeed = (settings.value.adaptiveGainSpeed || 5) / 10
        const timeConstant = (11 - responseSpeed) * 0.8

        adaptiveGain.gain.setTargetAtTime(
          Math.max(0.01, targetGain),
          now,
          timeConstant,
        )

        // Verbose logging (every 0.5s now)
        const samples = loudnessAnalysis.recentLoudness.length
        log(`Loudness: ${currentDb.toFixed(1)}dB (${samples} samples) | Gain: ${gainDb > 0 ? '+' : ''}${gainDb.toFixed(1)}dB | Target: ${targetDb.toFixed(1)}dB | Volume: ${targetVolume}`)
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
        recentLoudness: [],
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
      console.log('[BewlyAudio] Volume normalization ENABLED')
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
      console.log('[BewlyAudio] Volume normalization DISABLED (Bypass)')
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

// 临时启用/禁用状态（用于播放器控件）
let tempDisabled = false

// 临时禁用音量均衡（不修改设置）
export function setTempDisabled(disabled: boolean) {
  tempDisabled = disabled
  if (audioNodes && audioContext) {
    const { source, limiter } = audioNodes
    if (disabled) {
      // 禁用：直连
      try {
        stopLoudnessAnalysis()
        limiter.disconnect()
        source.connect(audioContext.destination)
        console.log('[BewlyAudio] Volume normalization temporarily DISABLED')
      }
      catch {}
    }
    else if (settings.value.enableVolumeNormalization) {
      // 启用：恢复处理链
      try {
        source.disconnect(audioContext.destination)
        limiter.connect(audioContext.destination)
        startLoudnessAnalysis()
        console.log('[BewlyAudio] Volume normalization temporarily ENABLED')
      }
      catch {}
    }
  }
}

// 获取临时禁用状态
export function isTempDisabled(): boolean {
  return tempDisabled
}

// 获取当前是否有音频处理链
export function isAudioProcessingActive(): boolean {
  return hasAttached && audioNodes !== null && !tempDisabled
}

// 获取当前增益值（用于显示）
export function getCurrentGainDb(): number | null {
  if (!audioNodes)
    return null
  const gain = audioNodes.adaptiveGain.gain.value
  return 20 * Math.log10(gain)
}
