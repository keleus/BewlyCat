import processorSource from './localLoudnessProcessor.js?raw'

interface Config { enabled: boolean, target: number, strength: number }
interface Edge { args: unknown[] }
interface SourceRecord {
  source: MediaElementAudioSourceNode
  video: HTMLMediaElement
  edges: Edge[]
  connect: AudioNode['connect']
  disconnect: AudioNode['disconnect']
  processor?: AudioWorkletNode
  owned: boolean
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
  let lastStatus = 'off'
  let lastReport = 0
  const failed = new WeakSet<HTMLMediaElement>()

  function status(state: string, details: Record<string, number> = {}) {
    lastStatus = state
    const video = active?.video ?? document.querySelector<HTMLVideoElement>('.bpx-player-video-wrap video, .bilibili-player-video video')
    window.postMessage({ type: 'BEWLY_LOUDNESS_STATUS', state, ...details, url: location.href, src: video?.currentSrc ?? '' }, location.origin)
  }

  function rawConnect(record: SourceRecord, from: AudioNode, args: unknown[]) {
    return Reflect.apply(record.connect, from, args)
  }

  function capture(source: MediaElementAudioSourceNode, video: HTMLMediaElement, owned: boolean) {
    const record: SourceRecord = { source, video, owned, edges: [], connect: source.connect, disconnect: source.disconnect }
    // Keep routing bookkeeping on the source itself. The weak cache does not retain old videos.
    source.connect = function (...args: unknown[]) {
      const result = rawConnect(record, record.processor ?? source, args)
      if (!record.edges.some(e => e.args[0] === args[0] && (e.args[1] ?? 0) === (args[1] ?? 0) && (e.args[2] ?? 0) === (args[2] ?? 0)))
        record.edges.push({ args })
      return result
    } as AudioNode['connect']
    source.disconnect = function (...args: unknown[]) {
      Reflect.apply(record.disconnect, record.processor ?? source, args)
      record.edges = record.edges.filter(({ args: edge }) => {
        if (!args.length)
          return false
        if (typeof args[0] === 'number')
          return (edge[1] ?? 0) !== args[0]
        return edge[0] !== args[0] || (args.length > 1 && (edge[1] ?? 0) !== args[1]) || (args.length > 2 && (edge[2] ?? 0) !== args[2])
      })
    } as AudioNode['disconnect']
    sources.set(video, record)
    return record
  }

  const patchedCreate: AudioContext['createMediaElementSource'] = function (this: AudioContext, video) {
    const known = sources.get(video)
    if (known && known.source.context === this)
      return known.source
    return capture(originalCreate.call(this, video), video, false).source
  }
  AudioContext.prototype.createMediaElementSource = patchedCreate

  function disconnectProcessor(record: SourceRecord) {
    const node = record.processor
    if (!node)
      return
    record.processor = undefined
    // Restore the exact native routes before releasing DSP. Never close a native context.
    try {
      Reflect.apply(record.disconnect, record.source, [])
    }
    catch { /* The native player may already have closed its context. */ }
    node.disconnect()
    for (const edge of record.edges) {
      try {
        rawConnect(record, record.source, edge.args)
      }
      catch { /* A removed native destination must not prevent DSP disposal. */ }
    }
    node.onprocessorerror = null
    node.port.onmessage = null
    node.port.postMessage({ type: 'dispose' })
    node.port.close()
  }

  function detach() {
    generation++
    abort?.abort()
    abort = undefined
    if (active)
      disconnectProcessor(active)
    active = undefined
  }

  const cleanupObserver = new MutationObserver(pruneOwned)

  function pruneOwned() {
    for (const record of ownedConnected) {
      if (record.video.isConnected)
        continue
      if (active === record)
        detach()
      record.source.disconnect()
      ownedConnected.delete(record)
    }
    // Detached media may be reinserted without another play event. Keep only the
    // observer (no strong media references) to reconnect its minimal bypass.
    for (const video of Array.from(document.querySelectorAll<HTMLVideoElement>('.bpx-player-video-wrap video, .bilibili-player-video video'))) {
      const record = sources.get(video)
      if (record?.owned)
        reconnectOwned(record)
    }
    if (!ownedConnected.size) {
      if (ownedContext?.state === 'running')
        void ownedContext.suspend().catch(() => {})
    }
  }

