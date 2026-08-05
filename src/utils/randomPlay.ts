import { settings } from '~/logic'
import type { CustomPlayOrderContext, RandomPlayOrder } from '~/logic/storage'
import { i18n } from '~/utils/i18n'

import { applyAutoPlayByVideoType, detectVideoType, disableNativeEndPlaybackBehavior, supportsCustomPlaybackForVideoType, VideoType } from './player'

// 随机播放状态管理
let isRandomPlayEnabled = false
let isRandomPlayInitialized = false
const visitedEpisodes = new Set<string>()
let originalEndedListener: (() => void) | null = null
let originalPauseListener: (() => void) | null = null
let listenerVideo: HTMLVideoElement | null = null
let videoObserver: MutationObserver | null = null
let isPageObserverInitialized = false
let userManuallySetRandomPlay = false // 用户手动设置的随机播放状态标志
let customEpisodeOrder: string[] = []
let activePlayOrder: RandomPlayOrder | null = null
let playlistEditorController: AbortController | null = null
let playlistEditorButton: HTMLButtonElement | null = null
let playlistEditorStyle: HTMLStyleElement | null = null
const originalEpisodeOrders = new Map<HTMLElement, { priority: string, value: string }>()
const originalEpisodeDraggable = new Map<HTMLElement, boolean>()
const visuallyOrderedParents = new Set<HTMLElement>()

interface EpisodeEntry {
  element: HTMLElement
  key: string
  title: string
}

const episodeRootSelector = [
  '.video-pod',
  '.multi-page',
  '.video-sections-content-list',
  '.base-video-sections-v1',
  '.video-sections-v1',
  '.video-sections',
].join(', ')

function queryEpisodeItems(selector: string): HTMLElement[] {
  const scopedItems = Array.from(document.querySelectorAll(episodeRootSelector))
    .flatMap(root => Array.from(root.querySelectorAll(selector)) as HTMLElement[])
  if (scopedItems.length > 0)
    return Array.from(new Set(scopedItems))

  return Array.from(document.querySelectorAll(selector)) as HTMLElement[]
}

function t(key: string): string {
  return String(i18n.global.t(key, settings.value.language))
}

function getActivePlayOrder(): RandomPlayOrder {
  return activePlayOrder ?? getEffectiveCustomPlayOrder() ?? 'sequential'
}

function getVideoTypeCustomPlayOrder(): RandomPlayOrder | null {
  if (!settings.value.enableCustomPlayOrderOverrides)
    return null

  let context: CustomPlayOrderContext | null = null
  switch (detectVideoType()) {
    case VideoType.MULTIPART:
      context = 'multipart'
      break
    case VideoType.COLLECTION:
      context = 'collection'
      break
    case VideoType.WATCH_LATER:
      context = 'watchLater'
      break
    case VideoType.PLAYLIST:
      context = 'playlist'
      break
  }

  if (!context)
    return null

  const order = settings.value.customPlayOrderOverrides[context]
  return order === 'sequential' || order === 'reverse' || order === 'random' ? order : null
}

function getDefaultCustomPlayOrder(): RandomPlayOrder | null {
  if (!supportsCustomPlaybackForVideoType())
    return null

  const order = settings.value.defaultCustomPlayOrder
  return order === 'sequential' || order === 'reverse' || order === 'random' ? order : null
}

function getEffectiveCustomPlayOrder(): RandomPlayOrder | null {
  if (!settings.value.enableRandomPlay)
    return null

  return getVideoTypeCustomPlayOrder() ?? getDefaultCustomPlayOrder()
}

// 获取随机播放文本
export function getRandomPlayText(): string {
  return t('settings.random_play')
}

// 获取视频选集
export function getVideoEpisodes(): HTMLElement[] {
  // 多P视频选集（B站标准选集列表）
  const episodes = queryEpisodeItems('.video-pod__item, .multi-page__item, .page-item')

  if (episodes.length > 0) {
    return episodes
  }

  // 合集视频选集（稍后再看、收藏夹等），只在明确的选集容器内查找，避免扫描评论区
  const collectionEpisodes = Array.from(document.querySelectorAll(episodeRootSelector))
    .flatMap(root => Array.from(root.querySelectorAll('.list-item, .episode-item, .section-item, .collect-item')) as HTMLElement[])
  const validCollectionEpisodes = collectionEpisodes.filter((item) => {
    const link = item.querySelector('a[href*="/video/"]')
    return link !== null
  })

  if (validCollectionEpisodes.length > 0) {
    return validCollectionEpisodes
  }

  return []
}

const recommendationRootSelector = [
  '[class*="recommend_wrap"]',
  '.recommend-list-v1',
  '.recommend-list',
  '.rec-list',
  '.next-play',
].join(', ')

