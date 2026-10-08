import type { Settings } from '~/logic/storage'
import type { VideoInfo } from '~/models/video/videoInfo'
import { createListenVideoMode } from '~/utils/listenVideoMode'

import listenVideoStyles from './listenVideo.css?raw'

export interface ListenVideoHost {
  getSettings: () => Pick<Settings, 'enableListenVideo' | 'showListenVideoButton' | 'language'>
  translate: (key: string) => string
  getVideoInfo: (bvid: string) => Promise<VideoInfo>
  isPlaybackPage: () => boolean
  schedulePlayerControlFit: (control: HTMLElement) => void
}

export interface ListenVideoController {
  toggle: () => void
  refresh: () => void
  dispose: () => void
}

const PLAYER_CONTROL_BAR_SELECTOR = '.bpx-player-control-bottom-right'
const BUTTON_CLASS = 'bewly-listen-video-control'
const TOOLTIP_CLASS = 'bewly-player-tooltip'
const VIDEO_AREA_SELECTOR = '.bpx-player-video-area, .bilibili-player-video-wrap, .squirtle-video-wrap'

const listenIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" style="width: 100%; height: 100%;">
  <path d="M44 14C28.5 14 18 25.5 18 42v6h13v-6c0-9.5 5-15 13-15s13 5.5 13 15v6h13v-6c0-16.5-10.5-28-26-28Z" fill="currentColor"/>
  <rect x="14" y="46" width="20" height="28" rx="9" fill="currentColor"/>
  <rect x="54" y="46" width="20" height="28" rx="9" fill="currentColor"/>
