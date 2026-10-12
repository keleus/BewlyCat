import type { AmbilightDisplayMode, AmbilightEngineOptions } from './types'

const SAMPLE_WIDTH = 256
const SAMPLE_HEIGHT = 144

interface Rect {
  left: number
  top: number
  width: number
  height: number
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
  private currentParent: HTMLElement | null = null
  private mode: AmbilightDisplayMode = 'normal'
  private needsForceDraw = false

  constructor(options: AmbilightEngineOptions) {
    this.options = { ...options }
  }

  private isAllowed(): boolean {
    return !this.isHidden
      && !this.isSleeping
      && this.options.enabled
      && Boolean(this.video?.isConnected)
      && Boolean(this.hostElem)
  }

  public markLayoutDirty() {
    this.layoutDirty = true
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
    if (this.layoutRafId !== null) {
      cancelAnimationFrame(this.layoutRafId)
      this.layoutRafId = null
    }
    this.video = null
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
      this.setSleeping(true)
      return
    }

    const isFullscreen = mode === 'fullscreen'
    if (isFullscreen) {
      if (!this.options.enableFullscreen) {
        this.setSleeping(true)
        return
      }
      this.setSleeping(false)
      const targetParent = playerContainer || document.body
      if (this.currentParent !== targetParent) {
        targetParent.insertBefore(this.hostElem, targetParent.firstChild)
        this.currentParent = targetParent
        this.hostElem.style.position = targetParent === document.body ? 'fixed' : 'absolute'
        this.hostElem.style.zIndex = targetParent === document.body ? '-1' : '0'
      }
    }
    else {
      this.setSleeping(false)
      if (this.currentParent !== document.body) {
        document.body.insertBefore(this.hostElem, document.body.firstChild)
        this.currentParent = document.body
        this.hostElem.style.position = 'fixed'
        this.hostElem.style.zIndex = '-1'
      }
    }

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
    this.currentParent = null
    this.hasPainted = false
    this.layoutDirty = true
  }

  private ensureDom() {
    if (this.hostElem && this.canvas)
      return

    const host = document.createElement('div')
    host.className = 'bewly-ambilight-host'
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

    if (this.mode === 'mini' || this.video.closest('.bpx-player-container[data-screen="mini"]')) {
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

    const origin = (this.currentParent && this.currentParent !== document.body)
      ? this.currentParent.getBoundingClientRect()
      : { left: 0, top: 0 }
    const ox = origin.left
    const oy = origin.top

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

    this.canvas.style.left = `${glow.left - ox}px`
    this.canvas.style.top = `${glow.top - oy}px`
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
      this.lastDrawTime = now
    }
    catch {
      // 捕获跨域或未就绪异常
    }
  }

  public scheduleFrame() {
    this.invalidate(true)
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
