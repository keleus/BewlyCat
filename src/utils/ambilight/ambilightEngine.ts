import type { AmbilightBackdropProbe, AmbilightBackdropSample, AmbilightDisplayMode, AmbilightEngineOptions } from './types'

const SAMPLE_WIDTH = 256
const SAMPLE_HEIGHT = 144
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
) {
  const immersive = mode !== 'normal'
  const effectiveBlur = immersive ? Math.max(100, blur * 1.4) : blur
  const x = immersive ? Math.max(240, (viewport.width - rect.width) / 2 + 130) : 100
  const y = immersive ? Math.max(180, Math.min(300, viewport.height * 0.23)) : 100

  // 30–100% 为局部光晕；100–400% 渐进式平滑铺向视口边缘
  const bleed = Math.ceil(effectiveBlur * 3) + 2
  const local = Math.min(spread / 100, 1)
  const fill = Math.max(0, Math.min(1, (spread - 100) / 300))
  const expand = (base: number, distance: number) => base * local + (Math.max(base, distance) - base) * fill

  const left = rect.left - expand(x, rect.left + bleed)
  const top = rect.top - expand(y, rect.top + bleed)
  const right = rect.left + rect.width + expand(x, viewport.width - rect.left - rect.width + bleed)
  const bottom = rect.top + rect.height + expand(y, viewport.height - rect.top - rect.height + bleed)

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
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
  // 最近一次布局的光晕画布位置（视口坐标）
  private glowRect: (Rect & { blur: number }) | null = null
  private lastBackdropSampleTime = 0
  private backdropSampleTimer: ReturnType<typeof setTimeout> | null = null
  private backdropProbe: AmbilightBackdropProbe | null

  constructor(options: AmbilightEngineOptions, backdropProbe: AmbilightBackdropProbe | null = null) {
    this.options = { ...options }
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
      this.updatePosition()
      if (this.isAllowed()) {
        if (this.needsForceDraw || !this.hasPainted)
          this.drawSingleFrame(true)
        // 暂停时滚动或缩放会改变光晕与文字的相对位置，画面不变也需重新估算
        else if (this.video?.paused)
          this.sampleBackdrop(performance.now(), false)
        if (this.video && !this.video.paused)
          this.startLoop()
      }
      this.needsForceDraw = false
    })
  }

  public setSleeping(sleeping: boolean) {
    if (this.isSleeping === sleeping)
      return
    this.isSleeping = sleeping

    if (!this.hostElem)
      return

    if (sleeping) {
      this.hostElem.classList.add('is-sleeping')
      this.stopLoop()
    }
    else {
      this.hostElem.classList.remove('is-sleeping')
      this.invalidate(true)
    }
  }

  public updateOptions(options: Partial<AmbilightEngineOptions>) {
    this.options = { ...this.options, ...options }
    this.invalidate(true)
  }

  public bindVideo(video: HTMLVideoElement) {
    if (this.video === video)
      return

    this.unbindVideo()
    this.video = video
    this.hasPainted = false
    this.layoutDirty = true
    this.ensureDom()
    this.bindVideoEvents()
    this.invalidate(true)
  }

  public unbindVideo() {
    this.unbindVideoEvents()
    this.stopLoop()
    this.cancelBackdropSample()
    if (this.layoutRafId !== null) {
      cancelAnimationFrame(this.layoutRafId)
      this.layoutRafId = null
    }
    this.video = null
    this.hasPainted = false
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
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none!important;z-index:-1;overflow:hidden;contain:layout style;transform:translate3d(0,0,0);'

    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_WIDTH
    canvas.height = SAMPLE_HEIGHT
    canvas.style.cssText = 'position:absolute;pointer-events:none;transform-origin:center;'

    host.appendChild(canvas)
    document.body.insertBefore(host, document.body.firstChild)

    this.hostElem = host
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })

    this.applyCanvasStyles()
  }

  private applyCanvasStyles(effectiveBlur?: number) {
    if (!this.canvas)
      return

    const { blur, saturation, strength } = this.options
    const blurValue = effectiveBlur ?? blur
    this.canvas.style.filter = `blur(${Math.max(10, blurValue)}px) saturate(${saturation}%) brightness(${Math.max(1, strength / 100)})`
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
    this.invalidate(true)
  }

  private onVideoPause = () => {
    this.drawSingleFrame(true)
    this.stopLoop()
  }

  private onVideoEnded = () => {
    this.drawSingleFrame(true)
    this.stopLoop()
  }

  private onVideoSeeked = () => {
    this.invalidate(true)
  }

  private onVideoTimeUpdate = () => {
    // 自愈心跳：如果视频未暂停但帧循环断开，自动复活！
    if (this.isAllowed() && this.video && !this.video.paused && this.rafId === null) {
      this.startLoop()
    }
  }

  private onVideoMetadataOrResize = () => {
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

  public updatePosition() {
    this.layoutDirty = false

    if (!this.video || !this.canvas || !this.hostElem)
      return

    if (this.mode === 'mini'
      || this.video.closest('.bpx-player-container[data-screen="mini"]')) {
      this.setSleeping(true)
      return
    }

    const r = this.video.getBoundingClientRect()
    // 50px 滞后缓冲带，避免在视口边缘滚动时反复休眠与唤醒
    const BUFFER = 50
    const isVisible = r.width >= 160
      && r.height >= 90
      && r.bottom > -BUFFER
      && r.top < window.innerHeight + BUFFER
      && r.right > -BUFFER
      && r.left < window.innerWidth + BUFFER

    if (!isVisible) {
      this.setSleeping(true)
      return
    }

    const computedStyle = window.getComputedStyle(this.video)
    const rect = contentRect(
      { left: r.left, top: r.top, width: r.width, height: r.height },
      this.video.videoWidth,
      this.video.videoHeight,
      computedStyle.objectFit,
    )

    // 彻底清除 clipPath 挖孔：发光层位于底层 z-index: -1，由视频物理不透明画面自然覆盖，
    // 根本消除滚动时的异步剪裁错位黑块与 GPU 频繁重绘迟滞
    if (this.hostElem.style.clipPath)
      this.hostElem.style.clipPath = ''

    // 核心几何扩散延展计算
    const glow = glowGeometry(
      rect,
      { width: window.innerWidth, height: window.innerHeight },
      this.options.spread,
      this.options.blur,
      this.mode,
    )

    this.glowRect = glow
    this.canvas.style.left = `${glow.left}px`
    this.canvas.style.top = `${glow.top}px`
    this.canvas.style.width = `${glow.width}px`
    this.canvas.style.height = `${glow.height}px`
    this.applyCanvasStyles(glow.blur)

    // 布局与尺寸就绪，退出休眠
    this.setSleeping(false)
  }

  private drawSingleFrame(force = false, frameTime?: number) {
    if (!this.video || !this.ctx || this.video.readyState < 2 || !this.video.videoWidth)
      return

    try {
      const sw = this.video.videoWidth || 16
      const sh = this.video.videoHeight || 9
      const targetHeight = Math.max(32, Math.min(256, Math.round((SAMPLE_WIDTH * sh) / sw)))

      if (this.canvas && this.canvas.height !== targetHeight) {
        this.canvas.height = targetHeight
        this.hasPainted = false
      }

      const now = frameTime ?? performance.now()
      const dt = this.lastDrawTime ? Math.min(500, now - this.lastDrawTime) : 1000

      // 核心：基于时间差与阻尼时间的指数衰减算法
      this.ctx.globalAlpha = (!this.hasPainted || force)
        ? 1
        : blendAlpha(dt, this.options.smoothing)

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

  private cancelBackdropSample() {
    if (this.backdropSampleTimer) {
      clearTimeout(this.backdropSampleTimer)
      this.backdropSampleTimer = null
    }
  }

  // 低频估算各文字位置下的光晕：覆盖率由画布模糊衰减求得，颜色取附近格子，
  // 均按 CSS 合成所用的 sRGB 编码值给出；小窗时光晕已休眠，不采样
  private sampleBackdrop(now: number, force: boolean) {
    if (!this.backdropProbe || !this.canvas || !this.glowRect || !this.hasPainted || !this.isAllowed()
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
      this.backdropCtx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
      if (!this.backdropCtx)
        return
    }

    this.backdropCtx.drawImage(this.canvas, 0, 0, BACKDROP_SAMPLE_WIDTH, BACKDROP_SAMPLE_HEIGHT)
    const { data } = this.backdropCtx.getImageData(0, 0, BACKDROP_SAMPLE_WIDTH, BACKDROP_SAMPLE_HEIGHT)

    // 与 applyCanvasStyles 一致：强度超过 100% 时以 brightness 提亮，否则以透明度减弱
    const { strength } = this.options
    const brightness = Math.max(1, strength / 100)
    const opacity = Math.min(1, Math.max(0, strength / 100))
    for (let i = 0; i < this.backdropLuma.length; i++) {
      const p = i * 4
      this.backdropLuma[i] = Math.min(1, brightness * (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255)
    }

    const glow = this.glowRect
    const samples: AmbilightBackdropSample[] = []
    for (const { region, x, y } of this.backdropProbe.getAnchors()) {
      const coverage = blurredCoverage(x, glow.left, glow.left + glow.width, glow.blur)
        * blurredCoverage(y, glow.top, glow.top + glow.height, glow.blur)
      const cellX = Math.round(Math.min(1, Math.max(0, (x - glow.left) / glow.width)) * (BACKDROP_SAMPLE_WIDTH - 1))
      const cellY = Math.round(Math.min(1, Math.max(0, (y - glow.top) / glow.height)) * (BACKDROP_SAMPLE_HEIGHT - 1))

      // 模糊半径远大于单个格子，取 3×3 邻域均值
      let luma = 0
      let count = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = cellX + dx
          const cy = cellY + dy
          if (cx < 0 || cy < 0 || cx >= BACKDROP_SAMPLE_WIDTH || cy >= BACKDROP_SAMPLE_HEIGHT)
            continue
          luma += this.backdropLuma[cy * BACKDROP_SAMPLE_WIDTH + cx]
          count++
        }
      }

      samples.push({ region, glow: luma / count, alpha: opacity * coverage })
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
        this.updatePosition()

      const interval = 1000 / Math.max(8, this.options.fps)
      if (now - this.lastDrawTime >= interval) {
        this.drawSingleFrame(false, now)
        this.lastDrawTime = now
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
