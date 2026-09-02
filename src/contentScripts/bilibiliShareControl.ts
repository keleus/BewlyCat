import {
  BILIBILI_SHARE_DIALOG_CLOSE,
  BILIBILI_SHARE_DIALOG_OPEN,
} from '~/constants/globalEvents'
import { settings } from '~/logic'
import type {
  ShareOutputPolicy,
  VideoShareSession,
} from '~/utils/bilibiliShare'
import {
  createShareSession,
  extractBvid,
  findActivePlayer,
  findNativeShareEntry,
  isCurrentVideoPageReady,
  isNativeShareEntryEnabled,
  isSupportedVideoPage,
} from '~/utils/bilibiliShare'
import { cleanBilibiliShareText, cleanBilibiliUrl } from '~/utils/main'
import emitter from '~/utils/mitt'

export interface BilibiliShareDialogRequest {
  id: number
  session: VideoShareSession
  trigger: HTMLElement
  outputPolicy: ShareOutputPolicy
  nativeFallback: () => boolean
  onClosed: () => void
}

export interface BilibiliShareDialogCloseDetail {
  id: number
}

export interface BilibiliShareDialogOpenEvent {
  request: BilibiliShareDialogRequest
  handled: boolean
}

interface BoundShareEntry {
  element: HTMLElement
  handler: (event: MouseEvent) => void
  routeKey: string
}

function getRouteKey(): string {
  if (!isSupportedVideoPage(location))
    return ''

  // 同一 BVID 的分 P、合集参数和 hash 也可能改变当前内容，必须视为新路由。
  return `${location.pathname}${location.search}${location.hash}`
}

function getRoutePage(routeKey: string): string {
  const queryStart = routeKey.indexOf('?')
  if (queryStart < 0)
    return '1'

  const hashStart = routeKey.indexOf('#', queryStart)
  const query = routeKey.slice(
    queryStart + 1,
    hashStart < 0 ? undefined : hashStart,
  )
  return new URLSearchParams(query).get('p') || '1'
}

function getPlayerSource(player: HTMLVideoElement | null): string {
  return player?.currentSrc || player?.getAttribute('src') || ''
}

function getOutputPolicy(): ShareOutputPolicy {
  return {
    enabled: settings.value.enableCleanShareLink,
    includeTitle: settings.value.cleanShareLinkIncludeTitle,
    removeTrackingParams: settings.value.cleanShareLinkRemoveTrackingParams,
    cleanUrl: cleanBilibiliUrl,
    cleanText: cleanBilibiliShareText,
  }
}

function dispatchClose(id: number): void {
  try {
    emitter.emit(BILIBILI_SHARE_DIALOG_CLOSE, { id })
  }
  catch (error) {
    console.error('[BewlyCat] Bilibili share close notification failed', error)
  }
}

function dispatchOpen(request: BilibiliShareDialogRequest): boolean {
  const event: BilibiliShareDialogOpenEvent = { request, handled: false }
  try {
    // 通过隔离世界内的 mitt 完成握手，避免页面脚本伪造分享会话。
    emitter.emit(BILIBILI_SHARE_DIALOG_OPEN, event)
  }
  catch (error) {
    console.error('[BewlyCat] Bilibili share open notification failed', error)
    return false
  }
  return event.handled
}

