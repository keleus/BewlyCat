import processorSource from './localLoudnessProcessor.js?raw'

interface Config {
  enabled: boolean
  target: number
  strength: number
}
interface Edge {
  args: unknown[]
}
interface SourceRecord {
  source: MediaElementAudioSourceNode
  video: HTMLMediaElement
  edges: Edge[]
  connect: AudioNode['connect']
  disconnect: AudioNode['disconnect']
  processor?: AudioWorkletNode
  // 音画同步：DelayNode 延后声音，GainNode 在暂停与跳转时截断延迟线里残留的旧声音。
  delay?: { input: DelayNode; output: GainNode }
  owned: boolean
  ownedAbort?: AbortController
}

interface DocumentPictureInPictureLike {
  readonly window: Window | null
  addEventListener?: (
    type: 'enter',
    listener: (event: Event & { window?: Window }) => void,
    options?: AddEventListenerOptions,
  ) => void
}

const MAX_AUDIO_DELAY_MS = 1000
const VIDEO_SELECTOR = '.bpx-player-video-wrap video, .bilibili-player-video video'

function getDocumentPictureInPicture(): DocumentPictureInPictureLike | undefined {
  return (window as Window & { documentPictureInPicture?: DocumentPictureInPictureLike })
    .documentPictureInPicture
}

function getPipWindow(): Window | undefined {
  try {
    const pipWindow = getDocumentPictureInPicture()?.window
    if (pipWindow && !pipWindow.closed && pipWindow.document) return pipWindow
  } catch {
    /* Ignore closed or inaccessible Document Picture-in-Picture windows. */
  }
  return undefined
}

function getPlayerDocuments(): Document[] {
  const pipDoc = getPipWindow()?.document
  return pipDoc && pipDoc !== document ? [document, pipDoc] : [document]
}

function findPlayerVideo(): HTMLVideoElement | null {
  for (const doc of getPlayerDocuments()) {
    const video = doc.querySelector<HTMLVideoElement>(VIDEO_SELECTOR)
    if (video) return video
  }
  return null
}

function findAllPlayerVideos(): HTMLVideoElement[] {
  const videos: HTMLVideoElement[] = []
  for (const doc of getPlayerDocuments()) {
    videos.push(...Array.from(doc.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR)))
  }
  return videos
}

function findNativeSettingRoot(): Element | null {
  for (const doc of getPlayerDocuments()) {
    const root = doc.querySelector('.bpx-player-ctrl-setting')
    if (root) return root
  }
  return null
}

// 节点搬入 Document Picture-in-Picture 窗口后原型会切到新窗口 realm，不能只用主窗口的 instanceof。
function isElement(node: unknown): node is Element {
  if (!node || typeof node !== 'object') return false
  if (node instanceof Element) return true
  const view = (node as Node).ownerDocument?.defaultView as
    | (Window & typeof globalThis)
    | null
    | undefined
  return Boolean(view?.Element && node instanceof view.Element)
}

function isHtmlElement(node: unknown): node is HTMLElement {
  if (!node || typeof node !== 'object') return false
  if (node instanceof HTMLElement) return true
  const view = (node as Node).ownerDocument?.defaultView as
    | (Window & typeof globalThis)
    | null
    | undefined
  return Boolean(view?.HTMLElement && node instanceof view.HTMLElement)
}

function isMediaElement(node: unknown): node is HTMLMediaElement {
  if (!node || typeof node !== 'object') return false
  if (node instanceof HTMLMediaElement) return true
  const view = (node as Node).ownerDocument?.defaultView as
    | (Window & typeof globalThis)
    | null
    | undefined
  return Boolean(view?.HTMLMediaElement && node instanceof view.HTMLMediaElement)
}

function isVideoElement(node: unknown): node is HTMLVideoElement {
  if (!node || typeof node !== 'object') return false
  if (node instanceof HTMLVideoElement) return true
  const view = (node as Node).ownerDocument?.defaultView as
    | (Window & typeof globalThis)
    | null
    | undefined
  return Boolean(view?.HTMLVideoElement && node instanceof view.HTMLVideoElement)
}

