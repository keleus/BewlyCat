import { watch } from 'vue'

import { BEWLY_IFRAME_DRAWER_HOST_CLASS } from '~/constants/globalEvents'
import { settings, settingsReady } from '~/logic'
import { AmbilightEngine } from '~/utils/ambilight/ambilightEngine'
import type { AmbilightBackdrop, AmbilightBaseValues } from '~/utils/ambilight/textContrast'
import { DEFAULT_BASE_VALUES, getAmbilightTextColors, getBackdrop, parseBaseValue } from '~/utils/ambilight/textContrast'
import type { AmbilightBackdropAnchor, AmbilightBackdropSample, AmbilightDisplayMode, AmbilightEngineOptions, AmbilightTone } from '~/utils/ambilight/types'
import { isBewlyWidescreenActive } from '~/utils/bewlyWidescreen'
import { isVideoOrBangumiPage, isVideoPlaybackPage, isWatchLaterListPage } from '~/utils/main'
import { getVideoElement } from '~/utils/player'

let initialized = false
let engine: AmbilightEngine | null = null
let currentVideo: HTMLVideoElement | null = null
let playerObserver: MutationObserver | null = null
let observedPlayerContainer: HTMLElement | null = null
let pageStateObserver: MutationObserver | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
// 功能开启期间的视频发现与播放器形态监听；关闭时整体撤销，不在页面上保留任何监听
let discoveryLifetime: AbortController | null = null
// 引擎存在期间的布局与可见性监听
let engineLifetime: AbortController | null = null

// 文字区域与其采样点：按元素实际位置取点，宽屏、稍后再看等布局下同样准确。
// 区域名与 ambilight.scss 中的区域变量对应；其余文字使用全部采样点的综合结果
interface BackdropRegion {
  name: string
  selector: string
  points: (rect: DOMRect, video: DOMRect | null) => Array<[number, number]>
}

// 区域在视口内、未被视频画面遮住的纵向区段。宽屏下右侧栏从标题旁一直延伸到播放器下方，
// 中间一段被视频覆盖，栏内文字只在视频上方与下方
function getVisibleSpans(rect: DOMRect, video: DOMRect | null): Array<[number, number]> {
  const top = Math.max(rect.top, 0)
  const bottom = Math.min(rect.bottom, window.innerHeight)
  if (bottom <= top)
    return []
  if (!video || video.right <= rect.left || video.left >= rect.right || video.bottom <= top || video.top >= bottom)
    return [[top, bottom]]
  const spans: Array<[number, number]> = []
  if (video.top > top)
    spans.push([top, video.top])
  if (video.bottom < bottom)
    spans.push([video.bottom, bottom])
  return spans
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
    points: (rect, video) => getVisibleSpans(rect, video).flatMap(([spanTop, spanBottom]) => {
      // 区段足够高时避开上下边缘，否则只取中线
      const inset = Math.min(60, (spanBottom - spanTop) / 4)
      const top = spanTop + inset
      const bottom = spanBottom - inset
      const ys = bottom - top < 1 ? [top] : [top, (top + bottom) / 2, bottom]
      // 靠近视频的左缘光晕最浓，与栏内中部一起采样
      return [rect.left + 24, rect.left + rect.width * 0.5].flatMap(x => ys.map(y => [x, y] as [number, number]))
    }),
  },
  {
    // 播放器下方的弹幕发送栏与三连工具栏
    name: 'bottom',
    selector: '.bpx-player-sending-area, #arc_toolbar_report, .video-toolbar-container, #playlistToolbar',
    points: rect => [[rect.left + rect.width * 0.3, rect.top + rect.height / 2]],
  },
]

function isInside(rect: DOMRect | null, x: number, y: number): boolean {
  return rect !== null && x > rect.left && x < rect.right && y > rect.top && y < rect.bottom
}

// 文字区域元素随每次采样查询一次，取色与写入区域灰阶共用
let regionElements = new Map<string, HTMLElement[]>()

function getBackdropAnchors(): AmbilightBackdropAnchor[] {
  const anchors: AmbilightBackdropAnchor[] = []
  const video = currentVideo?.getBoundingClientRect() ?? null
  regionElements = new Map()
  for (const region of BACKDROP_REGIONS) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(region.selector))
    regionElements.set(region.name, elements)
    for (const element of elements) {
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height)
        continue
      for (const [x, y] of region.points(rect, video)) {
        // 视频画面上没有页面文字，落在其上的点不代表文字背景
        if (x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight && !isInside(video, x, y))
          anchors.push({ region: region.name, x, y })
      }
    }
  }
  return anchors
}

// 页面底色的实际亮度，随采样低频读取（跟随深色基准色设置）。环境光只按用户当前的明暗调整文字灰阶，
// 不随画面亮度切换整页主题
let baseValues: AmbilightBaseValues = { ...DEFAULT_BASE_VALUES }
let lastPageBaseReadTime = 0
let lastSamples: AmbilightBackdropSample[] | null = null

