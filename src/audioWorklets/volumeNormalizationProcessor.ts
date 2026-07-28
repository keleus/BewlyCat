declare const sampleRate: number

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort

  constructor(options?: AudioWorkletNodeOptions)

  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void

interface NormalizationConfig {
  enabled: boolean
  debug: boolean
  targetVolume: number
  strength: number
  speed: number
  voiceGateDb: number
}

interface ConfigureMessage {
  type: 'configure'
  config: Partial<NormalizationConfig>
}

interface PlaybackMessage {
  type: 'playback'
  active: boolean
}

interface ResetMessage {
  type: 'reset'
}

type ProcessorMessage = ConfigureMessage | PlaybackMessage | ResetMessage

const PROCESSOR_NAME = 'bewly-volume-normalizer'
const ANALYSIS_INTERVAL_SECONDS = 0.1
const SHORT_TERM_WINDOW = 20
const INTEGRATED_WINDOW = 100
const ANALYSIS_EPSILON = 1e-8
const STATE_REPORT_INTERVAL_SECONDS = 0.25

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
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

class RingAverage {
  private readonly values: Float64Array
  private sum = 0
  private writeIndex = 0
  private count = 0

  constructor(capacity: number) {
    this.values = new Float64Array(capacity)
  }

  push(value: number) {
    if (this.count === this.values.length) {
      this.sum -= this.values[this.writeIndex]
    }
    else {
      this.count += 1
    }

    this.values[this.writeIndex] = value
    this.sum += value
    this.writeIndex = (this.writeIndex + 1) % this.values.length
  }

  average() {
    return this.count > 0 ? this.sum / this.count : 0
  }

  clear() {
    this.sum = 0
    this.writeIndex = 0
    this.count = 0
  }

  keepLast(maxCount: number) {
    while (this.count > maxCount) {
      const oldestIndex = (this.writeIndex - this.count + this.values.length) % this.values.length
      this.sum -= this.values[oldestIndex]
      this.count -= 1
    }
  }
}

class VolumeNormalizationProcessor extends AudioWorkletProcessor {
  private config: NormalizationConfig = {
    enabled: true,
    debug: false,
    targetVolume: 50,
    strength: 12,
    speed: 5,
    voiceGateDb: -34,
  }

  private readonly shortTermBlocks = new RingAverage(SHORT_TERM_WINDOW)
  private readonly integratedBlocks = new RingAverage(INTEGRATED_WINDOW)
  private analysisPowerSum = 0
  private analysisFrameCount = 0
  private silenceFrames = 0
  private playbackActive = false
  private currentGain = 1
  private targetGain = 1
  private gainTimeConstant = 0.03
  private framesUntilStateReport = Math.max(1, Math.round(sampleRate * STATE_REPORT_INTERVAL_SECONDS))
  private gainFrameBuffer = new Float32Array(128)
  private lastWeightedDb = -Infinity
  private lastShortTermDb = -Infinity
  private lastIntegratedDb = -Infinity

  constructor(options?: AudioWorkletNodeOptions) {
    super(options)
    this.port.onmessage = (event: MessageEvent<ProcessorMessage>) => {
      const message = event.data

      if (message.type === 'configure') {
        const wasEnabled = this.config.enabled
        this.config = { ...this.config, ...message.config }

        if (wasEnabled !== this.config.enabled) {
          this.clearAnalysis()
          this.targetGain = 1
          this.gainTimeConstant = 0.03
        }
        return
      }

      if (message.type === 'playback') {
        this.playbackActive = message.active
        if (!message.active) {
          this.targetGain = this.currentGain
          this.analysisPowerSum = 0
          this.analysisFrameCount = 0
        }
        return
      }

      this.clearAnalysis()
      this.currentGain = 1
      this.targetGain = 1
      this.gainTimeConstant = 0.12
    }
  }

  private clearAnalysis() {
    this.shortTermBlocks.clear()
    this.integratedBlocks.clear()
    this.analysisPowerSum = 0
    this.analysisFrameCount = 0
    this.silenceFrames = 0
    this.lastWeightedDb = -Infinity
    this.lastShortTermDb = -Infinity
    this.lastIntegratedDb = -Infinity
  }