function findPlaylistAutoPlayContainer(): HTMLElement | null {
  // A single-video page can still expose an auto-play control for the
  // recommendation list. Custom order controls belong only to a real episode
  // playlist, never to that recommendation block.
  if (detectVideoType() === VideoType.RECOMMEND)
    return null

  const episodes = getVideoEpisodes()
  if (episodes.length === 0)
    return null

  const candidates = Array.from(document.querySelectorAll<HTMLElement>('.auto-play, .continuous-btn'))
    .filter(candidate => !candidate.closest(recommendationRootSelector))
  if (candidates.length === 0)
    return null

  const episodeCandidate = candidates.find((candidate) => {
    const root = candidate.closest(episodeRootSelector)
    return !!root && episodes.some(episode => root.contains(episode))
  })
  return episodeCandidate ?? candidates[0]
}

function normalizeEpisodeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function getEpisodeLink(episode: HTMLElement): HTMLAnchorElement | null {
  return episode.matches('a[href]')
    ? episode as HTMLAnchorElement
    : episode.querySelector<HTMLAnchorElement>('a[href]')
}

function getEpisodeBaseKey(episode: HTMLElement, index: number): string {
  const datasetKey = [
    episode.dataset.bvid,
    episode.dataset.aid,
    episode.dataset.cid,
    episode.dataset.key,
    episode.dataset.index,
  ].find(Boolean)
  if (datasetKey)
    return `data:${datasetKey}`

  const link = getEpisodeLink(episode)
  if (link?.href) {
    try {
      const url = new URL(link.href, location.href)
      const page = url.searchParams.get('p')
      return `url:${url.pathname}${page ? `?p=${page}` : ''}`
    }
    catch {
      return `url:${link.getAttribute('href')}`
    }
  }

  const title = normalizeEpisodeText(
    episode.getAttribute('title')
    ?? episode.getAttribute('aria-label')
    ?? episode.querySelector<HTMLElement>('[title], .title, .name, .video-name')?.textContent
    ?? episode.textContent,
  )
  return `text:${title || index}`
}

function getEpisodeTitle(episode: HTMLElement, index: number): string {
  const titleElement = episode.querySelector<HTMLElement>(
    '.title, .name, .video-name, .video-pod__item-text, .page-part',
  )
  return normalizeEpisodeText(
    episode.getAttribute('aria-label')
    ?? episode.getAttribute('title')
    ?? titleElement?.getAttribute('title')
    ?? titleElement?.textContent
    ?? episode.textContent,
  ) || `${index + 1}`
}

function getEpisodeEntries(episodes = getVideoEpisodes()): EpisodeEntry[] {
  const keyOccurrences = new Map<string, number>()
  return episodes.map((element, index) => {
    const baseKey = getEpisodeBaseKey(element, index)
    const occurrence = keyOccurrences.get(baseKey) ?? 0
    keyOccurrences.set(baseKey, occurrence + 1)
    return {
      element,
      key: `${baseKey}#${occurrence}`,
      title: getEpisodeTitle(element, index),
    }
  })
}

function orderEpisodeEntries(entries: EpisodeEntry[]): EpisodeEntry[] {
  if (customEpisodeOrder.length === 0)
    return entries

  const orderIndex = new Map(customEpisodeOrder.map((key, index) => [key, index]))
  return [...entries].sort((a, b) => {
    const aIndex = orderIndex.get(a.key)
    const bIndex = orderIndex.get(b.key)
    if (aIndex === undefined && bIndex === undefined)
      return 0
    if (aIndex === undefined)
      return 1
    if (bIndex === undefined)
      return -1
    return aIndex - bIndex
  })
}

function getPlaybackEpisodeEntries(): EpisodeEntry[] {
  return orderEpisodeEntries(getEpisodeEntries())
}

// 获取当前选集索引
export function getCurrentEpisodeIndex(episodes: HTMLElement[]): number {
  const activeStateSelector = [
    '.video-pod__item.active',
    '.simple-base-item.active',
    '.multip-list-item-active',
    '.page-item.active',
    '.list-item.active',
    '.episode-item.active',
    '.section-item.active',
    '.collect-item.active',
    '[aria-current="true"]',
    '[aria-selected="true"]',
    '[data-active="true"]',
  ].join(', ')
  const activeIndex = episodes.findIndex((episode) => {
    return episode.classList.contains('active')
      || episode.classList.contains('current')
      || episode.classList.contains('on')
      || episode.classList.contains('multip-list-item-active')
      || episode.matches(activeStateSelector)
      || episode.querySelector(activeStateSelector) !== null
  })
  if (activeIndex >= 0)
    return activeIndex

  const currentUrl = new URL(location.href)
  const currentPath = currentUrl.pathname.replace(/\/$/, '')
  const currentPage = currentUrl.searchParams.get('p') ?? '1'
  const urlIndex = episodes.findIndex((episode) => {
    const link = getEpisodeLink(episode)
    if (!link?.href)
      return false
    try {
      const episodeUrl = new URL(link.href, location.href)
      return episodeUrl.pathname.replace(/\/$/, '') === currentPath
        && (episodeUrl.searchParams.get('p') ?? '1') === currentPage
    }
    catch {
      return false
    }
  })
  return urlIndex >= 0 ? urlIndex : 0
}

