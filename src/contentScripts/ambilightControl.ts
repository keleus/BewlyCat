import { nextTick, watch } from 'vue'

import { setAmbilightTone } from '~/composables/useDark'
import { settings, settingsReady } from '~/logic'
import { AmbilightEngine } from '~/utils/ambilight/ambilightEngine'
import type { AmbilightBaseValues } from '~/utils/ambilight/textContrast'
import { DEFAULT_BASE_VALUES, getAmbilightTextColors, getBackdropLuminance, getWorstRegionContrast, parseBaseValue } from '~/utils/ambilight/textContrast'
import type { AmbilightBackdropAnchor, AmbilightBackdropSample, AmbilightDisplayMode, AmbilightEngineOptions, AmbilightTone } from '~/utils/ambilight/types'
import { isVideoOrBangumiPage, isVideoPlaybackPage, isWatchLaterListPage } from '~/utils/main'
import { getVideoElement } from '~/utils/player'

let initialized = false
let engine: AmbilightEngine | null = null
let currentVideo: HTMLVideoElement | null = null
let playerObserver: MutationObserver | null = null
let observedPlayerContainer: HTMLElement | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
// 功能开启期间的视频发现监听；关闭时整体撤销，不在页面上保留任何监听
let discoveryLifetime: AbortController | null = null
// 引擎存在期间的布局与可见性监听
let engineLifetime: AbortController | null = null

// 文字区域与其采样点：按元素实际位置取点，宽屏、稍后再看等布局下同样准确。
// 区域名与 ambilight.scss 中的区域变量对应；其余文字使用全部采样点的综合结果
interface BackdropRegion {
  name: string
  selector: string
  points: (rect: DOMRect) => Array<[number, number]>
}

const BACKDROP_REGIONS: readonly BackdropRegion[] = [
  {
    // 标题与播放量、日期等信息行
    name: 'top',
    selector: '.video-info-container, #viewbox_report',
    points: rect => [
      [rect.left + rect.width * 0.25, rect.top + rect.height * 0.35],
      [rect.left + rect.width * 0.25, rect.bottom - 14],
    ],
  },
  {
    // UP 主信息、弹幕列表、合集与推荐列表
    name: 'side',
    selector: '.right-container, .playlist-container--right',
    points: (rect) => {
      const top = Math.max(rect.top, 0) + 60
      const bottom = Math.min(rect.bottom, window.innerHeight) - 60
      if (bottom <= top)
        return []
      // 靠近视频的左缘光晕最浓，与栏内中部一起采样
      return [rect.left + 24, rect.left + rect.width * 0.5].flatMap(x => [
        [x, top] as [number, number],
        [x, (top + bottom) / 2] as [number, number],
        [x, bottom] as [number, number],
      ])
    },
  },
  {
    // 播放器下方的弹幕发送栏与三连工具栏
    name: 'bottom',
    selector: '.bpx-player-sending-area, #arc_toolbar_report, .video-toolbar-container, #playlistToolbar',
    points: rect => [[rect.left + rect.width * 0.3, rect.top + rect.height / 2]],
  },
]

const BACKDROP_REGION_NAMES = ['global', ...BACKDROP_REGIONS.map(region => region.name)]

function getBackdropAnchors(): AmbilightBackdropAnchor[] {
  const anchors: AmbilightBackdropAnchor[] = []
  for (const region of BACKDROP_REGIONS) {
    document.querySelectorAll<HTMLElement>(region.selector).forEach((element) => {
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height)
        return
      for (const [x, y] of region.points(rect)) {
        if (x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight)
          anchors.push({ region: region.name, x, y })
      }
    })
  }
  return anchors
}

// 以最难读区域的一级文字对比度比较两种明暗：用户主题下低于 LEAVE 且另一明暗明显更好才切换；
// 切换后用户主题恢复到 RETURN 以上、或优势不再明显时切回。中间区间由文字灰阶的实时对比度补偿（见 textContrast）
const TONE_LEAVE_CONTRAST = 6
const TONE_RETURN_CONTRAST = 8
const TONE_LEAVE_ADVANTAGE = 1.5
const TONE_RETURN_ADVANTAGE = 1.2
// 新明暗需持续一段时间才生效，过滤转场黑场、闪白与拖动进度条
const TONE_SETTLE_MS = 1500
// 低于此亮度视为黑场（片头、加载中），不据此做首次判断
const BLACK_FRAME_VALUE = 0.02

