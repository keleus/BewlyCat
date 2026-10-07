import type { AmbilightDisplayMode, AmbilightEngineOptions } from './types'

const SAMPLE_WIDTH = 256
const SAMPLE_HEIGHT = 144

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

function blendAlpha(dt: number, smoothing: number): number {
  return smoothing === 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / (40 + smoothing * 7))
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
  private lastDrawTime = 0
  private options: AmbilightEngineOptions
  private isPaused = false
  private isHidden = false
  private hasPainted = false
  private currentParent: HTMLElement | null = null
  private mode: AmbilightDisplayMode = 'normal'

  constructor(options: AmbilightEngineOptions) {
    this.options = { ...options }
  }

  public updateOptions(options: Partial<AmbilightEngineOptions>) {
    this.options = { ...this.options, ...options }
    this.applyCanvasStyles()
    this.scheduleFrame()
  }

  public bindVideo(video: HTMLVideoElement) {
    if (this.video === video)
      return

    this.unbindVideo()
    this.video = video
    this.hasPainted = false
    this.ensureDom()
    this.bindVideoEvents()
    this.updatePosition()
    this.scheduleFrame()
  }

  public unbindVideo() {
    this.unbindVideoEvents()
    this.stopLoop()
    this.video = null
    this.isPaused = true
    this.hasPainted = false
  }

  public setDisplayMode(
    mode: AmbilightDisplayMode,
    playerContainer?: HTMLElement | null,
  ) {
    this.mode = mode
    if (!this.hostElem)
      return

    if (mode === 'mini') {
      this.hostElem.style.display = 'none'
      this.stopLoop()
      return
    }

    const isFullscreen = mode === 'fullscreen'

    if (isFullscreen) {
      if (!this.options.enableFullscreen) {
        this.hostElem.style.display = 'none'
        return
      }
      this.hostElem.style.display = 'block'
      const targetParent = playerContainer || document.body
      if (this.currentParent !== targetParent) {
        targetParent.insertBefore(this.hostElem, targetParent.firstChild)
        this.currentParent = targetParent
        this.hostElem.style.position = targetParent === document.body ? 'fixed' : 'absolute'
        this.hostElem.style.zIndex = targetParent === document.body ? '-1' : '0'
      }
    }
    else {
      this.hostElem.style.display = 'block'
      if (this.currentParent !== document.body) {
        document.body.insertBefore(this.hostElem, document.body.firstChild)
        this.currentParent = document.body
        this.hostElem.style.position = 'fixed'
        this.hostElem.style.zIndex = '-1'
      }
    }

    this.updatePosition()
    this.scheduleFrame()
  }

  public setHidden(hidden: boolean) {
    this.isHidden = hidden
    if (hidden) {
      this.stopLoop()
      if (this.hostElem)
        this.hostElem.style.display = 'none'
    }
    else {
      if (this.hostElem)
        this.hostElem.style.display = 'block'
      this.updatePosition()
      this.scheduleFrame()
    }
  }

  public destroy() {
    this.unbindVideo()
    this.stopLoop()
    if (this.hostElem) {
      this.hostElem.remove()
      this.hostElem = null
    }
    this.canvas = null
    this.ctx = null
    this.currentParent = null
    this.hasPainted = false
  }

  private ensureDom() {
    if (this.hostElem && this.canvas)
      return

    const host = document.createElement('div')
    host.className = 'bewly-ambilight-host'
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none!important;z-index:-1;overflow:hidden;contain:strict;transform:translate3d(0,0,0);'

    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_WIDTH
    canvas.height = SAMPLE_HEIGHT
    canvas.style.cssText = 'position:absolute;pointer-events:none;transform-origin:center;will-change:left,top,width,height,filter,opacity;'

    host.appendChild(canvas)
    document.body.insertBefore(host, document.body.firstChild)

    this.hostElem = host
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
    this.currentParent = document.body

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
    this.isPaused = false
    this.startLoop()
  }

  private onVideoPause = () => {
    this.isPaused = true
    this.drawSingleFrame(true)
    this.stopLoop()
  }

  private onVideoSeeked = () => {
    this.updatePosition()
    this.drawSingleFrame(true)
  }

  private onVideoTimeUpdate = () => {
    if (this.isPaused)
      this.drawSingleFrame()
  }

  private bindVideoEvents() {
    if (!this.video)
      return

    this.video.addEventListener('play', this.onVideoPlay)
    this.video.addEventListener('pause', this.onVideoPause)
    this.video.addEventListener('seeked', this.onVideoSeeked)
    this.video.addEventListener('timeupdate', this.onVideoTimeUpdate)
    this.isPaused = this.video.paused
  }

  private unbindVideoEvents() {
    if (!this.video)
      return

    this.video.removeEventListener('play', this.onVideoPlay)
    this.video.removeEventListener('pause', this.onVideoPause)
    this.video.removeEventListener('seeked', this.onVideoSeeked)
    this.video.removeEventListener('timeupdate', this.onVideoTimeUpdate)
  }

  public updatePosition() {
    if (!this.video || !this.canvas || !this.hostElem)
      return

    if (this.mode === 'mini' || this.video.closest('.bpx-player-container[data-screen="mini"]')) {
      this.hostElem.style.display = 'none'
      this.stopLoop()
      return
    }

    const r = this.video.getBoundingClientRect()
    const isVisible = r.width >= 160
      && r.height >= 90
      && r.bottom > 0
      && r.top < window.innerHeight
      && r.right > 0
      && r.left < window.innerWidth

    if (!isVisible) {
      this.hostElem.style.display = 'none'
      this.stopLoop()
      return
    }

    this.hostElem.style.display = 'block'

    const computedStyle = window.getComputedStyle(this.video)
    const rect = contentRect(
      { left: r.left, top: r.top, width: r.width, height: r.height },
      this.video.videoWidth,
      this.video.videoHeight,
      computedStyle.objectFit,
    )

    const l = rect.left
    const t = rect.top
    const right = l + rect.width
    const bottom = t + rect.height

    // 画面完全铺满视口时（无外侧光效空间）
    if (l <= 1 && t <= 1 && right >= window.innerWidth - 1 && bottom >= window.innerHeight - 1) {
      this.hostElem.style.display = 'none'
      return
    }
    this.hostElem.style.display = 'block'

    const origin = this.hostElem.getBoundingClientRect()
    const ox = origin.left
    const oy = origin.top

    // 核心：使用奇偶反向多边形裁切，精准将视频播放区域挖空，光线纯粹只向外侧辐射
    this.hostElem.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l - ox}px ${t - oy}px, ${right - ox}px ${t - oy}px, ${right - ox}px ${bottom - oy}px, ${l - ox}px ${bottom - oy}px, ${l - ox}px ${t - oy}px)`

    // 核心几何扩散延展计算
    const glow = glowGeometry(
      rect,
      { width: window.innerWidth, height: window.innerHeight },
      this.options.spread,
      this.options.blur,
      this.mode,
    )

    this.canvas.style.left = `${glow.left - ox}px`
    this.canvas.style.top = `${glow.top - oy}px`
    this.canvas.style.width = `${glow.width}px`
    this.canvas.style.height = `${glow.height}px`
    this.applyCanvasStyles(glow.blur)
  }

  private drawSingleFrame(force = false) {
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

      const now = performance.now()
      const dt = this.lastDrawTime ? Math.min(500, now - this.lastDrawTime) : 1000

      // 核心：基于时间差与阻尼时间的指数衰减算法
      this.ctx.globalAlpha = (!this.hasPainted || force)
        ? 1
        : blendAlpha(dt, this.options.smoothing)

      this.ctx.drawImage(this.video, 0, 0, SAMPLE_WIDTH, targetHeight)
      this.hasPainted = true
      this.lastDrawTime = now
    }
    catch {
      // 捕获跨域或未就绪异常
    }
  }

  private scheduleFrame() {
    if (this.video && !this.video.paused && !this.isHidden)
      this.startLoop()
    else
      this.drawSingleFrame()
  }

  private startLoop() {
    if (this.rafId !== null)
      return

    const loop = (now: number) => {
      if (this.isHidden || !this.video || this.video.paused) {
        this.stopLoop()
        return
      }

      const interval = 1000 / Math.max(8, this.options.fps)
      if (now - this.lastDrawTime >= interval) {
        this.updatePosition()
        this.drawSingleFrame()
      }

      this.rafId = requestAnimationFrame(loop)
    }

    this.rafId = requestAnimationFrame(loop)
  }

  private stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}