// 获取随机下一集
export function getRandomNextEpisode(episodes: HTMLElement[], currentIndex: number): number {
  console.log('[BewlyCat Random Play] getRandomNextEpisode called, currentIndex:', currentIndex, 'visitedEpisodes:', Array.from(visitedEpisodes))

  if (episodes.length <= 1)
    return currentIndex

  const episodeKeys = getEpisodeEntries(episodes).map(entry => entry.key)
  const currentKey = episodeKeys[currentIndex]
  if (currentKey)
    visitedEpisodes.add(currentKey)

  // 如果所有视频都已访问，重置访问记录
  if (visitedEpisodes.size >= episodes.length) {
    console.log('[BewlyCat Random Play] All episodes visited, resetting')
    visitedEpisodes.clear()
    if (currentKey)
      visitedEpisodes.add(currentKey)
  }

  // 获取未访问的视频索引
  const unvisitedIndices = episodes
    .map((_, index) => index)
    .filter(index => !visitedEpisodes.has(episodeKeys[index]))

  console.log('[BewlyCat Random Play] Unvisited indices:', unvisitedIndices)

  if (unvisitedIndices.length === 0) {
    console.log('[BewlyCat Random Play] No unvisited indices, selecting random excluding current')
    // 如果没有未访问的视频，随机选择一个不是当前视频的
    const availableIndices = episodes
      .map((_, index) => index)
      .filter(index => index !== currentIndex)

    if (availableIndices.length === 0) {
      console.log('[BewlyCat Random Play] No available indices')
      return currentIndex
    }
    const selected = availableIndices[Math.floor(Math.random() * availableIndices.length)]
    console.log('[BewlyCat Random Play] Selected from available:', selected)
    return selected
  }

  const selected = unvisitedIndices[Math.floor(Math.random() * unvisitedIndices.length)]
  console.log('[BewlyCat Random Play] Selected from unvisited:', selected)
  return selected
}

export function getNextEpisodeIndex(
  episodes: HTMLElement[],
  currentIndex: number,
  order: RandomPlayOrder,
): number {
  if (episodes.length <= 1)
    return currentIndex

  if (order === 'sequential')
    return (currentIndex + 1) % episodes.length
  if (order === 'reverse')
    return (currentIndex - 1 + episodes.length) % episodes.length
  return getRandomNextEpisode(episodes, currentIndex)
}

// 跳转到指定选集
export function jumpToEpisode(episodes: HTMLElement[], targetIndex: number): void {
  if (targetIndex < 0 || targetIndex >= episodes.length) {
    return
  }

  const targetEpisode = episodes[targetIndex]
  const targetKey = getEpisodeEntries(episodes)[targetIndex]?.key
  console.log('[BewlyCat Random Play] Target episode element:', targetEpisode)

  // 尝试多种方式找到可点击的元素
  let clickableElement: HTMLElement | null = null

  // 1. 优先查找链接
  const link = targetEpisode.matches('a[href]')
    ? targetEpisode as HTMLAnchorElement
    : targetEpisode.querySelector<HTMLAnchorElement>('a[href]')
  console.log('[BewlyCat Random Play] Found link:', link, 'href:', link?.href)

  if (link && link.href) {
    clickableElement = link
  }
  else {
    // 2. 查找 .simple-base-item 元素（B站新版播放列表项）
    const simpleBaseItem = targetEpisode.querySelector('.simple-base-item') as HTMLElement
    console.log('[BewlyCat Random Play] Found .simple-base-item:', simpleBaseItem)

    if (simpleBaseItem) {
      clickableElement = simpleBaseItem
    }
    else {
      // 3. 查找其他可能的可点击元素
      const baseItem = targetEpisode.querySelector('.base-item, .item, .video-item') as HTMLElement
      if (baseItem) {
        clickableElement = baseItem
      }
      else {
        // 4. 回退到父元素
        clickableElement = targetEpisode
      }
    }
  }

  if (!clickableElement) {
    console.log('[BewlyCat Random Play] No clickable element found')
    return
  }

  console.log('[BewlyCat Random Play] Clickable element:', clickableElement)

  // 使用更智能的点击策略
  const performClick = () => {
    try {
      console.log('[BewlyCat Random Play] Attempting to click element:', targetIndex, clickableElement)

      // 标记为已访问（在点击前标记，防止点击失败后重复尝试）
      if (targetKey)
        visitedEpisodes.add(targetKey)

      // 如果是链接，尝试点击
      if (clickableElement instanceof HTMLAnchorElement && clickableElement.href) {
        console.log('[BewlyCat Random Play] Clicking anchor element, href:', clickableElement.href)
        clickableElement.click()
        return
      }

      // 对于没有链接的元素（如 video-pod__item），只触发一次点击。
      // 重复派发 click 会让 B 站 Vue 路由执行两次卸载流程。
      console.log('[BewlyCat Random Play] Clicking episode element')
      clickableElement!.click()
    }
    catch (error) {
      console.error('[BewlyCat Random Play] Click failed:', error)
    }
  }

  // 直接执行点击，不需要滚动
  // B站点击后会自动处理页面滚动和视频加载
  performClick()
}

