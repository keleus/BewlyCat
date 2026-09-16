import { watch } from 'vue'

import { settings, settingsReady } from '~/logic'
import { i18n } from '~/utils/i18n'
import { isHomePage, isInIframe } from '~/utils/main'

type Snapshot = HTMLElement[]

const cardSelector = '.recommended-container_floor-aside .feed-card'
const sameNodes = (a: Snapshot, b: Snapshot) => a.length === b.length && a.every((node, index) => node === b[index])
const signature = (cards: Snapshot) => cards.map(card => card.querySelector<HTMLAnchorElement>('a[href]')?.href || '').join('\n')

/**
 * Like BiliPlus's feed-roll-history controls, retain actual card nodes so native
 * listeners survive restoration. Restore the latest native nodes before a roll
 * so Bilibili's renderer always updates the DOM it owns.
 * Reference: https://github.com/0xlau/biliplus/blob/main/scripts/feed-roll-history-btn.js
 */
export function setupNativeHomeFeedHistory() {
  if (isInIframe() || !isHomePage())
    return

  let snapshots: Snapshot[] = []
  let index = -1
  let nativeSnapshot: Snapshot = []
  let enabled = false
  let loading = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let back: HTMLButtonElement | undefined
  let forward: HTMLButtonElement | undefined
  let style: HTMLStyleElement | undefined
  let container: Element | null = null

  const capture = () => Array.from(document.querySelectorAll<HTMLElement>(cardSelector))

  function restore(snapshot: Snapshot) {
    const current = capture()
    const parent = current[0]?.parentElement
    if (!parent || !snapshot.length || current.some(card => card.parentElement !== parent))
      return false

    const count = Math.min(current.length, snapshot.length)
    const insertionPoint = current[current.length - 1].nextSibling
    for (let i = 0; i < count; i++) {
      if (current[i] !== snapshot[i])
        current[i].replaceWith(snapshot[i])
    }
    for (let i = count; i < snapshot.length; i++)
      parent.insertBefore(snapshot[i], insertionPoint)
    for (let i = count; i < current.length; i++)
      current[i].remove()
    return true
  }

  function updateButtons() {
    if (!back || !forward)
      return
    back.disabled = loading || index <= 0
    forward.disabled = loading || index >= snapshots.length - 1
    back.title = back.ariaLabel = String(i18n.global.t('settings.native_home_feed_back'))
    forward.title = forward.ariaLabel = String(i18n.global.t('settings.native_home_feed_forward'))
  }

  function navigate(direction: number) {
    if (loading)
      return
    const next = index + direction
    if (snapshots[next] && restore(snapshots[next]))
      index = next
    updateButtons()
  }

  function createButton(direction: number) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'primary-btn bewly-native-feed-history'
    button.textContent = direction < 0 ? '↶' : '↷'
    button.addEventListener('click', () => navigate(direction))
    return button
  }

  function mount() {
    if (!enabled)
      return
    const roll = document.querySelector<HTMLButtonElement>('.roll-btn')
    const parent = roll?.parentElement
    const nextContainer = document.querySelector('.recommended-container_floor-aside')
    if (container && container !== nextContainer) {
      clearTimeout(timer)
      snapshots = []
      index = -1
      nativeSnapshot = []
      loading = false
    }
    container = nextContainer
    if (!parent || !container)
      return
    if (!back?.isConnected || back.parentElement !== parent) {
      back?.remove()
      forward?.remove()
      back = createButton(-1)
      forward = createButton(1)
      parent.append(back, forward)
    }
    if (!loading && index < 0) {
      const initial = capture()
      if (initial.length && initial.some(card => card.querySelector('a[href]'))) {
        nativeSnapshot = initial
        snapshots = [initial]
        index = 0
      }
    }
    updateButtons()
  }

  const observer = new MutationObserver(mount)

  function onRoll(event: MouseEvent) {
    if (!(event.target instanceof Element))
      return
    const roll = event.target.closest<HTMLButtonElement>('.roll-btn')
    if (!roll || roll.disabled || roll.getAttribute('aria-disabled') === 'true')
      return
    // Do not interrupt native loading or enqueue another history transition.
    if (loading) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    const visible = capture()
    if (!visible.length)
      return
    if (index < 0) {
      snapshots = [visible]
      index = 0
    }
    else {
      snapshots[index] = visible
    }
    if (nativeSnapshot.length && !sameNodes(visible, nativeSnapshot) && !restore(nativeSnapshot))
      return
    const previous = capture()
    const previousSignature = signature(previous)
    loading = true
    updateButtons()
    let attempts = 0
    let candidate: Snapshot = []
    let candidateSignature = ''
    function settle() {
      const current = capture()
      const currentSignature = signature(current)
      const changed = current.length > 0 && !sameNodes(previous, current)
        && !!currentSignature.trim() && currentSignature !== previousSignature
      // Wait for consecutive stable samples instead of retaining a partially
      // replaced recommendation grid.
      if (changed && sameNodes(candidate, current) && candidateSignature === currentSignature) {
        snapshots.splice(index + 1)
        snapshots.push(current)
        if (snapshots.length > 5)
          snapshots.shift()
        index = snapshots.length - 1
        nativeSnapshot = current
        loading = false
        updateButtons()
      }
      else if (++attempts < 100) {
        candidate = changed ? current : []
        candidateSignature = currentSignature
        timer = setTimeout(settle, 100)
      }
      else {
        // Failed/unchanged rolls must not create duplicate entries or lose the
        // forward branch. Return to what was visible before the attempted roll.
        nativeSnapshot = current
        restore(visible)
        loading = false
        updateButtons()
      }
    }
    timer = setTimeout(settle, 100)
  }

  function sync() {
    const nextEnabled = settings.value.enableUndoRefreshButton
      && settings.value.useOriginalBilibiliHomepage && isHomePage()
    if (nextEnabled === enabled) {
      updateButtons()
      return
    }
    enabled = nextEnabled
    if (enabled) {
      style = document.createElement('style')
      style.textContent = `
        .bewly-native-feed-history {
          display: flex; align-items: center; justify-content: center; box-sizing: border-box;
          width: var(--bew-space-40, 40px); height: var(--bew-space-40, 40px); margin-left: 0;
          min-width: 24px; min-height: 24px; margin-top: var(--bew-space-8, 8px);
          padding: var(--bew-space-4, 4px); font-size: var(--bew-icon-size-lg, 24px);
          line-height: 1; cursor: pointer;
        }
        .bewly-native-feed-history:disabled { opacity: .4; cursor: not-allowed; }
        .bewly-native-feed-history:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
        .bewly-native-feed-history:not(:disabled):hover { color: var(--brand_blue, #00aeec); }
        .bewly-native-feed-history:not(:disabled):active { opacity: .7; }
      `
      document.documentElement.append(style)
      document.addEventListener('click', onRoll, true)
      observer.observe(document.documentElement, { childList: true, subtree: true })
      mount()
    }
    else {
      observer.disconnect()
      document.removeEventListener('click', onRoll, true)
      clearTimeout(timer)
      // While loading the native renderer already owns the visible cards.
      if (!loading && nativeSnapshot.length)
        restore(nativeSnapshot)
      back?.remove()
      forward?.remove()
      style?.remove()
      back = forward = undefined
      snapshots = []
      nativeSnapshot = []
      index = -1
      loading = false
      container = null
    }
  }

  void settingsReady.then(() => {
    watch(() => [settings.value.enableUndoRefreshButton, settings.value.useOriginalBilibiliHomepage, settings.value.language], sync, { immediate: true })
    window.addEventListener('popstate', sync)
    window.addEventListener('pageshow', sync)
  })
}
