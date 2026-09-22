/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// K-weighting from BS.1770, with sample-rate-adjusted De Man filter coefficients.
// Local levelling, not an integrated programme loudness / true-peak meter.
class KFilter {
  constructor(highpass) {
    const k = Math.tan(Math.PI * (highpass ? 38.13547087602444 : 1681.974450955533) / sampleRate)
    const q = highpass ? 0.5003270373238773 : 0.7071752369554196
    const a0 = 1 + k / q + k * k
    const vh = 10 ** (3.999843853973347 / 20)
    const vb = vh ** 0.4996667741545416
    this.b0 = highpass ? 1 : (vh + vb * k / q + k * k) / a0
    this.b1 = highpass ? -2 : 2 * (k * k - vh) / a0
    this.b2 = highpass ? 1 : (vh - vb * k / q + k * k) / a0
    this.a1 = 2 * (k * k - 1) / a0
    this.a2 = (1 - k / q + k * k) / a0
    this.reset()
  }

  reset() {
    this.z1 = 0
    this.z2 = 0
  }

  tick(x) {
    const y = x * this.b0 + this.z1
    this.z1 = x * this.b1 - y * this.a1 + this.z2
    this.z2 = x * this.b2 - y * this.a2
    return y
  }
}

class LocalLoudnessProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.filters = Array.from({ length: 2 }, () => [new KFilter(false), new KFilter(true)])
    this.blocks = new Float64Array(30)
    this.delayFrames = Math.ceil(sampleRate * 0.005)
    this.capacity = this.delayFrames + 2
    this.delay = [new Float32Array(this.capacity), new Float32Array(this.capacity)]
    this.peakValues = new Float64Array(this.capacity)
    this.peakFrames = new Float64Array(this.capacity)
    this.target = -18
    this.strength = 0.75
    this.volume = 1
    this.active = true
    this.disposed = false
    this.reset()
    this.port.onmessage = ({ data }) => {
      if (data.type === 'dispose') {
        this.disposed = true
        this.port.close()
        return
      }
      if (data.type === 'reset')
        this.reset()
      if (data.type === 'configure') {
        if (Number.isFinite(data.target))
          this.target = Math.max(-24, Math.min(-14, data.target))
        if (Number.isFinite(data.strength))
          this.strength = Math.max(0.4, Math.min(1, data.strength))
        if (Number.isFinite(data.volume))
          this.volume = Math.max(0, Math.min(1, data.volume))
        this.active = data.active === true
      }
    }
  }

  reset() {
    this.blocks.fill(0)
    this.delay.forEach(c => c.fill(0))
    this.filters.forEach(c => c.forEach(f => f.reset()))
    this.blockIndex = 0
    this.blockCount = 0
    this.power = 0
    this.frames = 0
    this.frame = 0
    this.head = 0
    this.tail = 0
    this.gainDb = 0
    this.desiredDb = 0
    this.limiterGain = 1
    this.loudness = -100
  }

  analyze() {
    const power = this.power / this.frames
    this.power = 0
    this.frames = 0
    this.blocks[this.blockIndex] = power
    this.blockIndex = (this.blockIndex + 1) % 30
    this.blockCount = Math.min(30, this.blockCount + 1)
    if (this.blockCount < 4)
      return
    let momentary = 0
    let shortTerm = 0
    for (let i = 0;
      i < this.blockCount;
      i++) {
      const p = this.blocks[(this.blockIndex - 1 - i + 30) % 30]
      if (i < 4)
        momentary += p / 4
      shortTerm += p / this.blockCount
    }
    const loudness = -0.691 + 10 * Math.log10(Math.max(momentary, 1e-12))
    this.loudness = loudness
    // Freeze in silence (including the first quiet block), never amplify the noise floor.
    if (power < 10 ** ((-50 + 0.691) / 10) || loudness < -50 || this.volume < 0.001) {
      this.desiredDb = this.gainDb
      return
    }
    const reference = 0.75 * loudness + 0.25 * (-0.691 + 10 * Math.log10(Math.max(shortTerm, 1e-12)))
    const desired = Math.max(-18, Math.min(6, (this.target - reference) * this.strength))
    if (Math.abs(desired - this.gainDb) > 1)
      this.desiredDb = desired
    this.port.postMessage({ loudness, gainDb: this.gainDb, peakReductionDb: 20 * Math.log10(this.limiterGain) })
  }

  process(inputs, outputs) {
    if (this.disposed)
      return false
    const input = inputs[0]
    const output = outputs[0]
    if (!input?.length || !output?.length || !this.active)
      return true
    const release = 1 - Math.exp(-1 / (sampleRate * 0.08))
    for (let i = 0;
      i < output[0].length;
      i++) {
      let weightedPower = 0
      for (let c = 0;
        c < 2;
        c++) {
        const x = input[c]?.[i] ?? input[0][i]
        const y = this.filters[c][1].tick(this.filters[c][0].tick(x))
        weightedPower += y * y
      }
      // HTMLMediaElement volume is upstream: compensate measurement, not user volume.
      this.power += weightedPower / Math.max(this.volume * this.volume, 1e-6)
      this.frames++
      if (this.frames >= Math.round(sampleRate * 0.1))
        this.analyze()
      const delta = this.desiredDb - this.gainDb
      this.gainDb += Math.max(-8 / sampleRate, Math.min(1.5 / sampleRate, delta))
      const gain = 10 ** (this.gainDb / 20)
      const index = this.frame % this.capacity
      let peak = 0
      for (let c = 0;
        c < 2;
        c++) {
        const x = (input[c]?.[i] ?? input[0][i]) * gain
        this.delay[c][index] = x
        peak = Math.max(peak, Math.abs(x))
      }
      // Monotonic deque: bounded O(1) look-ahead maximum, no per-render allocations.
      while (this.head !== this.tail && this.peakFrames[this.head] < this.frame - this.delayFrames)
        this.head = (this.head + 1) % this.capacity
      while (this.head !== this.tail && this.peakValues[(this.tail - 1 + this.capacity) % this.capacity] <= peak)
        this.tail = (this.tail - 1 + this.capacity) % this.capacity
      this.peakValues[this.tail] = peak
      this.peakFrames[this.tail] = this.frame
      this.tail = (this.tail + 1) % this.capacity
      const limit = Math.min(1, 0.891250938 / Math.max(this.peakValues[this.head], 1e-9))
      this.limiterGain = Math.min(limit, this.limiterGain + (1 - this.limiterGain) * release)
      const read = (this.frame - this.delayFrames + this.capacity) % this.capacity
      for (let c = 0;
        c < output.length;
        c++)
        output[c][i] = this.frame < this.delayFrames ? 0 : this.delay[Math.min(c, 1)][read] * this.limiterGain
      this.frame++
    }
    return true
  }
}

registerProcessor('bewly-local-loudness', LocalLoudnessProcessor)
