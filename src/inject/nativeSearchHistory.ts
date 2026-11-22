const POPSTATE_PUSH = 'history.pushState(null, document.title, location.href)'
const TIMESTAMP_PUSH = 'history.pushState(null, document.title, url)'
const SEARCH_SCRIPT_MARKERS = [
  'if (!window.biliBridgePc)',
  'if (!(history.state && history.state.back))',
  'function handleDocumentInitActive()',
  'Date.now()',
  '}, 300)',
  POPSTATE_PUSH,
  TIMESTAMP_PUSH,
]

function isSearchHistoryScript(script: HTMLScriptElement): boolean {
  const source = script.textContent ?? ''
  return !script.hasAttribute('src') && SEARCH_SCRIPT_MARKERS.every(marker => source.includes(marker))
}

export function installNativeSearchHistory(): (enabled: boolean) => void {
  let enabled = false
  let searchScript: HTMLScriptElement | undefined
  let foundClickListener = false

  function updateEnabled(value: boolean) {
    enabled = value
  }

  const targets = [window, document]
  if (targets.some(target => Object.hasOwn(target, 'addEventListener')))
    return updateEnabled

  const nativeAdd = EventTarget.prototype.addEventListener

  function restoreRegistration() {
    for (const target of targets) {
      if (target.addEventListener === observeRegistration)
        Reflect.deleteProperty(target, 'addEventListener')
    }
    document.removeEventListener('DOMContentLoaded', restoreRegistration)
  }

  function observeRegistration(
    this: EventTarget,
    ...args: Parameters<typeof nativeAdd>
  ) {
    const [type, listener, options] = args
    const add = this === window || this === document
      ? Reflect.get(Object.getPrototypeOf(this), 'addEventListener', this) as typeof nativeAdd
      : nativeAdd
    const script = document.currentScript

    if (script instanceof HTMLScriptElement && options === undefined && typeof listener === 'function') {
      if (this === window && type === 'popstate' && isSearchHistoryScript(script)
        && Function.prototype.toString.call(listener).includes(POPSTATE_PUSH)) {
        searchScript = script
        return Reflect.apply(add, this, [type, function (this: Window, event: Event) {
          if (!enabled || !foundClickListener)
            listener.call(this, event)
        }])
      }

      if (this === document && type === 'click' && script === searchScript
        && listener.name === 'handleDocumentInitActive'
        && Function.prototype.toString.call(listener).includes(TIMESTAMP_PUSH)) {
        // The original listener removes itself after its first click.
        Reflect.apply(add, this, [type, function (this: Document, event: Event) {
          if (!enabled)
            listener.call(this, event)
        }, { once: true }])
        foundClickListener = true
        restoreRegistration()
        return
      }
    }

    return Reflect.apply(add, this, args)
  }

  // Match only the parser's known inline script. Settings arrive after registration.
  Reflect.apply(nativeAdd, document, ['DOMContentLoaded', restoreRegistration, { once: true }])
  for (const target of targets) {
    Object.defineProperty(target, 'addEventListener', {
      configurable: true,
      writable: true,
      value: observeRegistration,
    })
  }

  return updateEnabled
}
