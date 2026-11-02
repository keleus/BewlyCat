// 非高斯模式把颜色与不透明度保存在同一个预乘 RGBA 场中：
// 固定视频区域为 alpha=1 的原始画面，外侧按方程求 alpha 与预乘颜色，
// 输出时再除回非预乘颜色，避免透明淡出时颜色被一起压暗。
const SOR_OMEGA = 1.7
const CONVERGENCE_EPSILON = 1e-3
const MIN_ALPHA_FOR_COLOR = 0.002
const EDGE_EPSILON = 0.001

export interface DiffusionFieldGeometry {
  width: number
  height: number
  innerLeft: number
  innerTop: number
  innerRight: number
  innerBottom: number
  cellWidth: number
  cellHeight: number
}

type Rgb = [number, number, number]

interface EdgeCandidate {
  color: Rgb
  distance: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * 环境光的低分辨率扩散场。网格坐标以光晕矩形的宽高归一化，
 * 视频内容矩形在网格中的位置由 DiffusionFieldGeometry 给出。
 */
export class AmbilightDiffusionField {
  public readonly width: number
  public readonly height: number
  public readonly imageData: ImageData

  private readonly innerLeft: number
  private readonly innerTop: number
  private readonly innerRight: number
  private readonly innerBottom: number
  private readonly cellWidth: number
  private readonly cellHeight: number
  private readonly fixed: Uint8Array
  private readonly state: Float32Array
  private readonly display: Float32Array
  private readonly output: Uint8ClampedArray
  private sourcePixel: Uint8ClampedArray<ArrayBufferLike> = new Uint8ClampedArray(0)
  private fixedCount = 0
  private initialized = false
  private solutionReady = false

  constructor(geometry: DiffusionFieldGeometry) {
    this.width = geometry.width
    this.height = geometry.height
    this.innerLeft = geometry.innerLeft
    this.innerTop = geometry.innerTop
    this.innerRight = geometry.innerRight
    this.innerBottom = geometry.innerBottom
    this.cellWidth = geometry.cellWidth
    this.cellHeight = geometry.cellHeight

    const length = this.width * this.height
    this.fixed = new Uint8Array(length)
    this.state = new Float32Array(length * 4)
    this.display = new Float32Array(length * 4)
    this.imageData = new ImageData(this.width, this.height)
    this.output = this.imageData.data

    for (let y = 0; y < this.height; y++) {
      const cy = y + 0.5
      for (let x = 0; x < this.width; x++) {
        const cx = x + 0.5
        if (cx >= this.innerLeft && cx < this.innerRight && cy >= this.innerTop && cy < this.innerBottom) {
          this.fixed[y * this.width + x] = 1
          this.fixedCount++
        }
      }
    }
  }

  public get hasFixedPixels(): boolean {
    return this.fixedCount > 0
  }

  public get hasSolution(): boolean {
    return this.solutionReady
  }

  /** 几何或视频切换后重建初始场：固定区域取视频颜色，外侧取最近边缘颜色与淡出 alpha。 */
  public reset(source: Uint8ClampedArray): void {
    this.sourcePixel = source
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = y * this.width + x
        if (this.fixed[index]) {
          this.copyFixedPixel(index, source)
          continue
        }

        const cx = x + 0.5
        const cy = y + 0.5
        const edge = this.nearestEdge(cx, cy)
        const alpha = this.fadeAlpha(cx, cy, edge.distance)
        const base = index * 4
        this.state[base] = edge.color[0] * alpha
        this.state[base + 1] = edge.color[1] * alpha
        this.state[base + 2] = edge.color[2] * alpha
        this.state[base + 3] = alpha
      }
    }

