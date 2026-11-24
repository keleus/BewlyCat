import { watch } from 'vue'

import { BEWLY_IFRAME_DRAWER_HOST_CLASS } from '~/constants/globalEvents'
import { settings, settingsReady } from '~/logic'
import { AmbilightEngine } from '~/utils/ambilight/ambilightEngine'
import type { AmbilightBackdrop, AmbilightBaseValues } from '~/utils/ambilight/textContrast'
import {
  DEFAULT_BASE_VALUES,
  getAmbilightTextColors,
  getBackdrop,
  parseBaseValue,
} from '~/utils/ambilight/textContrast'
import type {
  AmbilightBackdropAnchor,
  AmbilightBackdropSample,
  AmbilightDisplayMode,
  AmbilightEngineOptions,
  AmbilightTone,
} from '~/utils/ambilight/types'
import { isBewlyWidescreenActive } from '~/utils/bewlyWidescreen'
import { isVideoOrBangumiPage, isVideoPlaybackPage } from '~/utils/main'
import { getVideoElement } from '~/utils/player'

let initialized = false
let engine: AmbilightEngine | null = null
let currentVideo: HTMLVideoElement | null = null
let playerObserver: MutationObserver | null = null
let observedModeTargets: Element[] = []
let pageStateObserver: MutationObserver | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
let pendingTeardownTimer: ReturnType<typeof setTimeout> | null = null
let pendingResumeFrame: number | null = null
const MODE_TEARDOWN_DEFER_MS = 350
// 功能开启期间的视频发现与播放器形态监听；关闭时整体撤销，不在页面上保留任何监听
let discoveryLifetime: AbortController | null = null
// 引擎存在期间的布局与可见性监听
let engineLifetime: AbortController | null = null

// 文字区域与其采样点：按元素实际位置取点，宽屏、稍后再看等布局下同样准确。
// 区域名与 ambilight.scss 中的区域变量对应；其余文字使用全部采样点的综合结果
interface BackdropRegion {
  name: string
  selector: string
  bangumiSelector?: string
  points: (rect: DOMRect, video: DOMRect | null) => Array<[number, number]>
}

function isBangumiPage(): boolean {
  return (
    document.documentElement.classList.contains('animePlaybackAndMoviePage') ||
    /\/bangumi\/play\//.test(location.pathname)
  )
}

// 区域在视口内、未被视频画面遮住的纵向区段。宽屏下右侧栏从标题旁一直延伸到播放器下方，
// 中间一段被视频覆盖，栏内文字只在视频上方与下方
function getVisibleSpans(rect: DOMRect, video: DOMRect | null): Array<[number, number]> {
  const top = Math.max(rect.top, 0)
  const bottom = Math.min(rect.bottom, window.innerHeight)
  if (bottom <= top) return []
  if (
    !video ||
    video.right <= rect.left ||
    video.left >= rect.right ||
    video.bottom <= top ||
    video.top >= bottom
  )
    return [[top, bottom]]
  const spans: Array<[number, number]> = []
  if (video.top > top) spans.push([top, video.top])
  if (video.bottom < bottom) spans.push([video.bottom, bottom])
  return spans
}