  function reconnectOwned(record: SourceRecord) {
    if (!record.owned || ownedConnected.has(record))
      return
    record.source.connect(record.source.context.destination)
    ownedConnected.add(record)
    if (!record.video.paused)
      void (record.source.context as AudioContext).resume().catch(() => {})
    cleanupObserver.observe(document, { childList: true, subtree: true })
  }

  // Source capture is irreversible. A small bypass survives disable;
  // DSP does not.
  function onPlay(event: Event) {
    if (!(event.target instanceof HTMLMediaElement))
      return
    const record = sources.get(event.target)
    if (record?.owned) {
      reconnectOwned(record)
      void (record.source.context as AudioContext).resume().catch(() => {})
    }
    if (config.enabled)
      void reconcile()
  }
  document.addEventListener('play', onPlay, { capture: true, signal: lifetime.signal })
  document.addEventListener('pointerdown', () => {
    if (active && !active.video.paused)
      void (active.source.context as AudioContext).resume().catch(() => {})
  }, { capture: true, passive: true, signal: lifetime.signal })
  document.addEventListener('click', (event) => {
    if (!config.enabled || !(event.target instanceof Element))
      return
    const row = event.target.closest('.bpx-player-ctrl-setting-loudness label')
    const input = row?.querySelector<HTMLInputElement>('input')
    if (input && input.value !== '0') {
      // Prevent a competing native graph from being constructed before its change handler.
      event.preventDefault()
      event.stopImmediatePropagation()
      disableNative()
    }
  }, { capture: true, signal: lifetime.signal })

  function disableNative() {
    const root = document.querySelector('.bpx-player-ctrl-setting')
    const off = root?.querySelector<HTMLInputElement>('.bpx-player-ctrl-setting-loudness input[value="0"]')
    if (!off)
      return false
    if (off.checked)
      return true
    // Use Bilibili's own UI handlers, including persistence and audio graph changes.
    const settingsButton = root as HTMLElement
    const more = root?.querySelector<HTMLElement>('.bpx-player-ctrl-setting-more')
    if (!more)
      return false
    const focused = document.activeElement
    settingsButton.click()
    more.click()
    off.click()
    // Close the popover through its native mouse-leave handler.
    settingsButton.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
    if (focused instanceof HTMLElement && focused.isConnected)
      focused.focus({ preventScroll: true })
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
    if (record.video.paused || record.video.seeking)
      status('waiting')
    record.processor?.port.postMessage({ type: 'configure', target: config.target, strength: config.strength, volume: record.video.volume, active: !record.video.paused && !record.video.muted && !record.video.seeking })
  }