export function initBilibiliShareControl(): () => void {
  if (window.top !== window)
    return () => {}

  let stopped = false
  let reconcileTimer: number | undefined
  let observer: MutationObserver | undefined
  let bound: BoundShareEntry | undefined
  let activeRequest:
    | { id: number, entry: HTMLElement, closeRequested: boolean }
    | undefined
  let requestId = 0
  let lastRouteKey = getRouteKey()
  let lastRouteBvid = extractBvid(location.pathname).toLowerCase()
  let mediaReadyVersion = 0
  const mediaReadyEvents = new WeakMap<
    HTMLVideoElement,
    {
      version: number
      routeKey: string
      type: string
      source: string
      sawLoadStart: boolean
      sawMetadata: boolean
    }
  >()
  let routePlayerTransition:
    | {
      routeKey: string
      previousPlayer: HTMLVideoElement | null
      previousSource: string
      previousMediaReadyVersion: number
      requiresMediaChange: boolean
    }
    | undefined

  const beginRouteTransition = (
    routeKey: string,
    routePathname = location.pathname,
  ) => {
    if (
      !routeKey
      || routeKey === lastRouteKey
      || routePlayerTransition?.routeKey === routeKey
    ) {
      return
    }

    const currentPlayer = findActivePlayer(document)
    const currentSource = getPlayerSource(currentPlayer)
    const nextBvid = extractBvid(routePathname).toLowerCase()
    // 所有 routeKey 变化都会清理旧绑定；只有 BVID 或分 P 变化需要新的媒体就绪代际。
    const requiresMediaChange
      = nextBvid !== lastRouteBvid
        || getRoutePage(routeKey) !== getRoutePage(lastRouteKey)

    routePlayerTransition = {
      routeKey,
      previousPlayer: currentPlayer,
      previousSource: currentSource,
      previousMediaReadyVersion: mediaReadyVersion,
      requiresMediaChange,
    }
  }

  const isCurrentVideoReady = () => {
    const bvid = extractBvid(location.pathname)
    if (!bvid || !isCurrentVideoPageReady(document, bvid))
      return false

    if (
      !routePlayerTransition
      || routePlayerTransition.routeKey !== getRouteKey()
    ) {
      return true
    }

    const player = findActivePlayer(document)
    if (!player)
      return false
    const currentSource = getPlayerSource(player)
    if (!routePlayerTransition.requiresMediaChange)
      return true
    const playerReplaced = player !== routePlayerTransition.previousPlayer
    const sourceChanged
      = currentSource !== routePlayerTransition.previousSource
    if (playerReplaced && sourceChanged && player.readyState > 0) {
      return true
    }

    const mediaEvent = mediaReadyEvents.get(player)
    return Boolean(
      mediaEvent
      && mediaEvent.version > routePlayerTransition.previousMediaReadyVersion
      && mediaEvent.routeKey === routePlayerTransition.routeKey
      && mediaEvent.source === currentSource
      && (mediaEvent.type !== 'loadstart' || player.readyState > 0)
      && (mediaEvent.type !== 'durationchange'
        || mediaEvent.sawLoadStart
        || mediaEvent.sawMetadata),
    )
  }

  const removeBoundEntry = () => {
    if (!bound)
      return
    bound.element.removeEventListener('click', bound.handler, true)
    bound = undefined
  }

  const scheduleReconcile = (delay = 80) => {
    if (stopped || reconcileTimer)
      return

    reconcileTimer = window.setTimeout(() => {
      reconcileTimer = undefined
      reconcile()
    }, delay)
  }

  const scheduleReconcileEvent = (event?: Event) => {
    let routeKey = getRouteKey()
    let routePathname = location.pathname
    if (event instanceof CustomEvent && Array.isArray(event.detail)) {
      const targetUrl = event.detail[2]
      if (targetUrl !== null && targetUrl !== undefined) {
        try {
          const nextLocation = new URL(String(targetUrl), location.href)
          if (isSupportedVideoPage(nextLocation)) {
            routeKey = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`
            routePathname = nextLocation.pathname
          }
        }
        catch {
          // 目标 URL 无效时，后续 reconcile 会读取真实 location。
        }
      }
    }
    beginRouteTransition(routeKey, routePathname)
    scheduleReconcile()
  }

  const closeActiveRequest = () => {
    if (!activeRequest || activeRequest.closeRequested)
      return
    activeRequest.closeRequested = true
    dispatchClose(activeRequest.id)
  }

  const markRequestClosed = (id: number) => {
    if (activeRequest?.id !== id)
      return
    activeRequest = undefined
    scheduleReconcile()
  }

  const handlePlayerTransition = (event: Event) => {
    const player
      = event.target instanceof HTMLVideoElement && event.target.isConnected
        ? event.target
        : null
    if (!player)
      return

    const routeKey = getRouteKey()
    const currentSource = getPlayerSource(player)
    const previousMediaEvent = mediaReadyEvents.get(player)
    const sameMedia
      = previousMediaEvent?.routeKey === routeKey
        && previousMediaEvent.source === currentSource
    mediaReadyVersion++
    mediaReadyEvents.set(player, {
      version: mediaReadyVersion,
      routeKey,
      type: event.type,
      source: currentSource,
      sawLoadStart: sameMedia
        ? Boolean(
            previousMediaEvent?.sawLoadStart || event.type === 'loadstart',
          )
        : event.type === 'loadstart',
      sawMetadata: sameMedia
        ? Boolean(
            previousMediaEvent?.sawMetadata || event.type === 'loadedmetadata',
          )
        : event.type === 'loadedmetadata',
    })

    scheduleReconcile()
  }

  const bindEntry = (entry: HTMLElement, routeKey: string) => {
    const handler = (event: MouseEvent) => {
      if (getRouteKey() !== routeKey) {
        scheduleReconcile()
        return
      }

      if (!isCurrentVideoReady()) {
        scheduleReconcile()
        return
      }

      if (!isNativeShareEntryEnabled(entry)) {
        scheduleReconcile()
        return
      }

      if (activeRequest) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }

      const outputPolicy = getOutputPolicy()
      const session = createShareSession(document, location, outputPolicy, {
        requireCurrentPage: true,
      })
      if (!session)
        return

      const id = ++requestId
      const nativeFallback = () => {
        if (
          getRouteKey() !== routeKey
          || !isCurrentVideoReady()
          || !isNativeShareEntryEnabled(entry)
        ) {
          return false
        }

        entry.removeEventListener('click', handler, true)
        try {
          entry.click()
          return true
        }
        catch {
          return false
        }
        finally {
          if (
            !stopped
            && entry.isConnected
            && getRouteKey() === routeKey
            && isNativeShareEntryEnabled(entry)
          ) {
            entry.addEventListener('click', handler, true)
            bound = { element: entry, handler, routeKey }
          }
          else {
            bound = undefined
            scheduleReconcile()
          }
        }
      }

      activeRequest = { id, entry, closeRequested: false }
      const request: BilibiliShareDialogRequest = {
        id,
        session,
        trigger: entry,
        outputPolicy,
        nativeFallback,
        onClosed: () => markRequestClosed(id),
      }
      const handled = dispatchOpen(request)
      if (!handled) {
        activeRequest = undefined
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
    }

    entry.addEventListener('click', handler, true)
    bound = { element: entry, handler, routeKey }
  }

  function reconcile() {
    if (stopped)
      return

    const routeKey = getRouteKey()
    if (routeKey !== lastRouteKey) {
      beginRouteTransition(routeKey)
      const nextBvid = extractBvid(location.pathname).toLowerCase()
      lastRouteBvid = nextBvid
      lastRouteKey = routeKey
      removeBoundEntry()
      closeActiveRequest()
    }

    if (!routeKey) {
      removeBoundEntry()
      closeActiveRequest()
      return
    }

    if (!isCurrentVideoReady()) {
      // SPA 换页期间只保留原生入口，等页面身份信号与 DOM 一起更新。
      removeBoundEntry()
      closeActiveRequest()
      scheduleReconcile(250)
      return
    }

    routePlayerTransition = undefined

    if (activeRequest) {
      if (!activeRequest.entry.isConnected) {
        removeBoundEntry()
        closeActiveRequest()
      }
      else if (!isNativeShareEntryEnabled(activeRequest.entry)) {
        // 原生入口被动态禁用时移除旧监听；弹窗本身仍可继续复制链接。
        removeBoundEntry()
      }
      return
    }

    const entry = findNativeShareEntry(document)
    if (!entry) {
      removeBoundEntry()
      return
    }
    if (bound?.element === entry && bound.routeKey === routeKey)
      return

    removeBoundEntry()
    bindEntry(entry, routeKey)
  }

  function handleClose(detail: BilibiliShareDialogCloseDetail) {
    if (detail && typeof detail.id === 'number')
      markRequestClosed(detail.id)
  }

  const routeEvents = [
    'pushstate',
    'replacestate',
    'popstate',
    'hashchange',
    'pageshow',
  ]
  const playerEvents = ['loadstart', 'loadedmetadata', 'durationchange']
  routeEvents.forEach(eventName =>
    window.addEventListener(eventName, scheduleReconcileEvent, true),
  )
  playerEvents.forEach(eventName =>
    document.addEventListener(eventName, handlePlayerTransition, true),
  )
  emitter.on(BILIBILI_SHARE_DIALOG_CLOSE, handleClose)

  observer = new MutationObserver(() => scheduleReconcileEvent())
  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [
        'class',
        'style',
        'hidden',
        'inert',
        'disabled',
        'aria-hidden',
        'aria-disabled',
      ],
      childList: true,
      subtree: true,
    })
  }

  reconcile()

  return () => {
    if (stopped)
      return
    stopped = true
    if (reconcileTimer)
      clearTimeout(reconcileTimer)
    observer?.disconnect()
    observer = undefined
    routeEvents.forEach(eventName =>
      window.removeEventListener(eventName, scheduleReconcileEvent, true),
    )
    playerEvents.forEach(eventName =>
      document.removeEventListener(eventName, handlePlayerTransition, true),
    )
    emitter.off(BILIBILI_SHARE_DIALOG_CLOSE, handleClose)
    removeBoundEntry()
    closeActiveRequest()
    activeRequest = undefined
  }
}