    this.display.set(this.state)
    this.initialized = true
    this.solutionReady = false
  }

  /**
   * 每帧更新场：内部视频区域固定，外侧方程热启动迭代。
   * decayLengthPx 为 0 时退化为拉普拉斯方程，大于 0 时为屏蔽泊松方程。
   * source 为源画布的 RGBA 数据，长度必须为 width * height * 4。
   */
  public render(
    source: Uint8ClampedArray,
    decayLengthPx: number,
    blend: number,
    force: boolean,
    iterations: number,
    featherCells: number,
  ): ImageData {
    if (source.length < this.width * this.height * 4)
      throw new Error('Invalid diffusion source data')

    this.sourcePixel = source
    if (!this.initialized)
      this.reset(source)
    else
      this.updateFixedPixels(source)

    this.solve(decayLengthPx, iterations)
    // 方程解在外边界只保证 ghost 为 0，最外一圈仍可能残留少量 alpha；按设置羽化避免矩形边。
    this.applyEdgeFeather(featherCells)

    this.clampField()

    const blendAmount = force || !this.solutionReady ? 1 : clamp(blend, 0, 1)
    if (blendAmount >= 1) {
      this.display.set(this.state)
    }
    else {
      for (let i = 0; i < this.display.length; i++)
        this.display[i] += (this.state[i] - this.display[i]) * blendAmount
    }

    this.writeOutput()
    this.solutionReady = true
    return this.imageData
  }

  private updateFixedPixels(source: Uint8ClampedArray): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = y * this.width + x
        if (this.fixed[index])
          this.copyFixedPixel(index, source)
      }
    }
  }

  private copyFixedPixel(index: number, source: Uint8ClampedArray): void {
    const offset = index * 4
    this.state[offset] = source[offset] / 255
    this.state[offset + 1] = source[offset + 1] / 255
    this.state[offset + 2] = source[offset + 2] / 255
    this.state[offset + 3] = 1
  }

  private solve(
    decayLengthPx: number,
    iterations: number,
  ): void {
    const wx = 1 / (this.cellWidth * this.cellWidth)
    const wy = 1 / (this.cellHeight * this.cellHeight)
    const lambda2 = decayLengthPx > 0
      ? 1 / (decayLengthPx * decayLengthPx)
      : 0
    const denominator = 2 * wx + 2 * wy + lambda2
    const rowStride = this.width * 4
    const totalIterations = Math.max(1, Math.min(64, Math.round(iterations)))

    for (let iteration = 0; iteration < totalIterations; iteration++) {
      let maxDelta = 0

      // 红黑排序的 Gauss-Seidel：同一轮内相邻单元不互相依赖，配合 SOR 快速传播边界颜色。
      for (let parity = 0; parity < 2; parity++) {
        for (let y = 0; y < this.height; y++) {
          for (let x = (y + parity) & 1; x < this.width; x += 2) {
            const index = y * this.width + x
            if (this.fixed[index])
              continue

            const base = index * 4
            for (let channel = 0; channel < 4; channel++) {
              const left = x > 0 ? this.state[base - 4 + channel] : 0
              const right = x < this.width - 1 ? this.state[base + 4 + channel] : 0
              const up = y > 0 ? this.state[base - rowStride + channel] : 0
              const down = y < this.height - 1 ? this.state[base + rowStride + channel] : 0
              const target = ((left + right) * wx + (up + down) * wy) / denominator
              const previous = this.state[base + channel]
              const next = previous + SOR_OMEGA * (target - previous)
              this.state[base + channel] = next
              const delta = Math.abs(next - previous)
              if (delta > maxDelta)
                maxDelta = delta
            }
          }
        }
      }

      if (maxDelta < CONVERGENCE_EPSILON)
        break
    }
  }

  private nearestEdge(cx: number, cy: number): EdgeCandidate {
    const px = clamp(cx, this.innerLeft, this.innerRight - EDGE_EPSILON)
    const py = clamp(cy, this.innerTop, this.innerBottom - EDGE_EPSILON)
    const color = this.sampleSource(px, py)
    return {
      color,
      distance: Math.hypot(cx - px, cy - py),
    }
  }

  private fadeAlpha(cx: number, cy: number, distance: number): number {
    // 以单元中心到画布单元中心边界计，最外一圈 alpha=0；不依赖 CSS 模糊。
    const dOut = Math.min(
      Math.max(0, cx - 0.5),
      Math.max(0, this.width - cx - 0.5),
      Math.max(0, cy - 0.5),
      Math.max(0, this.height - cy - 0.5),
    )
    if (dOut <= 0 || distance <= 0)
      return distance <= 0 ? 1 : 0

    const t = distance / (distance + dOut)
    return 1 - smoothstep(t)
  }

  private sampleSource(x: number, y: number): Rgb {
    const left = clamp(this.innerLeft, 0, this.width)
    const right = clamp(this.innerRight, left + EDGE_EPSILON, this.width)
    const top = clamp(this.innerTop, 0, this.height)
    const bottom = clamp(this.innerBottom, top + EDGE_EPSILON, this.height)
    const safeX = clamp(x, left, right - EDGE_EPSILON)
    const safeY = clamp(y, top, bottom - EDGE_EPSILON)

    // 双线性采样只能取视频区域内部的像素；否则边界处会把区域外的黑色平均进来。
    const leftPixel = clamp(Math.ceil(left - 0.5), 0, this.width - 1)
    const rightPixel = clamp(Math.ceil(right - 0.5) - 1, leftPixel, this.width - 1)
    const topPixel = clamp(Math.ceil(top - 0.5), 0, this.height - 1)
    const bottomPixel = clamp(Math.ceil(bottom - 0.5) - 1, topPixel, this.height - 1)

    const fx = clamp(safeX - 0.5, 0, this.width - 1)
    const fy = clamp(safeY - 0.5, 0, this.height - 1)
    const x0 = clamp(Math.floor(fx), leftPixel, rightPixel)
    const y0 = clamp(Math.floor(fy), topPixel, bottomPixel)
    const x1 = Math.min(rightPixel, x0 + 1)
    const y1 = Math.min(bottomPixel, y0 + 1)
    const tx = clamp(fx - x0, 0, 1)
    const ty = clamp(fy - y0, 0, 1)

    const sample = (sx: number, sy: number, channel: number) => this.sourcePixel[((sy * this.width) + sx) * 4 + channel]
    const color: Rgb = [0, 0, 0]
    for (let channel = 0; channel < 3; channel++) {
      const topValue = sample(x0, y0, channel) * (1 - tx) + sample(x1, y0, channel) * tx
      const bottomValue = sample(x0, y1, channel) * (1 - tx) + sample(x1, y1, channel) * tx
      color[channel] = (topValue * (1 - ty) + bottomValue * ty) / 255
    }
    return color
  }

  private applyEdgeFeather(featherCells: number): void {
    const cells = Math.max(0, Math.min(4, featherCells))
    if (cells <= 0)
      return

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const edge = Math.min(x, this.width - 1 - x, y, this.height - 1 - y)
        const factor = smoothstep(Math.min(1, edge / cells))
        if (factor >= 1)
          continue
        const base = (y * this.width + x) * 4
        this.state[base] *= factor
        this.state[base + 1] *= factor
        this.state[base + 2] *= factor
        this.state[base + 3] *= factor
      }
    }
  }

  private clampField(): void {
    for (let index = 0; index < this.width * this.height; index++) {
      const base = index * 4
      const alpha = clamp(this.state[base + 3], 0, 1)
      this.state[base + 3] = alpha
      this.state[base] = clamp(this.state[base], 0, alpha)
      this.state[base + 1] = clamp(this.state[base + 1], 0, alpha)
      this.state[base + 2] = clamp(this.state[base + 2], 0, alpha)
    }
  }

  private writeOutput(): void {
    for (let index = 0; index < this.width * this.height; index++) {
      const base = index * 4
      const alpha = this.display[base + 3]
      const inverseAlpha = alpha > MIN_ALPHA_FOR_COLOR ? 1 / alpha : 0
      this.output[base] = Math.round(clamp(this.display[base] * inverseAlpha, 0, 1) * 255)
      this.output[base + 1] = Math.round(clamp(this.display[base + 1] * inverseAlpha, 0, 1) * 255)
      this.output[base + 2] = Math.round(clamp(this.display[base + 2] * inverseAlpha, 0, 1) * 255)
      this.output[base + 3] = Math.round(alpha * 255)
    }
  }
}