function createEditIcon(): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(namespace, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(namespace, 'path')
  path.setAttribute('fill', 'currentColor')
  path.setAttribute('d', 'M4 16.5V20h3.5L17.8 9.7l-3.5-3.5L4 16.5Zm16.7-9.6a1 1 0 0 0 0-1.4l-2.2-2.2a1 1 0 0 0-1.4 0l-1.7 1.7 3.5 3.5 1.8-1.6Z')
  svg.appendChild(path)
  return svg
}

function ensurePlaylistEditorStyle(): void {
  if (playlistEditorStyle?.isConnected)
    return

  playlistEditorStyle = document.createElement('style')
  playlistEditorStyle.textContent = `
    .bewly-random-play-order-parent {
      display: flex !important;
      flex-direction: column !important;
    }
    .bewly-random-play-editing-item {
      position: relative !important;
      cursor: grab !important;
      user-select: none !important;
      outline: 1px dashed var(--bew-theme-color, #00aeec) !important;
      outline-offset: -1px !important;
    }
    .bewly-random-play-editing-item:active {
      cursor: grabbing !important;
    }
    .bewly-random-play-dragging-item {
      opacity: 0.45 !important;
    }
    .random-play-edit-btn.is-editing {
      color: #fff !important;
      background: var(--bew-theme-color, #00aeec) !important;
    }
  `
  document.head.appendChild(playlistEditorStyle)
}

function applyCustomEpisodeVisualOrder(): void {
  if (customEpisodeOrder.length === 0)
    return

  const entries = orderEpisodeEntries(getEpisodeEntries())
  const parents = new Set(entries.map(entry => entry.element.parentElement).filter((parent): parent is HTMLElement => Boolean(parent)))
  for (const parent of parents) {
    const display = getComputedStyle(parent).display
    if (display !== 'flex' && display !== 'inline-flex' && display !== 'grid' && display !== 'inline-grid') {
      parent.classList.add('bewly-random-play-order-parent')
      visuallyOrderedParents.add(parent)
    }
  }

  entries.forEach((entry, index) => {
    if (!originalEpisodeOrders.has(entry.element)) {
      originalEpisodeOrders.set(entry.element, {
        value: entry.element.style.getPropertyValue('order'),
        priority: entry.element.style.getPropertyPriority('order'),
      })
    }
    entry.element.style.setProperty('order', String(index), 'important')
  })
}

function clearCustomEpisodeVisualOrder(): void {
  for (const [element, originalOrder] of originalEpisodeOrders) {
    if (originalOrder.value)
      element.style.setProperty('order', originalOrder.value, originalOrder.priority)
    else
      element.style.removeProperty('order')
  }
  originalEpisodeOrders.clear()
  for (const parent of visuallyOrderedParents)
    parent.classList.remove('bewly-random-play-order-parent')
  visuallyOrderedParents.clear()
}

function updatePlaylistEditorButton(editing: boolean): void {
  if (!playlistEditorButton)
    return
  playlistEditorButton.classList.toggle('is-editing', editing)
  playlistEditorButton.title = editing
    ? t('settings.random_play_finish_editing')
    : t('settings.random_play_edit_playlist')
  playlistEditorButton.setAttribute('aria-label', playlistEditorButton.title)
  playlistEditorButton.setAttribute('aria-pressed', String(editing))
}

function stopNativePlaylistEditing(): void {
  playlistEditorController?.abort()
  playlistEditorController = null
  for (const [element, draggable] of originalEpisodeDraggable) {
    element.draggable = draggable
    element.classList.remove('bewly-random-play-editing-item', 'bewly-random-play-dragging-item')
  }
  originalEpisodeDraggable.clear()
  updatePlaylistEditorButton(false)
}

function reorderNativePlaylistItem(sourceKey: string, targetKey: string, insertAfter: boolean): void {
  const orderedKeys = getPlaybackEpisodeEntries().map(entry => entry.key)
  const sourceIndex = orderedKeys.indexOf(sourceKey)
  const targetIndex = orderedKeys.indexOf(targetKey)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex)
    return

  orderedKeys.splice(sourceIndex, 1)
  const adjustedTargetIndex = orderedKeys.indexOf(targetKey)
  orderedKeys.splice(adjustedTargetIndex + (insertAfter ? 1 : 0), 0, sourceKey)
  customEpisodeOrder = orderedKeys
  visitedEpisodes.clear()
  applyCustomEpisodeVisualOrder()
}