  async function reconcile() {
    if (disposed || hidden || !config.enabled || pending)
      return
    const video = document.querySelector<HTMLVideoElement>('.bpx-player-video-wrap video, .bilibili-player-video video')
    if (active && (active.video !== video || !video?.isConnected))
      detach()
    if (!video || failed.has(video)) {
      status(video ? 'error' : 'waiting')
      return
    }
    if (!disableNative()) {
      if (active)
        detach()
      status('native-unavailable')
      return
    }
    if (active) {
      configure(active)
      return
    }
    if (video.readyState < 2 || video.paused) {
      status('waiting')
      return
    }
    // Refuse unknown cross-origin resources before taking over native playback.
    if (!video.currentSrc.startsWith('blob:') && (!video.crossOrigin || new URL(video.currentSrc, location.href).origin !== location.origin)) {
      status('unsupported')
      return
    }
    pending = true
    const epoch = generation
    let record = sources.get(video)
    let node: AudioWorkletNode | undefined
    try {
      const context = record?.source.context as AudioContext | undefined
        ?? (ownedContext ??= new AudioContext())
      await loadModule(context)
      if (epoch !== generation || !config.enabled || hidden || !video.isConnected || document.querySelector('.bpx-player-video-wrap video, .bilibili-player-video video') !== video)
        return
      // Native player may have captured the element while addModule was awaiting.
      record = sources.get(video)
      if (record && record.source.context !== context)
        return
      if (!disableNative()) {
        status('native-unavailable')
        return
      }
      node = new AudioWorkletNode(context, 'bewly-local-loudness', { outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' })
      if (!record) {
        record = capture(originalCreate.call(context, video), video, true)
        ownedEverCaptured = true
        reconnectOwned(record)
      }
      const current = record
      // Insert into the existing source's outgoing routes, without a second source.
      Reflect.apply(current.disconnect, current.source, [])
      current.processor = node
      rawConnect(current, current.source, [node])
      for (const edge of current.edges) rawConnect(current, node, edge.args)
      active = current
      abort = new AbortController()
      for (const name of ['play', 'pause', 'volumechange', 'seeking', 'seeked', 'emptied', 'loadedmetadata']) {
        video.addEventListener(name, () => {
          if (name === 'seeking' || name === 'emptied' || name === 'loadedmetadata')
            node?.port.postMessage({ type: 'reset' })
          configure(current)
        }, { signal: abort.signal })
      }
      node.onprocessorerror = () => {
        failed.add(video)
        detach()
        status('error')
      }
      node.port.onmessage = ({ data }) => {
        if (active !== current || video.paused || video.seeking || performance.now() - lastReport < 1000)
          return
        lastReport = performance.now()
        status('active', data)
      }
      configure(current)
      void context.resume().catch(() => {
        if (active === current)
          status('waiting')
      })
      if (active === current)
        status(video.paused || video.seeking ? 'waiting' : 'active')
    }
    catch {
      failed.add(video)
      if (record?.processor) {
        disconnectProcessor(record)
      }
      else if (node) {
        node.disconnect()
        node.port.postMessage({ type: 'dispose' })
        node.port.close()
      }
      if (active === record)
        detach()
      status('error')
    }
    finally {
      pending = false
      if (ownedContext && !ownedEverCaptured) {
        void ownedContext.close().catch(() => {})
        ownedContext = undefined
      }
      else if (ownedContext && !ownedConnected.size && ownedContext.state === 'running') {
        void ownedContext.suspend().catch(() => {})
      }
    }
  }

  function update(next: Config) {
    if (disposed)
      return
    config = next
    generation++
    if (timer)
      clearInterval(timer)
    timer = undefined
    if (!next.enabled) {
      detach()
      status('off')
      pruneOwned()
      return
    }
    timer = setInterval(() => void reconcile(), 1000)
    void reconcile()
  }

  window.addEventListener('message', (event) => {
    if (event.source === window && event.data?.type === 'BEWLY_LOUDNESS_STATUS_REQUEST')
      status(lastStatus)
  }, { signal: lifetime.signal })
  window.addEventListener('pagehide', (event) => {
    hidden = true
    detach()
    if (timer)
      clearInterval(timer)
    timer = undefined
    if (event.persisted) {
      void ownedContext?.suspend().catch(() => {})
      return
    }
    disposed = true
    cleanupObserver.disconnect()
    lifetime.abort()
    for (const record of ownedConnected) record.source.disconnect()
    ownedConnected.clear()
    void ownedContext?.close().catch(() => {})
    if (AudioContext.prototype.createMediaElementSource === patchedCreate)
      AudioContext.prototype.createMediaElementSource = originalCreate
  })
  window.addEventListener('pageshow', () => {
    hidden = false
    if (ownedConnected.size && [...ownedConnected].some(record => !record.video.paused))
      void ownedContext?.resume().catch(() => {})
    if (!disposed)
      update(config)
  }, { signal: lifetime.signal })
  return { update }
}