</svg>`

export function initListenVideoControl(host: ListenVideoHost): ListenVideoController {
  let controlContainer: HTMLElement | null = null
  let disposed = false
  let syncQueued = false
  let discoveryTimer: ReturnType<typeof setTimeout> | undefined
  let metadataTimer: ReturnType<typeof setTimeout> | undefined
  let discoveryDeadline = 0
  let observedRoot: HTMLElement | null = null
  let observedArea: HTMLElement | null = null
  const mode = createListenVideoMode(host, () => {
    updateControlState()
    scheduleSync()
  })
  const style = document.createElement('style')
  style.dataset.bewlyListenVideo = ''
  style.textContent = listenVideoStyles
  document.documentElement.appendChild(style)

  function getButtonLabel() {
    return host.translate(mode.isActive() ? 'player_listen.exit' : 'player_listen.enter')
  }

  function updateControlState(button = controlContainer) {
    if (!button)
      return
    const label = getButtonLabel()
    const active = mode.isActive()
    if (button.getAttribute('aria-label') === label && button.classList.contains('bpx-state-entered') === active)
      return
    button.setAttribute('aria-label', label)
    button.setAttribute('aria-pressed', String(active))
    const tooltip = button.querySelector<HTMLElement>(`.${TOOLTIP_CLASS}`)
    if (tooltip)
      tooltip.textContent = label
    button.classList.toggle('bpx-state-entered', active)
  }

  function createControlContainer(): HTMLElement {
    const label = getButtonLabel()
    const container = document.createElement('div')
    container.className = `bpx-player-ctrl-btn ${BUTTON_CLASS}`
    container.setAttribute('role', 'button')
    container.setAttribute('aria-label', label)
    container.setAttribute('aria-pressed', String(mode.isActive()))
    container.setAttribute('tabindex', '0')

    const tooltip = document.createElement('span')
    tooltip.className = TOOLTIP_CLASS
    tooltip.setAttribute('role', 'tooltip')
    tooltip.textContent = label

    const icon = document.createElement('div')
    icon.className = 'bpx-player-ctrl-btn-icon bewly-listen-video-icon'

    const iconWrapper = document.createElement('span')
    iconWrapper.className = 'bpx-common-svg-icon'
    iconWrapper.innerHTML = listenIcon
    icon.appendChild(iconWrapper)
    container.append(icon, tooltip)

    // 鼠标点击不聚焦按钮：否则焦点残留，之后按空格/回车会再次触发切换
    container.addEventListener('mousedown', (event) => {
      event.preventDefault()
    })
    container.addEventListener('click', () => {
      mode.toggle()
      updateControlState(container)
    })
    container.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ')
        return

      event.preventDefault()
      event.stopPropagation()
      if (event.repeat)
        return
      mode.toggle()
      updateControlState(container)
    })

    return container
  }

  function removeControl() {
    const oldControl = controlContainer
    // 移除后重新计算同栏按钮，释放被听视频按钮占用的空间。
    const sibling = oldControl?.parentElement?.querySelector<HTMLElement>('.bewly-video-screenshot-control, .bewly-widescreen-control, .bewly-local-loudness-control')
    oldControl?.remove()
    controlContainer = null
    if (sibling)
      host.schedulePlayerControlFit(sibling)
  }

  function scheduleSync() {
    if (syncQueued || disposed)
      return
    syncQueued = true
    queueMicrotask(() => {
      syncQueued = false
      if (!disposed)
        sync()
    })
  }

  // 图标隐藏与功能生命周期分离，快捷键模式仍观察播放器重建。
  const observer = new MutationObserver(() => {
    const area = document.querySelector(VIDEO_AREA_SELECTOR)
    if (!observedRoot?.isConnected || area !== observedArea
      || (host.getSettings().showListenVideoButton && !controlContainer?.isConnected)
      || (mode.isActive() && !area?.querySelector('.bewly-listen-video-overlay'))
      || mode.needsSync()) {
      if (!observedRoot?.isConnected)
        discoveryDeadline = Date.now() + 15_000
      scheduleSync()
    }
  })

  function observe(root: HTMLElement | null, area: HTMLElement | null) {
    if (root === observedRoot && area === observedArea)
      return
    observer.disconnect()
    observedRoot = root
    observedArea = area
    if (!root)
      return
    observer.observe(root, { childList: true, subtree: true })
    // 监视祖先替换，覆盖整个 playerWrap 被 SPA 换掉的情况。
    let parent = root.parentElement
    while (parent) {
      observer.observe(parent, { childList: true })
      parent = parent.parentElement
    }
  }

  function retryDiscovery() {
    if (discoveryTimer || Date.now() >= discoveryDeadline)
      return
    discoveryTimer = setTimeout(() => {
      discoveryTimer = undefined
      scheduleSync()
    }, 500)
  }

  function sync() {
    if (!host.getSettings().enableListenVideo || !host.isPlaybackPage())
      return
    mode.sync()
    const area = document.querySelector<HTMLElement>(VIDEO_AREA_SELECTOR)
    const bar = document.querySelector<HTMLElement>(PLAYER_CONTROL_BAR_SELECTOR)
    const root = area?.closest<HTMLElement>('#playerWrap, #bilibili-player, #bilibiliPlayer, .bpx-player-container, .bilibili-player')
      ?? area ?? bar?.parentElement ?? null
    observe(root, area)
    if (!area)
      retryDiscovery()
    if (!host.getSettings().showListenVideoButton) {
      removeControl()
      return
    }
    if (controlContainer?.isConnected) {
      updateControlState()
      return
    }
    controlContainer = null
    const anchor = bar?.querySelector<HTMLElement>('.bewly-video-screenshot-control')
      ?? bar?.querySelector<HTMLElement>('.bpx-player-ctrl-volume')
    if (!anchor) {
      retryDiscovery()
      return
    }
    controlContainer = createControlContainer()
    anchor.insertAdjacentElement('afterend', controlContainer)
    updateControlState()
    host.schedulePlayerControlFit(controlContainer)
  }

  function refresh() {
    if (disposed)
      return
    discoveryDeadline = Date.now() + 15_000
    scheduleSync()
    clearTimeout(metadataTimer)
    metadataTimer = setTimeout(() => {
      if (!disposed && host.isPlaybackPage())
        mode.refreshMeta()
    }, 1200)
  }

  function onVisibility() {
    if (document.visibilityState === 'visible')
      refresh()
  }

  function onDanmakuChange() {
    if (mode.needsSync())
      scheduleSync()
  }

  function onPictureInPicture() {
    // 原生画中画窗口不包含页面覆盖层，切入时恢复正常视频。
    if (mode.isActive())
      mode.toggle()
  }

  const events = ['pushstate', 'replacestate', 'popstate', 'hashchange', 'pageshow'] as const
  events.forEach(event => window.addEventListener(event, refresh))
  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('loadedmetadata', refresh, true)
  document.addEventListener('change', onDanmakuChange, true)
  document.addEventListener('enterpictureinpicture', onPictureInPicture, true)
  refresh()
  return {
    toggle: () => {
      if (!disposed)
        mode.toggle()
    },
    refresh,
    dispose: () => {
      disposed = true
      observer.disconnect()
      clearTimeout(discoveryTimer)
      clearTimeout(metadataTimer)
      events.forEach(event => window.removeEventListener(event, refresh))
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('loadedmetadata', refresh, true)
      document.removeEventListener('change', onDanmakuChange, true)
      document.removeEventListener('enterpictureinpicture', onPictureInPicture, true)
      mode.dispose()
      removeControl()
      style.remove()
    },
  }
}