function getPageTone(): AmbilightTone {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

// 改动 html 上的变量会让整页重算样式（实测 B 站播放页约 2300 个元素、40ms，每次都会掉帧），
// html 上只放全部采样点的综合灰阶，供区域以外、离光晕较远的文字使用，只在背景亮度有明显变化时低频更新；
// 用户切换明暗时立即更新
const PAGE_INK_UPDATE_DELTA = 0.06
const PAGE_INK_UPDATE_INTERVAL = 5000

let appliedPageInk: { tone: AmbilightTone, backdrop: AmbilightBackdrop } | null = null
let lastPageInkUpdateTime = 0
let pageInkUpdateTimer: ReturnType<typeof setTimeout> | null = null
// 各文字区域的灰阶写在区域元素自身上，只重算区域内的样式（约 10ms），随光晕采样（每秒至多 2 次）小步更新。
// 记录各区域最近写入的文字色，只改写颜色确有变化的区域
const appliedRegionColors = new Map<string, string[]>()
// 已写入区域灰阶的元素，B 站重新渲染出的新元素也需补写
const inkedRegionElements = new Set<HTMLElement>()

function setTextColors(element: HTMLElement, colors: readonly string[]) {
  colors.forEach((color, index) => element.style.setProperty(`--bew-ambilight-text-${index + 1}`, color))
}

function removeTextColors(element: HTMLElement) {
  for (let level = 1; level <= 4; level++)
    element.style.removeProperty(`--bew-ambilight-text-${level}`)
}

function applyPageInk(tone: AmbilightTone, backdrop: AmbilightBackdrop, immediate: boolean) {
  if (appliedPageInk?.tone === tone
    && Math.abs(backdrop.typical - appliedPageInk.backdrop.typical) < PAGE_INK_UPDATE_DELTA
    && Math.abs(backdrop.worst - appliedPageInk.backdrop.worst) < PAGE_INK_UPDATE_DELTA) {
    return
  }

  const wait = PAGE_INK_UPDATE_INTERVAL - (performance.now() - lastPageInkUpdateTime)
  if (!immediate && wait > 0) {
    pageInkUpdateTimer ??= setTimeout(() => {
      pageInkUpdateTimer = null
      applyTextContrast()
    }, wait)
    return
  }
  if (pageInkUpdateTimer) {
    clearTimeout(pageInkUpdateTimer)
    pageInkUpdateTimer = null
  }

  appliedPageInk = { tone, backdrop }
  lastPageInkUpdateTime = performance.now()
  const root = document.documentElement
  setTextColors(root, getAmbilightTextColors(tone, backdrop))
  root.setAttribute('data-bewly-ambilight-ink', '')
}

// 区域元素上的文字色覆盖 html 上的综合灰阶，由子元素继承；新出现的元素在下次采样前沿用综合灰阶
function applyRegionInk(tone: AmbilightTone, samples: readonly AmbilightBackdropSample[], globalBackdrop: AmbilightBackdrop) {
  for (const region of BACKDROP_REGIONS) {
    const regionSamples = samples.filter(sample => sample.region === region.name)
    // 区域不在视口内时沿用综合结果，滚动回来时不会带着过期颜色
    const colors = getAmbilightTextColors(tone, regionSamples.length ? getBackdrop(regionSamples, tone, baseValues) : globalBackdrop)
    const previous = appliedRegionColors.get(region.name)
    const changed = !previous || colors.some((color, index) => color !== previous[index])
    if (changed)
      appliedRegionColors.set(region.name, colors)
    for (const element of regionElements.get(region.name) ?? []) {
      // 未变化时只为新出现的元素补写
      if (!changed && inkedRegionElements.has(element))
        continue
      setTextColors(element, colors)
      inkedRegionElements.add(element)
    }
  }
}

// 文字灰阶跟随光晕实时亮度，按区域分别计算
function applyTextContrast(immediate = false) {
  if (!lastSamples)
    return
  const tone = getPageTone()
  const globalBackdrop = getBackdrop(lastSamples, tone, baseValues)
  applyPageInk(tone, globalBackdrop, immediate)
  // 区域灰阶依赖 html 上的标记生效，整页灰阶写入后再写
  if (appliedPageInk)
    applyRegionInk(tone, lastSamples, globalBackdrop)
}

function clearTextContrast() {
  if (pageInkUpdateTimer) {
    clearTimeout(pageInkUpdateTimer)
    pageInkUpdateTimer = null
  }
  const root = document.documentElement
  root.removeAttribute('data-bewly-ambilight-ink')
  removeTextColors(root)
  for (const element of inkedRegionElements)
    removeTextColors(element)
  inkedRegionElements.clear()
  appliedRegionColors.clear()
  regionElements = new Map()
  appliedPageInk = null
  lastSamples = null
}

function readPageBase() {
  lastPageBaseReadTime = performance.now()
  const pageBase = parseBaseValue(getComputedStyle(document.body).backgroundColor)
  if (pageBase !== null)
    baseValues[getPageTone()] = pageBase
}

function handleBackdropSample(samples: AmbilightBackdropSample[]) {
  lastSamples = samples
  // 读取计算样式会强制同步重算样式，底色只随设置变化，与整页灰阶同频读取即可
  if (performance.now() - lastPageBaseReadTime >= PAGE_INK_UPDATE_INTERVAL)
    readPageBase()
  applyTextContrast()
}

// 用户切换明暗后立即按新主题重算文字灰阶，暂停时也不必等下一次采样
function handlePageToneChange() {
  if (!appliedPageInk || appliedPageInk.tone === getPageTone())
    return
  readPageBase()
  applyTextContrast(true)
}

function resetTextContrast() {
  baseValues = { ...DEFAULT_BASE_VALUES }
  lastPageBaseReadTime = 0
  clearTextContrast()
}

function isSupportedPage(): boolean {
  return isVideoPlaybackPage()
    || isVideoOrBangumiPage()
    || isWatchLaterListPage(location.href)
}

// iframe 抽屉会把宿主页地址栏临时替换为视频 URL，宿主页本身不是播放页，
// 也不能让宿主页的明暗经抽屉的主题同步传入 iframe
function isFeatureActive(): boolean {
  return settings.value.ambilightEnabled
    && isSupportedPage()
    && !document.documentElement.classList.contains(BEWLY_IFRAME_DRAWER_HOST_CLASS)
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

// 环境光只用于默认与宽屏播放器。全屏、网页全屏时页面其余内容不可见，Bewly 宽屏已重排整页，
// 均返回 null 并整体停用环境光，页面的透明背景与明暗也随之恢复
function resolveDisplayMode(): AmbilightDisplayMode | null {
  if (document.fullscreenElement
    || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement
    || document.documentElement.classList.contains('fullscreen-fix')
    || isBewlyWidescreenActive()) {
    return null
  }

  const playerContainer = findPlayerContainer()
  if (playerContainer) {
    const screen = playerContainer.getAttribute('data-screen')
    if (screen === 'full' || screen === 'web'
      || playerContainer.classList.contains('web-fullscreen')
      || playerContainer.classList.contains('fullscreen')) {
      return null
    }
    if (screen === 'mini')
      return 'mini'
    if (screen === 'wide')
      return 'theater'
  }

  return 'normal'
}

function getEngineOptions(): AmbilightEngineOptions {
  return {
    enabled: settings.value.ambilightEnabled,
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
  const mode = resolveDisplayMode()
  if (!mode) {
    teardownEngine()
    return
  }
  engine.setDisplayMode(mode)
  engine.invalidate()
}

// 进出全屏、网页全屏、Bewly 宽屏或抽屉时启停环境光；仅在启停状态可能变化时重新核对
function handlePlayerModeChange() {
  const shouldRun = isFeatureActive() && resolveDisplayMode() !== null
  if (engine && shouldRun)
    updateLayout()
  else if (Boolean(engine) !== shouldRun)
    sync()
}

function observePlayerContainer() {
  const playerContainer = findPlayerContainer()
  if (!playerContainer || playerContainer === observedPlayerContainer)
    return
  playerObserver?.disconnect()
  observedPlayerContainer = playerContainer
  playerObserver = new MutationObserver(handlePlayerModeChange)
  playerObserver.observe(playerContainer, {
    attributes: true,
    attributeFilter: ['data-screen', 'class'],
  })
}

function stopObservingPlayerContainer() {
  playerObserver?.disconnect()
  playerObserver = null
  observedPlayerContainer = null
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

  // 停用期间引擎不存在，播放器形态的变化需在此监听，退出全屏等形态后才能恢复
  document.addEventListener('fullscreenchange', handlePlayerModeChange, { signal })
  // 抽屉宿主标记在 html 上，Bewly 宽屏标记在 body 上；抽屉在内容脚本中改写地址栏，不会触发 pushstate 事件
  pageStateObserver = new MutationObserver(() => {
    handlePlayerModeChange()
    handlePageToneChange()
  })
  pageStateObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  if (document.body)
    pageStateObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
}

function detachDiscoveryListeners() {
  discoveryLifetime?.abort()
  discoveryLifetime = null
  pageStateObserver?.disconnect()
  pageStateObserver = null
  stopObservingPlayerContainer()
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
  document.documentElement.removeAttribute('data-bewly-ambilight')
  resetTextContrast()
}

function sync() {
  if (!isFeatureActive()) {
    stopObservingPlayerContainer()
    teardownEngine()
    return
  }

  observePlayerContainer()
  const mode = resolveDisplayMode()
  if (!mode) {
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

  engine.setDisplayMode(mode)
  engine.invalidate(true)
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
