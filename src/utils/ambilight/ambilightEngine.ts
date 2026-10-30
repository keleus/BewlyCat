import type { DiffusionFieldGeometry } from './diffusionField'
import { AmbilightDiffusionField } from './diffusionField'
import type { AmbilightBackdropProbe, AmbilightBackdropSample, AmbilightDiffusionQuality, AmbilightDisplayMode, AmbilightEngineOptions } from './types'

const SAMPLE_WIDTH = 256
const SAMPLE_HEIGHT = 144
// 求解精度只改变扩散场网格大小，默认 medium 与原有 160×90 完全一致。
const DIFFUSION_QUALITY_RESOLUTIONS: Record<AmbilightDiffusionQuality, { width: number, height: number }> = {
  'ultra-low': { width: 80, height: 45 },
  'low': { width: 112, height: 63 },
  'medium': { width: 160, height: 90 },
  'high': { width: 224, height: 126 },
  'ultra-high': { width: 320, height: 180 },
}
const MIN_DIFFUSION_SIZE = 24
const DIFFUSION_ITERATIONS = 12
const DIFFUSION_INITIAL_ITERATIONS = 32
const DIFFUSION_MIN_ITERATIONS = 4
// 亮度采样从已缩小的光晕画布再缩到 16×9 读回，读回量极小且只在 CPU 画布上进行。
// 只在环境光已绘制的帧上顺带进行，频率不超过环境光帧率，并进一步限制为每秒 2 次：
// 每次采样都要读取文字区域位置，并可能改写文字灰阶，逐帧进行会让页面持续重算样式
const BACKDROP_SAMPLE_WIDTH = 16
const BACKDROP_SAMPLE_HEIGHT = 9
const BACKDROP_SAMPLE_INTERVAL = 500

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

interface DiffusionLayout {
  key: string
  geometry: DiffusionFieldGeometry
}

interface GlowGeometry extends Rect {
  marginX: number
  marginY: number
  blur: number
}

// 本地布局：只包含视频尺寸/模式等不随滚动变化的信息。
interface EngineLayout {
  signature: string
  contentWidth: number
  contentHeight: number
  contentOffsetX: number
  contentOffsetY: number
  marginX: number
  marginY: number
  glowWidth: number
  glowHeight: number
  visualBlur: number
  videoRectWidth: number
  videoRectHeight: number
  videoWidth: number
  videoHeight: number
  documentContentLeft: number
  documentContentTop: number
}

function erf(x: number): number {
  const sign = Math.sign(x)
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)
  return sign * y
}

// CSS blur() 的参数即高斯标准差；画布矩形模糊后在某点的覆盖率为两个方向 erf 之差的乘积
function blurredCoverage(position: number, start: number, end: number, sigma: number): number {
  const scale = sigma * Math.SQRT2
  return 0.5 * (erf((end - position) / scale) - erf((start - position) / scale))
}

// 优化时间常数：兼顾丝滑过度与明暗剧变时的快速追随（响应速度提升约 50%）
function blendAlpha(dt: number, smoothing: number): number {
  return smoothing === 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / (20 + smoothing * 4.2))
}

function contentRect(rect: Rect, vw: number, vh: number, fit: string = 'contain'): Rect {
  if (!vw || !vh || fit === 'fill' || fit === 'cover')
    return { ...rect }
  const scale = Math.min(rect.width / vw, rect.height / vh)
  const width = vw * scale
  const height = vh * scale
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  }
}

function glowGeometry(
  rect: Rect,
  viewport: { width: number, height: number },
  spread: number,
  blur: number,
  mode: AmbilightDisplayMode = 'normal',
): GlowGeometry {
  const immersive = mode !== 'normal'
  const effectiveBlur = blur > 0 ? (immersive ? Math.max(100, blur * 1.4) : blur) : 0
  const x = immersive ? Math.max(240, (viewport.width - rect.width) / 2 + 130) : 100
  const y = immersive ? Math.max(180, Math.min(300, viewport.height * 0.23)) : 100

  // 30–100% 为局部光晕；100–400% 平滑扩展到一个固定的本地半径。
  // 泊松模式没有模糊，因此不额外预留 bleed。
  const bleed = effectiveBlur > 0 ? Math.ceil(effectiveBlur * 3) + 2 : 0
  const local = Math.min(spread / 100, 1)
  const fill = Math.max(0, Math.min(1, (spread - 100) / 300))
  const reachX = Math.max(x, (viewport.width - rect.width) / 2 + bleed)
  const reachY = Math.max(y, (viewport.height - rect.height) / 2 + bleed)
  const marginX = x * local + (reachX - x) * fill
  const marginY = y * local + (reachY - y) * fill

  return {
    left: rect.left - marginX,
    top: rect.top - marginY,
    width: rect.width + 2 * marginX,
    height: rect.height + 2 * marginY,
    marginX,
    marginY,
    blur: effectiveBlur,
  }
}

