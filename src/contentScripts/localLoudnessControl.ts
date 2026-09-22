import { createApp, watch } from 'vue'

import PlayerLoudnessControl from '~/components/PlayerLoudnessControl.vue'
import { settings, settingsReady } from '~/logic'
import { i18n } from '~/utils/i18n'

let initialized = false

export function initLocalLoudnessControl() {
  if (initialized || location.hostname === 'live.bilibili.com')
    return
  initialized = true
  const lifetime = new AbortController()
  let disposeControl: (() => void) | undefined
  let host: HTMLElement | undefined
  let media: HTMLVideoElement | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let deadline = 0
  let queued = false
  let suspended = false
  let stopped = false
  let unwatch: (() => void) | undefined
  const observer = new MutationObserver(schedule)

  function clearControl() {
    observer.disconnect()
    disposeControl?.()
    disposeControl = undefined
    host?.remove()
    host = undefined
    media = undefined
  }

  function cancelRetry() {
    if (retry)
      clearTimeout(retry)
    retry = undefined
  }

  function schedule() {
    if (queued || stopped || suspended)
      return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (!stopped && !suspended)
        sync()
    })
  }

  function discover() {
    deadline = Date.now() + 15_000
    schedule()
  }

  function sync() {
    cancelRetry()
    if (!settings.value.showLocalLoudnessButton) {
      clearControl()
      return
    }
    const bar = document.querySelector<HTMLElement>('.bpx-player-control-bottom-right')
    const player = bar?.closest('.bpx-player-container')
    const video = player?.querySelector<HTMLVideoElement>('.bpx-player-video-wrap video')
    if (host?.isConnected && host.parentElement === bar && media === video)
      return
    clearControl()
    if (!bar || !video) {
      if (Date.now() < deadline)
        retry = setTimeout(schedule, 500)
      return
    }
    host = document.createElement('div')
    host.className = 'bpx-player-ctrl-btn bewly-local-loudness-control'
    media = video
    const anchor = bar.querySelector('.bpx-player-ctrl-volume')
    if (anchor)
      anchor.insertAdjacentElement('afterend', host)
    else
      bar.prepend(host)
    const app = createApp(PlayerLoudnessControl, { video })
    app.use(i18n)
    app.mount(host)
    disposeControl = () => app.unmount()
    // Observe structure only, not per-frame danmaku, status text, or slider changes.
    let ancestor: Node | null = bar
    while (ancestor) {
      observer.observe(ancestor, { childList: true })
      ancestor = ancestor.parentNode
    }
    const wrap = video.parentElement
    if (wrap)
      observer.observe(wrap, { childList: true })
  }

  window.addEventListener('pageshow', () => {
    suspended = false
    discover()
  }, { signal: lifetime.signal })
  window.addEventListener('pagehide', (event) => {
    suspended = true
    cancelRetry()
    clearControl()
    if (!event.persisted) {
      stopped = true
      unwatch?.()
      lifetime.abort()
    }
  }, { signal: lifetime.signal })

  void settingsReady.then(() => {
    if (stopped)
      return
    unwatch = watch(() => settings.value.showLocalLoudnessButton, discover, { immediate: true })
    for (const name of ['pushstate', 'replacestate', 'popstate', 'hashchange'])
      window.addEventListener(name, discover, { signal: lifetime.signal })
    for (const name of ['play', 'loadedmetadata'])
      document.addEventListener(name, discover, { capture: true, signal: lifetime.signal })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible')
        discover()
    }, { signal: lifetime.signal })
  })
}