const BACKDROP_REGIONS: readonly BackdropRegion[] = [
  {
    // 标题与播放量、日期等信息行
    name: 'top',
    selector: '.video-info-container, #viewbox_report',
    // 光晕沿视频上缘的颜色横向变化（泊松扩散几乎不模糊），左右各取一列
    points: (rect) =>
      [0.25, 0.75].flatMap(
        (fx) =>
          [
            [rect.left + rect.width * fx, rect.top + rect.height * 0.35],
            [rect.left + rect.width * fx, rect.bottom - 14],
          ] as Array<[number, number]>,
      ),
  },
  {
    // UP 主信息、弹幕列表、合集/选集与推荐列表（含番剧右侧栏）
    name: 'side',
    selector: '.right-container, .playlist-container--right',
    bangumiSelector: '.plp-r',
    points: (rect, video) =>
      getVisibleSpans(rect, video).flatMap(([spanTop, spanBottom]) => {
        // 区段足够高时避开上下边缘，否则只取中线
        const inset = Math.min(60, (spanBottom - spanTop) / 4)
        const top = spanTop + inset
        const bottom = spanBottom - inset
        const ys = bottom - top < 1 ? [top] : [top, (top + bottom) / 2, bottom]
        // 靠近视频的左缘光晕最浓，与栏内中部一起采样
        return [rect.left + 24, rect.left + rect.width * 0.5].flatMap((x) =>
          ys.map((y) => [x, y] as [number, number]),
        )
      }),
  },
  {
    // 播放器下方的弹幕发送栏与三连工具栏（含番剧播放页）
    name: 'bottom',
    selector:
      '.bpx-player-sending-area, .bilibili-player-video-sendbar, #arc_toolbar_report, .video-toolbar-container, #playlistToolbar',
    bangumiSelector:
      '.bpx-player-sending-area, [class*="NanoPlayer_nonoPlayerSendingBar"], .bilibili-player-video-sendbar, .plp-l .toolbar, [class*="toolbar_toolbar"], .main-container .tool-bar',
    // 紧贴视频下缘，光晕颜色随视频底边横向变化，沿宽度取三点
    points: (rect) =>
      [0.15, 0.5, 0.85].map(
        (fx) => [rect.left + rect.width * fx, rect.top + rect.height / 2] as [number, number],
      ),
  },
]

function isInside(rect: DOMRect | null, x: number, y: number): boolean {
  return rect !== null && x > rect.left && x < rect.right && y > rect.top && y < rect.bottom
}

// 文字区域元素按低频缓存，避免每 500ms 采样对超长合集 DOM 全树执行 querySelectorAll
let regionElements = new Map<string, HTMLElement[]>()
let lastRegionQueryTime = 0
let sideHasLargeCollection = false

const PAGE_INK_UPDATE_DELTA = 0.06
const PAGE_INK_UPDATE_INTERVAL = 5000
const REGION_INK_UPDATE_DELTA = 0.03
const LARGE_COLLECTION_ITEM_THRESHOLD = 60
const LARGE_COLLECTION_SCROLL_HEIGHT_THRESHOLD = 3000
const COLLECTION_LIST_SELECTOR =
  '.video-pod__list, .video-sections-content-list, .cur-list .list-box'

function detectLargeCollection(sideElements: readonly HTMLElement[]): boolean {
  for (const element of sideElements) {
    const list = element.querySelector<HTMLElement>(COLLECTION_LIST_SELECTOR)
    if (!list) continue
    if (
      list.childElementCount >= LARGE_COLLECTION_ITEM_THRESHOLD ||
      list.scrollHeight >= LARGE_COLLECTION_SCROLL_HEIGHT_THRESHOLD
    )
      return true
  }
  return false
}

function refreshRegionElements(now: number): void {
  const needsRefresh =
    now - lastRegionQueryTime >= PAGE_INK_UPDATE_INTERVAL ||
    regionElements.size !== BACKDROP_REGIONS.length ||
    BACKDROP_REGIONS.some((region) => {
      const elements = regionElements.get(region.name)
      return !elements || elements.length === 0 || elements.some((el) => !el.isConnected)
    })

  if (!needsRefresh) return

  lastRegionQueryTime = now
  const bangumi = isBangumiPage()
  const next = new Map<string, HTMLElement[]>()
  for (const region of BACKDROP_REGIONS) {
    const selector = bangumi && region.bangumiSelector ? region.bangumiSelector : region.selector
    next.set(region.name, Array.from(document.querySelectorAll<HTMLElement>(selector)))
  }
  regionElements = next
  sideHasLargeCollection = detectLargeCollection(next.get('side') ?? [])
}