export class AmbilightEngine {
  private video: HTMLVideoElement | null = null
  private hostElem: HTMLDivElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private rafId: number | null = null
  private layoutRafId: number | null = null
  private lastDrawTime = 0
  private layoutDirty = true
  private options: AmbilightEngineOptions
  private isHidden = false
  private isSleeping = false
  private hasPainted = false
  private mode: AmbilightDisplayMode = 'normal'
  private needsForceDraw = false
  private backdropCtx: CanvasRenderingContext2D | null = null
  private backdropLuma = new Float32Array(BACKDROP_SAMPLE_WIDTH * BACKDROP_SAMPLE_HEIGHT)
  private layout: EngineLayout | null = null
  private scrollRafId: number | null = null
  private hostDocumentLeft = 0
  private hostDocumentTop = 0
  private lastBackdropSampleTime = 0
  private backdropSampleTimer: ReturnType<typeof setTimeout> | null = null
  private backdropProbe: AmbilightBackdropProbe | null
  private backdropAlpha = new Float32Array(BACKDROP_SAMPLE_WIDTH * BACKDROP_SAMPLE_HEIGHT)
  private diffusionField: AmbilightDiffusionField | null = null
  private diffusionLayout: DiffusionLayout | null = null
  private diffusionKey = ''
  private diffusionFallback = false
  private diffusionNeedsReset = true
  private diffusionIterations = DIFFUSION_ITERATIONS
  private sourceCanvas: HTMLCanvasElement | null = null
  private sourceCtx: CanvasRenderingContext2D | null = null
  private videoObjectFit = 'contain'

  constructor(options: AmbilightEngineOptions, backdropProbe: AmbilightBackdropProbe | null = null) {
    this.options = { ...options }
    this.diffusionIterations = this.getConfiguredIterations()
    this.backdropProbe = backdropProbe
  }

  private isAllowed(): boolean {
    return !this.isHidden
      && !this.isSleeping
      && this.options.enabled
      && Boolean(this.video?.isConnected)
      && Boolean(this.hostElem)
  }

  public invalidate(force = false) {
    this.layoutDirty = true
    if (force)
      this.needsForceDraw = true

    if (this.layoutRafId !== null)
      return

    this.layoutRafId = requestAnimationFrame(() => {
      this.layoutRafId = null
      this.updateLayout()
      if (this.isAllowed()) {
        if (this.needsForceDraw || !this.hasPainted)
          this.drawSingleFrame(true)
        // 暂停时布局变化会改变光晕与文字的相对位置，画面不变也需重新估算
        else if (this.video?.paused)
          this.sampleBackdrop(performance.now(), false)
        if (this.video && !this.video.paused)
          this.startLoop()
      }
      this.needsForceDraw = false
    })
  }