// 两种明暗下页面底色的实际亮度；当前明暗的底色随采样读取（跟随深色基准色设置），另一种在切换后读到
let baseValues: AmbilightBaseValues = { ...DEFAULT_BASE_VALUES }

class AmbilightToneTracker {
  tone: AmbilightTone
  private decided = false
  private pending: AmbilightTone | null = null
  private settleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly base: AmbilightTone,
    private readonly onChange: () => void,
  ) {
    this.tone = base
  }

  // 以用户主题为准：仅在用户主题下文字难以辨认、且另一明暗明显更清晰时离开
  private resolveTarget(samples: readonly AmbilightBackdropSample[]): AmbilightTone {
    const other: AmbilightTone = this.base === 'light' ? 'dark' : 'light'
    const baseContrast = getWorstRegionContrast(samples, this.base, baseValues)
    const otherContrast = getWorstRegionContrast(samples, other, baseValues)
    if (this.tone === this.base) {
      return baseContrast < TONE_LEAVE_CONTRAST && otherContrast > baseContrast * TONE_LEAVE_ADVANTAGE
        ? other
        : this.base
    }
    return baseContrast > TONE_RETURN_CONTRAST || otherContrast < baseContrast * TONE_RETURN_ADVANTAGE
      ? this.base
      : other
  }

  update(samples: readonly AmbilightBackdropSample[]) {
    const target = this.resolveTarget(samples)

    // 首个有效画面直接定调，页面与光晕同时出现，不再先亮后暗
    if (!this.decided) {
      if (samples.every(sample => sample.glow < BLACK_FRAME_VALUE))
        return
      this.decided = true
      if (target !== this.tone) {
        this.tone = target
        this.onChange()
      }
      return
    }

    if (target === this.tone) {
      this.cancel()
      return
    }
    if (target === this.pending)
      return

    this.cancel()
    this.pending = target
    // 用定时器而非下一次采样确认，暂停或拖动后停在新画面时也能生效
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null
      this.pending = null
      this.tone = target
      this.onChange()
    }, TONE_SETTLE_MS)
  }

  cancel() {
    this.pending = null
    if (this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
  }
}

let toneTrackers: Record<AmbilightTone, AmbilightToneTracker> | null = null
let lastSamples: AmbilightBackdropSample[] | null = null
let publishQueued = false