/** Install at document_start, before the native player captures its media element. */
export function createLocalLoudnessController() {
  const lifetime = new AbortController()
  const sources = new WeakMap<HTMLMediaElement, SourceRecord>()
  const modules = new WeakMap<BaseAudioContext, Promise<void>>()
  const ownedConnected = new Set<SourceRecord>()
  const originalCreate = AudioContext.prototype.createMediaElementSource
  let ownedContext: AudioContext | undefined
  let ownedEverCaptured = false
  let active: SourceRecord | undefined
  let abort: AbortController | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let generation = 0
  let pending = false
  let hidden = false
  let disposed = false
  let config: Config = { enabled: false, target: -18, strength: 0.75 }
  // 面板临时关闭时保留设置值，恢复时按设置重新启用。
  let requested = config
  let temporarilyOff = false
  let lastStatus = 'off'
  let lastReport = 0
  let activeMediaKey = ''
  let lastGainSnapshot: { mediaKey: string; gainDb: number } | undefined
  const failed = new WeakSet<HTMLMediaElement>()

  function getMediaKey() {
    const params = new URLSearchParams(location.search)
    return `${location.pathname}|${params.get('p') ?? ''}|${params.get('bvid') ?? ''}|${params.get('oid') ?? ''}`
  }
  // 音画同步跟随设置页的音画同步开关，关闭时不响应延迟请求，也不接管声音。
  let delayEnabled = false
  let delayMs = 0
  let delayed: SourceRecord | undefined
  let delayAbort: AbortController | undefined
  let lastDelayStatus = 'off'

  function status(state: string, details: Record<string, number> = {}) {
    lastStatus = state
    const video = active?.video ?? findPlayerVideo()
    window.postMessage(
      {
        type: 'BEWLY_LOUDNESS_STATUS',
        state,
        ...details,
        url: location.href,
        src: video?.currentSrc ?? '',
      },
      location.origin,
    )
  }

  function rawConnect(record: SourceRecord, from: AudioNode, args: unknown[]) {
    return Reflect.apply(record.connect, from, args)
  }

  function tail(record: SourceRecord): AudioNode {
    return record.delay?.output ?? record.processor ?? record.source
  }

  // Rebuild source → loudness → delay → native destinations, without a second source.
  function rewire(record: SourceRecord) {
    try {
      Reflect.apply(record.disconnect, record.source, [])
    } catch {
      /* The native player may already have closed its context. */
    }
    record.processor?.disconnect()
    record.delay?.output.disconnect()
    let from: AudioNode = record.source
    if (record.processor) {
      rawConnect(record, from, [record.processor])
      from = record.processor
    }
    if (record.delay) {
      rawConnect(record, from, [record.delay.input])
      from = record.delay.output
    }
    for (const edge of record.edges) {
      try {
        rawConnect(record, from, edge.args)
      } catch {
        /* A removed native destination must not prevent rerouting. */
      }
    }
  }

  function capture(source: MediaElementAudioSourceNode, video: HTMLMediaElement, owned: boolean) {
    const record: SourceRecord = {
      source,
      video,
      owned,
      edges: [],
      connect: source.connect,
      disconnect: source.disconnect,
    }
    // Keep routing bookkeeping on the source itself. The weak cache does not retain old videos.
    source.connect = function (...args: unknown[]) {
      const result = rawConnect(record, tail(record), args)
      if (
        !record.edges.some(
          (e) =>
            e.args[0] === args[0] &&
            (e.args[1] ?? 0) === (args[1] ?? 0) &&
            (e.args[2] ?? 0) === (args[2] ?? 0),
        )
      )
        record.edges.push({ args })
      return result
    } as AudioNode['connect']
    source.disconnect = function (...args: unknown[]) {
      Reflect.apply(record.disconnect, tail(record), args)
      record.edges = record.edges.filter(({ args: edge }) => {
        if (!args.length) return false
        if (typeof args[0] === 'number') return (edge[1] ?? 0) !== args[0]
        return (
          edge[0] !== args[0] ||
          (args.length > 1 && (edge[1] ?? 0) !== args[1]) ||
          (args.length > 2 && (edge[2] ?? 0) !== args[2])
        )
      })
    } as AudioNode['disconnect']
    sources.set(video, record)
    return record
  }

  const patchedCreate: AudioContext['createMediaElementSource'] = function (
    this: AudioContext,
    video,
  ) {
    const known = sources.get(video)
    if (known && known.source.context === this) return known.source
    return capture(originalCreate.call(this, video), video, false).source
  }
  AudioContext.prototype.createMediaElementSource = patchedCreate

  function disconnectProcessor(record: SourceRecord) {
    const node = record.processor
    if (!node) return
    record.processor = undefined
    // Restore the exact native routes before releasing DSP. Never close a native context.
    node.disconnect()
    rewire(record)
    node.onprocessorerror = null
    node.port.onmessage = null
    node.port.postMessage({ type: 'dispose' })
    node.port.close()
  }

  function detach() {
    generation++
    abort?.abort()
    abort = undefined
    if (active) disconnectProcessor(active)
    active = undefined
  }

  let cleanupObserverActive = false
  let hasDetachedOwned = false
  let pruneScheduled = false
  let pipWindow: Window | undefined
  let pipAbort: AbortController | undefined
  let pipCleanupObserver: MutationObserver | undefined

  function schedulePruneOwned() {
    if (pruneScheduled || disposed) return
    pruneScheduled = true
    queueMicrotask(() => {
      pruneScheduled = false
      if (!disposed) pruneOwned()
    })
  }

  function hasAddedVideoNode(mutations: MutationRecord[]) {
    for (const mutation of mutations) {
      for (let i = 0; i < mutation.addedNodes.length; i++) {
        const node = mutation.addedNodes[i]
        if (isVideoElement(node)) return true
        if (
          isElement(node) &&
          node.childElementCount > 0 &&
          node.getElementsByTagName('video').length > 0
        )
          return true
      }
    }
    return false
  }

  function onCleanupMutations(mutations: MutationRecord[]) {
    let needsPrune = false
    for (const record of ownedConnected) {
      if (!record.video.isConnected) {
        needsPrune = true
        break
      }
    }
    if (!needsPrune && hasDetachedOwned && hasAddedVideoNode(mutations)) needsPrune = true
    if (needsPrune) schedulePruneOwned()
  }

  const cleanupObserver = new MutationObserver(onCleanupMutations)

  function ensurePipCleanupObserver() {
    if (!cleanupObserverActive || !pipWindow || pipCleanupObserver || disposed) return
    try {
      const pipDoc = pipWindow.document
      if (!pipDoc) return
      pipCleanupObserver = new MutationObserver(onCleanupMutations)
      pipCleanupObserver.observe(pipDoc, { childList: true, subtree: true })
    } catch {
      pipCleanupObserver = undefined
    }
  }

  function ensureCleanupObservers() {
    if (!cleanupObserverActive) {
      cleanupObserver.observe(document, { childList: true, subtree: true })
      cleanupObserverActive = true
    }
    attachPipWindow(getPipWindow())
    ensurePipCleanupObserver()
  }

  function detachPipWindow() {
    pipCleanupObserver?.disconnect()
    pipCleanupObserver = undefined
    pipAbort?.abort()
    pipAbort = undefined
    pipWindow = undefined
  }

  function pruneOwned() {
    for (const record of ownedConnected) {
      if (record.video.isConnected) continue
      if (active === record) detach()
      if (delayed === record) removeDelay()
      record.ownedAbort?.abort()
      record.ownedAbort = undefined
      record.source.disconnect()
      ownedConnected.delete(record)
      hasDetachedOwned = true
    }
    // Detached media may be reinserted without another play event (including into Document PiP).
    // Keep only the observer (no strong media references) to reconnect its minimal bypass.
    if (hasDetachedOwned) {
      for (const video of findAllPlayerVideos()) {
        const record = sources.get(video)
        if (record?.owned) reconnectOwned(record)
      }
    }
    settleOwnedContext()
  }

  // Keep ownedContext running only while an owned element is playing. A silent
  // running context is handed to SilentSinkSuspender after ~30s, which on macOS
  // resumes at a 0.5x AudioWorklet clock and drags the video timeline down with
  // it whenever video.volume > 0.
  // A playing video in a background tab still pulls audio through this context,
  // so tab visibility must not suspend it; only pagehide (bfcache) does.
  function settleOwnedContext() {
    const context = ownedContext
    if (!context || context.state === 'closed') return
    const audible =
      !hidden &&
      [...ownedConnected].some(
        (record) => record.video.isConnected && !record.video.paused && !record.video.ended,
      )
    if (audible) void context.resume().catch(() => {})
    else if (context.state === 'running') void context.suspend().catch(() => {})
  }

  function reconnectOwned(record: SourceRecord) {
    if (!record.owned || ownedConnected.has(record)) return
    record.source.connect(record.source.context.destination)
    ownedConnected.add(record)
    record.ownedAbort?.abort()
    const ownedAbort = new AbortController()
    record.ownedAbort = ownedAbort
    // 直接监听已接管视频自身，跨 Document PiP 搬移节点后也能可靠恢复或挂起 ownedContext。
    const syncOwnedPlayback = () => settleOwnedContext()
    record.video.addEventListener('play', syncOwnedPlayback, { signal: ownedAbort.signal })
    record.video.addEventListener('playing', syncOwnedPlayback, { signal: ownedAbort.signal })
    record.video.addEventListener('pause', syncOwnedPlayback, { signal: ownedAbort.signal })
    record.video.addEventListener('ended', syncOwnedPlayback, { signal: ownedAbort.signal })
    settleOwnedContext()
    ensureCleanupObservers()
  }

  // Source capture is irreversible. A small bypass survives disable;
  // DSP does not.
  function onPlay(event: Event) {
    if (!isMediaElement(event.target)) return
    const record = sources.get(event.target)
    if (record?.owned) {
      reconnectOwned(record)
      void (record.source.context as AudioContext).resume().catch(() => {})
    }
    if (config.enabled) void reconcile()
    if (delayMs) applyDelay()
  }
  function onCanPlay(event: Event) {
    if (!isMediaElement(event.target) || event.target.paused) return
    if (config.enabled && !active) void reconcile()
  }
  function onPointerDown() {
    for (const record of new Set([active, delayed, ...ownedConnected])) {
      if (record && record.video.isConnected && !record.video.paused && !record.video.ended)
        void (record.source.context as AudioContext).resume().catch(() => {})
    }
  }
  function onNativeLoudnessClick(event: Event) {
    if (!config.enabled || !isElement(event.target)) return
    const row = event.target.closest('.bpx-player-ctrl-setting-loudness label')
    const input = row?.querySelector<HTMLInputElement>('input')
    if (input && input.value !== '0') {
      // Prevent a competing native graph from being constructed before its change handler.
      event.preventDefault()
      event.stopImmediatePropagation()
      disableNative()
    }
  }

  function attachDocumentListeners(doc: Document, signal: AbortSignal) {
    doc.addEventListener('play', onPlay, { capture: true, signal })
    doc.addEventListener('playing', onPlay, { capture: true, signal })
    doc.addEventListener('canplay', onCanPlay, { capture: true, signal })
    doc.addEventListener('pause', settleOwnedContext, { capture: true, signal })
    doc.addEventListener('ended', settleOwnedContext, { capture: true, signal })
    doc.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true, signal })
    doc.addEventListener('click', onNativeLoudnessClick, { capture: true, signal })
  }

  function attachPipWindow(nextWindow: Window | undefined) {
    if (disposed || !nextWindow || nextWindow === window || nextWindow === pipWindow) return
    let pipDoc: Document
    try {
      if (nextWindow.closed || !nextWindow.document) return
      pipDoc = nextWindow.document
    } catch {
      return
    }
    detachPipWindow()
    pipWindow = nextWindow
    const abortController = new AbortController()
    pipAbort = abortController
    attachDocumentListeners(pipDoc, abortController.signal)
    ensurePipCleanupObserver()
    const handlePipClose = () => {
      if (pipWindow !== nextWindow) return
      detachPipWindow()
      if (disposed) return
      // 等宿主页面的 pagehide 监听器把播放器搬回主文档后再同步状态。
      queueMicrotask(() => {
        if (disposed) return
        pruneOwned()
        if (config.enabled) void reconcile()
        if (delayMs) applyDelay()
      })
    }
    nextWindow.addEventListener('pagehide', handlePipClose, {
      once: true,
      signal: abortController.signal,
    })
    schedulePruneOwned()
  }

  attachDocumentListeners(document, lifetime.signal)
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) return
      settleOwnedContext()
      if (config.enabled) void reconcile()
    },
    { signal: lifetime.signal },
  )
  const documentPip = getDocumentPictureInPicture()
  documentPip?.addEventListener?.(
    'enter',
    (event) => {
      attachPipWindow(event.window ?? getPipWindow())
    },
    { signal: lifetime.signal },
  )
  attachPipWindow(getPipWindow())

  function disableNative() {
    const root = findNativeSettingRoot()
    if (!root) return false
    const off = root.querySelector<HTMLInputElement>(
      '.bpx-player-ctrl-setting-loudness input[value="0"]',
    )
    if (!off) return false
    if (off.checked) return true
    // Use Bilibili's own UI handlers, including persistence and audio graph changes.
    const settingsButton = root as HTMLElement
    const more = root.querySelector<HTMLElement>('.bpx-player-ctrl-setting-more')
    if (!more) return false
    const ownerDoc = root.ownerDocument
    const focused = ownerDoc.activeElement
    settingsButton.click()
    more.click()
    off.click()
    // Close the popover through its native mouse-leave handler.
    const MouseEventCtor = ownerDoc.defaultView?.MouseEvent ?? MouseEvent
    settingsButton.dispatchEvent(new MouseEventCtor('mouseleave', { bubbles: false }))
    if (isHtmlElement(focused) && focused.isConnected) focused.focus({ preventScroll: true })
    return off.checked
  }

  function loadModule(context: BaseAudioContext) {
    let promise = modules.get(context)
    if (!promise) {
      const url = URL.createObjectURL(new Blob([processorSource], { type: 'text/javascript' }))
      promise = context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))
      modules.set(context, promise)
    }
    return promise
  }

  function configure(record: SourceRecord) {
    if (record.video.paused || record.video.seeking) status('waiting')
    record.processor?.port.postMessage({
      type: 'configure',
      target: config.target,
      strength: config.strength,
      volume: record.video.volume,
      active: !record.video.paused && !record.video.muted && !record.video.seeking,
    })
  }

  async function reconcile() {
    if (disposed || hidden || !config.enabled || pending) return
    attachPipWindow(getPipWindow())
    const video = findPlayerVideo()
    if (active && (active.video !== video || !video?.isConnected)) detach()
    if (!video || failed.has(video)) {
      status(video ? 'error' : 'waiting')
      return
    }
    if (!disableNative()) {
      if (active) detach()
      status('native-unavailable')
      return
    }
    if (active) {
      const nextMediaKey = getMediaKey()
      if (nextMediaKey !== activeMediaKey) {
        activeMediaKey = nextMediaKey
        lastGainSnapshot = undefined
        active.processor?.port.postMessage({ type: 'reset' })
      }
      configure(active)
      return
    }
    if (video.readyState < 2 || video.paused) {
      status('waiting')
      return
    }
    if (!canCapture(video)) {
      status('unsupported')
      return
    }
    pending = true
    const epoch = generation
    let record = sources.get(video)
    let node: AudioWorkletNode | undefined
    try {
      const context =
        (record?.source.context as AudioContext | undefined) ??
        (ownedContext ??= new AudioContext())
      await loadModule(context)
      if (
        epoch !== generation ||
        !config.enabled ||
        hidden ||
        !video.isConnected ||
        findPlayerVideo() !== video
      )
        return
      // Native player may have captured the element while addModule was awaiting.
      record = sources.get(video)
      if (record && record.source.context !== context) return
      if (!disableNative()) {
        status('native-unavailable')
        return
      }
      node = new AudioWorkletNode(context, 'bewly-local-loudness', {
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      })
      if (!record) {
        record = capture(originalCreate.call(context, video), video, true)
        ownedEverCaptured = true
        reconnectOwned(record)
      }
      const current = record
      current.processor = node
      const mediaKey = getMediaKey()
      activeMediaKey = mediaKey
      if (lastGainSnapshot?.mediaKey === mediaKey)
        node.port.postMessage({ type: 'seed', gainDb: lastGainSnapshot.gainDb })
      else lastGainSnapshot = undefined
      rewire(current)
      active = current
      abort = new AbortController()
      for (const name of [
        'play',
        'playing',
        'canplay',
        'pause',
        'volumechange',
        'seeking',
        'seeked',
        'emptied',
        'loadedmetadata',
      ]) {
        video.addEventListener(
          name,
          () => {
            if (name === 'seeking') {
              node?.port.postMessage({ type: 'flush' })
            } else if (name === 'emptied' || name === 'loadedmetadata') {
              const nextMediaKey = getMediaKey()
              if (nextMediaKey !== activeMediaKey) {
                activeMediaKey = nextMediaKey
                lastGainSnapshot = undefined
                node?.port.postMessage({ type: 'reset' })
              } else {
                node?.port.postMessage({ type: 'flush' })
              }
            }
            configure(current)
            if ((name === 'playing' || name === 'seeked') && !video.paused) settleOwnedContext()
          },
          { signal: abort.signal },
        )
      }
      node.onprocessorerror = () => {
        failed.add(video)
        detach()
        status('error')
      }
      node.port.onmessage = ({ data }) => {
        if (active !== current || video.paused || video.seeking) return
        if (typeof data?.gainDb === 'number' && Number.isFinite(data.gainDb))
          lastGainSnapshot = { mediaKey: activeMediaKey, gainDb: data.gainDb }
        if (performance.now() - lastReport < 1000) return
        lastReport = performance.now()
        status('active', data)
      }
      configure(current)
      void context.resume().catch(() => {
        if (active === current) status('waiting')
      })
      if (active === current) status(video.paused || video.seeking ? 'waiting' : 'active')
    } catch {
      failed.add(video)
      if (record?.processor) {
        disconnectProcessor(record)
      } else if (node) {
        node.disconnect()
        node.port.postMessage({ type: 'dispose' })
        node.port.close()
      }
      if (active === record) detach()
      status('error')
    } finally {
      pending = false
      if (ownedContext && !ownedEverCaptured) {
        void ownedContext.close().catch(() => {})
        ownedContext = undefined
      }
      settleOwnedContext()
    }
  }

  // Refuse unknown cross-origin resources before taking over native playback.
  function canCapture(video: HTMLMediaElement) {
    return (
      video.currentSrc.startsWith('blob:') ||
      (Boolean(video.crossOrigin) &&
        new URL(video.currentSrc, location.href).origin === location.origin)
    )
  }

  function delayStatus(state: string) {
    lastDelayStatus = state
    window.postMessage(
      { type: 'BEWLY_AUDIO_DELAY_STATUS', state, delay: delayMs, url: location.href },
      location.origin,
    )
  }

  // 延迟线里还留着上一段声音：暂停或跳转时立即静音，恢复播放后等新声音走完延迟再放开。
  function gate(record: SourceRecord, open: boolean) {
    const stage = record.delay
    if (!stage) return
    const now = record.source.context.currentTime
    stage.output.gain.cancelScheduledValues(now)
    stage.output.gain.setValueAtTime(0, now)
    if (open) stage.output.gain.setValueAtTime(1, now + stage.input.delayTime.value)
  }

  function removeDelay() {
    const record = delayed
    delayed = undefined
    delayAbort?.abort()
    delayAbort = undefined
    const stage = record?.delay
    if (!record || !stage) return
    record.delay = undefined
    stage.output.disconnect()
    stage.input.disconnect()
    rewire(record)
  }

  function applyDelay() {
    if (disposed || hidden) return
    const video = findPlayerVideo()
    if (delayed && (!delayMs || delayed.video !== video || !video?.isConnected)) removeDelay()
    if (!delayMs) {
      delayStatus('off')
      return
    }
    if (!video || !video.currentSrc) {
      delayStatus('waiting')
      return
    }
    let record = sources.get(video)
    if (!record) {
      if (failed.has(video) || !canCapture(video)) {
        delayStatus('unsupported')
        return
      }
      try {
        record = capture(
          originalCreate.call((ownedContext ??= new AudioContext()), video),
          video,
          true,
        )
        ownedEverCaptured = true
        reconnectOwned(record)
      } catch {
        failed.add(video)
        delayStatus('error')
        return
      }
    }
    const context = record.source.context
    if (!record.delay) {
      const current = record
      const stage = {
        input: context.createDelay(MAX_AUDIO_DELAY_MS / 1000),
        output: context.createGain(),
      }
      stage.input.connect(stage.output)
      current.delay = stage
      rewire(current)
      delayed = current
      delayAbort = new AbortController()
      for (const name of ['pause', 'seeking', 'emptied'])
        video.addEventListener(name, () => gate(current, false), { signal: delayAbort.signal })
      for (const name of ['playing', 'seeked']) {
        video.addEventListener(
          name,
          () => {
            if (!video.paused && !video.seeking) gate(current, true)
          },
          { signal: delayAbort.signal },
        )
      }
    }
    // 直接改延迟时间会让已缓冲的声音变调或重复，先静音再按新延迟恢复。
    record.delay!.input.delayTime.setValueAtTime(delayMs / 1000, context.currentTime)
    gate(record, !video.paused && !video.seeking)
    if (!video.paused) void (context as AudioContext).resume().catch(() => {})
    delayStatus('active')
  }

  function setAudioDelayEnabled(enabled: boolean) {
    if (disposed || delayEnabled === enabled) return
    delayEnabled = enabled
    if (!enabled) {
      delayMs = 0
      applyDelay()
    }
  }

  function update(next: Config) {
    if (disposed) return
    requested = next
    config = temporarilyOff ? { ...next, enabled: false } : next
    generation++
    if (timer) clearInterval(timer)
    timer = undefined
    if (!config.enabled) {
      lastGainSnapshot = undefined
      detach()
      status('off')
      pruneOwned()
      return
    }
    timer = setInterval(() => void reconcile(), 1000)
    void reconcile()
  }

  window.addEventListener(
    'message',
    (event) => {
      if (event.source !== window) return
      const type = event.data?.type
      if (type === 'BEWLY_LOUDNESS_STATUS_REQUEST') {
        status(lastStatus)
      } else if (delayEnabled && type === 'BEWLY_AUDIO_DELAY_STATUS_REQUEST') {
        delayStatus(lastDelayStatus)
      } else if (
        delayEnabled &&
        type === 'BEWLY_AUDIO_DELAY' &&
        typeof event.data.delay === 'number' &&
        Number.isFinite(event.data.delay)
      ) {
        delayMs = Math.round(Math.max(0, Math.min(MAX_AUDIO_DELAY_MS, event.data.delay)))
        applyDelay()
      } else if (type === 'BEWLY_LOUDNESS_TEMPORARY_OFF' && typeof event.data.off === 'boolean') {
        temporarilyOff = event.data.off
        update(requested)
      }
    },
    { signal: lifetime.signal },
  )
  window.addEventListener('pagehide', (event) => {
    hidden = true
    detach()
    removeDelay()
    if (timer) clearInterval(timer)
    timer = undefined
    if (event.persisted) {
      settleOwnedContext()
      return
    }
    disposed = true
    detachPipWindow()
    cleanupObserver.disconnect()
    cleanupObserverActive = false
    hasDetachedOwned = false
    lifetime.abort()
    for (const record of ownedConnected) {
      record.ownedAbort?.abort()
      record.ownedAbort = undefined
      record.source.disconnect()
    }
    ownedConnected.clear()
    void ownedContext?.close().catch(() => {})
    if (AudioContext.prototype.createMediaElementSource === patchedCreate)
      AudioContext.prototype.createMediaElementSource = originalCreate
  })
  window.addEventListener(
    'pageshow',
    () => {
      hidden = false
      settleOwnedContext()
      if (!disposed) {
        update(requested)
        if (delayEnabled) applyDelay()
      }
    },
    { signal: lifetime.signal },
  )
  return { update, setAudioDelayEnabled }
}
