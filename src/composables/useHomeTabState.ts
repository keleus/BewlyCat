import type { InjectionKey, Ref } from 'vue'
import { inject, onBeforeUnmount, provide, reactive, ref, toRaw } from 'vue'

type TabSnapshot = Record<string, unknown>

/** Copy registered JSON data from raw values, without proxy traversal or a JSON string buffer. */
function cloneTabData<T>(value: T, copies = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== 'object')
    return value

  const raw = toRaw(value)
  if (copies.has(raw))
    return copies.get(raw) as T

  const copy = (Array.isArray(raw) ? Array.from({ length: raw.length }) : {}) as Record<string, unknown>
  copies.set(raw, copy)
  for (const key of Object.keys(raw)) {
    const field = cloneTabData((raw as Record<string, unknown>)[key], copies)
    if (key === '__proto__') {
      Object.defineProperty(copy, key, { value: field, writable: true, enumerable: true, configurable: true })
    }
    else {
      copy[key] = field
    }
  }
  return copy as T
}

/** The cache owns JSON data only, never component instances, refs or DOM nodes. */
export function createHomeTabCache() {
  const snapshots = new Map<string, TabSnapshot>()
  let generation = 0
  return {
    get generation() { return generation },
    take(key: string) {
      const snapshot = snapshots.get(key)
      snapshots.delete(key)
      return snapshot
    },
    save(key: string, snapshot: TabSnapshot, version: number) {
      if (version === generation)
        snapshots.set(key, cloneTabData(snapshot))
    },
    clear() {
      generation++
      snapshots.clear()
    },
  }
}

interface HomeTabCacheContext {
  cache: ReturnType<typeof createHomeTabCache>
  activeKey: () => string
  restoreScroll: () => void
}

const homeTabCacheKey: InjectionKey<HomeTabCacheContext> = Symbol('home-tab-data-cache')

export function provideHomeTabCache(activeKey: () => string, restoreScroll: () => void) {
  const cache = createHomeTabCache()
  provide(homeTabCacheKey, { cache, activeKey, restoreScroll })
  return cache
}

const homeTabStateKey: InjectionKey<HomeTabState> = Symbol('home-tab-state')

/** Register only durable data. Loading flags, requests, timers and DOM refs stay local. */
export function useHomeTabState(options: { retainedFields?: readonly string[] } = {}) {
  // An explicit allowlist keeps only UI choices; lists, cursors and grid snapshots
  // remain component-local and start fresh when the tab is mounted again.
  const retainedFields = options.retainedFields && new Set(options.retainedFields)
  const context = inject(homeTabCacheKey, undefined)
  const ownerKey = context?.activeKey() ?? ''
  const generation = context?.cache.generation ?? 0
  let snapshot = context?.cache.take(ownerKey)
  const fields = new Map<string, () => unknown>()
  let disposed = false

  function read<T>(key: string, initial: T): T {
    if (retainedFields && !retainedFields.has(key))
      return initial
    return snapshot && Object.hasOwn(snapshot, key) ? snapshot[key] as T : initial
  }
  function take<T>(key: string, initial: T): T {
    const value = read(key, initial)
    if (snapshot)
      delete snapshot[key]
    return value
  }
  function capture(key: string, getValue: () => unknown) {
    if (retainedFields && !retainedFields.has(key))
      return () => {}
    fields.set(key, getValue)
    return () => {
      if (disposed || fields.get(key) !== getValue)
        return
      const value = cloneTabData(getValue())
      fields.set(key, () => value)
    }
  }
  function isActiveTab() {
    return !context || (context.activeKey() === ownerKey && context.cache.generation === generation)
  }
  function isCurrent() {
    return !disposed && isActiveTab()
  }

  const state = {
    enabled: !!context,
    restored: !!snapshot,
    read,
    take,
    capture,
    isCurrent,
    isActiveTab,
    ref<T>(key: string, initial: T): Ref<T> {
      // Transfer ownership so replacing the ref also releases the restored data.
      const value = ref(take(key, initial)) as Ref<T>
      capture(key, () => value.value)
      return value
    },
    reactive<T extends object>(key: string, initial: T): T {
      const value = reactive(take(key, initial)) as T
      capture(key, () => value)
      return value
    },
    restoreScroll() {
      if (isCurrent())
        context?.restoreScroll()
    },
  }
  provide(homeTabStateKey, state)
  onBeforeUnmount(() => {
    disposed = true
    if (context && context.cache.generation === generation)
      context.cache.save(ownerKey, Object.fromEntries([...fields].map(([key, getValue]) => [key, getValue()])), generation)
    fields.clear()
    snapshot = undefined
  })
  return state
}

export type HomeTabState = ReturnType<typeof useHomeTabState>

/** Grids contribute only measured sizes and data-only interaction state. */
export function useHomeTabViewState() {
  return inject(homeTabStateKey, undefined)
}