  private getGainControlProfile() {
    const strength = (clamp(this.config.strength, 1, 20) - 1) / 19
    const speed = (clamp(this.config.speed, 1, 10) - 1) / 9

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

  private getTargetLoudnessDb() {
    const targetVolume = clamp(this.config.targetVolume, 0, 100)
    return -30 + (targetVolume / 100) * 20
  }

  private analyzeBlock(weightedPower: number) {
    const weightedDb = powerToDb(weightedPower)
    const profile = this.getGainControlProfile()
    this.lastWeightedDb = weightedDb

    if (weightedDb <= this.config.voiceGateDb) {
      this.silenceFrames += 1

      if (this.silenceFrames === 8)
        this.shortTermBlocks.clear()

      if (this.silenceFrames === 24)
        this.integratedBlocks.keepLast(12)

      if (this.silenceFrames >= 6) {
        this.targetGain = 1
        this.gainTimeConstant = profile.silenceReleaseTimeConstant
      }
      return
    }

    this.silenceFrames = 0
    this.shortTermBlocks.push(weightedPower)
    this.integratedBlocks.push(weightedPower)

    const shortTermDb = powerToDb(this.shortTermBlocks.average())
    const integratedDb = powerToDb(this.integratedBlocks.average())
    const blendedLoudnessDb = shortTermDb * 0.7 + integratedDb * 0.3
    const desiredGainDb = clamp(
      (this.getTargetLoudnessDb() - blendedLoudnessDb) * profile.correctionFactor,
      -profile.maxCutDb,
      profile.maxBoostDb,
    )
    const currentGainDb = gainToDb(this.currentGain)
    const deltaDb = desiredGainDb - currentGainDb

    this.lastShortTermDb = shortTermDb
    this.lastIntegratedDb = integratedDb

    if (Math.abs(deltaDb) < profile.deadbandDb) {
      this.targetGain = this.currentGain
      return
    }

    const maxStepDb = deltaDb < 0 ? profile.maxStepDownDb : profile.maxStepUpDb
    const steppedGainDb = currentGainDb + clamp(deltaDb, -maxStepDb, maxStepDb)

    this.targetGain = dbToGain(steppedGainDb)
    this.gainTimeConstant = deltaDb < 0
      ? profile.attackTimeConstant
      : profile.releaseTimeConstant
  }

  private collectAnalysis(input: Float32Array[], frameCount: number) {
    if (!this.config.enabled || !this.playbackActive || input.length === 0)
      return

    for (let frame = 0; frame < frameCount; frame++) {
      let framePower = 0
      let channelCount = 0

      for (const channel of input) {
        if (frame >= channel.length)
          continue

        const sample = channel[frame]
        framePower += sample * sample
        channelCount += 1
      }

      if (channelCount === 0)
        continue

      this.analysisPowerSum += framePower / channelCount
      this.analysisFrameCount += 1
    }

    const analysisIntervalFrames = Math.max(1, Math.round(sampleRate * ANALYSIS_INTERVAL_SECONDS))
    if (this.analysisFrameCount < analysisIntervalFrames)
      return

    const weightedPower = Math.max(
      this.analysisPowerSum / this.analysisFrameCount,
      ANALYSIS_EPSILON,
    )
    this.analysisPowerSum = 0
    this.analysisFrameCount = 0
    this.analyzeBlock(weightedPower)
  }

  private renderOutput(input: Float32Array[], output: Float32Array[], frameCount: number) {
    if (this.gainFrameBuffer.length < frameCount)
      this.gainFrameBuffer = new Float32Array(frameCount)

    const shouldSmoothGain = !this.config.enabled || this.playbackActive
    const timeConstant = Math.max(this.gainTimeConstant, 0.001)
    const smoothingStep = 1 - Math.exp(-1 / (timeConstant * sampleRate))

    for (let frame = 0; frame < frameCount; frame++) {
      if (shouldSmoothGain)
        this.currentGain += (this.targetGain - this.currentGain) * smoothingStep

      this.gainFrameBuffer[frame] = this.currentGain
    }

    for (let channelIndex = 0; channelIndex < output.length; channelIndex++) {
      const outputChannel = output[channelIndex]
      const inputChannel = input[channelIndex] ?? input[0]

      if (!inputChannel) {
        outputChannel.fill(0)
        continue
      }

      for (let frame = 0; frame < outputChannel.length; frame++)
        outputChannel[frame] = (inputChannel[frame] ?? 0) * this.gainFrameBuffer[frame]
    }
  }

  private reportState(frameCount: number) {
    this.framesUntilStateReport -= frameCount
    if (this.framesUntilStateReport > 0)
      return

    this.framesUntilStateReport = Math.max(1, Math.round(sampleRate * STATE_REPORT_INTERVAL_SECONDS))
    this.port.postMessage({
      type: 'state',
      gainDb: gainToDb(this.currentGain),
      ...(this.config.debug
        ? {
            weightedDb: this.lastWeightedDb,
            shortTermDb: this.lastShortTermDb,
            integratedDb: this.lastIntegratedDb,
            targetDb: this.getTargetLoudnessDb(),
          }
        : {}),
    })
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const originalInput = inputs[0] ?? []
    const analysisInput = inputs[1] ?? []
    const output = outputs[0] ?? []
    const frameCount = output[0]?.length ?? originalInput[0]?.length ?? 128

    this.collectAnalysis(analysisInput, frameCount)
    this.renderOutput(originalInput, output, frameCount)
    this.reportState(frameCount)
    return true
  }
}

registerProcessor(PROCESSOR_NAME, VolumeNormalizationProcessor)

export {}