function startNativePlaylistEditing(button: HTMLButtonElement): void {
  stopNativePlaylistEditing()
  const entries = getPlaybackEpisodeEntries()
  if (entries.length <= 1) {
    button.title = t('settings.random_play_edit_playlist_empty')
    return
  }

  ensurePlaylistEditorStyle()
  playlistEditorButton = button
  playlistEditorController = new AbortController()
  const { signal } = playlistEditorController
  let draggedKey = ''
  let draggedParent: HTMLElement | null = null

  applyCustomEpisodeVisualOrder()
  for (const entry of entries) {
    const { element, key } = entry
    originalEpisodeDraggable.set(element, element.draggable)
    element.draggable = true
    element.classList.add('bewly-random-play-editing-item')
    element.addEventListener('dragstart', (event) => {
      draggedKey = key
      draggedParent = element.parentElement
      element.classList.add('bewly-random-play-dragging-item')
      event.dataTransfer?.setData('text/plain', key)
      if (event.dataTransfer)
        event.dataTransfer.effectAllowed = 'move'
    }, { signal })
    element.addEventListener('dragover', (event) => {
      if (!draggedKey || draggedKey === key || element.parentElement !== draggedParent)
        return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const insertAfter = event.clientY > rect.top + rect.height / 2
      reorderNativePlaylistItem(draggedKey, key, insertAfter)
    }, { signal })
    element.addEventListener('drop', event => event.preventDefault(), { signal })
    element.addEventListener('dragend', () => {
      draggedKey = ''
      draggedParent = null
      element.classList.remove('bewly-random-play-dragging-item')
    }, { signal })
    element.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }, { capture: true, signal })
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape')
      stopNativePlaylistEditing()
  }, { signal })
  updatePlaylistEditorButton(true)
}

function toggleNativePlaylistEditing(button: HTMLButtonElement): void {
  if (playlistEditorController)
    stopNativePlaylistEditing()
  else
    startNativePlaylistEditing(button)
}

