import { createApp, watch } from 'vue'

import PlayerLoudnessControl from '~/components/PlayerLoudnessControl.vue'
import { settings, settingsReady } from '~/logic'
import { i18n } from '~/utils/i18n'
import { applyPictureAdjustment, playerAdjustment, resetPictureAdjustment, resetPlayerAdjustment, syncPlayerAdjustmentVideo } from '~/utils/playerAdjustment'

import { schedulePlayerControlFit } from './playerControlFit'

let initialized = false

// 画面、音画同步、音量均衡任一项开启才显示按钮
function isAdjustmentButtonVisible() {
  return settings.value.playerPictureAdjustmentEnabled
    || settings.value.playerAudioDelayEnabled
    || settings.value.localLoudnessEnabled
}

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
    if (isAdjustmentButtonVisible())
      syncPlayerAdjustmentVideo()
    deadline = Date.now() + 15_000
    schedule()
  }

  function sync() {
    cancelRetry()
    if (!isAdjustmentButtonVisible()) {
      // 隐藏按钮后无处还原，画面与音画调整随之重置；组件卸载前先把画面复原到视频上。
      resetPlayerAdjustment()
      if (media)
        applyPictureAdjustment(media)
      clearControl()
      return
    }
    const bar = document.querySelector<HTMLElement>('.bpx-player-control-bottom-right')
    const player = bar?.closest('.bpx-player-container')
    const video = player?.querySelector<HTMLVideoElement>('.bpx-player-video-wrap video')
    if (host?.isConnected && host.parentElement === bar && media === video)
      return
    clearControl()
    const anchor = bar?.querySelector('.bpx-player-ctrl-volume')
    // Match the widescreen control: wait for the native icon wrapper before mounting.
    if (!bar || !video || !anchor?.querySelector('.bpx-player-ctrl-btn-icon')) {
      if (Date.now() < deadline)
        retry = setTimeout(schedule, 500)
      return
    }
    host = document.createElement('div')
    host.className = 'bpx-player-ctrl-btn bewly-local-loudness-control'
    media = video
    anchor.insertAdjacentElement('afterend', host)
    schedulePlayerControlFit(host)
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
    const stopVisibilityWatch = watch(isAdjustmentButtonVisible, discover, { immediate: true })
    // 单项关闭后面板里不再有入口还原，对应调整随之重置。
    const stopItemWatch = watch(() => [settings.value.playerPictureAdjustmentEnabled, settings.value.playerAudioDelayEnabled] as const, ([picture, audioDelay]) => {
      if (!picture) {
        resetPictureAdjustment()
        if (media)
          applyPictureAdjustment(media)
      }
      if (!audioDelay)
        playerAdjustment.audioDelay = 0
    }, { immediate: true })
    unwatch = () => {
      stopVisibilityWatch()
      stopItemWatch()
    }
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