function getPageTone(): AmbilightTone {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

// 改动 html 上的变量会让整页重算样式（实测 B 站播放页约 35ms），文字灰阶只在背景亮度
// 有可察觉变化时更新，且限制频率；明暗切换时随主题一并立即更新
const INK_UPDATE_DELTA = 0.04
const INK_UPDATE_INTERVAL = 2000

let appliedInk: { tone: AmbilightTone, luminance: Map<string, number> } | null = null
let lastInkUpdateTime = 0
let inkUpdateTimer: ReturnType<typeof setTimeout> | null = null

// 文字灰阶跟随光晕实时亮度，按区域分别计算；写在 html 上，由 ambilight.scss 映射到原站与插件的文字变量
function applyTextContrast(immediate = false) {
  if (!lastSamples)
    return
  const samples = lastSamples
  const tone = getPageTone()
  const globalLuminance = getBackdropLuminance(samples, tone, baseValues)
  const luminance = new Map<string, number>()
  for (const region of BACKDROP_REGION_NAMES) {
    const regionSamples = region === 'global' ? samples : samples.filter(sample => sample.region === region)
    // 区域不在视口内时沿用综合结果，滚动回来时不会带着过期颜色
    luminance.set(region, regionSamples.length ? getBackdropLuminance(regionSamples, tone, baseValues) : globalLuminance)
  }

  const changed = !appliedInk || appliedInk.tone !== tone
    || [...luminance].some(([region, value]) => Math.abs(value - (appliedInk!.luminance.get(region) ?? -1)) >= INK_UPDATE_DELTA)
  if (!changed)
    return

  const wait = INK_UPDATE_INTERVAL - (performance.now() - lastInkUpdateTime)
  if (!immediate && wait > 0) {
    inkUpdateTimer ??= setTimeout(() => {
      inkUpdateTimer = null
      applyTextContrast()
    }, wait)
    return
  }
  if (inkUpdateTimer) {
    clearTimeout(inkUpdateTimer)
    inkUpdateTimer = null
  }

  appliedInk = { tone, luminance }
  lastInkUpdateTime = performance.now()
  const root = document.documentElement
  for (const [region, value] of luminance) {
    getAmbilightTextColors(tone, value).forEach((color, index) => {
      root.style.setProperty(`--bew-ambilight-${region}-text-${index + 1}`, color)
    })
  }
  root.setAttribute('data-bewly-ambilight-ink', '')
}

function clearTextContrast() {
  if (inkUpdateTimer) {
    clearTimeout(inkUpdateTimer)
    inkUpdateTimer = null
  }
  const root = document.documentElement
  root.removeAttribute('data-bewly-ambilight-ink')
  for (const region of BACKDROP_REGION_NAMES) {
    for (let level = 1; level <= 4; level++)
      root.style.removeProperty(`--bew-ambilight-${region}-text-${level}`)
  }
  appliedInk = null
  lastSamples = null
}

function shouldAnimateToneChange(): boolean {
  return typeof document.startViewTransition === 'function'
    && !document.hidden
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// 两种底色的跟踪器可能在同一次采样中同时变化，合并为一次切换
function publishTone() {
  if (publishQueued)
    return
  publishQueued = true
  queueMicrotask(() => {
    publishQueued = false
    if (!toneTrackers)
      return

    const tone = { light: toneTrackers.light.tone, dark: toneTrackers.dark.tone }
    const apply = async () => {
      setAmbilightTone(tone)
      // 等 useDark 的监听把主题类名写入页面后，再按新底色重算文字灰阶
      await nextTick()
      applyTextContrast(true)
    }

    // 整页主题切换用视图过渡交叉淡化，避免颜色瞬间突变
    // 与其他视图过渡重叠时旧过渡会被跳过（回调仍会执行），忽略其 AbortError
    if (shouldAnimateToneChange())
      document.startViewTransition(apply).ready.catch(() => {})
    else
      void apply()
  })
}

function handleBackdropSample(samples: AmbilightBackdropSample[]) {
  if (!toneTrackers) {
    toneTrackers = {
      light: new AmbilightToneTracker('light', publishTone),
      dark: new AmbilightToneTracker('dark', publishTone),
    }
  }
  lastSamples = samples
  const pageBase = parseBaseValue(getComputedStyle(document.body).backgroundColor)
  if (pageBase !== null)
    baseValues[getPageTone()] = pageBase
  toneTrackers.light.update(samples)
  toneTrackers.dark.update(samples)
  applyTextContrast()
}

function resetTone() {
  toneTrackers?.light.cancel()
  toneTrackers?.dark.cancel()
  toneTrackers = null
  baseValues = { ...DEFAULT_BASE_VALUES }
  clearTextContrast()
  setAmbilightTone(null)
}

function isSupportedPage(): boolean {
  return isVideoPlaybackPage()
    || isVideoOrBangumiPage()
    || isWatchLaterListPage(location.href)
}

function isFeatureActive(): boolean {
  return settings.value.ambilightEnabled && isSupportedPage()
}

function findTargetVideo(): HTMLVideoElement | null {
  const video = getVideoElement()
  if (video && video.isConnected)
    return video

  return null
}

// data-screen 位于 .bpx-player-container；#playerWrap 是其外层，需排在后面兜底
function findPlayerContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.bpx-player-container')
    || document.querySelector<HTMLElement>('#playerWrap')
}

function resolveDisplayMode(): {
  mode: AmbilightDisplayMode
  container: HTMLElement | null
} {
  const nativeFs = document.fullscreenElement as HTMLElement | null
  if (nativeFs)
    return { mode: 'fullscreen', container: nativeFs }

  const playerContainer = findPlayerContainer()
  if (playerContainer) {
    const screen = playerContainer.getAttribute('data-screen')
    if (screen === 'mini')
      return { mode: 'mini', container: playerContainer }
    if (screen === 'full' || screen === 'web'
      || playerContainer.classList.contains('web-fullscreen')
      || playerContainer.classList.contains('fullscreen')
      || document.documentElement.classList.contains('fullscreen-fix')) {
      return { mode: 'fullscreen', container: playerContainer }
    }
    if (screen === 'wide')
      return { mode: 'theater', container: playerContainer }
  }

  return { mode: 'normal', container: null }
}

function getEngineOptions(): AmbilightEngineOptions {
  return {
    enabled: settings.value.ambilightEnabled,
    enableFullscreen: settings.value.ambilightEnableFullscreen,
    strength: settings.value.ambilightStrength,
    spread: settings.value.ambilightSpread,
    smoothing: settings.value.ambilightSmoothing,
    blur: settings.value.ambilightBlur,
    saturation: settings.value.ambilightSaturation,
    fps: settings.value.ambilightFps,
  }
}

function updateLayout() {
  if (!engine)
    return
  const { mode, container } = resolveDisplayMode()
  engine.setDisplayMode(mode, container)
  engine.invalidate()
}

function scheduleSync() {
  if (syncTimer)
    clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    sync()
  }, 250)
}