function getBackdropAnchors(): AmbilightBackdropAnchor[] {
  const anchors: AmbilightBackdropAnchor[] = []
  const video = currentVideo?.getBoundingClientRect() ?? null
  refreshRegionElements(performance.now())
  for (const region of BACKDROP_REGIONS) {
    const elements = regionElements.get(region.name) ?? []
    for (const element of elements) {
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      for (const [x, y] of region.points(rect, video)) {
        // 视频画面上没有页面文字，落在其上的点不代表文字背景
        if (
          x >= 0 &&
          y >= 0 &&
          x <= window.innerWidth &&
          y <= window.innerHeight &&
          !isInside(video, x, y)
        )
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
  return document.documentElement.classList.contains('dark') ||
    document.documentElement.classList.contains('bili_dark')
    ? 'dark'
    : 'light'
}

// 改动 html 上的变量会让整页重算样式（实测 B 站播放页约 2300 个元素、40ms，每次都会掉帧），
// html 上只放全部采样点的综合灰阶，供区域以外、离光晕较远的文字使用，只在背景亮度有明显变化时低频更新；
// 用户切换明暗时立即更新
let appliedPageInk: { tone: AmbilightTone; backdrop: AmbilightBackdrop } | null = null
let lastPageInkUpdateTime = 0
let pageInkUpdateTimer: ReturnType<typeof setTimeout> | null = null
// 各文字区域的灰阶写在区域元素自身上，只重算区域内的样式（约 10ms），随光晕采样（每秒至多 2 次）小步更新。
// 记录各区域最近写入的文字色与背景亮度，避免微小亮度抖动或超长合集右侧栏高频全子树重算样式
const appliedRegionColors = new Map<string, string[]>()
const appliedRegionBackdrops = new Map<
  string,
  { tone: AmbilightTone; backdrop: AmbilightBackdrop }
>()
const lastRegionInkUpdateTime = new Map<string, number>()
// 已写入区域灰阶的元素，B 站重新渲染出的新元素也需补写
const inkedRegionElements = new Set<HTMLElement>()

function setTextColors(element: HTMLElement, colors: readonly string[]) {
  colors.forEach((color, index) =>
    element.style.setProperty(`--bew-ambilight-text-${index + 1}`, color),
  )
}

function removeTextColors(element: HTMLElement) {
  for (let level = 1; level <= 4; level++)
    element.style.removeProperty(`--bew-ambilight-text-${level}`)
}

function applyPageInk(tone: AmbilightTone, backdrop: AmbilightBackdrop, immediate: boolean) {
  if (
    appliedPageInk?.tone === tone &&
    Math.abs(backdrop.typical - appliedPageInk.backdrop.typical) < PAGE_INK_UPDATE_DELTA &&
    Math.abs(backdrop.worst - appliedPageInk.backdrop.worst) < PAGE_INK_UPDATE_DELTA
  ) {
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
function applyRegionInk(
  tone: AmbilightTone,
  samples: readonly AmbilightBackdropSample[],
  globalBackdrop: AmbilightBackdrop,
  immediate: boolean,
) {
  const now = performance.now()
  for (const region of BACKDROP_REGIONS) {
    const elements = regionElements.get(region.name) ?? []
    if (elements.length === 0) continue
    const regionSamples = samples.filter((sample) => sample.region === region.name)
    // 区域不在视口内时沿用综合结果，滚动回来时不会带着过期颜色
    const backdrop = regionSamples.length
      ? getBackdrop(regionSamples, tone, baseValues)
      : globalBackdrop
    const prevBackdrop = appliedRegionBackdrops.get(region.name)
    const isHeavySide = region.name === 'side' && sideHasLargeCollection
    const minDelta = isHeavySide ? PAGE_INK_UPDATE_DELTA : REGION_INK_UPDATE_DELTA
    const minInterval = isHeavySide ? PAGE_INK_UPDATE_INTERVAL : 0
    const lastUpdate = lastRegionInkUpdateTime.get(region.name) ?? 0

    const withinDelta =
      prevBackdrop?.tone === tone &&
      Math.abs(backdrop.typical - prevBackdrop.backdrop.typical) < minDelta &&
      Math.abs(backdrop.worst - prevBackdrop.backdrop.worst) < minDelta
    const throttled =
      !immediate && minInterval > 0 && prevBackdrop?.tone === tone && now - lastUpdate < minInterval

    let colors = appliedRegionColors.get(region.name)
    let changed = false
    if (!colors || immediate || (!withinDelta && !throttled)) {
      const nextColors = getAmbilightTextColors(tone, backdrop)
      changed = !colors || nextColors.some((color, index) => color !== colors![index])
      if (changed) {
        colors = nextColors
        appliedRegionColors.set(region.name, colors)
        appliedRegionBackdrops.set(region.name, { tone, backdrop })
        lastRegionInkUpdateTime.set(region.name, now)
      } else if (!prevBackdrop || prevBackdrop.tone !== tone) {
        appliedRegionBackdrops.set(region.name, { tone, backdrop })
        lastRegionInkUpdateTime.set(region.name, now)
      }
    }

    if (!colors) continue
    for (const element of elements) {
      // 未变化时只为新出现的元素补写
      if (!changed && inkedRegionElements.has(element)) continue
      setTextColors(element, colors)
      inkedRegionElements.add(element)
    }
  }
}

// 文字灰阶跟随光晕实时亮度，按区域分别计算
function applyTextContrast(immediate = false) {
  if (!lastSamples) return
  const tone = getPageTone()
  const globalBackdrop = getBackdrop(lastSamples, tone, baseValues)
  applyPageInk(tone, globalBackdrop, immediate)
  // 区域灰阶依赖 html 上的标记生效，整页灰阶写入后再写
  if (appliedPageInk) applyRegionInk(tone, lastSamples, globalBackdrop, immediate)
}

function clearTextContrast() {
  if (pageInkUpdateTimer) {
    clearTimeout(pageInkUpdateTimer)
    pageInkUpdateTimer = null
  }
  const root = document.documentElement
  root.removeAttribute('data-bewly-ambilight-ink')
  removeTextColors(root)
  for (const element of inkedRegionElements) removeTextColors(element)
  inkedRegionElements.clear()
  appliedRegionColors.clear()
  appliedRegionBackdrops.clear()
  lastRegionInkUpdateTime.clear()
  regionElements = new Map()
  lastRegionQueryTime = 0
  sideHasLargeCollection = false
  appliedPageInk = null
  lastSamples = null
}

function readPageBase() {
  lastPageBaseReadTime = performance.now()
  const pageBase = parseBaseValue(getComputedStyle(document.body).backgroundColor)
  if (pageBase !== null) baseValues[getPageTone()] = pageBase
}

function handleBackdropSample(samples: AmbilightBackdropSample[]) {
  lastSamples = samples
  // 读取计算样式会强制同步重算样式，底色只随设置变化，与整页灰阶同频读取即可
  if (performance.now() - lastPageBaseReadTime >= PAGE_INK_UPDATE_INTERVAL) readPageBase()
  applyTextContrast()
}

// 用户切换明暗后立即按新主题重算文字灰阶，暂停时也不必等下一次采样
function handlePageToneChange() {
  if (!appliedPageInk || appliedPageInk.tone === getPageTone()) return
  readPageBase()
  applyTextContrast(true)
}

function resetTextContrast() {
  baseValues = { ...DEFAULT_BASE_VALUES }
  lastPageBaseReadTime = 0
  clearTextContrast()
}

// 稍后再看列表页（/watchlater/list）只是视频网格，页内广告等播放器会被误认作目标视频；
// 稍后再看的实际播放走 /list/watchlater，已由 isVideoPlaybackPage 覆盖
function isSupportedPage(): boolean {
  return isVideoPlaybackPage() || isVideoOrBangumiPage()
}

// iframe 抽屉会把宿主页地址栏临时替换为视频 URL，宿主页本身不是播放页，
// 也不能让宿主页的明暗经抽屉的主题同步传入 iframe
function isFeatureActive(): boolean {
  return (
    settings.value.ambilightEnabled &&
    isSupportedPage() &&
    !document.documentElement.classList.contains(BEWLY_IFRAME_DRAWER_HOST_CLASS)
  )
}

function findTargetVideo(): HTMLVideoElement | null {
  const video = getVideoElement()
  if (video && video.isConnected) return video

  return null
}

let lastDisplayMode: AmbilightDisplayMode | null = null

// data-screen 位于 .bpx-player-container；#playerWrap / #bilibili-player-wrap 是其外层兜底
function findPlayerContainer(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('.bpx-player-container') ||
    document.getElementById('playerWrap') ||
    document.getElementById('bilibili-player-wrap')
  )
}

function getModeTargets(): Element[] {
  const targets = new Set<Element>()
  const playerContainer = findPlayerContainer()
  if (playerContainer) targets.add(playerContainer)
  // 番剧页宽屏与网页全屏可能写在 .home-container.wide 或内层 video_playerFullScreen 上
  if (isBangumiPage()) {
    const bangumiHome = document.querySelector('.home-container')
    if (bangumiHome) targets.add(bangumiHome)
    const bangumiWrap = document.getElementById('bilibili-player-wrap')
    const bangumiPlayerInner = bangumiWrap?.querySelector('[class*="video_playerInner"]')
    if (bangumiPlayerInner) targets.add(bangumiPlayerInner)
  }
  return Array.from(targets)
}

// 环境光只用于默认与宽屏播放器。全屏、网页全屏时页面其余内容不可见，Bewly 宽屏已重排整页，
// 均返回 null 并整体停用环境光，页面的透明背景与明暗也随之恢复
function resolveDisplayMode(): AmbilightDisplayMode | null {
  if (
    document.fullscreenElement ||
    (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ||
    document.documentElement.classList.contains('fullscreen-fix') ||
    isBewlyWidescreenActive()
  ) {
    return null
  }

  const bangumi = isBangumiPage()
  if (bangumi) {
    if (document.getElementById('player_module')?.classList.contains('player-fullscreen-fix'))
      return null
    const bangumiWrap = document.getElementById('bilibili-player-wrap')
    if (bangumiWrap?.querySelector('[class*="video_playerFullScreen"]')) return null
  }

  const playerContainer = findPlayerContainer()
  if (playerContainer) {
    const screen = playerContainer.getAttribute('data-screen')
    if (
      screen === 'full' ||
      screen === 'web' ||
      playerContainer.classList.contains('web-fullscreen') ||
      playerContainer.classList.contains('fullscreen')
    ) {
      return null
    }
    if (screen === 'mini') return 'mini'
    if (screen === 'wide') return 'theater'
  }

  if (bangumi && document.querySelector('.home-container.wide')) return 'theater'

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
    diffusion: settings.value.ambilightDiffusion,
    diffusionQuality: settings.value.ambilightDiffusionQuality,
    diffusionDecay: settings.value.ambilightDiffusionDecay,
    diffusionIterations: settings.value.ambilightDiffusionIterations,
    diffusionFeather: settings.value.ambilightDiffusionFeather,
  }
}

function updateLayout() {
  if (!engine) return
  const mode = resolveDisplayMode()
  if (!mode) {
    teardownEngine()
    return
  }
  lastDisplayMode = mode
  engine.setDisplayMode(mode)
  engine.invalidate()
}

function cancelPendingModeTransitions() {
  if (pendingTeardownTimer !== null) {
    clearTimeout(pendingTeardownTimer)
    pendingTeardownTimer = null
  }
  if (pendingResumeFrame !== null) {
    cancelAnimationFrame(pendingResumeFrame)
    pendingResumeFrame = null
  }
}

// 进出全屏、网页全屏、Bewly 宽屏或抽屉时启停环境光；仅在模式或启停状态真正变化时更新布局，
// 避免播放器悬停、暂停、控制栏显隐等频繁改写 class 时反复触发整页布局重算
function handlePlayerModeChange() {
  if (!isFeatureActive()) {
    cancelPendingModeTransitions()
    if (engine) teardownEngine()
    return
  }

  const mode = resolveDisplayMode()
  if (!mode) {
    if (pendingResumeFrame !== null) {
      cancelAnimationFrame(pendingResumeFrame)
      pendingResumeFrame = null
    }
    if (engine) {
      // Bewly 宽屏仍显示侧栏文字，需立即恢复页面变量；
      // 全屏/网页全屏覆盖整屏，先休眠并隐藏画布，把整页样式重算延后到过渡结束后执行。
      if (isBewlyWidescreenActive()) {
        teardownEngine()
        return
      }
      engine.setSleeping(true)
      if (pendingTeardownTimer === null) {
        pendingTeardownTimer = setTimeout(() => {
          pendingTeardownTimer = null
          if (!isFeatureActive() || !resolveDisplayMode()) teardownEngine()
        }, MODE_TEARDOWN_DEFER_MS)
      }
    }
    return
  }

  if (pendingTeardownTimer !== null) {
    clearTimeout(pendingTeardownTimer)
    pendingTeardownTimer = null
    if (engine) {
      lastDisplayMode = mode
      engine.setDisplayMode(mode)
      engine.invalidate()
      return
    }
  }

  if (!engine) {
    if (pendingResumeFrame === null) {
      pendingResumeFrame = requestAnimationFrame(() => {
        pendingResumeFrame = null
        sync()
      })
    }
    return
  }
  if (mode !== lastDisplayMode) {
    lastDisplayMode = mode
    engine.setDisplayMode(mode)
    engine.invalidate()
  }
}

function observePlayerContainer() {
  const targets = getModeTargets()
  if (!targets.length) return
  if (
    targets.length === observedModeTargets.length &&
    targets.every((target, index) => target === observedModeTargets[index])
  )
    return
  playerObserver?.disconnect()
  observedModeTargets = targets
  playerObserver = new MutationObserver(handlePlayerModeChange)
  for (const target of targets) {
    playerObserver.observe(target, {
      attributes: true,
      attributeFilter: ['data-screen', 'class'],
    })
  }
}

function stopObservingPlayerContainer() {
  playerObserver?.disconnect()
  playerObserver = null
  observedModeTargets = []
}

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    sync()
  }, 250)
}

function attachDiscoveryListeners() {
  if (discoveryLifetime) return
  discoveryLifetime = new AbortController()
  const { signal } = discoveryLifetime

  // 换 P、切集、单页导航：URL 变化或新视频开始加载时重新核对目标视频
  for (const name of ['pushstate', 'replacestate', 'popstate', 'hashchange'])
    window.addEventListener(name, scheduleSync, { signal })
  const handleMediaDiscovery = (event: Event) => {
    // 同一已绑定视频暂停后继续播放由引擎自身处理，无需重新同步配置与整页布局
    if (
      event.type === 'play' &&
      engine &&
      currentVideo &&
      currentVideo.isConnected &&
      event.target === currentVideo
    )
      return
    scheduleSync()
  }
  for (const name of ['loadedmetadata', 'play'])
    document.addEventListener(name, handleMediaDiscovery, { capture: true, signal })

  // 停用期间引擎不存在，播放器形态的变化需在此监听，退出全屏等形态后才能恢复
  document.addEventListener('fullscreenchange', handlePlayerModeChange, { signal })
  // 抽屉宿主标记在 html 上，Bewly 宽屏标记在 body 上；抽屉在内容脚本中改写地址栏，不会触发 pushstate 事件
  pageStateObserver = new MutationObserver(() => {
    handlePlayerModeChange()
    handlePageToneChange()
  })
  pageStateObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
  if (document.body)
    pageStateObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
}

function detachDiscoveryListeners() {
  cancelPendingModeTransitions()
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
  if (engineLifetime) return
  engineLifetime = new AbortController()
  const { signal } = engineLifetime

  document.addEventListener(
    'visibilitychange',
    () => {
      engine?.setHidden(document.hidden)
    },
    { signal },
  )
  // 尺寸/播放器模式变化需要重算本地布局；滚动交给浏览器原生滚动，
  // 这里只做视口可见性、sticky/fixed 兜底和文字背景采样。
  window.addEventListener('resize', updateLayout, { passive: true, signal })
  window.addEventListener('scroll', () => engine?.handleScroll(), { passive: true, signal })
}

function teardownEngine() {
  cancelPendingModeTransitions()
  engineLifetime?.abort()
  engineLifetime = null
  if (engine) {
    engine.destroy()
    engine = null
    currentVideo = null
  }
  lastDisplayMode = null
  document.documentElement.removeAttribute('data-bewly-ambilight')
  resetTextContrast()
}

function sync() {
  cancelPendingModeTransitions()
  if (!isFeatureActive()) {
    stopObservingPlayerContainer()
    teardownEngine()
    return
  }

  lastRegionQueryTime = 0
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
    if (document.hidden) engine.setHidden(true)
  } else {
    engine.updateOptions(getEngineOptions())
  }

  if (currentVideo !== target) {
    currentVideo = target
    engine.bindVideo(target)
  }

  lastDisplayMode = mode
  engine.setDisplayMode(mode)
  engine.invalidate(true)
}

export function initAmbilightControl() {
  if (initialized) return
  initialized = true

  void settingsReady.then(() => {
    watch(
      () => settings.value.ambilightEnabled,
      (enabled) => {
        if (enabled) {
          attachDiscoveryListeners()
        } else {
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
        settings.value.ambilightDiffusion,
        settings.value.ambilightDiffusionQuality,
        settings.value.ambilightDiffusionDecay,
        settings.value.ambilightDiffusionIterations,
        settings.value.ambilightDiffusionFeather,
      ],
      () => {
        if (settings.value.ambilightEnabled) sync()
      },
      { immediate: true },
    )
  })
}