  // 滚动由浏览器原生完成；这里只做视口可见性、sticky/fixed 兜底和文字采样。
  public handleScroll() {
    if (!this.video || !this.canvas || !this.hostElem || this.isHidden)
      return
    if (this.scrollRafId !== null)
      return

    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = null
      if (!this.video || !this.canvas || !this.hostElem || this.isHidden)
        return
      if (this.layoutDirty) {
        this.invalidate()
        return
      }

      const r = this.video.getBoundingClientRect()
      if (!this.isVideoVisible(r)) {
        this.setSleeping(true)
        return
      }
      if (this.isSleeping) {
        this.setSleeping(false)
        return
      }
      if (!this.layout) {
        this.invalidate()
        return
      }

      // 普通文档流中 documentContentLeft/Top 不变，浏览器原生滚动已经同步了光晕。
      // 只有 sticky/fixed 播放器等文档坐标会变化的场景才在这里补一次位置。
      this.syncCanvasPosition(r)

      if (this.video.paused)
        this.sampleBackdrop(performance.now(), false)
      else if (this.rafId === null)
        this.startLoop()
    })
  }

  private cancelScrollRefresh() {
    if (this.scrollRafId !== null) {
      cancelAnimationFrame(this.scrollRafId)
      this.scrollRafId = null
    }
  }

  public setSleeping(sleeping: boolean) {
    if (this.isSleeping === sleeping)
      return
    this.isSleeping = sleeping

    if (!this.hostElem)
      return

    if (sleeping) {
      this.hostElem.classList.add('is-sleeping')
      this.cancelScrollRefresh()
      this.stopLoop()
    }
    else {
      this.hostElem.classList.remove('is-sleeping')
      this.invalidate(true)
    }
  }

  public updateOptions(options: Partial<AmbilightEngineOptions>) {
    const previousDiffusion = this.options.diffusion
    const previousIterations = this.options.diffusionIterations
    this.options = { ...this.options, ...options }
    if (previousDiffusion !== this.options.diffusion) {
      this.diffusionFallback = false
      this.diffusionIterations = this.getConfiguredIterations()
      this.resetDiffusionField()
    }
    else if (previousIterations !== this.options.diffusionIterations) {
      this.diffusionIterations = this.getConfiguredIterations()
    }
    // strength/saturation 只影响样式，不参与本地布局签名。
    if (options.strength !== undefined || options.saturation !== undefined) {
      this.applyCanvasStyles(
        this.usesDiffusion() ? 0 : (this.layout?.visualBlur || this.options.blur),
      )
    }
    this.invalidate(true)
  }

  public bindVideo(video: HTMLVideoElement) {
    if (this.video === video)
      return

    this.unbindVideo()
    this.video = video
    this.hasPainted = false
    this.layoutDirty = true
    this.diffusionFallback = false
    this.diffusionIterations = this.getConfiguredIterations()
    this.resetDiffusionField()
    this.ensureDom()
    this.bindVideoEvents()
    this.invalidate(true)
  }

  public unbindVideo() {
    this.unbindVideoEvents()
    this.stopLoop()
    this.cancelBackdropSample()
    this.cancelScrollRefresh()
    if (this.layoutRafId !== null) {
      cancelAnimationFrame(this.layoutRafId)
      this.layoutRafId = null
    }
    this.video = null
    this.hasPainted = false
    this.layout = null
    this.hostDocumentLeft = 0
    this.hostDocumentTop = 0
    this.layoutDirty = true
    this.resetDiffusionField()
  }

  public setDisplayMode(mode: AmbilightDisplayMode) {
    this.mode = mode
    if (!this.hostElem)
      return

    if (mode === 'mini') {
      this.setSleeping(true)
      return
    }

    this.setSleeping(false)
    this.invalidate()
  }

  public setHidden(hidden: boolean) {
    this.isHidden = hidden
    if (hidden) {
      this.stopLoop()
      this.setSleeping(true)
    }
    else {
      this.setSleeping(false)
      this.invalidate(true)
    }
  }

  public destroy() {
    this.unbindVideo()
    this.stopLoop()
    this.cancelScrollRefresh()
    if (this.layoutRafId !== null) {
      cancelAnimationFrame(this.layoutRafId)
      this.layoutRafId = null
    }
    if (this.hostElem) {
      this.hostElem.remove()
      this.hostElem = null
    }
    this.canvas = null
    this.ctx = null
    this.backdropCtx = null
    this.backdropProbe = null
    this.sourceCanvas = null
    this.sourceCtx = null
    this.resetDiffusionField()
    this.hasPainted = false
    this.layoutDirty = true
  }

  private ensureDom() {
    if (this.hostElem && this.canvas)
      return

    const host = document.createElement('div')
    // 不透明画布在首帧绘制前是黑色，首帧画好后再淡入，避免页面加载时闪出黑块
    host.className = 'bewly-ambilight-host is-pending'
    host.setAttribute('aria-hidden', 'true')
    // 文档层：尺寸覆盖整篇文档并裁剪，画布用文档坐标绝对定位；浏览器滚动时原生移动。
    host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none!important;z-index:-1;overflow:hidden;'

    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_WIDTH
    canvas.height = SAMPLE_HEIGHT
    canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;'

    host.appendChild(canvas)
    document.body.insertBefore(host, document.body.firstChild)

    this.hostElem = host
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: true })

    this.applyCanvasStyles()
  }

  private applyCanvasStyles(effectiveBlur?: number) {
    if (!this.canvas)
      return

    const { blur, saturation, strength } = this.options
    const blurValue = effectiveBlur ?? blur
    const blurFilter = this.usesDiffusion() ? '' : `blur(${Math.max(10, blurValue)}px) `
    this.canvas.style.filter = `${blurFilter}saturate(${saturation}%) brightness(${Math.max(1, strength / 100)})`
    this.canvas.style.opacity = `${Math.min(1, Math.max(0, strength / 100))}`
  }

  private onVideoPlay = () => {
    if (this.isAllowed())
      this.startLoop()
  }

  private onVideoPlaying = () => {
    if (this.isAllowed())
      this.startLoop()
  }

  private onVideoLoadedData = () => {
    this.diffusionNeedsReset = true
    this.invalidate(true)
  }

  private onVideoPause = () => {
    this.stopLoop()
    if (this.isAllowed() && !this.layoutDirty)
      this.drawSingleFrame(true)
  }

  private onVideoEnded = () => {
    this.stopLoop()
    if (this.isAllowed() && !this.layoutDirty)
      this.drawSingleFrame(true)
  }

  private onVideoSeeked = () => {
    this.diffusionNeedsReset = true
    this.invalidate(true)
  }

  private onVideoTimeUpdate = () => {
    // 自愈心跳：如果视频未暂停但帧循环断开，自动复活！
    if (this.isAllowed() && this.video && !this.video.paused && this.rafId === null) {
      this.startLoop()
    }
  }

  private onVideoMetadataOrResize = () => {
    this.diffusionNeedsReset = true
    this.invalidate(true)
  }

  private bindVideoEvents() {
    if (!this.video)
      return

    this.video.addEventListener('play', this.onVideoPlay)
    this.video.addEventListener('playing', this.onVideoPlaying)
    this.video.addEventListener('loadeddata', this.onVideoLoadedData)
    this.video.addEventListener('pause', this.onVideoPause)
    this.video.addEventListener('ended', this.onVideoEnded)
    this.video.addEventListener('seeked', this.onVideoSeeked)
    this.video.addEventListener('timeupdate', this.onVideoTimeUpdate)
    this.video.addEventListener('loadedmetadata', this.onVideoMetadataOrResize)
    this.video.addEventListener('resize', this.onVideoMetadataOrResize)
  }

  private unbindVideoEvents() {
    if (!this.video)
      return

    this.video.removeEventListener('play', this.onVideoPlay)
    this.video.removeEventListener('playing', this.onVideoPlaying)
    this.video.removeEventListener('loadeddata', this.onVideoLoadedData)
    this.video.removeEventListener('pause', this.onVideoPause)
    this.video.removeEventListener('ended', this.onVideoEnded)
    this.video.removeEventListener('seeked', this.onVideoSeeked)
    this.video.removeEventListener('timeupdate', this.onVideoTimeUpdate)
    this.video.removeEventListener('loadedmetadata', this.onVideoMetadataOrResize)
    this.video.removeEventListener('resize', this.onVideoMetadataOrResize)
  }

  private isVideoVisible(r: DOMRect): boolean {
    // 50px 滞后缓冲带，避免在视口边缘滚动时反复休眠与唤醒
    const BUFFER = 50
    return r.width >= 160
      && r.height >= 90
      && r.bottom > -BUFFER
      && r.top < window.innerHeight + BUFFER
      && r.right > -BUFFER
      && r.left < window.innerWidth + BUFFER
  }

  // 只在尺寸、播放器模式、spread/blur 等本地参数变化时执行；普通滚动不进入这里。
  private updateLayout() {
    this.layoutDirty = false

    if (!this.video || !this.canvas || !this.hostElem || this.isHidden)
      return

    if (this.mode === 'mini'
      || this.video.closest('.bpx-player-container[data-screen="mini"]')) {
      this.setSleeping(true)
      return
    }

    const r = this.video.getBoundingClientRect()
    if (!this.isVideoVisible(r)) {
      this.setSleeping(true)
      return
    }

    const computedStyle = window.getComputedStyle(this.video)
    this.videoObjectFit = computedStyle.objectFit
    const content = contentRect(
      { left: r.left, top: r.top, width: r.width, height: r.height },
      this.video.videoWidth,
      this.video.videoHeight,
      computedStyle.objectFit,
    )

    // 彻底清除 clipPath 挖孔：发光层位于底层 z-index: -1，由视频物理不透明画面自然覆盖
    if (this.hostElem.style.clipPath)
      this.hostElem.style.clipPath = ''

    this.resizeHostToDocument()
    const hostRect = this.hostElem.getBoundingClientRect()
    this.hostDocumentLeft = hostRect.left + window.scrollX
    this.hostDocumentTop = hostRect.top + window.scrollY

    const glowBlur = this.usesDiffusion() ? 0 : this.options.blur
    const glow = glowGeometry(
      content,
      { width: window.innerWidth, height: window.innerHeight },
      this.options.spread,
      glowBlur,
      this.mode,
    )
    const visualBlur = this.usesDiffusion() ? 0 : glow.blur
    const signature = [
      Math.round(r.width * 10),
      Math.round(r.height * 10),
      this.video.videoWidth,
      this.video.videoHeight,
      computedStyle.objectFit,
      this.mode,
      this.options.diffusion,
      this.options.diffusionQuality,
      this.options.spread,
      glowBlur,
      window.innerWidth,
      window.innerHeight,
      this.usesDiffusion() ? 1 : 0,
    ].join(':')

    if (this.layout?.signature === signature) {
      this.applyCanvasPosition(r, true)
      this.setSleeping(false)
      return
    }

    const documentContentLeft = content.left + window.scrollX
    const documentContentTop = content.top + window.scrollY
    this.layout = {
      signature,
      contentWidth: content.width,
      contentHeight: content.height,
      contentOffsetX: content.left - r.left,
      contentOffsetY: content.top - r.top,
      marginX: glow.marginX,
      marginY: glow.marginY,
      glowWidth: glow.width,
      glowHeight: glow.height,
      visualBlur,
      videoRectWidth: r.width,
      videoRectHeight: r.height,
      videoWidth: this.video.videoWidth,
      videoHeight: this.video.videoHeight,
      documentContentLeft,
      documentContentTop,
    }

    // 画布尺寸由本地光晕决定；left/top 是文档坐标，浏览器滚动会原生移动它。
    this.canvas.style.width = `${glow.width}px`
    this.canvas.style.height = `${glow.height}px`
    this.applyCanvasStyles(visualBlur)
    this.updateDiffusionLayout()
    this.applyCanvasPosition(r, true)
    this.needsForceDraw = true
    this.setSleeping(false)
  }

  // 让零尺寸文档层的裁剪范围等于整篇文档，避免画布自身扩大页面滚动区域。
  private resizeHostToDocument(): void {
    const host = this.hostElem
    if (!host)
      return

    const width = document.documentElement.clientWidth || window.innerWidth
    const height = Math.max(document.documentElement.scrollHeight, window.innerHeight)
    host.style.width = `${width}px`
    if (host.style.height !== `${height}px`)
      host.style.height = `${height}px`
  }

  // 设置画布的文档坐标；只有布局/尺寸变化或 sticky 等文档坐标变化时调用。
  private applyCanvasPosition(r: DOMRect, force: boolean): void {
    const layout = this.layout
    const canvas = this.canvas
    if (!layout || !canvas)
      return

    const documentContentLeft = r.left + window.scrollX + layout.contentOffsetX
    const documentContentTop = r.top + window.scrollY + layout.contentOffsetY
    if (!force
      && Math.abs(layout.documentContentLeft - documentContentLeft) < 0.5
      && Math.abs(layout.documentContentTop - documentContentTop) < 0.5) {
      return
    }

    const canvasLeft = documentContentLeft - layout.marginX - this.hostDocumentLeft
    const canvasTop = documentContentTop - layout.marginY - this.hostDocumentTop
    canvas.style.left = `${canvasLeft}px`
    canvas.style.top = `${canvasTop}px`
    layout.documentContentLeft = documentContentLeft
    layout.documentContentTop = documentContentTop
  }

  // sticky/fixed 播放器的文档坐标会随页面滚动变化；普通文档流不会进入这里改位置。
  private syncCanvasPosition(r: DOMRect): void {
    this.applyCanvasPosition(r, false)
  }

  private drawSingleFrame(force = false, frameTime?: number) {
    if (!this.video || !this.ctx || this.video.readyState < 2 || !this.video.videoWidth)
      return

    const now = frameTime ?? performance.now()
    const dt = this.lastDrawTime ? Math.min(500, now - this.lastDrawTime) : 1000
    const blend = (!this.hasPainted || force) ? 1 : blendAlpha(dt, this.options.smoothing)

    if (this.usesDiffusion()) {
      try {
        if (this.drawDiffusionFrame(force, blend)) {
          this.hasPainted = true
          this.hostElem?.classList.remove('is-pending')
          this.lastDrawTime = now
          this.sampleBackdrop(now, force)
          return
        }
      }
      catch {
        // 画布被跨域视频污染或求解异常时，退回现有高斯路径，避免整块环境光消失
        this.enableDiffusionFallback()
      }
    }

    try {
      const sw = this.video.videoWidth || 16
      const sh = this.video.videoHeight || 9
      const targetHeight = Math.max(32, Math.min(256, Math.round((SAMPLE_WIDTH * sh) / sw)))
      let gaussianForce = force

      // 从扩散模式切回时画布可能是网格尺寸且带透明像素，重建 256px 不透明画布
      if (!this.canvas || this.canvas.width !== SAMPLE_WIDTH) {
        if (this.canvas) {
          this.canvas.width = SAMPLE_WIDTH
          this.canvas.height = SAMPLE_HEIGHT
          this.hasPainted = false
          gaussianForce = true
        }
      }
      if (this.canvas && this.canvas.height !== targetHeight) {
        this.canvas.height = targetHeight
        this.hasPainted = false
        gaussianForce = true
      }
      if (!this.hasPainted)
        gaussianForce = true

      // 核心：基于时间差与阻尼时间的指数衰减算法
      this.ctx.globalAlpha = gaussianForce ? 1 : blend
      this.ctx.drawImage(this.video, 0, 0, SAMPLE_WIDTH, targetHeight)
      this.hasPainted = true
      this.hostElem?.classList.remove('is-pending')
      this.lastDrawTime = now
      this.sampleBackdrop(now, force)
    }
    catch {
      // 捕获跨域或未就绪异常
    }
  }

  private usesDiffusion(): boolean {
    return this.options.diffusion !== 'gaussian' && !this.diffusionFallback
  }

  private getConfiguredIterations(): number {
    return Math.max(4, Math.min(32, Math.round(this.options.diffusionIterations)))
  }

  private resetDiffusionField(): void {
    this.diffusionField = null
    this.diffusionLayout = null
    this.diffusionKey = ''
    this.diffusionNeedsReset = true
  }

  private enableDiffusionFallback(): void {
    this.diffusionFallback = true
    this.resetDiffusionField()
    this.applyCanvasStyles(this.options.blur)
    // 下一帧按高斯专属参数重新计算布局和模糊。
    this.invalidate(true)
  }

  private updateDiffusionLayout(): void {
    if (!this.usesDiffusion() || !this.layout) {
      this.diffusionLayout = null
      return
    }

    const layout = this.createDiffusionLayout(this.layout)
    this.diffusionLayout = layout
    if (layout && layout.key !== this.diffusionKey)
      this.needsForceDraw = true
  }

  private createDiffusionLayout(layout: EngineLayout): DiffusionLayout | null {
    const glowWidth = layout.glowWidth
    const glowHeight = layout.glowHeight
    if (glowWidth <= 0 || glowHeight <= 0 || layout.contentWidth <= 0 || layout.contentHeight <= 0)
      return null

    const target = DIFFUSION_QUALITY_RESOLUTIONS[this.options.diffusionQuality] ?? DIFFUSION_QUALITY_RESOLUTIONS.medium
    const scale = Math.min(target.width / glowWidth, target.height / glowHeight)
    const width = Math.max(MIN_DIFFUSION_SIZE, Math.min(target.width, Math.round(glowWidth * scale)))
    const height = Math.max(MIN_DIFFUSION_SIZE, Math.min(target.height, Math.round(glowHeight * scale)))
    const clampX = (value: number) => Math.max(0, Math.min(width, value))
    const clampY = (value: number) => Math.max(0, Math.min(height, value))
    const innerLeft = clampX((layout.marginX / glowWidth) * width)
    const innerTop = clampY((layout.marginY / glowHeight) * height)
    const innerRight = clampX(((layout.marginX + layout.contentWidth) / glowWidth) * width)
    const innerBottom = clampY(((layout.marginY + layout.contentHeight) / glowHeight) * height)

    if (innerRight - innerLeft < 2 || innerBottom - innerTop < 2)
      return null

    const cellWidth = glowWidth / width
    const cellHeight = glowHeight / height
    const key = `${width}x${height}:${Math.round(innerLeft * 16)}:${Math.round(innerTop * 16)}:${Math.round(innerRight * 16)}:${Math.round(innerBottom * 16)}:${Math.round(cellWidth * 10)}:${Math.round(cellHeight * 10)}`
    return {
      key,
      geometry: {
        width,
        height,
        innerLeft,
        innerTop,
        innerRight,
        innerBottom,
        cellWidth,
        cellHeight,
      },
    }
  }

  private getDiffusionDecayLength(geometry: DiffusionFieldGeometry): number {
    const screening = Math.max(0, Math.min(100, this.options.diffusionScreening))
    if (screening <= 0)
      return 0

    const left = geometry.innerLeft * geometry.cellWidth
    const top = geometry.innerTop * geometry.cellHeight
    const right = (geometry.width - geometry.innerRight) * geometry.cellWidth
    const bottom = (geometry.height - geometry.innerBottom) * geometry.cellHeight
    const margin = Math.max(1, Math.min(left, top, right, bottom))
    // 至少保留约 4 个网格单元的衰减长度，避免边缘第一圈 alpha 骤降形成接缝；
    // 远端由 applyEdgeFeather 平滑收尾。泊松模式不依赖高斯模糊。
    const minimumDecay = Math.min(geometry.cellWidth, geometry.cellHeight) * 4
    const base = Math.max(12, minimumDecay, margin * 0.5)
    const strength = screening / 100
    return base / (0.25 + 0.75 * strength)
  }

  private prepareDiffusionSource(geometry: DiffusionFieldGeometry): ImageData | null {
    const video = this.video
    if (!video || !video.videoWidth || !video.videoHeight)
      return null

    const innerWidth = geometry.innerRight - geometry.innerLeft
    const innerHeight = geometry.innerBottom - geometry.innerTop
    if (innerWidth <= 0 || innerHeight <= 0)
      return null

    if (!this.sourceCanvas) {
      this.sourceCanvas = document.createElement('canvas')
      this.sourceCtx = this.sourceCanvas.getContext('2d', { alpha: false, willReadFrequently: true })
    }
    const canvas = this.sourceCanvas
    if (canvas.width !== geometry.width)
      canvas.width = geometry.width
    if (canvas.height !== geometry.height)
      canvas.height = geometry.height
    const ctx = this.sourceCtx
    if (!ctx)
      return null

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, geometry.width, geometry.height)

    let sourceX = 0
    let sourceY = 0
    let sourceWidth = video.videoWidth
    let sourceHeight = video.videoHeight
    if (this.videoObjectFit === 'cover') {
      const scale = Math.max(innerWidth / video.videoWidth, innerHeight / video.videoHeight)
      const cropWidth = innerWidth / scale
      const cropHeight = innerHeight / scale
      sourceX = (video.videoWidth - cropWidth) / 2
      sourceY = (video.videoHeight - cropHeight) / 2
      sourceWidth = cropWidth
      sourceHeight = cropHeight
    }

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'low'
    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      geometry.innerLeft,
      geometry.innerTop,
      innerWidth,
      innerHeight,
    )
    return ctx.getImageData(0, 0, geometry.width, geometry.height)
  }

  private drawDiffusionFrame(force: boolean, blend: number): boolean {
    const layout = this.diffusionLayout
    const canvas = this.canvas
    const ctx = this.ctx
    const mode = this.options.diffusion
    if (!layout || !canvas || !ctx || mode === 'gaussian')
      return false

    const source = this.prepareDiffusionSource(layout.geometry)
    if (!source)
      return false

    let field = this.diffusionField
    if (!field || this.diffusionKey !== layout.key) {
      field = new AmbilightDiffusionField(layout.geometry)
      if (!field.hasFixedPixels)
        return false
      this.diffusionField = field
      this.diffusionKey = layout.key
      this.diffusionNeedsReset = true
    }

    if (this.diffusionNeedsReset) {
      field.reset(source.data)
      this.diffusionNeedsReset = false
    }

    const configuredIterations = this.getConfiguredIterations()
    const iterations = force || !field.hasSolution
      ? Math.max(DIFFUSION_INITIAL_ITERATIONS, configuredIterations)
      : this.diffusionIterations
    const started = performance.now()
    const imageData = field.render(
      source.data,
      this.getDiffusionDecayLength(layout.geometry),
      blend,
      force,
      iterations,
      this.options.diffusionFeather,
    )
    const elapsed = performance.now() - started
    if (elapsed > 8 && this.diffusionIterations > DIFFUSION_MIN_ITERATIONS)
      this.diffusionIterations = Math.max(DIFFUSION_MIN_ITERATIONS, this.diffusionIterations - 2)

    if (canvas.width !== field.width)
      canvas.width = field.width
    if (canvas.height !== field.height)
      canvas.height = field.height
    ctx.putImageData(imageData, 0, 0)
    return true
  }

  private cancelBackdropSample() {
    if (this.backdropSampleTimer) {
      clearTimeout(this.backdropSampleTimer)
      this.backdropSampleTimer = null
    }
  }

  // 低频估算各文字位置下的光晕：覆盖率由画布模糊衰减求得，颜色取附近格子，
  // 均按 CSS 合成所用的 sRGB 编码值给出；小窗时光晕已休眠，不采样
  private sampleBackdrop(now: number, force: boolean) {
    if (!this.backdropProbe || !this.canvas || !this.layout || !this.hasPainted || !this.isAllowed()
      || this.mode === 'mini') {
      return
    }
    const wait = BACKDROP_SAMPLE_INTERVAL - (now - this.lastBackdropSampleTime)
    if (!force && wait > 0) {
      // 限频期间补一次尾随采样，暂停后滚动停下的位置也能被估算到
      this.backdropSampleTimer ??= setTimeout(() => {
        this.backdropSampleTimer = null
        this.sampleBackdrop(performance.now(), false)
      }, wait)
      return
    }
    this.cancelBackdropSample()
    this.lastBackdropSampleTime = now

    if (!this.backdropCtx) {
      const canvas = document.createElement('canvas')
      canvas.width = BACKDROP_SAMPLE_WIDTH
      canvas.height = BACKDROP_SAMPLE_HEIGHT
      this.backdropCtx = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
      if (!this.backdropCtx)
        return
    }

    this.backdropCtx.clearRect(0, 0, BACKDROP_SAMPLE_WIDTH, BACKDROP_SAMPLE_HEIGHT)
    this.backdropCtx.drawImage(this.canvas, 0, 0, BACKDROP_SAMPLE_WIDTH, BACKDROP_SAMPLE_HEIGHT)
    const { data } = this.backdropCtx.getImageData(0, 0, BACKDROP_SAMPLE_WIDTH, BACKDROP_SAMPLE_HEIGHT)

    // 与 applyCanvasStyles 一致：强度超过 100% 时以 brightness 提亮，否则以透明度减弱。
    // 扩散模式的画布自带 alpha，透明区域不能按黑色参与文字背景估算。
    const { strength } = this.options
    const brightness = Math.max(1, strength / 100)
    const opacity = Math.min(1, Math.max(0, strength / 100))
    for (let i = 0; i < this.backdropLuma.length; i++) {
      const p = i * 4
      const alpha = data[p + 3] / 255
      this.backdropAlpha[i] = alpha
      this.backdropLuma[i] = alpha > 0
        ? Math.min(1, brightness * (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255)
        : 0
    }

    // 浏览器原生滚动后，用画布当前视口矩形估算文字背景位置。
    const canvasRect = this.canvas.getBoundingClientRect()
    if (canvasRect.width <= 0 || canvasRect.height <= 0)
      return
    const visualBlur = this.usesDiffusion()
      ? 0
      : (this.layout.visualBlur || this.options.blur)
    const glow = {
      left: canvasRect.left,
      top: canvasRect.top,
      width: canvasRect.width,
      height: canvasRect.height,
      blur: visualBlur,
    }
    const samples: AmbilightBackdropSample[] = []
    for (const { region, x, y } of this.backdropProbe.getAnchors()) {
      const coverage = glow.blur > 0
        ? blurredCoverage(x, glow.left, glow.left + glow.width, glow.blur)
        * blurredCoverage(y, glow.top, glow.top + glow.height, glow.blur)
        : (x >= glow.left && x <= glow.left + glow.width && y >= glow.top && y <= glow.top + glow.height ? 1 : 0)
      const cellX = Math.round(Math.min(1, Math.max(0, (x - glow.left) / glow.width)) * (BACKDROP_SAMPLE_WIDTH - 1))
      const cellY = Math.round(Math.min(1, Math.max(0, (y - glow.top) / glow.height)) * (BACKDROP_SAMPLE_HEIGHT - 1))

      // 模糊半径远大于单个格子，取 3×3 邻域均值；亮度按 alpha 加权，避免透明格子的颜色干扰
      let luma = 0
      let alphaSum = 0
      let count = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = cellX + dx
          const cy = cellY + dy
          if (cx < 0 || cy < 0 || cx >= BACKDROP_SAMPLE_WIDTH || cy >= BACKDROP_SAMPLE_HEIGHT)
            continue
          const index = cy * BACKDROP_SAMPLE_WIDTH + cx
          const alpha = this.backdropAlpha[index]
          alphaSum += alpha
          luma += this.backdropLuma[index] * alpha
          count++
        }
      }

      const averageAlpha = count > 0 ? alphaSum / count : 0
      samples.push({
        region,
        glow: alphaSum > 0 ? luma / alphaSum : 0,
        alpha: opacity * coverage * averageAlpha,
      })
    }

    if (samples.length)
      this.backdropProbe.onSample(samples)
  }

  public startLoop() {
    if (this.rafId !== null)
      return

    const tick = (now: number) => {
      this.rafId = null

      if (!this.isAllowed() || !this.video || this.video.paused)
        return

      if (this.layoutDirty)
        this.updateLayout()

      // 尺寸变化/唤醒会安排下一次布局；本轮不再绘制旧布局。
      if (!this.isAllowed() || !this.video || this.video.paused || this.layoutDirty)
        return

      const force = this.needsForceDraw || !this.hasPainted
      const interval = 1000 / Math.max(8, this.options.fps)
      if (force || now - this.lastDrawTime >= interval) {
        this.drawSingleFrame(force, now)
        this.lastDrawTime = now
        this.needsForceDraw = false
      }

      this.rafId = requestAnimationFrame(tick)
    }

    this.rafId = requestAnimationFrame(tick)
  }

  public stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}