function attachDiscoveryListeners() {
  if (discoveryLifetime)
    return
  discoveryLifetime = new AbortController()
  const { signal } = discoveryLifetime

  // 换 P、切集、单页导航：URL 变化或新视频开始加载时重新核对目标视频
  for (const name of ['pushstate', 'replacestate', 'popstate', 'hashchange'])
    window.addEventListener(name, scheduleSync, { signal })
  for (const name of ['loadedmetadata', 'play'])
    document.addEventListener(name, scheduleSync, { capture: true, signal })
}

function detachDiscoveryListeners() {
  discoveryLifetime?.abort()
  discoveryLifetime = null
  if (syncTimer) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
}

function attachEngineListeners() {
  if (engineLifetime)
    return
  engineLifetime = new AbortController()
  const { signal } = engineLifetime

  document.addEventListener('fullscreenchange', updateLayout, { signal })
  document.addEventListener('visibilitychange', () => {
    engine?.setHidden(document.hidden)
  }, { signal })
  // 滚动与尺寸变化由 invalidate 内部 RAF 合并调度
  window.addEventListener('resize', updateLayout, { passive: true, signal })
  window.addEventListener('scroll', updateLayout, { passive: true, signal })
}

function teardownEngine() {
  engineLifetime?.abort()
  engineLifetime = null
  if (engine) {
    engine.destroy()
    engine = null
    currentVideo = null
  }
  if (playerObserver) {
    playerObserver.disconnect()
    playerObserver = null
    observedPlayerContainer = null
  }
  document.documentElement.removeAttribute('data-bewly-ambilight')
  resetTone()
}

function sync() {
  if (!isFeatureActive()) {
    teardownEngine()
    return
  }

  const target = findTargetVideo()
  if (!target) {
    document.documentElement.removeAttribute('data-bewly-ambilight')
    return
  }

  document.documentElement.setAttribute('data-bewly-ambilight', '')

  if (!engine) {
    engine = new AmbilightEngine(getEngineOptions(), {
      getAnchors: getBackdropAnchors,
      onSample: handleBackdropSample,
    })
    attachEngineListeners()
    if (document.hidden)
      engine.setHidden(true)
  }
  else {
    engine.updateOptions(getEngineOptions())
  }

  if (currentVideo !== target) {
    currentVideo = target
    engine.bindVideo(target)
  }

  const { mode, container } = resolveDisplayMode()
  engine.setDisplayMode(mode, container)
  engine.invalidate(true)

  const playerContainer = findPlayerContainer()
  if (playerContainer && playerContainer !== observedPlayerContainer) {
    playerObserver?.disconnect()
    observedPlayerContainer = playerContainer
    playerObserver = new MutationObserver(updateLayout)
    playerObserver.observe(playerContainer, {
      attributes: true,
      attributeFilter: ['data-screen', 'class'],
    })
  }
}

export function initAmbilightControl() {
  if (initialized)
    return
  initialized = true

  void settingsReady.then(() => {
    watch(
      () => settings.value.ambilightEnabled,
      (enabled) => {
        if (enabled) {
          attachDiscoveryListeners()
        }
        else {
          detachDiscoveryListeners()
          teardownEngine()
        }
      },
      { immediate: true },
    )

    watch(
      () => [
        settings.value.ambilightEnabled,
        settings.value.ambilightEnableFullscreen,
        settings.value.ambilightStrength,
        settings.value.ambilightSpread,
        settings.value.ambilightSmoothing,
        settings.value.ambilightBlur,
        settings.value.ambilightSaturation,
        settings.value.ambilightFps,
      ],
      () => {
        if (settings.value.ambilightEnabled)
          sync()
      },
      { immediate: true },
    )
  })
}
