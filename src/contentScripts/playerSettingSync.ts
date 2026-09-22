import { watch } from 'vue'

import { isVideoOrBangumiPage, isVideoPlaybackPage } from '~/utils/main'

/** 按功能与播放器生命周期同步偏好，避免在首页和关闭功能后常驻轮询。 */
export function setupPlayerSettingSync(options: {
  enabled: () => boolean
  preference: () => unknown
  target: () => Element | null
  sync: () => void
  pending?: () => boolean
  reset?: () => void
}) {
  const lifetime = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let target: Element | null = null
  let discoveryDeadline = 0
  let queued = false
  let suspended = false
  const structureObserver = new MutationObserver(schedule)
  const stateObserver = new MutationObserver(schedule)

  function clear() {
    clearTimeout(timer)
    timer = undefined
    structureObserver.disconnect()
    stateObserver.disconnect()
    target = null
  }

  function canRun() {
    return !lifetime.signal.aborted && !suspended && options.enabled()
      && (isVideoPlaybackPage() || isVideoOrBangumiPage())
  }

  function sync() {
    clearTimeout(timer)
    timer = undefined
    if (!canRun()) {
      clear()
      options.reset?.()
      return
    }

    const nextTarget = options.target()
    if (nextTarget !== target) {
      clear()
      target = nextTarget
      discoveryDeadline = Date.now() + 15_000
      if (target) {
        stateObserver.observe(target, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'checked', 'disabled', 'aria-disabled', 'data-value'],
        })
        // 只观察祖先自身的子节点，以发现菜单替换，不监听弹幕子树。
        let ancestor = target.parentElement
        while (ancestor) {
          structureObserver.observe(ancestor, { childList: true })
          ancestor = ancestor.parentElement
        }
      }
    }

    if (target)
      options.sync()

    if (!canRun())
      return
    if (target || Date.now() < discoveryDeadline) {
      const delay = !target || options.pending?.()
        ? 500
        : document.visibilityState === 'hidden' ? 15_000 : 5000
      timer = setTimeout(schedule, delay)
    }
  }

  function schedule() {
    if (queued || lifetime.signal.aborted || suspended)
      return
    queued = true
    queueMicrotask(() => {
      queued = false
      sync()
    })
  }

  function discover() {
    discoveryDeadline = Date.now() + 15_000
    schedule()
  }

  const unwatch = watch(() => [options.enabled(), options.preference()], () => {
    if (!canRun()) {
      clear()
      options.reset?.()
    }
    else {
      discover()
    }
  }, { immediate: true, flush: 'post' })

  for (const name of ['pushstate', 'replacestate', 'popstate', 'hashchange'])
    window.addEventListener(name, discover, { signal: lifetime.signal })
  for (const name of ['play', 'loadedmetadata'])
    document.addEventListener(name, discover, { capture: true, signal: lifetime.signal })
  document.addEventListener('visibilitychange', discover, { signal: lifetime.signal })
  window.addEventListener('pageshow', () => {
    suspended = false
    discover()
  }, { signal: lifetime.signal })
  window.addEventListener('pagehide', (event) => {
    suspended = true
    clear()
    options.reset?.()
    if (!event.persisted) {
      unwatch()
      lifetime.abort()
    }
  }, { signal: lifetime.signal })

  return { schedule: discover, signal: lifetime.signal }
}