// 创建随机播放UI
export function createRandomPlayUI(): HTMLElement | null {
  // 查找自动连播按钮的容器
  const autoPlayContainer = findPlaylistAutoPlayContainer()
  if (!autoPlayContainer)
    return null

  // 检查是否已存在随机播放按钮
  const existingRandomPlay = document.querySelector<HTMLElement>('.random-play')
  if (existingRandomPlay) {
    if (existingRandomPlay.closest(recommendationRootSelector))
      existingRandomPlay.remove()
    else
      return null
  }

  // 创建播放顺序控件容器
  const randomPlayContainer = document.createElement('div')
  randomPlayContainer.className = 'random-play'
  randomPlayContainer.style.cssText = `
    margin-left: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  `

  // 创建播放顺序选择与开关
  const randomPlayBtn = document.createElement('div')
  randomPlayBtn.className = 'random-play-btn'
  randomPlayBtn.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: var(--text3, #9499a0);
    user-select: none;
  `

  const orderSelect = document.createElement('select')
  orderSelect.className = 'random-play-order-select'
  orderSelect.setAttribute('aria-label', getRandomPlayText())
  orderSelect.title = getRandomPlayText()
  orderSelect.style.cssText = `
    width: 96px;
    height: 26px;
    padding: 0 24px 0 8px;
    cursor: pointer;
    color: var(--text2, #61666d);
    background: var(--bg2, #f6f7f8);
    border: 1px solid var(--line_regular, #e3e5e7);
    border-radius: 6px;
    font: inherit;
    outline: none;
  `
  const orderOptions: Array<{ label: string, value: RandomPlayOrder }> = [
    { label: t('settings.random_play_order_sequential'), value: 'sequential' },
    { label: t('settings.random_play_order_reverse'), value: 'reverse' },
    { label: t('settings.random_play_order_random'), value: 'random' },
  ]
  for (const option of orderOptions) {
    const optionElement = document.createElement('option')
    optionElement.value = option.value
    optionElement.textContent = option.label
    orderSelect.appendChild(optionElement)
  }
  activePlayOrder ??= getEffectiveCustomPlayOrder() ?? 'sequential'
  orderSelect.value = activePlayOrder

  // 创建开关
  const switchBtn = document.createElement('button')
  switchBtn.type = 'button'
  switchBtn.className = 'switch-btn'
  switchBtn.setAttribute('role', 'switch')
  switchBtn.style.cssText = `
    position: relative;
    flex: none;
    width: 30px;
    height: 20px;
    padding: 0;
    background: var(--bew-switch-bg);
    border: 0;
    border-radius: 10px;
    transition: background-color 0.3s;
    cursor: pointer;
  `

  const switchBlock = document.createElement('div')
  switchBlock.className = 'switch-block'
  switchBlock.style.cssText = `
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    transition: transform 0.3s;
  `

  switchBtn.appendChild(switchBlock)
  randomPlayBtn.appendChild(orderSelect)
  randomPlayBtn.appendChild(switchBtn)
  randomPlayContainer.appendChild(randomPlayBtn)

  const editButton = document.createElement('button')
  editButton.type = 'button'
  editButton.className = 'random-play-edit-btn'
  editButton.title = t('settings.random_play_edit_playlist')
  editButton.setAttribute('aria-label', t('settings.random_play_edit_playlist'))
  editButton.style.cssText = `
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    padding: 0;
    cursor: pointer;
    color: var(--text3, #9499a0);
    background: transparent;
    border: 0;
    border-radius: 6px;
  `
  editButton.appendChild(createEditIcon())
  randomPlayContainer.appendChild(editButton)

  // 更新开关状态的函数
  function updateSwitchState(enabled: boolean) {
    switchBtn.setAttribute('aria-checked', String(enabled))
    switchBtn.title = enabled
      ? t('settings.random_play_enabled')
      : t('settings.random_play_disabled')
    if (enabled) {
      switchBtn.style.backgroundColor = 'var(--bew-theme-color)'
      // 30px宽度 - 2px左边距 - 2px右边距 - 16px滑块宽度 = 10px移动距离
      switchBlock.style.transform = 'translateX(10px)'
    }
    else {
      switchBtn.style.backgroundColor = 'var(--bew-switch-bg)'
      switchBlock.style.transform = 'translateX(0)'
    }
  }

  orderSelect.addEventListener('change', () => {
    activePlayOrder = orderSelect.value as RandomPlayOrder
    visitedEpisodes.clear()
    // 播放器内的主动选择立即生效；自动启用规则只用于按视频类型配置的随机播放。
    setRandomPlayEnabled(true)
    userManuallySetRandomPlay = true
    syncRandomPlayUI()
  })

  switchBtn.addEventListener('click', () => {
    const newEnabled = !isRandomPlayEnabled
    setRandomPlayEnabled(newEnabled)
    updateSwitchState(newEnabled)
    // 标记为用户手动设置
    userManuallySetRandomPlay = true
  })
  editButton.addEventListener('click', () => toggleNativePlaylistEditing(editButton))

  // 初始状态 - 使用当前状态
  updateSwitchState(isRandomPlayEnabled)

  // 插入到自动连播按钮旁边
  const rightContainer = autoPlayContainer.parentElement
  if (rightContainer) {
    rightContainer.appendChild(randomPlayContainer)
  }

  return randomPlayContainer
}

// 启用随机播放
export function enableRandomPlay(): void {
  // 使用更可靠的方式监听视频结束
  const setupVideoListener = () => {
    if (!isRandomPlayEnabled)
      return

    const video = document.querySelector<HTMLVideoElement>('video')
    if (!video) {
      // 如果找不到视频，稍后重试
      setTimeout(setupVideoListener, 1000)
      return
    }

    // 移除之前的监听器
    if (listenerVideo && originalEndedListener) {
      listenerVideo.removeEventListener('ended', originalEndedListener, true)
      originalEndedListener = null
    }
    if (listenerVideo && originalPauseListener) {
      listenerVideo.removeEventListener('pause', originalPauseListener)
      originalPauseListener = null
    }
    listenerVideo?.removeAttribute('data-bewly-random-play-listener')
    listenerVideo = video

    // 标记视频元素，防止重复添加监听器
    video.setAttribute('data-bewly-random-play-listener', 'true')

    // 用于防止重复触发
    let isProcessing = false

    // 创建新的随机播放监听器
    const randomPlayListener = () => {
      console.log('[BewlyCat Random Play] Video ended, random play listener triggered')

      // 防止重复触发（ended 和 pause 事件可能都会触发）
      if (isProcessing) {
        console.log('[BewlyCat Random Play] Already processing, skipping')
        return
      }

      // 关键：检查随机播放是否仍然启用
      if (!isRandomPlayEnabled) {
        console.log('[BewlyCat Random Play] Random play disabled, skipping')
        return
      }

      isProcessing = true

      // 在捕获阶段立即接管切集，避免被 B 站原生连播按 DOM 顺序抢先跳转。
      const episodes = getPlaybackEpisodeEntries().map(entry => entry.element)
      console.log('[BewlyCat Random Play] Found episodes:', episodes.length)

      if (episodes.length <= 1) {
        console.log('[BewlyCat Random Play] Not enough episodes')
        isProcessing = false
        return
      }

      const currentIndex = getCurrentEpisodeIndex(episodes)
      console.log('[BewlyCat Random Play] Current episode index:', currentIndex)

      const playOrder = getActivePlayOrder()
      const nextIndex = getNextEpisodeIndex(episodes, currentIndex, playOrder)
      console.log('[BewlyCat Random Play] Next episode index:', nextIndex, 'order:', playOrder)

      if (nextIndex !== currentIndex) {
        jumpToEpisode(episodes, nextIndex)
      }
      else {
        console.log('[BewlyCat Random Play] Next index same as current, not jumping')
      }
      setTimeout(() => {
        isProcessing = false
      }, 1500)
    }

    // 监听多个事件以确保兼容性
    video.addEventListener('ended', randomPlayListener, true)
    // 有些情况下pause事件可能更可靠
    const randomPlayPauseListener = () => {
      // 检查是否是播放结束（当前时间和总时间相近）
      if (video.currentTime > 0 && video.duration > 0 && (video.duration - video.currentTime) < 1) {
        randomPlayListener()
      }
    }
    video.addEventListener('pause', randomPlayPauseListener)

    originalEndedListener = randomPlayListener
    originalPauseListener = randomPlayPauseListener
  }

  // 立即尝试设置监听器
  setupVideoListener()

  // 监听DOM变化，如果视频元素被替换，重新设置监听器
  videoObserver?.disconnect()
  videoObserver = new MutationObserver(() => {
    const video = document.querySelector('video')
    if (video && !video.hasAttribute('data-bewly-random-play-listener')) {
      setupVideoListener()
    }
  })

  videoObserver.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

// 禁用随机播放
export function disableRandomPlay(): void {
  if (listenerVideo && originalEndedListener)
    listenerVideo.removeEventListener('ended', originalEndedListener, true)
  if (listenerVideo && originalPauseListener)
    listenerVideo.removeEventListener('pause', originalPauseListener)
  originalEndedListener = null
  originalPauseListener = null

  // 移除标记，以便下次可以重新添加
  listenerVideo?.removeAttribute('data-bewly-random-play-listener')
  listenerVideo = null
  videoObserver?.disconnect()
  videoObserver = null

  // 清空访问记录
  visitedEpisodes.clear()
}

// 设置随机播放状态
export function setRandomPlayEnabled(enabled: boolean): void {
  isRandomPlayEnabled = enabled
  if (enabled) {
    disableNativeEndPlaybackBehavior()
    enableRandomPlay()
  }
  else {
    disableRandomPlay()
    applyAutoPlayByVideoType()
  }
}

// 获取随机播放状态
export function isRandomPlayActive(): boolean {
  return isRandomPlayEnabled
}

export function applyRandomPlayActivationSettings(): void {
  if (!isCustomPlayPage())
    return

  userManuallySetRandomPlay = false
  if (!settings.value.enableRandomPlay) {
    activePlayOrder = 'sequential'
    setRandomPlayEnabled(false)
    syncRandomPlayUI()
    return
  }

  const effectiveOrder = getEffectiveCustomPlayOrder()
  if (effectiveOrder) {
    activePlayOrder = effectiveOrder
    if (effectiveOrder === 'random') {
      if (settings.value.randomPlayMode === 'auto') {
        const minVideos = Number(settings.value.minVideosForRandom) || 1
        setRandomPlayEnabled(getVideoEpisodes().length >= minVideos)
      }
      else {
        setRandomPlayEnabled(false)
      }
    }
    else {
      setRandomPlayEnabled(false)
    }
  }
  else {
    activePlayOrder = 'sequential'
    setRandomPlayEnabled(false)
  }
  syncRandomPlayUI()
}

// 重置初始化状态
export function resetRandomPlayInitialization(): void {
  stopNativePlaylistEditing()
  isRandomPlayInitialized = false
  // 注意：这里不清除isRandomPlayEnabled，保持用户的选择
  // 也不清除userManuallySetRandomPlay标志，保持用户手动设置的状态
  visitedEpisodes.clear()
}

export function destroyRandomPlay(): void {
  stopNativePlaylistEditing()
  setRandomPlayEnabled(false)
  isRandomPlayInitialized = false
  userManuallySetRandomPlay = false
  visitedEpisodes.clear()
  customEpisodeOrder = []
  activePlayOrder = null
  clearCustomEpisodeVisualOrder()
  playlistEditorButton = null
  playlistEditorStyle?.remove()
  playlistEditorStyle = null
  document.querySelector('.random-play')?.remove()
}

// 同步UI状态（当UI重新创建时调用）
export function syncRandomPlayOrder(): void {
  visitedEpisodes.clear()
  activePlayOrder = getEffectiveCustomPlayOrder() ?? 'sequential'
  const existingSelect = document.querySelector<HTMLSelectElement>('.random-play-order-select')
  if (existingSelect)
    existingSelect.value = activePlayOrder
}

export function syncRandomPlayUI(): void {
  const existingBtn = document.querySelector('.random-play-btn .switch-btn') as HTMLElement
  const existingBlock = document.querySelector('.random-play-btn .switch-block') as HTMLElement
  const existingSelect = document.querySelector<HTMLSelectElement>('.random-play-order-select')
  if (existingSelect)
    existingSelect.value = getActivePlayOrder()

  if (existingBtn && existingBlock) {
    existingBtn.setAttribute('aria-checked', String(isRandomPlayEnabled))
    existingBtn.setAttribute(
      'title',
      t(isRandomPlayEnabled ? 'settings.random_play_enabled' : 'settings.random_play_disabled'),
    )
    if (isRandomPlayEnabled) {
      existingBtn.style.backgroundColor = 'var(--bew-theme-color)'
      existingBlock.style.transform = 'translateX(10px)'
    }
    else {
      existingBtn.style.backgroundColor = 'var(--bew-switch-bg)'
      existingBlock.style.transform = 'translateX(0)'
    }
  }
}

// 在视频页面初始化随机播放
export function initRandomPlayOnVideoPage(): void {
  if (!isCustomPlayPage() || isRandomPlayInitialized)
    return

  // 等待页面元素加载
  const checkAndInit = () => {
    const autoPlayContainer = findPlaylistAutoPlayContainer()
    if (autoPlayContainer) {
      // 只要启用了随机播放功能就创建UI（基于扩展设置）
      if (settings.value.enableRandomPlay) {
        createRandomPlayUI()

        // 如果用户手动设置过随机播放状态，直接应用该状态
        if (userManuallySetRandomPlay) {
          // 保持用户手动设置的状态，无需重新设置
          syncRandomPlayUI()
        }
        else {
          // 随机播放选择自动启用时由数量阈值决定；其余情况使用默认开关。
          applyRandomPlayActivationSettings()
        }

        isRandomPlayInitialized = true
      }
    }
    else {
      // 如果元素还没有加载，继续等待
      setTimeout(checkAndInit, 100)
    }
  }

  // 延迟初始化，确保页面完全加载
  setTimeout(checkAndInit, 500)
}

// 监听页面变化
export function observeRandomPlayPageChanges(): void {
  if (isPageObserverInitialized)
    return
  isPageObserverInitialized = true

  let lastUrl = window.location.href
  let urlChangeTimeout: number | null = null

  // 监听URL变化 - 使用防抖和延迟处理
  const checkUrlChange = () => {
    // 清除之前的定时器
    if (urlChangeTimeout) {
      clearTimeout(urlChangeTimeout)
    }

    // 延迟处理，让B站的路由系统先完成处理
    urlChangeTimeout = window.setTimeout(() => {
      const currentUrl = window.location.href
      if (currentUrl !== lastUrl) {
        // 检查是否只是hash变化或查询参数变化
        const currentPath = currentUrl.split('?')[0].split('#')[0]
        const lastPath = lastUrl.split('?')[0].split('#')[0]

        // 只有路径真正变化时才重新初始化
        if (currentPath !== lastPath) {
          lastUrl = currentUrl
          resetRandomPlayInitialization()

          // 进一步延迟初始化，确保B站页面完全加载
          setTimeout(() => {
            if (isCustomPlayPage()) {
              initRandomPlayOnVideoPage()
            }
          }, 1500) // 增加到1.5秒
        }
        else {
          // 只是参数或hash变化，更新URL记录但不重新初始化
          lastUrl = currentUrl
        }
      }
    }, 500) // 500ms防抖延迟
  }

  // 监听pushstate事件 - 使用捕获阶段避免冲突
  window.addEventListener('pushstate', checkUrlChange, true)

  // 监听popstate事件 - 使用捕获阶段避免冲突
  window.addEventListener('popstate', checkUrlChange, true)

  // 使用MutationObserver监听DOM变化
  let domChangeTimeout: number | null = null
  const observer = new MutationObserver((mutations) => {
    if (!isCustomPlayPage())
      return

    // 使用防抖避免频繁触发
    if (domChangeTimeout) {
      clearTimeout(domChangeTimeout)
    }

    domChangeTimeout = window.setTimeout(() => {
      if (customEpisodeOrder.length > 0)
        applyCustomEpisodeVisualOrder()

      // 检查是否需要重新初始化
      if (!isRandomPlayInitialized) {
        initRandomPlayOnVideoPage()
        return
      }

      // 检查随机播放按钮是否还存在
      const existingBtn = document.querySelector('.random-play-btn')
      const autoPlayContainer = findPlaylistAutoPlayContainer()
      const existingRandomPlay = document.querySelector<HTMLElement>('.random-play')
      const isMisplacedRandomPlay = !!existingRandomPlay?.closest(recommendationRootSelector)

      // 如果按钮不存在但应该存在（有自动播放容器且启用了功能），则重新创建
      if ((!existingBtn || isMisplacedRandomPlay) && autoPlayContainer && settings.value.enableRandomPlay) {
        // 检查是否是因为DOM重新渲染导致的
        let shouldRecreate = false

        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            // 只检查特定的DOM变化，减少误判
            const removedNodes = Array.from(mutation.removedNodes)
            const addedNodes = Array.from(mutation.addedNodes)

            // 更精确的检查：只关注直接相关的DOM变化
            const hasAutoPlayRemoved = removedNodes.some(node =>
              node.nodeType === Node.ELEMENT_NODE
              && ((node as Element).classList?.contains('auto-play')
                || (node as Element).classList?.contains('continuous-btn')
                || (node as Element).classList?.contains('random-play-btn')
                || (node as Element).querySelector?.('.auto-play, .continuous-btn') !== null),
            )

            const hasAutoPlayAdded = addedNodes.some(node =>
              node.nodeType === Node.ELEMENT_NODE
              && ((node as Element).classList?.contains('auto-play')
                || (node as Element).classList?.contains('continuous-btn')),
            )

            if (hasAutoPlayRemoved || hasAutoPlayAdded) {
              shouldRecreate = true
              break
            }
          }
        }

        if (shouldRecreate) {
          // 增加延迟，避免与Bilibili的DOM更新冲突
          setTimeout(() => {
            createRandomPlayUI()

            // UI创建函数内部会自动同步状态，这里不需要额外处理
          }, 500) // 增加延迟到500ms
        }
      }
    }, 300) // 300ms防抖延迟
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

// 初始化随机播放功能
export function initRandomPlay(): void {
  if (isCustomPlayPage()) {
    initRandomPlayOnVideoPage()
  }

  observeRandomPlayPageChanges()
}

// 判断是否是视频页面
export function isCustomPlayPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/(?:video|list)\/.*/.test(window.location.href)
}
